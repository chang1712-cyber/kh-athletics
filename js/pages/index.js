(async function (App) {
  const { $, esc, api } = App;
  const session = await api.getSession();
  App.renderHeader(session, 'home');

  try {
    const comp = await api.getActiveCompetition();
    const anns = await api.listAnnouncements();

    $('#announcements').innerHTML = anns.length
      ? anns.map(a => `<article style="margin-bottom:14px">
          <h3>${esc(a.title)} <span class="muted small">${App.fmtDate(a.created_at)}</span></h3>
          <div style="white-space:pre-wrap">${esc(a.body)}</div></article>`).join('')
      : '<p class="muted">目前沒有公告。</p>';

    if (!comp) {
      $('#comp-info').innerHTML = '<h1>目前沒有進行中的賽事</h1>';
      return;
    }

    const open = App.isRegOpen(comp);
    $('#comp-info').innerHTML = `
      <h1>${esc(comp.name)}</h1>
      <div class="row">
        <span>比賽日期：${App.fmtDate(comp.start_date)} ～ ${App.fmtDate(comp.end_date)}</span>
        <span>地點：${esc(comp.venue)}</span>
      </div>
      <div class="row" style="margin-top:6px">
        ${open ? '<span class="badge badge-ok">報名開放中</span>' : '<span class="badge badge-danger">報名未開放／已截止</span>'}
        <span class="muted">報名截止：${App.fmtDateTime(comp.registration_deadline)}</span>
        <span class="muted">每人限報個人項目 ${comp.max_events_per_athlete} 項，每校每項限 ${comp.max_per_school} 人</span>
      </div>`;

    const [events, stats] = await Promise.all([api.listEvents(comp.id), api.publicStats(comp.id)]);
    const byEvent = {};
    const schoolsJoined = new Set();
    let total = 0;
    for (const s of stats) {
      byEvent[s.event_id] = (byEvent[s.event_id] || 0) + Number(s.n);
      schoolsJoined.add(s.school_id);
      total += Number(s.n);
    }

    $('#stats').innerHTML = `
      <div class="card"><div class="muted">競賽項目</div><div class="stat">${events.length}</div></div>
      <div class="card"><div class="muted">已報名學校</div><div class="stat">${schoolsJoined.size}</div></div>
      <div class="card"><div class="muted">報名人次</div><div class="stat">${total}</div></div>`;

    const sorted = App.sortEvents(events);
    $('#events').innerHTML = sorted.length ? `<table>
      <thead><tr><th>組別</th><th>項目</th><th>類別</th><th>年級</th><th class="num">報名人數</th></tr></thead>
      <tbody>${sorted.map(e => `<tr>
        <td>${esc(App.groupLabel(e))}</td><td>${esc(e.name)}</td><td>${App.kindLabel(e.kind)}</td>
        <td>${(e.grades || []).map(App.gradeLabel).join('、')}</td>
        <td class="num">${byEvent[e.id] || 0}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">尚未設定競賽項目。</p>';
  } catch (e) {
    App.toast('載入失敗：' + App.errMsg(e), 'error');
  }
})(window.App);
