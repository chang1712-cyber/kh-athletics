# 協作指南

先讀 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 了解整體設計。

## 本機開發

不需要安裝 Node.js。下載 repo 後：

```bash
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

開啟 http://localhost:8080/ 。

**開發時請用示範模式**：把 `js/config.js` 的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 暫時改成空字串，資料只存在瀏覽器裡，不會碰到正式資料庫。**提交前記得改回來**（或不要提交 `config.js` 的這個修改）。

示範資料可在「登入」頁按「重設示範資料」還原。

## 修改流程

`main` 分支受保護，**不能直接 push**。`main` 一更新，正式網站約 1 分鐘後就會跟著更新。

1. 從 Issue 認領工作（留言或指派給自己）
2. 開分支：`git switch -c feature/秩序冊`
3. 修改、在示範模式下測試
4. 推上分支，開 Pull Request，內文寫 `Closes #Issue編號`
5. 由維護者審核後合併

## 資料庫變更

- **不要**直接在 Supabase 後台手動修改資料表結構。
- 把變更寫成 `supabase/migrations/YYYYMMDDHHMM_說明.sql`，隨 PR 一起提交。
- SQL 盡量可重複執行（`if not exists`、`create or replace`、`drop ... if exists`）。
- PR 合併後，由維護者到 Supabase SQL Editor 執行該檔。
- 新增資料表**一定要**開啟 RLS 並寫好權限規則，同時更新 [docs/DATABASE.md](docs/DATABASE.md)。

## 程式慣例

- 純 HTML、CSS、JavaScript，classic script（掛在 `window.App` 底下），不使用建置工具。
- 頁面程式**只能**透過 `App.api` 存取資料；新增方法時 demo 與 supabase 兩種實作都要寫。
- 輸出到 HTML 的資料一律經過 `App.esc()`，避免 XSS。
- 報名規則修改時，`js/rules.js` 與 `supabase/schema.sql` 的 `check_registration` 要同步。
- 介面文字使用繁體中文。
- 顏色使用 `css/style.css` 的 CSS 變數，深色模式才會正確。

## 絕對不能提交的東西

- 選手名單、報名資料、任何含學生個資的檔案（Excel、CSV、截圖）
- Supabase **secret key** / **service_role key**、資料庫密碼
- 本 repo 是**公開**的，提交即公開；誤提交時不能只刪檔，要立即通知維護者更換金鑰。

`js/config.js` 裡的 publishable key 本來就設計成公開，可以提交。
