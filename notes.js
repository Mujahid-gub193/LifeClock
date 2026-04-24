const API = '/api';
const token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }

let notes = [];
let activeId = null;

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

function saveLocal() { localStorage.setItem('lc_notes_page', JSON.stringify(notes)); }
function loadLocal() { notes = JSON.parse(localStorage.getItem('lc_notes_page') || '[]'); }

async function load() {
  try {
    const raw = await apiFetch('GET', '/notes');
    notes = raw.filter(n => n.type === 'page');
  } catch { loadLocal(); }
  renderList();
}

function isoToday() { return new Date().toISOString().slice(0, 10); }
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function stripHtml(s) { return s.replace(/<[^>]*>/g,'').trim(); }

function renderList() {
  const filter = document.getElementById('filterDate').value;
  const list   = filter ? notes.filter(n => n.dateRange === filter || n.boxId === filter) : notes;
  const el     = document.getElementById('notesList');
  if (!list.length) { el.innerHTML = '<p class="empty-msg">No notes yet</p>'; return; }
  el.innerHTML = [...list].reverse().map(n => `
    <div class="note-item${n.id==activeId||n._id==activeId?' active':''}" onclick="openNote('${n.id||n._id}')">
      <div class="note-item-date">${n.dateRange || n.boxId || '—'}</div>
      <div class="note-item-preview">${escHtml(stripHtml(n.content||'').slice(0,60)) || 'Empty note'}</div>
    </div>`).join('');
}

function openNote(id) {
  const n = notes.find(x => (x.id||x._id) == id);
  if (!n) return;
  activeId = id;
  document.getElementById('noteEditor').innerHTML = n.content || '';
  document.getElementById('noteDatePicker').value = n.dateRange || n.boxId || '';
  document.getElementById('editorDateLabel').textContent = n.dateRange || n.boxId || 'Untitled';
  document.getElementById('deleteNoteBtn').style.display = 'inline-flex';
  document.getElementById('noteStatus').textContent = '';
  renderList();
}

function newNote() {
  activeId = null;
  document.getElementById('noteEditor').innerHTML = '';
  document.getElementById('noteDatePicker').value = isoToday();
  document.getElementById('editorDateLabel').textContent = isoToday();
  document.getElementById('deleteNoteBtn').style.display = 'none';
  document.getElementById('noteStatus').textContent = '';
  document.getElementById('noteEditor').focus();
}

async function saveNote() {
  const content = document.getElementById('noteEditor').innerHTML.trim();
  const date    = document.getElementById('noteDatePicker').value || isoToday();
  const status  = document.getElementById('noteStatus');
  if (!content || content === '<p style="color:var(--text-secondary)">Start writing your note here...</p>') {
    status.textContent = 'Nothing to save.'; return;
  }
  try {
    if (activeId) {
      const updated = await apiFetch('PUT', `/notes/${activeId}`, { content, dateRange: date, boxId: date, type: 'page' });
      const i = notes.findIndex(n => (n.id||n._id) == activeId);
      if (i > -1) notes[i] = updated;
    } else {
      const created = await apiFetch('POST', '/notes', { content, dateRange: date, boxId: date, type: 'page' });
      notes.push(created);
      activeId = created.id || created._id;
      document.getElementById('deleteNoteBtn').style.display = 'inline-flex';
    }
    status.textContent = 'Saved';
    setTimeout(() => status.textContent = '', 2000);
    renderList();
  } catch(e) {
    // fallback to localStorage
    if (activeId) {
      const i = notes.findIndex(n => (n.id||n._id) == activeId);
      if (i > -1) notes[i] = { ...notes[i], content, dateRange: date, boxId: date };
    } else {
      const n = { id: Date.now(), content, dateRange: date, boxId: date, type: 'page' };
      notes.push(n); activeId = n.id;
      document.getElementById('deleteNoteBtn').style.display = 'inline-flex';
    }
    saveLocal();
    status.textContent = 'Saved locally';
    setTimeout(() => status.textContent = '', 2000);
    renderList();
  }
}

async function deleteNote() {
  if (!activeId || !confirm('Delete this note?')) return;
  try { await apiFetch('DELETE', `/notes/${activeId}`); } catch {}
  notes = notes.filter(n => (n.id||n._id) != activeId);
  saveLocal();
  activeId = null;
  newNote();
  renderList();
}

function fmt(cmd, val) {
  document.execCommand(cmd, false, val || null);
  document.getElementById('noteEditor').focus();
}

// Auto-save on Ctrl+S
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNote(); }
});

document.getElementById('newNoteBtn').addEventListener('click', newNote);
document.getElementById('saveNoteBtn').addEventListener('click', saveNote);
document.getElementById('deleteNoteBtn').addEventListener('click', deleteNote);
document.getElementById('filterDate').addEventListener('input', renderList);
document.getElementById('noteDatePicker').addEventListener('change', function() {
  document.getElementById('editorDateLabel').textContent = this.value;
});

load();
