// Building blocks shared by several views: page header, comments thread,
// attachments, person pickers, document viewer.
import { t } from '../i18n.js';
import {
  h, clear, icon, avatar, richText, relTime, fmtDateTime, busy, modal, confirmDialog, toast, fmtSize, field, select, chip,
} from '../util.js';
import { createEditor } from '../editor.js';
import * as S from '../store.js';

export function pageHead(title, ...actions) {
  return h('div.page-head', h('h1', title), h('div.page-actions', actions));
}

export function backLink(href, label) {
  return h('a.back', { href }, icon('back', 18), h('span', label));
}

export function personLine(id, extra) {
  const p = S.profile(id);
  return h('span.person', avatar(p, 24), h('span', S.personName(id)), extra ? h('span.muted', extra) : null);
}

export function tabs(items, active, onSelect) {
  return h('div.tabs', { role: 'tablist' }, items.map(([key, label, count]) => h('button.tab-btn' + (key === active ? '.on' : ''), {
    role: 'tab', 'aria-selected': String(key === active), type: 'button', onclick: () => onSelect(key),
  }, label, count ? h('span.tab-count', String(count)) : null)));
}

export function priorityChip(p) {
  if (!p || p === 'normal') return null;
  return chip(t('prio.' + p), 'prio-' + p);
}

// ---------------------------------------------------------------------------
// Comments thread
// ---------------------------------------------------------------------------
export function commentsSection(type, id) {
  const list = h('div.comments-list', h('div.muted', t('common.loading')));
  const editor = createEditor({ placeholder: t('comments.placeholder'), compact: true, minHeight: '70px', onSubmit: () => send() });
  const sendBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => send() }, t('comments.send'));

  async function load() {
    try {
      const rows = await S.listComments(type, id);
      clear(list);
      if (!rows.length) list.append(h('p.muted.small', t('comments.none')));
      for (const c of rows) list.append(commentItem(c));
    } catch (e) {
      clear(list).append(h('p.error', e.message));
    }
  }
  function commentItem(c) {
    const mine = c.created_by === S.myId();
    const body = h('div.comment-body', richText(c.body));
    const actions = h('div.comment-actions',
      mine ? h('button.link.small', { type: 'button', onclick: () => edit() }, t('common.edit')) : null,
      mine || S.isAdmin() ? h('button.link.small.danger', {
        type: 'button',
        onclick: async () => {
          if (await confirmDialog(t('comments.deleteConfirm'), { danger: true, ok: t('common.delete') })) {
            await busy(null, () => S.deleteComment(c.id));
            load();
          }
        },
      }, t('common.delete')) : null);
    const el = h('div.comment', avatar(S.profile(c.created_by), 32),
      h('div.comment-main',
        h('div.comment-meta', h('strong', S.personName(c.created_by)), h('span.muted', { title: fmtDateTime(c.created_at) }, relTime(c.created_at)),
          c.edited_at ? h('span.muted', '· ' + t('comments.edited')) : null),
        body, actions));
    function edit() {
      const ed = createEditor({ value: c.body, compact: true });
      clear(body).append(ed.el, h('div.form-actions',
        h('button.btn.btn-small', { type: 'button', onclick: () => load() }, t('common.cancel')),
        h('button.btn.btn-small.btn-primary', {
          type: 'button',
          onclick: (e) => busy(e.currentTarget, async () => { if (!ed.isEmpty()) { await S.editComment(c.id, ed.getHTML()); load(); } }),
        }, t('common.save'))));
      ed.focus();
    }
    return el;
  }
  async function send() {
    if (editor.isEmpty()) return;
    await busy(sendBtn, async () => {
      await S.addComment(type, id, editor.getHTML());
      editor.setHTML('');
      await load();
    });
  }
  load();
  return h('section.panel.comments',
    h('h3', icon('comment', 18), t('comments.title')),
    list,
    h('div.comment-compose', editor.el, h('div.form-actions', h('small.muted', t('comments.hint')), sendBtn)));
}

// ---------------------------------------------------------------------------
// Attachments (documents linked to an item)
// ---------------------------------------------------------------------------
export function attachmentsSection(type, id, opts = {}) {
  const box = h('div.attach-list');
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => upload(e.target.files) });
  const uploadBtn = h('button.btn.btn-small', { type: 'button', onclick: () => fileInput.click() }, icon('upload', 16), t('docs.upload'));
  const linkBtn = h('button.btn.btn-small', { type: 'button', onclick: () => pickExisting() }, icon('link', 16), t('docs.linkExisting'));

  function paint() {
    clear(box);
    const docs = S.docsFor(type, id);
    if (!docs.length) box.append(h('p.muted.small', t('docs.noAttachments')));
    for (const d of docs) {
      const link = S.state.links.find((l) => l.entity_type === type && l.entity_id === id && l.document_id === d.id);
      box.append(h('div.attach',
        h('button.attach-open', { type: 'button', onclick: () => openDocument(d) }, fileIcon(d), h('span.attach-name', d.name), h('span.muted.small', fmtSize(d.size_bytes))),
        (link && (link.added_by === S.myId() || S.isAdmin())) ? h('button.icon-btn.small', {
          type: 'button', 'aria-label': t('docs.unlink'), title: t('docs.unlink'),
          onclick: async () => { if (await confirmDialog(t('docs.unlinkConfirm'), { ok: t('docs.unlink') })) busy(null, () => S.unlinkDocument(type, id, d.id)); },
        }, icon('close', 16)) : null));
    }
  }
  async function upload(files) {
    if (!files || !files.length) return;
    await busy(uploadBtn, async () => {
      await S.uploadFiles([...files], { category: opts.category || 'general', linkTo: { type, id } });
      toast(t('docs.uploaded'), { type: 'ok' });
    });
    fileInput.value = '';
  }
  function pickExisting() {
    const linked = new Set(S.docsFor(type, id).map((d) => d.id));
    const options = S.state.documents.filter((d) => !linked.has(d.id));
    modal(t('docs.linkExisting'), (close) => {
      const filter = h('input', { type: 'search', placeholder: t('search.placeholder') });
      const list = h('div.pick-list');
      const paintList = () => {
        clear(list);
        const q = filter.value.toLowerCase();
        const rows = options.filter((d) => d.name.toLowerCase().includes(q));
        if (!rows.length) list.append(h('p.muted', t('docs.none')));
        for (const d of rows) {
          list.append(h('button.pick', {
            type: 'button',
            onclick: async () => { await busy(null, () => S.linkDocument(type, id, d.id)); close(); },
          }, fileIcon(d), h('span', d.name), h('span.muted.small', t('docs.cat.' + d.category))));
        }
      };
      filter.addEventListener('input', paintList);
      paintList();
      return h('div', filter, list);
    });
  }
  paint();
  const section = h('section.panel.attachments',
    h('div.panel-head', h('h3', icon('clip', 18), t('docs.attachments')),
      opts.readOnly ? null : h('div.panel-actions', uploadBtn, linkBtn, fileInput)),
    box);
  section.repaint = paint;
  return section;
}

export function fileIcon(d) {
  const ext = (d.name.split('.').pop() || '').toLowerCase().slice(0, 4);
  const kind = /pdf/.test(ext) ? 'pdf' : /^(doc|docx|odt|rtf|txt|pages)$/.test(ext) ? 'doc'
    : /^(xls|xlsx|csv|ods|numb)$/.test(ext) ? 'xls' : /^(ppt|pptx|key|odp)$/.test(ext) ? 'ppt'
      : /^(png|jpg|jpeg|gif|webp|heic|svg)$/.test(ext) ? 'img' : 'file';
  return h('span.file-icon.file-' + kind, ext.toUpperCase() || 'FILE');
}

/** Show a document inside the app (PDF, images, text) or offer the download. */
export async function openDocument(d) {
  const canPreview = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i.test(d.mime_type)
    || /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(d.name);
  const body = h('div.viewer', h('div.spinner'));
  const dl = h('button.btn', { type: 'button', onclick: async () => { const u = await S.signedUrl(d, true); location.href = u; } }, icon('download', 16), t('docs.download'));
  const newTab = h('a.btn', { target: '_blank', rel: 'noopener', href: '#' }, icon('eye', 16), t('docs.openNewTab'));
  modal(d.name, h('div', body, h('div.form-actions.viewer-actions',
    h('span.muted.small', `${fmtSize(d.size_bytes)} · ${S.personName(d.created_by)} · ${fmtDateTime(d.created_at)}`), newTab, dl)), { wide: true });
  try {
    const url = await S.signedUrl(d);
    newTab.href = url;
    clear(body);
    if (!canPreview) {
      body.append(h('div.viewer-none', fileIcon(d), h('p', t('docs.noPreview'))));
    } else if (/image/i.test(d.mime_type) || /\.(png|jpe?g|gif|webp)$/i.test(d.name)) {
      body.append(h('img.viewer-img', { src: url, alt: d.name }));
    } else {
      body.append(h('iframe.viewer-frame', { src: url, title: d.name }));
    }
  } catch (e) {
    clear(body).append(h('p.error', e.message));
  }
}

// ---------------------------------------------------------------------------
// People picker (checkbox list)
// ---------------------------------------------------------------------------
export function peoplePicker(selected = [], opts = {}) {
  const set = new Set(selected);
  const wrap = h('div.people-pick');
  for (const p of S.activeProfiles()) {
    const cb = h('input', { type: 'checkbox', checked: set.has(p.id), disabled: opts.lock && opts.lock.includes(p.id),
      onchange: (e) => { if (e.target.checked) set.add(p.id); else set.delete(p.id); } });
    wrap.append(h('label.person-check', cb, avatar(p, 26), h('span', p.full_name || p.email), p.id === S.myId() ? h('span.muted.small', `(${t('common.you')})`) : null));
  }
  return { el: wrap, value: () => [...set] };
}

export function assigneeSelect(value) {
  return select([['', t('tasks.unassigned')], ...S.activeProfiles().map((p) => [p.id, (p.full_name || p.email) + (p.id === S.myId() ? ` (${t('common.you')})` : '')])], value || '');
}

export function infoRow(label, value) {
  return h('div.info-row', h('span.info-label', label), h('span.info-value', value));
}

export { field, select };
