// 共用工具：DOM、格式化、提示訊息、頁首、權限檢查
window.App = window.App || {};
(function (App) {
  App.$ = (sel, root = document) => root.querySelector(sel);
  App.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  App.esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  App.genderLabel = g => (g === 'M' ? '男' : '女');
  App.gradeLabel = n => (['', '一', '二', '三', '四', '五', '六'][n] || n) + '年級';
  App.kindLabel = k => ({ track: '徑賽', field: '田賽', relay: '接力' }[k] || k);
  App.groupLabel = e => `${e.group_name}${App.genderLabel(e.gender)}童組`;
  App.eventLabel = e => `${App.groupLabel(e)} ${e.name}`;

  App.sortEvents = events => events.slice().sort((a, b) =>
    (a.sort ?? 0) - (b.sort ?? 0) || a.gender.localeCompare(b.gender) || a.name.localeCompare(b.name));

  App.fmtDate = s => (s ? new Date(s).toLocaleDateString('zh-TW') : '');
  App.fmtDateTime = s => (s ? new Date(s).toLocaleString('zh-TW', { hour12: false }) : '');

  // <input type="datetime-local"> 與 ISO 字串互轉
  App.toLocalInput = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  App.fromLocalInput = v => (v ? new Date(v).toISOString() : null);

  App.isRegOpen = c => !!c && c.registration_open && new Date() <= new Date(c.registration_deadline);

  App.toast = (msg, type = 'info') => {
    let box = App.$('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
  };

  App.errMsg = e => (e && (e.message || e.error_description)) || String(e);

  // 下載 CSV（加 BOM，Excel 開啟中文不會亂碼）
  App.downloadCSV = (filename, rows) => {
    const cell = v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const text = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  App.renderHeader = (session, active) => {
    const title = (window.APP_CONFIG && window.APP_CONFIG.SITE_TITLE) || '田徑錦標賽';
    const role = session && session.profile.role;
    const link = (href, label, key) =>
      `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
    const links = [link('index.html', '首頁', 'home')];
    if (role === 'school') links.push(link('school.html', '本校報名', 'school'));
    if (role === 'admin') links.push(link('admin.html', '管理後台', 'admin'));
    links.push(session
      ? `<a href="#" id="logout">登出（${App.esc(session.profile.display_name || session.user.email)}）</a>`
      : link('login.html', '登入', 'login'));
    const demo = App.api.mode === 'demo'
      ? '<span class="badge badge-warn" title="資料只存在此瀏覽器，請勿用於正式報名">示範模式</span>' : '';
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `<div class="wrap header-inner">
      <a class="brand" href="index.html">${App.esc(title)} ${demo}</a>
      <nav>${links.join('')}</nav></div>`;
    document.body.prepend(header);
    const out = App.$('#logout');
    if (out) out.onclick = async ev => {
      ev.preventDefault();
      await App.api.signOut();
      location.href = 'index.html';
    };
  };

  // 檢查登入與角色；不符合就導回登入頁
  App.requireRole = async role => {
    const s = await App.api.getSession();
    if (!s || s.profile.role !== role) {
      location.href = 'login.html';
      throw new Error('redirect');
    }
    if (role === 'school' && !s.profile.school_id) {
      document.body.innerHTML = '<main class="wrap"><div class="card"><h2>帳號尚未綁定學校</h2><p>請聯絡大會承辦人，在管理後台將您的帳號指定到所屬學校。</p></div></main>';
      throw new Error('no school');
    }
    return s;
  };

  // 分頁：按鈕 [data-tab] 對應 section[data-panel]，並記在網址 hash
  App.tabs = (onChange) => {
    const buttons = App.$$('[data-tab]');
    const show = key => {
      buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === key));
      App.$$('[data-panel]').forEach(p => (p.hidden = p.dataset.panel !== key));
      if (onChange) onChange(key);
    };
    buttons.forEach(b => (b.onclick = () => {
      history.replaceState(null, '', '#' + b.dataset.tab);
      show(b.dataset.tab);
    }));
    const initial = location.hash.slice(1);
    show(buttons.some(b => b.dataset.tab === initial) ? initial : buttons[0].dataset.tab);
  };

  // 表單 <-> 物件
  App.formData = form => Object.fromEntries(new FormData(form).entries());
})(window.App);
