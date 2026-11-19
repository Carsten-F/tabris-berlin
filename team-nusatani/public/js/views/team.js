// Team directory (contact cards) and member administration for the admin
import { t } from '../i18n.js';
import { h, clear, icon, avatar, busy, chip, fmtDate, confirmDialog, toast } from '../util.js';
import * as S from '../store.js';
import { pageHead } from './common.js';

export function render(main) {
  const list = h('div.team-grid');
  const admin = h('div');
  main.append(pageHead(t('nav.team')), h('p.page-intro', t('team.intro')), list, admin);

  function paint() {
    clear(list);
    for (const p of S.activeProfiles()) list.append(card(p));
    clear(admin);
    if (!S.isAdmin()) return;
    const pending = S.state.profiles.filter((p) => p.status === 'pending');
    const others = S.state.profiles.filter((p) => p.status !== 'pending');
    admin.append(h('section.panel.admin-panel',
      h('h2', icon('settings', 18), t('team.admin')),
      h('p.muted', t('team.adminIntro')),
      h('h3', t('team.pending'), pending.length ? chip(String(pending.length), 'action') : null),
      pending.length ? h('div.member-list', pending.map((p) => memberRow(p, true))) : h('p.muted.small', t('team.noPending')),
      h('h3', t('team.members')),
      h('div.member-list', others.map((p) => memberRow(p, false))),
      h('p.muted.small', t('team.inviteHint', { url: location.origin }))));
  }
  paint();
  return { repaint: paint };
}

function card(p) {
  const phone = (p.phone || '').replace(/[^\d+]/g, '');
  return h('div.card.person-card',
    avatar(p, 56),
    h('div.person-info',
      h('strong', p.full_name || p.email, p.role === 'admin' ? h('span.chip.chip-info', 'Admin') : null),
      h('div.muted', p.job_title || ''),
      h('div.contact-links',
        h('a', { href: 'mailto:' + p.email }, icon('mail', 16), p.email),
        phone ? h('a', { href: 'tel:' + phone }, icon('phone', 16), p.phone) : null,
        phone ? h('a', { href: 'https://wa.me/' + phone.replace(/^\+/, ''), target: '_blank', rel: 'noopener' }, icon('comment', 16), 'WhatsApp') : null)));
}

function memberRow(p, isPending) {
  const self = p.id === S.myId();
  return h('div.member-row',
    avatar(p, 32),
    h('div.row-main', h('strong', p.full_name || p.email), h('div.muted.small', `${p.email} · ${t('team.since', { date: fmtDate(p.created_at) })}`)),
    chip(t('team.status.' + p.status), p.status === 'active' ? 'ok' : p.status === 'pending' ? 'action' : 'muted'),
    p.role === 'admin' ? chip('Admin', 'info') : null,
    self ? h('span.muted.small', t('common.you')) : h('div.member-actions',
      isPending ? h('button.btn.btn-small.btn-primary', {
        type: 'button',
        onclick: (e) => busy(e.currentTarget, async () => { await S.setMember(p.id, 'member', 'active'); toast(t('team.approved', { name: p.full_name || p.email }), { type: 'ok' }); }),
      }, t('team.approve')) : null,
      p.status === 'active' ? h('button.btn.btn-small', {
        type: 'button',
        onclick: async (e) => {
          const btn = e.currentTarget;
          const role = p.role === 'admin' ? 'member' : 'admin';
          if (await confirmDialog(role === 'admin' ? t('team.makeAdminConfirm', { name: p.full_name }) : t('team.removeAdminConfirm', { name: p.full_name }))) {
            busy(btn, () => S.setMember(p.id, role, 'active'));
          }
        },
      }, p.role === 'admin' ? t('team.removeAdmin') : t('team.makeAdmin')) : null,
      p.status !== 'disabled' ? h('button.btn.btn-small.btn-ghost-danger', {
        type: 'button',
        onclick: async (e) => {
          const btn = e.currentTarget;
          if (await confirmDialog(isPending ? t('team.rejectConfirm', { name: p.full_name || p.email }) : t('team.disableConfirm', { name: p.full_name }), { danger: true, ok: isPending ? t('team.reject') : t('team.disable') })) {
            busy(btn, () => S.setMember(p.id, 'member', 'disabled'));
          }
        },
      }, isPending ? t('team.reject') : t('team.disable')) : h('button.btn.btn-small', {
        type: 'button', onclick: (e) => busy(e.currentTarget, () => S.setMember(p.id, 'member', 'active')),
      }, t('team.enable'))));
}
