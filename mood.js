const API = '/api';
let entries = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let currentDate = isoToday();
let selectedMood = null;
let selectedTags = new Set();
let moodChart = null;

const MOOD_EMOJI  = ['','1','2','3','4','5'];
const MOOD_COLORS = ['','#f85149','#e3b341','#8b949e','#3fb950','#388bfd'];
const MOOD_LABEL  = ['','Awful','Bad','Okay','Good','Great'];

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
function addDays(s, n) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }

function saveLocal() { localStorage.setItem('lc_mood', JSON.stringify(entries)); }
function loadLocal() { entries = JSON.parse(localStorage.getItem('lc_mood') || '[]'); }

async function load() {
  if (token) {
    try { entries = await apiFetch('GET', '/mood'); return; } catch { token = null; }
  }
  loadLocal();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getEntry(date) { return entries.find(e => e.date === date); }

function renderDateLabel() {
  const today = isoToday();
  const label = currentDate === today ? 'Today' :
    currentDate === addDays(today, -1) ? 'Yesterday' :
    new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  document.getElementById('dateLabel').textContent = label;
  document.getElementById('nextDay').disabled = currentDate >= today;
}

function loadEntryIntoForm() {
  const e = getEntry(currentDate);
  selectedMood = e?.mood || null;
  selectedTags = new Set(e?.tags ? e.tags.split(',').filter(Boolean) : []);

  document.querySelectorAll('.mood-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.mood) === selectedMood)
  );
  document.querySelectorAll('.tag-btn').forEach(b =>
    b.classList.toggle('active', selectedTags.has(b.dataset.tag))
  );
  document.getElementById('journalText').value = e?.journal || '';

  const delBtn = document.getElementById('deleteEntryBtn');
  e ? delBtn.classList.remove('hidden') : delBtn.classList.add('hidden');
}

async function saveEntry() {
  if (!selectedMood) { alert('Please select a mood'); return; }
  const data = {
    date:    currentDate,
    mood:    selectedMood,
    tags:    [...selectedTags].join(','),
    journal: document.getElementById('journalText').value.trim(),
  };
  try {
    if (token) {
      const saved = await apiFetch('POST', '/mood', data);
      const i = entries.findIndex(e => e.date === currentDate);
      i > -1 ? entries[i] = saved : entries.unshift(saved);
    } else {
      const i = entries.findIndex(e => e.date === currentDate);
      if (i > -1) entries[i] = { ...entries[i], ...data };
      else { data.id = Date.now(); entries.unshift(data); }
      saveLocal();
    }
    const msg = document.getElementById('saveMsg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2000);
    document.getElementById('deleteEntryBtn').classList.remove('hidden');
    renderStats(); renderChart(); renderHeatmap(); renderLog();
  } catch (e) { alert(e.message); }
}

async function deleteEntry() {
  const e = getEntry(currentDate);
  if (!e) return;
  const id = e.id || e._id;
  entries = entries.filter(x => x.date !== currentDate);
  if (token) await apiFetch('DELETE', `/mood/${id}`).catch(() => {});
  else saveLocal();
  loadEntryIntoForm();
  renderStats(); renderChart(); renderHeatmap(); renderLog();
}

function renderStats() {
  if (!entries.length) { document.getElementById('mdStats').innerHTML = ''; return; }
  const moods = entries.map(e => e.mood);
  const avg   = (moods.reduce((a,b) => a+b, 0) / moods.length).toFixed(1);
  const best  = Math.max(...moods);
  const streak = calcStreak();
  document.getElementById('mdStats').innerHTML = `
    <div class="stat-pill"><span>${entries.length}</span>Entries</div>
    <div class="stat-pill"><span>${avg}/5</span>Avg Mood</div>
    <div class="stat-pill"><span>${MOOD_LABEL[best]||best}</span>Best Mood</div>
    <div class="stat-pill"><span>${streak}d</span>Streak</div>
  `;
}

function calcStreak() {
  let streak = 0, d = isoToday();
  while (getEntry(d)) { streak++; d = addDays(d, -1); }
  return streak;
}

function renderChart() {
  const today = isoToday();
  const days  = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const data  = days.map(d => getEntry(d)?.mood || null);

  if (moodChart) moodChart.destroy();
  moodChart = new Chart(document.getElementById('moodChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{
        data,
        borderColor: '#388bfd', backgroundColor: 'rgba(56,139,253,.1)',
        pointBackgroundColor: data.map(v => v ? MOOD_COLORS[v] : 'transparent'),
        pointRadius: 5, tension: 0.3, fill: true, spanGaps: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: '#30363d' } },
        y: { min: 1, max: 5, ticks: { color: '#8b949e', font: { size: 10 }, stepSize: 1,
          callback: v => MOOD_EMOJI[v] || v }, grid: { color: '#30363d' } }
      }
    }
  });
}

function renderHeatmap() {
  const today = isoToday();
  // 12 weeks × 7 days = 84 days
  const days = Array.from({ length: 84 }, (_, i) => addDays(today, i - 83));
  // Group into columns of 7
  const cols = [];
  for (let i = 0; i < 84; i += 7) cols.push(days.slice(i, i + 7));

  document.getElementById('mdHeatmap').innerHTML = cols.map(col =>
    `<div class="md-heatmap-col">${col.map(d => {
      const e = getEntry(d);
      const color = e ? MOOD_COLORS[e.mood] : 'var(--color-future)';
      return `<div class="md-hcell${d === today ? ' today' : ''}" style="background:${color}" title="${d}${e ? ' · ' + MOOD_LABEL[e.mood] : ''}"></div>`;
    }).join('')}</div>`
  ).join('');
}

function renderLog() {
  const container = document.getElementById('mdLog');
  const recent = [...entries].sort((a,b) => b.date > a.date ? 1 : -1).slice(0, 20);
  if (!recent.length) { container.innerHTML = '<p class="empty-msg">No entries yet</p>'; return; }
  container.innerHTML = recent.map(e => {
    const tags = e.tags ? e.tags.split(',').filter(Boolean) : [];
    return `<div class="md-entry">
      <div class="md-entry-emoji">${MOOD_EMOJI[e.mood]}</div>
      <div class="md-entry-info">
        <div style="display:flex;gap:.5rem;align-items:center">
          <span style="font-weight:700;color:${MOOD_COLORS[e.mood]}">${MOOD_LABEL[e.mood]}</span>
          <span class="md-entry-date">${e.date}</span>
        </div>
        ${tags.length ? `<div class="md-entry-tags">${tags.map(t => `<span class="md-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        ${e.journal ? `<div class="md-entry-journal">${escHtml(e.journal)}</div>` : ''}
      </div>
      <button class="btn btn-xs btn-danger" onclick="deleteById('${e.id||e._id}')">Delete</button>
    </div>`;
  }).join('');
}

async function deleteById(id) {
  const e = entries.find(x => (x.id||x._id) == id);
  if (!e) return;
  entries = entries.filter(x => (x.id||x._id) != id);
  if (token) await apiFetch('DELETE', `/mood/${id}`).catch(() => {});
  else saveLocal();
  if (e.date === currentDate) loadEntryIntoForm();
  renderStats(); renderChart(); renderHeatmap(); renderLog();
}

function render() {
  renderDateLabel();
  loadEntryIntoForm();
  renderStats();
  renderChart();
  renderHeatmap();
  renderLog();
}

// Mood picker
document.getElementById('moodPicker').addEventListener('click', e => {
  const btn = e.target.closest('[data-mood]');
  if (!btn) return;
  selectedMood = parseInt(btn.dataset.mood);
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('active', b === btn));
});

// Tag picker
document.getElementById('tagRow').addEventListener('click', e => {
  const btn = e.target.closest('[data-tag]');
  if (!btn) return;
  const tag = btn.dataset.tag;
  selectedTags.has(tag) ? selectedTags.delete(tag) : selectedTags.add(tag);
  btn.classList.toggle('active', selectedTags.has(tag));
});

document.getElementById('saveEntryBtn').addEventListener('click', saveEntry);
document.getElementById('deleteEntryBtn').addEventListener('click', deleteEntry);
document.getElementById('prevDay').addEventListener('click', () => { currentDate = addDays(currentDate, -1); render(); });
document.getElementById('nextDay').addEventListener('click', () => { if (currentDate < isoToday()) { currentDate = addDays(currentDate, 1); render(); } });
document.getElementById('todayBtn').addEventListener('click', () => { currentDate = isoToday(); render(); });

load().then(render);
