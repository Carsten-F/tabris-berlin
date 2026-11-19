// Settings: language, profile, notifications, install as app, password, sign out
import { t } from '../i18n.js';
import { h, clear, icon, busy, toast, field, avatar } from '../util.js';
import * as S from '../store.js';
import { pageHead } from './common.js';
import { langToggle } from '../app.js';
import { canPrompt, promptInstall, isStandalone, isIOS, onInstallChange } from '../pwa.js';
import { notificationState, enableNotifications, sendTestNotification } from '../notify.js';

export function render(main) {
  const me = S.state.me;
  const name = h('input', { type: 'text', value: me.full_name, maxLength: 120, autocomplete: 'name' });
  const title = h('input', { type: 'text', value: me.job_title, maxLength: 120 });
  const phone = h('input', { type: 'tel', value: me.phone, maxLength: 40, autocomplete: 'tel', placeholder: '+60 12 345 6789' });
  const saveBtn = h('button.btn.btn-primary', { type: 'submit' }, t('common.save'));
  const installBox = h('div');
  const notifBox = h('div');

  const pass1 = h('input', { type: 'password', autocomplete: 'new-password', minLength: 8 });
  const passBtn = h('button.btn', { type: 'submit' }, t('settings.changePassword'));

  main.append(pageHead(t('nav.settings')),
    h('div.settings-grid',
      h('section.panel.settings-install', h('h2', icon('install', 20), t('settings.installTitle')), installBox),
      h('section.panel', h('h2', icon('bell', 20), t('settings.notifTitle')), notifBox),
      h('section.panel', h('h2', icon('globe', 20), t('settings.language')), h('p.muted', t('settings.languageHint')), langToggle()),
      h('section.panel',
        h('h2', icon('user', 20), t('settings.profile')),
        h('div.profile-head', avatar(me, 48), h('div', h('strong', me.email), h('div.muted.small', me.role === 'admin' ? 'Admin' : t('settings.member')))),
        h('form.form', {
          onsubmit: (e) => {
            e.preventDefault();
            busy(saveBtn, async () => {
              await S.updateMyProfile({ full_name: name.value.trim(), job_title: title.value.trim(), phone: phone.value.trim() });
              toast(t('common.saved'), { type: 'ok' });
            });
          },
        }, field(t('auth.fullName'), name), field(t('settings.jobTitle'), title), field(t('settings.phone'), phone, t('settings.phoneHint')),
        h('div.form-actions', saveBtn))),
      h('section.panel',
        h('h2', icon('settings', 20), t('settings.security')),
        h('form.form', {
          onsubmit: (e) => {
            e.preventDefault();
            if (pass1.value.length < 8) { toast(t('err.password'), { type: 'error' }); return; }
            busy(passBtn, async () => { await S.setPassword(pass1.value); pass1.value = ''; toast(t('auth.passwordSaved'), { type: 'ok' }); });
          },
        }, field(t('auth.newPassword'), pass1, t('auth.passwordHint')), h('div.form-actions', passBtn)),
        h('hr'),
        h('button.btn.btn-ghost-danger.btn-block', { type: 'button', onclick: () => S.signOut() }, icon('logout', 18), t('settings.signOut')))));

  function paintInstall() {
    clear(installBox);
    if (isStandalone()) {
      installBox.append(h('p.ok', icon('check', 16), t('settings.installed')));
    } else if (canPrompt()) {
      installBox.append(h('p.muted', t('settings.installText')),
        h('button.btn.btn-primary.btn-block.btn-big', { type: 'button', onclick: async () => { if (await promptInstall()) toast(t('settings.installDone'), { type: 'ok' }); } },
          icon('install', 20), t('settings.installButton')));
    } else if (isIOS()) {
      installBox.append(h('p.muted', t('settings.installText')), h('ol.steps', h('li', t('settings.ios1')), h('li', t('settings.ios2')), h('li', t('settings.ios3'))));
    } else {
      installBox.append(h('p.muted', t('settings.installText')),
        h('button.btn.btn-primary.btn-block.btn-big', { type: 'button', onclick: () => toast(t('settings.installManual'), { duration: 9000 }) }, icon('install', 20), t('settings.installButton')),
        h('p.muted.small', t('settings.installManual')));
    }
  }
  async function paintNotif() {
    const st = await notificationState();
    clear(notifBox);
    notifBox.append(h('p.muted', t('settings.notifText')));
    if (st.permission === 'unsupported') {
      notifBox.append(h('p.warn', isIOS() && !isStandalone() ? t('settings.notifIosInstall') : t('settings.notifUnsupported')));
      return;
    }
    if (st.permission === 'denied') {
      notifBox.append(h('p.warn', t('settings.notifDenied')));
      return;
    }
    if (st.permission === 'granted') {
      notifBox.append(h('p.ok', icon('check', 16), st.push ? t('settings.notifOnPush') : t('settings.notifOn')));
      if (!st.push && st.pushPossible) notifBox.append(h('button.btn', { type: 'button', onclick: (e) => busy(e.currentTarget, async () => { await enableNotifications(); paintNotif(); }) }, t('settings.notifEnablePush')));
      notifBox.append(h('button.btn', { type: 'button', onclick: () => sendTestNotification() }, t('settings.notifTest')));
    } else {
      notifBox.append(h('button.btn.btn-primary.btn-block.btn-big', {
        type: 'button',
        onclick: (e) => busy(e.currentTarget, async () => { await enableNotifications(); paintNotif(); }),
      }, icon('bell', 20), t('settings.notifEnable')));
    }
  }
  paintInstall();
  paintNotif();
  const off = onInstallChange(paintInstall);
  return { cleanup: off };
}
