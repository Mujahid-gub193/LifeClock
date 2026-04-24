const API = '/api';
let milestones = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let activeCat = '';
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

function saveLocal() { localStorage.setItem('lc_milestones', JSON.stringify(milestones)); }
function loadLocal() { milestones = JSON.parse(localStorage.getItem('lc_milestones') || '[]'); }

async function load() {
  if (token) {
    try { milestones = await apiFetch('GET', '/milestones'); return; } catch { token = null; }
  }
  loadLocal();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function render() {
  const filtered = activeCat ? milestones.filter(m => m.category === activeCat) : milestones;
  const container = document.getElementById('msTimeline');

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-msg">No milestones yet — add your first life event!</p>';
    return;
  }

  // Group by year
  const byYear = {};
  filtered.forEach(m => {
    const y = m.date.slice(0, 4);
    (byYear[y] = byYear[y] || []).push(m);
  });

  container.innerHTML = Object.keys(byYear).sort((a,b) => b - a).map(year => `
    <div class="ms-year-group">
      <div class="ms-year-label">${year}</div>
      ${byYear[year].map(m => {
        const id = m.id || m._id;
        const dateStr = new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        return `<div class="ms-item">
          <div class="ms-emoji">${m.emoji || 'M'}</div>
          <div class="ms-info">
            <div class="ms-title">${escHtml(m.title)}</div>
            <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
              <span class="ms-date">${dateStr}</span>
              <span class="ms-cat">${escHtml(m.category)}</span>
            </div>
            ${m.notes ? `<div class="ms-notes">${escHtml(m.notes)}</div>` : ''}
          </div>
          <div class="ms-actions">
            <button class="btn btn-xs" onclick="editMilestone('${id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="deleteMilestone('${id}')">Delete</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

async function saveMilestone() {
  const title = document.getElementById('mTitle').value.trim();
  const date  = document.getElementById('mDate').value;
  if (!title || !date) { showErr('Title and date are required'); return; }

  const data = {
    title,
    date,
    emoji:    document.getElementById('mEmoji').value.trim() || 'M',
    category: document.getElementById('mCategory').value,
    notes:    document.getElementById('mNotes').value.trim(),
  };

  try {
    if (editingId) {
      if (token) {
        const updated = await apiFetch('PUT', `/milestones/${editingId}`, data);
        const i = milestones.findIndex(m => (m.id||m._id) == editingId);
        if (i > -1) milestones[i] = updated;
      } else {
        const i = milestones.findIndex(m => (m.id||m._id) == editingId);
        if (i > -1) milestones[i] = { ...milestones[i], ...data };
        saveLocal();
      }
      editingId = null;
    } else {
      if (token) {
        milestones.unshift(await apiFetch('POST', '/milestones', data));
      } else {
        data.id = Date.now();
        milestones.unshift(data);
        saveLocal();
      }
    }
    closeForm();
    render();
  } catch (e) { showErr(e.message); }
}

async function deleteMilestone(id) {
  milestones = milestones.filter(m => (m.id||m._id) != id);
  if (token) await apiFetch('DELETE', `/milestones/${id}`).catch(() => {});
  else saveLocal();
  render();
}

function editMilestone(id) {
  const m = milestones.find(m => (m.id||m._id) == id);
  if (!m) return;
  editingId = id;
  document.getElementById('mEmoji').value    = m.emoji || '';
  document.getElementById('mTitle').value    = m.title || '';
  document.getElementById('mDate').value     = m.date || '';
  document.getElementById('mCategory').value = m.category || 'Life';
  document.getElementById('mNotes').value    = m.notes || '';
  openForm();
}

function showErr(msg) { const e = document.getElementById('msErr'); e.textContent = msg; e.classList.remove('hidden'); }

function openForm() {
  document.getElementById('msForm').classList.add('open');
  document.getElementById('toggleFormBtn').textContent = 'Close';
  document.getElementById('msErr').classList.add('hidden');
}

function closeForm() {
  document.getElementById('msForm').classList.remove('open');
  document.getElementById('toggleFormBtn').textContent = '+ Add Milestone';
  ['mEmoji','mTitle','mDate','mNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mCategory').value = 'Life';
  editingId = null;
}

document.getElementById('toggleFormBtn').addEventListener('click', () =>
  document.getElementById('msForm').classList.contains('open') ? closeForm() : openForm()
);
document.getElementById('cancelMsBtn').addEventListener('click', closeForm);
document.getElementById('saveMsBtn').addEventListener('click', saveMilestone);

document.querySelectorAll('[data-cat]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCat = btn.dataset.cat;
    render();
  });
});

load().then(render);
