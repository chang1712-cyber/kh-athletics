# 系統架構

## 總覽

```
┌───────────────────────────┐        ┌──────────────────────────────────┐
│ GitHub Pages（靜態網站）    │        │ Supabase（Tokyo）                 │
│                           │ HTTPS  │                                  │
│ index / login / school /  │ ─────▶ │ Auth：Email + 密碼、邀請信          │
│ admin / set-password      │        │ PostgreSQL：資料表 + RLS 權限      │
│                           │ ◀───── │ Trigger：報名檢核、送出檢核          │
│ js/api.js（資料存取層）     │        │ RPC：public_registration_stats    │
└───────────────────────────┘        └──────────────────────────────────┘
          ▲
          │ git push main → 約 1 分鐘自動部署
     GitHub repo
```

- **沒有自己的後端伺服器。** 前端直接用 `supabase-js` 連資料庫，安全性完全靠資料庫端的 **RLS 權限規則**和 **trigger**。
- **不需要建置工具。** 純 HTML、CSS、JavaScript（classic script，非 ES module），雙擊 HTML 檔也能開啟示範模式。
- **雙模式。** `js/config.js` 的 Supabase 欄位留空時，`js/api.js` 改用 localStorage 的示範後端，方便開發與教學。

## 角色

| 角色 | 來源 | 能做什麼 |
|---|---|---|
| 匿名訪客 | 未登入 | 看賽事、公告、項目、各項目報名**人數**（看不到姓名） |
| 學校承辦人 `school` | `profiles.role` | 管理**本校**選手、報名、送出鎖定 |
| 大會管理員 `admin` | `profiles.role` | 全部資料；解鎖、匯出、設定賽事與項目、指派帳號 |

帳號一律由管理員在 Supabase 邀請建立（已關閉公開註冊）。新帳號建立時，`handle_new_user` trigger 會自動建立 `profiles` 資料，預設角色 `school`、未綁學校；管理員再到後台指定學校。

## 前端結構

```
js/
├── config.js      連線設定
├── common.js      App.$ / esc / toast / 頁首 / 分頁 / 權限導向 / CSV 匯出
├── rules.js       報名檢核規則（App.rules）— 前端即時提示用
├── api.js         App.api：同一組介面，demo / supabase 兩種實作
└── pages/         每個 HTML 頁面對應一支程式
```

載入順序（每頁相同）：`config.js` → supabase-js（CDN）→ `common.js` → `rules.js` → `api.js` → `pages/*.js`

所有資料存取都必須經過 `App.api`，頁面程式不可直接呼叫 supabase。這樣日後換後端（例如教育局要求改用國內主機），只需改 `api.js`。

### App.api 介面

| 分類 | 方法 |
|---|---|
| 帳號 | `getSession` `signIn` `signInDemo` `signOut` `hasAuthUser` `updatePassword` `requestPasswordReset` |
| 賽事 | `getActiveCompetition` `saveCompetition` |
| 項目 | `listEvents` `saveEvent` `deleteEvent` |
| 學校／帳號 | `listSchools` `saveSchool` `deleteSchool` `listProfiles` `saveProfile` |
| 選手 | `listAthletes` `saveAthlete` `deleteAthlete` |
| 報名 | `listRegistrations` `addRegistration` `removeRegistration` |
| 送出鎖定 | `listSubmissions` `submit` `unlock` |
| 公告 | `listAnnouncements` `saveAnnouncement` `deleteAnnouncement` |
| 公開統計 | `publicStats` |

新增功能時，demo 與 supabase **兩邊都要實作**同名方法。

## 報名檢核（兩層）

| 規則 | 前端 `rules.js` | 資料庫 `check_registration` |
|---|---|---|
| 報名期間內、未送出鎖定（管理員除外） | ✅ | ✅ |
| 只能報本校選手 | — | ✅ |
| 性別、年級符合項目 | ✅ | ✅ |
| 每人個人項目數上限（接力不計） | ✅ | ✅ |
| 每校每項人數上限（項目可覆寫賽事預設） | ✅ | ✅（advisory lock 防同時送出超額） |

前端檢核只為了即時提示；**真正的防線是資料庫**，前端程式被竄改也無法繞過。修改規則時兩邊要同步。

## 部署

| 項目 | 設定 |
|---|---|
| 網站 | https://chang1712-cyber.github.io/kh-athletics/（`main` 分支根目錄） |
| Supabase 專案 | `kh-athletics`，ref `oizdjapqsfvigbfxtfqb`，Northeast Asia (Tokyo) |
| Auth Site URL | `.../kh-athletics/set-password.html`（邀請、重設密碼信的落地頁） |
| 公開註冊 | 關閉 |

詳細資料表說明見 [DATABASE.md](DATABASE.md)，後續規劃見 [ROADMAP.md](ROADMAP.md)。
