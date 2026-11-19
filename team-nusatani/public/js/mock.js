// Demo backend: an in-browser stand-in for Supabase with sample data.
// Used only when config.js has no supabaseUrl (or with ?demo=1). Data lives in
// this browser's localStorage; nothing is sent anywhere.
/* eslint-disable no-use-before-define */
const KEY = 'tn-demo-db-v1';
const SKEY = 'tn-demo-session';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
}));
const now = () => new Date().toISOString();
const inDays = (n, h = null) => {
  const d = new Date(Date.now() + n * 86400000);
  if (h !== null) d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
const dateOnly = (n) => inDays(n).slice(0, 10);

const U = { carsten: 'a0000000-0000-4000-8000-000000000001', ahmad: 'a0000000-0000-4000-8000-000000000002', siti: 'a0000000-0000-4000-8000-000000000003', rahim: 'a0000000-0000-4000-8000-000000000004' };

function seed() {
  const db = {
    profiles: [
      { id: U.carsten, email: 'carsten@nusatani.com', full_name: 'Carsten Fritz', job_title: 'Director', phone: '+49 170 0000000', role: 'admin', status: 'active', lang: 'en', created_at: inDays(-60), approved_at: inDays(-60) },
      { id: U.ahmad, email: 'ahmad@nusatani.com', full_name: 'Ahmad Rahman', job_title: 'Director', phone: '+60 12 000 0001', role: 'member', status: 'active', lang: 'ms', created_at: inDays(-58), approved_at: inDays(-58) },
      { id: U.siti, email: 'siti@nusatani.com', full_name: 'Siti Aminah', job_title: 'Director', phone: '+60 13 000 0002', role: 'member', status: 'active', lang: 'ms', created_at: inDays(-58), approved_at: inDays(-57) },
      { id: U.rahim, email: 'rahim@example.com', full_name: 'Rahim Accountant', job_title: '', phone: '', role: 'member', status: 'pending', lang: 'en', created_at: inDays(-1), approved_at: null },
    ],
    tasks: [], comments: [], updates: [], minutes: [], documents: [], entity_documents: [], decisions: [], decision_participants: [],
    decision_votes: [], meetings: [], meeting_participants: [], meeting_slots: [], meeting_responses: [], notifications: [], reads: [],
    push_subscriptions: [], files: {},
  };
  const min1 = uuid();
  db.minutes.push({
    id: min1, title: 'Board meeting October', meeting_type: 'board', held_on: dateOnly(-20), location: 'Zoom', attendees: [U.carsten, U.ahmad, U.siti], guests: 'Mr Lim (accountant)',
    body: '<h3>1. Financial statements</h3><p>The accountant presented the draft financial statements. Questions on depreciation of the irrigation system.</p><h3>2. Harvest plan</h3><ul><li>Block A ready in November</li><li>Block B in January</li></ul>',
    resolutions: '<ol><li>The draft financial statements are <strong>approved</strong> subject to the open questions.</li><li>Ahmad will obtain three quotes for the new irrigation pump.</li></ol>',
    status: 'final', meeting_id: null, created_by: U.carsten, created_at: inDays(-20), updated_at: inDays(-19),
  });
  const t = (o) => ({ id: uuid(), description: '', due_date: null, priority: 'normal', status: 'open', minute_id: null, created_at: inDays(-5), updated_at: inDays(-5), completed_at: null, ...o });
  db.tasks.push(
    t({ title: 'Get three quotes for the irrigation pump', description: '<p>As agreed in the board meeting. Please compare:</p><ul class="checklist"><li class="done">Supplier Kuala Selangor</li><li>Supplier Ipoh</li><li>Online offer</li></ul>', assignee_id: U.ahmad, created_by: U.carsten, due_date: dateOnly(2), priority: 'high', minute_id: min1, created_at: inDays(-19) }),
    t({ title: 'Send signed bank mandate to Maybank', assignee_id: U.carsten, created_by: U.siti, due_date: dateOnly(-1), priority: 'urgent', description: '<p>The form is attached under Documents → Finance.</p>', created_at: inDays(-3) }),
    t({ title: 'Renew company insurance', assignee_id: U.siti, created_by: U.carsten, due_date: dateOnly(10), created_at: inDays(-2) }),
    t({ title: 'Prepare harvest report for block A', assignee_id: U.carsten, created_by: U.ahmad, due_date: dateOnly(0), created_at: inDays(-1) }),
    t({ title: 'Update SSM company records', assignee_id: U.ahmad, created_by: U.ahmad, due_date: dateOnly(14), priority: 'low' }),
    t({ title: 'Answer auditor questions', assignee_id: U.carsten, created_by: U.carsten, status: 'done', completed_at: inDays(-4), created_at: inDays(-12) }),
  );
  db.comments.push({ id: uuid(), entity_type: 'task', entity_id: db.tasks[0].id, body: '<p>First quote received – RM 8,400 incl. installation.</p>', created_by: U.ahmad, created_at: inDays(-2), edited_at: null });
  db.updates.push(
    { id: uuid(), title: 'Harvest started in block A', body: '<p>Harvesting started today. First estimates: <strong>12 tonnes</strong> in the first week.</p>', pinned: false, created_by: U.ahmad, created_at: inDays(-1), updated_at: inDays(-1) },
    { id: uuid(), title: 'New bank signatory rules', body: '<p>From 1 December two signatures are required for payments above RM 10,000.</p>', pinned: true, created_by: U.carsten, created_at: inDays(-10), updated_at: inDays(-10) },
  );
  const d1 = uuid(); const d2 = uuid(); const d3 = uuid();
  db.decisions.push(
    { id: d1, title: 'Buy new irrigation pump (max. RM 9,000)', description: '<p>The old pump failed twice this month. Proposal: buy the pump from the cheapest of the three quotes, max. RM 9,000.</p>', urgency: 'high', deadline: inDays(2), status: 'open', required: 2, yes_count: null, no_count: null, other_count: null, decided_at: null, minute_id: min1, created_by: U.carsten, created_at: inDays(-1) },
    { id: d2, title: 'Approve draft financial statements 2025', description: '<p>See attached draft.</p>', urgency: 'normal', deadline: inDays(-15), status: 'approved', required: 2, yes_count: 3, no_count: 0, other_count: 0, decided_at: inDays(-16), minute_id: min1, created_by: U.siti, created_at: inDays(-19) },
    { id: d3, title: 'Change of company secretary', description: '<p>Proposal to appoint a new company secretary from January.</p>', urgency: 'urgent', deadline: inDays(1), status: 'open', required: 2, yes_count: null, no_count: null, other_count: null, decided_at: null, minute_id: null, created_by: U.siti, created_at: inDays(0) },
  );
  for (const d of [d1, d2, d3]) for (const u of [U.carsten, U.ahmad, U.siti]) db.decision_participants.push({ decision_id: d, user_id: u });
  db.decision_votes.push(
    { decision_id: d1, user_id: U.ahmad, choice: 'yes', statement: '', created_at: inDays(-0.5) },
    { decision_id: d2, user_id: U.carsten, choice: 'yes', statement: '', created_at: inDays(-18) },
    { decision_id: d2, user_id: U.ahmad, choice: 'yes', statement: '', created_at: inDays(-17) },
    { decision_id: d2, user_id: U.siti, choice: 'yes', statement: '', created_at: inDays(-16) },
  );
  const m1 = uuid(); const m2 = uuid();
  db.meetings.push(
    { id: m1, title: 'Board meeting December', kind: 'board', agenda: '<ol><li>Harvest report</li><li>Irrigation pump</li><li>Budget 2027</li></ol>', duration_minutes: 90, location: 'Zoom', video_link: '', status: 'polling', starts_at: null, link_sent_at: null, created_by: U.carsten, created_at: inDays(-1) },
    { id: m2, title: 'Call with the bank', kind: 'adhoc', agenda: '<p>New credit line</p>', duration_minutes: 30, location: 'Zoom', video_link: 'https://zoom.us/j/1234567890', status: 'scheduled', starts_at: inDays(1, 10), link_sent_at: inDays(-0.2), created_by: U.siti, created_at: inDays(-3) },
  );
  for (const u of [U.carsten, U.ahmad, U.siti]) { db.meeting_participants.push({ meeting_id: m1, user_id: u }, { meeting_id: m2, user_id: u }); }
  const s1 = uuid(); const s2 = uuid(); const s3 = uuid();
  db.meeting_slots.push(
    { id: s1, meeting_id: m1, starts_at: inDays(9, 10), created_by: U.carsten },
    { id: s2, meeting_id: m1, starts_at: inDays(10, 15), created_by: U.carsten },
    { id: s3, meeting_id: m1, starts_at: inDays(12, 9), created_by: U.siti },
    { id: uuid(), meeting_id: m2, starts_at: inDays(1, 10), created_by: U.siti },
  );
  db.meeting_responses.push(
    { slot_id: s1, user_id: U.carsten, answer: 'yes', updated_at: now() }, { slot_id: s2, user_id: U.carsten, answer: 'maybe', updated_at: now() },
    { slot_id: s3, user_id: U.carsten, answer: 'yes', updated_at: now() }, { slot_id: s1, user_id: U.siti, answer: 'yes', updated_at: now() },
    { slot_id: s2, user_id: U.siti, answer: 'no', updated_at: now() }, { slot_id: s3, user_id: U.siti, answer: 'yes', updated_at: now() },
  );
  const doc = (name, cat, by, text, link) => {
    const id = uuid();
    const path = `${by}/${id}-${name}`;
    db.documents.push({ id, name, storage_path: path, mime_type: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain', size_bytes: text.length, category: cat, description: '', created_by: by, created_at: inDays(-7) });
    db.files[path] = { text, type: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain' };
    if (link) db.entity_documents.push({ entity_type: link[0], entity_id: link[1], document_id: id, added_by: by, added_at: inDays(-7) });
  };
  doc('Draft financial statements 2025.pdf', 'finance', U.siti, demoPdf('Draft financial statements 2025 (demo)'), ['decision', d2]);
  doc('Bank mandate form.pdf', 'finance', U.carsten, demoPdf('Bank mandate form (demo)'), ['task', db.tasks[1].id]);
  doc('Pump quote Kuala Selangor.txt', 'operations', U.ahmad, 'Quote: irrigation pump 7.5 kW – RM 8,400 incl. installation (demo file).', ['task', db.tasks[0].id]);
  const n = (user, kind, et, eid, data, actor, age = 0.1) => db.notifications.push({ id: uuid(), user_id: user, kind, entity_type: et, entity_id: eid, data, actor_id: actor, created_at: inDays(-age), read_at: null });
  n(U.carsten, 'member_pending', 'profile', U.rahim, { name: 'Rahim Accountant' }, null, 1);
  n(U.carsten, 'task_assigned', 'task', db.tasks[3].id, { title: db.tasks[3].title, actor: 'Ahmad Rahman' }, U.ahmad, 1);
  n(U.carsten, 'decision_new', 'decision', d3, { title: 'Change of company secretary', deadline: inDays(1), actor: 'Siti Aminah' }, U.siti, 0.05);
  n(U.ahmad, 'decision_new', 'decision', d3, { title: 'Change of company secretary', deadline: inDays(1), actor: 'Siti Aminah' }, U.siti, 0.05);
  n(U.ahmad, 'meeting_poll', 'meeting', m1, { title: 'Board meeting December', actor: 'Carsten Fritz' }, U.carsten, 1);
  db.reads.push({ user_id: U.carsten, entity_type: 'update', entity_id: db.updates[1].id, read_at: inDays(-9) },
    { user_id: U.ahmad, entity_type: 'update', entity_id: db.updates[1].id, read_at: inDays(-9) },
    { user_id: U.carsten, entity_type: 'minute', entity_id: min1, read_at: inDays(-19) });
  return db;
}

function demoPdf(title) {
  const text = title.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 60 760 Td (${text}) Tj ET BT /F1 11 Tf 60 730 Td (Team Nusatani demo document.) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}

let db;
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
  if (!db || !db.profiles) { db = seed(); save(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* full */ } }
const memFiles = {};

let session = null;
try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { session = null; }
const authCbs = new Set();
const me = () => session && session.user.id;
const prof = (id) => db.profiles.find((p) => p.id === id);
const isAdmin = () => { const p = prof(me()); return !!(p && p.role === 'admin' && p.status === 'active'); };
const isActive = () => { const p = prof(me()); return !!(p && p.status === 'active'); };
const actorName = (id) => { const p = prof(id); return p ? p.full_name || p.email : ''; };
const err = (message) => ({ data: null, error: { message } });

function notify(recipients, kind, et, eid, data, actor) {
  for (const r of new Set(recipients.filter(Boolean))) {
    const p = prof(r);
    if (!p || p.status !== 'active' || r === actor) continue;
    db.notifications.push({ id: uuid(), user_id: r, kind, entity_type: et, entity_id: eid, data: data || {}, actor_id: actor || null, created_at: now(), read_at: null });
  }
}
const activeIds = () => db.profiles.filter((p) => p.status === 'active').map((p) => p.id);

// visibility (mirrors the database policies)
function visible(table, row) {
  const uid = me();
  if (!uid) return false;
  if (table === 'profiles') return row.id === uid || isActive();
  if (!isActive()) return false;
  if (table === 'notifications' || table === 'push_subscriptions') return row.user_id === uid;
  if (table === 'decision_votes') {
    const d = db.decisions.find((x) => x.id === row.decision_id);
    return row.user_id === uid || isAdmin() || (d && d.status !== 'open');
  }
  if (table === 'reads') return row.user_id === uid || ['update', 'minute'].includes(row.entity_type);
  return true;
}

// triggers -------------------------------------------------------------------
function afterInsert(table, row) {
  const uid = me();
  if (table === 'tasks') {
    notify([row.assignee_id], 'task_assigned', 'task', row.id, { title: row.title, due: row.due_date, actor: actorName(uid) }, uid);
  } else if (table === 'updates') {
    notify(activeIds(), 'update_posted', 'update', row.id, { title: row.title, actor: actorName(uid) }, uid);
  } else if (table === 'minutes' && row.status === 'final') {
    notify(activeIds(), 'minutes_final', 'minute', row.id, { title: row.title, actor: actorName(uid) }, uid);
  } else if (table === 'comments') {
    const src = { task: 'tasks', update: 'updates', minute: 'minutes', decision: 'decisions', meeting: 'meetings' }[row.entity_type];
    const item = db[src].find((x) => x.id === row.entity_id) || {};
    let owners = [item.created_by, item.assignee_id];
    if (row.entity_type === 'decision') owners = owners.concat(db.decision_participants.filter((x) => x.decision_id === row.entity_id).map((x) => x.user_id));
    if (row.entity_type === 'meeting') owners = owners.concat(db.meeting_participants.filter((x) => x.meeting_id === row.entity_id).map((x) => x.user_id));
    owners = owners.concat(db.comments.filter((c) => c.entity_type === row.entity_type && c.entity_id === row.entity_id).map((c) => c.created_by));
    notify(owners, 'comment', row.entity_type, row.entity_id, { title: item.title, actor: actorName(uid) }, uid);
  }
}
function beforeUpdate(table, oldRow, patch) {
  if (table === 'tasks' && patch.status) {
    if (patch.status === 'done' && oldRow.status !== 'done') patch.completed_at = now();
    if (patch.status !== 'done') patch.completed_at = null;
  }
  if (['tasks', 'updates', 'minutes'].includes(table)) patch.updated_at = now();
  if (table === 'decisions' && db.decision_votes.some((v) => v.decision_id === oldRow.id)) return 'a decision cannot be changed after the first vote';
  if (table === 'minutes' && !isAdmin() && oldRow.status === 'final') return 'not allowed';
  return null;
}
function afterUpdate(table, oldRow, row) {
  const uid = me();
  if (table === 'tasks') {
    if (row.assignee_id !== oldRow.assignee_id) {
      notify([row.assignee_id], 'task_assigned', 'task', row.id, { title: row.title, actor: actorName(uid) }, uid);
      db.reads = db.reads.filter((r) => !(r.entity_type === 'task' && r.entity_id === row.id && r.user_id === row.assignee_id));
    }
    if (row.status === 'done' && oldRow.status !== 'done') notify([row.created_by, row.assignee_id], 'task_done', 'task', row.id, { title: row.title, actor: actorName(uid) }, uid);
  }
  if (table === 'minutes' && row.status === 'final' && oldRow.status !== 'final') notify(activeIds(), 'minutes_final', 'minute', row.id, { title: row.title, actor: actorName(uid) }, uid);
}

// query builder ----------------------------------------------------------------
const PK = {
  decision_participants: ['decision_id', 'user_id'], decision_votes: ['decision_id', 'user_id'], meeting_participants: ['meeting_id', 'user_id'],
  meeting_responses: ['slot_id', 'user_id'], reads: ['user_id', 'entity_type', 'entity_id'], entity_documents: ['entity_type', 'entity_id', 'document_id'], push_subscriptions: ['endpoint'],
};
const DEFAULTS = {
  tasks: () => ({ description: '', status: 'open', priority: 'normal', created_at: now(), updated_at: now(), completed_at: null, minute_id: null, due_date: null }),
  updates: () => ({ pinned: false, created_at: now(), updated_at: now() }),
  minutes: () => ({ status: 'draft', created_at: now(), updated_at: now(), attendees: [], guests: '', body: '', resolutions: '', location: '' }),
  comments: () => ({ created_at: now(), edited_at: null }),
  documents: () => ({ created_at: now(), description: '' }),
  entity_documents: () => ({ added_at: now() }),
  meeting_slots: () => ({}),
};

class Query {
  constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.orders = []; this.lim = null; this.mode = null; this.ret = false; }
  select() { if (this.op !== 'select') this.ret = true; return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; this.opts = opts; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, v) { this.filters.push((r) => v.includes(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  order(c, { ascending = true } = {}) { this.orders.push([c, ascending]); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  rows() { return (db[this.table] || []).filter((r) => visible(this.table, r) && this.filters.every((f) => f(r))); }
  exec() {
    load();
    const T = this.table;
    if (!me()) return err('not signed in');
    let out;
    if (this.op === 'select') {
      out = this.rows().map((r) => ({ ...r }));
      for (const [c, asc] of [...this.orders].reverse()) out.sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? '')) * (asc ? 1 : -1));
      if (this.lim) out = out.slice(0, this.lim);
    } else if (this.op === 'insert' || this.op === 'upsert') {
      if (!isActive() && T !== 'profiles') return err('new row violates row-level security policy');
      out = [];
      for (const p of this.payload) {
        const row = { ...(DEFAULTS[T] ? DEFAULTS[T]() : {}), ...p };
        if (!PK[T] && !row.id) row.id = uuid();
        const keys = PK[T];
        const existing = keys ? db[T].find((r) => keys.every((k) => r[k] === row[k])) : null;
        if (existing) {
          if (this.op === 'insert') return err('duplicate key value');
          if (!(this.opts && this.opts.ignoreDuplicates)) Object.assign(existing, row);
          out.push(existing);
          continue;
        }
        db[T].push(row);
        afterInsert(T, row);
        out.push(row);
      }
    } else if (this.op === 'update') {
      out = [];
      for (const r of this.rows()) {
        if (T === 'profiles' && r.id !== me()) continue;
        const patch = { ...this.payload };
        const e = beforeUpdate(T, r, patch);
        if (e) return err(e);
        const old = { ...r };
        Object.assign(r, patch);
        afterUpdate(T, old, r);
        out.push(r);
      }
    } else if (this.op === 'delete') {
      const del = this.rows().filter((r) => isAdmin() || !('created_by' in r) || r.created_by === me() || T === 'notifications' || T === 'entity_documents');
      db[T] = db[T].filter((r) => !del.includes(r));
      if (T === 'documents') db.entity_documents = db.entity_documents.filter((l) => !del.some((d) => d.id === l.document_id));
      if (T === 'meeting_slots') db.meeting_responses = db.meeting_responses.filter((x) => !del.some((s) => s.id === x.slot_id));
      out = del;
    }
    save();
    if (this.mode === 'single') return out && out.length ? { data: { ...out[0] }, error: null } : err('no rows');
    if (this.mode === 'maybe') return { data: out && out.length ? { ...out[0] } : null, error: null };
    return { data: this.op === 'select' || this.ret ? out : null, error: null };
  }
}

// RPCs ---------------------------------------------------------------------------
function evaluate(d, expire) {
  if (d.status !== 'open') return d.status;
  const parts = db.decision_participants.filter((p) => p.decision_id === d.id);
  const votes = db.decision_votes.filter((v) => v.decision_id === d.id);
  const y = votes.filter((v) => v.choice === 'yes').length;
  const n = votes.filter((v) => v.choice === 'no').length;
  const o = votes.filter((v) => v.choice === 'other').length;
  let result = null;
  if (y >= d.required) result = 'approved';
  else if (n >= d.required) result = 'rejected';
  else if (votes.length >= parts.length) result = 'no_majority';
  else if (expire) result = 'expired';
  if (!result) return 'open';
  Object.assign(d, { status: result, decided_at: now(), yes_count: y, no_count: n, other_count: o });
  notify(parts.map((p) => p.user_id).concat(d.created_by), 'decision_closed', 'decision', d.id, { title: d.title, result }, null);
  return result;
}
const RPC = {
  create_decision(a) {
    if (new Date(a.p_deadline) <= new Date()) throw new Error('deadline must be in the future');
    const parts = a.p_participants.filter((id) => prof(id) && prof(id).status === 'active');
    if (!parts.length) throw new Error('at least one participant is required');
    const id = uuid();
    db.decisions.push({ id, title: a.p_title, description: a.p_description || '', urgency: a.p_urgency, deadline: a.p_deadline, status: 'open', required: Math.floor(parts.length / 2) + 1, yes_count: null, no_count: null, other_count: null, decided_at: null, minute_id: a.p_minute_id, created_by: me(), created_at: now() });
    for (const u of parts) db.decision_participants.push({ decision_id: id, user_id: u });
    notify(parts, 'decision_new', 'decision', id, { title: a.p_title, deadline: a.p_deadline, urgency: a.p_urgency, actor: actorName(me()) }, me());
    return id;
  },
  cast_vote(a) {
    const d = db.decisions.find((x) => x.id === a.p_decision_id);
    if (!d) throw new Error('decision not found');
    if (!db.decision_participants.some((p) => p.decision_id === d.id && p.user_id === me())) throw new Error('you are not a participant of this decision');
    if (d.status !== 'open') throw new Error('voting is closed');
    if (new Date(d.deadline) <= new Date()) { evaluate(d, true); throw new Error('voting is closed'); }
    if (db.decision_votes.some((v) => v.decision_id === d.id && v.user_id === me())) throw new Error('you have already voted – votes are binding');
    if (a.p_choice === 'other' && !String(a.p_statement || '').trim()) throw new Error('statement required');
    db.decision_votes.push({ decision_id: d.id, user_id: me(), choice: a.p_choice, statement: String(a.p_statement || '').trim(), created_at: now() });
    return evaluate(d, false);
  },
  cancel_decision(a) {
    const d = db.decisions.find((x) => x.id === a.p_decision_id);
    if (!(isAdmin() || d.created_by === me())) throw new Error('not allowed');
    if (d.status !== 'open') throw new Error('decision is already closed');
    Object.assign(d, { status: 'cancelled', decided_at: now() });
    notify(db.decision_participants.filter((p) => p.decision_id === d.id).map((p) => p.user_id), 'decision_closed', 'decision', d.id, { title: d.title, result: 'cancelled' }, me());
  },
  decision_tally(a) {
    if (!isAdmin()) throw new Error('not allowed');
    const v = db.decision_votes.filter((x) => x.decision_id === a.p_decision_id);
    return [{ participants: db.decision_participants.filter((p) => p.decision_id === a.p_decision_id).length, voted: v.length,
      yes: v.filter((x) => x.choice === 'yes').length, no: v.filter((x) => x.choice === 'no').length, other: v.filter((x) => x.choice === 'other').length }];
  },
  decision_has_votes: (a) => db.decision_votes.some((v) => v.decision_id === a.p_decision_id),
  create_meeting(a) {
    if (!a.p_slots || !a.p_slots.length) throw new Error('propose at least one time');
    const id = uuid();
    db.meetings.push({ id, title: a.p_title, kind: a.p_kind, agenda: a.p_agenda, duration_minutes: a.p_duration, location: a.p_location, video_link: '', status: 'polling', starts_at: null, link_sent_at: null, created_by: me(), created_at: now() });
    for (const u of new Set([...a.p_participants, me()])) db.meeting_participants.push({ meeting_id: id, user_id: u });
    for (const s of new Set(a.p_slots)) db.meeting_slots.push({ id: uuid(), meeting_id: id, starts_at: s, created_by: me() });
    notify(a.p_participants, 'meeting_poll', 'meeting', id, { title: a.p_title, actor: actorName(me()) }, me());
    return id;
  },
  schedule_meeting(a) {
    const m = db.meetings.find((x) => x.id === a.p_meeting_id);
    if (!(isAdmin() || m.created_by === me())) throw new Error('not allowed');
    const s = db.meeting_slots.find((x) => x.id === a.p_slot_id);
    Object.assign(m, { status: 'scheduled', starts_at: s.starts_at });
    notify(db.meeting_participants.filter((p) => p.meeting_id === m.id).map((p) => p.user_id), 'meeting_scheduled', 'meeting', m.id, { title: m.title, starts_at: m.starts_at, actor: actorName(me()) }, me());
  },
  send_meeting_link(a) {
    const m = db.meetings.find((x) => x.id === a.p_meeting_id);
    if (!(isAdmin() || m.created_by === me())) throw new Error('not allowed');
    if (!/^https:\/\//i.test(a.p_link)) throw new Error('the link must start with https://');
    Object.assign(m, { video_link: a.p_link, link_sent_at: now() });
    notify(db.meeting_participants.filter((p) => p.meeting_id === m.id).map((p) => p.user_id), 'meeting_link', 'meeting', m.id, { title: m.title, starts_at: m.starts_at, link: m.video_link, actor: actorName(me()) }, me());
  },
  set_meeting_status(a) {
    const m = db.meetings.find((x) => x.id === a.p_meeting_id);
    if (!(isAdmin() || m.created_by === me())) throw new Error('not allowed');
    m.status = a.p_status;
    if (a.p_status === 'polling') m.starts_at = null;
    if (a.p_status === 'cancelled') notify(db.meeting_participants.filter((p) => p.meeting_id === m.id).map((p) => p.user_id), 'meeting_cancelled', 'meeting', m.id, { title: m.title }, me());
  },
  admin_set_member(a) {
    if (!isAdmin()) throw new Error('not allowed');
    const p = prof(a.p_user_id);
    Object.assign(p, { role: a.p_role, status: a.p_status, approved_at: p.approved_at || (a.p_status === 'active' ? now() : null) });
    if (a.p_status === 'active') notify([p.id], 'member_approved', 'profile', p.id, {}, me());
  },
  mark_seen(a) {
    const r = db.reads.find((x) => x.user_id === me() && x.entity_type === a.p_entity_type && x.entity_id === a.p_entity_id);
    if (r) r.read_at = now(); else db.reads.push({ user_id: me(), entity_type: a.p_entity_type, entity_id: a.p_entity_id, read_at: now() });
    for (const n of db.notifications) if (n.user_id === me() && n.entity_type === a.p_entity_type && n.entity_id === a.p_entity_id && !n.read_at) n.read_at = now();
  },
};

function setSession(s, event) {
  session = s;
  try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch { /* ignore */ }
  for (const cb of authCbs) setTimeout(() => cb(event, s), 0);
}

window.createMockClient = () => {
  load();
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (cb) => { authCbs.add(cb); return { data: { subscription: { unsubscribe: () => authCbs.delete(cb) } } }; },
      signInWithPassword: async ({ email }) => {
        load();
        const p = db.profiles.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
        if (!p) return err('Invalid login credentials');
        const s = { user: { id: p.id, email: p.email }, access_token: 'demo' };
        setSession(s, 'SIGNED_IN');
        return { data: { session: s, user: s.user }, error: null };
      },
      signUp: async ({ email, options }) => {
        load();
        if (db.profiles.some((x) => x.email === email.toLowerCase())) return err('User already registered');
        const id = uuid();
        db.profiles.push({ id, email: email.toLowerCase(), full_name: (options && options.data && options.data.full_name) || email, job_title: '', phone: '', role: 'member', status: 'pending', lang: 'en', created_at: now(), approved_at: null });
        db.notifications.push(...db.profiles.filter((p) => p.role === 'admin').map((p) => ({ id: uuid(), user_id: p.id, kind: 'member_pending', entity_type: 'profile', entity_id: id, data: { name: email }, actor_id: null, created_at: now(), read_at: null })));
        save();
        return { data: { user: { id, email }, session: null }, error: null };
      },
      signOut: async () => { setSession(null, 'SIGNED_OUT'); return { error: null }; },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
    },
    from: (table) => new Query(table),
    rpc: async (name, args) => {
      load();
      try {
        if (!isActive()) throw new Error('not allowed');
        const data = RPC[name](args || {});
        save();
        return { data: data === undefined ? null : data, error: null };
      } catch (e) { return err(e.message); }
    },
    storage: {
      from: () => ({
        upload: async (path, file) => { memFiles[path] = file; return { data: { path }, error: null }; },
        remove: async (paths) => { for (const p of paths) { delete memFiles[p]; delete db.files[p]; } save(); return { data: [], error: null }; },
        createSignedUrl: async (path) => {
          load();
          let blob = memFiles[path];
          if (!blob && db.files[path]) blob = new Blob([db.files[path].text], { type: db.files[path].type });
          if (!blob) blob = new Blob(['Demo: the file content is only kept until the page is reloaded.'], { type: 'text/plain' });
          return { data: { signedUrl: URL.createObjectURL(blob) }, error: null };
        },
      }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    resetDemo: () => { db = seed(); save(); },
  };
};
