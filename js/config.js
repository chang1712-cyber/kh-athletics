// 系統設定
// SUPABASE_URL 與 SUPABASE_ANON_KEY 留空時，系統以「示範模式」執行：
// 資料只存在目前瀏覽器（localStorage），適合試用與教學，不可用於正式報名。
// 正式上線請到 Supabase 專案 Settings > API Keys 複製 Publishable key（或舊版 anon key）填入。
// 這是公開金鑰，可以放在前端；資料安全由資料庫的 RLS 權限規則保護。
// 絕對不要填 secret / service_role key。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://oizdjapqsfvigbfxtfqb.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_ShGYpvUFHbOY1w8sD5KVaA_EOo5yiKy',
  SITE_TITLE: '高雄市國小田徑錦標賽'
};
