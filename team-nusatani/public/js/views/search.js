// Search across tasks, decisions, meetings, minutes, updates and documents
import { t } from '../i18n.js';
import { h, clear, icon, plainText, emptyState, fmtDate, debounce } from '../util.js';
import * as S from '../store.js';
import { pageHead } from './common.js';

export function render(main, { query }) {
  const input = h('input.filter-input.search-big', { type: 'search', value: query.get('q') || '', placeholder: t('search.placeholder'), autofocus: true });
  const results = h('div.list');
  main.append(pageHead(t('nav.search')), input, results);
  const run = () => {
    const q = input.value.trim().toLowerCase();
    clear(results);
    if (q.length < 2) { results.append(h('p.muted', t('search.hint'))); return; }
    const hit = (...parts) => parts.join(' ').toLowerCase().includes(q);
    const groups = [
      ['tasks', 'tasks', S.state.tasks.filter((x) => hit(x.title, plainText(x.description))), (x) => x.title, (x) => x.due_date ? fmtDate(x.due_date) : ''],
      ['decisions', 'ballot', S.state.decisions.filter((x) => hit(x.title, plainText(x.description))), (x) => x.title, (x) => t('dec.result.' + x.status)],
      ['meetings', 'calendar', S.state.meetings.filter((x) => hit(x.title, plainText(x.agenda))), (x) => x.title, (x) => x.starts_at ? fmtDate(x.starts_at) : ''],
      ['minutes', 'minutes', S.state.minutes.filter((x) => hit(x.title, plainText(x.body), plainText(x.resolutions))), (x) => x.title, (x) => fmtDate(x.held_on)],
      ['updates', 'updates', S.state.updates.filter((x) => hit(x.title, plainText(x.body))), (x) => x.title, (x) => fmtDate(x.created_at)],
      ['documents', 'folder', S.state.documents.filter((x) => hit(x.name, x.description)), (x) => x.name, (x) => t('docs.cat.' + x.category)],
    ];
    let total = 0;
    for (const [key, ic, rows, label, meta] of groups) {
      if (!rows.length) continue;
      total += rows.length;
      results.append(h('h3.search-group', t('nav.' + key)));
      for (const x of rows.slice(0, 20)) {
        results.append(h('a.row', { href: key === 'documents' ? '#/documents' : `#/${key}/${x.id}` }, h('span.row-icon', icon(ic, 18)),
          h('div.row-main', h('div.row-title', label(x)), h('div.row-meta', meta(x)))));
      }
    }
    if (!total) results.append(emptyState(t('search.none')));
  };
  input.addEventListener('input', debounce(() => {
    history.replaceState(null, '', '#/search?q=' + encodeURIComponent(input.value.trim()));
    run();
  }, 200));
  run();
  return { repaint: run };
}
