const API = '/api';
const token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }

let weekOffset = 0;

async function apiFetch(path) {
  const res = await fetch(API + path, { headers: { 'Authorization': `Bearer ${token}` } });
  return res.json().catch(() => []);
}

function getWeekRange(offset) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  monday.setHours(0,0,0,0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23,59,59,999);
  return { monday, sunday };
}

function iso(d) { return d.toISOString().slice(0,10); }
function fmtDate(d) { return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }); }

const MOOD_COLORS = { 1:'#f85149', 2:'#f0a500', 3:'#e3b341', 4:'#3fb950', 5:'#388bfd' };
const MOOD_LABELS = { 1:'Awful', 2:'Bad', 3:'Okay', 4:'Good', 5:'Great' };
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

async function render() {
  const { monday, sunday } = getWeekRange(weekOffset);
  document.getElementById('weekLabel').textContent =
    `${fmtDate(monday)} – ${fmtDate(sunday)}`;

  const from = iso(monday), to = iso(sunday);

  // Fetch all data in parallel
  const [sessions, moods, habitLogs, habits, sleepLogs] = await Promise.all([
    apiFetch('/sessions'),
    apiFetch('/mood'),
    apiFetch(`/habitlogs?from=${from}&to=${to}`),
    apiFetch('/habits'),
    apiFetch('/sleep'),
  ]);

  // Filter to this week
  const wSessions = sessions.filter(s => s.date >= from && s.date <= to);
  const wMoods    = moods.filter(m => m.date >= from && m.date <= to);
  const wSleep    = sleepLogs.filter(s => s.date >= from && s.date <= to);

  // ── Stats ──
  const totalMins = wSessions.reduce((a,s) => a + (s.actualDuration||s.plannedDuration||0), 0);
  document.getElementById('statStudy').textContent    = (totalMins/3600).toFixed(1);
  document.getElementById('statSessions').textContent = wSessions.length;
  const avgMood = wMoods.length ? (wMoods.reduce((a,m)=>a+m.mood,0)/wMoods.length).toFixed(1) : '—';
  document.getElementById('statMood').textContent     = avgMood;
  document.getElementById('statHabits').textContent   = habitLogs.length;
  const avgSleep = wSleep.length ? (wSleep.reduce((a,s)=>a+(s.duration||0),0)/wSleep.length).toFixed(1) : '—';
  document.getElementById('statSleep').textContent    = avgSleep;

  // ── Mood bars ──
  const moodByDay = {};
  wMoods.forEach(m => { moodByDay[m.date] = m.mood; });
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(monday); d.setDate(monday.getDate()+i); return iso(d);
  });
  document.getElementById('moodBars').innerHTML = days.map((d,i) => {
    const mood = moodByDay[d];
    const pct  = mood ? (mood/5)*100 : 0;
    const color = mood ? MOOD_COLORS[mood] : 'var(--border)';
    return `<div class="mood-row">
      <div class="mood-day-label">${DAY_NAMES[i]}</div>
      <div class="mood-bar-wrap"><div class="mood-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="mood-val" style="color:${color}">${mood ? MOOD_LABELS[mood] : ''}</div>
    </div>`;
  }).join('');

  // ── Sessions breakdown ──
  const bySubject = {};
  wSessions.forEach(s => {
    if (!bySubject[s.subject]) bySubject[s.subject] = 0;
    bySubject[s.subject] += (s.actualDuration||s.plannedDuration||0);
  });
  const sessEl = document.getElementById('sessionsList');
  if (!Object.keys(bySubject).length) {
    sessEl.innerHTML = '<p class="empty-msg">No sessions this week</p>';
  } else {
    sessEl.innerHTML = Object.entries(bySubject)
      .sort((a,b) => b[1]-a[1])
      .map(([subj, secs]) => `
        <div class="session-row">
          <span class="session-subject">${subj}</span>
          <span class="session-dur">${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m</span>
        </div>`).join('');
  }

  // ── Habit completion ──
  const logsByHabit = {};
  habitLogs.forEach(l => { logsByHabit[l.habitId] = (logsByHabit[l.habitId]||0) + 1; });
  const habEl = document.getElementById('habitsList');
  if (!habits.length) {
    habEl.innerHTML = '<p class="empty-msg">No habits tracked</p>';
  } else {
    habEl.innerHTML = habits.map(h => {
      const done = logsByHabit[h.id||h._id] || 0;
      const pct  = Math.round((done/7)*100);
      return `<div class="habit-row">
        <div class="habit-name">${h.emoji||'H'} ${h.name}</div>
        <div class="habit-bar-wrap"><div class="habit-bar-fill" style="width:${pct}%"></div></div>
        <div class="habit-pct">${pct}%</div>
      </div>`;
    }).join('');
  }

  // ── Reflection ──
  const key = `lc_reflection_${from}`;
  document.getElementById('reflectionText').value = localStorage.getItem(key) || '';
}

// ── Reflection save ──
document.getElementById('saveReflectionBtn').addEventListener('click', () => {
  const { monday } = getWeekRange(weekOffset);
  const key = `lc_reflection_${iso(monday)}`;
  localStorage.setItem(key, document.getElementById('reflectionText').value);
  const saved = document.getElementById('reflectionSaved');
  saved.style.display = 'inline';
  setTimeout(() => saved.style.display = 'none', 2000);
});

// ── Week nav ──
document.getElementById('prevWeek').addEventListener('click', () => { weekOffset--; render(); });
document.getElementById('nextWeek').addEventListener('click', () => { weekOffset++; render(); });

render();
