const API = '/api';
let countdowns = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

function saveLocal() {
  localStorage.setItem('lc_countdowns', JSON.stringify(countdowns));
}

function loadLocal() {
  const raw = localStorage.getItem('lc_countdowns');
  countdowns = raw ? JSON.parse(raw) : [];
}

async function load() {
  if (token) {
    try { countdowns = await apiFetch('GET', '/countdowns'); return; } catch {}
  }
  loadLocal();
}

async function addCountdown(e) {
  e.preventDefault();
  const item = {
    emoji:      document.getElementById('cdEmoji').value.trim() || 'CD',
    name:       document.getElementById('cdName').value.trim(),
    targetDate: document.getElementById('cdDate').value,
  };
  if (token) {
    const saved = await apiFetch('POST', '/countdowns', item).catch(() => null);
    if (saved) countdowns.push(saved);
  } else {
    item.id = Date.now();
    countdowns.push(item);
    saveLocal();
  }
  e.target.reset();
  render();
}

async function deleteCountdown(id) {
  countdowns = countdowns.filter(c => (c.id || c._id) != id);
  if (token) await apiFetch('DELETE', `/countdowns/${id}`).catch(() => {});
  else saveLocal();
  render();
}

function getTimeLeft(targetDate) {
  const diff = new Date(targetDate) - new Date();
  const past = diff < 0;
  const abs  = Math.abs(diff);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  return { past, d, h, m, s };
}

function unit(num, lbl) {
  return `<div class="cd-unit"><div class="cd-num">${String(num).padStart(2,'0')}</div><div class="cd-lbl">${lbl}</div></div>`;
}

function render() {
  const grid = document.getElementById('cdGrid');
  const sorted = [...countdowns].sort((a, b) => {
    const da = Math.abs(new Date(a.targetDate) - new Date());
    const db = Math.abs(new Date(b.targetDate) - new Date());
    return da - db;
  });
  if (!sorted.length) { grid.innerHTML = '<p class="empty-msg">No countdowns yet</p>'; return; }
  grid.innerHTML = sorted.map(c => {
    const { past, d, h, m, s } = getTimeLeft(c.targetDate);
    const id = c.id || c._id;
    const dateStr = new Date(c.targetDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    return `<div class="cd-card${past ? ' past' : ''}" id="cd_${id}">
      <button class="btn btn-xs btn-danger" onclick="deleteCountdown('${id}')">Delete</button>
      <div class="cd-emoji">${c.emoji || 'CD'}</div>
      <div class="cd-name">${c.name}</div>
      <div class="cd-date">${past ? 'Was' : 'On'} ${dateStr}</div>
      ${past
        ? `<div class="cd-past-label">${d}d ${h}h ${m}m ago</div>`
        : `<div class="cd-timer">${unit(d,'days')}${unit(h,'hrs')}${unit(m,'min')}${unit(s,'sec')}</div>`
      }
    </div>`;
  }).join('');
}

// Tick every second to update countdowns
setInterval(() => {
  countdowns.forEach(c => {
    const id = c.id || c._id;
    const el = document.getElementById(`cd_${id}`);
    if (!el) return;
    const { past, d, h, m, s } = getTimeLeft(c.targetDate);
    const timerEl = el.querySelector('.cd-timer');
    const pastEl  = el.querySelector('.cd-past-label');
    if (!past && timerEl) {
      timerEl.innerHTML = unit(d,'days') + unit(h,'hrs') + unit(m,'min') + unit(s,'sec');
    }
    if (past && pastEl) {
      pastEl.textContent = `${d}d ${h}h ${m}m ago`;
    }
  });
}, 1000);

document.getElementById('cdForm').addEventListener('submit', addCountdown);

load().then(render);
