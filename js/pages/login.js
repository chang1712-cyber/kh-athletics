(async function (App) {
  const { $, esc, api } = App;
  const go = s => { location.href = s.profile.role === 'admin' ? 'admin.html' : 'school.html'; };

  const existing = await api.getSession();
  App.renderHeader(existing, 'login');
  if (existing) return go(existing);

  if (api.mode === 'demo') {
    $('#demo-login').hidden = false;
    const profiles = (await api.listProfiles()).filter(p => p.role === 'school');
    const schools = await api.listSchools();
    const name = id => (schools.find(s => s.id === id) || {}).name || '';
    $('#demo-school').innerHTML = profiles.map(p => `<option value="${p.id}">${esc(name(p.school_id))}</option>`).join('');
    $('#demo-admin').onclick = async () => go(await api.signInDemo('demo-admin'));
    $('#demo-school-go').onclick = async () => go(await api.signInDemo($('#demo-school').value));
    $('#demo-reset').onclick = async () => {
      if (!confirm('確定清除所有示範資料並還原為預設內容？')) return;
      await api.resetDemo();
      App.toast('已重設示範資料', 'ok');
    };
    return;
  }

  $('#real-login').hidden = false;
  $('#login-form').onsubmit = async ev => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    try {
      const { email, password } = App.formData(ev.target);
      const s = await api.signIn(email, password);
      if (!s) throw new Error('此帳號尚未建立使用者資料，請洽大會承辦人');
      go(s);
    } catch (e) {
      App.toast(App.errMsg(e), 'error');
    } finally {
      btn.disabled = false;
    }
  };
})(window.App);
