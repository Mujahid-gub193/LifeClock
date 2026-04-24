const API = '/api';
let logs = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let selectedQuality = null;
let editingId = null;
let chart = null;

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

function saveLocal() { localStorage.setItem('lc_sleep', JSON.stringify(logs)); }
function loadLocal() { logs = JSON.parse(localStorage.getItem('lc_sleep') || '[]'); }

async function load() {
  if (token) {
    try { logs = await apiFetch('GET', '/sleep'); return; } catch { token = null; }
  }
  loadLocal();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Auto-calc duration from bedtime/wake
document.getElementById('sBedtime').addEventListener('change', calcDuration);
document.getElementById('sWake').addEventListener('change', calcDuration);

function calcDuration() {
  const bed  = document.getElementById('sBedtime').value;
  const wake = document.getElementById('sWake').value;
  if (!bed || !wake) return;
  let [bh, bm] = bed.split(':').map(Number);
  let [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 1440; // crossed midnight
  document.getElementById('sDuration').value = (mins / 60).toFixed(1);
}

// Quality picker
document.getElementById('qualityPicker').addEventListener('click', e => {
  const btn = e.target.closest('[data-q]');
  if (!btn) return;
  selectedQuality = parseInt(btn.dataset.q);
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.toggle('active', b.dataset.q == selectedQuality));
});

function renderStats() {
  if (!logs.length) { document.getElementById('slStats').innerHTML = ''; return; }
  const durs = logs.map(l => l.duration).filter(Boolean);
  const avg  = durs.length ? (durs.reduce((a,b) => a+b, 0) / durs.length).toFixed(1) : '—';
  const best = durs.length ? Math.max(...durs).toFixed(1) : '—';
  const quals = logs.map(l => l.quality).filter(Boolean);
  const avgQ  = quals.length ? (quals.reduce((a,b) => a+b, 0) / quals.length).toFixed(1) : '—';
  document.getElementById('slStats').innerHTML = `
    <div class="stat-pill"><span>${logs.length}</span>Nights Logged</div>
    <div class="stat-pill"><span>${avg}h</span>Avg Sleep</div>
    <div class="stat-pill"><span>${best}h</span>Best Night</div>
    <div class="stat-pill"><span>${avgQ}/5</span>Avg Quality</div>
  `;
}

function renderChart() {
  const recent = [...logs].sort((a,b) => a.date > b.date ? 1 : -1).slice(-14);
  const labels = recent.map(l => l.date.slice(5)); // MM-DD
  const data   = recent.map(l => l.duration || 0);

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('sleepChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(d => d >= 7 ? '#3fb950' : d >= 5 ? '#f0a500' : '#f85149'),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#30363d' } },
        y: { min: 0, max: 12, ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#30363d' } }
      }
    }
  });
}

function durClass(h) { return h >= 7 ? 'good' : h >= 5 ? 'ok' : 'bad'; }
function qualEmoji(q) { return ['','Poor','Fair','Okay','Good','Great'][q] || ''; } // was: ['','','','','',''][q] || ''; }

function renderLog() {
  renderStats();
  renderChart();
  const container = document.getElementById('slLog');
  if (!logs.length) { container.innerHTML = '<p class="empty-msg">No sleep logs yet</p>'; return; }
  const sorted = [...logs].sort((a,b) => a.date < b.date ? 1 : -1);
  container.innerHTML = sorted.map(l => {
    const id  = l.id || l._id;
    const dur = l.duration ? parseFloat(l.duration) : null;
    const durStr = dur ? `${Math.floor(dur)}h ${Math.round((dur%1)*60)}m` : '—';
    return `<div class="sl-entry">
      <div>
        <div class="sl-date">${l.date}</div>
        <div class="sl-times">${l.bedtime || '—'} → ${l.wakeTime || '—'}</div>
      </div>
      <div>
        <div class="sl-dur ${dur ? durClass(dur) : ''}">${durStr}</div>
        ${l.quality ? `<div class="sl-quality">${qualEmoji(l.quality)} (${l.quality}/5)</div>` : ''}
      </div>
      <div class="sl-actions">
        <button class="btn btn-xs" onclick="editLog('${id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deleteLog('${id}')">Delete</button>
      </div>
      ${l.notes ? `<div class="sl-notes">${escHtml(l.notes)}</div>` : ''}
    </div>`;
  }).join('');
}

async function saveSleep() {
  const date = document.getElementById('sDate').value;
  if (!date) { showErr('Date is required'); return; }
  const data = {
    date,
    bedtime:  document.getElementById('sBedtime').value || null,
    wakeTime: document.getElementById('sWake').value || null,
    duration: parseFloat(document.getElementById('sDuration').value) || null,
    quality:  selectedQuality,
    notes:    document.getElementById('sNotes').value.trim(),
  };
  try {
    if (editingId) {
      if (token) {
        const updated = await apiFetch('PUT', `/sleep/${editingId}`, data);
        const i = logs.findIndex(l => (l.id||l._id) == editingId); if (i > -1) logs[i] = updated;
      } else {
        const i = logs.findIndex(l => (l.id||l._id) == editingId);
        if (i > -1) logs[i] = { ...logs[i], ...data }; saveLocal();
      }
      editingId = null;
    } else {
      if (token) {
        logs.unshift(await apiFetch('POST', '/sleep', data));
      } else {
        data.id = Date.now(); logs.unshift(data); saveLocal();
      }
    }
    closeForm(); renderLog();
  } catch (e) { showErr(e.message); }
}

async function deleteLog(id) {
  logs = logs.filter(l => (l.id||l._id) != id);
  if (token) await apiFetch('DELETE', `/sleep/${id}`).catch(() => {});
  else saveLocal();
  renderLog();
}

function editLog(id) {
  const l = logs.find(l => (l.id||l._id) == id);
  if (!l) return;
  editingId = id;
  document.getElementById('sDate').value     = l.date || '';
  document.getElementById('sBedtime').value  = l.bedtime || '';
  document.getElementById('sWake').value     = l.wakeTime || '';
  document.getElementById('sDuration').value = l.duration || '';
  document.getElementById('sNotes').value    = l.notes || '';
  selectedQuality = l.quality || null;
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.toggle('active', b.dataset.q == selectedQuality));
  openForm();
}

function showErr(msg) { const e = document.getElementById('sleepErr'); e.textContent = msg; e.classList.remove('hidden'); }

function openForm() {
  // Default date to today
  if (!document.getElementById('sDate').value)
    document.getElementById('sDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('slForm').classList.add('open');
  document.getElementById('toggleFormBtn').textContent = 'Close';
  document.getElementById('sleepErr').classList.add('hidden');
}

function closeForm() {
  document.getElementById('slForm').classList.remove('open');
  document.getElementById('toggleFormBtn').textContent = '+ Log Sleep';
  ['sDate','sBedtime','sWake','sDuration','sNotes'].forEach(id => document.getElementById(id).value = '');
  selectedQuality = null;
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
  editingId = null;
}

document.getElementById('toggleFormBtn').addEventListener('click', () =>
  document.getElementById('slForm').classList.contains('open') ? closeForm() : openForm()
);
document.getElementById('cancelSleepBtn').addEventListener('click', closeForm);
document.getElementById('saveSleepBtn').addEventListener('click', saveSleep);

load().then(renderLog);
