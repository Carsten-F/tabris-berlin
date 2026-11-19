// Notifications: live pop-ups (Supabase Realtime + polling fallback), bell
// panel, start pop-up with everything urgent, desktop/mobile notifications
// and Web Push subscription.
import { t } from './i18n.js';
import { h, icon, toast, modal, relTime, fmtDateTime, clear, fmtDate } from './util.js';
import * as S from './store.js';

const CFG = window.TEAM_CONFIG || {};
let channel = null;
let pollTimer = null;
let refreshTimer = null;
let localTimer = null;
let onChangeCb = null;
const seenIds = new Set();

const ENTITY_ROUTE = { task: 'tasks', decision: 'decisions', meeting: 'meetings', minute: 'minutes', update: 'updates', profile: 'team' };

export function notifText(n) {
  const d = n.data || {};
  const p = { title: d.title || '', actor: d.actor || '', name: d.name || '',
    due: d.due ? fmtDate(d.due) : '', when: d.starts_at ? fmtDateTime(d.starts_at) : '', deadline: d.deadline ? fmtDateTime(d.deadline) : '',
    result: d.result ? t('dec.result.' + d.result) : '' };
  const key = 'notif.' + n.kind;
  const title = t(key + '.title', p);
  const body = t(key + '.body', p);
  const route = ENTITY_ROUTE[n.entity_type];
  const href = route ? (n.entity_id && route !== 'team' ? `#/${route}/${n.entity_id}` : `#/${route}`) : '#/home';
  return { title: title.startsWith('notif.') ? n.kind : title, body: body.startsWith('notif.') ? p.title : body, href };
}

const TABLES_FOR = {
  task: ['tasks'], decision: ['decisions', 'decisionParticipants', 'votes'], meeting: ['meetings', 'meetingParticipants', 'slots', 'responses'],
  minute: ['minutes', 'tasks'], update: ['updates'], profile: ['profiles'],
};

async function handleNew(n, live = true) {
  if (seenIds.has(n.id)) return;
  seenIds.add(n.id);
  if (!S.state.notifications.some((x) => x.id === n.id)) S.state.notifications.unshift(n);
  const tables = new Set([...(TABLES_FOR[n.entity_type] || []), 'links']);
  if (n.kind === 'comment') tables.clear();
  try { await S.refresh(...tables, 'notifications'); } catch (e) { console.warn(e); }
  if (!live) return;
  const txt = notifText(n);
  // a message about the item that is open right now is shown quietly
  const onItem = location.hash.startsWith(txt.href) && n.entity_id;
  toast(txt.body, { title: txt.title, action: onItem ? null : { label: t('common.open'), run: () => { location.hash = txt.href; } } });
  osNotify(txt.title, txt.body, txt.href, n.id);
}

async function osNotify(title, body, href, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag: String(tag), icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: href } };
    if (reg) reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (e) { console.warn(e); }
}

export function startNotifications({ onChange } = {}) {
  stopNotifications();
  onChangeCb = onChange;
  for (const n of S.state.notifications) seenIds.add(n.id);
  const uid = S.myId();
  try {
    channel = S.sb.channel('notif-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (payload) => handleNew(payload.new))
      .subscribe();
  } catch (e) { console.warn('realtime', e); }
  // fallback + catch-up: poll notifications every 45 s, refresh all data every 3 min
  pollTimer = setInterval(pollNow, 45000);
  refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') S.loadAll().catch(() => {}); }, 180000);
  localTimer = setInterval(localReminders, 60000);
  document.addEventListener('visibilitychange', onVisible);
  navigator.serviceWorker?.addEventListener('message', onSwMessage);
  localReminders();
}

async function pollNow() {
  try {
    const before = new Set(S.state.notifications.map((n) => n.id));
    await S.loadNotifications();
    const fresh = S.state.notifications.filter((n) => !before.has(n.id) && !seenIds.has(n.id));
    for (const n of fresh.reverse()) await handleNew(n, Date.now() - new Date(n.created_at).getTime() < 10 * 60000);
    updateBadges();
  } catch (e) { console.warn(e); }
}

function onVisible() {
  if (document.visibilityState === 'visible') { pollNow(); S.loadAll().catch(() => {}); }
}
function onSwMessage(e) {
  if (e.data && e.data.type === 'navigate' && e.data.url) location.hash = e.data.url.replace(/^.*#/, '#');
}

export function stopNotifications() {
  if (channel) { try { S.sb.removeChannel(channel); } catch { /* ignore */ } channel = null; }
  clearInterval(pollTimer);
  clearInterval(refreshTimer);
  clearInterval(localTimer);
  document.removeEventListener('visibilitychange', onVisible);
  navigator.serviceWorker?.removeEventListener('message', onSwMessage);
}

/** Meeting starts in ≤ 15 min → pop-up, even if the server reminder is not set up. */
function localReminders() {
  const me = S.myId();
  for (const m of S.state.meetings) {
    if (m.status !== 'scheduled' || !m.starts_at || !S.meetingParticipants(m.id).includes(me)) continue;
    const diff = new Date(m.starts_at).getTime() - Date.now();
    const key = 'tn-remind-' + m.id + '-' + m.starts_at;
    if (diff > 0 && diff <= 15 * 60000 && !sessionGet(key)) {
      sessionSet(key);
      const body = t('notif.meeting_soon.body', { title: m.title, when: fmtDateTime(m.starts_at) });
      toast(body, {
        title: t('notif.meeting_soon.title'), duration: 20000,
        action: m.video_link ? { label: t('meet.join'), run: () => window.open(m.video_link, '_blank', 'noopener') } : { label: t('common.open'), run: () => { location.hash = '#/meetings/' + m.id; } },
      });
      osNotify(t('notif.meeting_soon.title'), body, '#/meetings/' + m.id, 'meet-' + m.id);
    }
  }
}
function sessionGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionSet(k) { try { sessionStorage.setItem(k, '1'); } catch { /* ignore */ } }

// ---------------------------------------------------------------------------
// Badges and counters
// ---------------------------------------------------------------------------
export function updateBadges() {
  if (!S.state.me || !S.state.loaded) return;
  const a = S.attention();
  const me = S.myId();
  const unreadUpdates = S.state.updates.filter((u) => u.created_by !== me && S.isNew('update', u.id)).length;
  const unreadMinutes = S.state.minutes.filter((m) => m.created_by !== me && m.status === 'final' && S.isNew('minute', m.id)).length;
  const newDecisions = S.state.decisions.filter((d) => d.status === 'open' && d.created_by !== me && S.decisionParticipants(d.id).includes(me) && S.isNew('decision', d.id)).length;
  const counts = {
    home: 0,
    tasks: new Set([...a.newTasks, ...a.tasksOverdue, ...a.tasksToday].map((x) => x.id)).size,
    decisions: Math.max(a.votesNeeded.length, newDecisions),
    meetings: a.pollsNeeded.length + a.meetingsSoon.filter((m) => new Date(m.starts_at).toDateString() === new Date().toDateString()).length,
    updates: unreadUpdates,
    minutes: unreadMinutes,
    team: S.isAdmin() ? S.state.profiles.filter((p) => p.status === 'pending').length : 0,
  };
  counts.more = counts.updates + counts.minutes + counts.team;
  document.querySelectorAll('[data-count]').forEach((el) => {
    const n = counts[el.dataset.count] || 0;
    el.textContent = n ? String(n) : '';
    el.hidden = !n;
  });
  const unread = S.unreadCount();
  document.querySelectorAll('.bell-count').forEach((el) => { el.textContent = unread > 99 ? '99+' : String(unread); el.hidden = !unread; });
  const base = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = unread ? `(${unread}) ${base}` : base;
  try {
    if (navigator.setAppBadge) { if (unread) navigator.setAppBadge(unread); else navigator.clearAppBadge(); }
  } catch { /* not supported */ }
}

// ---------------------------------------------------------------------------
// Bell panel
// ---------------------------------------------------------------------------
export function openNotificationPanel() {
  modal(t('notif.title'), (close) => {
    const list = h('div.notif-list');
    const paint = () => {
      clear(list);
      if (!S.state.notifications.length) list.append(h('p.muted', t('notif.none')));
      for (const n of S.state.notifications.slice(0, 80)) {
        const txt = notifText(n);
        list.append(h('a.notif' + (n.read_at ? '' : '.unread'), {
          href: txt.href,
          onclick: () => { S.markNotificationRead(n.id).catch(() => {}); close(); },
        }, h('span.notif-dot'), h('div', h('strong', txt.title), h('div', txt.body), h('div.muted.small', relTime(n.created_at)))));
      }
    };
    paint();
    return h('div',
      h('div.form-actions.notif-actions', h('button.btn.btn-small', {
        type: 'button', onclick: async () => { await S.markAllRead(); paint(); updateBadges(); },
      }, icon('check', 16), t('notif.markAll'))),
      list);
  });
}

// ---------------------------------------------------------------------------
// Start pop-up: everything urgent at a glance (max. every 3 hours)
// ---------------------------------------------------------------------------
export function showStartPopup(force = false) {
  const a = S.attention();
  const items = [
    ...a.votesNeeded.map((d) => ['ballot', t('popup.vote'), d.title, '#/decisions/' + d.id, t('dec.closes') + ' ' + relTime(d.deadline), d.urgency === 'urgent' ? 'bad' : 'action']),
    ...a.pollsNeeded.map((m) => ['calendar', t('popup.poll'), m.title, '#/meetings/' + m.id, '', 'action']),
    ...a.meetingsSoon.filter((m) => new Date(m.starts_at).getTime() - Date.now() < 36 * 3600000)
      .map((m) => ['video', t('popup.meeting'), m.title, '#/meetings/' + m.id, fmtDateTime(m.starts_at), 'info']),
    ...a.tasksOverdue.map((x) => ['alert', t('popup.overdue'), x.title, '#/tasks/' + x.id, fmtDate(x.due_date), 'bad']),
    ...a.tasksToday.map((x) => ['clock', t('popup.today'), x.title, '#/tasks/' + x.id, '', 'warn']),
    ...a.newTasks.filter((x) => !a.tasksOverdue.includes(x) && !a.tasksToday.includes(x))
      .map((x) => ['tasks', t('popup.newTask'), x.title, '#/tasks/' + x.id, S.personName(x.created_by), 'info']),
  ];
  if (!items.length) return;
  let last = 0;
  try { last = Number(localStorage.getItem('tn-popup-' + S.myId()) || 0); } catch { /* ignore */ }
  if (!force && Date.now() - last < 3 * 3600000) return;
  try { localStorage.setItem('tn-popup-' + S.myId(), String(Date.now())); } catch { /* ignore */ }
  modal(t('popup.title'), (close) => h('div.popup',
    h('p.muted', t('popup.intro', { n: items.length })),
    h('div.popup-list', items.slice(0, 12).map(([ic, kind, title, href, meta, cls]) => h('a.popup-item.attn-' + cls, { href, onclick: () => close() },
      icon(ic, 20), h('div', h('span.popup-kind', kind), h('strong', title), meta ? h('span.muted.small', meta) : null)))),
    h('div.form-actions', h('button.btn.btn-primary', { type: 'button', onclick: () => close() }, t('popup.ok')))));
}

// ---------------------------------------------------------------------------
// Permissions and push
// ---------------------------------------------------------------------------
function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function notificationState() {
  if (!('Notification' in window)) return { permission: 'unsupported', push: false, pushPossible: false };
  const pushPossible = !!(CFG.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && !S.DEMO);
  let push = false;
  if (pushPossible && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      push = !!(reg && (await reg.pushManager.getSubscription()));
    } catch { /* ignore */ }
  }
  return { permission: Notification.permission, push, pushPossible };
}

export async function enableNotifications() {
  if (!('Notification' in window)) return false;
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') { toast(t('settings.notifDenied'), { type: 'error' }); return false; }
  const st = await notificationState();
  if (st.pushPossible && !st.push) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(CFG.vapidPublicKey) });
      await S.savePushSubscription(sub);
    } catch (e) {
      console.warn('push subscribe failed', e);
      toast(t('settings.notifPushFailed'), { type: 'error' });
    }
  }
  toast(t('settings.notifOn'), { type: 'ok' });
  return true;
}

export async function sendTestNotification() {
  const title = 'Team Nusatani';
  const body = t('settings.notifTestBody');
  if (!('Notification' in window) || Notification.permission !== 'granted') { toast(body); return; }
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'test', data: { url: '#/settings' } });
  else new Notification(title, { body });
}
