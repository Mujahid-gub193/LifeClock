const API = '/api';
let goals = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let activeFilter = 'all';
let catFilter = '';
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

function saveLocal() { localStorage.setItem('lc_goals', JSON.stringify(goals)); }
function loadLocal() { goals = JSON.parse(localStorage.getItem('lc_goals') || '[]'); }

async function load() {
  if (token) {
    try {
      goals = await apiFetch('GET', '/goals');
      return;
    } catch (e) {
      console.warn('Server load failed, using local:', e.message);
      token = null; // token invalid, fall through to local
    }
  }
  loadLocal();
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderStats() {
  const total = goals.length;
  const done  = goals.filter(g => g.completed).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('goalStats').innerHTML = `
    <div class="stat-pill"><span>${total}</span> Total</div>
    <div class="stat-pill"><span>${done}</span> Completed</div>
    <div class="stat-pill"><span>${total - done}</span> Active</div>
    <div class="stat-pill"><span>${pct}%</span> Done</div>
  `;

  // Category chart
  const cats = {};
  goals.forEach(g => {
    const c = g.category || 'General';
    if (!cats[c]) cats[c] = { total:0, done:0 };
    cats[c].total++;
    if (g.completed) cats[c].done++;
  });
  const maxTotal = Math.max(...Object.values(cats).map(c=>c.total), 1);
  const catEl = document.getElementById('catChart');
  if (catEl) {
    catEl.innerHTML = `<div class="goals-chart-title">Goals by Category</div>` +
      Object.entries(cats).map(([name, c]) => {
        const pct = Math.round((c.total/maxTotal)*100);
        const donePct = Math.round((c.done/c.total)*100);
        return `<div class="cat-bar-row">
          <div class="cat-bar-label">${name}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${donePct===100?'var(--accent-green)':'var(--accent-blue)'}"></div></div>
          <div class="cat-bar-count">${c.done}/${c.total}</div>
        </div>`;
      }).join('');
  }
}

function renderGoals() {
  renderStats();
  let filtered = goals.filter(g => {
    if (activeFilter === 'active' && g.completed) return false;
    if (activeFilter === 'done'   && !g.completed) return false;
    if (catFilter && g.category !== catFilter) return false;
    return true;
  });

  const grid = document.getElementById('goalsGrid');
  if (!filtered.length) { grid.innerHTML = '<p class="empty-msg">No goals match the filter</p>'; return; }

  grid.innerHTML = filtered.map(g => {
    const id = g.id || g._id;
    const catClass = `cat-${(g.category || 'general').toLowerCase()}`;
    const meta = [
      g.targetAge ? `By age ${g.targetAge}` : '',
      g.deadline  ? `Due ${new Date(g.deadline + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : '',
    ].filter(Boolean).join(' · ');

    const pct = g.completed ? 100 : (g.progress || 0);
    return `<div class="goal-card${g.completed ? ' done' : ''}">
      <div class="goal-card-top">
        <div class="goal-title${g.completed ? ' done-text' : ''}">${escHtml(g.title)}</div>
        <span class="goal-category ${catClass}">${escHtml(g.category)}</span>
      </div>
      ${meta ? `<div class="goal-meta">${meta}</div>` : ''}
      ${g.notes ? `<div class="goal-notes">${escHtml(g.notes)}</div>` : ''}
      <div class="goal-progress-wrap">
        <div class="goal-progress-label"><span>Progress</span><span>${pct}%</span></div>
        <div class="goal-progress-track"><div class="goal-progress-fill${g.completed?' done':''}" style="width:${pct}%"></div></div>
      </div>
      ${g.completed ? `<div class="goal-done-badge">Completed${g.completedAt ? ' · ' + new Date(g.completedAt).toLocaleDateString() : ''}</div>` : ''}
      <div class="goal-actions">
        ${!g.completed
          ? `<button class="btn btn-xs btn-accent" onclick="toggleDone('${id}', true)">Mark Done</button>`
          : `<button class="btn btn-xs btn-ghost" onclick="toggleDone('${id}', false)">Undo</button>`}
        <button class="btn btn-xs" onclick="editGoal('${id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deleteGoal('${id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function saveGoal() {
  const title = document.getElementById('gTitle').value.trim();
  if (!title) { alert('Please enter a goal title'); return; }
  const data = {
    title,
    category:  document.getElementById('gCategory').value,
    targetAge: parseInt(document.getElementById('gAge').value) || null,
    deadline:  document.getElementById('gDeadline').value || null,
    notes:     document.getElementById('gNotes').value.trim(),
    progress:  Math.min(100, Math.max(0, parseInt(document.getElementById('gProgress').value) || 0)),
    completed: false,
  };

  try {
    if (editingId) {
      if (token) {
        const updated = await apiFetch('PUT', `/goals/${editingId}`, data);
        const i = goals.findIndex(g => (g.id||g._id) == editingId);
        if (i > -1) goals[i] = updated;
      } else {
        const i = goals.findIndex(g => (g.id||g._id) == editingId);
        if (i > -1) goals[i] = { ...goals[i], ...data };
        saveLocal();
      }
      editingId = null;
    } else {
      if (token) {
        const saved = await apiFetch('POST', '/goals', data);
        goals.push(saved);
      } else {
        data.id = Date.now();
        goals.push(data);
        saveLocal();
      }
    }
    closeForm();
    renderGoals();
  } catch (e) {
    alert('Error saving goal: ' + e.message);
  }
}

async function toggleDone(id, completed) {
  const completedAt = completed ? new Date().toISOString() : null;
  if (token) {
    const updated = await apiFetch('PUT', `/goals/${id}`, { completed, completedAt }).catch(() => null);
    if (updated) { const i = goals.findIndex(g => (g.id||g._id) == id); if (i > -1) goals[i] = updated; }
  } else {
    const g = goals.find(g => (g.id||g._id) == id);
    if (g) { g.completed = completed; g.completedAt = completedAt; }
    saveLocal();
  }
  renderGoals();
}

async function deleteGoal(id) {
  goals = goals.filter(g => (g.id||g._id) != id);
  if (token) await apiFetch('DELETE', `/goals/${id}`).catch(() => {});
  else saveLocal();
  renderGoals();
}

function editGoal(id) {
  const g = goals.find(g => (g.id||g._id) == id);
  if (!g) return;
  editingId = id;
  document.getElementById('gTitle').value    = g.title || '';
  document.getElementById('gCategory').value = g.category || 'General';
  document.getElementById('gAge').value      = g.targetAge || '';
  document.getElementById('gDeadline').value = g.deadline || '';
  document.getElementById('gNotes').value    = g.notes || '';
  document.getElementById('gProgress').value = g.progress || 0;
  openForm();
}

function openForm() {
  document.getElementById('goalForm').classList.add('open');
  document.getElementById('toggleFormBtn').textContent = 'Close';
}

function closeForm() {
  document.getElementById('goalForm').classList.remove('open');
  document.getElementById('toggleFormBtn').textContent = '+ Add Goal';
  document.getElementById('gTitle').value = '';
  document.getElementById('gAge').value = '';
  document.getElementById('gDeadline').value = '';
  document.getElementById('gNotes').value = '';
  editingId = null;
}

// Events
document.getElementById('toggleFormBtn').addEventListener('click', () => {
  document.getElementById('goalForm').classList.contains('open') ? closeForm() : openForm();
});
document.getElementById('cancelGoalBtn').addEventListener('click', closeForm);
document.getElementById('saveGoalBtn').addEventListener('click', saveGoal);

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderGoals();
  });
});

document.getElementById('catFilter').addEventListener('change', e => {
  catFilter = e.target.value;
  renderGoals();
});

load().then(renderGoals);
