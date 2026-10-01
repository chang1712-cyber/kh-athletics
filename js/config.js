// 系統設定
// SUPABASE_URL 與 SUPABASE_ANON_KEY 留空時，系統以「示範模式」執行：
// 資料只存在目前瀏覽器（localStorage），適合試用與教學，不可用於正式報名。
// 正式上線請到 Supabase 專案 Settings > API 複製 Project URL 與 anon public key 填入。
// anon key 本來就是公開金鑰，可以放在前端；資料安全由資料庫的 RLS 權限規則保護。
window.APP_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  SITE_TITLE: '高雄市國小田徑錦標賽'
};
