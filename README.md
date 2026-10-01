# 高雄市國小田徑錦標賽：報名、組訓與成績彙整系統

純前端網站（HTML + JavaScript），部署在 **GitHub Pages**，資料庫與登入使用 **Supabase**。
不需要安裝 Node.js 或任何建置工具。

**開發者文件**：[系統架構](docs/ARCHITECTURE.md)｜[資料庫說明](docs/DATABASE.md)｜[開發規劃](docs/ROADMAP.md)｜[協作指南](CONTRIBUTING.md)

## 可行性評估

| 項目 | 評估 | 說明 |
|---|---|---|
| 程式碼放 GitHub | ✅ 可行 | 版本控管、多人協作、修改紀錄都有 |
| 網站放 GitHub Pages | ✅ 可行 | 免費、自動 HTTPS；限制是**只能放靜態檔案**，不能跑後端程式 |
| 資料庫／登入 | ✅ 用 Supabase 解決 | PostgreSQL + 帳號登入 + RLS 權限控管，前端直接連線 |
| 費用 | ✅ 免費額度足夠 | Supabase 免費版：500 MB 資料庫、5 萬名月活躍使用者；一場市賽約數千筆資料，遠低於上限 |
| 安全性 | ✅ 可控 | 權限規則寫在資料庫（`supabase/schema.sql`），前端被竄改也無法越權；報名檢核由資料庫 trigger 再做一次 |
| 比賽當天流量 | ✅ 足夠 | 前台是靜態頁面，GitHub Pages 有 CDN；成績查詢流量在免費額度內 |

**需要注意的風險：**

1. **個資存放位置**：Supabase 主機在海外（建議選 Tokyo 或 Singapore 區域）。選手是未成年學生，正式上線前請向教育局確認個資存放規範。
   系統已把個資降到最低：只存姓名、性別、年級、學號，**不收身分證字號與生日**；前台只公開人數，不公開姓名。
2. **免費版閒置暫停**：Supabase 免費專案 7 天沒有任何存取會被暫停（可在後台一鍵恢復）。正式賽季可升級 Pro（每月約 25 美元），或在報名期前先登入喚醒。
3. **GitHub Pages 的 repo**：免費帳號的 Pages 需要 **public repo**，所以**程式碼會公開**。這沒有安全問題（金鑰只有可公開的 anon key，資料靠 RLS 保護），但絕對**不能**把 `service_role` key 或任何選手資料檔放進 repo。
4. **教育局帳號串接**（OpenID 單一登入）需要另外向教育局申請，第一版先用 Email + 密碼帳號。

**結論：可行**，而且是最低成本的做法。若之後教育局要求資料存放在國內主機，前端程式不用重寫，只要把 Supabase 換成自架的 PostgreSQL + API 即可（`js/api.js` 已將資料存取集中在同一個檔案）。

## 目前功能（第一階段：報名系統）

- **前台**（`index.html`）：賽事資訊、公告、各項目報名人數
- **學校端**（`school.html`）
  - 選手建檔，可從 Excel 複製貼上批次匯入
  - 報名矩陣：勾選即報名，即時檢核年級、性別、每人限報項目數、每校每項人數
  - 報名總覽、列印報名表（含核章欄）、確認送出並鎖定
- **管理後台**（`admin.html`）
  - 各校報名狀況、解鎖、匯出 CSV（Excel 可直接開）
  - 賽事設定（截止時間、限報規則）、競賽項目管理、學校與帳號管理、公告

## 後續規劃

| 階段 | 內容 |
|---|---|
| 2 | 賽務編排：秩序冊、預賽分組與道次、號碼布、檢錄單 |
| 3 | 成績登錄、晉級與名次計算、團體總錦標積分、破紀錄標示、即時成績公告 |
| 4 | 成績分析儀表板（個人歷程、各校／行政區比較、歷年趨勢） |
| 5 | 組訓：培訓名單、集訓出缺席、體能測驗追蹤 |

## 目前部署狀態

- 網站：https://chang1712-cyber.github.io/kh-athletics/
- Supabase 專案：`kh-athletics`（Tokyo，ref `oizdjapqsfvigbfxtfqb`），已執行 `schema.sql` 與 `seed.sql`
- 已關閉公開註冊；Site URL 設為 `set-password.html`（邀請信與重設密碼信會導到該頁設定密碼）

**新增帳號**：Supabase → Authentication → Users → **Invite user** 輸入 Email → 對方收信點連結設定密碼 → 在網站「管理後台 › 學校與帳號」指定角色與學校。

## 本機試用（示範模式）

`js/config.js` 的 Supabase 欄位留空時會自動進入**示範模式**，資料存在瀏覽器裡，可完整試用所有功能。

```bash
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

接著開啟 http://localhost:8080/ ，到「登入」頁選擇示範身分。

## 正式部署步驟

### 1. 建立 Supabase 資料庫

1. 到 https://supabase.com 註冊，建立新專案（Region 選 **Northeast Asia (Tokyo)**）
2. 左側 **SQL Editor** → 貼上 `supabase/schema.sql` 全部內容 → Run
3. 再貼上 `supabase/seed.sql`（先依當年度規程修改日期與項目）→ Run
4. **Authentication → Sign In / Providers**：關閉「Allow new users to sign up」（帳號只由承辦人建立）
5. **Authentication → Users → Add user**：建立你自己的帳號（勾選 Auto Confirm User）
6. 回到 SQL Editor，把自己設成管理員：
   ```sql
   update profiles set role = 'admin', display_name = '大會承辦人' where email = '你的email';
   ```
7. **Project Settings → API**：複製 Project URL 和 `anon` `public` key，填入 `js/config.js`

> ⚠️ 只能填 `anon public` key，**絕對不要**填 `service_role` key。

### 2. 上傳到 GitHub 並開啟 Pages

**方法 A：網頁上傳（不用安裝任何軟體）**
1. GitHub 右上角 **New repository** → 輸入名稱（例如 `kh-athletics`）→ Public → Create
2. 點 **uploading an existing file**，把本資料夾內所有檔案拖進去（`.claude` 資料夾不用傳）→ Commit
3. Repo 的 **Settings → Pages** → Source 選 **Deploy from a branch**，Branch 選 `main`、`/ (root)` → Save
4. 約 1 分鐘後網址會是 `https://你的帳號.github.io/kh-athletics/`

**方法 B：使用 Git（之後修改比較方便）**
```bash
winget install --id Git.Git -e
```
安裝後重新開啟終端機，在本資料夾執行：
```bash
git init -b main
```
```bash
git add .
```
```bash
git commit -m "初版：報名系統"
```
```bash
git remote add origin https://github.com/你的帳號/kh-athletics.git
```
```bash
git push -u origin main
```

### 3. 設定 Supabase 允許網址

Supabase **Authentication → URL Configuration** → Site URL 填入 GitHub Pages 網址。

### 4. 建立學校帳號

1. 管理後台 → 學校與帳號 → 新增各參賽學校
2. Supabase → Authentication → Users → Add user（每校一個 Email，勾選 Auto Confirm）
3. 回管理後台 → 使用者帳號 → 指定該帳號的所屬學校 → 儲存
4. 把帳號密碼通知各校承辦人

## 檔案結構

```
├── index.html          前台首頁
├── login.html          登入
├── school.html         學校報名
├── admin.html          管理後台
├── css/style.css
├── js/
│   ├── config.js       Supabase 連線設定（留空 = 示範模式）
│   ├── common.js       共用工具
│   ├── rules.js        報名檢核規則
│   ├── api.js          資料存取層（示範／Supabase）
│   └── pages/          各頁面程式
├── supabase/
│   ├── schema.sql      資料表、權限規則、檢核 trigger
│   └── seed.sql        範例賽事與項目
└── tools/serve.ps1     本機預覽伺服器
```
