const token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }

const ICONS = { birthday: 'BD', anniversary: 'AN', custom: 'RM' };
let reminders = JSON.parse(localStorage.getItem('lc_reminders') || '[]');
let editingId = null;

function save() { localStorage.setItem('lc_reminders', JSON.stringify(reminders)); }

// Returns next occurrence date for a reminder (MM-DD or YYYY-MM-DD)
function nextOccurrence(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const parts = dateStr.split('-');
  let month, day;
  if (parts.length === 3) { month = parseInt(parts[1])-1; day = parseInt(parts[2]); }
  else                    { month = parseInt(parts[0])-1; day = parseInt(parts[1]); }
  let next = new Date(now.getFullYear(), month, day);
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return next;
}

function daysUntil(d) {
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((d - now) / 86400000);
}

function fmtDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(parts[0])-1]} ${parseInt(parts[1])}`;
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderItem(r, showCountdown = true) {
  const next = nextOccurrence(r.date);
  const days = daysUntil(next);
  const isToday = days === 0;
  const isSoon  = days > 0 && days <= 30;
  const countdownText = isToday ? 'Today!' : isSoon ? `In ${days} day${days>1?'s':''}` : `In ${days} days`;
  const countdownClass = isToday ? 'today-text' : isSoon ? 'soon-text' : '';
  return `<div class="rm-item${isToday?' today':isSoon?' soon':''}">
    <div class="rm-icon">${ICONS[r.type]||'RM'}</div>
    <div class="rm-info">
      <div class="rm-name">${escHtml(r.name)}</div>
      <div class="rm-date">${fmtDate(r.date)}${r.notes ? ' · ' + escHtml(r.notes) : ''}</div>
    </div>
    ${showCountdown ? `<div class="rm-countdown ${countdownClass}">${countdownText}</div>` : ''}
    <div class="rm-actions">
      <button class="btn btn-xs" onclick="editReminder('${r.id}')">Edit</button>
      <button class="btn btn-xs btn-danger" onclick="deleteReminder('${r.id}')">Delete</button>
    </div>
  </div>`;
}

function render() {
  const sorted = [...reminders].sort((a,b) => daysUntil(nextOccurrence(a.date)) - daysUntil(nextOccurrence(b.date)));
  const todayItems   = sorted.filter(r => daysUntil(nextOccurrence(r.date)) === 0);
  const upcomingItems= sorted.filter(r => { const d=daysUntil(nextOccurrence(r.date)); return d>0&&d<=30; });

  const todayLabel = document.getElementById('todayLabel');
  const todayList  = document.getElementById('todayList');
  if (todayItems.length) {
    todayLabel.style.display = 'block';
    todayList.innerHTML = todayItems.map(r => renderItem(r)).join('');
  } else {
    todayLabel.style.display = 'none';
    todayList.innerHTML = '';
  }

  document.getElementById('upcomingList').innerHTML = upcomingItems.length
    ? upcomingItems.map(r => renderItem(r)).join('')
    : '<p class="empty-msg">No upcoming reminders in next 30 days</p>';

  document.getElementById('allList').innerHTML = reminders.length
    ? sorted.map(r => renderItem(r)).join('')
    : '<p class="empty-msg">No reminders yet</p>';

  // Browser notification for today
  if ('Notification' in window && Notification.permission === 'granted') {
    todayItems.forEach(r => {
      const key = `lc_rm_notified_${r.id}_${new Date().toISOString().slice(0,10)}`;
      if (!localStorage.getItem(key)) {
        new Notification(`${r.name}`, { body: `${r.type === 'birthday' ? 'Birthday' : r.type === 'anniversary' ? 'Anniversary' : 'Reminder'} scheduled for today.` });
        localStorage.setItem(key, '1');
      }
    });
  }
}

function openForm() { document.getElementById('rmForm').classList.add('open'); }
function closeForm() {
  document.getElementById('rmForm').classList.remove('open');
  document.getElementById('rmName').value = '';
  document.getElementById('rmDate').value = '';
  document.getElementById('rmNotes').value = '';
  document.getElementById('rmType').value = 'birthday';
  document.getElementById('rmErr').classList.add('hidden');
  editingId = null;
}

function saveReminder() {
  const name = document.getElementById('rmName').value.trim();
  const date = document.getElementById('rmDate').value.trim();
  const err  = document.getElementById('rmErr');
  if (!name || !date) { err.textContent = 'Name and date are required'; err.classList.remove('hidden'); return; }
  const data = { name, date, type: document.getElementById('rmType').value, notes: document.getElementById('rmNotes').value.trim() };
  if (editingId) {
    const i = reminders.findIndex(r => r.id === editingId);
    if (i > -1) reminders[i] = { ...reminders[i], ...data };
  } else {
    reminders.push({ ...data, id: String(Date.now()) });
  }
  save(); closeForm(); render();
}

function editReminder(id) {
  const r = reminders.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  document.getElementById('rmName').value  = r.name;
  document.getElementById('rmDate').value  = r.date;
  document.getElementById('rmType').value  = r.type;
  document.getElementById('rmNotes').value = r.notes || '';
  openForm();
}

function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  save(); render();
}

document.getElementById('addBtn').addEventListener('click', openForm);
document.getElementById('saveRmBtn').addEventListener('click', saveReminder);
document.getElementById('cancelRmBtn').addEventListener('click', closeForm);

if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
render();
