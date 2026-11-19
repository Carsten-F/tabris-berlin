// Meeting minutes (board meetings etc.): discussion, resolutions, resulting
// tasks and decisions, attachments, comments, print / PDF
import { t } from '../i18n.js';
import {
  h, clear, icon, richText, fmtDate, fmtDateTime, busy, modal, confirmDialog, toast, field, select, emptyState, newBadge,
  chip, plainText, todayISO, avatar,
} from '../util.js';
import { createEditor } from '../editor.js';
import * as S from '../store.js';
import { pageHead, backLink, tabs, commentsSection, attachmentsSection, peoplePicker, infoRow, personLine } from './common.js';
import { openTaskForm, taskRow, sortTasks } from './tasks.js';
import { openDecisionForm, decisionRow } from './decisions.js';

let filter = 'all';

export function render(main, { id }) {
  if (id) return renderDetail(main, id);
  const tabBox = h('div');
  const listEl = h('div.list');
  main.append(pageHead(t('nav.minutes'), h('button.btn.btn-primary', { onclick: () => openMinuteForm() }, icon('plus', 18), t('min.new'))), tabBox, listEl);
  function paint() {
    const all = [...S.state.minutes].sort((a, b) => b.held_on.localeCompare(a.held_on) || b.created_at.localeCompare(a.created_at));
    clear(tabBox).append(tabs([['all', t('min.tab.all')], ['board', t('min.type.board')], ['draft', t('min.status.draft')]], filter, (k) => { filter = k; paint(); }));
    const rows = all.filter((m) => filter === 'all' || (filter === 'board' ? m.meeting_type === 'board' : m.status === 'draft'));
    clear(listEl);
    if (!rows.length) listEl.append(emptyState(t('min.empty')));
    for (const m of rows) listEl.append(minuteRow(m));
  }
  paint();
  return { repaint: paint };
}

export function minuteRow(m) {
  const isNewForMe = m.created_by !== S.myId() && m.status === 'final' && S.isNew('minute', m.id);
  const nTasks = S.state.tasks.filter((x) => x.minute_id === m.id).length;
  const nDec = S.state.decisions.filter((x) => x.minute_id === m.id).length;
  return h('a.row' + (isNewForMe ? '.is-new' : ''), { href: '#/minutes/' + m.id },
    h('span.row-icon', icon('minutes', 20)),
    h('div.row-main',
      h('div.row-title', isNewForMe ? newBadge() : null, h('span', m.title)),
      h('div.row-meta', h('span', fmtDate(m.held_on)), chip(t('min.type.' + m.meeting_type), m.meeting_type === 'board' ? 'board' : ''),
        nTasks ? h('span.meta-icon', icon('tasks', 14), String(nTasks)) : null,
        nDec ? h('span.meta-icon', icon('ballot', 14), String(nDec)) : null)),
    chip(t('min.status.' + m.status), m.status === 'final' ? 'ok' : 'warn'));
}

function renderDetail(main, id) {
  const m0 = S.byId('minutes', id);
  if (!m0) { main.append(backLink('#/minutes', t('nav.minutes')), emptyState(t('common.notFound'))); return {}; }
  S.markSeen('minute', id);
  const head = h('div');
  const doc = h('div');
  const follow = h('div');
  const attach = attachmentsSection('minute', id, { category: 'board' });
  const comments = commentsSection('minute', id);
  main.append(backLink('#/minutes', t('nav.minutes')), head,
    h('div.detail-grid', h('div.detail-main', doc, follow, attach), h('div.detail-side', comments)));

  function paint() {
    const m = S.byId('minutes', id);
    if (!m) { clear(main).append(backLink('#/minutes', t('nav.minutes')), emptyState(t('common.notFound'))); return; }
    const canEdit = S.canEditMinute(m);
    clear(head).append(h('div.detail-head',
      h('div', h('h1', m.title), h('div.row-meta', chip(t('min.type.' + m.meeting_type), m.meeting_type === 'board' ? 'board' : ''),
        chip(t('min.status.' + m.status), m.status === 'final' ? 'ok' : 'warn'))),
      h('div.page-actions',
        h('button.btn', { onclick: () => window.print() }, icon('print', 16), t('common.print')),
        canEdit ? h('button.btn', { onclick: () => openMinuteForm(m) }, icon('edit', 16), t('common.edit')) : null,
        canEdit && m.status === 'draft' ? h('button.btn.btn-primary', {
          onclick: async (e) => {
            const btn = e.currentTarget;
            if (await confirmDialog(t('min.finalizeConfirm'), { ok: t('min.finalize') })) {
              await busy(btn, () => S.saveMinute(id, { status: 'final' }));
              toast(t('min.finalized'), { type: 'ok' });
            }
          },
        }, icon('check', 16), t('min.finalize')) : null,
        (S.isAdmin() || (m.created_by === S.myId() && m.status === 'draft')) ? h('button.btn.btn-ghost-danger', {
          title: t('common.delete'),
          onclick: async () => {
            if (await confirmDialog(t('min.deleteConfirm'), { danger: true, ok: t('common.delete') })) {
              await busy(null, () => S.deleteMinute(id));
              location.hash = '#/minutes';
            }
          },
        }, icon('trash', 16)) : null)));
    const meeting = m.meeting_id ? S.byId('meetings', m.meeting_id) : null;
    clear(doc).append(h('section.panel.minutes-doc',
      h('div.print-only.print-head', h('img', { src: 'icons/icon-192.png', alt: '', width: 48, height: 48 }), h('div', h('strong', 'Nusatani'), h('div', t('min.printTitle')))),
      h('div.info-grid',
        infoRow(t('min.date'), fmtDate(m.held_on, { weekday: 'long' })),
        m.location ? infoRow(t('min.location'), m.location) : null,
        infoRow(t('min.attendees'), m.attendees.length ? h('div.people-inline', m.attendees.map((p) => personLine(p))) : h('span.muted', '—')),
        m.guests ? infoRow(t('min.guests'), m.guests) : null,
        meeting ? infoRow(t('min.meeting'), h('a', { href: '#/meetings/' + meeting.id }, meeting.title)) : null,
        infoRow(t('min.recordedBy'), h('span', personLine(m.created_by), h('span.muted.small', ' · ' + fmtDateTime(m.updated_at))))),
      h('h2.section-title', t('min.discussion')),
      m.body && plainText(m.body) ? richText(m.body) : h('p.muted', '—'),
      h('h2.section-title', t('min.resolutions')),
      m.resolutions && plainText(m.resolutions) ? richText(m.resolutions, 'resolutions') : h('p.muted', t('min.noResolutions'))));

    const tasks = sortTasks(S.state.tasks.filter((x) => x.minute_id === id));
    const decs = S.state.decisions.filter((x) => x.minute_id === id);
    clear(follow).append(h('section.panel',
      h('div.panel-head', h('h3', icon('tasks', 18), t('min.resultingTasks')),
        h('button.btn.btn-small', { type: 'button', onclick: () => openTaskForm(null, { minute_id: id, assignee_id: '' }) }, icon('plus', 16), t('tasks.new'))),
      tasks.length ? h('div.list.list-compact', tasks.map((x) => taskRow(x))) : h('p.muted.small', t('min.noTasks')),
      h('div.panel-head', h('h3', icon('ballot', 18), t('min.relatedDecisions')),
        h('button.btn.btn-small', { type: 'button', onclick: () => openDecisionForm(null, { minute_id: id }) }, icon('plus', 16), t('dec.new'))),
      decs.length ? h('div.list.list-compact', decs.map((x) => decisionRow(x))) : h('p.muted.small', t('min.noDecisions'))));
    attach.repaint();
    const seen = S.seenBy('minute', id).filter((u) => u !== m.created_by);
    if (m.status === 'final' && seen.length) {
      doc.firstChild.append(h('div.seen-by.no-print', h('span.muted.small', t('upd.seenBy')), seen.map((u) => avatar(S.profile(u), 22))));
    }
  }
  paint();
  return { repaint: paint };
}

export function openMinuteForm(m = null, opts = {}) {
  const from = opts.fromMeeting;
  const v = m || {
    title: from ? from.title : '', meeting_type: from ? (from.kind === 'board' ? 'board' : 'other') : 'board',
    held_on: from && from.starts_at ? from.starts_at.slice(0, 10) : todayISO(), location: from ? from.location : '',
    attendees: from ? S.meetingParticipants(from.id) : S.activeProfiles().map((p) => p.id), guests: '',
    body: from && from.agenda ? `<h3>${t('meet.agenda')}</h3>` + from.agenda : '', resolutions: '', meeting_id: from ? from.id : null,
  };
  const title = h('input', { type: 'text', value: v.title, required: true, maxLength: 300, placeholder: t('min.titlePlaceholder') });
  const type = select(['board', 'management', 'other'].map((x) => [x, t('min.type.' + x)]), v.meeting_type);
  const date = h('input', { type: 'date', value: v.held_on, required: true });
  const placeInput = h('input', { type: 'text', value: v.location, maxLength: 200 });
  const people = peoplePicker(v.attendees);
  const guests = h('input', { type: 'text', value: v.guests, maxLength: 500, placeholder: t('min.guestsPlaceholder') });
  const body = createEditor({ value: v.body, placeholder: t('min.discussionPlaceholder'), minHeight: '200px' });
  const resolutions = createEditor({ value: v.resolutions, placeholder: t('min.resolutionsPlaceholder'), minHeight: '120px' });

  modal(m ? t('min.edit') : t('min.new'), (close) => {
    const save = h('button.btn.btn-primary', { type: 'submit' }, t('common.save'));
    return h('form.form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!title.value.trim()) { title.focus(); return; }
        busy(save, async () => {
          const data = {
            title: title.value.trim(), meeting_type: type.value, held_on: date.value, location: placeInput.value.trim(),
            attendees: people.value(), guests: guests.value.trim(), body: body.getHTML(), resolutions: resolutions.getHTML(),
            meeting_id: v.meeting_id || null,
          };
          if (m) {
            await S.saveMinute(m.id, data);
            toast(t('common.saved'), { type: 'ok' });
            close();
          } else {
            const row = await S.createMinute(data);
            toast(t('min.created'), { type: 'ok' });
            close();
            location.hash = '#/minutes/' + row.id;
          }
        });
      },
    },
    field(t('min.title'), title),
    h('div.form-row', field(t('min.typeLabel'), type), field(t('min.date'), date), field(t('min.location'), placeInput)),
    h('div.field', h('label', t('min.attendees')), people.el),
    field(t('min.guests'), guests),
    h('div.field', h('label', t('min.discussion')), body.el),
    h('div.field', h('label', t('min.resolutions')), resolutions.el, h('small.hint', t('min.resolutionsHint'))),
    h('div.form-actions', h('button.btn', { type: 'button', onclick: () => close() }, t('common.cancel')), save));
  }, { wide: true, sticky: true });
}
