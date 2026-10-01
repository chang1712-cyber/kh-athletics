// 資料存取層：同一組介面，兩種後端
//   - demo：資料存在瀏覽器 localStorage（未設定 Supabase 時）
//   - supabase：正式資料庫，權限由 RLS 控管
window.App = window.App || {};
(function (App) {
  const cfg = window.APP_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ======================================================================
  // 示範模式
  // ======================================================================
  function demoBackend() {
    const KEY = 'tf-demo-v1';
    const SESSION_KEY = 'tf-demo-session';
    let memory = null; // localStorage 不可用時的備援

    function seed() {
      const comp = {
        id: 'c1', name: '115學年度高雄市國小田徑錦標賽',
        start_date: '2026-11-18', end_date: '2026-11-20', venue: '高雄市立中正運動場',
        registration_open: true, registration_deadline: '2026-10-31T15:59:00.000Z',
        max_events_per_athlete: 2, max_per_school: 2, is_active: true
      };
      const events = [];
      let sort = 0;
      const add = (group, grades, gender, name, kind, max) => events.push({
        id: uid(), competition_id: comp.id, group_name: group, gender, name, kind,
        grades, max_per_school: max ?? null, sort: sort++
      });
      for (const g of ['M', 'F']) {
        for (const [n, k] of [['100公尺', 'track'], ['200公尺', 'track'], ['400公尺', 'track'], ['800公尺', 'track'],
          ['跳遠', 'field'], ['跳高', 'field'], ['壘球擲遠', 'field']]) add('高年級', [5, 6], g, n, k);
        add('高年級', [5, 6], g, '4×100公尺接力', 'relay', 6);
      }
      for (const g of ['M', 'F']) {
        for (const [n, k] of [['60公尺', 'track'], ['100公尺', 'track'], ['跳遠', 'field'], ['壘球擲遠', 'field']])
          add('中年級', [3, 4], g, n, k);
        add('中年級', [3, 4], g, '4×100公尺接力', 'relay', 6);
      }
      const schools = [
        ['A01', '示範國小', '苓雅區'], ['A02', '測試國小', '三民區'], ['A03', '範例國小', '鳳山區'],
        ['A04', '練習國小', '左營區'], ['A05', '體驗國小', '前鎮區']
      ].map(([code, name, district]) => ({ id: uid(), code, name, district }));
      const s1 = schools[0].id;
      const athletes = [
        ['王小明', 'M', 6], ['陳大文', 'M', 6], ['林志豪', 'M', 5], ['張家豪', 'M', 5], ['李承恩', 'M', 4],
        ['黃怡君', 'F', 6], ['吳佳穎', 'F', 6], ['劉雅婷', 'F', 5], ['蔡宜蓁', 'F', 5], ['鄭心妍', 'F', 3]
      ].map(([name, gender, grade], i) => ({
        id: uid(), school_id: s1, name, gender, grade, student_no: String(110001 + i), created_at: new Date().toISOString()
      }));
      const ev = (group, gender, name) => events.find(e => e.group_name === group && e.gender === gender && e.name === name);
      const registrations = [
        [athletes[0], ev('高年級', 'M', '100公尺')], [athletes[0], ev('高年級', 'M', '跳遠')],
        [athletes[1], ev('高年級', 'M', '100公尺')], [athletes[5], ev('高年級', 'F', '200公尺')]
      ].map(([a, e]) => ({
        id: uid(), competition_id: comp.id, event_id: e.id, athlete_id: a.id, school_id: s1, created_at: new Date().toISOString()
      }));
      const profiles = [{ id: 'demo-admin', email: 'admin@demo', role: 'admin', school_id: null, display_name: '大會承辦人' }]
        .concat(schools.map(s => ({ id: 'demo-' + s.id, email: s.code.toLowerCase() + '@demo', role: 'school', school_id: s.id, display_name: s.name + '承辦人' })));
      const announcements = [{
        id: uid(), title: '歡迎使用報名系統（示範資料）',
        body: '目前為示範模式，資料只存在您的瀏覽器中。可用「登入」頁的示範帳號體驗學校報名與後台管理。',
        created_at: new Date().toISOString()
      }];
      return { competitions: [comp], events, schools, athletes, registrations, submissions: [], profiles, announcements };
    }

    function load() {
      if (memory) return memory;
      try {
        const s = localStorage.getItem(KEY);
        if (s) return (memory = JSON.parse(s));
      } catch (e) { /* 忽略，改用記憶體 */ }
      memory = seed();
      persist();
      return memory;
    }
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* 記憶體模式 */ }
    }
    const db = () => load();
    const clone = x => JSON.parse(JSON.stringify(x));
    const ok = x => Promise.resolve(clone(x));
    const fail = msg => Promise.reject(new Error(msg));

    function upsert(table, obj) {
      const rows = db()[table];
      if (obj.id) {
        const i = rows.findIndex(r => r.id === obj.id);
        if (i >= 0) { rows[i] = { ...rows[i], ...obj }; persist(); return ok(rows[i]); }
      }
      const row = { ...obj, id: obj.id || uid(), created_at: new Date().toISOString() };
      rows.push(row);
      persist();
      return ok(row);
    }
    function remove(table, id) {
      db()[table] = db()[table].filter(r => r.id !== id);
      persist();
      return ok(true);
    }
    function session() {
      try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
    }
    const activeComp = () => db().competitions.find(c => c.is_active) || db().competitions[0];
    const isLocked = (compId, schoolId) => db().submissions.some(s => s.competition_id === compId && s.school_id === schoolId);
    const isAdmin = () => (session() || {}).profile?.role === 'admin';

    return {
      mode: 'demo',
      async getSession() {
        const s = session();
        if (!s) return null;
        const p = db().profiles.find(x => x.id === s.profile_id);
        return p ? { user: { email: p.email }, profile: clone(p) } : null;
      },
      signIn: () => fail('示範模式請使用下方的示範帳號按鈕登入'),
      async signInDemo(profileId) {
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ profile_id: profileId, profile: db().profiles.find(p => p.id === profileId) })); } catch (e) { /* ignore */ }
        return this.getSession();
      },
      async signOut() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } },
      async resetDemo() { memory = seed(); persist(); },

      getActiveCompetition: () => ok(activeComp() || null),
      saveCompetition: c => upsert('competitions', c),

      listEvents: compId => ok(db().events.filter(e => e.competition_id === compId)),
      saveEvent: e => upsert('events', e),
      deleteEvent(id) {
        db().registrations = db().registrations.filter(r => r.event_id !== id);
        return remove('events', id);
      },

      listSchools: () => ok(db().schools.slice().sort((a, b) => a.code.localeCompare(b.code))),
      saveSchool: s => upsert('schools', s),
      deleteSchool(id) {
        if (db().athletes.some(a => a.school_id === id)) return fail('此學校已有選手資料，無法刪除');
        return remove('schools', id);
      },

      listProfiles: () => ok(db().profiles),
      saveProfile: p => upsert('profiles', p),

      listAthletes: schoolId => ok(db().athletes.filter(a => !schoolId || a.school_id === schoolId)),
      saveAthlete(a) {
        const comp = activeComp();
        if (!isAdmin() && comp && isLocked(comp.id, a.school_id)) return fail('本校報名已鎖定，無法修改選手資料');
        return upsert('athletes', { ...a, grade: Number(a.grade) });
      },
      deleteAthlete(id) {
        const a = db().athletes.find(x => x.id === id);
        const comp = activeComp();
        if (a && !isAdmin() && comp && isLocked(comp.id, a.school_id)) return fail('本校報名已鎖定，無法刪除選手');
        db().registrations = db().registrations.filter(r => r.athlete_id !== id);
        return remove('athletes', id);
      },

      listRegistrations: (compId, schoolId) =>
        ok(db().registrations.filter(r => r.competition_id === compId && (!schoolId || r.school_id === schoolId))),
      addRegistration(eventId, athleteId) {
        const d = db();
        const event = d.events.find(e => e.id === eventId);
        const athlete = d.athletes.find(a => a.id === athleteId);
        const competition = d.competitions.find(c => c.id === event.competition_id);
        const eventsById = Object.fromEntries(d.events.map(e => [e.id, e]));
        const regs = d.registrations.filter(r => r.competition_id === competition.id);
        const err = App.rules.check({
          competition, event, athlete, regs, eventsById,
          locked: isLocked(competition.id, athlete.school_id), isAdmin: isAdmin()
        });
        if (err) return fail(err);
        return upsert('registrations', { competition_id: competition.id, event_id: eventId, athlete_id: athleteId, school_id: athlete.school_id });
      },
      removeRegistration(id) {
        const r = db().registrations.find(x => x.id === id);
        if (r && !isAdmin()) {
          const comp = db().competitions.find(c => c.id === r.competition_id);
          if (!App.isRegOpen(comp)) return fail('報名未開放或已截止');
          if (isLocked(r.competition_id, r.school_id)) return fail('本校報名已送出鎖定，如需修改請洽大會承辦人解鎖');
        }
        return remove('registrations', id);
      },

      listSubmissions: compId => ok(db().submissions.filter(s => s.competition_id === compId)),
      submit(compId, schoolId) {
        if (!isLocked(compId, schoolId)) {
          db().submissions.push({ competition_id: compId, school_id: schoolId, submitted_at: new Date().toISOString() });
          persist();
        }
        return ok(true);
      },
      unlock(compId, schoolId) {
        db().submissions = db().submissions.filter(s => !(s.competition_id === compId && s.school_id === schoolId));
        persist();
        return ok(true);
      },

      listAnnouncements: () => ok(db().announcements.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))),
      saveAnnouncement: a => upsert('announcements', a),
      deleteAnnouncement: id => remove('announcements', id),

      publicStats(compId) {
        const map = {};
        for (const r of db().registrations.filter(r => r.competition_id === compId)) {
          const k = r.event_id + '|' + r.school_id;
          map[k] = (map[k] || 0) + 1;
        }
        return ok(Object.entries(map).map(([k, n]) => {
          const [event_id, school_id] = k.split('|');
          return { event_id, school_id, n };
        }));
      }
    };
  }

  // ======================================================================
  // Supabase 正式模式
  // ======================================================================
  function supabaseBackend() {
    if (!window.supabase) throw new Error('無法載入 Supabase 函式庫，請檢查網路連線');
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const run = async q => {
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data;
    };
    const save = (table, obj) => {
      const o = { ...obj };
      if (!o.id) delete o.id;
      delete o.created_at;
      return run(sb.from(table).upsert(o).select().single());
    };
    const del = (table, id) => run(sb.from(table).delete().eq('id', id));

    return {
      mode: 'supabase',
      async getSession() {
        const { data } = await sb.auth.getSession();
        const user = data.session && data.session.user;
        if (!user) return null;
        const profile = await run(sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
        return profile ? { user, profile } : null;
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? '帳號或密碼錯誤' : error.message);
        return this.getSession();
      },
      signInDemo: () => Promise.reject(new Error('正式模式不提供示範帳號')),
      signOut: () => sb.auth.signOut(),
      // 邀請信、重設密碼信的連結會帶登入憑證回到 set-password.html
      async hasAuthUser() {
        const { data } = await sb.auth.getSession();
        return data.session ? data.session.user.email : null;
      },
      async updatePassword(password) {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw new Error(error.message);
      },
      async requestPasswordReset(email) {
        const redirectTo = new URL('set-password.html', location.href).href;
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw new Error(error.message);
      },

      getActiveCompetition: () => run(sb.from('competitions').select('*').eq('is_active', true)
        .order('start_date', { ascending: false }).limit(1).maybeSingle()),
      saveCompetition: c => save('competitions', c),

      listEvents: compId => run(sb.from('events').select('*').eq('competition_id', compId)),
      saveEvent: e => save('events', e),
      deleteEvent: id => del('events', id),

      listSchools: () => run(sb.from('schools').select('*').order('code')),
      saveSchool: s => save('schools', s),
      deleteSchool: id => del('schools', id),

      listProfiles: () => run(sb.from('profiles').select('*').order('email')),
      saveProfile: p => run(sb.from('profiles').update({ role: p.role, school_id: p.school_id || null, display_name: p.display_name })
        .eq('id', p.id).select().single()),

      listAthletes(schoolId) {
        let q = sb.from('athletes').select('*').order('grade', { ascending: false }).order('name');
        if (schoolId) q = q.eq('school_id', schoolId);
        return run(q);
      },
      saveAthlete: a => save('athletes', { ...a, grade: Number(a.grade) }),
      deleteAthlete: id => del('athletes', id),

      listRegistrations(compId, schoolId) {
        let q = sb.from('registrations').select('*').eq('competition_id', compId);
        if (schoolId) q = q.eq('school_id', schoolId);
        return run(q);
      },
      async addRegistration(eventId, athleteId) {
        // competition_id / school_id 由資料庫 trigger 依項目與選手自動填入並檢核
        return run(sb.from('registrations').insert({ event_id: eventId, athlete_id: athleteId }).select().single());
      },
      removeRegistration: id => del('registrations', id),

      listSubmissions: compId => run(sb.from('submissions').select('*').eq('competition_id', compId)),
      submit: (compId, schoolId) => run(sb.from('submissions').insert({ competition_id: compId, school_id: schoolId })),
      unlock: (compId, schoolId) => run(sb.from('submissions').delete().eq('competition_id', compId).eq('school_id', schoolId)),

      listAnnouncements: () => run(sb.from('announcements').select('*').order('created_at', { ascending: false })),
      saveAnnouncement: a => save('announcements', a),
      deleteAnnouncement: id => del('announcements', id),

      publicStats: compId => run(sb.rpc('public_registration_stats', { comp_id: compId }))
    };
  }

  App.api = useSupabase ? supabaseBackend() : demoBackend();
})(window.App);
