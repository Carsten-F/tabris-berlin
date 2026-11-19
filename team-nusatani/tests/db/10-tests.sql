-- Behaviour tests for the Team Nusatani schema (plain Postgres, see run-db-tests.sh)
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = warning;

-- fixed ids make the script readable
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:A, 'Carsten@Nusatani.com', '{"full_name":"Carsten"}'),
  (:B, 'budi@example.com', '{"full_name":"Budi"}'),
  (:C, 'citra@example.com', '{"full_name":"Citra"}'),
  (:D, 'dodgy@example.com', '{}');

create or replace function public.t_expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok   %  (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % – expected an error', label;
end $$;
create or replace function public.t_ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
grant execute on function public.t_expect_error(text, text), public.t_ok(boolean, text) to authenticated, anon;
set client_min_messages = notice;

-- 1. sign-up
select t_ok((select role = 'admin' and status = 'active' and email = 'carsten@nusatani.com' from profiles where id = :A), 'first admin is active admin');
select t_ok((select status from profiles where id = :B) = 'pending', 'new members start as pending');
select t_ok((select count(*) from notifications where user_id = :A and kind = 'member_pending') = 3, 'admin notified about 3 pending members');

-- 2. pending users see nothing
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select t_ok((select count(*) from profiles) = 1, 'pending user sees only own profile');
select t_expect_error($$insert into tasks (title) values ('x')$$, 'pending user cannot create tasks');
select t_expect_error($$select admin_set_member('bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'active')$$, 'pending user cannot approve itself');
reset role;

-- 3. admin approves B and C
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
select admin_set_member(:B, 'member', 'active');
select admin_set_member(:C, 'member', 'active');
select t_expect_error($$select admin_set_member('aaaaaaaa-0000-0000-0000-000000000001', 'member', 'active')$$, 'admin cannot demote itself');
select t_ok((select count(*) from profiles where status = 'active') = 3, 'three active members');
reset role;

-- 4. members cannot escalate
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select t_expect_error($$update profiles set role = 'admin' where id = auth.uid()$$, 'member cannot change own role');
update profiles set full_name = 'Budi S.', phone = '+60 12 345' where id = auth.uid();
select t_ok((select full_name from profiles where id = auth.uid()) = 'Budi S.', 'member can edit own name');
update profiles set full_name = 'hacked' where id = 'cccccccc-0000-0000-0000-000000000003';
select t_ok((select full_name from profiles where id = 'cccccccc-0000-0000-0000-000000000003') = 'Citra', 'member cannot edit someone else');

-- 5. tasks + notifications + comments
insert into tasks (title, description, assignee_id, due_date, priority)
values ('Prepare bank documents', '<p>Hi</p>', 'cccccccc-0000-0000-0000-000000000003', current_date + 1, 'high');
select t_expect_error($$insert into tasks (title, created_by) values ('forged', 'cccccccc-0000-0000-0000-000000000003')$$, 'cannot create a task in somebody else''s name');
select t_expect_error($$update tasks set created_by = 'cccccccc-0000-0000-0000-000000000003'$$, 'cannot rewrite task creator');
reset role;
select t_ok((select count(*) from notifications where user_id = :C and kind = 'task_assigned') = 1, 'assignee notified');
select t_ok((select count(*) from notifications where user_id = :B and kind = 'task_assigned') = 0, 'creator not notified about own task');

select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
insert into comments (entity_type, entity_id, body) select 'task', id, '<p>On it</p>' from tasks limit 1;
select t_expect_error($$insert into comments (entity_type, entity_id, body) values ('task', gen_random_uuid(), 'x')$$, 'comment needs existing target');
select t_ok((select count(*) from notifications where user_id <> auth.uid()) = 0 and (select count(*) from notifications) = 2, 'user sees only own notifications');
select t_expect_error($$update notifications set kind = 'x'$$, 'cannot alter notification content');
update notifications set read_at = now();
select t_ok((select count(*) from notifications where read_at is null) = 0, 'can mark notifications read');
update tasks set status = 'done';
select t_ok((select completed_at is not null from tasks limit 1), 'completed_at set');
reset role;
select t_ok((select count(*) from notifications where user_id = :B and kind = 'comment') = 1, 'task creator notified about comment');
select t_ok((select count(*) from notifications where user_id = :B and kind = 'task_done') = 1, 'creator notified when task done');

-- D (pending) still sees nothing
select set_config('request.jwt.claim.sub', :D, false);
set role authenticated;
select t_ok((select count(*) from tasks) = 0 and (select count(*) from comments) = 0, 'pending user sees no tasks/comments');
reset role;

-- 6. decisions
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select create_decision('Open bank account', '<p>Maybank</p>', 'high', now() + interval '2 days',
  array['aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003']::uuid[]) as d1 \gset
select t_ok((select required from decisions where id = :'d1') = 2, 'majority of 3 is 2');
select t_expect_error($$insert into decision_votes (decision_id, user_id, choice) select id, auth.uid(), 'yes' from decisions$$, 'no direct vote inserts');
select t_expect_error($$select create_decision('x', '', 'normal', now() - interval '1 hour', array['bbbbbbbb-0000-0000-0000-000000000002']::uuid[])$$, 'deadline must be in future');
reset role;

select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
select t_ok(cast_vote(:'d1', 'yes') = 'open', 'first yes keeps it open');
select t_expect_error(format($$select cast_vote(%L, 'no')$$, :'d1'), 'second vote rejected (binding)');
select t_expect_error(format($$select decision_tally(%L)$$, :'d1'), 'member cannot see tally');
reset role;

select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select t_ok((select count(*) from decision_votes) = 0, 'B cannot see C''s vote while open');
select t_expect_error(format($$update decisions set title = 'changed' where id = %L$$, :'d1'), 'wording locked after first vote');
select t_expect_error(format($$select cast_vote(%L, 'other', '  ')$$, :'d1'), 'own wording needs text');
select t_ok(cast_vote(:'d1', 'no') = 'open', 'yes+no keeps it open');
select t_ok((select count(*) from decision_votes) = 1, 'B sees only own vote');
reset role;

select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
select t_ok((select count(*) from decision_votes where decision_id = :'d1') = 2, 'admin sees all votes while open');
select t_ok((select voted from decision_tally(:'d1')) = 2, 'admin tally');
select t_ok(cast_vote(:'d1', 'other', 'Only with CIMB instead') = 'no_majority', 'all voted without majority');
reset role;

select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select t_ok((select count(*) from decision_votes where decision_id = :'d1') = 3, 'after closing everybody sees all votes');
select t_ok((select yes_count = 1 and no_count = 1 and other_count = 1 from decisions where id = :'d1'), 'result counts stored');
select create_decision('Approve budget', '', 'normal', now() + interval '1 day',
  array['aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003']::uuid[]) as d2 \gset
select t_ok(cast_vote(:'d2', 'yes') = 'open', 'd2 first yes');
reset role;
select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
select t_ok(cast_vote(:'d2', 'yes') = 'approved', 'two yes = approved immediately');
reset role;
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
select t_expect_error(format($$select cast_vote(%L, 'no')$$, :'d2'), 'no voting after decision');
select create_decision('Two person decision', '', 'urgent', now() + interval '1 day',
  array['aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003']::uuid[]) as d3 \gset
reset role;
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select t_expect_error(format($$select cast_vote(%L, 'yes')$$, :'d3'), 'non-participant cannot vote');
select t_expect_error(format($$select cancel_decision(%L)$$, :'d3'), 'only creator/admin can cancel');
reset role;
-- expiry
update decisions set deadline = now() - interval '1 minute' where id = :'d3';
select run_reminders();
select t_ok((select status from decisions where id = :'d3') = 'expired', 'past deadline -> expired');
select t_ok((select count(*) from notifications where kind = 'decision_closed' and entity_id = :'d3') = 2, 'participants told about expiry');

-- 7. meetings
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select create_meeting('Board meeting Q4', 'board', '<p>Agenda</p>', 90, 'Zoom',
  array['aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003']::uuid[],
  array[now() + interval '3 days', now() + interval '4 days']::timestamptz[]) as m1 \gset
select t_ok((select count(*) from meeting_participants where meeting_id = :'m1') = 3, 'creator is participant too');
reset role;
select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
insert into meeting_responses (slot_id, answer) select id, 'yes' from meeting_slots where meeting_id = :'m1';
insert into meeting_slots (meeting_id, starts_at) values (:'m1', now() + interval '5 days');
select t_ok((select count(*) from meeting_slots where meeting_id = :'m1') = 3, 'participant can propose another time');
select t_expect_error(format($$select schedule_meeting(%L, (select id from meeting_slots where meeting_id = %L limit 1))$$, :'m1', :'m1'), 'participant cannot fix the date');
select t_expect_error(format($$update meetings set status = 'held' where id = %L$$, :'m1'), 'status only via functions');
reset role;
select id as slot1 from meeting_slots where meeting_id = :'m1' order by starts_at limit 1 \gset
select set_config('request.jwt.claim.sub', :D, false);
set role authenticated;
select t_ok((select count(*) from meeting_slots) = 0, 'pending user sees no meeting times');
select t_expect_error(format($$insert into meeting_responses (slot_id, answer) values (%L, 'yes')$$, :'slot1'), 'pending user cannot respond');
reset role;
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select schedule_meeting(:'m1', (select id from meeting_slots where meeting_id = :'m1' order by starts_at limit 1));
select t_expect_error(format($$select send_meeting_link(%L, 'http://insecure')$$, :'m1'), 'link must be https');
select send_meeting_link(:'m1', 'https://us02web.zoom.us/j/123');
reset role;
select t_ok((select count(*) from notifications where kind = 'meeting_link' and entity_id = :'m1') = 2, 'link sent to the other participants');
select t_ok((select count(*) from notifications where kind = 'meeting_poll' and entity_id = :'m1') = 2, 'poll announced');

-- 8. documents and storage
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
insert into documents (name, storage_path) values ('a.pdf', 'bbbbbbbb-0000-0000-0000-000000000002/1-a.pdf');
select t_expect_error($$insert into documents (name, storage_path) values ('x.pdf', 'cccccccc-0000-0000-0000-000000000003/x.pdf')$$, 'cannot upload into someone else''s folder (table)');
insert into storage.objects (bucket_id, name) values ('documents', 'bbbbbbbb-0000-0000-0000-000000000002/1-a.pdf');
select t_expect_error($$insert into storage.objects (bucket_id, name) values ('documents', 'cccccccc-0000-0000-0000-000000000003/x.pdf')$$, 'cannot upload into someone else''s folder (storage)');
insert into entity_documents (entity_type, entity_id, document_id)
  select 'task', (select id from tasks limit 1), id from documents;
reset role;
select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
delete from documents;
select t_ok((select count(*) from documents) = 1, 'others cannot delete my document');
delete from storage.objects;
reset role;
select t_ok((select count(*) from storage.objects) = 1, 'others cannot delete my file');
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
delete from documents;
select t_ok((select count(*) from documents) = 0, 'owner can delete own document');
select t_ok((select count(*) from entity_documents) = 0, 'links removed with document');

-- 9. minutes
insert into minutes (title, body) values ('Board meeting 1', '<p>x</p>') returning id as min1 \gset
update minutes set status = 'final' where id = :'min1';
update minutes set title = 'changed' where id = :'min1';
select t_ok((select title from minutes where id = :'min1') = 'Board meeting 1', 'final minutes locked for creator');
reset role;
select t_ok((select count(*) from notifications where kind = 'minutes_final') = 2, 'everybody told about final minutes');
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
update minutes set title = 'Board meeting 1 (corrected)' where id = :'min1';
select t_ok((select title from minutes where id = :'min1') = 'Board meeting 1 (corrected)', 'admin can correct final minutes');

-- 10. updates and read markers
insert into updates (title, body) values ('Harvest started', '<p>Good news</p>') returning id as u1 \gset
reset role;
select t_ok((select count(*) from notifications where kind = 'update_posted') = 2, 'update announced to the others');
select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
select mark_seen('update', :'u1');
select t_ok((select count(*) from notifications where entity_id = :'u1' and read_at is null) = 0, 'mark_seen clears notifications');
reset role;
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
select t_ok((select count(*) from reads where entity_id = :'u1') = 1, 'author sees who has read the update');

-- 11. reminders
reset role;
insert into tasks (title, assignee_id, due_date, created_by) values ('Due tomorrow', :C, (now() at time zone 'Asia/Kuala_Lumpur')::date + 1, :B);
select run_reminders();
select run_reminders();
select t_ok((select count(*) from notifications where kind = 'task_due_soon' and user_id = :C) = 1, 'due reminder sent once');
update meetings set starts_at = now() + interval '30 minutes' where id = :'m1';
select run_reminders();
select t_ok((select count(*) from notifications where kind = 'meeting_soon' and entity_id = :'m1') = 3, 'meeting reminder for all participants');

-- 12. anonymous
set role anon;
select t_expect_error($$select * from tasks$$, 'anon cannot read tasks');
select t_expect_error($$select * from profiles$$, 'anon cannot read profiles');
select t_expect_error($$select run_reminders()$$, 'anon cannot run reminders');
reset role;
set role authenticated;
select t_expect_error($$select run_reminders()$$, 'members cannot run reminders');
reset role;

-- 13. deleting a task removes its comments and notifications
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
insert into tasks (title, assignee_id) values ('to be deleted', 'cccccccc-0000-0000-0000-000000000003') returning id as tdel \gset
insert into comments (entity_type, entity_id, body) values ('task', :'tdel', 'x');
delete from tasks where id = :'tdel';
reset role;
select t_ok((select count(*) from comments where entity_id = :'tdel') = 0 and (select count(*) from notifications where entity_id = :'tdel') = 0, 'cleanup after delete');

\echo ALL DATABASE TESTS PASSED
