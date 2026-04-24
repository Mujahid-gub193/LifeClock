const API = '/api';
let sessions = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let activeRange = 7;
const charts = {};
const COLORS = ['#388bfd','#3fb950','#f0a500','#7c5cbf','#f85149','#58a6ff','#e3b341','#1d9e75','#ff7b72','#d2a8ff'];

async function apiFetch(path) {
  const opts = { headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, opts);
  return res.json().catch(() => []);
}

function loadLocal() {
  const raw = localStorage.getItem('lc_state');
  if (!raw) return;
  sessions = JSON.parse(raw).sessions || [];
}

async function load() {
  if (token) {
    try { sessions = await apiFetch('/sessions'); return; } catch { token = null; }
  }
  loadLocal();
}

function isoToday() { return new Date().toISOString().slice(0, 10); }
function addDays(s, n) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function fmtHrs(h) {
  if (!h) return '0m';
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return hrs > 0 ? `${hrs}h${mins > 0 ? ' ' + mins + 'm' : ''}` : `${mins}m`;
}
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getFiltered() {
  const done = sessions.filter(s => s.completed);
  if (activeRange === 'all') return done;
  if (activeRange === 'custom') {
    const from = document.getElementById('rangeFrom').value;
    const to   = document.getElementById('rangeTo').value;
    return done.filter(s => s.date && s.date >= from && s.date <= to);
  }
  const from = addDays(isoToday(), -activeRange);
  return done.filter(s => s.date && s.date >= from);
}

function renderKPIs(filtered) {
  const totalHrs = filtered.reduce((s, e) => s + (e.actualDuration || 0), 0) / 3600;
  const days     = new Set(filtered.map(e => e.date)).size;
  const subjects = new Set(filtered.map(e => e.subject)).size;
  const avgDay   = days ? totalHrs / days : 0;
  const longest  = filtered.reduce((m, s) => Math.max(m, s.actualDuration || 0), 0) / 3600;
  const byDate   = {};
  filtered.forEach(s => { byDate[s.date] = (byDate[s.date] || 0) + (s.actualDuration || 0) / 3600; });
  const bestDay  = Object.entries(byDate).sort((a,b) => b[1]-a[1])[0];
  let streak = 0, d = isoToday();
  while (byDate[d] !== undefined) { streak++; d = addDays(d, -1); }

  document.getElementById('anKpis').innerHTML = [
    { label: 'Total Hours',     value: fmtHrs(totalHrs),                    sub: `${filtered.length} sessions` },
    { label: 'Days Studied',    value: days,                                 sub: `tracked days` },
    { label: 'Avg / Day',       value: fmtHrs(avgDay),                       sub: 'on study days' },
    { label: 'Subjects',        value: subjects,                             sub: 'tracked' },
    { label: 'Longest Session', value: fmtHrs(longest),                      sub: '' },
    { label: 'Best Day',        value: bestDay ? fmtHrs(bestDay[1]) : '—',   sub: bestDay ? bestDay[0] : '' },
    { label: 'Streak',          value: `${streak}d`,                         sub: 'consecutive days' },
  ].map(k => `<div class="kpi-card"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div></div>`).join('');
}

function mkChart(id, type, data, extra = {}) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
    type, data,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, ...extra.plugins },
      scales: extra.scales !== undefined ? extra.scales : (type !== 'doughnut' ? {
        x: { ticks: { color: '#8b949e', font: { size: 9 }, maxTicksLimit: 12 }, grid: { color: '#30363d' } },
        y: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' } }
      } : undefined),
    }
  });
}

function renderDailyBar(filtered) {
  const byDate = {};
  filtered.forEach(s => { byDate[s.date] = (byDate[s.date] || 0) + (s.actualDuration || 0) / 3600; });
  const labels = Object.keys(byDate).sort();
  mkChart('dailyBar', 'bar', {
    labels: labels.map(d => d.slice(5)),
    datasets: [{ data: labels.map(d => +byDate[d].toFixed(2)), backgroundColor: '#388bfd', borderRadius: 4 }]
  });
}

function renderSubjectDonut(filtered) {
  const bySub = {};
  filtered.forEach(s => { bySub[s.subject] = (bySub[s.subject] || 0) + (s.actualDuration || 0) / 3600; });
  const labels = Object.keys(bySub).sort((a,b) => bySub[b]-bySub[a]);
  mkChart('subjectDonut', 'doughnut', {
    labels,
    datasets: [{ data: labels.map(s => +bySub[s].toFixed(2)), backgroundColor: COLORS.slice(0, labels.length), borderWidth: 0 }]
  }, { scales: undefined, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#8b949e', font: { size: 10 }, boxWidth: 12 } } } });
}

function renderWeeklyLine(filtered) {
  const byWeek = {};
  filtered.forEach(s => {
    if (!s.date) return;
    const d = new Date(s.date + 'T00:00:00'), day = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
    const key = mon.toISOString().slice(0, 10);
    byWeek[key] = (byWeek[key] || 0) + (s.actualDuration || 0) / 3600;
  });
  const labels = Object.keys(byWeek).sort();
  mkChart('weeklyLine', 'line', {
    labels: labels.map(d => d.slice(5)),
    datasets: [{ data: labels.map(k => +byWeek[k].toFixed(2)), borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,.1)', tension: 0.3, fill: true, pointRadius: 3 }]
  });
}

function renderDowBar(filtered) {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const totals = new Array(7).fill(0);
  filtered.forEach(s => {
    if (!s.date) return;
    totals[(new Date(s.date + 'T00:00:00').getDay() + 6) % 7] += (s.actualDuration || 0) / 3600;
  });
  mkChart('dowBar', 'bar', {
    labels: days,
    datasets: [{ data: totals.map(v => +v.toFixed(2)), backgroundColor: COLORS.slice(0, 7), borderRadius: 4 }]
  });
}

function renderCumulLine(filtered) {
  const byDate = {};
  filtered.forEach(s => { byDate[s.date] = (byDate[s.date] || 0) + (s.actualDuration || 0) / 3600; });
  const labels = Object.keys(byDate).sort();
  let cum = 0;
  mkChart('cumulLine', 'line', {
    labels: labels.map(d => d.slice(5)),
    datasets: [{ data: labels.map(d => { cum += byDate[d]; return +cum.toFixed(2); }), borderColor: '#f0a500', backgroundColor: 'rgba(240,165,0,.1)', tension: 0.3, fill: true, pointRadius: 2 }]
  });
}

function renderHeatmap(all) {
  const byDate = {};
  all.forEach(s => { byDate[s.date] = (byDate[s.date] || 0) + (s.actualDuration || 0) / 3600; });
  const maxHrs = Math.max(...Object.values(byDate), 1);
  const today  = isoToday();
  const days   = Array.from({ length: 112 }, (_, i) => addDays(today, i - 111));
  const cols   = [];
  for (let i = 0; i < 112; i += 7) cols.push(days.slice(i, i + 7));

  let lastMonth = '';
  document.getElementById('hmMonthLabels').innerHTML = cols.map(col => {
    const m = col[0].slice(5, 7);
    if (m !== lastMonth) { lastMonth = m; return `<span style="font-size:9px;color:var(--text-secondary);margin-right:${13*7+3*6-20}px">${new Date(col[0]+'T00:00:00').toLocaleDateString('en-US',{month:'short'})}</span>`; }
    return '';
  }).join('');

  document.getElementById('hmGrid').innerHTML = cols.map(col =>
    `<div class="heatmap-col">${col.map(d => {
      const h = byDate[d] || 0;
      const alpha = h ? Math.max(0.2, Math.min(1, h / maxHrs)) : 0;
      const bg = h ? `rgba(56,139,253,${alpha.toFixed(2)})` : 'var(--color-future)';
      return `<div class="hm-cell${d === today ? ' today' : ''}" style="background:${bg}" title="${d}: ${fmtHrs(h)}"></div>`;
    }).join('')}</div>`
  ).join('');
}

function renderSubjectTable(filtered) {
  const bySub = {};
  filtered.forEach(s => {
    if (!bySub[s.subject]) bySub[s.subject] = { hrs: 0, count: 0 };
    bySub[s.subject].hrs   += (s.actualDuration || 0) / 3600;
    bySub[s.subject].count += 1;
  });
  const maxHrs = Math.max(...Object.values(bySub).map(v => v.hrs), 1);
  document.getElementById('subjectTbody').innerHTML = Object.entries(bySub)
    .sort((a,b) => b[1].hrs - a[1].hrs)
    .map(([sub, v], i) => `<tr>
      <td><span style="color:${COLORS[i%COLORS.length]};font-weight:700">${escHtml(sub)}</span>
        <div class="subject-bar-track"><div class="subject-bar-fill" style="width:${(v.hrs/maxHrs*100).toFixed(1)}%;background:${COLORS[i%COLORS.length]}"></div></div>
      </td>
      <td>${fmtHrs(v.hrs)}</td><td>${v.count}</td><td>${fmtHrs(v.hrs/v.count)}</td>
    </tr>`).join('');
}

function renderSessionLog(filtered) {
  const log = document.getElementById('sessionLog');
  const sorted = [...filtered].sort((a,b) => b.date > a.date ? 1 : -1).slice(0, 30);
  if (!sorted.length) { log.innerHTML = '<p class="empty-msg">No sessions</p>'; return; }
  log.innerHTML = sorted.map(s => `<div class="log-item">
    <div><div class="log-subject">${escHtml(s.subject)}</div><div class="log-date">${s.date}${s.startTime ? ' · ' + s.startTime : ''}</div></div>
    <div class="log-dur">${s.actualDuration ? fmtHrs(s.actualDuration/3600) : '—'}</div>
  </div>`).join('');
}

function render() {
  const filtered = getFiltered();
  const allDone  = sessions.filter(s => s.completed);
  renderKPIs(filtered);
  renderDailyBar(filtered);
  renderSubjectDonut(filtered);
  renderWeeklyLine(filtered);
  renderDowBar(filtered);
  renderCumulLine(filtered);
  renderHeatmap(allDone);
  renderSubjectTable(filtered);
  renderSessionLog(filtered);
}

document.querySelectorAll('[data-range]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRange = btn.dataset.range === 'all' ? 'all' : btn.dataset.range === 'custom' ? 'custom' : parseInt(btn.dataset.range);
    document.getElementById('customRange').classList.toggle('hidden', btn.dataset.range !== 'custom');
    render();
  });
});
document.getElementById('rangeFrom').addEventListener('change', render);
document.getElementById('rangeTo').addEventListener('change', render);

load().then(render);
