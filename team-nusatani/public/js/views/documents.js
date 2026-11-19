// Shared document store: upload (drag & drop), view in app, download,
// delete own files, see where a file is linked
import { t } from '../i18n.js';
import { h, clear, append, icon, fmtDate, fmtSize, busy, modal, confirmDialog, toast, field, select, emptyState } from '../util.js';
import * as S from '../store.js';
import { pageHead, fileIcon, openDocument } from './common.js';

export const CATEGORIES = ['general', 'board', 'finance', 'legal', 'contracts', 'operations', 'other'];
let cat = 'all';
let searchText = '';

export function render(main) {
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => askUpload([...e.target.files]) });
  const listEl = h('div.doc-list');
  const chips = h('div.chips');
  const searchInput = h('input.filter-input', {
    type: 'search', placeholder: t('docs.searchPlaceholder'), value: searchText,
    oninput: (e) => { searchText = e.target.value; paint(); },
  });
  const drop = h('div.dropzone', { tabindex: '0', role: 'button', onclick: () => fileInput.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); } },
    icon('upload', 28), h('strong', t('docs.dropTitle')), h('span.muted', t('docs.dropHint')));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) askUpload([...e.dataTransfer.files]); });

  main.append(pageHead(t('nav.documents'), h('button.btn.btn-primary', { onclick: () => fileInput.click() }, icon('upload', 18), t('docs.upload')), fileInput),
    drop, chips, searchInput, listEl);

  function askUpload(files) {
    if (!files.length) return;
    const catSel = select(CATEGORIES.map((c) => [c, t('docs.cat.' + c)]), cat === 'all' ? 'general' : cat);
    const desc = h('input', { type: 'text', maxLength: 500, placeholder: t('docs.descriptionPlaceholder') });
    modal(t('docs.upload'), (close) => {
      const go = h('button.btn.btn-primary', { type: 'submit' }, t('docs.uploadN', { n: files.length }));
      return h('form.form', {
        onsubmit: (e) => {
          e.preventDefault();
          busy(go, async () => {
            await S.uploadFiles(files, { category: catSel.value, description: desc.value.trim() });
            toast(t('docs.uploaded'), { type: 'ok' });
            close();
          });
        },
      }, h('ul.file-preview', files.map((f) => h('li', h('span', f.name), h('span.muted', fmtSize(f.size))))),
      field(t('docs.category'), catSel), field(t('docs.description'), desc),
      h('div.form-actions', h('button.btn', { type: 'button', onclick: () => close() }, t('common.cancel')), go));
    });
    fileInput.value = '';
  }

  function paint() {
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c, S.state.documents.filter((d) => d.category === c).length]));
    append(clear(chips), [
      h('button.chip-btn' + (cat === 'all' ? '.on' : ''), { type: 'button', onclick: () => { cat = 'all'; paint(); } }, t('docs.all'), h('span.tab-count', String(S.state.documents.length))),
      CATEGORIES.filter((c) => counts[c]).map((c) => h('button.chip-btn' + (cat === c ? '.on' : ''), { type: 'button', onclick: () => { cat = c; paint(); } },
        t('docs.cat.' + c), h('span.tab-count', String(counts[c]))))]);
    const q = searchText.trim().toLowerCase();
    const rows = S.state.documents.filter((d) => (cat === 'all' || d.category === cat)
      && (!q || (d.name + ' ' + d.description + ' ' + S.personName(d.created_by)).toLowerCase().includes(q)));
    clear(listEl);
    if (!rows.length) listEl.append(emptyState(t('docs.none')));
    for (const d of rows) listEl.append(docRow(d));
  }
  paint();
  return { repaint: paint };
}

function docRow(d) {
  const mine = d.created_by === S.myId() || S.isAdmin();
  const links = S.linksForDoc(d.id).map((l) => {
    const key = { task: 'tasks', update: 'updates', minute: 'minutes', decision: 'decisions', meeting: 'meetings' }[l.entity_type];
    const item = S.byId(key, l.entity_id);
    return item ? h('a.link-chip', { href: `#/${key}/${item.id}` }, icon(l.entity_type === 'task' ? 'tasks' : l.entity_type === 'decision' ? 'ballot' : l.entity_type === 'meeting' ? 'calendar' : l.entity_type === 'minute' ? 'minutes' : 'updates', 12), item.title) : null;
  });
  return h('div.doc-row',
    h('button.doc-open', { type: 'button', onclick: () => openDocument(d) }, fileIcon(d),
      h('div.row-main', h('div.row-title', h('span', d.name)),
        h('div.row-meta', h('span', t('docs.cat.' + d.category)), h('span', fmtSize(d.size_bytes)), h('span', S.personName(d.created_by)), h('span', fmtDate(d.created_at))),
        d.description ? h('div.muted.small', d.description) : null)),
    links.filter(Boolean).length ? h('div.doc-links', links) : null,
    h('div.doc-actions',
      h('button.icon-btn', { type: 'button', title: t('docs.view'), 'aria-label': t('docs.view'), onclick: () => openDocument(d) }, icon('eye', 18)),
      h('button.icon-btn', {
        type: 'button', title: t('docs.download'), 'aria-label': t('docs.download'),
        onclick: (e) => busy(e.currentTarget, async () => { location.href = await S.signedUrl(d, true); }),
      }, icon('download', 18)),
      mine ? h('button.icon-btn', { type: 'button', title: t('common.edit'), 'aria-label': t('common.edit'), onclick: () => editDoc(d) }, icon('edit', 18)) : null,
      mine ? h('button.icon-btn.danger', {
        type: 'button', title: t('common.delete'), 'aria-label': t('common.delete'),
        onclick: async () => {
          if (await confirmDialog(t('docs.deleteConfirm', { name: d.name }), { danger: true, ok: t('common.delete'), detail: S.linksForDoc(d.id).length ? t('docs.deleteLinked') : null })) {
            await busy(null, () => S.deleteDocument(d));
            toast(t('docs.deleted'), { type: 'ok' });
          }
        },
      }, icon('trash', 18)) : null));
}

function editDoc(d) {
  const name = h('input', { type: 'text', value: d.name, maxLength: 255, required: true });
  const catSel = select(CATEGORIES.map((c) => [c, t('docs.cat.' + c)]), d.category);
  const desc = h('input', { type: 'text', value: d.description, maxLength: 500 });
  modal(t('docs.edit'), (close) => {
    const save = h('button.btn.btn-primary', { type: 'submit' }, t('common.save'));
    return h('form.form', {
      onsubmit: (e) => {
        e.preventDefault();
        busy(save, async () => { await S.updateDocument(d.id, { name: name.value.trim() || d.name, category: catSel.value, description: desc.value.trim() }); close(); });
      },
    }, field(t('docs.name'), name), field(t('docs.category'), catSel), field(t('docs.description'), desc),
    h('div.form-actions', h('button.btn', { type: 'button', onclick: () => close() }, t('common.cancel')), save));
  });
}
