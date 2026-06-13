export function getInitialData() {
  const today = new Date().toISOString().split('T')[0];
  return {
    startDate: today,
    totalImportedDays: 7,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    subjects: [],
    topics: [],
    dailyNotes: {},
    history: []
  }
}

export function loadState() {
  const data = localStorage.getItem('studyos_data_v4');
  if (!data) {
    // Migration
    const oldData = localStorage.getItem('studyos_data_v3') || localStorage.getItem('studyos_data_v2');
    if (oldData) {
      const parsed = JSON.parse(oldData);
      parsed.longestStreak = parsed.currentStreak || 0;
      parsed.dailyNotes = parsed.dailyNotes || {};
      parsed.history = parsed.history || [];
      parsed.topics.forEach(t => t.carryForwardTimes = t.carryForwardTimes || 0);
      saveState(parsed);
      return parsed;
    }
    const init = getInitialData();
    saveState(init);
    return init;
  }
  return JSON.parse(data);
}

export function saveState(state) {
  localStorage.setItem('studyos_data_v4', JSON.stringify(state));
}
