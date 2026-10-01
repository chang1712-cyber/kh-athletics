(async function (App) {
  const { $, $$, esc, api } = App;
  const session = await App.requireRole('admin');
  App.renderHeader(session, 'admin');

  const state = { comp: null, events: [], schools: [], athletes: [], regs: [], subs: [], profiles: [], news: [] };

  async function load() {
    state.comp = await api.getActiveCompetition();
    const [schools, athletes, profiles, news] = await Promise.all([
      api.listSchools(), api.listAthletes(null), api.listProfiles(), api.listAnnouncements()]);
    Object.assign(state, { schools, athletes, profiles, news });
    if (state.comp) {
      const [events, regs, subs] = await Promise.all([
        api.listEvents(state.comp.id), api.listRegistrations(state.comp.id, null), api.listSubmissions(state.comp.id)]);
      Object.assign(state, { events: App.sortEvents(events), regs, subs });
    }
    renderOverview();
    renderComp();
    renderEvents();
    renderSchools();
    renderNews();
  }

  const fill = (form, obj) => {
    for (const el of form.elements) {
      if (!el.name || !(el.name in obj)) continue;
      if (el.type === 'checkbox') el.checked = !!obj[el.name];
      else el.value = obj[el.name] ?? '';
    }
  };
  const guard = fn => async (...args) => {
    try { await fn(...args); } catch (e) { App.toast(App.errMsg(e), 'error'); }
  };

  // ---------- 報名總表 ----------
  function renderOverview() {
    const { comp } = state;
    if (!comp) {
      $('#school-overview').innerHTML = '<p class="muted">尚未建立賽事，請先到「賽事設定」。</p>';
      $('#event-overview').innerHTML = '';
      return;
    }
    const rows = state.schools.map(s => {
      const regs = state.regs.filter(r => r.school_id === s.id);
      const sub = state.subs.find(x => x.school_id === s.id);
      return `<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td>${esc(s.district)}</td>
        <td class="num">${new Set(regs.map(r => r.athlete_id)).size}</td><td class="num">${regs.length}</td>
        <td>${sub ? `<span class="badge badge-ok">已送出</span> <span class="muted small">${App.fmtDateTime(sub.submitted_at)}</span>`
          : regs.length ? '<span class="badge badge-warn">填寫中</span>' : '<span class="badge">未報名</span>'}</td>
        <td>${sub ? `<button class="btn btn-sm" data-unlock="${s.id}">解鎖</button>` : ''}</td></tr>`;
    }).join('');
    $('#school-overview').innerHTML = `<table><thead><tr><th>代碼</th><th>學校</th><th>行政區</th>
      <th class="num">選手數</th><th class="num">報名人次</th><th>狀態</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;

    $('#event-overview').innerHTML = `<table><thead><tr><th>項目</th><th>類別</th><th class="num">參賽學校</th><th class="num">報名人數</th></tr></thead>
      <tbody>${state.events.map(e => {
        const regs = state.regs.filter(r => r.event_id === e.id);
        return `<tr><td>${esc(App.eventLabel(e))}</td><td>${App.kindLabel(e.kind)}</td>
          <td class="num">${new Set(regs.map(r => r.school_id)).size}</td><td class="num">${regs.length}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  $('#school-overview').onclick = guard(async ev => {
    const id = ev.target.dataset.unlock;
    if (!id) return;
    const s = state.schools.find(x => x.id === id);
    if (!confirm(`確定解鎖「${s.name}」的報名？解鎖後該校可再修改並需重新送出。`)) return;
    await api.unlock(state.comp.id, id);
    App.toast('已解鎖', 'ok');
    await load();
  });

  $('#export-csv').onclick = () => {
    if (!state.comp) return;
    const school = Object.fromEntries(state.schools.map(s => [s.id, s]));
    const athlete = Object.fromEntries(state.athletes.map(a => [a.id, a]));
    const event = Object.fromEntries(state.events.map(e => [e.id, e]));
    const order = Object.fromEntries(state.events.map((e, i) => [e.id, i]));
    const rows = state.regs.slice()
      .sort((a, b) => order[a.event_id] - order[b.event_id] || (school[a.school_id]?.code || '').localeCompare(school[b.school_id]?.code || ''))
      .map(r => {
        const s = school[r.school_id] || {}, a = athlete[r.athlete_id] || {}, e = event[r.event_id] || {};
        return [App.groupLabel(e), e.name, App.kindLabel(e.kind), s.code, s.name, s.district, a.name,
          App.genderLabel(a.gender), a.grade, a.student_no, state.subs.some(x => x.school_id === r.school_id) ? '已送出' : '未送出'];
      });
    App.downloadCSV(`${state.comp.name}_報名資料.csv`,
      [['組別', '項目', '類別', '學校代碼', '學校', '行政區', '選手', '性別', '年級', '學號', '送出狀態'], ...rows]);
  };

  // ---------- 賽事設定 ----------
  function renderComp() {
    const c = state.comp || { registration_open: false, max_events_per_athlete: 2, max_per_school: 2 };
    fill($('#comp-form'), { ...c, registration_deadline: App.toLocalInput(c.registration_deadline) });
  }
  $('#comp-form').onsubmit = guard(async ev => {
    ev.preventDefault();
    const f = ev.target;
    const d = App.formData(f);
    const comp = {
      ...(state.comp || { is_active: true }),
      name: d.name, start_date: d.start_date, end_date: d.end_date, venue: d.venue,
      registration_open: f.elements.registration_open.checked,
      registration_deadline: App.fromLocalInput(d.registration_deadline),
      max_events_per_athlete: Number(d.max_events_per_athlete), max_per_school: Number(d.max_per_school)
    };
    if (!d.id) delete comp.id;
    await api.saveCompetition(comp);
    App.toast('已儲存賽事設定', 'ok');
    await load();
  });

  // ---------- 競賽項目 ----------
  $('#grade-boxes').innerHTML = [1, 2, 3, 4, 5, 6].map(g =>
    `<label class="check"><input type="checkbox" name="grade" value="${g}">${App.gradeLabel(g).replace('年級', '')}</label>`).join('');

  function renderEvents() {
    $('#event-table').innerHTML = !state.comp ? '<p class="muted">請先建立賽事。</p>' : `<table>
      <thead><tr><th>排序</th><th>組別</th><th>項目</th><th>類別</th><th>年級</th><th class="num">每校上限</th><th class="num">報名數</th><th></th></tr></thead>
      <tbody>${state.events.map(e => `<tr><td>${e.sort ?? ''}</td><td>${esc(App.groupLabel(e))}</td><td>${esc(e.name)}</td>
        <td>${App.kindLabel(e.kind)}</td><td>${(e.grades || []).join('、')}</td>
        <td class="num">${e.max_per_school ?? `<span class="muted">${state.comp.max_per_school}</span>`}</td>
        <td class="num">${state.regs.filter(r => r.event_id === e.id).length}</td>
        <td class="num"><button class="btn btn-sm" data-edit="${e.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-del="${e.id}">刪除</button></td></tr>`).join('')}</tbody></table>`;
  }
  const eventForm = $('#event-form');
  const resetEventForm = () => {
    eventForm.reset();
    eventForm.elements.id.value = '';
    $('#event-form-title').textContent = '新增項目';
  };
  eventForm.onsubmit = guard(async ev => {
    ev.preventDefault();
    if (!state.comp) throw new Error('請先建立賽事');
    const d = App.formData(eventForm);
    const grades = $$('input[name=grade]:checked', eventForm).map(x => Number(x.value));
    if (!grades.length) throw new Error('請至少勾選一個年級');
    const e = {
      competition_id: state.comp.id, group_name: d.group_name.trim(), gender: d.gender, name: d.name.trim(), kind: d.kind,
      grades, max_per_school: d.max_per_school ? Number(d.max_per_school) : null,
      sort: d.sort === '' ? state.events.length : Number(d.sort)
    };
    if (d.id) e.id = d.id;
    await api.saveEvent(e);
    App.toast('已儲存項目', 'ok');
    resetEventForm();
    await load();
  });
  $('#event-cancel').onclick = ev => { ev.preventDefault(); resetEventForm(); };
  $('#event-table').onclick = guard(async ev => {
    const { edit, del } = ev.target.dataset;
    if (edit) {
      const e = state.events.find(x => x.id === edit);
      fill(eventForm, e);
      $$('input[name=grade]', eventForm).forEach(cb => (cb.checked = (e.grades || []).includes(Number(cb.value))));
      $('#event-form-title').textContent = `編輯項目：${App.eventLabel(e)}`;
      eventForm.scrollIntoView({ behavior: 'smooth' });
    }
    if (del) {
      const e = state.events.find(x => x.id === del);
      const n = state.regs.filter(r => r.event_id === del).length;
      if (!confirm(`確定刪除「${App.eventLabel(e)}」？${n ? `\n已有 ${n} 筆報名將一併刪除！` : ''}`)) return;
      await api.deleteEvent(del);
      await load();
    }
  });

  // ---------- 學校與帳號 ----------
  function renderSchools() {
    $('#school-table').innerHTML = `<table><thead><tr><th>代碼</th><th>校名</th><th>行政區</th><th class="num">選手數</th><th></th></tr></thead>
      <tbody>${state.schools.map(s => `<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td>${esc(s.district)}</td>
        <td class="num">${state.athletes.filter(a => a.school_id === s.id).length}</td>
        <td class="num"><button class="btn btn-sm" data-edit="${s.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-del="${s.id}">刪除</button></td></tr>`).join('')}</tbody></table>`;

    $('#account-help').textContent = api.mode === 'demo'
      ? '示範模式的帳號為內建資料。正式模式下，請先在 Supabase 後台 Authentication > Users 建立帳號，再於此處指定角色與學校。'
      : '新帳號請在 Supabase 後台 Authentication > Users 以「Add user」建立（勾選 Auto Confirm），建立後會出現在下表，再指定角色與所屬學校。';
    const schoolOpts = sel => '<option value="">（未指定）</option>' + state.schools.map(s =>
      `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.code)} ${esc(s.name)}</option>`).join('');
    $('#profile-table').innerHTML = `<table><thead><tr><th>帳號</th><th>顯示名稱</th><th>角色</th><th>所屬學校</th><th></th></tr></thead>
      <tbody>${state.profiles.map(p => `<tr data-pid="${p.id}"><td>${esc(p.email)}</td>
        <td><input name="display_name" value="${esc(p.display_name)}" size="12"></td>
        <td><select name="role"><option value="school" ${p.role === 'school' ? 'selected' : ''}>學校承辦人</option>
          <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>大會管理員</option></select></td>
        <td><select name="school_id">${schoolOpts(p.school_id)}</select></td>
        <td><button class="btn btn-sm" data-save-profile="${p.id}" ${p.id === session.profile.id ? 'title="請勿移除自己的管理員權限"' : ''}>儲存</button></td></tr>`).join('')}</tbody></table>`;
  }
  const schoolForm = $('#school-form');
  const resetSchoolForm = () => {
    schoolForm.reset();
    schoolForm.elements.id.value = '';
    $('#school-form-title').textContent = '新增學校';
  };
  schoolForm.onsubmit = guard(async ev => {
    ev.preventDefault();
    const d = App.formData(schoolForm);
    if (!d.id) delete d.id;
    await api.saveSchool(d);
    App.toast('已儲存學校', 'ok');
    resetSchoolForm();
    await load();
  });
  $('#school-cancel').onclick = ev => { ev.preventDefault(); resetSchoolForm(); };
  $('#school-table').onclick = guard(async ev => {
    const { edit, del } = ev.target.dataset;
    if (edit) {
      fill(schoolForm, state.schools.find(s => s.id === edit));
      $('#school-form-title').textContent = '編輯學校';
    }
    if (del && confirm('確定刪除此學校？')) {
      await api.deleteSchool(del);
      await load();
    }
  });
  $('#profile-table').onclick = guard(async ev => {
    const id = ev.target.dataset.saveProfile;
    if (!id) return;
    const tr = ev.target.closest('tr');
    const p = {
      id, display_name: $('[name=display_name]', tr).value,
      role: $('[name=role]', tr).value, school_id: $('[name=school_id]', tr).value || null
    };
    if (id === session.profile.id && p.role !== 'admin' && !confirm('您正在移除自己的管理員權限，確定？')) return;
    await api.saveProfile(p);
    App.toast('已更新帳號', 'ok');
    await load();
  });

  // ---------- 公告 ----------
  function renderNews() {
    $('#news-list').innerHTML = state.news.length ? state.news.map(n => `<article style="margin-bottom:14px">
      <div class="row"><h3 style="margin:0">${esc(n.title)}</h3><span class="muted small">${App.fmtDateTime(n.created_at)}</span>
        <span class="spacer"></span><button class="btn btn-sm btn-danger" data-del="${n.id}">刪除</button></div>
      <div style="white-space:pre-wrap">${esc(n.body)}</div></article>`).join('') : '<p class="muted">尚無公告。</p>';
  }
  $('#news-form').onsubmit = guard(async ev => {
    ev.preventDefault();
    await api.saveAnnouncement(App.formData(ev.target));
    ev.target.reset();
    App.toast('已發布', 'ok');
    await load();
  });
  $('#news-list').onclick = guard(async ev => {
    if (ev.target.dataset.del && confirm('確定刪除此公告？')) {
      await api.deleteAnnouncement(ev.target.dataset.del);
      await load();
    }
  });

  App.tabs();
  await guard(load)();
})(window.App);
