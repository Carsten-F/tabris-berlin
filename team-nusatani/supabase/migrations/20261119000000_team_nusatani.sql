-- Team Nusatani – complete database schema
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Idempotent where practical; safe to re-run on an empty project.
--
-- Concepts
--   profiles            one row per login; status pending → active (approved by admin)
--   tasks / comments    to-dos with threaded comments
--   updates             information posts for everyone
--   minutes             meeting protocols (board meetings etc.)
--   documents           shared file store (Supabase Storage bucket "documents")
--   entity_documents    links documents to tasks, minutes, updates, decisions, meetings
--   decisions           binding votes (yes / no / own wording); secret until closed
--   meetings            scheduling with proposed times, agenda and video link
--   notifications       per-user inbox that drives pop-ups and push messages
--   reads               "seen" markers that drive the NEW badges
--
-- The very first admin is the address in app_private.settings('admin_email').

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Private settings (not exposed through the API)
-- ---------------------------------------------------------------------------
create schema if not exists app_private;
revoke all on schema app_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app_private from anon, authenticated';
  end if;
end $$;

create table if not exists app_private.settings (
  key   text primary key,
  value text not null
);
insert into app_private.settings (key, value) values
  ('admin_email', 'carsten@nusatani.com')
on conflict (key) do nothing;
-- Optional, for push messages while the app is closed (see README):
--   insert into app_private.settings values ('push_url', 'https://<ref>.supabase.co/functions/v1/push');
--   insert into app_private.settings values ('push_secret', '<random string, same as PUSH_SECRET of the function>');

create or replace function app_private.setting(k text) returns text
language sql stable security definer set search_path = app_private, pg_temp as
$$ select value from app_private.settings where key = k $$;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  job_title   text not null default 'Director',
  phone       text not null default '',
  role        text not null default 'member' check (role in ('admin', 'member')),
  status      text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  lang        text not null default 'en' check (lang in ('en', 'ms')),
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from profiles where id = auth.uid() and status = 'active') $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role = 'admin') $$;

create or replace function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  is_first_admin boolean := lower(new.email) = lower(coalesce(app_private.setting('admin_email'), ''));
begin
  insert into public.profiles (id, email, full_name, role, status, approved_at)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case when is_first_admin then 'admin' else 'member' end,
    case when is_first_admin then 'active' else 'pending' end,
    case when is_first_admin then now() end
  )
  on conflict (id) do nothing;

  if not is_first_admin then
    -- tell the admins that somebody is waiting for approval
    insert into public.notifications (user_id, kind, entity_type, entity_id, data)
    select p.id, 'member_pending', 'profile', new.id,
           jsonb_build_object('name', coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email))
    from public.profiles p where p.role = 'admin' and p.status = 'active';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Core content tables
-- ---------------------------------------------------------------------------
create table if not exists public.minutes (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 300),
  meeting_type text not null default 'board' check (meeting_type in ('board', 'management', 'other')),
  held_on      date not null default current_date,
  location     text not null default '',
  attendees    uuid[] not null default '{}',
  guests       text not null default '',
  body         text not null default '',
  resolutions  text not null default '',
  status       text not null default 'draft' check (status in ('draft', 'final')),
  meeting_id   uuid,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 300),
  description  text not null default '',
  assignee_id  uuid references public.profiles (id) on delete set null,
  due_date     date,
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status       text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  minute_id    uuid references public.minutes (id) on delete set null,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status);
create index if not exists tasks_minute_idx on public.tasks (minute_id);

create table if not exists public.updates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(title) between 1 and 300),
  body       text not null default '',
  pinned     boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('task', 'update', 'minute', 'decision', 'meeting')),
  entity_id   uuid not null,
  body        text not null check (length(body) between 1 and 50000),
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index if not exists comments_entity_idx on public.comments (entity_type, entity_id, created_at);

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 255),
  storage_path text not null unique,
  mime_type    text not null default 'application/octet-stream',
  size_bytes   bigint not null default 0,
  category     text not null default 'general'
               check (category in ('general', 'board', 'finance', 'legal', 'contracts', 'operations', 'other')),
  description  text not null default '',
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now()
);

create table if not exists public.entity_documents (
  entity_type text not null check (entity_type in ('task', 'update', 'minute', 'decision', 'meeting')),
  entity_id   uuid not null,
  document_id uuid not null references public.documents (id) on delete cascade,
  added_by    uuid not null default auth.uid() references public.profiles (id),
  added_at    timestamptz not null default now(),
  primary key (entity_type, entity_id, document_id)
);
create index if not exists entity_documents_doc_idx on public.entity_documents (document_id);

-- Decisions (binding votes) -------------------------------------------------
create table if not exists public.decisions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 300),
  description text not null default '',
  urgency     text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'urgent')),
  deadline    timestamptz not null,
  status      text not null default 'open'
              check (status in ('open', 'approved', 'rejected', 'no_majority', 'expired', 'cancelled')),
  required    int not null default 1,
  yes_count   int,
  no_count    int,
  other_count int,
  decided_at  timestamptz,
  minute_id   uuid references public.minutes (id) on delete set null,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.decision_participants (
  decision_id uuid not null references public.decisions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  primary key (decision_id, user_id)
);

create table if not exists public.decision_votes (
  decision_id uuid not null references public.decisions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  choice      text not null check (choice in ('yes', 'no', 'other')),
  statement   text not null default '' check (length(statement) <= 5000),
  created_at  timestamptz not null default now(),
  primary key (decision_id, user_id),
  check (choice <> 'other' or length(trim(statement)) > 0)
);

-- Meetings -------------------------------------------------------------------
create table if not exists public.meetings (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(title) between 1 and 300),
  kind             text not null default 'board' check (kind in ('board', 'adhoc')),
  agenda           text not null default '',
  duration_minutes int not null default 60 check (duration_minutes between 5 and 600),
  location         text not null default '',
  video_link       text not null default '' check (video_link = '' or video_link ~* '^https://'),
  status           text not null default 'polling' check (status in ('polling', 'scheduled', 'cancelled', 'held')),
  starts_at        timestamptz,
  link_sent_at     timestamptz,
  created_by       uuid not null default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now()
);

create table if not exists public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id),
  primary key (meeting_id, user_id)
);

create table if not exists public.meeting_slots (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  starts_at  timestamptz not null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  unique (meeting_id, starts_at)
);

create table if not exists public.meeting_responses (
  slot_id    uuid not null references public.meeting_slots (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id),
  answer     text not null check (answer in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (slot_id, user_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'minutes_meeting_fk') then
    alter table public.minutes add constraint minutes_meeting_fk
      foreign key (meeting_id) references public.meetings (id) on delete set null;
  end if;
end $$;

-- Notifications, read markers, push subscriptions ----------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  entity_type text not null,
  entity_id   uuid,
  data        jsonb not null default '{}',
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table if not exists public.reads (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  read_at     timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);
create index if not exists reads_entity_idx on public.reads (entity_type, entity_id);

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists app_private.reminders_sent (
  kind      text not null,
  entity_id uuid not null,
  user_id   uuid not null,
  sent_on   date not null default current_date,
  primary key (kind, entity_id, user_id, sent_on)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function app_private.touch_updated_at();
drop trigger if exists updates_touch on public.updates;
create trigger updates_touch before update on public.updates for each row execute function app_private.touch_updated_at();
drop trigger if exists minutes_touch on public.minutes;
create trigger minutes_touch before update on public.minutes for each row execute function app_private.touch_updated_at();

-- Insert one notification per recipient (skips the actor and inactive users)
create or replace function app_private.notify(
  recipients uuid[], p_kind text, p_entity_type text, p_entity_id uuid, p_data jsonb, p_actor uuid
) returns void
language sql security definer set search_path = public, pg_temp as
$$
  insert into notifications (user_id, kind, entity_type, entity_id, data, actor_id)
  select distinct r, p_kind, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb), p_actor
  from unnest(recipients) as r
  join profiles p on p.id = r and p.status = 'active'
  where r is not null and r is distinct from p_actor
$$;

create or replace function app_private.active_member_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce(array_agg(id), '{}') from profiles where status = 'active' $$;

create or replace function app_private.actor_name(uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce(nullif(full_name, ''), email) from profiles where id = uid $$;

-- ---------------------------------------------------------------------------
-- Triggers that create notifications
-- ---------------------------------------------------------------------------
create or replace function app_private.on_task_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  d jsonb;
begin
  d := jsonb_build_object('title', new.title, 'due', new.due_date, 'actor', app_private.actor_name(auth.uid()));
  if tg_op = 'INSERT' then
    perform app_private.notify(array[new.assignee_id], 'task_assigned', 'task', new.id, d, auth.uid());
  else
    if new.assignee_id is distinct from old.assignee_id then
      perform app_private.notify(array[new.assignee_id], 'task_assigned', 'task', new.id, d, auth.uid());
      -- the task becomes "new" again for the new assignee
      delete from reads where entity_type = 'task' and entity_id = new.id and user_id = new.assignee_id;
    end if;
    if new.status = 'done' and old.status <> 'done' then
      perform app_private.notify(array[new.created_by, new.assignee_id], 'task_done', 'task', new.id, d, auth.uid());
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update on public.tasks
  for each row execute function app_private.on_task_change();

create or replace function app_private.task_status_fields() returns trigger
language plpgsql as
$$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end
$$;
drop trigger if exists tasks_status_fields on public.tasks;
create trigger tasks_status_fields before insert or update on public.tasks
  for each row execute function app_private.task_status_fields();

create or replace function app_private.on_update_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  perform app_private.notify(app_private.active_member_ids(), 'update_posted', 'update', new.id,
    jsonb_build_object('title', new.title, 'actor', app_private.actor_name(new.created_by)), new.created_by);
  return new;
end
$$;
drop trigger if exists updates_notify on public.updates;
create trigger updates_notify after insert on public.updates
  for each row execute function app_private.on_update_insert();

create or replace function app_private.on_minute_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  if new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final') then
    perform app_private.notify(app_private.active_member_ids(), 'minutes_final', 'minute', new.id,
      jsonb_build_object('title', new.title, 'actor', app_private.actor_name(auth.uid())), auth.uid());
  end if;
  return new;
end
$$;
drop trigger if exists minutes_notify on public.minutes;
create trigger minutes_notify after insert or update on public.minutes
  for each row execute function app_private.on_minute_change();

create or replace function app_private.on_comment_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  owners uuid[];
  title  text;
begin
  case new.entity_type
    when 'task' then select array[created_by, assignee_id], t.title into owners, title from tasks t where id = new.entity_id;
    when 'update' then select array[created_by], u.title into owners, title from updates u where id = new.entity_id;
    when 'minute' then select array[created_by], m.title into owners, title from minutes m where id = new.entity_id;
    when 'decision' then
      select array_append(array_agg(dp.user_id), max(d.created_by::text)::uuid), max(d.title) into owners, title
      from decisions d left join decision_participants dp on dp.decision_id = d.id where d.id = new.entity_id;
    when 'meeting' then
      select array_append(array_agg(mp.user_id), max(m.created_by::text)::uuid), max(m.title) into owners, title
      from meetings m left join meeting_participants mp on mp.meeting_id = m.id where m.id = new.entity_id;
  end case;
  owners := coalesce(owners, '{}') || coalesce(
    (select array_agg(distinct c.created_by) from comments c
      where c.entity_type = new.entity_type and c.entity_id = new.entity_id and c.id <> new.id), '{}');
  perform app_private.notify(owners, 'comment', new.entity_type, new.entity_id,
    jsonb_build_object('title', title, 'actor', app_private.actor_name(new.created_by)), new.created_by);
  return new;
end
$$;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function app_private.on_comment_insert();

-- Comments must point at something that exists
create or replace function app_private.check_entity_exists() returns trigger
language plpgsql security definer set search_path = public, pg_temp as
$$
declare ok boolean;
begin
  execute format('select exists (select 1 from %I where id = $1)',
    case new.entity_type when 'task' then 'tasks' when 'update' then 'updates' when 'minute' then 'minutes'
                         when 'decision' then 'decisions' when 'meeting' then 'meetings' end)
    into ok using new.entity_id;
  if not ok then raise exception 'target not found' using errcode = '23503'; end if;
  return new;
end
$$;
drop trigger if exists comments_entity_check on public.comments;
create trigger comments_entity_check before insert on public.comments
  for each row execute function app_private.check_entity_exists();
drop trigger if exists entity_documents_check on public.entity_documents;
create trigger entity_documents_check before insert on public.entity_documents
  for each row execute function app_private.check_entity_exists();

-- When an item is deleted, remove its comments, attachment links, read markers and notifications
create or replace function app_private.cleanup_entity() returns trigger
language plpgsql security definer set search_path = public, pg_temp as
$$
declare et text := tg_argv[0];
begin
  delete from comments where entity_type = et and entity_id = old.id;
  delete from entity_documents where entity_type = et and entity_id = old.id;
  delete from reads where entity_type = et and entity_id = old.id;
  delete from notifications where entity_type = et and entity_id = old.id;
  return old;
end
$$;
drop trigger if exists tasks_cleanup on public.tasks;
create trigger tasks_cleanup after delete on public.tasks for each row execute function app_private.cleanup_entity('task');
drop trigger if exists updates_cleanup on public.updates;
create trigger updates_cleanup after delete on public.updates for each row execute function app_private.cleanup_entity('update');
drop trigger if exists minutes_cleanup on public.minutes;
create trigger minutes_cleanup after delete on public.minutes for each row execute function app_private.cleanup_entity('minute');
drop trigger if exists decisions_cleanup on public.decisions;
create trigger decisions_cleanup after delete on public.decisions for each row execute function app_private.cleanup_entity('decision');
drop trigger if exists meetings_cleanup on public.meetings;
create trigger meetings_cleanup after delete on public.meetings for each row execute function app_private.cleanup_entity('meeting');

-- Push: hand every new notification to the Edge Function (only if configured)
create or replace function app_private.on_notification_insert() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as
$$
declare
  url    text := app_private.setting('push_url');
  secret text := app_private.setting('push_secret');
begin
  if url is null or secret is null then return new; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return new; end if;
  if not exists (select 1 from push_subscriptions where user_id = new.user_id) then return new; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    using url,
          jsonb_build_object('notification_id', new.id),
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret);
  return new;
exception when others then
  -- never block the app because push delivery failed
  return new;
end
$$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function app_private.on_notification_insert();

-- ---------------------------------------------------------------------------
-- Decisions: create, vote, close
-- ---------------------------------------------------------------------------
create or replace function public.create_decision(
  p_title text, p_description text, p_urgency text, p_deadline timestamptz,
  p_participants uuid[], p_minute_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_id uuid;
  v_n  int;
begin
  if not is_active() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_deadline <= now() then raise exception 'deadline must be in the future' using errcode = '22023'; end if;
  select count(*) into v_n from profiles where id = any (p_participants) and status = 'active';
  if v_n = 0 then raise exception 'at least one participant is required' using errcode = '22023'; end if;

  insert into decisions (title, description, urgency, deadline, required, minute_id, created_by)
  values (p_title, coalesce(p_description, ''), coalesce(p_urgency, 'normal'), p_deadline, v_n / 2 + 1,
          p_minute_id, auth.uid())
  returning id into v_id;

  insert into decision_participants (decision_id, user_id)
  select v_id, id from profiles where id = any (p_participants) and status = 'active';

  perform app_private.notify(p_participants, 'decision_new', 'decision', v_id,
    jsonb_build_object('title', p_title, 'deadline', p_deadline, 'urgency', p_urgency,
                       'actor', app_private.actor_name(auth.uid())), auth.uid());
  return v_id;
end
$$;

-- Evaluates a decision; caller must hold the row lock.
create or replace function app_private.evaluate_decision(p_id uuid, p_expire boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  d       decisions%rowtype;
  n_total int;
  n_yes   int;
  n_no    int;
  n_other int;
  result  text;
begin
  select * into d from decisions where id = p_id;
  if d.status <> 'open' then return d.status; end if;
  select count(*) into n_total from decision_participants where decision_id = p_id;
  select count(*) filter (where choice = 'yes'), count(*) filter (where choice = 'no'),
         count(*) filter (where choice = 'other')
    into n_yes, n_no, n_other from decision_votes where decision_id = p_id;

  if n_yes >= d.required then result := 'approved';
  elsif n_no >= d.required then result := 'rejected';
  elsif n_yes + n_no + n_other >= n_total then result := 'no_majority';
  elsif p_expire then result := 'expired';
  else return 'open';
  end if;

  update decisions set status = result, decided_at = now(),
         yes_count = n_yes, no_count = n_no, other_count = n_other
   where id = p_id;

  perform app_private.notify(
    array_append((select array_agg(user_id) from decision_participants where decision_id = p_id), d.created_by),
    'decision_closed', 'decision', p_id,
    jsonb_build_object('title', d.title, 'result', result), null);
  return result;
end
$$;

create or replace function public.cast_vote(p_decision_id uuid, p_choice text, p_statement text default '')
returns text
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  d decisions%rowtype;
begin
  if not is_active() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into d from decisions where id = p_decision_id for update;
  if not found then raise exception 'decision not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from decision_participants where decision_id = p_decision_id and user_id = auth.uid()) then
    raise exception 'you are not a participant of this decision' using errcode = '42501';
  end if;
  if d.status <> 'open' then raise exception 'voting is closed' using errcode = '22023'; end if;
  if d.deadline <= now() then
    perform app_private.evaluate_decision(p_decision_id, true);
    raise exception 'voting is closed' using errcode = '22023';
  end if;
  if exists (select 1 from decision_votes where decision_id = p_decision_id and user_id = auth.uid()) then
    raise exception 'you have already voted – votes are binding' using errcode = '23505';
  end if;

  insert into decision_votes (decision_id, user_id, choice, statement)
  values (p_decision_id, auth.uid(), p_choice, coalesce(trim(p_statement), ''));

  return app_private.evaluate_decision(p_decision_id, false);
end
$$;

create or replace function public.cancel_decision(p_decision_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$
declare d decisions%rowtype;
begin
  select * into d from decisions where id = p_decision_id for update;
  if not found then raise exception 'decision not found' using errcode = 'P0002'; end if;
  if not (is_admin() or (d.created_by = auth.uid() and is_active())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.status <> 'open' then raise exception 'decision is already closed' using errcode = '22023'; end if;
  update decisions set status = 'cancelled', decided_at = now() where id = p_decision_id;
  perform app_private.notify((select array_agg(user_id) from decision_participants where decision_id = p_decision_id),
    'decision_closed', 'decision', p_decision_id, jsonb_build_object('title', d.title, 'result', 'cancelled'), auth.uid());
end
$$;

-- Live tally – admin only (everyone else sees results only after closing)
create or replace function public.decision_tally(p_decision_id uuid)
returns table (participants int, voted int, yes int, no int, other int)
language plpgsql stable security definer set search_path = public, pg_temp as
$$
begin
  if not is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select (select count(*)::int from decision_participants where decision_id = p_decision_id),
           count(v.*)::int,
           (count(*) filter (where v.choice = 'yes'))::int,
           (count(*) filter (where v.choice = 'no'))::int,
           (count(*) filter (where v.choice = 'other'))::int
    from decision_votes v where v.decision_id = p_decision_id;
end
$$;

-- Block editing the wording once somebody has voted
create or replace function public.decision_has_votes(p_decision_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from decision_votes where decision_id = p_decision_id) $$;

-- Not security definer on purpose: current_user is the caller, so updates made by
-- cast_vote / cancel_decision (which run as owner) pass, direct API updates are checked.
create or replace function public.decision_guard() returns trigger
language plpgsql set search_path = public, pg_temp as
$$
begin
  if current_user in ('authenticated', 'anon') then
    if public.decision_has_votes(old.id)
       and (new.title is distinct from old.title or new.description is distinct from old.description
            or new.deadline is distinct from old.deadline) then
      raise exception 'a decision cannot be changed after the first vote' using errcode = '22023';
    end if;
    if old.status <> 'open' then
      raise exception 'a closed decision cannot be changed' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists decisions_guard on public.decisions;
create trigger decisions_guard before update on public.decisions
  for each row execute function public.decision_guard();

-- ---------------------------------------------------------------------------
-- Meetings: create, schedule, send link, cancel
-- ---------------------------------------------------------------------------
create or replace function public.create_meeting(
  p_title text, p_kind text, p_agenda text, p_duration int, p_location text,
  p_participants uuid[], p_slots timestamptz[]
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_id uuid;
begin
  if not is_active() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'propose at least one time' using errcode = '22023';
  end if;
  insert into meetings (title, kind, agenda, duration_minutes, location, created_by)
  values (p_title, coalesce(p_kind, 'board'), coalesce(p_agenda, ''), coalesce(p_duration, 60),
          coalesce(p_location, ''), auth.uid())
  returning id into v_id;

  insert into meeting_participants (meeting_id, user_id)
  select v_id, id from profiles
   where status = 'active' and (id = any (p_participants) or id = auth.uid());

  insert into meeting_slots (meeting_id, starts_at, created_by)
  select distinct v_id, s, auth.uid() from unnest(p_slots) s;

  perform app_private.notify(p_participants, 'meeting_poll', 'meeting', v_id,
    jsonb_build_object('title', p_title, 'actor', app_private.actor_name(auth.uid())), auth.uid());
  return v_id;
end
$$;

create or replace function public.can_manage_meeting(p_meeting_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select is_admin() or exists (select 1 from meetings where id = p_meeting_id and created_by = auth.uid() and is_active()) $$;

create or replace function public.is_meeting_participant(p_meeting_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from meeting_participants where meeting_id = p_meeting_id and user_id = auth.uid()) $$;

create or replace function public.schedule_meeting(p_meeting_id uuid, p_slot_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  m meetings%rowtype;
  t timestamptz;
begin
  if not public.can_manage_meeting(p_meeting_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select starts_at into t from meeting_slots where id = p_slot_id and meeting_id = p_meeting_id;
  if t is null then raise exception 'time not found' using errcode = 'P0002'; end if;
  update meetings set status = 'scheduled', starts_at = t where id = p_meeting_id returning * into m;
  perform app_private.notify((select array_agg(user_id) from meeting_participants where meeting_id = p_meeting_id),
    'meeting_scheduled', 'meeting', p_meeting_id,
    jsonb_build_object('title', m.title, 'starts_at', t, 'actor', app_private.actor_name(auth.uid())), auth.uid());
end
$$;

create or replace function public.send_meeting_link(p_meeting_id uuid, p_link text) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$
declare m meetings%rowtype;
begin
  if not public.can_manage_meeting(p_meeting_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_link !~* '^https://' then raise exception 'the link must start with https://' using errcode = '22023'; end if;
  update meetings set video_link = trim(p_link), link_sent_at = now() where id = p_meeting_id returning * into m;
  if m.status <> 'scheduled' then raise exception 'schedule the meeting first' using errcode = '22023'; end if;
  perform app_private.notify((select array_agg(user_id) from meeting_participants where meeting_id = p_meeting_id),
    'meeting_link', 'meeting', p_meeting_id,
    jsonb_build_object('title', m.title, 'starts_at', m.starts_at, 'link', m.video_link,
                       'actor', app_private.actor_name(auth.uid())), auth.uid());
end
$$;

create or replace function public.set_meeting_status(p_meeting_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$
declare m meetings%rowtype;
begin
  if not public.can_manage_meeting(p_meeting_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('polling', 'cancelled', 'held') then raise exception 'invalid status' using errcode = '22023'; end if;
  update meetings set status = p_status,
         starts_at = case when p_status = 'polling' then null else starts_at end
   where id = p_meeting_id returning * into m;
  if p_status = 'cancelled' then
    perform app_private.notify((select array_agg(user_id) from meeting_participants where meeting_id = p_meeting_id),
      'meeting_cancelled', 'meeting', p_meeting_id,
      jsonb_build_object('title', m.title, 'actor', app_private.actor_name(auth.uid())), auth.uid());
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Admin: approve members, change roles
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_member(p_user_id uuid, p_role text, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  if not is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_user_id = auth.uid() and (p_role <> 'admin' or p_status <> 'active') then
    raise exception 'you cannot remove your own admin access' using errcode = '22023';
  end if;
  update profiles set role = p_role, status = p_status,
         approved_at = case when p_status = 'active' and approved_at is null then now() else approved_at end
   where id = p_user_id;
  if p_status = 'active' then
    perform app_private.notify(array[p_user_id], 'member_approved', 'profile', p_user_id, '{}'::jsonb, auth.uid());
  end if;
end
$$;

-- Mark everything about one item as seen (read marker + its notifications)
create or replace function public.mark_seen(p_entity_type text, p_entity_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  if not is_active() then return; end if;
  insert into reads (user_id, entity_type, entity_id) values (auth.uid(), p_entity_type, p_entity_id)
  on conflict (user_id, entity_type, entity_id) do update set read_at = now();
  update notifications set read_at = now()
   where user_id = auth.uid() and entity_type = p_entity_type and entity_id = p_entity_id and read_at is null;
end
$$;

-- ---------------------------------------------------------------------------
-- Reminders (due tasks, upcoming meetings, decision deadlines) + expiry
-- Scheduled every 15 minutes by pg_cron (see bottom); also safe to call by hand.
-- ---------------------------------------------------------------------------
create or replace function public.run_reminders() returns int
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  r     record;
  n     int := 0;
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  -- expire decisions whose deadline passed
  for r in select id from decisions where status = 'open' and deadline <= now() for update skip locked loop
    perform app_private.evaluate_decision(r.id, true);
  end loop;

  -- tasks due tomorrow / today / overdue (once per day each)
  for r in
    select t.id, t.title, t.due_date, t.assignee_id,
           case when t.due_date < today then 'task_overdue' when t.due_date = today then 'task_due_today'
                else 'task_due_soon' end as kind
      from tasks t
     where t.status <> 'done' and t.assignee_id is not null and t.due_date is not null
       and t.due_date <= today + 1
  loop
    insert into app_private.reminders_sent (kind, entity_id, user_id, sent_on) values (r.kind, r.id, r.assignee_id, today)
    on conflict do nothing;
    if found then
      perform app_private.notify(array[r.assignee_id], r.kind, 'task', r.id,
        jsonb_build_object('title', r.title, 'due', r.due_date), null);
      n := n + 1;
    end if;
  end loop;

  -- meetings starting within 24 hours and within 1 hour
  for r in
    select m.id, m.title, m.starts_at, m.video_link, mp.user_id,
           case when m.starts_at <= now() + interval '1 hour' then 'meeting_soon' else 'meeting_tomorrow' end as kind
      from meetings m join meeting_participants mp on mp.meeting_id = m.id
     where m.status = 'scheduled' and m.starts_at > now() and m.starts_at <= now() + interval '24 hours'
  loop
    insert into app_private.reminders_sent (kind, entity_id, user_id, sent_on) values (r.kind, r.id, r.user_id, today)
    on conflict do nothing;
    if found then
      perform app_private.notify(array[r.user_id], r.kind, 'meeting', r.id,
        jsonb_build_object('title', r.title, 'starts_at', r.starts_at, 'link', r.video_link), null);
      n := n + 1;
    end if;
  end loop;

  -- open decisions closing within 24 hours, participant has not voted yet
  for r in
    select d.id, d.title, d.deadline, dp.user_id
      from decisions d join decision_participants dp on dp.decision_id = d.id
     where d.status = 'open' and d.deadline <= now() + interval '24 hours'
       and not exists (select 1 from decision_votes v where v.decision_id = d.id and v.user_id = dp.user_id)
  loop
    insert into app_private.reminders_sent (kind, entity_id, user_id, sent_on) values ('decision_deadline', r.id, r.user_id, today)
    on conflict do nothing;
    if found then
      perform app_private.notify(array[r.user_id], 'decision_deadline', 'decision', r.id,
        jsonb_build_object('title', r.title, 'deadline', r.deadline), null);
      n := n + 1;
    end if;
  end loop;

  delete from app_private.reminders_sent where sent_on < today - 30;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.tasks                 enable row level security;
alter table public.updates               enable row level security;
alter table public.comments              enable row level security;
alter table public.minutes               enable row level security;
alter table public.documents             enable row level security;
alter table public.entity_documents      enable row level security;
alter table public.decisions             enable row level security;
alter table public.decision_participants enable row level security;
alter table public.decision_votes        enable row level security;
alter table public.meetings              enable row level security;
alter table public.meeting_participants  enable row level security;
alter table public.meeting_slots         enable row level security;
alter table public.meeting_responses     enable row level security;
alter table public.notifications         enable row level security;
alter table public.reads                 enable row level security;
alter table public.push_subscriptions    enable row level security;

-- Recreate all policies (makes the script re-runnable)
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
           and tablename in ('profiles','tasks','updates','comments','minutes','documents','entity_documents',
                             'decisions','decision_participants','decision_votes','meetings','meeting_participants',
                             'meeting_slots','meeting_responses','notifications','reads','push_subscriptions')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- profiles: members see each other; you may edit only your own name/phone/title/language
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or is_active());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, job_title, phone, lang) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- tasks: everyone active sees and creates; creator, assignee or admin edit; creator or admin delete
create policy tasks_select on public.tasks for select to authenticated using (is_active());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (is_active() and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
  using (is_active() and (created_by = auth.uid() or assignee_id = auth.uid() or is_admin()))
  with check (is_active());
create policy tasks_delete on public.tasks for delete to authenticated
  using (is_active() and (created_by = auth.uid() or is_admin()));
revoke update on public.tasks from authenticated;
grant update (title, description, assignee_id, due_date, priority, status, minute_id) on public.tasks to authenticated;

-- updates
create policy updates_select on public.updates for select to authenticated using (is_active());
create policy updates_insert on public.updates for insert to authenticated
  with check (is_active() and created_by = auth.uid());
create policy updates_update on public.updates for update to authenticated
  using (is_active() and (created_by = auth.uid() or is_admin())) with check (is_active());
create policy updates_delete on public.updates for delete to authenticated
  using (is_active() and (created_by = auth.uid() or is_admin()));
revoke update on public.updates from authenticated;
grant update (title, body, pinned) on public.updates to authenticated;

-- comments (threads)
create policy comments_select on public.comments for select to authenticated using (is_active());
create policy comments_insert on public.comments for insert to authenticated
  with check (is_active() and created_by = auth.uid());
create policy comments_update on public.comments for update to authenticated
  using (is_active() and created_by = auth.uid()) with check (created_by = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (is_active() and (created_by = auth.uid() or is_admin()));
revoke update on public.comments from authenticated;
grant update (body, edited_at) on public.comments to authenticated;

-- minutes: final minutes can only be changed by the admin
create policy minutes_select on public.minutes for select to authenticated using (is_active());
create policy minutes_insert on public.minutes for insert to authenticated
  with check (is_active() and created_by = auth.uid());
create policy minutes_update on public.minutes for update to authenticated
  using (is_active() and (is_admin() or (created_by = auth.uid() and status = 'draft')))
  with check (is_active());
create policy minutes_delete on public.minutes for delete to authenticated
  using (is_admin() or (is_active() and created_by = auth.uid() and status = 'draft'));
revoke update on public.minutes from authenticated;
grant update (title, meeting_type, held_on, location, attendees, guests, body, resolutions, status, meeting_id)
  on public.minutes to authenticated;

-- documents
create policy documents_select on public.documents for select to authenticated using (is_active());
create policy documents_insert on public.documents for insert to authenticated
  with check (is_active() and created_by = auth.uid() and storage_path like auth.uid()::text || '/%');
create policy documents_update on public.documents for update to authenticated
  using (is_active() and (created_by = auth.uid() or is_admin())) with check (is_active());
create policy documents_delete on public.documents for delete to authenticated
  using (is_active() and (created_by = auth.uid() or is_admin()));
revoke update on public.documents from authenticated;
grant update (name, category, description) on public.documents to authenticated;

create policy entity_documents_select on public.entity_documents for select to authenticated using (is_active());
create policy entity_documents_insert on public.entity_documents for insert to authenticated
  with check (is_active() and added_by = auth.uid());
create policy entity_documents_delete on public.entity_documents for delete to authenticated
  using (is_active() and (added_by = auth.uid() or is_admin()));

-- decisions: read for all members; writes only through the functions above
create policy decisions_select on public.decisions for select to authenticated using (is_active());
create policy decisions_update on public.decisions for update to authenticated
  using (is_active() and (created_by = auth.uid() or is_admin())) with check (is_active());
revoke insert, update, delete on public.decisions from authenticated, anon;
grant update (title, description, urgency, deadline) on public.decisions to authenticated;

create policy decision_participants_select on public.decision_participants for select to authenticated
  using (is_active());
revoke insert, update, delete on public.decision_participants from authenticated, anon;

-- votes stay secret: own vote, or admin, or after the decision is closed
create policy decision_votes_select on public.decision_votes for select to authenticated
  using (is_active() and (
    user_id = auth.uid() or is_admin()
    or exists (select 1 from decisions d where d.id = decision_id and d.status <> 'open')));
revoke insert, update, delete on public.decision_votes from authenticated, anon;

-- meetings
create policy meetings_select on public.meetings for select to authenticated using (is_active());
create policy meetings_update on public.meetings for update to authenticated
  using (public.can_manage_meeting(id)) with check (is_active());
create policy meetings_delete on public.meetings for delete to authenticated
  using (public.can_manage_meeting(id));
revoke insert, update on public.meetings from authenticated, anon;
grant update (title, kind, agenda, duration_minutes, location, video_link) on public.meetings to authenticated;

create policy meeting_participants_select on public.meeting_participants for select to authenticated
  using (is_active());
create policy meeting_participants_insert on public.meeting_participants for insert to authenticated
  with check (public.can_manage_meeting(meeting_id));
create policy meeting_participants_delete on public.meeting_participants for delete to authenticated
  using (public.can_manage_meeting(meeting_id));

create policy meeting_slots_select on public.meeting_slots for select to authenticated using (is_active());
create policy meeting_slots_insert on public.meeting_slots for insert to authenticated
  with check (created_by = auth.uid() and (public.is_meeting_participant(meeting_id)
              or public.can_manage_meeting(meeting_id))
              and exists (select 1 from meetings m where m.id = meeting_id and m.status = 'polling'));
create policy meeting_slots_delete on public.meeting_slots for delete to authenticated
  using (public.can_manage_meeting(meeting_id) or created_by = auth.uid());

create policy meeting_responses_select on public.meeting_responses for select to authenticated using (is_active());
create policy meeting_responses_insert on public.meeting_responses for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from meeting_slots s join meetings m on m.id = s.meeting_id
     where s.id = slot_id and m.status = 'polling' and public.is_meeting_participant(m.id)));
create policy meeting_responses_update on public.meeting_responses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (
    select 1 from meeting_slots s join meetings m on m.id = s.meeting_id
     where s.id = slot_id and m.status = 'polling'));
create policy meeting_responses_delete on public.meeting_responses for delete to authenticated
  using (user_id = auth.uid());

-- notifications: only your own; you may only set read_at
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- read markers: own rows; everyone may see who has read an update ("seen by")
create policy reads_select on public.reads for select to authenticated
  using (user_id = auth.uid() or (is_active() and entity_type in ('update', 'minute')));
create policy reads_insert on public.reads for insert to authenticated with check (user_id = auth.uid());
create policy reads_update on public.reads for update to authenticated using (user_id = auth.uid());

-- push subscriptions: own rows only
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and is_active());
create policy push_update on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- anonymous visitors get nothing
revoke all on all tables in schema public from anon;

-- functions: only what the app needs is callable
revoke execute on all functions in schema app_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'revoke execute on all functions in schema app_private from anon, authenticated';
  end if;
end $$;
revoke execute on function public.run_reminders() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.run_reminders() from authenticated';
    execute 'grant execute on function public.is_active(), public.is_admin(), public.create_decision(text, text, text, timestamptz, uuid[], uuid),
       public.cast_vote(uuid, text, text), public.cancel_decision(uuid), public.decision_tally(uuid),
       public.create_meeting(text, text, text, int, text, uuid[], timestamptz[]), public.schedule_meeting(uuid, uuid),
       public.send_meeting_link(uuid, text), public.set_meeting_status(uuid, text), public.admin_set_member(uuid, text, text),
       public.mark_seen(text, uuid), public.can_manage_meeting(uuid), public.is_meeting_participant(uuid),
       public.decision_has_votes(uuid) to authenticated';
  end if;
end $$;

-- the trigger on auth.users must be created after all tables it touches exist
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage bucket for documents (Supabase only)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('documents', 'documents', false, 52428800)
    on conflict (id) do update set public = false, file_size_limit = 52428800;

    execute 'drop policy if exists "team docs read" on storage.objects';
    execute 'drop policy if exists "team docs upload" on storage.objects';
    execute 'drop policy if exists "team docs delete" on storage.objects';
    execute $p$create policy "team docs read" on storage.objects for select to authenticated
      using (bucket_id = 'documents' and public.is_active())$p$;
    execute $p$create policy "team docs upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'documents' and public.is_active()
                  and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "team docs delete" on storage.objects for delete to authenticated
      using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime (live pop-ups) and scheduled reminders (Supabase only)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'team-nusatani-reminders';
    perform cron.schedule('team-nusatani-reminders', '*/15 * * * *', 'select public.run_reminders()');
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when others then
  raise notice 'pg_cron / pg_net not set up: %', sqlerrm;
end $$;
