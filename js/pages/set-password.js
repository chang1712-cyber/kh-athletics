(async function (App) {
  const { $, esc, api } = App;
  App.renderHeader(null, '');
  const msg = html => ($('#msg').innerHTML = html);

  if (api.mode === 'demo') return msg('<p>示範模式不需要設定密碼。</p>');

  // 連結失效時 Supabase 會在網址 hash 帶 error_description
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('error_description')) {
    return msg(`<p class="notice">連結無效或已過期（${esc(hash.get('error_description'))}）。<br>請到登入頁按「忘記密碼」重新寄送，或洽大會承辦人。</p>`);
  }

  const email = await api.hasAuthUser();
  if (!email) return msg('<p class="notice">請從電子郵件中的連結開啟此頁。連結若已使用過或過期，請到登入頁按「忘記密碼」。</p>');

  msg(`<p>帳號：<strong>${esc(email)}</strong></p>`);
  const form = $('#pw-form');
  form.hidden = false;
  form.onsubmit = async ev => {
    ev.preventDefault();
    const { pw, pw2 } = App.formData(form);
    if (pw !== pw2) return App.toast('兩次輸入的密碼不一致', 'error');
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api.updatePassword(pw);
      form.hidden = true;
      msg('<p>密碼已設定完成。</p><p><a class="btn btn-primary" href="login.html">前往登入</a></p>');
      await api.signOut();
    } catch (e) {
      App.toast(App.errMsg(e), 'error');
      btn.disabled = false;
    }
  };
})(window.App);
