// Team Nusatani – app shell, login and router
import { t, getLang, setLang, applyStaticTexts } from './i18n.js';
import { h, clear, icon, toast, showError, busy, field, modal, avatar } from './util.js';
import * as S from './store.js';
import { startNotifications, stopNotifications, showStartPopup, openNotificationPanel, updateBadges } from './notify.js';
import { initInstall } from './pwa.js';

import * as home from './views/home.js';
import * as tasks from './views/tasks.js';
import * as decisions from './views/decisions.js';
import * as meetings from './views/meetings.js';
import * as minutes from './views/minutes.js';
import * as updates from './views/updates.js';
import * as documents from './views/documents.js';
import * as team from './views/team.js';
import * as settings from './views/settings.js';
import * as search from './views/search.js';

const ROUTES = {
  home: { view: home, icon: 'home', label: 'nav.home' },
  tasks: { view: tasks, icon: 'tasks', label: 'nav.tasks' },
  decisions: { view: decisions, icon: 'ballot', label: 'nav.decisions' },
  meetings: { view: meetings, icon: 'calendar', label: 'nav.meetings' },
  minutes: { view: minutes, icon: 'minutes', label: 'nav.minutes' },
  updates: { view: updates, icon: 'updates', label: 'nav.updates' },
  documents: { view: documents, icon: 'folder', label: 'nav.documents' },
  team: { view: team, icon: 'team', label: 'nav.team' },
  settings: { view: settings, icon: 'settings', label: 'nav.settings' },
  search: { view: search, icon: 'search', label: 'nav.search', hidden: true },
};
const MOBILE_TABS = ['home', 'tasks', 'decisions', 'meetings'];

const root = document.getElementById('app');
let current = { name: null, id: null, cleanup: null, repaint: null };
let recoveryMode = /type=recovery/.test(location.hash) || location.hash.startsWith('#/reset');

export function go(path) {
  if (location.hash === '#' + path) route();
  else location.hash = path;
}
window.TeamApp = { go };

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [name, id] = path.split('/');
  return { name: ROUTES[name] ? name : 'home', id: id || null, query: new URLSearchParams(qs || '') };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  applyStaticTexts();
  try {
    await S.initClient();
  } catch (e) {
    clear(root).append(h('div.center-screen', h('p', t('err.start')), h('pre', String(e))));
    return;
  }
  const { data } = await S.sb.auth.getSession();
  S.state.session = data.session;
  S.sb.auth.onAuthStateChange((event, session) => {
    const had = !!S.state.session;
    S.state.session = session;
    if (event === 'PASSWORD_RECOVERY') { recoveryMode = true; renderAuth('reset'); return; }
    if (event === 'SIGNED_OUT') { stopNotifications(); S.state.me = null; renderAuth('login'); return; }
    if (event === 'SIGNED_IN' && !had) setTimeout(start, 0);
  });
  initInstall();
  window.addEventListener('hashchange', () => { if (S.state.me && S.state.me.status === 'active') route(); });
  if (recoveryMode && S.state.session) return renderAuth('reset');
  if (S.state.session) start(); else renderAuth('login');
}

async function start() {
  if (recoveryMode) return renderAuth('reset');
  clear(root).append(h('div.center-screen', h('div.spinner'), h('p.muted', t('common.loading'))));
  try {
    const me = await S.loadMe();
    if (!me) { renderAuth('login'); return; }
    if (me.lang && me.lang !== getLang()) setLang(me.lang, false);
    if (me.status !== 'active') { renderPending(me); return; }
    await S.loadAll();
  } catch (e) {
    showError(e);
    clear(root).append(h('div.center-screen', h('p', t('err.start')),
      h('button.btn.btn-primary', { onclick: () => location.reload() }, t('common.retry')),
      h('button.btn', { onclick: () => S.signOut() }, t('settings.signOut'))));
    return;
  }
  renderShell();
  route();
  startNotifications({ onChange: () => repaint() });
  setTimeout(showStartPopup, 600);
}

// ---------------------------------------------------------------------------
// Login, sign-up, password reset, pending
// ---------------------------------------------------------------------------
function authFrame(...content) {
  return h('div.auth',
    h('div.auth-card',
      h('div.auth-brand', h('img', { src: 'icons/icon-192.png', alt: '', width: 64, height: 64 }),
        h('div', h('h1', 'Team Nusatani'), h('p.muted', t('auth.tagline')))),
      ...content,
      h('div.auth-lang', langToggle())));
}

export function langToggle() {
  return h('div.lang-toggle', { role: 'group', 'aria-label': t('settings.language') },
    ['en', 'ms'].map((l) => h('button' + (getLang() === l ? '.on' : ''), {
      type: 'button', 'aria-pressed': String(getLang() === l),
      onclick: async () => {
        setLang(l); // fires "team:lang" → rerenderAll()
        if (S.state.me) { try { await S.updateMyProfile({ lang: l }); } catch (e) { console.warn(e); } }
      },
    }, l === 'en' ? 'EN' : 'BM')));
}

let authMode = 'login';
function renderAuth(mode = authMode) {
  authMode = mode;
  stopNotifications();
  const email = h('input', { type: 'email', autocomplete: 'email', required: true, placeholder: 'name@nusatani.com' });
  const pass = h('input', { type: 'password', autocomplete: mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password', required: true, minLength: 8 });
  const name = h('input', { type: 'text', autocomplete: 'name', required: true });
  const msg = h('div.auth-msg');

  let form;
  if (mode === 'login') {
    const btn = h('button.btn.btn-primary.btn-block', { type: 'submit' }, t('auth.signIn'));
    form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => { await S.signIn(email.value.trim(), pass.value); });
      },
    }, field(t('auth.email'), email), field(t('auth.password'), pass), btn,
    h('div.auth-links',
      h('button.link', { type: 'button', onclick: () => renderAuth('forgot') }, t('auth.forgot')),
      h('button.link', { type: 'button', onclick: () => renderAuth('signup') }, t('auth.noAccount'))));
    if (S.DEMO) {
      form.append(h('div.demo-box', h('strong', t('demo.title')), h('p', t('demo.text')),
        ['Carsten (Admin)', 'Ahmad', 'Siti'].map((n, i) => h('button.btn.btn-small', {
          type: 'button',
          onclick: () => S.signIn(['carsten@nusatani.com', 'ahmad@nusatani.com', 'siti@nusatani.com'][i], 'demo-demo').catch(showError),
        }, n))));
    }
  } else if (mode === 'signup') {
    const btn = h('button.btn.btn-primary.btn-block', { type: 'submit' }, t('auth.createAccount'));
    form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          const res = await S.signUp(email.value.trim(), pass.value, name.value.trim());
          clear(msg).append(h('p.ok', res && res.session ? t('auth.signupDoneSession') : t('auth.signupDone')));
          form.querySelectorAll('input,button[type=submit]').forEach((x) => { x.disabled = true; });
        });
      },
    }, field(t('auth.fullName'), name), field(t('auth.email'), email), field(t('auth.password'), pass, t('auth.passwordHint')), btn, msg,
    h('div.auth-links', h('button.link', { type: 'button', onclick: () => renderAuth('login') }, t('auth.haveAccount'))));
  } else if (mode === 'forgot') {
    const btn = h('button.btn.btn-primary.btn-block', { type: 'submit' }, t('auth.sendLink'));
    form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => { await S.sendReset(email.value.trim()); clear(msg).append(h('p.ok', t('auth.linkSent'))); });
      },
    }, h('p.muted', t('auth.forgotText')), field(t('auth.email'), email), btn, msg,
    h('div.auth-links', h('button.link', { type: 'button', onclick: () => renderAuth('login') }, t('auth.back'))));
  } else if (mode === 'reset') {
    const btn = h('button.btn.btn-primary.btn-block', { type: 'submit' }, t('auth.savePassword'));
    form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          await S.setPassword(pass.value);
          recoveryMode = false;
          history.replaceState(null, '', location.pathname);
          toast(t('auth.passwordSaved'), { type: 'ok' });
          start();
        });
      },
    }, h('p.muted', t('auth.newPasswordText')), field(t('auth.newPassword'), pass, t('auth.passwordHint')), btn);
  }
  clear(root).append(authFrame(h('h2.auth-title', t('auth.title.' + mode)), form));
}

function renderPending(me) {
  clear(root).append(authFrame(
    h('h2.auth-title', me.status === 'disabled' ? t('auth.disabledTitle') : t('auth.pendingTitle')),
    h('p', me.status === 'disabled' ? t('auth.disabledText') : t('auth.pendingText')),
    h('p.muted', me.email),
    h('div.form-actions',
      h('button.btn', { onclick: () => S.signOut() }, t('settings.signOut')),
      h('button.btn.btn-primary', { onclick: () => start() }, t('auth.checkAgain')))));
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
let mainEl;
let shellEls = {};
function renderShell() {
  const nav = h('nav.sidebar', { 'aria-label': t('nav.main') },
    h('a.brand', { href: '#/home' }, h('img', { src: 'icons/icon-192.png', alt: '', width: 36, height: 36 }), h('span', 'Team Nusatani')),
    h('div.nav-list', Object.entries(ROUTES).filter(([, r]) => !r.hidden).map(([name, r]) =>
      h('a.nav-item', { href: '#/' + name, 'data-route': name }, icon(r.icon), h('span', t(r.label)), h('span.nav-count', { 'data-count': name })))),
    h('div.sidebar-foot', h('a.me', { href: '#/settings' }, avatar(S.state.me, 30), h('span', S.state.me.full_name || S.state.me.email))));

  const searchInput = h('input.search-input', {
    type: 'search', placeholder: t('search.placeholder'), 'aria-label': t('nav.search'),
    onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) go('/search?q=' + encodeURIComponent(e.target.value.trim())); },
  });
  const bell = h('button.icon-btn.bell', { 'aria-label': t('notif.title'), onclick: () => openNotificationPanel() }, icon('bell', 22), h('span.bell-count', { hidden: true }));
  const top = h('header.topbar',
    h('a.top-brand', { href: '#/home' }, h('img', { src: 'icons/icon-192.png', alt: '', width: 30, height: 30 }), h('span', 'Team Nusatani')),
    h('div.top-title'),
    h('div.top-search', icon('search', 18), searchInput),
    h('button.icon-btn.top-search-btn', { 'aria-label': t('nav.search'), onclick: () => go('/search') }, icon('search', 22)),
    langToggle(),
    bell);

  const tabs = h('nav.tabbar', { 'aria-label': t('nav.main') },
    MOBILE_TABS.map((name) => h('a.tab', { href: '#/' + name, 'data-route': name }, icon(ROUTES[name].icon, 24), h('span', t(ROUTES[name].label)), h('span.nav-count', { 'data-count': name }))),
    h('button.tab', { type: 'button', 'data-route': 'more', onclick: openMore }, icon('more', 24), h('span', t('nav.more')), h('span.nav-count', { 'data-count': 'more' })));

  mainEl = h('main#main', { tabindex: '-1' });
  shellEls = { nav, top, tabs, bell };
  clear(root).append(h('div.shell', nav, h('div.content', top, mainEl), tabs));
  updateBadges();
}

function openMore() {
  const items = ['minutes', 'updates', 'documents', 'team', 'search', 'settings'];
  modal(t('nav.more'), (close) => h('div.more-grid', items.map((name) => h('a.more-item', {
    href: '#/' + name, onclick: () => close(),
  }, icon(ROUTES[name].icon, 28), h('span', t(ROUTES[name].label)), h('span.nav-count', { 'data-count': name }))), h('div.more-lang', langToggle())));
  updateBadges();
}

function route() {
  if (!mainEl) return;
  const { name, id, query } = parseHash();
  if (current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  current = { name, id, cleanup: null, repaint: null };
  document.querySelectorAll('[data-route]').forEach((a) => {
    const on = a.dataset.route === name || (a.dataset.route === 'more' && !MOBILE_TABS.includes(name));
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const title = shellEls.top.querySelector('.top-title');
  title.textContent = t(ROUTES[name].label);
  document.title = `${t(ROUTES[name].label)} · Team Nusatani`;
  clear(mainEl);
  mainEl.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    const res = ROUTES[name].view.render(mainEl, { id, query, go }) || {};
    current.cleanup = res.cleanup || null;
    current.repaint = res.repaint || null;
  } catch (e) {
    showError(e);
  }
  updateBadges();
}

/** data changed → update the visible view without losing typed text */
function repaint() {
  updateBadges();
  if (!mainEl) return;
  if (current.repaint) current.repaint();
}
S.onChange(() => repaint());

function rerenderAll() {
  applyStaticTexts();
  if (S.state.me && S.state.me.status === 'active' && S.state.loaded) { renderShell(); route(); }
  else if (S.state.me) renderPending(S.state.me);
  else renderAuth();
}
window.addEventListener('team:lang', rerenderAll);

boot();
