const API = '/api';
const token = localStorage.getItem('lc_token');
if (!token) { location.href = '/'; }

// ── Calendar conversions (same as before) ──────────────────
const G_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const G_DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const B_MONTHS = ['Baishakh','Jyoishtho','Asharh','Shrabon','Bhadro','Ashwin','Kartik','Ogrohayon','Poush','Magh','Falgun','Choitro'];
const B_STARTS = [{gm:4,gd:14},{gm:5,gd:15},{gm:6,gd:15},{gm:7,gd:16},{gm:8,gd:16},{gm:9,gd:16},{gm:10,gd:16},{gm:11,gd:15},{gm:12,gd:15},{gm:1,gd:14},{gm:2,gd:13},{gm:3,gd:14}];
const H_MONTHS = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Awwal','Jumada al-Thani','Rajab','Shaban','Ramadan','Shawwal','Dhul Qidah','Dhul Hijjah'];

function toBengali(date) {
  const year = date.getFullYear(), month = date.getMonth()+1, day = date.getDate();
  const startDates = B_STARTS.map((s,i) => new Date((i>=9?(month>=4?year+1:year):year), s.gm-1, s.gd));
  let bMonth = 11;
  for (let i=0;i<12;i++) { if (date>=startDates[i] && date<startDates[(i+1)%12]) { bMonth=i; break; } }
  return { day: Math.floor((date-startDates[bMonth])/86400000)+1, month: bMonth, year: (month>4||(month===4&&day>=14))?year-593:year-594, monthName: B_MONTHS[bMonth] };
}

function toHijri(date) {
  const jd = Math.floor((() => { let y=date.getFullYear(),m=date.getMonth()+1,d=date.getDate(); if(m<=2){y--;m+=12;} const A=Math.floor(y/100),B=2-A+Math.floor(A/4); return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+B-1524.5; })());
  const l=jd-1948440+10632, n=Math.floor((l-1)/10631), l2=l-10631*n+354;
  const j=Math.floor((10985-l2)/5316)*Math.floor((50*l2)/17719)+Math.floor(l2/5670)*Math.floor((43*l2)/15238);
  const l3=l2-Math.floor((30-j)/15)*Math.floor((17719*j)/50)-Math.floor(j/16)*Math.floor((15238*j)/43)+29;
  const hm=Math.min(Math.max(Math.floor((24*l3)/709),1),12);
  return { day: l3-Math.floor((709*hm)/24), month: hm, year: 30*n+j-30, monthName: H_MONTHS[hm-1] };
}

// ── Important dates (fixed Gregorian MM-DD) ────────────────
const IMPORTANT = {
  '01-01': { title: "New Year's Day",       color: '#f0a500' },
  '02-21': { title: 'Language Martyrs Day', color: '#f85149' },
  '03-17': { title: 'Birth of Bangabandhu', color: '#3fb950' },
  '03-25': { title: 'Genocide Remembrance', color: '#f85149' },
  '03-26': { title: 'Independence Day',    color: '#3fb950' },
  '04-14': { title: 'Pohela Boishakh',     color: '#f0a500' },
  '05-01': { title: 'Labour Day',          color: '#388bfd' },
  '08-15': { title: 'National Mourning Day', color: '#f85149' },
  '12-16': { title: 'Victory Day',         color: '#3fb950' },
  '12-25': { title: 'Christmas Day',         color: '#f0a500' },
};

// ── State ──────────────────────────────────────────────────
const today = new Date();
let viewYear  = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = new Date(today);
let events = [];       // user events from server/local
let modalDate = null;
let selectedColor = '#388bfd';
let editingEventId = null;

function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── API ────────────────────────────────────────────────────
async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

function saveLocal() { localStorage.setItem('lc_calevents', JSON.stringify(events)); }
function loadLocal() { events = JSON.parse(localStorage.getItem('lc_calevents') || '[]'); }

async function loadEvents() {
  if (token) { try { events = await apiFetch('GET', '/calevents'); return; } catch { } }
  loadLocal();
}

// ── Get all events for a date (user + important) ───────────
function getEventsForDate(ds) {
  const mmdd = ds.slice(5);
  const result = [];
  if (IMPORTANT[mmdd]) result.push({ id: null, title: IMPORTANT[mmdd].title, color: IMPORTANT[mmdd].color, important: true });
  events.filter(e => e.date === ds).forEach(e => result.push(e));
  return result;
}

// ── Render calendar ────────────────────────────────────────
function renderSelectedInfo(date) {
  const b = toBengali(date), h = toHijri(date);
  document.getElementById('selGregorian').textContent = date.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('selBengali').textContent   = `${b.day} ${b.monthName} ${b.year}`;
  document.getElementById('selHijri').textContent     = `${h.day} ${h.monthName} ${h.year}`;
}

function renderCalendar() {
  document.getElementById('calNavLabel').textContent = `${G_MONTHS[viewMonth]} ${viewYear}`;
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay  = new Date(viewYear, viewMonth+1, 0);
  const bFirst = toBengali(firstDay), bLast = toBengali(lastDay);
  const hFirst = toHijri(firstDay),   hLast = toHijri(lastDay);
  const bLabel = bFirst.monthName === bLast.monthName ? bFirst.monthName : `${bFirst.monthName} – ${bLast.monthName}`;
  const hLabel = hFirst.monthName === hLast.monthName ? hFirst.monthName : `${hFirst.monthName} – ${hLast.monthName}`;
  document.getElementById('calMonthInfo').innerHTML = `
    <span class="cal-month-badge gregorian">${G_MONTHS[viewMonth]} ${viewYear}</span>
    <span class="cal-month-badge bengali">${bLabel} ${bFirst.year}</span>
    <span class="cal-month-badge hijri">${hLabel} ${hFirst.year}</span>`;

  document.getElementById('calHeaders').innerHTML = G_DAYS.map((d,i) =>
    `<div class="cal-day-header${i===0||i===6?' weekend':''}">${d}</div>`).join('');

  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const todayStr = isoDate(today), selStr = isoDate(selectedDate);
  let cells = '';
  for (let i=0; i<startDow; i++) cells += renderCell(new Date(viewYear, viewMonth, -startDow+i+1), true, todayStr, selStr);
  for (let d=1; d<=daysInMonth; d++) cells += renderCell(new Date(viewYear, viewMonth, d), false, todayStr, selStr);
  const total = startDow + daysInMonth;
  const rem = total%7===0 ? 0 : 7-(total%7);
  for (let d=1; d<=rem; d++) cells += renderCell(new Date(viewYear, viewMonth+1, d), true, todayStr, selStr);
  document.getElementById('calGrid').innerHTML = cells;

  document.querySelectorAll('.cal-cell[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      const [y,m,d] = el.dataset.date.split('-').map(Number);
      selectedDate = new Date(y, m-1, d);
      renderSelectedInfo(selectedDate);
      document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      openDayModal(el.dataset.date);
    });
  });
  renderSelectedInfo(selectedDate);
}

function renderCell(date, otherMonth, todayStr, selStr) {
  const ds = isoDate(date), dow = date.getDay();
  const b = toBengali(date), h = toHijri(date);
  const evs = getEventsForDate(ds);
  const isWeekend = dow===0||dow===6;
  const dots = evs.slice(0,4).map(e => `<div class="event-dot" style="background:${e.color}"></div>`).join('');
  const firstLabel = evs[0] ? `<div class="event-label" style="color:${evs[0].color}">${escHtml(evs[0].title)}</div>` : '';
  return `<div class="cal-cell${otherMonth?' other-month':''}${ds===todayStr?' today':''}${ds===selStr?' selected':''}${isWeekend?' weekend':''}${evs.length?' has-event':''}" data-date="${ds}">
    ${ds===todayStr ? '<div class="today-dot"></div>' : ''}
    <div class="g-day">${date.getDate()}</div>
    <div class="b-day">${b.day}${b.day===1?`<div class="b-month-label">${b.monthName.slice(0,3)}</div>`:''}</div>
    <div class="h-day">${h.day}${h.day===1?`<div class="h-month-label">${h.monthName.slice(0,3)}</div>`:''}</div>
    ${firstLabel}
    <div class="event-dots">${dots}</div>
  </div>`;
}

// ── Day modal ──────────────────────────────────────────────
function openDayModal(ds) {
  modalDate = ds;
  editingEventId = null;
  const date = new Date(ds + 'T00:00:00');
  const b = toBengali(date), h = toHijri(date);
  document.getElementById('dayModalTitle').textContent = date.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  document.getElementById('dayModalSub').textContent   = `${b.day} ${b.monthName} ${b.year}  ·  ${h.day} ${h.monthName} ${h.year}`;
  document.getElementById('evTitle').value = '';
  document.getElementById('evNote').value  = '';
  document.getElementById('evErr').classList.add('hidden');
  renderDayEvents(ds);
  document.getElementById('dayModal').classList.remove('hidden');
}

function renderDayEvents(ds) {
  const evs = getEventsForDate(ds);
  const container = document.getElementById('dayEventsList');
  if (!evs.length) { container.innerHTML = '<p class="empty-msg" style="padding:.5rem 0">No events</p>'; return; }
  container.innerHTML = evs.map(e => `
    <div class="day-event-item">
      <div class="day-event-dot" style="background:${e.color}"></div>
      <div style="flex:1">
        <div class="day-event-title">${escHtml(e.title)}${e.important?' <span style="font-size:.65rem;color:var(--text-secondary);font-weight:500">(fixed)</span>':''}</div>
        ${e.note ? `<div class="day-event-note">${escHtml(e.note)}</div>` : ''}
      </div>
      ${!e.important ? `<div class="day-event-actions">
        <button class="btn btn-xs" onclick="editEvent('${e.id||e._id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deleteEvent('${e.id||e._id}')">Delete</button>
      </div>` : ''}
    </div>`).join('');
}

function editEvent(id) {
  const e = events.find(x => (x.id||x._id) == id);
  if (!e) return;
  editingEventId = id;
  document.getElementById('evTitle').value      = e.title;
  document.getElementById('evNote').value       = e.note || '';
  document.getElementById('evNotifyTime').value = e.notifyTime || '';
  selectedColor = e.color || '#388bfd';
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === selectedColor));
}

async function deleteEvent(id) {
  events = events.filter(e => (e.id||e._id) != id);
  if (token) await apiFetch('DELETE', `/calevents/${id}`).catch(() => {});
  else saveLocal();
  renderDayEvents(modalDate);
  renderCalendar();
}

async function saveEvent() {
  const title = document.getElementById('evTitle').value.trim();
  if (!title) { const e = document.getElementById('evErr'); e.textContent='Title required'; e.classList.remove('hidden'); return; }
  const data = { date: modalDate, title, note: document.getElementById('evNote').value.trim(), color: selectedColor, notifyTime: document.getElementById('evNotifyTime').value || null, notificationSent: false };
  try {
    if (editingEventId) {
      if (token) { const u = await apiFetch('PUT', `/calevents/${editingEventId}`, data); const i = events.findIndex(e=>(e.id||e._id)==editingEventId); if(i>-1) events[i]=u; }
      else { const i = events.findIndex(e=>(e.id||e._id)==editingEventId); if(i>-1) events[i]={...events[i],...data}; saveLocal(); }
      editingEventId = null;
    } else {
      if (token) { events.push(await apiFetch('POST', '/calevents', data)); }
      else { data.id = Date.now(); events.push(data); saveLocal(); }
    }
    document.getElementById('evTitle').value      = '';
    document.getElementById('evNote').value       = '';
    document.getElementById('evNotifyTime').value = '';
    renderDayEvents(modalDate);
    renderCalendar();
  } catch(e) { const el=document.getElementById('evErr'); el.textContent=e.message; el.classList.remove('hidden'); }
}

// ── Color picker ───────────────────────────────────────────
document.querySelectorAll('.color-swatch').forEach(s => {
  s.addEventListener('click', () => {
    selectedColor = s.dataset.color;
    document.querySelectorAll('.color-swatch').forEach(x => x.classList.toggle('active', x===s));
  });
});

// ── Events ─────────────────────────────────────────────────
document.getElementById('prevMonth').addEventListener('click', () => { viewMonth--; if(viewMonth<0){viewMonth=11;viewYear--;} renderCalendar(); });
document.getElementById('nextMonth').addEventListener('click', () => { viewMonth++; if(viewMonth>11){viewMonth=0;viewYear++;} renderCalendar(); });
document.getElementById('todayBtn').addEventListener('click', () => { viewYear=today.getFullYear(); viewMonth=today.getMonth(); selectedDate=new Date(today); renderCalendar(); });
document.getElementById('closeDayModal').addEventListener('click', () => document.getElementById('dayModal').classList.add('hidden'));
document.getElementById('dayModal').addEventListener('click', e => { if(e.target===document.getElementById('dayModal')) document.getElementById('dayModal').classList.add('hidden'); });
document.getElementById('saveEvBtn').addEventListener('click', saveEvent);

loadEvents().then(() => {
  renderCalendar();
  requestNotificationPermission();
  startNotificationChecker();
});

// ── Browser Notifications ──────────────────────────────────
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

const notifiedKeys = new Set(JSON.parse(localStorage.getItem('lc_notified') || '[]'));

function startNotificationChecker() {
  checkNotifications();
  setInterval(checkNotifications, 30000); // check every 30s
}

function checkNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now  = new Date();
  const today = now.toISOString().slice(0, 10);
  const hh   = String(now.getHours()).padStart(2, '0');
  const mm   = String(now.getMinutes()).padStart(2, '0');
  const timeNow = `${hh}:${mm}`;

  events.forEach(ev => {
    if (!ev.notifyTime || ev.date !== today) return;
    const key = `${ev.id||ev._id}_${ev.date}_${ev.notifyTime}`;
    if (notifiedKeys.has(key)) return;
    if (ev.notifyTime === timeNow) {
      new Notification(`${ev.title}`, {
        body: ev.note || `Event on ${ev.date} at ${ev.notifyTime}`,
        icon: '/favicon.ico',
      });
      notifiedKeys.add(key);
      localStorage.setItem('lc_notified', JSON.stringify([...notifiedKeys]));
    }
  });
}
