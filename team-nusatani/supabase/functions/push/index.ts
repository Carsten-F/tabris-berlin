// Team Nusatani – Web Push sender (Supabase Edge Function "push")
//
// Called by the database (trigger on public.notifications, via pg_net) with
//   POST { "notification_id": "<uuid>" }   header  x-push-secret: <PUSH_SECRET>
// Sends the notification to every browser/phone the recipient has subscribed.
//
// Secrets (supabase secrets set …):
//   PUSH_SECRET        same random string as app_private.settings('push_secret')
//   VAPID_PUBLIC_KEY   public key  (also in public/config.js)
//   VAPID_PRIVATE_KEY  private key (never in the browser!)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Deploy with:  supabase functions deploy push --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const TEXT: Record<string, { en: string; ms: string }> = {
  member_pending: { en: 'New registration', ms: 'Pendaftaran baharu' },
  member_approved: { en: 'Welcome – your account is approved', ms: 'Selamat datang – akaun anda diluluskan' },
  task_assigned: { en: 'New task for you', ms: 'Tugasan baharu untuk anda' },
  task_done: { en: 'Task completed', ms: 'Tugasan selesai' },
  task_due_soon: { en: 'Task due tomorrow', ms: 'Tugasan tamat esok' },
  task_due_today: { en: 'Task due today', ms: 'Tugasan tamat hari ini' },
  task_overdue: { en: 'Task overdue', ms: 'Tugasan lewat' },
  comment: { en: 'New comment', ms: 'Komen baharu' },
  update_posted: { en: 'New update', ms: 'Makluman baharu' },
  minutes_final: { en: 'New minutes', ms: 'Minit baharu' },
  decision_new: { en: 'Your vote is needed', ms: 'Undian anda diperlukan' },
  decision_closed: { en: 'Decision closed', ms: 'Keputusan ditutup' },
  decision_deadline: { en: 'Vote closes soon – you have not voted yet', ms: 'Undian akan ditutup – anda belum mengundi' },
  meeting_poll: { en: 'Meeting request – please choose times', ms: 'Jemputan mesyuarat – sila pilih masa' },
  meeting_scheduled: { en: 'Meeting scheduled', ms: 'Mesyuarat dijadualkan' },
  meeting_link: { en: 'Zoom link for your meeting', ms: 'Pautan Zoom untuk mesyuarat anda' },
  meeting_cancelled: { en: 'Meeting cancelled', ms: 'Mesyuarat dibatalkan' },
  meeting_soon: { en: 'Meeting starts soon', ms: 'Mesyuarat bermula tidak lama lagi' },
  meeting_tomorrow: { en: 'Meeting within 24 hours', ms: 'Mesyuarat dalam 24 jam' },
};
const ROUTE: Record<string, string> = { task: 'tasks', decision: 'decisions', meeting: 'meetings', minute: 'minutes', update: 'updates', profile: 'team' };

function when(iso: string | undefined, lang: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(lang === 'ms' ? 'ms-MY' : 'en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }) + ' (KL)';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('PUSH_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('forbidden', { status: 403 });

  let id = '';
  try { id = (await req.json()).notification_id; } catch { /* ignore */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('bad request', { status: 400 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: n } = await admin.from('notifications').select('*').eq('id', id).maybeSingle();
  if (!n) return new Response('not found', { status: 404 });
  const [{ data: prof }, { data: subs }] = await Promise.all([
    admin.from('profiles').select('lang').eq('id', n.user_id).maybeSingle(),
    admin.from('push_subscriptions').select('*').eq('user_id', n.user_id),
  ]);
  if (!subs || !subs.length) return Response.json({ sent: 0 });

  const lang = prof?.lang === 'ms' ? 'ms' : 'en';
  const d = n.data || {};
  const title = (TEXT[n.kind] || { en: 'Team Nusatani', ms: 'Team Nusatani' })[lang];
  const parts = [d.title ? `“${d.title}”` : '', d.name || '', when(d.starts_at || d.deadline, lang), d.actor ? `– ${d.actor}` : ''];
  const body = parts.filter(Boolean).join(' ');
  const route = ROUTE[n.entity_type];
  const url = route ? (n.entity_id && route !== 'team' ? `#/${route}/${n.entity_id}` : `#/${route}`) : '#/home';
  const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', n.user_id).is('read_at', null);

  webpush.setVapidDetails('https://team.nusatani.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url, tag: n.id, badge: count || 0 }),
        { TTL: 86400, urgency: ['decision_new', 'meeting_soon', 'task_overdue', 'decision_deadline'].includes(n.kind) ? 'high' : 'normal' },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.error('push failed', code, (e as Error).message);
    }
  }));
  return Response.json({ sent });
});
