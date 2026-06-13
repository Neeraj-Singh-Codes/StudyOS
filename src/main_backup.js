import './style.css';
import { createIcons, icons } from 'lucide';
import { gsap } from 'gsap';
import { loadState, saveState } from './storage';

let state = null;
let currentExpandedSubjectId = null;
let studyQueue = [];
let studyCurrentIndex = 0;
let currentNotesTopicId = null;

function init() {
  state = loadState();
  setupUI();
  
  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('import-start-date');
  if (dateInput) {
    dateInput.value = state.startDate || todayStr;
  }

  // Initial Streak Render
  updateStreakDisplay();
  switchView('today');
}

function setupUI() {
  createIcons({ icons });

  // Navigation
  document.getElementById('nav-today').addEventListener('click', () => switchView('today'));
  document.getElementById('nav-weekly').addEventListener('click', () => switchView('weekly'));
  document.getElementById('nav-import').addEventListener('click', () => switchView('import'));

  // Import button
  document.getElementById('import-btn').addEventListener('click', handleImport);

  // Study Mode
  document.getElementById('start-study-btn').addEventListener('click', startStudyMode);
  document.getElementById('close-study-btn').addEventListener('click', closeStudyMode);
  document.getElementById('study-complete-btn').addEventListener('click', completeStudyTopic);
  document.getElementById('study-skip-btn').addEventListener('click', skipStudyTopic);
  document.getElementById('study-notes-btn').addEventListener('click', () => openNotes(studyQueue[studyCurrentIndex]?.id));

  // Notes Modal
  document.getElementById('close-notes-btn').addEventListener('click', closeNotes);
  document.getElementById('save-notes-btn').addEventListener('click', saveNotes);
}

function updateStreakDisplay() {
  document.getElementById('streak-display').textContent = `${state.currentStreak || 0} Day Streak`;
}

function handleTaskCompletion(topic) {
  topic.completed = !topic.completed;
  
  if (topic.completed) {
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
    }
  }
  
  saveState(state);
  updateStreakDisplay();
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

function handleImport() {
  const text = document.getElementById('import-textarea').value;
  const startDateStr = document.getElementById('import-start-date').value;
  
  if (!text.trim()) {
    alert("Please paste a roadmap.");
    return;
  }

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
    if (dayMatch) {
      currentDay = parseInt(dayMatch[1]);
      return;
    }

    const topicMatch = line.match(/^[-*•]\s+(.*)$/) || line.match(/^\[.*\]\s+(.*)$/) || line.match(/^☐\s+(.*)$/) || line.match(/^✓\s+(.*)$/);
    if (topicMatch && currentSubject) {
      newTopics.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        subjectId: currentSubject.id,
        title: topicMatch[1].trim(),
        plannedDay: currentDay,
        completed: false,
        notes: ''
      });
      return;
    }

    if (!line.includes('*') && !line.includes('-') && line.length < 40) {
      let subName = line;
      // Restructure JS Revision
      if (subName.toLowerCase().includes('javascript revision') || subName.toLowerCase() === 'backend') {
        subName = 'Backend Engineering';
      }

      const subId = subName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (!subjectsMap[subId]) {
        subjectsMap[subId] = {
          id: subId,
          name: subName,
          color: colors[Object.keys(subjectsMap).length % colors.length]
        };
      }
      currentSubject = subjectsMap[subId];
    }
  });

  state.subjects = Object.values(subjectsMap);
  state.topics = newTopics;
  state.startDate = startDateStr || new Date().toISOString().split('T')[0];
  state.totalImportedDays = Math.max(...newTopics.map(t => t.plannedDay), 1);
  state.currentStreak = 0;
  state.lastActiveDate = null;
  saveState(state);

  alert(`Imported ${state.subjects.length} subjects and ${state.topics.length} topics!`);
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
  const content = document.getElementById('notes-modal-content');
  
  modal.classList.remove('hidden');
  // Trigger reflow
  void modal.offsetWidth;
  modal.classList.remove('opacity-0');
  content.classList.remove('scale-95');
}

function closeNotes() {
  const modal = document.getElementById('notes-modal');
  const content = document.getElementById('notes-modal-content');
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
  currentNotesTopicId = null;
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
  // re-render if in today view to show notes icon
  if(!document.getElementById('view-today').classList.contains('hidden')) {
    renderToday();
  }
}

function renderToday() {
  const currentDay = getDaysSinceStart();
  document.getElementById('current-day-badge').textContent = `Day ${currentDay}`;

  const todayTopics = state.topics.filter(t => {
    if (!t.completed && t.plannedDay <= currentDay) return true;
    if (t.completed && t.plannedDay === currentDay) return true;
    return false;
  });

  // Calculate totals
  const totalCompleted = state.topics.filter(t => t.completed).length;
  const totalTopics = state.topics.length || 1;
  const weeklyPercent = Math.round((totalCompleted / totalTopics) * 100);
  document.getElementById('sidebar-percent').textContent = state.topics.length === 0 ? '0%' : `${weeklyPercent}%`;
  document.getElementById('sidebar-progress-bar').style.width = `${weeklyPercent}%`;

  // Focus Stats
  const statsCompleted = todayTopics.filter(t => t.completed).length;
  const statsTotal = todayTopics.length;
  document.getElementById('progress-completed').textContent = statsCompleted;
  document.getElementById('progress-total').textContent = statsTotal;
  const todayProgress = statsTotal === 0 ? 0 : Math.round((statsCompleted / statsTotal) * 100);
  document.getElementById('progress-bar').style.width = `${todayProgress}%`;
  
  document.getElementById('daily-target-text').textContent = `${statsTotal} Topics Today`;

  // Carry Forward Logic
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

  // Ensure expanded subject stays open or open the first one
  if(!currentExpandedSubjectId && Object.keys(groups).length > 0) {
    currentExpandedSubjectId = Object.keys(groups)[0];
  }

  Object.keys(groups).forEach((subId) => {
    const subject = state.subjects.find(s => s.id === subId);
    if (!subject) return;
    
    // Sort preserving roadmap
    const topics = groups[subId].sort((a,b) => a.plannedDay - b.plannedDay);
    const isExpanded = currentExpandedSubjectId === subId;
    const completedInGroup = topics.filter(t=>t.completed).length;

    const subEl = document.createElement('div');
    subEl.className = 'subject-accordion glass rounded-xl border border-slate-800/80 shadow-md opacity-0 translate-y-4 overflow-hidden';
    
    let html = `
      <button class="w-full flex items-center justify-between p-5 bg-slate-800/20 hover:bg-slate-800/40 transition-colors" onclick="toggleSubject('${subId}')">
        <div class="flex items-center gap-4">
          <div class="w-3 h-8 rounded-full shadow-lg" style="background-color: ${subject.color}"></div>
          <h2 class="text-xl font-bold text-white tracking-wide">${subject.name}</h2>
          <span class="bg-slate-800 text-slate-300 text-sm font-semibold px-2.5 py-0.5 rounded-lg">${completedInGroup}/${topics.length}</span>
        </div>
        <i data-lucide="chevron-down" id="sub-icon-${subId}" class="w-6 h-6 text-slate-400 accordion-icon ${isExpanded ? 'rotated' : ''}"></i>
      </button>
      <div id="sub-content-${subId}" class="accordion-content bg-slate-900/40 ${isExpanded ? 'expanded' : ''}">
        <div class="p-5 pt-0 flex flex-col gap-3 mt-4">
    `;

    topics.forEach(task => {
      const hasNotes = !!task.notes;
      const notesIcon = hasNotes ? `<button class="ml-2 text-primary hover:text-primaryHover" onclick="event.stopPropagation(); openNotes('${task.id}')" title="View Notes"><i data-lucide="file-text" class="w-4 h-4"></i></button>` : `<button class="ml-2 text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation(); openNotes('${task.id}')" title="Add Notes"><i data-lucide="plus-square" class="w-4 h-4"></i></button>`;

      html += `
        <div class="topic-card bg-surface p-4 rounded-xl border border-slate-700/50 flex items-center gap-4 cursor-pointer group" data-id="${task.id}">
          <button class="checkbox-btn w-6 h-6 rounded-md border-2 flex items-center justify-center ${task.completed ? 'bg-primary border-primary text-white' : 'border-slate-500 hover:border-primary text-transparent'}">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
          <div class="flex-1 font-semibold ${task.completed ? 'opacity-50 line-through text-slate-400' : 'text-slate-200'} text-[17px] flex items-center">
            ${task.title}
            ${notesIcon}
          </div>
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
      if(e.target.closest('button') && !e.target.closest('.checkbox-btn')) return; // ignore if typed notes icon
      const taskId = card.getAttribute('data-id');
      const topic = state.topics.find(t => t.id === taskId);
      if (topic) {
        handleTaskCompletion(topic);
        renderToday();
      }
    });
  });

  gsap.to('.subject-accordion', { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
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
    
    let html = `
      <h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <i data-lucide="calendar" class="w-5 h-5 text-primary"></i> Day ${i}
      </h3>
      <div class="flex flex-col gap-3">
    `;

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

// Study Mode Focus Logic
function startStudyMode() {
  const currentDay = getDaysSinceStart();
  studyQueue = state.topics.filter(t => !t.completed && t.plannedDay <= currentDay)
                            .sort((a,b) => a.plannedDay - b.plannedDay);
  if(studyQueue.length === 0) return alert('No topics left to study today!');
  
  studyCurrentIndex = 0;
  
  const overlay = document.getElementById('study-mode-overlay');
  overlay.classList.remove('hidden');
  void overlay.offsetWidth;
  overlay.classList.remove('opacity-0');
  
  renderStudyCard();
}

function renderStudyCard() {
  if (studyCurrentIndex >= studyQueue.length) {
    closeStudyMode();
    return;
  }
  
  const topic = studyQueue[studyCurrentIndex];
  const subject = state.subjects.find(s => s.id === topic.subjectId);
  
  document.getElementById('study-subject-name').textContent = subject ? subject.name : 'Unknown';
  document.getElementById('study-topic-title').textContent = topic.title;
  document.getElementById('study-progress-text').textContent = `Topic ${studyCurrentIndex + 1} of ${studyQueue.length}`;
  
  gsap.fromTo('#study-topic-title', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
}

function completeStudyTopic() {
  const topic = studyQueue[studyCurrentIndex];
  if(topic) {
    handleTaskCompletion(topic);
    studyCurrentIndex++;
    if(studyCurrentIndex >= studyQueue.length) {
      closeStudyMode();
      renderToday();
    } else {
      renderStudyCard();
    }
  }
}

function skipStudyTopic() {
  studyCurrentIndex++;
  if(studyCurrentIndex >= studyQueue.length) {
    closeStudyMode();
    renderToday();
  } else {
    renderStudyCard();
  }
}

function closeStudyMode() {
  const overlay = document.getElementById('study-mode-overlay');
  overlay.classList.add('opacity-0');
  setTimeout(() => overlay.classList.add('hidden'), 300);
  renderToday();
}

init();
