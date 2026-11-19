// Decisions: binding votes (yes / no / own wording), secret until closed
import { t } from '../i18n.js';
import {
  h, clear, icon, richText, fmtDateTime, relTime, busy, modal, confirmDialog, toast, field, select, emptyState, newBadge,
  avatar, chip, toLocalInput, plainText, teamTimeHint,
} from '../util.js';
import { createEditor } from '../editor.js';
import * as S from '../store.js';
import { pageHead, backLink, tabs, commentsSection, attachmentsSection, peoplePicker, infoRow, personLine } from './common.js';

let filter = 'open';

export const RESULT_KIND = { approved: 'ok', rejected: 'bad', no_majority: 'warn', expired: 'muted', cancelled: 'muted', open: 'info' };

export function render(main, { id }) {
  if (id) return renderDetail(main, id);
  const tabBox = h('div');
  const listEl = h('div.list');
  main.append(
    pageHead(t('nav.decisions'), h('button.btn.btn-primary', { onclick: () => openDecisionForm() }, icon('plus', 18), t('dec.new'))),
    h('p.page-intro', t('dec.intro')),
    tabBox, listEl);
  function paint() {
    const open = S.state.decisions.filter((d) => d.status === 'open');
    const closed = S.state.decisions.filter((d) => d.status !== 'open');
    clear(tabBox).append(tabs([['open', t('dec.tab.open'), open.length], ['closed', t('dec.tab.closed')]], filter, (k) => { filter = k; paint(); }));
    const rows = (filter === 'open' ? open.sort((a, b) => a.deadline.localeCompare(b.deadline))
      : closed.sort((a, b) => (b.decided_at || b.created_at).localeCompare(a.decided_at || a.created_at)));
    clear(listEl);
    if (!rows.length) listEl.append(emptyState(filter === 'open' ? t('dec.emptyOpen') : t('dec.emptyClosed')));
    for (const d of rows) listEl.append(decisionRow(d));
  }
  paint();
  return { repaint: paint };
}

export function decisionRow(d) {
  const me = S.myId();
  const participant = S.decisionParticipants(d.id).includes(me);
  const voted = S.myVote(d.id);
  const isNewForMe = participant && d.status === 'open' && d.created_by !== me && S.isNew('decision', d.id);
  let stateEl;
  if (d.status !== 'open') stateEl = chip(t('dec.result.' + d.status), RESULT_KIND[d.status]);
  else if (participant && !voted) stateEl = chip(t('dec.yourVoteNeeded'), 'action');
  else if (voted) stateEl = chip(t('dec.youVoted'), 'info');
  else stateEl = chip(t('dec.open'), 'info');
  return h('a.row' + (isNewForMe ? '.is-new' : ''), { href: '#/decisions/' + d.id },
    h('span.row-icon.urg-' + d.urgency, icon('ballot', 20)),
    h('div.row-main',
      h('div.row-title', isNewForMe ? newBadge() : null, h('span', d.title)),
      h('div.row-meta',
        d.urgency !== 'normal' ? chip(t('urg.' + d.urgency), 'urg-' + d.urgency) : null,
        d.status === 'open'
          ? h('span', { title: fmtDateTime(d.deadline) }, icon('clock', 14), ' ', t('dec.closes'), ' ', relTime(d.deadline))
          : h('span.muted', fmtDateTime(d.decided_at || d.deadline)),
        h('span.muted', t('dec.majorityShort', { n: d.required, total: S.decisionParticipants(d.id).length })))),
    stateEl);
}

// ---------------------------------------------------------------------------
function renderDetail(main, id) {
  const d0 = S.byId('decisions', id);
  if (!d0) { main.append(backLink('#/decisions', t('nav.decisions')), emptyState(t('common.notFound'))); return {}; }
  S.markSeen('decision', id);
  const head = h('div');
  const body = h('div');
  const voteBox = h('div');
  const attach = attachmentsSection('decision', id, { category: 'board' });
  const comments = commentsSection('decision', id);
  main.append(backLink('#/decisions', t('nav.decisions')), head,
    h('div.detail-grid', h('div.detail-main', voteBox, body, attach), h('div.detail-side', comments)));

  let tally = null;
  async function loadTally() {
    if (!S.isAdmin()) return;
    const d = S.byId('decisions', id);
    if (!d || d.status !== 'open') { tally = null; return; }
    try { tally = (await S.decisionTally(id))[0] || null; } catch { tally = null; }
    paintVote();
  }

  function paint() {
    const d = S.byId('decisions', id);
    if (!d) return;
    const canManage = S.isAdmin() || d.created_by === S.myId();
    clear(head).append(h('div.detail-head',
      h('div', h('h1', d.title), h('div.row-meta',
        chip(t('dec.result.' + d.status), RESULT_KIND[d.status]),
        d.urgency !== 'normal' ? chip(t('urg.' + d.urgency), 'urg-' + d.urgency) : null)),
      h('div.page-actions',
        h('button.btn', { onclick: () => window.print() }, icon('print', 16), t('common.print')),
        canManage && d.status === 'open' ? h('button.btn', {
          onclick: async (e) => {
            const btn = e.currentTarget;
            const has = await busy(btn, () => S.decisionHasVotes(id));
            if (has) { toast(t('err.lockedAfterVote'), { type: 'error' }); return; }
            openDecisionForm(d);
          },
        }, icon('edit', 16), t('common.edit')) : null,
        canManage && d.status === 'open' ? h('button.btn.btn-ghost-danger', {
          onclick: async () => {
            if (await confirmDialog(t('dec.cancelConfirm'), { danger: true, ok: t('dec.cancelVote') })) busy(null, () => S.cancelDecision(id));
          },
        }, t('dec.cancelVote')) : null)));
    const participants = S.decisionParticipants(id);
    const minute = d.minute_id ? S.byId('minutes', d.minute_id) : null;
    clear(body).append(h('section.panel',
      h('div.info-grid',
        infoRow(t('dec.deadline'), h('span', fmtDateTime(d.deadline), d.status === 'open' ? h('span.muted', ` (${relTime(d.deadline)})`) : null,
          teamTimeHint(d.deadline) ? h('div.muted.small', teamTimeHint(d.deadline)) : null)),
        infoRow(t('dec.majority'), t('dec.majorityText', { n: d.required, total: participants.length })),
        infoRow(t('dec.participants'), h('div.people-inline', participants.map((p) => personLine(p)))),
        infoRow(t('common.createdBy'), h('span', personLine(d.created_by), h('span.muted.small', ' · ' + fmtDateTime(d.created_at)))),
        minute ? infoRow(t('dec.fromMinutes'), h('a', { href: '#/minutes/' + minute.id }, minute.title)) : null),
      h('h3.section-title', t('dec.question')),
      d.description && plainText(d.description) ? richText(d.description) : h('p.muted', '—')));
    paintVote();
    attach.repaint();
  }

  function paintVote() {
    const d = S.byId('decisions', id);
    if (!d) return;
    const me = S.myId();
    const participants = S.decisionParticipants(id);
    const mine = S.myVote(id);
    clear(voteBox);

    if (d.status !== 'open') {
      // binding record: result + all votes
      const votes = S.votesFor(id);
      voteBox.append(h('section.panel.result-panel.result-' + d.status,
        h('div.result-head', h('span.result-label', t('dec.result.' + d.status)),
          h('span.muted', fmtDateTime(d.decided_at))),
        d.status !== 'cancelled' ? h('div.result-counts',
          h('span', `${t('vote.yes')}: ${d.yes_count ?? 0}`), h('span', `${t('vote.no')}: ${d.no_count ?? 0}`),
          h('span', `${t('vote.other')}: ${d.other_count ?? 0}`), h('span.muted', t('dec.majorityShort', { n: d.required, total: participants.length }))) : null,
        h('p.small', t('dec.bindingNote')),
        h('table.vote-table', h('thead', h('tr', h('th', t('dec.voter')), h('th', t('dec.vote')), h('th', t('dec.votedAt')))),
          h('tbody', participants.map((uid) => {
            const v = votes.find((x) => x.user_id === uid);
            return h('tr', h('td', personLine(uid)),
              h('td', v ? h('span', h('strong.vote-' + v.choice, t('vote.' + v.choice)), v.statement ? h('div.vote-statement', `“${v.statement}”`) : null) : h('span.muted', t('dec.noVote'))),
              h('td.muted', v ? fmtDateTime(v.created_at) : '—'));
          })))));
      return;
    }

    const participant = participants.includes(me);
    const panel = h('section.panel.vote-panel');
    if (participant && !mine) {
      panel.append(h('h2', t('dec.castVote')), h('p.muted', t('dec.castHint')));
      const other = h('textarea', { rows: 3, maxLength: 5000, placeholder: t('dec.otherPlaceholder') });
      const otherBox = h('div.other-box', { hidden: true }, other,
        h('button.btn.btn-primary', { type: 'button', onclick: (e) => submit('other', other.value, e.currentTarget) }, t('dec.submitOther')));
      panel.append(h('div.vote-buttons',
        h('button.vote-btn.vote-yes', { type: 'button', onclick: (e) => submit('yes', '', e.currentTarget) }, icon('check', 26), h('span', t('vote.yes'))),
        h('button.vote-btn.vote-no', { type: 'button', onclick: (e) => submit('no', '', e.currentTarget) }, icon('close', 26), h('span', t('vote.no'))),
        h('button.vote-btn.vote-other', { type: 'button', onclick: () => { otherBox.hidden = false; other.focus(); } }, icon('edit', 26), h('span', t('vote.otherLong')))),
      otherBox);
    } else if (participant && mine) {
      panel.append(h('div.voted-box', icon('check', 22),
        h('div', h('strong', t('dec.youVotedWith', { choice: t('vote.' + mine.choice) })),
          mine.statement ? h('div.vote-statement', `“${mine.statement}”`) : null,
          h('div.muted.small', fmtDateTime(mine.created_at) + ' · ' + t('dec.secretUntilClosed')))));
    } else {
      panel.append(h('p.muted', t('dec.notParticipant')));
    }
    if (S.isAdmin()) {
      const votes = S.votesFor(id);
      panel.append(h('div.admin-tally',
        h('h3', icon('eye', 16), t('dec.adminTally')),
        tally ? h('p', t('dec.tallyLine', { voted: tally.voted, total: tally.participants, yes: tally.yes, no: tally.no, other: tally.other })) : null,
        h('ul.tally-list', participants.map((uid) => {
          const v = votes.find((x) => x.user_id === uid);
          return h('li', avatar(S.profile(uid), 22), h('span', S.personName(uid)),
            v ? h('strong.vote-' + v.choice, t('vote.' + v.choice) + (v.statement ? `: “${v.statement}”` : '')) : h('span.muted', t('dec.notYet')));
        })),
        h('p.muted.small', t('dec.adminOnly'))));
    }
    voteBox.append(panel);
  }

  async function submit(choice, statement, btn) {
    if (choice === 'other' && !statement.trim()) { toast(t('dec.otherRequired'), { type: 'error' }); return; }
    const label = choice === 'other' ? `“${statement.trim()}”` : t('vote.' + choice);
    const ok = await confirmDialog(t('dec.confirmVote', { choice: label }), { title: t('dec.castVote'), detail: t('dec.confirmDetail'), ok: t('dec.confirmOk') });
    if (!ok) return;
    const result = await busy(btn, () => S.castVote(id, choice, statement));
    if (result) {
      toast(result === 'open' ? t('dec.voteSaved') : t('dec.voteSavedClosed', { result: t('dec.result.' + result) }), { type: 'ok' });
      loadTally();
    }
  }

  paint();
  loadTally();
  return { repaint: () => { paint(); loadTally(); } };
}

// ---------------------------------------------------------------------------
export function openDecisionForm(d = null, defaults = {}) {
  const v = d || { title: defaults.title || '', description: defaults.description || '', urgency: 'normal', deadline: new Date(Date.now() + 3 * 86400000).toISOString(), minute_id: defaults.minute_id || null };
  const title = h('input', { type: 'text', value: v.title, required: true, maxLength: 300, placeholder: t('dec.titlePlaceholder') });
  const editor = createEditor({ value: v.description, placeholder: t('dec.descriptionPlaceholder'), minHeight: '120px' });
  const urgency = select(['low', 'normal', 'high', 'urgent'].map((u) => [u, t('urg.' + u)]), v.urgency);
  const deadline = h('input', { type: 'datetime-local', value: toLocalInput(v.deadline), required: true });
  const quick = h('div.quick-dates', [[t('dec.in24h'), 1], [t('dec.in3days'), 3], [t('dec.in7days'), 7]].map(([l, n]) =>
    h('button.btn.btn-small', { type: 'button', onclick: () => { deadline.value = toLocalInput(Date.now() + n * 86400000); } }, l)));
  urgency.addEventListener('change', () => {
    if (!d && urgency.value === 'urgent') deadline.value = toLocalInput(Date.now() + 86400000);
  });
  const picker = d ? null : peoplePicker(S.activeProfiles().map((p) => p.id));
  const fileInput = d ? null : h('input', { type: 'file', multiple: true });

  modal(d ? t('dec.edit') : t('dec.new'), (close) => {
    const save = h('button.btn.btn-primary', { type: 'submit' }, d ? t('common.save') : t('dec.start'));
    return h('form.form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!title.value.trim()) { title.focus(); return; }
        const dl = new Date(deadline.value);
        if (!(dl > new Date())) { toast(t('err.deadlineFuture'), { type: 'error' }); return; }
        busy(save, async () => {
          if (d) {
            await S.saveDecision(d.id, { title: title.value.trim(), description: editor.getHTML(), urgency: urgency.value, deadline: dl.toISOString() });
            toast(t('common.saved'), { type: 'ok' });
            close();
          } else {
            const participants = picker.value();
            if (!participants.length) { toast(t('err.participants'), { type: 'error' }); return; }
            const newId = await S.createDecision({
              title: title.value.trim(), description: editor.getHTML(), urgency: urgency.value, deadline: dl.toISOString(),
              participants, minute_id: v.minute_id,
            });
            if (fileInput && fileInput.files.length) await S.uploadFiles([...fileInput.files], { category: 'board', linkTo: { type: 'decision', id: newId } });
            toast(t('dec.started'), { type: 'ok' });
            close();
            location.hash = '#/decisions/' + newId;
          }
        });
      },
    },
    field(t('dec.title'), title),
    h('div.field', h('label', t('dec.question')), editor.el),
    h('div.form-row', field(t('dec.urgency'), urgency), h('div.field', h('label', t('dec.deadline')), deadline, quick)),
    picker ? h('div.field', h('label', t('dec.participants')), picker.el, h('small.hint', t('dec.participantsHint'))) : null,
    fileInput ? field(t('docs.attachFiles'), fileInput) : null,
    !d ? h('p.notice', icon('alert', 16), t('dec.formNotice')) : null,
    h('div.form-actions', h('button.btn', { type: 'button', onclick: () => close() }, t('common.cancel')), save));
  }, { wide: true, sticky: true });
}
