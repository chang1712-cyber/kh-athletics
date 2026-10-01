-- 範例初始資料（可依當年度競賽規程修改後執行）
-- 學校請改成實際參賽學校，或之後在網站「管理後台 > 學校與帳號」逐筆新增

with c as (
  insert into public.competitions (name, start_date, end_date, venue, registration_open, registration_deadline,
    max_events_per_athlete, max_per_school, is_active)
  values ('115學年度高雄市國小田徑錦標賽', '2026-11-18', '2026-11-20', '高雄市立中正運動場', true,
    '2026-10-31 23:59:00+08', 2, 2, true)
  returning id
),
items (group_name, grades, name, kind, max_per_school, sort) as (
  values
    ('高年級', '{5,6}'::int[], '100公尺', 'track', null::int, 1),
    ('高年級', '{5,6}'::int[], '200公尺', 'track', null, 2),
    ('高年級', '{5,6}'::int[], '400公尺', 'track', null, 3),
    ('高年級', '{5,6}'::int[], '800公尺', 'track', null, 4),
    ('高年級', '{5,6}'::int[], '跳遠', 'field', null, 5),
    ('高年級', '{5,6}'::int[], '跳高', 'field', null, 6),
    ('高年級', '{5,6}'::int[], '壘球擲遠', 'field', null, 7),
    ('高年級', '{5,6}'::int[], '4×100公尺接力', 'relay', 6, 8),
    ('中年級', '{3,4}'::int[], '60公尺', 'track', null, 20),
    ('中年級', '{3,4}'::int[], '100公尺', 'track', null, 21),
    ('中年級', '{3,4}'::int[], '跳遠', 'field', null, 22),
    ('中年級', '{3,4}'::int[], '壘球擲遠', 'field', null, 23),
    ('中年級', '{3,4}'::int[], '4×100公尺接力', 'relay', 6, 24)
)
insert into public.events (competition_id, group_name, gender, name, kind, grades, max_per_school, sort)
select c.id, i.group_name, g.gender, i.name, i.kind, i.grades, i.max_per_school,
       i.sort + case when g.gender = 'F' then 10 else 0 end
from c cross join items i cross join (values ('M'), ('F')) as g (gender);

insert into public.announcements (title, body)
values ('報名系統開放', '請各校承辦人登入系統完成選手建檔與項目報名，並於截止前按下「確認送出並鎖定」。');
