# 資料庫說明

基準結構：[`supabase/schema.sql`](../supabase/schema.sql)。之後的變更一律放在 [`supabase/migrations/`](../supabase/migrations/)。

## 關聯圖

```
schools ─┬─< profiles（帳號，school_id 可空）
         ├─< athletes ─┐
         │             ├─< registrations >─ events >─ competitions
         ├─────────────┘                                   │
         └─< submissions >─────────────────────────────────┘
announcements（獨立）
```

## 資料表

### competitions 賽事
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid | |
| name | text | 例：115學年度高雄市國小田徑錦標賽 |
| start_date / end_date | date | 比賽日期 |
| venue | text | 地點 |
| registration_open | boolean | 是否開放報名 |
| registration_deadline | timestamptz | 報名截止時間 |
| max_events_per_athlete | int | 每人限報個人項目數（接力不計） |
| max_per_school | int | 每校每項預設人數上限 |
| is_active | boolean | 進行中的賽事（前台只顯示這一場） |

### events 競賽項目
| 欄位 | 型別 | 說明 |
|---|---|---|
| competition_id | uuid | 所屬賽事 |
| group_name | text | 組別：高年級、中年級… |
| gender | char(1) | `M` 男、`F` 女 |
| name | text | 100公尺、跳遠… |
| kind | text | `track` 徑賽、`field` 田賽、`relay` 接力 |
| grades | int[] | 可報名年級，例 `{5,6}` |
| max_per_school | int | 空值＝用賽事預設；接力通常設 6（含候補） |
| sort | int | 顯示順序 |

### schools 學校
`code`（唯一）、`name`、`district`（行政區）

### profiles 帳號
| 欄位 | 說明 |
|---|---|
| id | 對應 `auth.users.id` |
| email, display_name | |
| role | `admin` 或 `school` |
| school_id | 學校承辦人所屬學校 |

### athletes 選手
`school_id`、`name`、`gender`、`grade`（1–6）、`student_no`（選填）
**刻意不存**身分證字號、生日等敏感個資。

### registrations 報名
`competition_id`、`event_id`、`athlete_id`、`school_id`；`(event_id, athlete_id)` 唯一。
`competition_id` 與 `school_id` 由 trigger 依項目和選手自動帶入，前端傳什麼都會被覆蓋。

### submissions 送出鎖定
主鍵 `(competition_id, school_id)`。有資料＝該校已送出鎖定；管理員刪除即解鎖。

### announcements 公告
`title`、`body`、`created_at`

## 函式

| 函式 | 用途 |
|---|---|
| `is_admin()` | 目前使用者是否為管理員 |
| `my_school()` | 目前使用者的學校 id |
| `school_locked(school)` | 該校在進行中賽事是否已鎖定 |
| `comp_open(comp)` | 賽事是否在報名期間 |
| `check_registration()` | trigger：報名檢核 |
| `check_submission()` | trigger：只能在報名期間送出 |
| `handle_new_user()` | trigger：新帳號自動建立 profile |
| `public_registration_stats(comp_id)` | 匿名可呼叫，只回傳各項目各校人數 |

## 權限（RLS）摘要

| 資料表 | 讀取 | 寫入 |
|---|---|---|
| competitions, events, schools, announcements | 所有人 | 管理員 |
| profiles | 本人、管理員 | 管理員（防止自行提升權限） |
| athletes | 本校、管理員 | 本校（未鎖定）、管理員 |
| registrations | 本校、管理員 | 新增：本校＋trigger 檢核；刪除：本校（報名期間且未鎖定） |
| submissions | 本校、管理員 | 新增：本校；刪除（解鎖）：管理員 |
