export function getInitialData() {
  const today = new Date().toISOString().split('T')[0];
  return {
    startDate: today,
    totalImportedDays: 7,
    currentStreak: 0,
    lastActiveDate: null,
    subjects: [],
    topics: []
  }
}

export function loadState() {
  const data = localStorage.getItem('studyos_data_v3');
  if (!data) {
    // Migrate from v2 if exists
    const oldData = localStorage.getItem('studyos_data_v2');
    if (oldData) {
      const parsed = JSON.parse(oldData);
      parsed.currentStreak = 0;
      parsed.lastActiveDate = null;
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
  localStorage.setItem('studyos_data_v3', JSON.stringify(state));
}
