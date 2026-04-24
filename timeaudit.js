const API = '/api';
let entries = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let activeRange = 7;
let editingId = null;
let donut = null;

const CAT_COLORS = {
  Work:'#388bfd', Study:'#3fb950', Exercise:'#f0a500', Social:'#7c5cbf',
  Entertainment:'#f85149', Sleep:'#58a6ff', Eating:'#e3b341',
  Travel:'#1d9e75', Chores:'#8b949e', Other:'#30363d'
};

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

function saveLocal() { localStorage.setItem('lc_timeentries', JSON.stringify(entries)); }
function loadLocal() { entries = JSON.parse(localStorage.getItem('lc_timeentries') || '[]'); }

async function load() {
  if (token) {
    try { entries = await apiFetch('GET', '/timeentries'); return; } catch { token = null; }
  }
  loadLocal();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fmtHrs(h) {
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return hrs > 0 ? `${hrs}h ${mins > 0 ? mins + 'm' : ''}`.trim() : `${mins}m`;
}

function getFiltered() {
  if (activeRange === 'all') return entries;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - activeRange);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return entries.filter(e => e.date >= cutStr);
}

// Auto-calc duration
document.getElementById('tStart').addEventListener('change', calcDur);
document.getElementById('tEnd').addEventListener('change', calcDur);
function calcDur() {
  const s = document.getElementById('tStart').value;
  const e = document.getElementById('tEnd').value;
  if (!s || !e) return;
  let mins = (parseInt(e.split(':')[0])*60 + parseInt(e.split(':')[1])) -
             (parseInt(s.split(':')[0])*60 + parseInt(s.split(':')[1]));
  if (mins < 0) mins += 1440;
  document.getElementById('tDuration').value = (mins / 60).toFixed(2);
}

function renderStats(filtered) {
  const total = filtered.reduce((s, e) => s + (e.duration || 0), 0);
  const days  = new Set(filtered.map(e => e.date)).size;
  const avgDay = days ? (total / days).toFixed(1) : 0;
  document.getElementById('taStats').innerHTML = `
    <div class="stat-pill"><span>${filtered.length}</span>Entries</div>
    <div class="stat-pill"><span>${fmtHrs(total)}</span>Total Time</div>
    <div class="stat-pill"><span>${days}</span>Days</div>
    <div class="stat-pill"><span>${fmtHrs(parseFloat(avgDay))}</span>Avg/Day</div>
  `;
}

function renderCharts(filtered) {
  // Group by category
  const byCat = {};
  filtered.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (e.duration || 0); });
  const cats = Object.keys(byCat).sort((a,b) => byCat[b] - byCat[a]);
  const total = Object.values(byCat).reduce((s,v) => s+v, 0);

  // Donut
  if (donut) donut.destroy();
  donut = new Chart(document.getElementById('donutChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{ data: cats.map(c => +byCat[c].toFixed(2)), backgroundColor: cats.map(c => CAT_COLORS[c] || '#8b949e'), borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#8b949e', font: { size: 10 }, boxWidth: 12 } } }
    }
  });

  // Category bars
  document.getElementById('catBars').innerHTML = cats.map(c => {
    const pct = total ? ((byCat[c] / total) * 100).toFixed(1) : 0;
    return `<div class="cat-bar-item">
      <div class="cat-bar-label">
        <span style="color:${CAT_COLORS[c]||'#8b949e'};font-weight:700">${c}</span>
        <span>${fmtHrs(byCat[c])} (${pct}%)</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${pct}%;background:${CAT_COLORS[c]||'#8b949e'}"></div>
      </div>
    </div>`;
  }).join('');
}

function renderList(filtered) {
  const list = document.getElementById('taList');
  if (!filtered.length) { list.innerHTML = '<p class="empty-msg">No entries for this period</p>'; return; }

  const byDate = {};
  filtered.forEach(e => (byDate[e.date] = byDate[e.date] || []).push(e));

  list.innerHTML = Object.keys(byDate).sort((a,b) => b > a ? 1 : -1).map(date => {
    const dayTotal = byDate[date].reduce((s,e) => s + (e.duration||0), 0);
    const label = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    return `<div class="ta-date-group">${label} — ${fmtHrs(dayTotal)}</div>` +
      byDate[date].map(e => {
        const id = e.id || e._id;
        const meta = [e.start && e.end ? `${e.start}–${e.end}` : '', e.notes].filter(Boolean).join(' · ');
        return `<div class="ta-entry">
          <div class="ta-dot" style="background:${CAT_COLORS[e.category]||'#8b949e'}"></div>
          <div class="ta-entry-info">
            <div class="ta-activity">${escHtml(e.activity)}</div>
            <div class="ta-meta">${escHtml(e.category)}${meta ? ' · ' + escHtml(meta) : ''}</div>
          </div>
          <div class="ta-dur">${e.duration ? fmtHrs(e.duration) : '—'}</div>
          <div class="ta-actions">
            <button class="btn btn-xs" onclick="editEntry('${id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="deleteEntry('${id}')">Delete</button>
          </div>
        </div>`;
      }).join('');
  }).join('');
}

function render() {
  const filtered = getFiltered();
  renderStats(filtered);
  renderCharts(filtered);
  renderList(filtered);
}

async function saveEntry() {
  const activity = document.getElementById('tActivity').value.trim();
  const date     = document.getElementById('tDate').value;
  if (!activity || !date) { showErr('Activity and date are required'); return; }

  const data = {
    activity,
    category: document.getElementById('tCategory').value,
    date,
    start:    document.getElementById('tStart').value || null,
    end:      document.getElementById('tEnd').value || null,
    duration: parseFloat(document.getElementById('tDuration').value) || null,
    notes:    document.getElementById('tNotes').value.trim(),
  };

  try {
    if (editingId) {
      if (token) {
        const updated = await apiFetch('PUT', `/timeentries/${editingId}`, data);
        const i = entries.findIndex(e => (e.id||e._id) == editingId);
        if (i > -1) entries[i] = updated;
      } else {
        const i = entries.findIndex(e => (e.id||e._id) == editingId);
        if (i > -1) entries[i] = { ...entries[i], ...data }; saveLocal();
      }
      editingId = null;
    } else {
      if (token) {
        entries.unshift(await apiFetch('POST', '/timeentries', data));
      } else {
        data.id = Date.now(); entries.unshift(data); saveLocal();
      }
    }
    closeForm(); render();
  } catch (e) { showErr(e.message); }
}

async function deleteEntry(id) {
  entries = entries.filter(e => (e.id||e._id) != id);
  if (token) await apiFetch('DELETE', `/timeentries/${id}`).catch(() => {});
  else saveLocal();
  render();
}

function editEntry(id) {
  const e = entries.find(e => (e.id||e._id) == id);
  if (!e) return;
  editingId = id;
  document.getElementById('tActivity').value = e.activity || '';
  document.getElementById('tCategory').value = e.category || 'Other';
  document.getElementById('tDate').value     = e.date || '';
  document.getElementById('tStart').value    = e.start || '';
  document.getElementById('tEnd').value      = e.end || '';
  document.getElementById('tDuration').value = e.duration || '';
  document.getElementById('tNotes').value    = e.notes || '';
  openForm();
}

function showErr(msg) { const el = document.getElementById('taErr'); el.textContent = msg; el.classList.remove('hidden'); }

function openForm() {
  if (!document.getElementById('tDate').value)
    document.getElementById('tDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('taForm').classList.add('open');
  document.getElementById('toggleFormBtn').textContent = 'Close';
  document.getElementById('taErr').classList.add('hidden');
}

function closeForm() {
  document.getElementById('taForm').classList.remove('open');
  document.getElementById('toggleFormBtn').textContent = '+ Log Activity';
  ['tActivity','tDate','tStart','tEnd','tDuration','tNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('tCategory').value = 'Work';
  editingId = null;
}

document.getElementById('toggleFormBtn').addEventListener('click', () =>
  document.getElementById('taForm').classList.contains('open') ? closeForm() : openForm()
);
document.getElementById('cancelEntryBtn').addEventListener('click', closeForm);
document.getElementById('saveEntryBtn').addEventListener('click', saveEntry);

document.querySelectorAll('[data-range]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRange = btn.dataset.range === 'all' ? 'all' : parseInt(btn.dataset.range);
    render();
  });
});

load().then(render);
