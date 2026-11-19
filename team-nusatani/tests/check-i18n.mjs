// Checks that every text key used in the code exists in English AND Bahasa Melayu.
// Run: node tests/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js');
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en' }, configurable: true });
globalThis.document = { documentElement: {} };
globalThis.CustomEvent = class {};
const { DICTS } = await import(join(root, 'i18n.js'));

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(root);
const used = new Set();
const prefixes = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'(\s*\+)?/g)) (m[2] ? prefixes : used).add(m[1]);
  for (const m of src.matchAll(/'(editor\.[a-zA-Z]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/label: '(nav\.[a-zA-Z]+)'/g)) used.add(m[1]);
}
const kinds = ['member_pending', 'member_approved', 'task_assigned', 'task_done', 'task_due_soon', 'task_due_today', 'task_overdue', 'comment',
  'update_posted', 'minutes_final', 'decision_new', 'decision_closed', 'decision_deadline', 'meeting_poll', 'meeting_scheduled', 'meeting_link',
  'meeting_cancelled', 'meeting_soon', 'meeting_tomorrow'];
for (const k of kinds) { used.add(`notif.${k}.title`); used.add(`notif.${k}.body`); }
let bad = 0;
for (const key of used) for (const l of ['en', 'ms']) if (!(key in DICTS[l])) { console.log(`missing ${l}: ${key}`); bad++; }
for (const p of prefixes) for (const l of ['en', 'ms']) if (!Object.keys(DICTS[l]).some((k) => k.startsWith(p))) { console.log(`missing ${l}: ${p}*`); bad++; }
const en = Object.keys(DICTS.en); const ms = Object.keys(DICTS.ms);
for (const k of en) if (!ms.includes(k)) { console.log('only in en:', k); bad++; }
for (const k of ms) if (!en.includes(k)) { console.log('only in ms:', k); bad++; }
console.log(bad ? `${bad} problem(s)` : `i18n ok – ${used.size} keys used, ${en.length} defined in both languages`);
process.exit(bad ? 1 : 0);
