// Start screen: what needs my attention, my tasks, upcoming meetings, news
import { t } from '../i18n.js';
import { h, clear, icon, fmtDateTime, relTime, emptyState, chip } from '../util.js';
import * as S from '../store.js';
import { taskRow, sortTasks, openTaskForm } from './tasks.js';
import { decisionRow, openDecisionForm } from './decisions.js';
import { meetingRow, openMeetingForm } from './meetings.js';
import { updateCard, openUpdateForm } from './updates.js';

export function render(main) {
  const box = h('div.home');
  main.append(box);
  function paint() {
    const me = S.state.me;
    const a = S.attention();
    const hour = new Date().getHours();
    const greet = hour < 12 ? t('home.morning') : hour < 18 ? t('home.afternoon') : t('home.evening');
    const myTasks = sortTasks(S.state.tasks.filter((x) => x.assignee_id === me.id && x.status !== 'done'));
    const actionCount = a.votesNeeded.length + a.pollsNeeded.length + a.tasksOverdue.length + a.tasksToday.length;

    clear(box).append(
      h('div.home-hello',
        h('div', h('h1', `${greet}, ${(me.full_name || '').split(' ')[0] || ''}`),
          h('p.muted', actionCount ? t('home.youHave', { n: actionCount }) : t('home.allClear'))),
        h('div.quick-actions',
          h('button.btn.btn-primary', { onclick: () => openTaskForm() }, icon('plus', 18), t('home.newTask')),
          h('button.btn', { onclick: () => openDecisionForm() }, icon('ballot', 18), t('home.newDecision')),
          h('button.btn', { onclick: () => openMeetingForm() }, icon('calendar', 18), t('home.newMeeting')),
          h('button.btn', { onclick: () => openUpdateForm() }, icon('updates', 18), t('home.newUpdate')))),

      actionCount || a.newTasks.length ? h('section.panel.attention',
        h('h2', icon('alert', 20), t('home.attention')),
        h('div.attention-grid',
          a.votesNeeded.length ? attnCard('ballot', t('home.votes', { n: a.votesNeeded.length }), a.votesNeeded.map((d) => h('a', { href: '#/decisions/' + d.id },
            d.title, h('span.muted.small', ` · ${t('dec.closes')} ${relTime(d.deadline)}`), d.urgency === 'urgent' || d.urgency === 'high' ? chip(t('urg.' + d.urgency), 'urg-' + d.urgency) : null)), 'action') : null,
          a.pollsNeeded.length ? attnCard('calendar', t('home.polls', { n: a.pollsNeeded.length }), a.pollsNeeded.map((m) => h('a', { href: '#/meetings/' + m.id }, m.title)), 'action') : null,
          a.tasksOverdue.length ? attnCard('alert', t('home.overdue', { n: a.tasksOverdue.length }), a.tasksOverdue.map((x) => h('a', { href: '#/tasks/' + x.id }, x.title)), 'bad') : null,
          a.tasksToday.length ? attnCard('clock', t('home.dueToday', { n: a.tasksToday.length }), a.tasksToday.map((x) => h('a', { href: '#/tasks/' + x.id }, x.title)), 'warn') : null,
          a.newTasks.length ? attnCard('tasks', t('home.newTasks', { n: a.newTasks.length }), a.newTasks.map((x) => h('a', { href: '#/tasks/' + x.id }, x.title, h('span.muted.small', ` · ${S.personName(x.created_by)}`))), 'info') : null)) : null,

      a.meetingsSoon.length ? h('section.panel',
        h('div.panel-head', h('h2', icon('calendar', 20), t('home.nextMeetings')), h('a.link', { href: '#/meetings' }, t('common.showAll'))),
        h('div.list.list-compact', a.meetingsSoon.map((m) => {
          const row = meetingRow(m);
          if (m.video_link && new Date(m.starts_at).getTime() - Date.now() < 3600000) {
            row.append(h('a.btn.btn-small.btn-primary', { href: m.video_link, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, icon('video', 16), t('meet.join')));
          }
          return row;
        }))) : null,

      h('div.home-cols',
        h('section.panel',
          h('div.panel-head', h('h2', icon('tasks', 20), t('home.myTasks'), myTasks.length ? h('span.tab-count', String(myTasks.length)) : null), h('a.link', { href: '#/tasks' }, t('common.showAll'))),
          myTasks.length ? h('div.list.list-compact', myTasks.slice(0, 8).map((x) => taskRow(x))) : emptyState(t('tasks.emptyMine'))),
        h('section.panel',
          h('div.panel-head', h('h2', icon('ballot', 20), t('home.openDecisions')), h('a.link', { href: '#/decisions' }, t('common.showAll'))),
          (() => {
            const open = S.state.decisions.filter((d) => d.status === 'open').sort((x, y) => x.deadline.localeCompare(y.deadline));
            const recent = S.state.decisions.filter((d) => d.status !== 'open' && d.decided_at && Date.now() - new Date(d.decided_at).getTime() < 14 * 86400000);
            const rows = [...open, ...recent].slice(0, 5);
            return rows.length ? h('div.list.list-compact', rows.map((d) => decisionRow(d))) : emptyState(t('dec.emptyOpen'));
          })())),

      h('section.panel',
        h('div.panel-head', h('h2', icon('updates', 20), t('home.latestUpdates')), h('a.link', { href: '#/updates' }, t('common.showAll'))),
        (() => {
          const rows = [...S.state.updates].sort((x, y) => (y.pinned - x.pinned) || y.created_at.localeCompare(x.created_at)).slice(0, 3);
          return rows.length ? h('div.feed.feed-compact', rows.map((u) => updateCard(u, true))) : emptyState(t('upd.empty'));
        })()),
      h('p.muted.small.home-foot', t('home.lastSync', { when: fmtDateTime(new Date()) })));
  }
  function attnCard(ic, title, items, kind) {
    return h('div.attn-card.attn-' + kind, h('div.attn-title', icon(ic, 18), h('strong', title)), h('div.attn-items', items.slice(0, 5)));
  }
  paint();
  return { repaint: paint };
}
