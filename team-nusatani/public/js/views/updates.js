// Updates: documented information for everybody, with "seen by" and comments
import { t } from '../i18n.js';
import {
  h, clear, icon, richText, fmtDateTime, relTime, busy, modal, confirmDialog, toast, field, emptyState, newBadge, avatar, plainText,
} from '../util.js';
import { createEditor } from '../editor.js';
import * as S from '../store.js';
import { pageHead, backLink, commentsSection, attachmentsSection, personLine } from './common.js';

let counts = new Map();

export function render(main, { id }) {
  if (id) return renderDetail(main, id);
  const listEl = h('div.feed');
  main.append(pageHead(t('nav.updates'), h('button.btn.btn-primary', { onclick: () => openUpdateForm() }, icon('plus', 18), t('upd.new'))),
    h('p.page-intro', t('upd.intro')), listEl);
  function paint() {
    const rows = [...S.state.updates].sort((a, b) => (b.pinned - a.pinned) || b.created_at.localeCompare(a.created_at));
    clear(listEl);
    if (!rows.length) listEl.append(emptyState(t('upd.empty')));
    for (const u of rows) listEl.append(updateCard(u));
  }
  paint();
  S.commentCounts('update').then((m) => { counts = m; paint(); }).catch(() => {});
  return { repaint: paint };
}

export function updateCard(u, compact = false) {
  const isNewForMe = u.created_by !== S.myId() && S.isNew('update', u.id);
  const text = plainText(u.body);
  const docs = S.docsFor('update', u.id).length;
  const n = counts.get(u.id) || 0;
  return h('a.card.update-card' + (isNewForMe ? '.is-new' : '') + (u.pinned ? '.is-pinned' : ''), { href: '#/updates/' + u.id },
    h('div.update-head', avatar(S.profile(u.created_by), 34),
      h('div', h('div.row-title', isNewForMe ? newBadge() : null, u.pinned ? h('span.pin', icon('pin', 14)) : null, h('span', u.title)),
        h('div.muted.small', `${S.personName(u.created_by)} · ${relTime(u.created_at)}`))),
    h('p.update-excerpt', text.length > (compact ? 140 : 320) ? text.slice(0, compact ? 140 : 320) + '…' : text),
    compact ? null : h('div.row-meta',
      docs ? h('span.meta-icon', icon('clip', 14), String(docs)) : null,
      n ? h('span.meta-icon', icon('comment', 14), String(n)) : null));
}

function renderDetail(main, id) {
  if (!S.byId('updates', id)) { main.append(backLink('#/updates', t('nav.updates')), emptyState(t('common.notFound'))); return {}; }
  S.markSeen('update', id);
  const head = h('div');
  const body = h('div');
  const attach = attachmentsSection('update', id);
  const comments = commentsSection('update', id);
  main.append(backLink('#/updates', t('nav.updates')), head, h('div.detail-grid', h('div.detail-main', body, attach), h('div.detail-side', comments)));
  function paint() {
    const u = S.byId('updates', id);
    if (!u) { clear(main).append(backLink('#/updates', t('nav.updates')), emptyState(t('common.notFound'))); return; }
    const mine = u.created_by === S.myId() || S.isAdmin();
    clear(head).append(h('div.detail-head', h('h1', u.title),
      h('div.page-actions',
        h('button.btn', { onclick: () => window.print() }, icon('print', 16), t('common.print')),
        mine ? h('button.btn', { onclick: () => openUpdateForm(u) }, icon('edit', 16), t('common.edit')) : null,
        mine ? h('button.btn.btn-ghost-danger', {
          title: t('common.delete'),
          onclick: async () => {
            if (await confirmDialog(t('upd.deleteConfirm'), { danger: true, ok: t('common.delete') })) {
              await busy(null, () => S.deleteUpdate(id));
              location.hash = '#/updates';
            }
          },
        }, icon('trash', 16)) : null)));
    const seen = S.seenBy('update', id).filter((x) => x !== u.created_by);
    const others = S.activeProfiles().filter((p) => p.id !== u.created_by);
    clear(body).append(h('section.panel',
      h('div.update-head', personLine(u.created_by), h('span.muted.small', fmtDateTime(u.created_at)), u.pinned ? h('span.chip', t('upd.pinned')) : null),
      richText(u.body),
      h('div.seen-by', h('span.muted.small', t('upd.seenBy')),
        others.map((p) => h('span.seen' + (seen.includes(p.id) ? '.yes' : ''), { title: `${p.full_name}: ${seen.includes(p.id) ? t('upd.hasSeen') : t('upd.notSeen')}` },
          avatar(p, 24), seen.includes(p.id) ? icon('check', 12) : null)))));
    attach.repaint();
  }
  paint();
  return { repaint: paint };
}

export function openUpdateForm(u = null) {
  const title = h('input', { type: 'text', value: u ? u.title : '', required: true, maxLength: 300, placeholder: t('upd.titlePlaceholder') });
  const editor = createEditor({ value: u ? u.body : '', placeholder: t('upd.bodyPlaceholder'), minHeight: '180px' });
  const pinned = h('input', { type: 'checkbox', checked: u ? u.pinned : false });
  const fileInput = u ? null : h('input', { type: 'file', multiple: true });
  modal(u ? t('upd.edit') : t('upd.new'), (close) => {
    const save = h('button.btn.btn-primary', { type: 'submit' }, u ? t('common.save') : t('upd.publish'));
    return h('form.form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!title.value.trim()) { title.focus(); return; }
        if (editor.isEmpty()) { editor.focus(); toast(t('upd.bodyRequired'), { type: 'error' }); return; }
        busy(save, async () => {
          const data = { title: title.value.trim(), body: editor.getHTML(), pinned: pinned.checked };
          if (u) await S.saveUpdate(u.id, data);
          else {
            const row = await S.createUpdate(data);
            if (fileInput.files.length) await S.uploadFiles([...fileInput.files], { linkTo: { type: 'update', id: row.id } });
          }
          toast(u ? t('common.saved') : t('upd.published'), { type: 'ok' });
          close();
        });
      },
    },
    field(t('upd.title'), title),
    h('div.field', h('label', t('upd.body')), editor.el),
    h('label.check-line', pinned, t('upd.pin')),
    fileInput ? field(t('docs.attachFiles'), fileInput) : null,
    h('div.form-actions', h('button.btn', { type: 'button', onclick: () => close() }, t('common.cancel')), save));
  }, { wide: true, sticky: true });
}
