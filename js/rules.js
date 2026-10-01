// 報名檢核規則（前端即時提示用；正式模式下資料庫 trigger 會再檢核一次）
window.App = window.App || {};
(function (App) {
  const rules = {
    eventLimit: (event, comp) => event.max_per_school ?? comp.max_per_school,

    eligible: (athlete, event) =>
      athlete.gender === event.gender && (event.grades || []).includes(Number(athlete.grade)),

    // 選手已報的個人項目數（接力不計）
    individualCount(athleteId, regs, eventsById) {
      return regs.filter(r => r.athlete_id === athleteId &&
        eventsById[r.event_id] && eventsById[r.event_id].kind !== 'relay').length;
    },

    schoolEventCount: (eventId, schoolId, regs) =>
      regs.filter(r => r.event_id === eventId && r.school_id === schoolId).length,

    // 回傳錯誤訊息；可報名則回傳 null
    check({ competition, event, athlete, regs, eventsById, locked, isAdmin }) {
      if (!isAdmin) {
        if (!App.isRegOpen(competition)) return '報名未開放或已截止';
        if (locked) return '本校報名已送出鎖定，如需修改請洽大會承辦人解鎖';
      }
      if (athlete.gender !== event.gender) return `${athlete.name} 性別不符此項目`;
      if (!(event.grades || []).includes(Number(athlete.grade))) return `${athlete.name} 年級不符此項目`;
      if (regs.some(r => r.athlete_id === athlete.id && r.event_id === event.id)) return `${athlete.name} 已報名此項目`;
      if (event.kind !== 'relay') {
        const n = rules.individualCount(athlete.id, regs, eventsById);
        if (n >= competition.max_events_per_athlete)
          return `${athlete.name} 個人項目已達上限（${competition.max_events_per_athlete} 項）`;
      }
      const lim = rules.eventLimit(event, competition);
      if (rules.schoolEventCount(event.id, athlete.school_id, regs) >= lim)
        return `本校「${App.eventLabel(event)}」已達報名上限（${lim} 人）`;
      return null;
    }
  };
  App.rules = rules;
})(window.App);
