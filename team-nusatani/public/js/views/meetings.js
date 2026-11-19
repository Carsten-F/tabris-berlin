// Meetings: propose times, everybody answers yes / maybe / no, organiser fixes
// the date, adds the Zoom link and sends it. Calendar export (.ics / Google).
import { t } from '../i18n.js';
import {
  h, clear, icon, richText, fmtDateTime, fmtDate, fmtTime, busy, modal, confirmDialog, toast, field, select, emptyState, newBadge,
  avatar, chip, toLocalInput, plainText, teamTimeHint, downloadBlob, relTime,
} from '../util.js';
import { createEditor } from '../editor.js';
import * as S from '../store.js';
import { pageHead, backLink, tabs, commentsSection, attachmentsSection, peoplePicker, infoRow, personLine } from './common.js';
import { openMinuteForm } from './minutes.js';

let filter = 'upcoming';
const ANSWERS = ['yes', 'maybe', 'no'];
const ANSWER_ICON = { yes: '✓', maybe: '?', no: '✕' };

export function render(main, { id }) {
  if (id) return renderDetail(main, id);
  const tabBox = h('div');
  const listEl = h('div.list');
  main.append(
    pageHead(t('nav.meetings'), h('button.btn.btn-primary', { onclick: () => openMeetingForm() }, icon('plus', 18), t('meet.new'))),
    tabBox, listEl);
  function paint() {
    const now = Date.now();
    const polls = S.state.meetings.filter((m) => m.status === 'polling');
    const upcoming = S.state.meetings.filter((m) => m.status === 'scheduled' && new Date(m.starts_at).getTime() + m.duration_minutes * 60000 > now);
    const past = S.state.meetings.filter((m) => !polls.includes(m) && !upcoming.includes(m));
    clear(tabBox).append(tabs([['upcoming', t('meet.tab.upcoming'), upcoming.length], ['polls', t('meet.tab.polls'), polls.length], ['past', t('meet.tab.past')]],
      filter, (k) => { filter = k; paint(); }));
    let rows = filter === 'upcoming' ? upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      : filter === 'polls' ? polls.sort((a, b) => b.created_at.localeCompare(a.created_at))
        : past.sort((a, b) => (b.starts_at || b.created_at).localeCompare(a.starts_at || a.created_at));
    clear(listEl);
    if (!rows.length) listEl.append(emptyState(t('meet.empty.' + filter)));
    for (const m of rows) listEl.append(meetingRow(m));
  }
  paint();
  return { repaint: paint };
}

export function meetingRow(m) {
  const me = S.myId();
  const participant = S.meetingParticipants(m.id).includes(me);
  const isNewForMe = participant && m.created_by !== me && S.isNew('meeting', m.id);
  const needsAnswer = m.status === 'polling' && participant && S.slotsFor(m.id).some((s) => !S.responsesFor(s.id).some((r) => r.user_id === me));
  return h('a.row' + (isNewForMe ? '.is-new' : ''), { href: '#/meetings/' + m.id },
    m.starts_at ? dateBadge(m.starts_at) : h('span.row-icon', icon('calendar', 20)),
    h('div.row-main',
      h('div.row-title', isNewForMe ? newBadge() : null, h('span', m.title)),
      h('div.row-meta',
        chip(t('meet.kind.' + m.kind), m.kind === 'board' ? 'board' : ''),
        m.starts_at ? h('span', fmtDateTime(m.starts_at, { year: undefined })) : h('span.muted', t('meet.optionsCount', { n: S.slotsFor(m.id).length })),
        m.video_link && m.status === 'scheduled' ? h('span.meta-icon', icon('video', 14), 'Zoom') : null)),
    needsAnswer ? chip(t('meet.answerNeeded'), 'action') : chip(t('meet.status.' + m.status), m.status === 'scheduled' ? 'ok' : m.status === 'cancelled' ? 'muted' : 'info'));
}

function dateBadge(iso) {
  const d = new Date(iso);
  return h('span.date-badge', h('span.db-month', d.toLocaleDateString(undefined, { month: 'short' })), h('span.db-day', String(d.getDate())));
}

// ---------------------------------------------------------------------------
function renderDetail(main, id) {
  const m0 = S.byId('meetings', id);
  if (!m0) { main.append(backLink('#/meetings', t('nav.meetings')), emptyState(t('common.notFound'))); return {}; }
  S.markSeen('meeting', id);
  const head = h('div');
  const when = h('div');
  const poll = h('div');
  const info = h('div');
  const attach = attachmentsSection('meeting', id, { category: 'board' });
  const comments = commentsSection('meeting', id);
  main.append(backLink('#/meetings', t('nav.meetings')), head,
    h('div.detail-grid', h('div.detail-main', when, poll, info, attach), h('div.detail-side', comments)));

  function paint() {
    const m = S.byId('meetings', id);
    if (!m) { clear(main).append(backLink('#/meetings', t('nav.meetings')), emptyState(t('common.notFound'))); return; }
    const manage = S.canManageMeeting(m);
    const participants = S.meetingParticipants(id);
    clear(head).append(h('div.detail-head',
      h('div', h('h1', m.title), h('div.row-meta', chip(t('meet.kind.' + m.kind), m.kind === 'board' ? 'board' : ''),
        chip(t('meet.status.' + m.status), m.status === 'scheduled' ? 'ok' : m.status === 'cancelled' ? 'muted' : 'info'))),
      h('div.page-actions',
        manage ? h('button.btn', { onclick: () => openMeetingForm(m) }, icon('edit', 16), t('common.edit')) : null,
        manage && m.status !== 'cancelled' ? moreMenu(m) : null,
        manage && m.status !== 'scheduled' ? h('button.btn.btn-ghost-danger', {
          title: t('common.delete'),
          onclick: async () => {
            if (await confirmDialog(t('meet.deleteConfirm'), { danger: true, ok: t('common.delete') })) {
              await busy(null, () => S.deleteMeeting(id));
              location.hash = '#/meetings';
            }
          },
        }, icon('trash', 16)) : null)));

    // When + link -----------------------------------------------------------
    clear(when);
    if (m.status === 'scheduled' && m.starts_at) {
      const linkInput = h('input', { type: 'url', placeholder: 'https://us02web.zoom.us/j/…', value: m.video_link || '' });
      const sendBtn = h('button.btn.btn-primary', {
        type: 'button',
        onclick: (e) => busy(e.currentTarget, async () => {
          const link = linkInput.value.trim();
          if (!/^https:\/\//i.test(link)) { toast(t('err.https'), { type: 'error' }); return; }
          await S.sendMeetingLink(id, link);
          toast(t('meet.linkSent'), { type: 'ok' });
        }),
      }, icon('mail', 16), m.link_sent_at ? t('meet.resendLink') : t('meet.sendLink'));
      when.append(h('section.panel.when-panel',
        h('div.when-big', dateBadge(m.starts_at),
          h('div', h('div.when-date', fmtDate(m.starts_at, { weekday: 'long', month: 'long' })),
            h('div.when-time', `${fmtTime(m.starts_at)} – ${fmtTime(new Date(new Date(m.starts_at).getTime() + m.duration_minutes * 60000))}`,
              h('span.muted', ` (${relTime(m.starts_at)})`)),
            teamTimeHint(m.starts_at) ? h('div.muted.small', teamTimeHint(m.starts_at)) : null)),
        h('div.when-actions',
          m.video_link ? h('a.btn.btn-primary.btn-join', { href: m.video_link, target: '_blank', rel: 'noopener' }, icon('video', 18), t('meet.join')) : null,
          h('button.btn', { type: 'button', onclick: () => downloadIcs(m) }, icon('calendar', 16), t('meet.addCalendar')),
          h('a.btn', { href: googleCalUrl(m), target: '_blank', rel: 'noopener' }, 'Google Calendar')),
        manage ? h('div.link-box',
          h('label', t('meet.videoLink')),
          h('div.inline-form', linkInput, sendBtn),
          h('small.hint', m.link_sent_at ? t('meet.linkSentAt', { when: fmtDateTime(m.link_sent_at) }) : t('meet.linkHint'))) : null));
    } else if (m.status === 'cancelled') {
      when.append(h('section.panel.result-panel.result-cancelled', h('div.result-head', h('span.result-label', t('meet.status.cancelled')))));
    }

    // Poll grid --------------------------------------------------------------
    clear(poll);
    const slots = S.slotsFor(id);
    if (m.status === 'polling' || (m.status !== 'scheduled' && slots.length)) {
      const me = S.myId();
      const isPart = participants.includes(me);
      const table = h('table.poll-table',
        h('thead', h('tr', h('th', t('meet.proposedTime')), participants.map((uid) => h('th.poll-person', { title: S.personName(uid) }, avatar(S.profile(uid), 26))),
          h('th', t('meet.yesCount')), manage && m.status === 'polling' ? h('th') : null)),
        h('tbody', slots.map((s) => {
          const res = S.responsesFor(s.id);
          const yes = res.filter((r) => r.answer === 'yes').length;
          const maybe = res.filter((r) => r.answer === 'maybe').length;
          const best = yes === participants.length;
          return h('tr' + (best ? '.poll-best' : ''),
            h('td.poll-time', h('strong', fmtDateTime(s.starts_at, { year: undefined })),
              teamTimeHint(s.starts_at) ? h('div.muted.small', teamTimeHint(s.starts_at)) : null,
              (s.created_by === me || manage) && m.status === 'polling' ? h('button.link.small.danger', {
                type: 'button',
                onclick: async () => { if (await confirmDialog(t('meet.removeTime'), { danger: true, ok: t('common.delete') })) busy(null, () => S.deleteSlot(s.id)); },
              }, t('common.delete')) : null),
            participants.map((uid) => {
              const r = res.find((x) => x.user_id === uid);
              if (uid === me && m.status === 'polling') {
                return h('td.poll-cell.mine', h('div.answer-group', ANSWERS.map((a) => h('button.ans.ans-' + a + (r && r.answer === a ? '.on' : ''), {
                  type: 'button', title: t('meet.answer.' + a), 'aria-label': `${fmtDateTime(s.starts_at)}: ${t('meet.answer.' + a)}`,
                  'aria-pressed': String(!!(r && r.answer === a)),
                  onclick: (e) => busy(e.currentTarget, () => S.respondSlot(s.id, a)),
                }, ANSWER_ICON[a]))));
              }
              return h('td.poll-cell', r ? h('span.ans-view.ans-' + r.answer, { title: t('meet.answer.' + r.answer) }, ANSWER_ICON[r.answer]) : h('span.muted', '·'));
            }),
            h('td.poll-count', h('strong', String(yes)), maybe ? h('span.muted', ` +${maybe}?`) : null),
            manage && m.status === 'polling' ? h('td', h('button.btn.btn-small.btn-primary', {
              type: 'button',
              onclick: async (e) => {
                const btn = e.currentTarget;
                if (await confirmDialog(t('meet.fixConfirm', { when: fmtDateTime(s.starts_at) }), { ok: t('meet.fixTime') })) {
                  await busy(btn, () => S.scheduleMeeting(id, s.id));
                  toast(t('meet.fixed'), { type: 'ok' });
                }
              },
            }, t('meet.fixTime'))) : null);
        })));
      const addInput = h('input', { type: 'datetime-local', value: toLocalInput(Date.now() + 2 * 86400000).slice(0, 11) + '10:00' });
      poll.append(h('section.panel',
        h('h2', t('meet.pollTitle')),
        h('p.muted', m.status === 'polling' ? (isPart ? t('meet.pollHint') : t('meet.notParticipant')) : t('meet.pollClosed')),
        h('div.table-scroll', table),
        m.status === 'polling' && (isPart || manage) ? h('div.inline-form.add-slot', h('label', t('meet.proposeAnother')), addInput,
          h('button.btn', {
            type: 'button',
            onclick: (e) => busy(e.currentTarget, async () => {
              if (!addInput.value) return;
              await S.addSlot(id, new Date(addInput.value).toISOString());
              toast(t('meet.timeAdded'), { type: 'ok' });
            }),
          }, icon('plus', 16), t('common.add'))) : null));
    }

    // Info -------------------------------------------------------------------
    const minutesForMeeting = S.state.minutes.filter((x) => x.meeting_id === id);
    clear(info).append(h('section.panel',
      h('div.info-grid',
        infoRow(t('meet.duration'), t('meet.minutes', { n: m.duration_minutes })),
        m.location ? infoRow(t('meet.location'), m.location) : null,
        infoRow(t('meet.participants'), h('div.people-inline', participants.map((p) => personLine(p)))),
        infoRow(t('common.createdBy'), personLine(m.created_by)),
        minutesForMeeting.length ? infoRow(t('nav.minutes'), h('div', minutesForMeeting.map((x) => h('div', h('a', { href: '#/minutes/' + x.id }, x.title))))) : null),
      h('div.panel-head', h('h3.section-title', t('meet.agenda')),
        m.status !== 'cancelled' ? h('button.btn.btn-small', { type: 'button', onclick: () => openMinuteForm(null, { fromMeeting: m }) }, icon('minutes', 16), t('meet.writeMinutes')) : null),
      m.agenda && plainText(m.agenda) ? richText(m.agenda) : h('p.muted', t('meet.noAgenda'))));
    attach.repaint();
  }
  paint();
  return { repaint: paint };
}

function moreMenu(m) {
  const actions = [];
  if (m.status === 'scheduled') {
    actions.push([t('meet.markHeld'), 'held'], [t('meet.reopenPoll'), 'polling']);
  }
  if (m.status === 'held') actions.push([t('meet.reopenPoll'), 'polling']);
  actions.push([t('meet.cancelMeeting'), 'cancelled']);
  return h('button.btn', {
    type: 'button',
    onclick: () => modal(t('meet.actions'), (close) => h('div.menu-list', actions.map(([label, status]) => h('button.menu-item' + (status === 'cancelled' ? '.danger' : ''), {
      type: 'button',
      onclick: async () => {
        close();
        if (status === 'cancelled' && !(await confirmDialog(t('meet.cancelConfirm'), { danger: true, ok: t('meet.cancelMeeting') }))) return;
        busy(null, () => S.setMeetingStatus(m.id, status));
      },
    }, label)))),
  }, t('meet.actions'));
}

// ---------------------------------------------------------------------------
// Calendar export
// ---------------------------------------------------------------------------
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
function fold(line) {
  const out = [];
  let l = line;
  while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); }
  out.push(l);
  return out.join('\r\n');
}
export function downloadIcs(m) {
  const end = new Date(new Date(m.starts_at).getTime() + m.duration_minutes * 60000);
  const desc = [plainText(m.agenda), m.video_link ? `Zoom: ${m.video_link}` : ''].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nusatani//Team Nusatani//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${m.id}@team.nusatani.com`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(m.starts_at)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(m.title)}`, `DESCRIPTION:${icsText(desc)}`, `LOCATION:${icsText(m.video_link || m.location)}`,
    m.video_link ? `URL:${m.video_link}` : null,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(m.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).map(fold);
  downloadBlob(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }), `${m.title.replace(/[^\w-]+/g, '_').slice(0, 60)}.ics`);
}
export function googleCalUrl(m) {
  const end = new Date(new Date(m.starts_at).getTime() + m.duration_minutes * 60000);
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: m.title, dates: `${icsDate(m.starts_at)}/${icsDate(end)}`,
    details: [plainText(m.agenda), m.video_link].filter(Boolean).join('\n\n'), location: m.video_link || m.location || '',
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

// ---------------------------------------------------------------------------
export function openMeetingForm(m = null) {
  const v = m || { title: '', kind: 'board', agenda: '', duration_minutes: 60, location: 'Zoom' };
  const title = h('input', { type: 'text', value: v.title, required: true, maxLength: 300, placeholder: t('meet.titlePlaceholder') });
  const kind = select([['board', t('meet.kind.board')], ['adhoc', t('meet.kind.adhoc')]], v.kind);
  const duration = select([[30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1.5 h'], [120, '2 h'], [180, '3 h']].map(([a, b]) => [String(a), b]), String(v.duration_minutes));
  const placeInput = h('input', { type: 'text', value: v.location, maxLength: 200 });
  const agenda = createEditor({ value: v.agenda, placeholder: t('meet.agendaPlaceholder'), minHeight: '110px' });
  const picker = m ? null : peoplePicker(S.activeProfiles().map((p) => p.id), { lock: [S.myId()] });
  const slotList = h('div.slot-inputs');
  const addSlotInput = (val) => {
    const inp = h('input', { type: 'datetime-local', value: val || '' });
    const row = h('div.slot-row', inp, h('button.icon-btn', { type: 'button', 'aria-label': t('common.delete'), onclick: () => row.remove() }, icon('close', 16)));
    slotList.append(row);
    return inp;
  };
  if (!m) {
    const base = new Date(Date.now() + 3 * 86400000);
    base.setHours(10, 0, 0, 0);
    addSlotInput(toLocalInput(base));
    base.setDate(base.getDate() + 1);
    addSlotInput(toLocalInput(base));
  }

  modal(m ? t('meet.edit') : t('meet.new'), (close) => {
    const save = h('button.btn.btn-primary', { type: 'submit' }, m ? t('common.save') : t('meet.sendRequest'));
    return h('form.form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!title.value.trim()) { title.focus(); return; }
        busy(save, async () => {
          const data = { title: title.value.trim(), kind: kind.value, agenda: agenda.getHTML(), duration_minutes: Number(duration.value), location: placeInput.value.trim() };
          if (m) {
            await S.saveMeeting(m.id, data);
            toast(t('common.saved'), { type: 'ok' });
            close();
            return;
          }
          const slots = [...slotList.querySelectorAll('input')].map((i) => i.value).filter(Boolean).map((x) => new Date(x).toISOString());
          if (!slots.length) { toast(t('err.slots'), { type: 'error' }); return; }
          const newId = await S.createMeeting({ ...data, participants: picker.value(), slots });
          toast(t('meet.requestSent'), { type: 'ok' });
          close();
          location.hash = '#/meetings/' + newId;
        });
      },
    },
    field(t('meet.title'), title),
    h('div.form-row', field(t('meet.kind'), kind), field(t('meet.duration'), duration), field(t('meet.location'), placeInput)),
    !m ? h('div.field', h('label', t('meet.proposeTimes')), slotList,
      h('button.btn.btn-small', { type: 'button', onclick: () => addSlotInput().focus() }, icon('plus', 16), t('meet.addTime')),
      h('small.hint', t('meet.timesHint'))) : null,
    picker ? h('div.field', h('label', t('meet.participants')), picker.el) : null,
    h('div.field', h('label', t('meet.agenda')), agenda.el),
    h('div.form-actions', h('button.btn', { type: 'button', onclick: () => close() }, t('common.cancel')), save));
  }, { wide: true, sticky: true });
}
