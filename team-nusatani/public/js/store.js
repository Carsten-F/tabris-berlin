// Data layer: Supabase client, in-memory cache of all team data and the
// operations the views use. The team is small, so everything is loaded at once.
import { todayISO, addDaysISO } from './util.js';

const CFG = window.TEAM_CONFIG || {};
export const DEMO = !CFG.supabaseUrl || /[?&]demo=1/.test(location.search);
export let sb = null;

export const state = {
  session: null,
  me: null, // own profile row
  profiles: [],
  tasks: [],
  decisions: [],
  decisionParticipants: [],
  votes: [],
  meetings: [],
  meetingParticipants: [],
  slots: [],
  responses: [],
  minutes: [],
  updates: [],
  documents: [],
  links: [],
  reads: new Set(),
  updateReads: [], // reads of updates/minutes by everybody ("seen by")
  notifications: [],
  loaded: false,
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { for (const fn of listeners) { try { fn(what); } catch (e) { console.error(e); } } }

async function q(p) {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export async function initClient() {
  if (DEMO) {
    await import('./mock.js');
    sb = window.createMockClient();
  } else {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return sb;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
export async function loadMe() {
  const uid = state.session && state.session.user.id;
  if (!uid) { state.me = null; return null; }
  state.me = await q(sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  return state.me;
}

const TABLES = {
  profiles: ['profiles', 'full_name'],
  tasks: ['tasks', 'created_at'],
  decisions: ['decisions', 'created_at'],
  decisionParticipants: ['decision_participants'],
  votes: ['decision_votes'],
  meetings: ['meetings', 'created_at'],
  meetingParticipants: ['meeting_participants'],
  slots: ['meeting_slots', 'starts_at'],
  responses: ['meeting_responses'],
  minutes: ['minutes', 'held_on'],
  updates: ['updates', 'created_at'],
  documents: ['documents', 'created_at'],
  links: ['entity_documents'],
};

async function loadTable(key) {
  const [table, order] = TABLES[key];
  let qb = sb.from(table).select('*');
  if (order) qb = qb.order(order, { ascending: order === 'full_name' || order === 'starts_at' });
  state[key] = (await q(qb.limit(5000))) || [];
}

export async function loadAll() {
  await Promise.all([
    ...Object.keys(TABLES).map(loadTable),
    loadReads(),
    loadNotifications(),
  ]);
  state.loaded = true;
  emit('all');
}

/** Reload only some tables, e.g. refresh('tasks', 'links') */
export async function refresh(...keys) {
  await Promise.all(keys.map((k) => (k === 'reads' ? loadReads() : k === 'notifications' ? loadNotifications() : loadTable(k))));
  emit(keys.join(','));
}

async function loadReads() {
  const rows = (await q(sb.from('reads').select('*').limit(10000))) || [];
  const uid = state.me && state.me.id;
  state.reads = new Set(rows.filter((r) => r.user_id === uid).map((r) => r.entity_type + ':' + r.entity_id));
  state.updateReads = rows.filter((r) => r.entity_type === 'update' || r.entity_type === 'minute');
}

export async function loadNotifications() {
  state.notifications = (await q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(150))) || [];
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
export const isAdmin = () => !!(state.me && state.me.role === 'admin' && state.me.status === 'active');
export const myId = () => state.me && state.me.id;
export const activeProfiles = () => state.profiles.filter((p) => p.status === 'active');
export const profile = (id) => state.profiles.find((p) => p.id === id) || null;
export function personName(id) {
  const p = profile(id);
  return p ? p.full_name || p.email : '—';
}
export const byId = (key, id) => state[key].find((x) => x.id === id) || null;
export const isNew = (type, id) => !state.reads.has(type + ':' + id);

export function decisionParticipants(did) {
  return state.decisionParticipants.filter((p) => p.decision_id === did).map((p) => p.user_id);
}
export const myVote = (did) => state.votes.find((v) => v.decision_id === did && v.user_id === myId()) || null;
export const votesFor = (did) => state.votes.filter((v) => v.decision_id === did);
export function meetingParticipants(mid) {
  return state.meetingParticipants.filter((p) => p.meeting_id === mid).map((p) => p.user_id);
}
export const slotsFor = (mid) => state.slots.filter((s) => s.meeting_id === mid).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
export const responsesFor = (sid) => state.responses.filter((r) => r.slot_id === sid);
export function docsFor(type, id) {
  const ids = state.links.filter((l) => l.entity_type === type && l.entity_id === id).map((l) => l.document_id);
  return state.documents.filter((d) => ids.includes(d.id));
}
export const linksForDoc = (docId) => state.links.filter((l) => l.document_id === docId);
export const seenBy = (type, id) => state.updateReads.filter((r) => r.entity_type === type && r.entity_id === id).map((r) => r.user_id);

export const canEditTask = (tk) => isAdmin() || tk.created_by === myId() || tk.assignee_id === myId();
export const canDeleteTask = (tk) => isAdmin() || tk.created_by === myId();
export const canManageMeeting = (m) => isAdmin() || m.created_by === myId();
export const canEditMinute = (m) => isAdmin() || (m.created_by === myId() && m.status === 'draft');

/** Everything the current user should act on – for the home page and the start pop-up. */
export function attention() {
  const me = myId();
  const today = todayISO();
  const tasksOverdue = state.tasks.filter((t) => t.assignee_id === me && t.status !== 'done' && t.due_date && t.due_date < today);
  const tasksToday = state.tasks.filter((t) => t.assignee_id === me && t.status !== 'done' && t.due_date === today);
  const tasksSoon = state.tasks.filter((t) => t.assignee_id === me && t.status !== 'done' && t.due_date > today && t.due_date <= addDaysISO(3));
  const votesNeeded = state.decisions.filter((d) => d.status === 'open' && new Date(d.deadline) > new Date()
    && decisionParticipants(d.id).includes(me) && !myVote(d.id));
  const pollsNeeded = state.meetings.filter((m) => m.status === 'polling' && meetingParticipants(m.id).includes(me)
    && slotsFor(m.id).some((s) => !responsesFor(s.id).some((r) => r.user_id === me)));
  const soon = Date.now() + 7 * 86400000;
  const meetingsSoon = state.meetings.filter((m) => m.status === 'scheduled' && m.starts_at
    && new Date(m.starts_at).getTime() > Date.now() - (m.duration_minutes || 60) * 60000
    && new Date(m.starts_at).getTime() < soon && meetingParticipants(m.id).includes(me))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const newTasks = state.tasks.filter((t) => t.assignee_id === me && t.created_by !== me && t.status !== 'done' && isNew('task', t.id));
  return { tasksOverdue, tasksToday, tasksSoon, votesNeeded, pollsNeeded, meetingsSoon, newTasks };
}

export function unreadCount() {
  return state.notifications.filter((n) => !n.read_at).length;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const signIn = (email, password) => q(sb.auth.signInWithPassword({ email, password }));
export const signUp = (email, password, fullName) => q(sb.auth.signUp({
  email, password, options: { data: { full_name: fullName }, emailRedirectTo: location.origin + '/' },
}));
export const sendReset = (email) => q(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/#/reset' }));
export const setPassword = (password) => q(sb.auth.updateUser({ password }));
export const signOut = () => sb.auth.signOut();

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export async function updateMyProfile(patch) {
  await q(sb.from('profiles').update(patch).eq('id', myId()));
  await loadMe();
  await refresh('profiles');
}
export async function setMember(id, role, status) {
  await q(sb.rpc('admin_set_member', { p_user_id: id, p_role: role, p_status: status }));
  await refresh('profiles');
}

export async function createTask(task) {
  const row = await q(sb.from('tasks').insert({ ...task, created_by: myId() }).select().single());
  await markSeen('task', row.id);
  await refresh('tasks');
  return row;
}
export async function updateTask(id, patch) {
  await q(sb.from('tasks').update(patch).eq('id', id));
  await refresh('tasks');
}
export async function deleteTask(id) {
  await q(sb.from('tasks').delete().eq('id', id)); // comments + attachment links are removed by the database
  await refresh('tasks', 'links');
}

export const listComments = (type, id) => q(sb.from('comments').select('*').eq('entity_type', type).eq('entity_id', id)
  .order('created_at', { ascending: true }));
export const addComment = (type, id, body) => q(sb.from('comments').insert({ entity_type: type, entity_id: id, body, created_by: myId() }));
export const editComment = (id, body) => q(sb.from('comments').update({ body, edited_at: new Date().toISOString() }).eq('id', id));
export const deleteComment = (id) => q(sb.from('comments').delete().eq('id', id));
export async function commentCounts(type) {
  const rows = (await q(sb.from('comments').select('entity_id').eq('entity_type', type).limit(10000))) || [];
  const m = new Map();
  for (const r of rows) m.set(r.entity_id, (m.get(r.entity_id) || 0) + 1);
  return m;
}

export async function createUpdate(u) {
  const row = await q(sb.from('updates').insert({ ...u, created_by: myId() }).select().single());
  await markSeen('update', row.id);
  await refresh('updates');
  return row;
}
export async function saveUpdate(id, patch) { await q(sb.from('updates').update(patch).eq('id', id)); await refresh('updates'); }
export async function deleteUpdate(id) { await q(sb.from('updates').delete().eq('id', id)); await refresh('updates'); }

export async function createMinute(m) {
  const row = await q(sb.from('minutes').insert({ ...m, created_by: myId() }).select().single());
  await markSeen('minute', row.id);
  await refresh('minutes');
  return row;
}
export async function saveMinute(id, patch) { await q(sb.from('minutes').update(patch).eq('id', id)); await refresh('minutes'); }
export async function deleteMinute(id) { await q(sb.from('minutes').delete().eq('id', id)); await refresh('minutes', 'tasks'); }

// Documents ------------------------------------------------------------------
function safeName(name) {
  return name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(-120) || 'file';
}
export async function uploadFiles(files, { category = 'general', description = '', linkTo = null } = {}) {
  const out = [];
  for (const file of files) {
    const path = `${myId()}/${crypto.randomUUID()}-${safeName(file.name)}`;
    await q(sb.storage.from('documents').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }));
    const row = await q(sb.from('documents').insert({
      name: file.name.slice(0, 255), storage_path: path, mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size, category, description, created_by: myId(),
    }).select().single());
    if (linkTo) await q(sb.from('entity_documents').insert({ entity_type: linkTo.type, entity_id: linkTo.id, document_id: row.id, added_by: myId() }));
    out.push(row);
  }
  await refresh('documents', 'links');
  return out;
}
export async function linkDocument(type, id, documentId) {
  await q(sb.from('entity_documents').upsert({ entity_type: type, entity_id: id, document_id: documentId, added_by: myId() },
    { onConflict: 'entity_type,entity_id,document_id', ignoreDuplicates: true }));
  await refresh('links');
}
export async function unlinkDocument(type, id, documentId) {
  await q(sb.from('entity_documents').delete().eq('entity_type', type).eq('entity_id', id).eq('document_id', documentId));
  await refresh('links');
}
export async function deleteDocument(doc) {
  await q(sb.storage.from('documents').remove([doc.storage_path]));
  await q(sb.from('documents').delete().eq('id', doc.id));
  await refresh('documents', 'links');
}
export async function updateDocument(id, patch) { await q(sb.from('documents').update(patch).eq('id', id)); await refresh('documents'); }
export async function signedUrl(doc, download = false) {
  const data = await q(sb.storage.from('documents').createSignedUrl(doc.storage_path, 3600, download ? { download: doc.name } : undefined));
  return data.signedUrl;
}

// Decisions -------------------------------------------------------------------
export async function createDecision(d) {
  const id = await q(sb.rpc('create_decision', {
    p_title: d.title, p_description: d.description, p_urgency: d.urgency, p_deadline: d.deadline,
    p_participants: d.participants, p_minute_id: d.minute_id || null,
  }));
  await markSeen('decision', id);
  await refresh('decisions', 'decisionParticipants');
  return id;
}
export async function castVote(id, choice, statement = '') {
  const result = await q(sb.rpc('cast_vote', { p_decision_id: id, p_choice: choice, p_statement: statement }));
  await refresh('decisions', 'votes');
  return result;
}
export async function cancelDecision(id) { await q(sb.rpc('cancel_decision', { p_decision_id: id })); await refresh('decisions', 'votes'); }
export const decisionTally = (id) => q(sb.rpc('decision_tally', { p_decision_id: id }));
export const decisionHasVotes = (id) => q(sb.rpc('decision_has_votes', { p_decision_id: id }));
export async function saveDecision(id, patch) { await q(sb.from('decisions').update(patch).eq('id', id)); await refresh('decisions'); }

// Meetings ----------------------------------------------------------------------
export async function createMeeting(m) {
  const id = await q(sb.rpc('create_meeting', {
    p_title: m.title, p_kind: m.kind, p_agenda: m.agenda, p_duration: m.duration_minutes, p_location: m.location,
    p_participants: m.participants, p_slots: m.slots,
  }));
  await markSeen('meeting', id);
  await refresh('meetings', 'meetingParticipants', 'slots');
  return id;
}
export async function respondSlot(slotId, answer) {
  await q(sb.from('meeting_responses').upsert({ slot_id: slotId, user_id: myId(), answer, updated_at: new Date().toISOString() },
    { onConflict: 'slot_id,user_id' }));
  await refresh('responses');
}
export async function addSlot(meetingId, startsAt) {
  await q(sb.from('meeting_slots').insert({ meeting_id: meetingId, starts_at: startsAt, created_by: myId() }));
  await refresh('slots');
}
export async function deleteSlot(id) { await q(sb.from('meeting_slots').delete().eq('id', id)); await refresh('slots', 'responses'); }
export async function scheduleMeeting(mid, slotId) { await q(sb.rpc('schedule_meeting', { p_meeting_id: mid, p_slot_id: slotId })); await refresh('meetings'); }
export async function sendMeetingLink(mid, link) { await q(sb.rpc('send_meeting_link', { p_meeting_id: mid, p_link: link })); await refresh('meetings'); }
export async function setMeetingStatus(mid, status) { await q(sb.rpc('set_meeting_status', { p_meeting_id: mid, p_status: status })); await refresh('meetings'); }
export async function saveMeeting(id, patch) { await q(sb.from('meetings').update(patch).eq('id', id)); await refresh('meetings'); }
export async function deleteMeeting(id) {
  await q(sb.from('meetings').delete().eq('id', id));
  await refresh('meetings', 'meetingParticipants', 'slots', 'responses');
}

// Notifications & read markers ------------------------------------------------
export async function markSeen(type, id) {
  if (!state.reads.has(type + ':' + id)) state.reads.add(type + ':' + id);
  const hadUnread = state.notifications.some((n) => n.entity_type === type && n.entity_id === id && !n.read_at);
  for (const n of state.notifications) if (n.entity_type === type && n.entity_id === id && !n.read_at) n.read_at = new Date().toISOString();
  try {
    await q(sb.rpc('mark_seen', { p_entity_type: type, p_entity_id: id }));
  } catch (e) { console.warn(e); }
  if (hadUnread) emit('notifications');
  if (type === 'update' || type === 'minute') loadReads().then(() => emit('reads'));
}
export async function markNotificationRead(id) {
  const n = state.notifications.find((x) => x.id === id);
  if (n && !n.read_at) n.read_at = new Date().toISOString();
  await q(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id));
  emit('notifications');
}
export async function markAllRead() {
  const now = new Date().toISOString();
  for (const n of state.notifications) if (!n.read_at) n.read_at = now;
  await q(sb.from('notifications').update({ read_at: now }).eq('user_id', myId()).is('read_at', null));
  emit('notifications');
}

export async function savePushSubscription(sub) {
  const j = sub.toJSON();
  await q(sb.from('push_subscriptions').upsert({
    endpoint: j.endpoint, user_id: myId(), p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300),
  }, { onConflict: 'endpoint' }));
}
export async function deletePushSubscription(endpoint) {
  await q(sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
}

export { emit };
