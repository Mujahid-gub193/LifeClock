const API = '/api';
let books = [];
let token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }
let activeTab = 'all';
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

function saveLocal() { localStorage.setItem('lc_books', JSON.stringify(books)); }
function loadLocal() { books = JSON.parse(localStorage.getItem('lc_books') || '[]'); }

async function load() {
  if (token) {
    try { books = await apiFetch('GET', '/books'); return; } catch { token = null; }
  }
  loadLocal();
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function stars(n) {
  if (!n) return '';
  return `${n}/5`;
}

function renderStats() {
  const total   = books.length;
  const done    = books.filter(b => b.status === 'done').length;
  const reading = books.filter(b => b.status === 'reading').length;
  const want    = books.filter(b => b.status === 'want').length;
  const pages   = books.filter(b => b.status === 'done' && b.pages).reduce((s, b) => s + (b.pages || 0), 0);
  document.getElementById('rlStats').innerHTML = `
    <div class="stat-pill"><span>${total}</span>Total</div>
    <div class="stat-pill"><span>${reading}</span>Reading</div>
    <div class="stat-pill"><span>${done}</span>Finished</div>
    <div class="stat-pill"><span>${want}</span>Want to Read</div>
    ${pages ? `<div class="stat-pill"><span>${pages.toLocaleString()}</span>Pages Read</div>` : ''}
  `;
}

function renderBooks() {
  renderStats();
  const filtered = activeTab === 'all' ? books : books.filter(b => b.status === activeTab);
  const list = document.getElementById('rlList');
  if (!filtered.length) { list.innerHTML = '<p class="empty-msg">No books here yet</p>'; return; }

  list.innerHTML = filtered.map(b => {
    const id = b.id || b._id;
    const statusLabel = { want: 'Want to Read', reading: 'Reading', done: 'Finished' }[b.status] || b.status;
    const meta = [
      b.genre && b.genre !== 'General' ? b.genre : '',
      b.pages ? `${b.pages} pages` : '',
      b.startDate  ? `Started ${b.startDate}` : '',
      b.finishDate ? `Finished ${b.finishDate}` : '',
    ].filter(Boolean).join(' · ');

    return `<div class="book-card">
      <div class="book-spine ${b.status}"></div>
      <div class="book-info">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <div class="book-title">${escHtml(b.title)}</div>
          <span class="book-badge badge-${b.status}">${statusLabel}</span>
        </div>
        ${b.author ? `<div class="book-author">by ${escHtml(b.author)}</div>` : ''}
        ${meta ? `<div class="book-meta">${meta}</div>` : ''}
        ${b.rating ? `<div class="book-rating">${stars(b.rating)}</div>` : ''}
        ${b.notes ? `<div class="book-notes">"${escHtml(b.notes)}"</div>` : ''}
      </div>
      <div class="book-actions">
        <select class="status-select" onchange="changeStatus('${id}', this.value)">
          <option value="want"    ${b.status==='want'    ?'selected':''}>Want</option>
          <option value="reading" ${b.status==='reading' ?'selected':''}>Reading</option>
          <option value="done"    ${b.status==='done'    ?'selected':''}>Done</option>
        </select>
        <button class="btn btn-xs" onclick="editBook('${id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deleteBook('${id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function saveBook() {
  const title = document.getElementById('bTitle').value.trim();
  if (!title) { showErr('Title is required'); return; }
  const data = {
    title,
    author:     document.getElementById('bAuthor').value.trim(),
    genre:      document.getElementById('bGenre').value,
    status:     document.getElementById('bStatus').value,
    pages:      parseInt(document.getElementById('bPages').value) || null,
    rating:     parseInt(document.getElementById('bRating').value) || null,
    startDate:  document.getElementById('bStart').value || null,
    finishDate: document.getElementById('bFinish').value || null,
    notes:      document.getElementById('bNotes').value.trim(),
  };

  try {
    if (editingId) {
      if (token) {
        const updated = await apiFetch('PUT', `/books/${editingId}`, data);
        const i = books.findIndex(b => (b.id||b._id) == editingId);
        if (i > -1) books[i] = updated;
      } else {
        const i = books.findIndex(b => (b.id||b._id) == editingId);
        if (i > -1) books[i] = { ...books[i], ...data };
        saveLocal();
      }
      editingId = null;
    } else {
      if (token) {
        books.unshift(await apiFetch('POST', '/books', data));
      } else {
        data.id = Date.now();
        books.unshift(data);
        saveLocal();
      }
    }
    closeForm();
    renderBooks();
  } catch (e) { showErr(e.message); }
}

async function changeStatus(id, status) {
  if (token) {
    const updated = await apiFetch('PUT', `/books/${id}`, { status }).catch(() => null);
    if (updated) { const i = books.findIndex(b => (b.id||b._id) == id); if (i > -1) books[i] = updated; }
  } else {
    const b = books.find(b => (b.id||b._id) == id);
    if (b) b.status = status;
    saveLocal();
  }
  renderBooks();
}

async function deleteBook(id) {
  books = books.filter(b => (b.id||b._id) != id);
  if (token) await apiFetch('DELETE', `/books/${id}`).catch(() => {});
  else saveLocal();
  renderBooks();
}

function editBook(id) {
  const b = books.find(b => (b.id||b._id) == id);
  if (!b) return;
  editingId = id;
  document.getElementById('bTitle').value  = b.title || '';
  document.getElementById('bAuthor').value = b.author || '';
  document.getElementById('bGenre').value  = b.genre || 'General';
  document.getElementById('bStatus').value = b.status || 'want';
  document.getElementById('bPages').value  = b.pages || '';
  document.getElementById('bRating').value = b.rating || '';
  document.getElementById('bStart').value  = b.startDate || '';
  document.getElementById('bFinish').value = b.finishDate || '';
  document.getElementById('bNotes').value  = b.notes || '';
  openForm();
}

function showErr(msg) {
  const el = document.getElementById('bookErr');
  el.textContent = msg; el.classList.remove('hidden');
}

function openForm() {
  document.getElementById('rlForm').classList.add('open');
  document.getElementById('toggleFormBtn').textContent = 'Close';
  document.getElementById('bookErr').classList.add('hidden');
}

function closeForm() {
  document.getElementById('rlForm').classList.remove('open');
  document.getElementById('toggleFormBtn').textContent = '+ Add Book';
  ['bTitle','bAuthor','bPages','bRating','bStart','bFinish','bNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bStatus').value = 'want';
  editingId = null;
}

// Events
document.getElementById('toggleFormBtn').addEventListener('click', () =>
  document.getElementById('rlForm').classList.contains('open') ? closeForm() : openForm()
);
document.getElementById('cancelBookBtn').addEventListener('click', closeForm);
document.getElementById('saveBookBtn').addEventListener('click', saveBook);

document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    renderBooks();
  });
});

load().then(renderBooks);
