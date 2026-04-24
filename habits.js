const API = '/api';
let habits = [];
let logs = {};      // "habitId_date" -> count
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let currentDate = isoToday();
let editingId = null;

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d);
}

function saveLocal() {
  localStorage.setItem('lc_habits', JSON.stringify(habits));
  localStorage.setItem('lc_habitlogs', JSON.stringify(logs));
}
function loadLocal() {
  habits = JSON.parse(localStorage.getItem('lc_habits') || '[]');
  logs   = JSON.parse(localStorage.getItem('lc_habitlogs') || '{}');
}

async function load() {
  if (token) {
    try {
      habits = await apiFetch('GET', '/habits');
      const from = addDays(isoToday(), -30);
      const rawLogs = await apiFetch('GET', `/habitlogs?from=${from}&to=${isoToday()}`);
      logs = {};
      rawLogs.forEach(l => { logs[`${l.habitId}_${l.date}`] = l.count; });
      return;
    } catch { token = null; }
  }
  loadLocal();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getStreak(habitId) {
  let streak = 0;
  let d = isoToday();
  while (logs[`${habitId}_${d}`]) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

function renderDateLabel() {
  const today = isoToday();
  const label = currentDate === today ? 'Today' :
    currentDate === addDays(today, -1) ? 'Yesterday' :
    new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
  document.getElementById('dateLabel').textContent = label;
  document.getElementById('nextDay').disabled = currentDate >= today;
}

function renderList() {
  renderDateLabel();
  const list = document.getElementById('hbList');
  const active = habits.filter(h => h.active !== false);
  if (!active.length) { list.innerHTML = '<p class="empty-msg">No habits yet — add your first habit!</p>'; return; }

  list.innerHTML = active.map(h => {
    const id    = h.id || h._id;
    const key   = `${id}_${currentDate}`;
    const count = logs[key] || 0;
    const done  = count >= (h.target || 1);
    const streak = getStreak(id);
    return `<div class="hb-item${done ? ' done' : ''}" id="hbi_${id}">
      <div class="hb-check" onclick="toggleHabit('${id}')">${done ? 'OK' : (h.emoji || 'H')}</div>
      <div class="hb-info">
        <div class="hb-name">${escHtml(h.name)}</div>
        <div class="hb-meta">${escHtml(h.category)}${h.target > 1 ? ` · ${count}/${h.target}` : ''}</div>
      </div>
      ${streak > 0 ? `<div class="hb-streak">${streak} day${streak === 1 ? '' : 's'}</div>` : '<div></div>'}
      <div class="hb-actions">
        <button class="btn btn-xs" onclick="editHabit('${id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deleteHabit('${id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function renderHeatmap() {
  const today = isoToday();
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));

  // Day labels (show every 5th)
  document.getElementById('hbDayLabels').innerHTML = days.map((d, i) =>
    `<div class="hb-day-lbl">${i % 5 === 0 ? d.slice(8) : ''}</div>`
  ).join('');

  const active = habits.filter(h => h.active !== false);
  document.getElementById('hbHeatmap').innerHTML = active.map(h => {
    const id = h.id || h._id;
    const cells = days.map(d => {
      const done = (logs[`${id}_${d}`] || 0) >= (h.target || 1);
      return `<div class="hb-cell${done ? ' done' : ''}${d === today ? ' today' : ''}" title="${d}"></div>`;
    }).join('');
    return `<div class="hb-heatmap-row">
      <div class="hb-heatmap-label">${h.emoji || 'H'} ${escHtml(h.name)}</div>
      <div class="hb-heatmap-cells">${cells}</div>
    </div>`;
  }).join('');
}

function render() { renderList(); renderHeatmap(); }

async function toggleHabit(id) {
  const key   = `${id}_${currentDate}`;
  const habit = habits.find(h => (h.id||h._id) == id);
  const target = habit?.target || 1;
  const cur   = logs[key] || 0;
  const next  = cur >= target ? 0 : cur + 1;

  logs[key] = next;

  if (token) {
    await apiFetch('POST', '/habitlogs', { habitId: id, date: currentDate, count: next }).catch(() => {});
  } else {
    saveLocal();
  }
  render();
}

async function saveHabit() {
  const name = document.getElementById('hName').value.trim();
  if (!name) { showErr('Habit name is required'); return; }
  const data = {
    name,
    emoji:    document.getElementById('hEmoji').value.trim() || 'H',
    category: document.getElementById('hCategory').value,
    target:   parseInt(document.getElementById('hTarget').value) || 1,
  };
  try {
    if (editingId) {
      if (token) {
        const updated = await apiFetch('PUT', `/habits/${editingId}`, data);
        const i = habits.findIndex(h => (h.id||h._id) == editingId);
        if (i > -1) habits[i] = updated;
      } else {
        const i = habits.findIndex(h => (h.id||h._id) == editingId);
        if (i > -1) habits[i] = { ...habits[i], ...data }; saveLocal();
      }
      editingId = null;
    } else {
      if (token) {
        habits.push(await apiFetch('POST', '/habits', data));
      } else {
        data.id = Date.now(); habits.push(data); saveLocal();
      }
    }
    closeForm(); render();
  } catch (e) { showErr(e.message); }
}

async function deleteHabit(id) {
  habits = habits.filter(h => (h.id||h._id) != id);
  Object.keys(logs).filter(k => k.startsWith(`${id}_`)).forEach(k => delete logs[k]);
  if (token) await apiFetch('DELETE', `/habits/${id}`).catch(() => {});
  else saveLocal();
  render();
}

function editHabit(id) {
  const h = habits.find(h => (h.id||h._id) == id);
  if (!h) return;
  editingId = id;
  document.getElementById('hEmoji').value    = h.emoji || '';
  document.getElementById('hName').value     = h.name || '';
  document.getElementById('hCategory').value = h.category || 'General';
  document.getElementById('hTarget').value   = h.target || 1;
  openForm();
}

function showErr(msg) { const e = document.getElementById('hbErr'); e.textContent = msg; e.classList.remove('hidden'); }

function openForm() {
  document.getElementById('hbForm').classList.add('open');
  document.getElementById('toggleFormBtn').textContent = 'Close';
  document.getElementById('hbErr').classList.add('hidden');
}

function closeForm() {
  document.getElementById('hbForm').classList.remove('open');
  document.getElementById('toggleFormBtn').textContent = '+ New Habit';
  ['hEmoji','hName'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('hCategory').value = 'General';
  document.getElementById('hTarget').value = '1';
  editingId = null;
}

// Events
document.getElementById('toggleFormBtn').addEventListener('click', () =>
  document.getElementById('hbForm').classList.contains('open') ? closeForm() : openForm()
);
document.getElementById('cancelHabitBtn').addEventListener('click', closeForm);
document.getElementById('saveHabitBtn').addEventListener('click', saveHabit);
document.getElementById('prevDay').addEventListener('click', () => { currentDate = addDays(currentDate, -1); render(); });
document.getElementById('nextDay').addEventListener('click', () => {
  if (currentDate < isoToday()) { currentDate = addDays(currentDate, 1); render(); }
});
document.getElementById('todayBtn').addEventListener('click', () => { currentDate = isoToday(); render(); });

load().then(render);
