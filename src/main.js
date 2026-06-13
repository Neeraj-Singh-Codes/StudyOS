import './style.css';
import { createIcons, icons } from 'lucide';
import { gsap } from 'gsap';
import { loadState, saveState } from './storage';

let state = null;
let currentExpandedSubjectId = null;
let studyQueue = [];
let studyCurrentIndex = 0;
let currentNotesTopicId = null;
let importedDataCache = null; // for preview

function init() {
  state = loadState();
  setupUI();
  
  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('import-start-date');
  if (dateInput) dateInput.value = state.startDate || todayStr;

  // Render Daily Notes text
  document.getElementById('daily-notes-input').value = state.dailyNotes[todayStr] || '';
  document.getElementById('daily-notes-input').addEventListener('input', (e) => {
    state.dailyNotes[todayStr] = e.target.value;
    saveState(state);
  });

  updateStreakDisplay();
  switchView('today');
}

function setupUI() {
  createIcons({ icons });

  document.getElementById('nav-today').addEventListener('click', () => switchView('today'));
  document.getElementById('nav-weekly').addEventListener('click', () => switchView('weekly'));
  document.getElementById('nav-review').addEventListener('click', () => switchView('review'));
  document.getElementById('nav-history').addEventListener('click', () => switchView('history'));
  document.getElementById('nav-import').addEventListener('click', () => switchView('import'));

  // Quick Capture
  document.getElementById('quick-capture-fab').addEventListener('click', () => {
    document.getElementById('qc-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('qc-modal').classList.remove('opacity-0'), 10);
  });
  document.getElementById('qc-cancel').addEventListener('click', () => {
    document.getElementById('qc-modal').classList.add('opacity-0');
    setTimeout(() => document.getElementById('qc-modal').classList.add('hidden'), 300);
  });
  document.getElementById('qc-save').addEventListener('click', () => {
    const subName = document.getElementById('qc-subject').value.trim();
    const title = document.getElementById('qc-title').value.trim();
    if(subName && title) {
      let subId = subName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      let subject = state.subjects.find(s => s.id === subId);
      if(!subject) {
        subject = { id: subId, name: subName, color: '#3B82F6' };
        state.subjects.push(subject);
      }
      state.topics.push({
        id: Date.now().toString(),
        subjectId: subId,
        title: title,
        plannedDay: getDaysSinceStart(),
        completed: false,
        notes: '',
        carryForwardTimes: 0
      });
      saveState(state);
      document.getElementById('qc-subject').value = '';
      document.getElementById('qc-title').value = '';
      document.getElementById('qc-modal').classList.add('opacity-0');
      setTimeout(() => document.getElementById('qc-modal').classList.add('hidden'), 300);
      if(!document.getElementById('view-today').classList.contains('hidden')) renderToday();
    }
  });

  // Import flow
  document.getElementById('import-preview-btn').addEventListener('click', showImportPreview);
  document.getElementById('import-preview-cancel').addEventListener('click', () => {
    document.getElementById('import-preview-modal').classList.add('opacity-0');
    setTimeout(() => document.getElementById('import-preview-modal').classList.add('hidden'), 300);
  });
  document.getElementById('import-preview-confirm').addEventListener('click', confirmImport);

  // Search
  document.getElementById('global-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if(q.length > 0) {
      switchView('search');
      renderSearch(q);
    } else {
      switchView('today');
    }
  });

  // Study Mode
  document.getElementById('start-study-btn').addEventListener('click', startStudyMode);
  document.getElementById('close-study-btn').addEventListener('click', closeStudyMode);
  document.getElementById('study-complete-btn').addEventListener('click', completeStudyTopic);
  document.getElementById('study-skip-btn').addEventListener('click', skipStudyTopic);
  document.getElementById('study-notes-btn').addEventListener('click', () => openNotes(studyQueue[studyCurrentIndex]?.id));

  document.getElementById('close-notes-btn').addEventListener('click', closeNotes);
  document.getElementById('save-notes-btn').addEventListener('click', saveNotes);

  // Start New Week
  document.getElementById('start-new-week-btn').addEventListener('click', archiveWeek);

  // Backup
  document.getElementById('backup-export').addEventListener('click', exportBackup);
  document.getElementById('backup-file-input').addEventListener('change', importBackup);
}

function updateStreakDisplay() {
  document.getElementById('streak-display').textContent = `${state.currentStreak || 0} Day Streak`;
}

function handleTaskCompletion(topic) {
  const currentDay = getDaysSinceStart();
  if(!topic.completed) {
    topic.completed = true;
    topic.carryForwardTimes = currentDay > topic.plannedDay ? (currentDay - topic.plannedDay) : 0;
    
    // Streak logic
    const todayStr = new Date().toISOString().split('T')[0];
    if (state.lastActiveDate !== todayStr) {
      if (!state.lastActiveDate) {
        state.currentStreak = 1;
      } else {
        const lastDt = new Date(state.lastActiveDate);
        const todayDt = new Date(todayStr);
        const diffDays = Math.floor((todayDt - lastDt) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) state.currentStreak += 1;
        else if (diffDays > 1) state.currentStreak = 1;
      }
      state.lastActiveDate = todayStr;
      if (state.currentStreak > state.longestStreak) state.longestStreak = state.currentStreak;
    }
  } else {
    topic.completed = false;
  }
  
  saveState(state);
  updateStreakDisplay();
}

// Bulk complete
window.completeSubjectToday = function(subId) {
  const currentDay = getDaysSinceStart();
  state.topics.filter(t => t.subjectId === subId && t.plannedDay <= currentDay && !t.completed)
    .forEach(t => handleTaskCompletion(t));
  renderToday();
}

function switchView(viewName) {
  document.querySelectorAll('.view-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`view-${viewName}`).classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('bg-primary/10', 'text-primary');
    el.classList.add('text-slate-400', 'hover:bg-slate-800/50');
  });
  const activeNav = document.getElementById(`nav-${viewName}`);
  if (activeNav) {
    activeNav.classList.remove('text-slate-400', 'hover:bg-slate-800/50');
    activeNav.classList.add('bg-primary/10', 'text-primary');
  }

  if (viewName === 'today') renderToday();
  if (viewName === 'weekly') renderWeekly();
  if (viewName === 'review') renderReview();
  if (viewName === 'history') renderHistory();
}

function getDaysSinceStart() {
  if (!state.startDate) return 1;
  const start = new Date(state.startDate);
  start.setHours(0,0,0,0);
  const now = new Date();
  now.setHours(0,0,0,0);
  const diffTime = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays + 1 : 1; 
}

function showImportPreview() {
  const text = document.getElementById('import-textarea').value;
  const startDateStr = document.getElementById('import-start-date').value;
  if (!text.trim()) return alert("Please paste a roadmap.");

  const lines = text.split('\n');
  const newTopics = [];
  let currentSubject = null;
  let currentDay = 1;
  const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4'];
  const subjectsMap = {};

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    const dayMatch = line.match(/^Day\s+(\d+)/i);
    if (dayMatch) { currentDay = parseInt(dayMatch[1]); return; }

    const topicMatch = line.match(/^[-*•]\s+(.*)$/) || line.match(/^\[.*\]\s+(.*)$/) || line.match(/^☐\s+(.*)$/) || line.match(/^✓\s+(.*)$/);
    if (topicMatch && currentSubject) {
      newTopics.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        subjectId: currentSubject.id,
        title: topicMatch[1].trim(),
        plannedDay: currentDay,
        completed: false,
        notes: '',
        carryForwardTimes: 0
      });
      return;
    }

    if (!line.includes('*') && !line.includes('-') && line.length < 40) {
      let subName = line;
      if (subName.toLowerCase().includes('javascript revision') || subName.toLowerCase() === 'backend') {
        subName = 'Backend Engineering';
      }
      const subId = subName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (!subjectsMap[subId]) {
        subjectsMap[subId] = { id: subId, name: subName, color: colors[Object.keys(subjectsMap).length % colors.length] };
      }
      currentSubject = subjectsMap[subId];
    }
  });

  const subStats = {};
  newTopics.forEach(t => {
    subStats[t.subjectId] = (subStats[t.subjectId] || 0) + 1;
  });

  importedDataCache = {
    subjects: Object.values(subjectsMap),
    topics: newTopics,
    startDate: startDateStr || new Date().toISOString().split('T')[0],
    totalImportedDays: Math.max(...newTopics.map(t => t.plannedDay), 1)
  };

  const previewContainer = document.getElementById('import-preview-stats');
  previewContainer.innerHTML = Object.values(subjectsMap).map(s => `
    <div class="flex justify-between text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
      <span class="font-bold">${s.name}</span>
      <span class="text-primary">${subStats[s.id] || 0} Topics</span>
    </div>
  `).join('');

  document.getElementById('import-preview-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('import-preview-modal').classList.remove('opacity-0'), 10);
}

function confirmImport() {
  state.subjects = importedDataCache.subjects;
  state.topics = importedDataCache.topics;
  state.startDate = importedDataCache.startDate;
  state.totalImportedDays = importedDataCache.totalImportedDays;
  state.currentStreak = 0;
  state.lastActiveDate = null;
  state.dailyNotes = {};
  saveState(state);

  document.getElementById('import-preview-modal').classList.add('opacity-0');
  setTimeout(() => document.getElementById('import-preview-modal').classList.add('hidden'), 300);
  switchView('today');
}

window.toggleSubject = function(subjectId) {
  const content = document.getElementById(`sub-content-${subjectId}`);
  const icon = document.getElementById(`sub-icon-${subjectId}`);
  if (currentExpandedSubjectId && currentExpandedSubjectId !== subjectId) {
    const oldContent = document.getElementById(`sub-content-${currentExpandedSubjectId}`);
    const oldIcon = document.getElementById(`sub-icon-${currentExpandedSubjectId}`);
    if (oldContent) oldContent.classList.remove('expanded');
    if (oldIcon) oldIcon.classList.remove('rotated');
  }
  if (content.classList.contains('expanded')) {
    content.classList.remove('expanded');
    icon.classList.remove('rotated');
    currentExpandedSubjectId = null;
  } else {
    content.classList.add('expanded');
    icon.classList.add('rotated');
    currentExpandedSubjectId = subjectId;
  }
}

window.openNotes = function(topicId) {
  if(!topicId) return;
  currentNotesTopicId = topicId;
  const topic = state.topics.find(t => t.id === topicId);
  if(!topic) return;
  document.getElementById('notes-topic-title').textContent = topic.title;
  document.getElementById('notes-textarea').value = topic.notes || '';
  const modal = document.getElementById('notes-modal');
  modal.classList.remove('hidden');
  void modal.offsetWidth;
  modal.classList.remove('opacity-0');
}

function closeNotes() {
  const modal = document.getElementById('notes-modal');
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

function saveNotes() {
  if(currentNotesTopicId) {
    const topic = state.topics.find(t => t.id === currentNotesTopicId);
    if(topic) {
      topic.notes = document.getElementById('notes-textarea').value;
      saveState(state);
    }
  }
  closeNotes();
  if(!document.getElementById('view-today').classList.contains('hidden')) renderToday();
}

function renderToday() {
  const currentDay = getDaysSinceStart();
  document.getElementById('current-day-badge').textContent = `Day ${currentDay}`;

  const todayTopics = state.topics.filter(t => {
    if (!t.completed && t.plannedDay <= currentDay) return true;
    if (t.completed && t.plannedDay === currentDay) return true;
    return false;
  });

  const totalCompleted = state.topics.filter(t => t.completed).length;
  const totalTopics = state.topics.length || 1;
  const weeklyPercent = Math.round((totalCompleted / totalTopics) * 100);
  document.getElementById('sidebar-percent').textContent = `${weeklyPercent}%`;
  document.getElementById('sidebar-progress-bar').style.width = `${weeklyPercent}%`;
  document.getElementById('focus-score-sidebar').textContent = `${weeklyPercent}% FS`;

  const statsCompleted = todayTopics.filter(t => t.completed).length;
  const statsTotal = todayTopics.length;
  document.getElementById('progress-completed').textContent = statsCompleted;
  document.getElementById('progress-total').textContent = statsTotal;
  const todayProgress = statsTotal === 0 ? 0 : Math.round((statsCompleted / statsTotal) * 100);
  document.getElementById('progress-bar').style.width = `${todayProgress}%`;
  document.getElementById('daily-target-text').textContent = `${statsTotal} Topics Today`;

  let carryForwardCount = 0;
  todayTopics.forEach(t => {
    if(!t.completed && t.plannedDay < currentDay) carryForwardCount++;
  });
  const cfBanner = document.getElementById('carry-forward-banner');
  if(carryForwardCount > 0) {
    document.getElementById('carry-forward-text').textContent = `⚠ ${carryForwardCount} Topic${carryForwardCount > 1 ? 's' : ''} Carried Forward From Yesterday`;
    cfBanner.classList.remove('hidden');
    cfBanner.classList.add('flex');
  } else {
    cfBanner.classList.add('hidden');
    cfBanner.classList.remove('flex');
  }

  const container = document.getElementById('today-subjects-container');
  const emptyState = document.getElementById('today-empty-state');
  container.innerHTML = '';
  
  if (todayTopics.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    document.getElementById('start-study-btn').style.display = 'none';
    return;
  } else {
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');
    document.getElementById('start-study-btn').style.display = 'flex';
  }

  const groups = {};
  todayTopics.forEach(t => {
    if (!groups[t.subjectId]) groups[t.subjectId] = [];
    groups[t.subjectId].push(t);
  });

  if(!currentExpandedSubjectId && Object.keys(groups).length > 0) currentExpandedSubjectId = Object.keys(groups)[0];

  Object.keys(groups).forEach((subId) => {
    const subject = state.subjects.find(s => s.id === subId);
    if (!subject) return;
    const topics = groups[subId].sort((a,b) => a.plannedDay - b.plannedDay);
    const isExpanded = currentExpandedSubjectId === subId;
    const completedInGroup = topics.filter(t=>t.completed).length;

    const subEl = document.createElement('div');
    subEl.className = 'subject-accordion glass rounded-xl border border-slate-800/80 shadow-md transform transition-all overflow-hidden';
    subEl.setAttribute('data-sub-id', subId);
    
    let html = `
      <div class="w-full flex items-center justify-between p-5 bg-slate-800/20 hover:bg-slate-800/40 transition-colors cursor-pointer group" onclick="toggleSubject('${subId}')">
        <div class="flex items-center gap-4">
          <div class="w-3 h-8 rounded-full shadow-lg" style="background-color: ${subject.color}"></div>
          <h2 class="text-xl font-bold text-white tracking-wide">${subject.name}</h2>
          <span class="bg-slate-800 text-slate-300 text-sm font-semibold px-2.5 py-0.5 rounded-lg fraction-text">${completedInGroup}/${topics.length}</span>
          <button class="ml-2 text-xs font-bold bg-primary/20 text-primary hover:bg-primary/40 px-2 py-1 rounded hidden group-hover:block" onclick="event.stopPropagation(); completeSubjectToday('${subId}')">Complete All</button>
        </div>
        <i data-lucide="chevron-down" id="sub-icon-${subId}" class="w-6 h-6 text-slate-400 accordion-icon ${isExpanded ? 'rotated' : ''}"></i>
      </div>
      <div id="sub-content-${subId}" class="accordion-content bg-slate-900/40 ${isExpanded ? 'expanded' : ''}">
        <div class="p-5 pt-0 flex flex-col gap-3 mt-4">
    `;

    topics.forEach(task => {
      const notesIcon = task.notes ? `<button class="ml-auto text-primary" onclick="event.stopPropagation(); openNotes('${task.id}')"><i data-lucide="file-text" class="w-4 h-4"></i></button>` 
        : `<button class="ml-auto text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation(); openNotes('${task.id}')"><i data-lucide="plus-square" class="w-4 h-4"></i></button>`;
      html += `
        <div class="topic-card bg-surface p-4 rounded-xl border border-slate-700/50 flex items-center gap-4 cursor-pointer group" data-id="${task.id}">
          <button class="checkbox-btn w-6 h-6 rounded-md border-2 flex items-center justify-center ${task.completed ? 'bg-primary border-primary text-white' : 'border-slate-500 hover:border-primary text-transparent'}">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
          <div class="flex-1 font-semibold ${task.completed ? 'opacity-50 line-through text-slate-400' : 'text-slate-200'} text-[17px] flex items-center">
            ${task.title}
          </div>
          ${notesIcon}
        </div>
      `;
    });
    html += `</div></div>`;
    subEl.innerHTML = html;
    container.appendChild(subEl);
  });

  createIcons({ icons });

  document.querySelectorAll('.topic-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('button') && !e.target.closest('.checkbox-btn')) return;
      const taskId = card.getAttribute('data-id');
      const topic = state.topics.find(t => t.id === taskId);
      if (topic) {
        handleTaskCompletion(topic);
        
        // Targeted DOM updates to avoid screen flicker instead of calling renderToday()
        const btn = card.querySelector('.checkbox-btn');
        const textWrapper = card.querySelector('.flex-1');
        
        if (topic.completed) {
           btn.classList.remove('border-slate-500', 'hover:border-primary', 'text-transparent');
           btn.classList.add('bg-primary', 'border-primary', 'text-white');
           textWrapper.classList.add('opacity-50', 'line-through', 'text-slate-400');
           textWrapper.classList.remove('text-slate-200');
        } else {
           btn.classList.add('border-slate-500', 'hover:border-primary', 'text-transparent');
           btn.classList.remove('bg-primary', 'border-primary', 'text-white');
           textWrapper.classList.remove('opacity-50', 'line-through', 'text-slate-400');
           textWrapper.classList.add('text-slate-200');
        }
        updateDashboardStats();
      }
    });
  });
}

function updateDashboardStats() {
  const currentDay = getDaysSinceStart();
  const todayTopics = state.topics.filter(t => {
    if (!t.completed && t.plannedDay <= currentDay) return true;
    if (t.completed && t.plannedDay === currentDay) return true;
    return false;
  });

  const totalCompleted = state.topics.filter(t => t.completed).length;
  const totalTopics = state.topics.length || 1;
  const weeklyPercent = Math.round((totalCompleted / totalTopics) * 100);
  document.getElementById('sidebar-percent').textContent = `${weeklyPercent}%`;
  document.getElementById('sidebar-progress-bar').style.width = `${weeklyPercent}%`;
  
  const focusScore = document.getElementById('focus-score-sidebar');
  if(focusScore) focusScore.textContent = `${weeklyPercent}% FS`;

  const statsCompleted = todayTopics.filter(t => t.completed).length;
  const statsTotal = todayTopics.length;
  document.getElementById('progress-completed').textContent = statsCompleted;
  
  const todayProgress = statsTotal === 0 ? 0 : Math.round((statsCompleted / statsTotal) * 100);
  document.getElementById('progress-bar').style.width = `${todayProgress}%`;

  document.querySelectorAll('.subject-accordion').forEach(accordion => {
    const subId = accordion.getAttribute('data-sub-id');
    if(!subId) return;
    const topicsInGrp = state.topics.filter(t => t.subjectId === subId && ((!t.completed && t.plannedDay <= currentDay) || (t.completed && t.plannedDay === currentDay)));
    const compInGrp = topicsInGrp.filter(t => t.completed).length;
    const fractionSpan = accordion.querySelector('.fraction-text');
    if(fractionSpan) fractionSpan.textContent = `${compInGrp}/${topicsInGrp.length}`;
  });
  
  // Re-check empty state if needed. Though if all done, they shouldn't disappear dynamically based on this requirement.
}

function renderWeekly() {
  const container = document.getElementById('weekly-days-container');
  container.innerHTML = '';
  const maxDay = state.totalImportedDays || 7;
  for(let i=1; i<=maxDay; i++) {
    const dayTopics = state.topics.filter(t => t.plannedDay === i);
    if(dayTopics.length === 0) continue;
    const el = document.createElement('div');
    el.className = 'glass p-6 rounded-2xl border border-slate-800/80 shadow-lg';
    let html = `<h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2"><i data-lucide="calendar" class="w-5 h-5 text-primary"></i> Day ${i}</h3><div class="flex flex-col gap-3">`;
    dayTopics.forEach(t => {
      const sub = state.subjects.find(s => s.id === t.subjectId);
      html += `
        <div class="flex items-start gap-3">
          <div class="w-2 h-2 rounded-full mt-1.5 shrink-0" style="background-color:${sub?.color||'#ccc'}"></div>
          <div>
            <div class="text-sm font-bold text-slate-400 mb-0.5">${sub?.name}</div>
            <div class="text-slate-200 font-medium ${t.completed?'line-through opacity-50':''}">${t.title}</div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    el.innerHTML = html;
    container.appendChild(el);
  }
  createIcons({ icons });
}

function renderSearch(q) {
  const container = document.getElementById('search-results-container');
  container.innerHTML = '';
  const results = state.topics.filter(t => t.title.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q)));
  if(results.length === 0) {
    container.innerHTML = `<div class="text-slate-400 p-6">No topics found matching "${q}"</div>`;
    return;
  }
  results.forEach(t => {
    const sub = state.subjects.find(s => s.id === t.subjectId);
    container.innerHTML += `
      <div class="glass p-4 rounded-xl flex items-center gap-4">
        <div class="w-2 h-2 rounded-full" style="background-color:${sub?.color||'#ccc'}"></div>
        <div class="flex-1">
          <div class="text-sm font-bold text-slate-400">${sub?.name} - Day ${t.plannedDay}</div>
          <div class="text-white font-medium">${t.title}</div>
          ${t.notes ? `<div class="text-xs text-slate-500 mt-1 truncate">${t.notes}</div>` : ''}
        </div>
        <button class="bg-primary/20 text-primary px-3 py-1 rounded shadow" onclick="openNotes('${t.id}')">View</button>
      </div>
    `;
  });
}

function renderReview() {
  const tot = state.topics.length;
  const comp = state.topics.filter(t => t.completed).length;
  let cf = 0;
  state.topics.forEach(t => { if(t.carryForwardTimes > 0) cf++; });
  const pct = tot === 0 ? 0 : Math.round((comp/tot)*100);
  
  const subStats = {};
  state.topics.forEach(t => {
    if(!subStats[t.subjectId]) subStats[t.subjectId] = { done: 0, total: 0 };
    subStats[t.subjectId].total++;
    if(t.completed) subStats[t.subjectId].done++;
  });
  
  let best = "None", weakest = "None";
  let maxPct = -1, minPct = 101;
  Object.keys(subStats).forEach(id => {
    const pct = subStats[id].done / subStats[id].total;
    if(pct > maxPct) { maxPct = pct; best = state.subjects.find(s=>s.id===id)?.name; }
    if(pct < minPct) { minPct = pct; weakest = state.subjects.find(s=>s.id===id)?.name; }
  });

  const statsHtml = `
    <div class="glass p-5 rounded-2xl border border-slate-800 text-center"><div class="text-3xl font-extrabold text-white">${comp}</div><div class="text-sm text-slate-400 mt-1 uppercase tracking-widest font-bold">Topics Completed</div></div>
    <div class="glass p-5 rounded-2xl border border-slate-800 text-center"><div class="text-3xl font-extrabold text-warning text-yellow-500">${cf}</div><div class="text-sm text-slate-400 mt-1 uppercase tracking-widest font-bold">Carried Forward</div></div>
    <div class="glass p-5 rounded-2xl border border-slate-800 text-center"><div class="text-3xl font-extrabold text-white">${pct}%</div><div class="text-sm text-slate-400 mt-1 uppercase tracking-widest font-bold">Completion Rate</div></div>
    <div class="glass p-5 rounded-2xl border border-slate-800 text-center"><div class="text-3xl font-extrabold text-orange-400">${state.currentStreak}</div><div class="text-sm text-slate-400 mt-1 uppercase tracking-widest font-bold">Current Streak</div></div>
  `;
  document.getElementById('review-stats').innerHTML = statsHtml;

  const insightsHtml = `
    <p>• <strong>${best}</strong> had the highest completion rate (${Math.round(maxPct*100)||0}%).</p>
    <p>• <strong>${weakest}</strong> was your weakest subject (${Math.round(minPct*100)||0}%).</p>
    <p>• You carried forward ${cf} topics throughout the week.</p>
  `;
  document.getElementById('review-insights').innerHTML = insightsHtml;

  const missed = state.topics.filter(t => t.carryForwardTimes > 0).sort((a,b) => b.carryForwardTimes - a.carryForwardTimes).slice(0, 5);
  let missedHtml = '';
  if(missed.length === 0) missedHtml = '<div class="text-emerald-500 font-bold">Excellent execution! No topics repeatedly missed.</div>';
  missed.forEach(t => {
    missedHtml += `<div class="flex justify-between bg-slate-900/50 p-3 rounded-xl border border-slate-800"><span class="text-slate-200">${t.title}</span> <span class="text-yellow-500 text-sm font-bold">Carried Forward: ${t.carryForwardTimes} Times</span></div>`;
  });
  document.getElementById('review-missed').innerHTML = missedHtml;

  let notesHtml = '';
  Object.keys(state.dailyNotes).forEach(date => {
    if(state.dailyNotes[date].trim()) {
      notesHtml += `<div class="mb-3"><span class="font-bold text-primary">${date}:</span> ${state.dailyNotes[date]}</div>`;
    }
  });
  if(!notesHtml) notesHtml = 'No daily notes recorded this week.';
  document.getElementById('review-daily-notes').innerHTML = notesHtml;
}

function renderHistory() {
  const container = document.getElementById('history-container');
  container.innerHTML = '';
  state.history.reverse().forEach(h => {
    container.innerHTML += `
      <div class="glass p-6 rounded-2xl border border-slate-800 flex justify-between items-center">
        <div>
          <div class="text-2xl font-bold text-white">Week of ${h.startDate}</div>
          <div class="text-slate-400 text-sm mt-1">${h.totalCompleted} Topics Completed</div>
        </div>
        <div class="text-4xl font-extrabold text-primary">${h.focusScore}%</div>
      </div>
    `;
  });
  state.history.reverse();
  
  const statsContainer = document.getElementById('stats-container');
  const totalLife = state.history.reduce((a, b) => a + b.totalCompleted, 0) + state.topics.filter(t=>t.completed).length;
  statsContainer.innerHTML = `
    <div class="glass p-5 rounded-2xl border border-slate-800 text-center"><div class="text-3xl font-extrabold text-orange-400">${state.longestStreak}</div><div class="text-sm text-slate-400 mt-1 uppercase tracking-widest font-bold">Longest Streak</div></div>
    <div class="glass p-5 rounded-2xl border border-slate-800 text-center"><div class="text-3xl font-extrabold text-white">${totalLife}</div><div class="text-sm text-slate-400 mt-1 uppercase tracking-widest font-bold">Total Topics</div></div>
    <div class="glass p-5 rounded-2xl border border-slate-800 text-center"><div class="text-3xl font-extrabold text-primary">${state.history.length}</div><div class="text-sm text-slate-400 mt-1 uppercase tracking-widest font-bold">Weeks Finished</div></div>
  `;
}

function archiveWeek() {
  const tot = state.topics.length || 1;
  const comp = state.topics.filter(t => t.completed).length;
  const pct = Math.round((comp/tot)*100);
  
  state.history.push({
    startDate: state.startDate,
    focusScore: pct,
    totalCompleted: comp
  });
  
  state.topics = [];
  state.dailyNotes = {};
  state.startDate = new Date().toISOString().split('T')[0];
  saveState(state);
  switchView('import');
  alert("Week archived! Ready for a new roadmap.");
}

function startStudyMode() {
  const currentDay = getDaysSinceStart();
  studyQueue = state.topics.filter(t => !t.completed && t.plannedDay <= currentDay)
                            .sort((a,b) => a.plannedDay - b.plannedDay);
  if(studyQueue.length === 0) return;
  studyCurrentIndex = 0;
  const overlay = document.getElementById('study-mode-overlay');
  overlay.classList.remove('hidden');
  void overlay.offsetWidth;
  overlay.classList.remove('opacity-0');
  renderStudyCard();
}

function renderStudyCard() {
  if (studyCurrentIndex >= studyQueue.length) return closeStudyMode();
  const topic = studyQueue[studyCurrentIndex];
  const subject = state.subjects.find(s => s.id === topic.subjectId);
  document.getElementById('study-subject-name').textContent = subject ? subject.name : 'Unknown';
  document.getElementById('study-topic-title').textContent = topic.title;
  document.getElementById('study-progress-text').textContent = `Topic ${studyCurrentIndex + 1} of ${studyQueue.length}`;
  gsap.fromTo('#study-topic-title', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.5)" });
}

function completeStudyTopic() {
  const topic = studyQueue[studyCurrentIndex];
  if(topic) {
    handleTaskCompletion(topic);
    studyCurrentIndex++;
    if(studyCurrentIndex >= studyQueue.length) {
      closeStudyMode();
    } else {
      renderStudyCard();
    }
  }
}

function skipStudyTopic() {
  studyCurrentIndex++;
  if(studyCurrentIndex >= studyQueue.length) closeStudyMode();
  else renderStudyCard();
}

function closeStudyMode() {
  const overlay = document.getElementById('study-mode-overlay');
  overlay.classList.add('opacity-0');
  setTimeout(() => overlay.classList.add('hidden'), 300);
  renderToday();
}

function exportBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `studyos_backup_${new Date().toISOString().split('T')[0]}.json`);
  dlAnchorElem.click();
}

function importBackup(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const importedState = JSON.parse(evt.target.result);
      if(importedState.topics && importedState.subjects) {
        state = importedState;
        saveState(state);
        alert("Backup restored successfully!");
        window.location.reload();
      } else alert("Invalid backup file.");
    } catch(err) {
      alert("Error parsing backup file.");
    }
  };
  reader.readAsText(file);
}

init();
