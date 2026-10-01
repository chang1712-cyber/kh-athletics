(async function (App) {
  const { $, $$, esc, api, rules } = App;
  const session = await App.requireRole('school');
  App.renderHeader(session, 'school');
  const schoolId = session.profile.school_id;

  const state = { comp: null, school: null, events: [], eventsById: {}, athletes: [], regs: [], locked: false, submittedAt: null };

  async function load() {
    const [comp, schools] = await Promise.all([api.getActiveCompetition(), api.listSchools()]);
    state.comp = comp;
    state.school = schools.find(s => s.id === schoolId);
    state.athletes = await api.listAthletes(schoolId);
    if (comp) {
      const [events, regs, subs] = await Promise.all([
        api.listEvents(comp.id), api.listRegistrations(comp.id, schoolId), api.listSubmissions(comp.id)]);
      state.events = App.sortEvents(events);
      state.eventsById = Object.fromEntries(events.map(e => [e.id, e]));
      state.regs = regs;
      const sub = subs.find(s => s.school_id === schoolId);
      state.locked = !!sub;
      state.submittedAt = sub && sub.submitted_at;
    }
    render();
  }

  const sortAthletes = list => list.slice().sort((a, b) =>
    a.gender.localeCompare(b.gender) || b.grade - a.grade || a.name.localeCompare(b.name, 'zh-Hant'));
  const canEdit = () => App.isRegOpen(state.comp) && !state.locked;

  function render() {
    const { comp } = state;
    $('#title').textContent = `${state.school ? state.school.name : ''}　報名`;
    $('#status').innerHTML = !comp ? '<span class="badge badge-danger">目前沒有進行中的賽事</span>' : `
      <strong>${esc(comp.name)}</strong>
      ${App.isRegOpen(comp) ? '<span class="badge badge-ok">報名開放中</span>' : '<span class="badge badge-danger">報名未開放／已截止</span>'}
      ${state.locked ? '<span class="badge badge-warn">本校已送出鎖定</span>' : ''}
      <span class="muted small">截止：${App.fmtDateTime(comp.registration_deadline)}</span>`;
    renderAthletes();
    renderMatrix();
    renderSummary();
  }

  // ---------- 選手管理 ----------
  function renderAthletes() {
    const list = sortAthletes(state.athletes);
    const count = id => state.regs.filter(r => r.athlete_id === id).length;
    $('#athlete-count').textContent = `共 ${list.length} 人`;
    $('#athlete-table').innerHTML = list.length ? `<table>
      <thead><tr><th>姓名</th><th>性別</th><th>年級</th><th>學號</th><th class="num">已報項目</th><th></th></tr></thead>
      <tbody>${list.map(a => `<tr>
        <td>${esc(a.name)}</td><td>${App.genderLabel(a.gender)}</td><td>${App.gradeLabel(a.grade)}</td>
        <td>${esc(a.student_no)}</td><td class="num">${count(a.id)}</td>
        <td class="num"><button class="btn btn-sm" data-edit="${a.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-del="${a.id}">刪除</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">尚未建立選手，請先在上方新增或批次匯入。</p>';
  }

  const form = $('#athlete-form');
  const field = k => form.elements[k]; // 不能用 form.id / form.name，會取到 form 本身的屬性
  form.onsubmit = async ev => {
    ev.preventDefault();
    const data = App.formData(form);
    if (!data.id) delete data.id;
    try {
      await api.saveAthlete({ ...data, name: data.name.trim(), school_id: schoolId });
      App.toast('已儲存', 'ok');
      form.reset();
      field('id').value = '';
      $('#athlete-form-title').textContent = '新增選手';
      await load();
    } catch (e) { App.toast(App.errMsg(e), 'error'); }
  };
  $('#athlete-cancel').onclick = () => {
    field('id').value = '';
    $('#athlete-form-title').textContent = '新增選手';
  };
  $('#athlete-table').onclick = async ev => {
    const edit = ev.target.dataset.edit, del = ev.target.dataset.del;
    if (edit) {
      const a = state.athletes.find(x => x.id === edit);
      for (const k of ['id', 'name', 'gender', 'grade', 'student_no']) field(k).value = a[k] ?? '';
      $('#athlete-form-title').textContent = `編輯選手：${a.name}`;
      form.scrollIntoView({ behavior: 'smooth' });
    }
    if (del) {
      const a = state.athletes.find(x => x.id === del);
      const n = state.regs.filter(r => r.athlete_id === del).length;
      if (!confirm(`確定刪除 ${a.name}？${n ? `\n此選手已報名 ${n} 個項目，將一併取消。` : ''}`)) return;
      try { await api.deleteAthlete(del); await load(); } catch (e) { App.toast(App.errMsg(e), 'error'); }
    }
  };

  $('#import-btn').onclick = async () => {
    const lines = $('#import-text').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = [], bad = [];
    lines.forEach((line, i) => {
      const [name, g, grade, no] = line.split(/\t|,/).map(s => (s || '').trim());
      const gender = { 男: 'M', 女: 'F', M: 'M', F: 'F' }[g];
      const gr = Number(grade);
      if (!name || !gender || !(gr >= 1 && gr <= 6)) bad.push(i + 1);
      else rows.push({ name, gender, grade: gr, student_no: no || '', school_id: schoolId });
    });
    if (bad.length) return App.toast(`第 ${bad.join('、')} 行格式錯誤，請檢查性別（男/女）與年級（1-6）`, 'error');
    if (!rows.length) return App.toast('沒有可匯入的資料', 'error');
    const dup = rows.filter(r => state.athletes.some(a => a.name === r.name && a.student_no === r.student_no));
    if (dup.length && !confirm(`有 ${dup.length} 位選手可能已存在（姓名與學號相同），仍要匯入？`)) return;
    try {
      for (const r of rows) await api.saveAthlete(r);
      $('#import-text').value = '';
      App.toast(`已匯入 ${rows.length} 位選手`, 'ok');
      await load();
    } catch (e) { App.toast(App.errMsg(e), 'error'); await load(); }
  };

  // ---------- 報名矩陣 ----------
  function renderMatrix() {
    const { comp } = state;
    if (!comp) return ($('#matrix').innerHTML = '');
    const editable = canEdit();
    let html = editable ? '' : `<p class="notice">${state.locked ? '本校報名已送出鎖定，目前僅供檢視。' : '報名未開放或已截止，目前僅供檢視。'}</p>`;
    for (const gender of ['M', 'F']) {
      const events = state.events.filter(e => e.gender === gender);
      const athletes = sortAthletes(state.athletes.filter(a => a.gender === gender));
      if (!events.length) continue;
      html += `<div class="card"><h2>${App.genderLabel(gender)}童</h2>`;
      if (!athletes.length) { html += '<p class="muted">尚無選手。</p></div>'; continue; }
      html += `<div class="table-wrap"><table class="matrix"><thead><tr><th>選手</th>
        ${events.map(e => {
          const n = rules.schoolEventCount(e.id, schoolId, state.regs), lim = rules.eventLimit(e, comp);
          return `<th class="${n >= lim ? 'full' : ''}"><span class="ev">${esc(e.group_name)}</span><span class="ev">${esc(e.name)}</span>
            <span class="cnt">${n}/${lim}</span></th>`;
        }).join('')}
        <th>個人項目</th></tr></thead><tbody>`;
      for (const a of athletes) {
        const n = rules.individualCount(a.id, state.regs, state.eventsById);
        html += `<tr><td>${esc(a.name)} <span class="muted small">${App.gradeLabel(a.grade)}</span></td>`;
        for (const e of events) {
          if (!rules.eligible(a, e)) { html += '<td class="na">—</td>'; continue; }
          const reg = state.regs.find(r => r.athlete_id === a.id && r.event_id === e.id);
          html += `<td><input type="checkbox" data-a="${a.id}" data-e="${e.id}" ${reg ? 'checked' : ''} ${editable ? '' : 'disabled'}
            aria-label="${esc(a.name)} 報名 ${esc(App.eventLabel(e))}"></td>`;
        }
        html += `<td class="${n >= comp.max_events_per_athlete ? 'full' : ''}">${n}/${comp.max_events_per_athlete}</td></tr>`;
      }
      html += '</tbody></table></div></div>';
    }
    $('#matrix').innerHTML = html;
  }

  $('#matrix').onchange = async ev => {
    const cb = ev.target;
    if (cb.type !== 'checkbox') return;
    const athlete = state.athletes.find(a => a.id === cb.dataset.a);
    const event = state.eventsById[cb.dataset.e];
    cb.disabled = true;
    try {
      if (cb.checked) {
        const err = rules.check({ competition: state.comp, event, athlete, regs: state.regs, eventsById: state.eventsById, locked: state.locked });
        if (err) throw new Error(err);
        state.regs.push(await api.addRegistration(event.id, athlete.id));
      } else {
        const reg = state.regs.find(r => r.athlete_id === athlete.id && r.event_id === event.id);
        await api.removeRegistration(reg.id);
        state.regs = state.regs.filter(r => r !== reg);
      }
    } catch (e) {
      cb.checked = !cb.checked;
      App.toast(App.errMsg(e), 'error');
    }
    renderMatrix();
    renderAthletes();
    renderSummary();
  };

  // ---------- 總覽、送出、列印 ----------
  function renderSummary() {
    const { comp } = state;
    if (!comp) return ($('#summary').innerHTML = '');
    const athleteById = Object.fromEntries(state.athletes.map(a => [a.id, a]));
    $('#submit-status').innerHTML = state.locked
      ? `<span class="badge badge-warn">已於 ${App.fmtDateTime(state.submittedAt)} 送出鎖定</span>`
      : `<span class="muted">尚未送出。確認無誤後請按「確認送出並鎖定」，送出後即無法再修改。</span>`;
    $('#submit-btn').disabled = state.locked || !App.isRegOpen(comp) || !state.regs.length;

    const rows = state.events.map(e => {
      const names = state.regs.filter(r => r.event_id === e.id).map(r => athleteById[r.athlete_id]).filter(Boolean)
        .map(a => `${esc(a.name)}（${App.gradeLabel(a.grade)}）`);
      return names.length ? `<tr><td>${esc(App.eventLabel(e))}</td><td class="num">${names.length}</td><td>${names.join('、')}</td></tr>` : '';
    }).join('');
    const athletesIn = new Set(state.regs.map(r => r.athlete_id)).size;

    $('#summary').innerHTML = `
      <h2>${esc(comp.name)}　報名表</h2>
      <p><strong>學校：</strong>${esc(state.school ? state.school.name : '')}
        <strong>參賽選手：</strong>${athletesIn} 人　<strong>報名人次：</strong>${state.regs.length}
        ${state.locked ? `　<strong>送出時間：</strong>${App.fmtDateTime(state.submittedAt)}` : ''}</p>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>項目</th><th class="num">人數</th><th>選手</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="muted">尚未報名任何項目。</p>'}
      <div class="print-only" style="margin-top:40px">
        <table><tr><th>承辦人</th><th>體育組長</th><th>學務主任</th><th>校長</th></tr>
        <tr><td style="height:70px"></td><td></td><td></td><td></td></tr></table>
      </div>`;
  }

  $('#submit-btn').onclick = async () => {
    if (!confirm('送出後本校報名資料將鎖定，無法再新增或修改。確定送出？')) return;
    try {
      await api.submit(state.comp.id, schoolId);
      App.toast('已送出並鎖定', 'ok');
      await load();
    } catch (e) { App.toast(App.errMsg(e), 'error'); }
  };

  App.tabs();
  try { await load(); } catch (e) { App.toast('載入失敗：' + App.errMsg(e), 'error'); }
})(window.App);
