-- =====================================================================
-- 高雄市國小田徑錦標賽報名系統：Supabase 資料庫結構
-- 使用方式：Supabase 專案 > SQL Editor > 貼上全部內容 > Run
-- =====================================================================

-- ---------- 資料表 ----------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  district text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'school' check (role in ('admin', 'school')),
  school_id uuid references public.schools(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  venue text,
  registration_open boolean not null default false,
  registration_deadline timestamptz not null,
  max_events_per_athlete int not null default 2,
  max_per_school int not null default 2,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  group_name text not null,             -- 例：高年級、中年級
  gender char(1) not null check (gender in ('M', 'F')),
  name text not null,                   -- 例：100公尺
  kind text not null check (kind in ('track', 'field', 'relay')),
  grades int[] not null,                -- 可報名年級，例：{5,6}
  max_per_school int,                   -- 空值 = 使用賽事預設
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null,
  gender char(1) not null check (gender in ('M', 'F')),
  grade int not null check (grade between 1 and 6),
  student_no text,
  created_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  created_at timestamptz not null default now(),
  unique (event_id, athlete_id)
);
create index if not exists registrations_comp_school on public.registrations (competition_id, school_id);

create table if not exists public.submissions (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key (competition_id, school_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- 權限輔助函式 ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from profiles where id = auth.uid();
$$;

-- 學校在「進行中賽事」是否已送出鎖定
create or replace function public.school_locked(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from submissions s join competitions c on c.id = s.competition_id
    where s.school_id = p_school and c.is_active);
$$;

create or replace function public.comp_open(p_comp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from competitions
    where id = p_comp and registration_open and now() <= registration_deadline);
$$;

-- ---------- 新使用者自動建立 profile ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name) values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 報名檢核（伺服器端，前端無法繞過） ----------
create or replace function public.check_registration() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a athletes; e events; c competitions; n int; lim int;
begin
  select * into a from athletes where id = new.athlete_id;
  select * into e from events where id = new.event_id;
  if a.id is null or e.id is null then raise exception '選手或項目不存在'; end if;
  select * into c from competitions where id = e.competition_id;

  new.competition_id := e.competition_id;
  new.school_id := a.school_id;

  if not is_admin() then
    if a.school_id is distinct from my_school() then raise exception '只能為本校選手報名'; end if;
    if not (c.registration_open and now() <= c.registration_deadline) then raise exception '報名未開放或已截止'; end if;
    if exists (select 1 from submissions where competition_id = c.id and school_id = a.school_id) then
      raise exception '本校報名已送出鎖定，如需修改請洽大會承辦人解鎖';
    end if;
  end if;

  if a.gender <> e.gender then raise exception '% 性別不符此項目', a.name; end if;
  if not (a.grade = any (e.grades)) then raise exception '% 年級不符此項目', a.name; end if;

  -- 同一學校同時報名時避免超額：以學校+項目為單位加鎖
  perform pg_advisory_xact_lock(hashtext(a.school_id::text || e.id::text));

  if e.kind <> 'relay' then
    select count(*) into n from registrations r join events ev on ev.id = r.event_id
      where r.athlete_id = a.id and r.competition_id = c.id and ev.kind <> 'relay';
    if n >= c.max_events_per_athlete then
      raise exception '% 個人項目已達上限（% 項）', a.name, c.max_events_per_athlete;
    end if;
  end if;

  lim := coalesce(e.max_per_school, c.max_per_school);
  select count(*) into n from registrations where event_id = e.id and school_id = a.school_id;
  if n >= lim then raise exception '本校此項目已達報名上限（% 人）', lim; end if;

  return new;
end $$;

drop trigger if exists registrations_check on public.registrations;
create trigger registrations_check before insert on public.registrations
  for each row execute function public.check_registration();

-- 送出鎖定只能由本校在報名期間內建立
create or replace function public.check_submission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and not comp_open(new.competition_id) then raise exception '報名未開放或已截止'; end if;
  new.submitted_at := now();
  return new;
end $$;

drop trigger if exists submissions_check on public.submissions;
create trigger submissions_check before insert on public.submissions
  for each row execute function public.check_submission();

-- ---------- 公開統計（匿名可看人數，看不到選手姓名） ----------
create or replace function public.public_registration_stats(comp_id uuid)
returns table (event_id uuid, school_id uuid, n bigint)
language sql stable security definer set search_path = public as $$
  select event_id, school_id, count(*) from registrations
  where competition_id = comp_id group by event_id, school_id;
$$;
grant execute on function public.public_registration_stats(uuid) to anon, authenticated;

-- ---------- RLS 權限規則 ----------
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.events enable row level security;
alter table public.athletes enable row level security;
alter table public.registrations enable row level security;
alter table public.submissions enable row level security;
alter table public.announcements enable row level security;

-- 公開資料：所有人可讀，只有管理員可寫
do $$
declare t text;
begin
  foreach t in array array['schools', 'competitions', 'events', 'announcements'] loop
    execute format('drop policy if exists "%1$s_read" on public.%1$s', t);
    execute format('create policy "%1$s_read" on public.%1$s for select using (true)', t);
    execute format('drop policy if exists "%1$s_admin" on public.%1$s', t);
    execute format('create policy "%1$s_admin" on public.%1$s for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- profiles：本人可讀自己的資料；只有管理員可修改（避免自行提升權限）
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or is_admin());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update using (is_admin()) with check (is_admin());

-- athletes：學校只能看/改本校選手；鎖定後不可改
drop policy if exists athletes_read on public.athletes;
create policy athletes_read on public.athletes for select using (school_id = my_school() or is_admin());
drop policy if exists athletes_insert on public.athletes;
create policy athletes_insert on public.athletes for insert
  with check (is_admin() or (school_id = my_school() and not school_locked(school_id)));
drop policy if exists athletes_update on public.athletes;
create policy athletes_update on public.athletes for update
  using (is_admin() or (school_id = my_school() and not school_locked(school_id)))
  with check (is_admin() or school_id = my_school());
drop policy if exists athletes_delete on public.athletes;
create policy athletes_delete on public.athletes for delete
  using (is_admin() or (school_id = my_school() and not school_locked(school_id)
    -- 截止後不可藉由刪除選手連帶取消報名
    and not exists (select 1 from registrations r where r.athlete_id = athletes.id and not comp_open(r.competition_id))));

-- registrations：新增的細部檢核由 trigger 處理
drop policy if exists registrations_read on public.registrations;
create policy registrations_read on public.registrations for select using (school_id = my_school() or is_admin());
drop policy if exists registrations_insert on public.registrations;
create policy registrations_insert on public.registrations for insert
  with check (is_admin() or school_id = my_school());
drop policy if exists registrations_delete on public.registrations;
create policy registrations_delete on public.registrations for delete
  using (is_admin() or (school_id = my_school() and comp_open(competition_id) and not school_locked(school_id)));

-- submissions：學校可送出本校；只有管理員可解鎖（刪除）
drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select using (school_id = my_school() or is_admin());
drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert with check (school_id = my_school() or is_admin());
drop policy if exists submissions_delete on public.submissions;
create policy submissions_delete on public.submissions for delete using (is_admin());
