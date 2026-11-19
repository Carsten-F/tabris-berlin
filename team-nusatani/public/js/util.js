// Small DOM, formatting and dialog helpers (no framework).
import { t, getLang } from './i18n.js';

/** Create an element: h('div.card#id', {onclick, class, ...}, children...) */
export function h(tag, attrs, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => {
    if (k === '.') el.classList.add(v); else el.id = v;
  });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = v; // only ever used with sanitized HTML
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// ---------------------------------------------------------------------------
// Rich text sanitising (DOMPurify is loaded globally from /vendor)
// ---------------------------------------------------------------------------
const PURIFY_CFG = {
  ALLOWED_TAGS: ['p', 'br', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li', 'blockquote', 'a', 'mark', 'code', 'pre', 'hr', 'span', 'sub', 'sup', 'table', 'thead',
    'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'data-checked', 'class'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
};
let hooked = false;
export function sanitize(html) {
  const P = window.DOMPurify;
  if (!P) return esc(String(html || ''));
  if (!hooked) {
    P.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      if (node.hasAttribute && node.hasAttribute('class')) {
        const keep = node.getAttribute('class').split(/\s+/).filter((c) => c === 'checklist' || c === 'done');
        if (keep.length) node.setAttribute('class', keep.join(' ')); else node.removeAttribute('class');
      }
    });
    hooked = true;
  }
  return P.sanitize(String(html || ''), PURIFY_CFG);
}

export function richText(html, cls = '') {
  return h('div.rich' + (cls ? '.' + cls : ''), { html: sanitize(html) });
}

export function plainText(html) {
  const d = document.createElement('div');
  d.innerHTML = sanitize(html);
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function isEmptyHtml(html) {
  return !plainText(html) && !/<(img|hr)/i.test(html || '');
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const locale = () => (getLang() === 'ms' ? 'ms-MY' : 'en-GB');
export const TEAM_TZ = 'Asia/Kuala_Lumpur';

export function fmtDate(d, opts = {}) {
  if (!d) return '';
  const date = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00') : new Date(d);
  return date.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', ...opts });
}
export function fmtDateTime(d, opts = {}) {
  if (!d) return '';
  return new Date(d).toLocaleString(locale(), {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...opts,
  });
}
export function fmtTime(d, tz) {
  return new Date(d).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: tz });
}
export function localTzName() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; }
}
/** "Kuala Lumpur 15:00" when the user is in a different time zone, else '' */
export function teamTimeHint(d) {
  if (!d || localTzName() === TEAM_TZ) return '';
  return `${t('time.kl')} ${new Date(d).toLocaleString(locale(), { timeZone: TEAM_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' })}`;
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** value for <input type="datetime-local"> */
export function toLocalInput(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}
export function relTime(d) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(d);
}
/** due-date state of a task: overdue | today | soon | later | none */
export function dueState(due, status) {
  if (!due || status === 'done') return 'none';
  const today = todayISO();
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDaysISO(3)) return 'soon';
  return 'later';
}
export function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, stroke style)
// ---------------------------------------------------------------------------
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  vote: 'M4 12l5 5L20 6',
  ballot: 'M5 4h14v16H5zM8 9l2 2 4-4M8 15h8',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  minutes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  updates: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  folder: 'M3 6h6l2 2h10v11H3z',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2 3 5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  clip: 'M20 11l-8 8a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-2-2l8-8',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  comment: 'M4 5h16v11H9l-5 4z',
  check: 'M5 12l5 5L20 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  video: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  print: 'M6 9V3h12v6M6 17H4v-7h16v7h-2M7 14h10v7H7z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  pin: 'M9 3h6l-1 6 4 4H6l4-4zM12 13v8',
  phone: 'M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  install: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
};
export function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.file);
  svg.append(p);
  return svg;
}

// ---------------------------------------------------------------------------
// Toasts and dialogs
// ---------------------------------------------------------------------------
export function toast(message, opts = {}) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div#toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const el = h('div.toast' + (opts.type ? '.toast-' + opts.type : ''),
    opts.title ? h('strong', opts.title) : null,
    h('span', message),
    opts.action ? h('button.btn.btn-small', { onclick: () => { opts.action.run(); el.remove(); } }, opts.action.label) : null,
    h('button.toast-x', { 'aria-label': t('common.close'), onclick: () => el.remove() }, icon('close', 16)));
  box.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, opts.duration || (opts.action ? 9000 : 4000));
}

export function showError(err) {
  console.error(err);
  const msg = (err && (err.message || err.error_description)) || String(err);
  toast(translateError(msg), { type: 'error', duration: 7000 });
}

function translateError(msg) {
  const map = [
    [/already voted/i, 'err.alreadyVoted'],
    [/voting is closed/i, 'err.votingClosed'],
    [/not a participant/i, 'err.notParticipant'],
    [/after the first vote/i, 'err.lockedAfterVote'],
    [/deadline must be in the future/i, 'err.deadlineFuture'],
    [/row-level security|not allowed|permission denied/i, 'err.notAllowed'],
    [/Invalid login credentials/i, 'err.login'],
    [/Email not confirmed/i, 'err.emailNotConfirmed'],
    [/Failed to fetch|NetworkError|Load failed/i, 'err.offline'],
    [/https:\/\//i, 'err.https'],
    [/at least one participant/i, 'err.participants'],
    [/at least one time/i, 'err.slots'],
    [/Password should be/i, 'err.password'],
  ];
  for (const [re, key] of map) if (re.test(msg)) return t(key);
  return msg;
}

/** Modal dialog. content: Node or (close) => Node. Returns {close, el}. */
export function modal(title, content, opts = {}) {
  const prevFocus = document.activeElement;
  const close = (val) => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (opts.onClose) opts.onClose(val);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const body = typeof content === 'function' ? content(close) : content;
  const dialog = h('div.modal' + (opts.wide ? '.modal-wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.modal-head', h('h2', title),
      h('button.icon-btn', { 'aria-label': t('common.close'), onclick: () => close() }, icon('close'))),
    h('div.modal-body', body));
  const overlay = h('div.overlay', { onmousedown: (e) => { if (e.target === overlay && !opts.sticky) close(); } }, dialog);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  setTimeout(() => {
    overlay.classList.add('show');
    const f = dialog.querySelector('[autofocus], input:not([type=hidden]), textarea, [contenteditable], select, button.btn-primary');
    if (f) f.focus();
  }, 10);
  return { close, el: dialog };
}

export function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(opts.title || t('common.confirm'), (close) => h('div',
      h('p.confirm-text', message),
      opts.detail ? h('p.muted', opts.detail) : null,
      h('div.form-actions',
        h('button.btn', { onclick: () => { done = true; close(); resolve(false); } }, t('common.cancel')),
        h('button.btn' + (opts.danger ? '.btn-danger' : '.btn-primary'), { onclick: () => { done = true; close(); resolve(true); } },
          opts.ok || t('common.ok')))), { onClose: () => { if (!done) resolve(false); } });
    return m;
  });
}

/** Run an async action with a busy button and error toast */
export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  try {
    return await fn();
  } catch (e) {
    showError(e);
    return undefined;
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
  }
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------
export function field(label, input, hint) {
  const id = input.id || 'f' + Math.random().toString(36).slice(2, 9);
  if (!input.id && input.tagName) input.id = id;
  return h('div.field', h('label', { for: input.tagName ? id : undefined }, label), input, hint ? h('small.hint', hint) : null);
}
export function select(options, value, attrs = {}) {
  return h('select', attrs, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
}

export function initials(name) {
  return String(name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
}
const AV_COLORS = ['#1F5F4A', '#2D6A93', '#8A5A2B', '#6B4C9A', '#3FA39A', '#A0453B'];
export function avatar(profile, size = 32) {
  const name = profile ? profile.full_name || profile.email : '?';
  let hsh = 0;
  for (const c of String(profile ? profile.id : '')) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return h('span.avatar', {
    title: name,
    style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.4) + 'px', background: AV_COLORS[hsh % AV_COLORS.length] },
  }, initials(name));
}

export function chip(text, kind = '') {
  return h('span.chip' + (kind ? '.chip-' + kind : ''), text);
}
export function newBadge() {
  return h('span.badge-new', t('common.new'));
}

export function emptyState(text, action) {
  return h('div.empty', h('p', text), action || null);
}

export function debounce(fn, ms = 250) {
  let tm;
  return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
