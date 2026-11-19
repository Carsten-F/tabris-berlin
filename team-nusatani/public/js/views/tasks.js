// To-dos: list, detail with thread and attachments, create / edit dialog
import { t } from '../i18n.js';
import {
  h, clear, icon, richText, fmtDate, fmtDateTime, dueState, busy, modal, confirmDialog, toast, field, select, emptyState,
  newBadge, avatar, plainText, todayISO, addDaysISO,
} from '../util.js';
import { createEditor } from '../editor.js';
import * as S from '../store.js';
import { pageHead, backLink, tabs, priorityChip, commentsSection, attachmentsSection, assigneeSelect, infoRow, personLine } from './common.js';

let filter = 'mine';
let searchText = '';
let counts = new Map();

export function render(main, { id }) {
  if (id) return renderDetail(main, id);
  const listEl = h('div.list');
  const searchInput = h('input.filter-input', {
    type: 'search', placeholder: t('tasks.searchPlaceholder'), value: searchText,
    oninput: (e) => { searchText = e.target.value; paint(); },
  });
  const tabBox = h('div');
  main.append(
    pageHead(t('nav.tasks'), h('button.btn.btn-primary', { onclick: () => openTaskForm() }, icon('plus', 18), t('tasks.new'))),
    tabBox, searchInput, listEl);

  function paint() {
    const me = S.myId();
    const all = S.state.tasks;
    const groups = {
      mine: all.filter((x) => x.assignee_id === me && x.status !== 'done'),
      created: all.filter((x) => x.created_by === me && x.status !== 'done'),
      open: all.filter((x) => x.status !== 'done'),
      done: all.filter((x) => x.status === 'done'),
    };
    clear(tabBox).append(tabs([
      ['mine', t('tasks.tab.mine'), groups.mine.length],
      ['created', t('tasks.tab.created'), groups.created.length],
      ['open', t('tasks.tab.all'), groups.open.length],
      ['done', t('tasks.tab.done')],
    ], filter, (k) => { filter = k; paint(); }));
    let rows = groups[filter] || [];
    const q = searchText.trim().toLowerCase();
    if (q) rows = rows.filter((x) => (x.title + ' ' + plainText(x.description) + ' ' + S.personName(x.assignee_id)).toLowerCase().includes(q));
    rows = sortTasks(rows, filter === 'done');
    clear(listEl);
    if (!rows.length) {
      listEl.append(emptyState(filter === 'mine' ? t('tasks.emptyMine') : t('tasks.empty'),
        h('button.btn', { onclick: () => openTaskForm() }, icon('plus', 16), t('tasks.new'))));
    }
    for (const tk of rows) listEl.append(taskRow(tk, counts));
  }
  paint();
  S.commentCounts('task').then((m) => { counts = m; paint(); }).catch(() => {});
  return { repaint: paint };
}

export function sortTasks(rows, done) {
  const prio = { urgent: 0, high: 1, normal: 2, low: 3 };
  return [...rows].sort((a, b) => {
    if (done) return (b.completed_at || '').localeCompare(a.completed_at || '');
    const da = a.due_date || '9999', db = b.due_date || '9999';
    if (da !== db) return da.localeCompare(db);
    return (prio[a.priority] - prio[b.priority]) || b.created_at.localeCompare(a.created_at);
  });
}

export function taskRow(tk, commentMap) {
  const st = dueState(tk.due_date, tk.status);
  const isNewForMe = tk.assignee_id === S.myId() && tk.created_by !== S.myId() && S.isNew('task', tk.id);
  const docs = S.docsFor('task', tk.id).length;
  const nComments = commentMap ? commentMap.get(tk.id) || 0 : 0;
  const check = h('button.check' + (tk.status === 'done' ? '.on' : ''), {
    type: 'button',
    'aria-label': tk.status === 'done' ? t('tasks.reopen') : t('tasks.markDone'),
    title: tk.status === 'done' ? t('tasks.reopen') : t('tasks.markDone'),
    disabled: !S.canEditTask(tk),
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      busy(e.currentTarget, async () => {
        await S.updateTask(tk.id, { status: tk.status === 'done' ? 'open' : 'done' });
        if (tk.status !== 'done') toast(t('tasks.doneToast'), { type: 'ok' });
      });
    },
  }, icon('check', 18));
  return h('a.row.task-row' + (isNewForMe ? '.is-new' : '') + (tk.status === 'done' ? '.is-done' : ''), { href: '#/tasks/' + tk.id },
    check,
    h('div.row-main',
      h('div.row-title', isNewForMe ? newBadge() : null, h('span', tk.title)),
      h('div.row-meta',
        tk.assignee_id ? h('span.person', avatar(S.profile(tk.assignee_id), 20), S.personName(tk.assignee_id)) : h('span.muted', t('tasks.unassigned')),
        tk.status === 'in_progress' ? h('span.chip.chip-progress', t('status.in_progress')) : null,
        priorityChip(tk.priority),
        docs ? h('span.meta-icon', icon('clip', 14), String(docs)) : null,
        nComments ? h('span.meta-icon', icon('comment', 14), String(nComments)) : null)),
    tk.due_date ? h('span.due.due-' + st, { title: t('tasks.due') }, st === 'overdue' ? icon('alert', 14) : icon('clock', 14),
      st === 'today' ? t('tasks.today') : fmtDate(tk.due_date, { year: undefined })) : null);
}

// ---------------------------------------------------------------------------
function renderDetail(main, id) {
  const head = h('div');
  const info = h('div');
  let attach = null;
  let comments = null;
  const tk0 = S.byId('tasks', id);
  if (!tk0) {
    main.append(backLink('#/tasks', t('nav.tasks')), emptyState(t('common.notFound')));
    return {};
  }
  S.markSeen('task', id);
  attach = attachmentsSection('task', id);
  comments = commentsSection('task', id);
  main.append(backLink('#/tasks', t('nav.tasks')), head, h('div.detail-grid', h('div.detail-main', info, attach), h('div.detail-side', comments)));

  function paint() {
    const tk = S.byId('tasks', id);
    if (!tk) { clear(main).append(backLink('#/tasks', t('nav.tasks')), emptyState(t('tasks.deleted'))); return; }
    const canEdit = S.canEditTask(tk);
    const st = dueState(tk.due_date, tk.status);
    clear(head).append(h('div.detail-head',
      h('h1', tk.title),
      h('div.page-actions',
        canEdit ? h('button.btn', { onclick: () => openTaskForm(tk) }, icon('edit', 16), t('common.edit')) : null,
        S.canDeleteTask(tk) ? h('button.btn.btn-ghost-danger', {
          onclick: async () => {
            if (await confirmDialog(t('tasks.deleteConfirm'), { danger: true, ok: t('common.delete') })) {
              await busy(null, () => S.deleteTask(tk.id));
              location.hash = '#/tasks';
            }
          },
        }, icon('trash', 16)) : null)));
    const statusSel = select([['open', t('status.open')], ['in_progress', t('status.in_progress')], ['done', t('status.done')]], tk.status, {
      disabled: !canEdit, class: 'status-select status-' + tk.status,
      onchange: (e) => busy(null, () => S.updateTask(tk.id, { status: e.target.value })),
    });
    const minute = tk.minute_id ? S.byId('minutes', tk.minute_id) : null;
    clear(info).append(h('section.panel',
      h('div.info-grid',
        infoRow(t('tasks.status'), statusSel),
        infoRow(t('tasks.assignee'), tk.assignee_id ? personLine(tk.assignee_id) : h('span.muted', t('tasks.unassigned'))),
        infoRow(t('tasks.due'), tk.due_date ? h('span.due.due-' + st, fmtDate(tk.due_date, { weekday: 'short' })) : h('span.muted', '—')),
        infoRow(t('tasks.priority'), h('span', t('prio.' + tk.priority))),
        infoRow(t('common.createdBy'), h('span', personLine(tk.created_by), h('span.muted.small', ' · ' + fmtDateTime(tk.created_at)))),
        minute ? infoRow(t('tasks.fromMinutes'), h('a', { href: '#/minutes/' + minute.id }, minute.title)) : null,
        tk.completed_at ? infoRow(t('tasks.completed'), fmtDateTime(tk.completed_at)) : null),
      h('h3.section-title', t('tasks.description')),
      tk.description && plainText(tk.description) ? richText(tk.description) : h('p.muted', t('tasks.noDescription'))));
    if (attach) attach.repaint();
  }
  paint();
  return { repaint: paint };
}

// ---------------------------------------------------------------------------
export function openTaskForm(tk = null, defaults = {}) {
  const v = tk || { title: '', description: '', assignee_id: defaults.assignee_id ?? S.myId(), due_date: defaults.due_date || '', priority: 'normal', minute_id: defaults.minute_id || null };
  const title = h('input', { type: 'text', value: v.title, required: true, maxLength: 300, placeholder: t('tasks.titlePlaceholder') });
  const editor = createEditor({ value: v.description, placeholder: t('tasks.descriptionPlaceholder'), minHeight: '140px' });
  const assignee = assigneeSelect(v.assignee_id);
  const due = h('input', { type: 'date', value: v.due_date || '' });
  const prio = select(['low', 'normal', 'high', 'urgent'].map((p) => [p, t('prio.' + p)]), v.priority);
  const quick = h('div.quick-dates',
    [[t('tasks.today'), todayISO()], [t('tasks.tomorrow'), addDaysISO(1)], [t('tasks.inWeek'), addDaysISO(7)], [t('tasks.noDate'), '']]
      .map(([l, d]) => h('button.btn.btn-small', { type: 'button', onclick: () => { due.value = d; } }, l)));
  const minuteSel = select([['', '—'], ...S.state.minutes.map((m) => [m.id, `${fmtDate(m.held_on)} · ${m.title}`])], v.minute_id || '');
  const fileInput = tk ? null : h('input', { type: 'file', multiple: true });

  modal(tk ? t('tasks.edit') : t('tasks.new'), (close) => {
    const save = h('button.btn.btn-primary', { type: 'submit' }, tk ? t('common.save') : t('tasks.create'));
    return h('form.form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!title.value.trim()) { title.focus(); return; }
        busy(save, async () => {
          const data = {
            title: title.value.trim(), description: editor.getHTML(), assignee_id: assignee.value || null,
            due_date: due.value || null, priority: prio.value, minute_id: minuteSel.value || null,
          };
          if (tk) {
            await S.updateTask(tk.id, data);
            toast(t('common.saved'), { type: 'ok' });
          } else {
            const row = await S.createTask(data);
            if (fileInput && fileInput.files.length) await S.uploadFiles([...fileInput.files], { linkTo: { type: 'task', id: row.id } });
            toast(data.assignee_id && data.assignee_id !== S.myId() ? t('tasks.createdNotified', { name: S.personName(data.assignee_id) }) : t('tasks.created'), { type: 'ok' });
          }
          close();
        });
      },
    },
    field(t('tasks.title'), title),
    h('div.field', h('label', t('tasks.description')), editor.el),
    h('div.form-row', field(t('tasks.assignee'), assignee), field(t('tasks.priority'), prio)),
    h('div.field', h('label', { for: 'due-' + (tk ? tk.id : 'new') }, t('tasks.due')), Object.assign(due, { id: 'due-' + (tk ? tk.id : 'new') }), quick),
    S.state.minutes.length ? field(t('tasks.fromMinutes'), minuteSel) : null,
    fileInput ? field(t('docs.attachFiles'), fileInput) : null,
    h('div.form-actions', h('button.btn', { type: 'button', onclick: () => close() }, t('common.cancel')), save));
  }, { wide: true, sticky: true });
}
