// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const API = '/api';

const state = {
  user: null,
  token: null,
  dob: null,
  lifeExpectancy: 80,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  calView: 'weekly',   // weekly | monthly | yearly
  notes: {},           // boxId -> note object
  sessions: [],
  plannerEntries: {},  // date -> entry
  timers: [],
  barChart: null,
  donutChart: null,
  analyticsRange: 7,  plannerWeekOffset: 0,
  plannerMonthOffset: 0,
  activeNoteBox: null,
  activeDayDate: null,
};

// ═══════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

// ═══════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════
function saveLocal() {
  localStorage.setItem('lc_state', JSON.stringify({
    dob: state.dob,
    lifeExpectancy: state.lifeExpectancy,
    timezone: state.timezone,
    sessions: state.sessions,
    notes: state.notes,
    plannerEntries: state.plannerEntries,
  }));
}

function loadLocal() {
  const raw = localStorage.getItem('lc_state');
  if (!raw) return;
  const d = JSON.parse(raw);
  state.dob            = d.dob || null;
  state.lifeExpectancy = d.lifeExpectancy || 80;
  state.timezone       = d.timezone || state.timezone;
  state.sessions       = d.sessions || [];
  state.notes          = d.notes || {};
  state.plannerEntries = d.plannerEntries || {};
}

function hasLocalData() {
  return state.sessions.length > 0 || Object.keys(state.notes).length > 0;
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
function applyUser(token, user) {
  state.token = token;
  state.user  = user;
  state.dob   = user.dateOfBirth || state.dob;
  state.lifeExpectancy = user.settings?.lifeExpectancy || state.lifeExpectancy;
  state.timezone = user.timezone || state.timezone;
  localStorage.setItem('lc_token', token);
  document.getElementById('authBtn').classList.add('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('accountBtn').classList.remove('hidden');
  document.getElementById('userGreeting').textContent = `Hi, ${user.name}`;
  document.getElementById('userGreeting').classList.remove('hidden');
  renderProfile();
  syncFromServer();
  loadStreaks();
  generateSuggestions();
}

function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('lc_token');
  document.getElementById('authBtn').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('accountBtn').classList.add('hidden');
  document.getElementById('userGreeting').classList.add('hidden');
  renderProfile();
}

async function tryAutoLogin() {
  // Handle Google OAuth redirect token
  const urlParams = new URLSearchParams(window.location.search);
  const googleToken = urlParams.get('token');
  if (googleToken) {
    localStorage.setItem('lc_token', googleToken);
    window.history.replaceState({}, '', '/');
  }

  const token = localStorage.getItem('lc_token');
  if (!token) return;
  try {
    state.token = token;
    const user = await api('GET', '/auth/me');
    applyUser(token, user);
  } catch { state.token = null; localStorage.removeItem('lc_token'); }
}

async function syncFromServer() {
  if (!state.token) return;
  const [sessions, notes, planner] = await Promise.all([
    api('GET', '/sessions'),
    api('GET', '/notes'),
    api('GET', '/planner'),
  ]);
  state.sessions = sessions;
  state.notes = {};
  notes.forEach(n => { state.notes[n.boxId] = n; });
  state.plannerEntries = {};
  planner.forEach(p => { state.plannerEntries[`${p.date}_${p.viewType}`] = p; });
  renderPlannedSessions();
  renderStudyLog();
  renderCalendar();
}

async function migrateLocalToServer() {
  for (const s of state.sessions) {
    await api('POST', '/sessions', s).catch(() => {});
  }
  for (const [boxId, n] of Object.entries(state.notes)) {
    await api('POST', '/notes', { boxId, content: n.content, dateRange: n.dateRange, type: n.type }).catch(() => {});
  }
  for (const [key, p] of Object.entries(state.plannerEntries)) {
    await api('POST', '/planner', { date: p.date, content: p.content, viewType: p.viewType }).catch(() => {});
  }
  await syncFromServer();
}

// ═══════════════════════════════════════════════════════════
// CALENDAR DATE SYSTEMS
// ═══════════════════════════════════════════════════════════

// ── Gregorian ──
function gregorianStr(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Bengali (Bangla) calendar ──
const BENGALI_MONTHS = ['Baishakh','Jyoishtho','Asharh','Shrabon','Bhadro','Ashwin','Kartik','Ogrohayon','Poush','Magh','Falgun','Choitro'];
// Bengali month start days in Gregorian (approximate, fixed-rule algorithm)
// Months 1-5: 31 days each; months 6-11: 30 days each; month 12: 30/31 days
// New year starts 14 April
function toBengali(date) {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based
  const day   = date.getDate();

  // Bengali new year: 14 April
  // Months and their Gregorian start dates (day of month, Gregorian month)
  const starts = [
    { gm: 4,  gd: 14 }, // Baishakh   (Apr 14)
    { gm: 5,  gd: 15 }, // Jyoishtho  (May 15)
    { gm: 6,  gd: 15 }, // Asharh     (Jun 15)
    { gm: 7,  gd: 16 }, // Shrabon    (Jul 16)
    { gm: 8,  gd: 16 }, // Bhadro     (Aug 16)
    { gm: 9,  gd: 16 }, // Ashwin     (Sep 16)
    { gm: 10, gd: 16 }, // Kartik     (Oct 16)
    { gm: 11, gd: 15 }, // Ogrohayon  (Nov 15)
    { gm: 12, gd: 15 }, // Poush      (Dec 15)
    { gm: 1,  gd: 14 }, // Magh       (Jan 14)
    { gm: 2,  gd: 13 }, // Falgun     (Feb 13)
    { gm: 3,  gd: 14 }, // Choitro    (Mar 14)
  ];

  // Convert starts to Date objects for comparison year
  const refYear = (month < 4 || (month === 4 && day < 14)) ? year : year;
  const startDates = starts.map((s, i) => {
    const gy = (i >= 9) ? refYear + (month >= 4 ? 1 : 0) : refYear;
    // Magh, Falgun, Choitro fall in next Gregorian year if we're past April
    const adjYear = (i >= 9) ? (month >= 4 ? year + 1 : year) : year;
    return new Date(adjYear, s.gm - 1, s.gd);
  });

  // Find which Bengali month we're in
  let bMonth = 11; // default Choitro
  for (let i = 0; i < 12; i++) {
    const next = startDates[(i + 1) % 12];
    if (date >= startDates[i] && date < next) {
      bMonth = i;
      break;
    }
  }

  const bDay = Math.floor((date - startDates[bMonth]) / 86400000) + 1;
  // Bengali year = Gregorian year - 593 (if on/after Apr 14), else - 594
  const bYear = (month > 4 || (month === 4 && day >= 14)) ? year - 593 : year - 594;

  return `${bDay} ${BENGALI_MONTHS[bMonth]} ${bYear}`;
}

// ── Hijri calendar (Umm al-Qura approximation) ──
const HIJRI_MONTHS = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Awwal','Jumada al-Thani','Rajab','Shaban','Ramadan','Shawwal','Dhul Qidah','Dhul Hijjah'];

function toHijri(date) {
  // Algorithmic conversion (Kuwaiti algorithm)
  const jd = gregorianToJD(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const { hy, hm, hd } = jdToHijri(jd);
  return `${hd} ${HIJRI_MONTHS[hm - 1]} ${hy}`;
}

function gregorianToJD(y, m, d) {
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function jdToHijri(jd) {
  jd = Math.floor(jd);
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
            Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
             Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hm = Math.floor((24 * l3) / 709);
  const hd = l3 - Math.floor((709 * hm) / 24);
  const hy = 30 * n + j - 30;
  return { hy, hm: Math.min(Math.max(hm, 1), 12), hd };
}


// ═══════════════════════════════════════════════════════════
// CLOCK + DATE DISPLAY
// ═══════════════════════════════════════════════════════════
let lastMidnightDate = null;

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('clockTime').textContent = `${h}:${m}:${s}`;

  // Update dates once per day (at midnight or first run)
  const today = now.toDateString();
  if (today !== lastMidnightDate) {
    lastMidnightDate = today;
    document.getElementById('dateGregorian').textContent = gregorianStr(now);
    document.getElementById('dateBengali').textContent   = toBengali(now);
    document.getElementById('dateHijri').textContent     = toHijri(now);
  }
}

// ═══════════════════════════════════════════════════════════
// LIFE STATS
// ═══════════════════════════════════════════════════════════
function updateLifeStats() {
  if (!state.dob) return;
  const birth = new Date(state.dob);
  const now   = new Date();
  const diffMs = now - birth;
  const totalDays = Math.floor(diffMs / 86400000);
  const totalWeeks = Math.floor(totalDays / 7);
  const totalMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());

  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;

  const lifeMs = state.lifeExpectancy * 365.25 * 86400000;
  const pct = Math.min(100, (diffMs / lifeMs) * 100);
  const daysLeft = Math.max(0, Math.floor((birth.getTime() + lifeMs - now.getTime()) / 86400000));
  const yearsLeft = Math.max(0, state.lifeExpectancy - age);

  // Center panel
  document.getElementById('lifeAge').textContent =
    `You have lived ${age} years, ${totalMonths % 12} months, ${totalDays % 30} days`;
  document.getElementById('lifePct').textContent =
    `${pct.toFixed(1)}% of your expected life`;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('pctPassed').textContent    = `${pct.toFixed(1)}% passed`;
  document.getElementById('pctRemaining').textContent = `${(100 - pct).toFixed(1)}% remaining`;

  // Right panel stats
  document.getElementById('statAge').textContent       = `${age} yrs`;
  document.getElementById('statDays').textContent      = totalDays.toLocaleString();
  document.getElementById('statWeeks').textContent     = totalWeeks.toLocaleString();
  document.getElementById('statMonths').textContent    = totalMonths.toLocaleString();
  document.getElementById('statYearsLeft').textContent = `${yearsLeft} yrs`;
  document.getElementById('statDaysLeft').textContent  = daysLeft.toLocaleString();
}

// ═══════════════════════════════════════════════════════════
// LIFE CALENDAR — CANVAS RENDERING
// ═══════════════════════════════════════════════════════════
const GAP = 2;
const HEADER_W = 36, HEADER_H = 20;

let calCanvas, calCtx, calLayout = [];

function initCanvas() {
  calCanvas = document.getElementById('lifeCalendarCanvas');
  calCtx    = calCanvas.getContext('2d');
  calCanvas.addEventListener('mousemove', onCalHover);
  calCanvas.addEventListener('mouseleave', () => document.getElementById('calTooltip').classList.add('hidden'));
  calCanvas.addEventListener('click', onCalClick);
}

function renderCalendar() {
  if (!calCanvas) return;
  if (!state.dob) { calCtx.clearRect(0, 0, calCanvas.width, calCanvas.height); return; }

  const birth = new Date(state.dob);
  const now   = new Date();
  const le    = state.lifeExpectancy;
  calLayout   = [];

  const style = getComputedStyle(document.documentElement);
  const cPast    = style.getPropertyValue('--color-past').trim()    || '#1d9e75';
  const cCurrent = style.getPropertyValue('--accent-current').trim()|| '#f0a500';
  const cFuture  = style.getPropertyValue('--color-future').trim()  || '#2a2f38';
  const cNoted   = style.getPropertyValue('--color-noted').trim()   || '#7c5cbf';
  const cText    = style.getPropertyValue('--text-secondary').trim()|| '#8b949e';

  const containerW = calCanvas.parentElement.clientWidth || 600;

  if (state.calView === 'weekly') {
    const cols = 52;
    const BOX  = Math.max(4, Math.floor((containerW - HEADER_W - cols * GAP) / cols));
    const STEP = BOX + GAP;
    calCanvas.width  = containerW;
    calCanvas.height = HEADER_H + le * STEP;
    calCtx.clearRect(0, 0, calCanvas.width, calCanvas.height);
    calCtx.fillStyle = cText; calCtx.font = '9px Inter'; calCtx.textAlign = 'center';
    for (let c = 0; c < cols; c += 4)
      calCtx.fillText(c + 1, HEADER_W + c * STEP + BOX / 2, HEADER_H - 4);
    for (let r = 0; r < le; r++) {
      calCtx.fillStyle = cText;
      calCtx.fillText(r + 1, HEADER_W / 2, HEADER_H + r * STEP + BOX - 2);
      for (let c = 0; c < cols; c++) {
        const weekStart = new Date(birth.getTime() + (r * 52 + c) * 7 * 86400000);
        const weekEnd   = new Date(weekStart.getTime() + 6 * 86400000);
        const boxId = `w_${r}_${c}`;
        let color = cFuture;
        if (weekEnd < now) color = cPast;
        if (now >= weekStart && now <= weekEnd) color = cCurrent;
        if (state.notes[boxId]) color = cNoted;
        const x = HEADER_W + c * STEP, y = HEADER_H + r * STEP;
        calCtx.fillStyle = color;
        calCtx.fillRect(x, y, BOX, BOX);
        calLayout.push({ x, y, w: BOX, h: BOX, boxId, label: `Week ${c + 1} of Year ${r + 1}`, age: r, range: `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}` });
      }
    }
  } else if (state.calView === 'monthly') {
    const cols = 12;
    const BOX  = Math.max(4, Math.floor((containerW - HEADER_W - cols * GAP) / cols));
    const STEP = BOX + GAP;
    calCanvas.width  = containerW;
    calCanvas.height = HEADER_H + le * STEP;
    calCtx.clearRect(0, 0, calCanvas.width, calCanvas.height);
    const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    calCtx.fillStyle = cText; calCtx.font = '9px Inter'; calCtx.textAlign = 'center';
    for (let c = 0; c < cols; c++)
      calCtx.fillText(mNames[c], HEADER_W + c * STEP + BOX / 2, HEADER_H - 4);
    for (let r = 0; r < le; r++) {
      calCtx.fillStyle = cText;
      calCtx.fillText(r + 1, HEADER_W / 2, HEADER_H + r * STEP + BOX - 2);
      for (let c = 0; c < cols; c++) {
        const bm = birth.getMonth(), by = birth.getFullYear();
        const totalM   = r * 12 + c;
        const boxYear  = by + Math.floor((bm + totalM) / 12);
        const boxMonth = (bm + totalM) % 12;
        const boxStart = new Date(boxYear, boxMonth, 1);
        const boxEnd   = new Date(boxYear, boxMonth + 1, 0);
        const boxId    = `m_${r}_${c}`;
        let color = cFuture;
        if (boxEnd < now) color = cPast;
        if (now.getFullYear() === boxYear && now.getMonth() === boxMonth) color = cCurrent;
        if (state.notes[boxId]) color = cNoted;
        const x = HEADER_W + c * STEP, y = HEADER_H + r * STEP;
        calCtx.fillStyle = color;
        calCtx.fillRect(x, y, BOX, BOX);
        calLayout.push({ x, y, w: BOX, h: BOX, boxId, label: `${mNames[boxMonth]} ${boxYear}`, age: r, range: `${fmtDate(boxStart)} – ${fmtDate(boxEnd)}` });
      }
    }
  } else {
    const cols = 10;
    const BIG  = Math.max(8, Math.floor((containerW - HEADER_W - cols * GAP) / cols));
    const rows = Math.ceil(le / cols);
    calCanvas.width  = containerW;
    calCanvas.height = HEADER_H + rows * (BIG + GAP);
    calCtx.clearRect(0, 0, calCanvas.width, calCanvas.height);
    for (let i = 0; i < le; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const boxStart = new Date(birth.getFullYear() + i, birth.getMonth(), birth.getDate());
      const boxEnd   = new Date(birth.getFullYear() + i + 1, birth.getMonth(), birth.getDate() - 1);
      const boxId    = `y_${i}`;
      let color = cFuture;
      if (boxEnd < now) color = cPast;
      if (now >= boxStart && now < new Date(birth.getFullYear() + i + 1, birth.getMonth(), birth.getDate())) color = cCurrent;
      if (state.notes[boxId]) color = cNoted;
      const x = HEADER_W + c * (BIG + GAP), y = HEADER_H + r * (BIG + GAP);
      calCtx.fillStyle = color;
      calCtx.fillRect(x, y, BIG, BIG);
      const fontSize = Math.max(11, Math.min(BIG - 2, 18));
      calCtx.fillStyle = '#ffffff'; calCtx.font = `bold ${fontSize}px Inter`; calCtx.textAlign = 'center';
      calCtx.fillText(i, x + BIG / 2, y + BIG / 2 + fontSize / 3);
      calLayout.push({ x, y, w: BIG, h: BIG, boxId, age: i, label: `Age ${i}–${i + 1} (Year ${i + 1})`, range: `${fmtDate(boxStart)} – ${fmtDate(boxEnd)}` });
    }
  }
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getBoxAt(mx, my) {
  for (const b of calLayout) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b;
  }
  return null;
}

function onCalHover(e) {
  const rect = calCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const box = getBoxAt(mx, my);
  const tip = document.getElementById('calTooltip');
  if (!box) { tip.classList.add('hidden'); return; }
  tip.classList.remove('hidden');
  tip.innerHTML = `<strong>${box.label}</strong><br>${box.range}${box.age !== undefined ? `<br>Age: ${box.age}` : ''}${state.notes[box.boxId] ? '<br>Note saved. Click to edit.' : '<br>Click to add note.'}`;
  tip.style.left = (e.clientX + 12) + 'px';
  tip.style.top  = (e.clientY + 12) + 'px';
}

function onCalClick(e) {
  const rect = calCanvas.getBoundingClientRect();
  const box = getBoxAt(e.clientX - rect.left, e.clientY - rect.top);
  if (!box) return;
  openNoteModal(box);
}


// ═══════════════════════════════════════════════════════════
// NOTE MODAL
// ═══════════════════════════════════════════════════════════
function openNoteModal(box) {
  state.activeNoteBox = box;
  document.getElementById('noteModalTitle').textContent = box.label;
  document.getElementById('noteModalRange').textContent = box.range;
  document.getElementById('noteContent').value = state.notes[box.boxId]?.content || '';
  document.getElementById('noteModal').classList.remove('hidden');
}

async function saveNote() {
  const box     = state.activeNoteBox;
  const content = document.getElementById('noteContent').value.trim();
  if (!box) return;
  const noteData = { boxId: box.boxId, content, dateRange: box.range, type: state.calView };
  if (state.token) {
    const saved = await api('POST', '/notes', noteData).catch(() => null);
    if (saved) state.notes[box.boxId] = saved;
  } else {
    state.notes[box.boxId] = noteData;
    saveLocal();
  }
  document.getElementById('noteModal').classList.add('hidden');
  renderCalendar();
}

// ═══════════════════════════════════════════════════════════
// PLANNER
// ═══════════════════════════════════════════════════════════
function getWeekDates(offset) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}

function renderWeeklyPlanner() {
  const dates = getWeekDates(state.plannerWeekOffset);
  const first = dates[0], last = dates[6];
  document.getElementById('weekLabel').textContent = `${fmtDate(first)} – ${fmtDate(last)}`;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = new Date().toDateString();
  const grid = document.getElementById('weeklyGrid');
  grid.innerHTML = dates.map((d, i) => {
    const key = `${isoDate(d)}_weekly`;
    const content = state.plannerEntries[key]?.content || '';
    return `<div class="weekly-day${d.toDateString() === today ? ' today' : ''}">
      <div class="weekly-day-label">${days[i]}</div>
      <div class="weekly-day-date">${d.getDate()}</div>
      <textarea class="weekly-textarea" data-date="${isoDate(d)}" data-type="weekly">${escHtml(content)}</textarea>
    </div>`;
  }).join('');
  grid.querySelectorAll('.weekly-textarea').forEach(ta => {
    ta.addEventListener('input', debounce(e => savePlannerEntry(e.target.dataset.date, e.target.value, 'weekly'), 1500));
  });
}

function renderMonthlyPlanner() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + state.plannerMonthOffset, 1);
  document.getElementById('monthLabel').textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = (d.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const today = new Date().toDateString();
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = dayNames.map(n => `<div class="month-day-header">${n}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="month-day other-month"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(d.getFullYear(), d.getMonth(), day);
    const key  = `${isoDate(date)}_monthly`;
    const entry = state.plannerEntries[key];
    const preview = entry?.content ? entry.content.slice(0, 40) : '';
    html += `<div class="month-day${date.toDateString() === today ? ' today' : ''}${entry ? ' has-content' : ''}" data-date="${isoDate(date)}">
      <div class="month-day-num">${day}</div>
      <div class="month-day-preview">${escHtml(preview)}</div>
    </div>`;
  }
  document.getElementById('monthlyGrid').innerHTML = html;
  document.querySelectorAll('.month-day[data-date]').forEach(el => {
    el.addEventListener('click', () => openDayModal(el.dataset.date));
  });
}

function openDayModal(date) {
  state.activeDayDate = date;
  document.getElementById('dayModalTitle').textContent = `Plan for ${new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
  const key = `${date}_monthly`;
  document.getElementById('dayContent').value = state.plannerEntries[key]?.content || '';
  document.getElementById('dayModal').classList.remove('hidden');
}

async function saveDayPlan() {
  const date    = state.activeDayDate;
  const content = document.getElementById('dayContent').value;
  await savePlannerEntry(date, content, 'monthly');
  document.getElementById('dayModal').classList.add('hidden');
  renderMonthlyPlanner();
}

async function savePlannerEntry(date, content, viewType) {
  const key = `${date}_${viewType}`;
  if (state.token) {
    const saved = await api('POST', '/planner', { date, content, viewType }).catch(() => null);
    if (saved) state.plannerEntries[key] = saved;
  } else {
    state.plannerEntries[key] = { date, content, viewType };
    saveLocal();
  }
}

// ═══════════════════════════════════════════════════════════
// STUDY SESSIONS
// ═══════════════════════════════════════════════════════════
async function planSession(e) {
  e.preventDefault();
  const session = {
    subject:   document.getElementById('planSubject').value.trim(),
    date:      document.getElementById('planDate').value,
    startTime: document.getElementById('planStart').value,
    endTime:   document.getElementById('planEnd').value,
    notes:     document.getElementById('planNotes').value.trim(),
    completed: false,
  };
  if (state.token) {
    const saved = await api('POST', '/sessions', session).catch(() => null);
    if (saved) state.sessions.push(saved);
  } else {
    session.id = Date.now();
    state.sessions.push(session);
    saveLocal();
  }
  e.target.reset();
  renderPlannedSessions();
}

function renderPlannedSessions() {
  const container = document.getElementById('plannedList');
  const planned = state.sessions.filter(s => !s.completed).sort((a, b) => a.date > b.date ? 1 : -1);
  if (!planned.length) { container.innerHTML = '<p class="empty-msg">No sessions planned</p>'; return; }
  const grouped = {};
  planned.forEach(s => { (grouped[s.date] = grouped[s.date] || []).push(s); });
  container.innerHTML = Object.entries(grouped).map(([date, sessions]) =>
    `<div class="session-date-group">${new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>` +
    sessions.map(s => `<div class="session-item">
      <div class="s-subject">${escHtml(s.subject)}</div>
      <div class="s-meta">${s.startTime} – ${s.endTime}${s.notes ? ' · ' + escHtml(s.notes) : ''}</div>
      <div class="s-actions">
        <button class="btn btn-xs btn-accent" onclick="markComplete('${s._id || s.id}')">Done</button>
        <button class="btn btn-xs btn-danger" onclick="deleteSession('${s._id || s.id}')">Delete</button>
      </div>
    </div>`).join('')
  ).join('');
}

async function markComplete(id) {
  const s = state.sessions.find(x => (x._id || x.id) == id);
  if (!s) return;
  s.completed = true;
  if (state.token) await api('PUT', `/sessions/${id}`, { completed: true }).catch(() => {});
  else saveLocal();
  renderPlannedSessions();
  renderStudyLog();
}

async function deleteSession(id) {
  state.sessions = state.sessions.filter(x => (x._id || x.id) != id);
  if (state.token) await api('DELETE', `/sessions/${id}`).catch(() => {});
  else saveLocal();
  renderPlannedSessions();
  renderStudyLog();
}

function renderStudyLog() {
  const container = document.getElementById('studyLog');
  const done = state.sessions.filter(s => s.completed).sort((a, b) => a.date < b.date ? 1 : -1);
  if (!done.length) { container.innerHTML = '<p class="empty-msg">No completed sessions</p>'; return; }
  container.innerHTML = done.slice(0, 20).map(s =>
    `<div class="session-item">
      <div class="s-subject">${escHtml(s.subject)}</div>
      <div class="s-meta">${s.date} · ${s.startTime || ''} ${s.actualDuration ? '· ' + fmtSecs(s.actualDuration) : ''}</div>
    </div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════
// STOPWATCH
// ═══════════════════════════════════════════════════════════
function addTimer(subject) {
  state.timers.push({ id: Date.now(), subject, secs: 0, running: false, startedAt: null });
  renderTimers();
}

function renderTimers() {
  const c = document.getElementById('stopwatchTimers');
  if (!state.timers.length) { c.innerHTML = '<p class="empty-msg">No active timers</p>'; return; }
  c.innerHTML = state.timers.map(t => `
    <div class="sw-item" id="sw_${t.id}">
      <div class="sw-subject">${escHtml(t.subject)}</div>
      <div class="sw-display" id="swd_${t.id}">${fmtSecs(t.secs)}</div>
      <div class="sw-controls">
        <button class="btn btn-xs ${t.running ? 'btn-ghost' : 'btn-accent'}" onclick="toggleTimer(${t.id})">${t.running ? 'Pause' : 'Start'}</button>
        <button class="btn btn-xs" onclick="stopSaveTimer(${t.id})">Stop & Save</button>
        <button class="btn btn-xs btn-danger" onclick="removeTimer(${t.id})">Delete</button>
      </div>
    </div>`).join('');
}

function toggleTimer(id) {
  const t = state.timers.find(x => x.id === id);
  if (!t) return;
  t.running = !t.running;
  renderTimers();
}

function removeTimer(id) {
  state.timers = state.timers.filter(x => x.id !== id);
  renderTimers();
}

async function stopSaveTimer(id) {
  const t = state.timers.find(x => x.id === id);
  if (!t || t.secs === 0) return;
  t.running = false;
  const session = {
    subject: t.subject,
    date: isoDate(new Date()),
    actualDuration: t.secs,
    completed: true,
    startTime: '',
    endTime: '',
  };
  if (state.token) {
    const saved = await api('POST', '/sessions', session).catch(() => null);
    if (saved) state.sessions.push(saved);
  } else {
    session.id = Date.now();
    state.sessions.push(session);
    saveLocal();
  }
  removeTimer(id);
  renderStudyLog();
}

function tickTimers() {
  let any = false;
  state.timers.forEach(t => {
    if (t.running) { t.secs++; any = true; }
  });
  if (any) {
    state.timers.forEach(t => {
      const el = document.getElementById(`swd_${t.id}`);
      if (el) el.textContent = fmtSecs(t.secs);
    });
  }
}

function fmtSecs(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}


// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════
function loadSettingsUI() {
  if (state.dob) document.getElementById('accDOB').value = state.dob;
  document.getElementById('accLE').value = state.lifeExpectancy;
}

function populateTimezones() {
  const sel = document.getElementById('accTZ');
  const tzs = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC','Asia/Dhaka','America/New_York','Europe/London','Asia/Kolkata'];
  tzs.forEach(tz => { const o = document.createElement('option'); o.value = o.textContent = tz; sel.appendChild(o); });
  sel.value = state.timezone;
}

async function saveSettings() {
  const dob = document.getElementById('accDOB').value;
  const le  = parseInt(document.getElementById('accLE').value) || 80;
  const tz  = document.getElementById('accTZ').value;
  state.dob = dob || state.dob;
  state.lifeExpectancy = le;
  state.timezone = tz;
  if (state.token) {
    await api('PUT', '/user/settings', { lifeExpectancy: le, timezone: tz }).catch(() => {});
  }
  saveLocal();
  updateLifeStats();
  renderCalendar();
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT MODAL
// ═══════════════════════════════════════════════════════════
function openAccountModal() {
  const u = state.user;
  if (!u) return;
  document.getElementById('accName').value  = u.name || '';
  document.getElementById('accEmail').value = u.email || '';
  document.getElementById('accDOB').value   = u.dateOfBirth || '';
  document.getElementById('accLE').value    = state.lifeExpectancy;
  // Populate TZ if empty
  const tzSel = document.getElementById('accTZ');
  if (!tzSel.options.length) {
    const tzs = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC','Asia/Dhaka','America/New_York','Europe/London','Asia/Kolkata'];
    tzs.forEach(tz => { const o = document.createElement('option'); o.value = o.textContent = tz; tzSel.appendChild(o); });
  }
  tzSel.value = state.timezone;
  renderAccountAvatar();
  document.getElementById('profileMsg').classList.add('hidden');
  document.getElementById('passwordMsg').classList.add('hidden');
  document.getElementById('accCurPass').value = '';
  document.getElementById('accNewPass').value = '';
  document.getElementById('accConfPass').value = '';
  document.getElementById('accountModal').classList.remove('hidden');
}

function renderAccountAvatar() {
  const el = document.getElementById('accountAvatarPreview');
  const src = state.user?.avatar;
  el.innerHTML = src
    ? `<img src="${src}" alt="avatar">`
    : `<span>${(state.user?.name || '?')[0].toUpperCase()}</span>`;
}

async function saveProfile() {
  const msgEl = document.getElementById('profileMsg');
  try {
    const body = {
      name:          document.getElementById('accName').value.trim(),
      dateOfBirth:   document.getElementById('accDOB').value,
      timezone:      document.getElementById('accTZ').value,
      lifeExpectancy: parseInt(document.getElementById('accLE').value) || 80,
    };
    const updated = await api('PUT', '/user/profile', body);
    state.user = { ...state.user, ...updated };
    state.dob = updated.dateOfBirth || state.dob;
    state.lifeExpectancy = updated.settings?.lifeExpectancy || state.lifeExpectancy;
    state.timezone = updated.timezone || state.timezone;
    document.getElementById('userGreeting').textContent = `Hi, ${updated.name}`;
    renderProfile();
    updateLifeStats();
    renderCalendar();
    saveLocal();
    msgEl.textContent = 'Profile saved'; msgEl.style.color = 'var(--accent-green)'; msgEl.classList.remove('hidden');
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
  } catch (e) {
    msgEl.textContent = e.message; msgEl.style.color = ''; msgEl.classList.remove('hidden');
  }
}

async function savePassword() {
  const msgEl = document.getElementById('passwordMsg');
  const cur  = document.getElementById('accCurPass').value;
  const nw   = document.getElementById('accNewPass').value;
  const conf = document.getElementById('accConfPass').value;
  if (nw !== conf) {
    msgEl.textContent = 'New passwords do not match'; msgEl.style.color = ''; msgEl.classList.remove('hidden'); return;
  }
  if (nw.length < 6) {
    msgEl.textContent = 'Password must be at least 6 characters'; msgEl.style.color = ''; msgEl.classList.remove('hidden'); return;
  }
  try {
    await api('PUT', '/user/password', { currentPassword: cur, newPassword: nw });
    document.getElementById('accCurPass').value = '';
    document.getElementById('accNewPass').value = '';
    document.getElementById('accConfPass').value = '';
    msgEl.textContent = 'Password updated'; msgEl.style.color = 'var(--accent-green)'; msgEl.classList.remove('hidden');
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
  } catch (e) {
    msgEl.textContent = e.message; msgEl.style.color = ''; msgEl.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════
function renderProfile() {
  const el = document.getElementById('profileInfo');
  if (state.user) {
    const avatarHtml = state.user.avatar
      ? `<img src="${state.user.avatar}" class="profile-avatar-img" alt="avatar">`
      : `<div class="profile-avatar-placeholder">${(state.user.name || '?')[0].toUpperCase()}</div>`;
    const shareUrl = `${location.origin}/share.html?u=${state.user.id}`;
    el.innerHTML = `${avatarHtml}<strong>${escHtml(state.user.name)}</strong>
      <div style="margin-top:.5rem;display:flex;gap:.4rem;flex-wrap:wrap">
        <button class="btn btn-xs btn-ghost" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>alert('Share link copied.'))">Copy Share Link</button>
        <a href="${shareUrl}" target="_blank" class="btn btn-xs btn-ghost">View Public Profile</a>
      </div>`;
  } else {
    el.innerHTML = '<p class="text-secondary">Not logged in</p>';
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════
function initEvents() {
  // Forgot password
  document.getElementById('forgotPasswordLink').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('forgotModal').classList.remove('hidden');
  });
  document.getElementById('closeForgotModal').addEventListener('click', () => document.getElementById('forgotModal').classList.add('hidden'));
  document.getElementById('sendResetBtn').addEventListener('click', async () => {
    const email = document.getElementById('forgotEmail').value.trim();
    const msgEl = document.getElementById('forgotMsg');
    if (!email) return;
    try {
      const data = await api('POST', '/auth/forgot-password', { email });
      msgEl.textContent = data.message;
      msgEl.style.color = 'var(--accent-green)';
      msgEl.classList.remove('hidden');
    } catch (e) {
      msgEl.textContent = e.message;
      msgEl.style.color = 'var(--accent-red)';
      msgEl.classList.remove('hidden');
    }
  });

  // Auth modal
  document.getElementById('authBtn').addEventListener('click', () => document.getElementById('authModal').classList.remove('hidden'));
  document.getElementById('closeAuthModal').addEventListener('click', () => document.getElementById('authModal').classList.add('hidden'));
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Account modal
  document.getElementById('accountBtn').addEventListener('click', openAccountModal);
  document.getElementById('closeAccountModal').addEventListener('click', () => document.getElementById('accountModal').classList.add('hidden'));
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
  document.getElementById('savePasswordBtn').addEventListener('click', savePassword);
  document.getElementById('avatarInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target.result;
      try {
        await api('POST', '/user/avatar', { avatar: base64 });
        state.user.avatar = base64;
        renderAccountAvatar();
        renderProfile();
      } catch (err) { alert(err.message); }
    };
    reader.readAsDataURL(file);
  });

  // Modal tabs
  document.querySelectorAll('.modal-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const form = btn.dataset.form;
      document.getElementById('loginForm').classList.toggle('hidden', form !== 'login');
      document.getElementById('registerForm').classList.toggle('hidden', form !== 'register');
    });
  });

  // Login
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    try {
      const data = await api('POST', '/auth/login', {
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
      });
      document.getElementById('authModal').classList.add('hidden');
      const hadLocal = hasLocalData();
      applyUser(data.token, data.user);
      if (hadLocal) document.getElementById('migrateModal').classList.remove('hidden');
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove('hidden');
    }
  });

  // Register
  document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('regError');
    try {
      const data = await api('POST', '/auth/register', {
        name:        document.getElementById('regName').value,
        email:       document.getElementById('regEmail').value,
        password:    document.getElementById('regPassword').value,
        dateOfBirth: document.getElementById('regDOB').value,
      });
      document.getElementById('authModal').classList.add('hidden');
      applyUser(data.token, data.user);
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove('hidden');
    }
  });

  // Migrate modal
  document.getElementById('migrateYes').addEventListener('click', async () => {
    await migrateLocalToServer();
    document.getElementById('migrateModal').classList.add('hidden');
  });
  document.getElementById('migrateNo').addEventListener('click', () => {
    document.getElementById('migrateModal').classList.add('hidden');
  });

  // Center tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'calendar') renderCalendar();
    });
  });

  // Calendar view toggle
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.calView = btn.dataset.view;
      renderCalendar();
    });
  });

  // Note modal
  document.getElementById('closeNoteModal').addEventListener('click', () => document.getElementById('noteModal').classList.add('hidden'));
  document.getElementById('saveNoteBtn').addEventListener('click', saveNote);

  // Day modal
  document.getElementById('closeDayModal').addEventListener('click', () => document.getElementById('dayModal').classList.add('hidden'));
  document.getElementById('saveDayBtn').addEventListener('click', saveDayPlan);

  // Planner subtabs
  document.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`subtab-${btn.dataset.subtab}`).classList.add('active');
      if (btn.dataset.subtab === 'weekly') renderWeeklyPlanner();
      else renderMonthlyPlanner();
    });
  });

  // Planner navigation
  document.getElementById('prevWeek').addEventListener('click', () => { state.plannerWeekOffset--; renderWeeklyPlanner(); });
  document.getElementById('nextWeek').addEventListener('click', () => { state.plannerWeekOffset++; renderWeeklyPlanner(); });
  document.getElementById('prevMonth').addEventListener('click', () => { state.plannerMonthOffset--; renderMonthlyPlanner(); });
  document.getElementById('nextMonth').addEventListener('click', () => { state.plannerMonthOffset++; renderMonthlyPlanner(); });

  // Plan form
  document.getElementById('planForm').addEventListener('submit', planSession);

  // Stopwatch add
  document.getElementById('addTimerBtn').addEventListener('click', () => document.getElementById('timerModal').classList.remove('hidden'));
  document.getElementById('closeTimerModal').addEventListener('click', () => document.getElementById('timerModal').classList.add('hidden'));
  document.getElementById('confirmTimerBtn').addEventListener('click', () => {
    const subj = document.getElementById('timerSubjectInput').value.trim();
    if (!subj) return;
    addTimer(subj);
    document.getElementById('timerSubjectInput').value = '';
    document.getElementById('timerModal').classList.add('hidden');
  });

  // Mobile tab bar
  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mobile-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panelLeft').classList.remove('mobile-active');
      document.getElementById('panelCenter').classList.remove('mobile-active');
      document.getElementById('panelRight').classList.remove('mobile-active');
      const map = { left: 'panelLeft', center: 'panelCenter', right: 'panelRight' };
      document.getElementById(map[btn.dataset.panel]).classList.add('mobile-active');
    });
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  });
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
async function init() {
  loadLocal();
  populateTimezones();
  loadSettingsUI();
  initCanvas();
  initEvents();
  renderProfile();
  renderPlannedSessions();
  renderStudyLog();
  renderWeeklyPlanner();
  renderMonthlyPlanner();

  // On mobile, show center by default
  if (window.innerWidth <= 860) {
    document.getElementById('panelCenter').classList.add('mobile-active');
    document.querySelector('.mobile-tab[data-panel="center"]').classList.add('active');
    document.querySelector('.mobile-tab[data-panel="left"]').classList.remove('active');
  }

  await tryAutoLogin();

  if (!state.token) {
    const inp = 'width:100%;padding:.6rem;margin-bottom:.75rem;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:.9rem;';
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0d1117;font-family:Inter,sans-serif;">
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:2.5rem;width:100%;max-width:380px;text-align:center;">
          <div style="font-size:1.25rem;margin-bottom:.5rem;font-weight:800;letter-spacing:.08em;">LOGIN</div>
          <h1 style="color:#e6edf3;font-size:1.4rem;margin-bottom:.25rem;">LifeClock</h1>
          <p style="color:#8b949e;font-size:.9rem;margin-bottom:1.5rem;">Please login to continue</p>

          <div style="display:flex;gap:.5rem;margin-bottom:.25rem;">
            <button id="tab-login" onclick="showTab('login')" style="flex:1;padding:.6rem;background:#388bfd;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9rem;">Login</button>
            <button id="tab-reg" onclick="showTab('reg')" style="flex:1;padding:.6rem;background:#21262d;color:#e6edf3;border:1px solid #30363d;border-radius:8px;cursor:pointer;font-size:.9rem;">Register</button>
          </div>

          <!-- Google OAuth -->
          <a href="/api/auth/google" style="display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.6rem;margin-top:.75rem;background:#21262d;color:#e6edf3;border:1px solid #30363d;border-radius:8px;text-decoration:none;font-size:.9rem;box-sizing:border-box;">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Continue with Google
          </a>

          <!-- Login Form -->
          <div id="lc-login-form" style="margin-top:1.25rem;text-align:left;">
            <input id="li-email" type="email" placeholder="Email" style="${inp}">
            <input id="li-pass" type="password" placeholder="Password" style="${inp}">
            <button onclick="doLogin()" style="width:100%;padding:.65rem;background:#388bfd;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.95rem;">Sign In</button>
            <p style="text-align:right;margin-top:.6rem;">
              <a href="#" onclick="showTab('forgot')" style="color:#8b949e;font-size:.82rem;text-decoration:none;">Forgot password?</a>
            </p>
            <p id="li-err" style="color:#f85149;font-size:.85rem;margin-top:.25rem;display:none;"></p>
          </div>

          <!-- Register Form -->
          <div id="lc-reg-form" style="margin-top:1.25rem;text-align:left;display:none;">
            <input id="rg-name" type="text" placeholder="Full Name" style="${inp}">
            <input id="rg-email" type="email" placeholder="Email" style="${inp}">
            <input id="rg-pass" type="password" placeholder="Password" style="${inp}">
            <input id="rg-dob" type="date" placeholder="Date of Birth" style="${inp}">
            <button onclick="doRegister()" style="width:100%;padding:.65rem;background:#3fb950;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.95rem;">Create Account</button>
            <p id="rg-err" style="color:#f85149;font-size:.85rem;margin-top:.5rem;display:none;"></p>
          </div>

          <!-- Forgot Password Form -->
          <div id="lc-forgot-form" style="margin-top:1.25rem;text-align:left;display:none;">
            <p style="color:#8b949e;font-size:.85rem;margin-bottom:.75rem;">Enter your email and we'll send a reset link.</p>
            <input id="fp-email" type="email" placeholder="Email" style="${inp}">
            <button onclick="doForgot()" style="width:100%;padding:.65rem;background:#388bfd;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.95rem;">Send Reset Link</button>
            <p style="margin-top:.6rem;"><a href="#" onclick="showTab('login')" style="color:#8b949e;font-size:.82rem;text-decoration:none;">Back to login</a></p>
            <p id="fp-msg" style="font-size:.85rem;margin-top:.5rem;display:none;"></p>
          </div>
        </div>
      </div>`;

    window.showTab = (tab) => {
      document.getElementById('lc-login-form').style.display  = tab === 'login'  ? 'block' : 'none';
      document.getElementById('lc-reg-form').style.display    = tab === 'reg'    ? 'block' : 'none';
      document.getElementById('lc-forgot-form').style.display = tab === 'forgot' ? 'block' : 'none';
      document.getElementById('tab-login').style.background = tab === 'login' ? '#388bfd' : '#21262d';
      document.getElementById('tab-reg').style.background   = tab === 'reg'   ? '#388bfd' : '#21262d';
    };

    window.doLogin = async () => {
      const email = document.getElementById('li-email').value;
      const password = document.getElementById('li-pass').value;
      const err = document.getElementById('li-err');
      try {
        const data = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password}) }).then(r=>r.json());
        if (!data.token) throw new Error(data.message || 'Login failed');
        localStorage.setItem('lc_token', data.token);
        location.reload();
      } catch(e) { err.textContent = e.message; err.style.display='block'; }
    };

    window.doRegister = async () => {
      const name = document.getElementById('rg-name').value;
      const email = document.getElementById('rg-email').value;
      const password = document.getElementById('rg-pass').value;
      const dateOfBirth = document.getElementById('rg-dob').value;
      const err = document.getElementById('rg-err');
      try {
        const data = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, email, password, dateOfBirth}) }).then(r=>r.json());
        if (!data.token) throw new Error(data.message || 'Registration failed');
        localStorage.setItem('lc_token', data.token);
        location.reload();
      } catch(e) { err.textContent = e.message; err.style.display='block'; }
    };

    window.doForgot = async () => {
      const email = document.getElementById('fp-email').value;
      const msg = document.getElementById('fp-msg');
      try {
        const data = await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email}) }).then(r=>r.json());
        msg.textContent = data.message;
        msg.style.color = '#3fb950';
        msg.style.display = 'block';
      } catch(e) { msg.textContent = e.message; msg.style.color='#f85149'; msg.style.display='block'; }
    };

    return;
  }

  if (state.dob) {
    updateLifeStats();
    renderCalendar();
  }

  // Clock ticks every second
  updateClock();
  setInterval(updateClock, 1000);

  // Life stats update every minute
  setInterval(updateLifeStats, 60000);

  // Stopwatch ticks every second
  setInterval(tickTimers, 1000);

  // Load streak widget
  loadStreaks();
  generateSuggestions();

  // Re-render calendar on resize
  window.addEventListener('resize', () => renderCalendar());
}

document.addEventListener('DOMContentLoaded', init);


// ═══════════════════════════════════════════════════════════
// POMODORO TIMER
// ═══════════════════════════════════════════════════════════
(function() {
  const MODES = { work: { secs: 25*60, label: 'Focus Session' }, break: { secs: 5*60, label: 'Short Break' } };
  let mode = 'work', remaining = MODES.work.secs, running = false, interval = null;
  let pomoCount = parseInt(localStorage.getItem('lc_pomo_count_' + new Date().toDateString()) || '0');

  const display  = document.getElementById('pomoDisplay');
  const label    = document.getElementById('pomoLabel');
  const startBtn = document.getElementById('pomoStartBtn');
  const resetBtn = document.getElementById('pomoResetBtn');
  const countEl  = document.getElementById('pomoCount');
  if (!display) return;

  countEl.textContent = pomoCount;

  function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = mode === 'work' ? 880 : 440;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.start(); osc.stop(ctx.currentTime + 1.2);
    } catch {}
  }

  function tick() {
    remaining--;
    display.textContent = fmt(remaining);
    if (remaining <= 0) {
      clearInterval(interval); running = false;
      startBtn.textContent = 'Start';
      beep();
      if (mode === 'work') {
        pomoCount++;
        localStorage.setItem('lc_pomo_count_' + new Date().toDateString(), pomoCount);
        countEl.textContent = pomoCount;
      }
      // auto-switch mode
      switchMode(mode === 'work' ? 'break' : 'work');
    }
  }

  function switchMode(m) {
    mode = m;
    remaining = MODES[m].secs;
    display.textContent = fmt(remaining);
    display.className = 'pomo-display' + (m === 'break' ? ' break' : '');
    label.textContent = MODES[m].label;
    document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  }

  startBtn.addEventListener('click', () => {
    if (running) {
      clearInterval(interval); running = false; startBtn.textContent = 'Resume';
    } else {
      interval = setInterval(tick, 1000); running = true; startBtn.textContent = 'Pause';
    }
  });

  resetBtn.addEventListener('click', () => {
    clearInterval(interval); running = false;
    startBtn.textContent = 'Start';
    remaining = MODES[mode].secs;
    display.textContent = fmt(remaining);
  });

  document.querySelectorAll('.pomo-mode-btn').forEach(b => {
    b.addEventListener('click', () => {
      clearInterval(interval); running = false; startBtn.textContent = 'Start';
      switchMode(b.dataset.mode);
    });
  });
})();


// ═══════════════════════════════════════════════════════════
// DAILY QUOTE
// ═══════════════════════════════════════════════════════════
(function() {
  const QUOTES = [
    { text: "The two most powerful warriors are patience and time.", author: "Leo Tolstoy" },
    { text: "Lost time is never found again.", author: "Benjamin Franklin" },
    { text: "Time is what we want most, but what we use worst.", author: "William Penn" },
    { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
    { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
    { text: "Either you run the day or the day runs you.", author: "Jim Rohn" },
    { text: "It's not enough to be busy. The question is: what are we busy about?", author: "Henry David Thoreau" },
    { text: "You may delay, but time will not.", author: "Benjamin Franklin" },
    { text: "The bad news is time flies. The good news is you're the pilot.", author: "Michael Altshuler" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Time is the scarcest resource; unless it is managed, nothing else can be managed.", author: "Peter Drucker" },
    { text: "Ordinary people think merely of spending time. Great people think of using it.", author: "Arthur Schopenhauer" },
    { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  ];

  const el = document.getElementById('quoteText');
  const au = document.getElementById('quoteAuthor');
  if (!el) return;

  // Show same quote all day, change daily
  const idx = Math.floor(Date.now() / 86400000) % QUOTES.length;
  const q = QUOTES[idx];
  el.textContent = `"${q.text}"`;
  au.textContent = `— ${q.author}`;
})();


// ═══════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════
document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
  const rows = [['Subject','Date','Start','End','Duration (min)','Notes']];
  state.sessions.forEach(s => {
    const dur = s.actualDuration ? Math.round(s.actualDuration/60) : (s.plannedDuration || '');
    rows.push([s.subject, s.date, s.startTime||'', s.endTime||'', dur, (s.notes||'').replace(/,/g,' ')]);
  });
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `lifeclock-sessions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
});


// ═══════════════════════════════════════════════════════════
// DARK / LIGHT THEME TOGGLE
// ═══════════════════════════════════════════════════════════
(function() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const saved = localStorage.getItem('lc_theme') || 'dark';
  if (saved === 'light') { document.documentElement.classList.add('light'); document.body.classList.add('light'); btn.textContent = 'Dark'; } else { btn.textContent = 'Light'; }

  btn.addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('light');
    document.body.classList.toggle('light', isLight);
    btn.textContent = isLight ? 'Dark' : 'Light';
    localStorage.setItem('lc_theme', isLight ? 'light' : 'dark');
  });
})();


// ═══════════════════════════════════════════════════════════
// STREAK TRACKER (dashboard widget)
// ═══════════════════════════════════════════════════════════
async function loadStreaks() {
  const el = document.getElementById('streakList');
  if (!el) return;
  try {
    let habits = [], logs = {};
    if (state.token) {
      habits = await api('GET', '/habits');
      const today = new Date().toISOString().slice(0,10);
      const from  = new Date(Date.now() - 60*86400000).toISOString().slice(0,10);
      const raw   = await api('GET', `/habitlogs?from=${from}&to=${today}`);
      raw.forEach(l => { logs[`${l.habitId}_${l.date}`] = l.count; });
    } else {
      habits = JSON.parse(localStorage.getItem('lc_habits') || '[]');
      logs   = JSON.parse(localStorage.getItem('lc_habitlogs') || '{}');
    }
    if (!habits.length) return;

    function addDays(ds, n) { const d=new Date(ds+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
    function getStreak(id) {
      let s=0, d=new Date().toISOString().slice(0,10);
      while(logs[`${id}_${d}`]) { s++; d=addDays(d,-1); }
      return s;
    }

    const maxStreak = Math.max(...habits.map(h => getStreak(h.id||h._id)), 1);
    el.innerHTML = habits.slice(0,5).map(h => {
      const s = getStreak(h.id||h._id);
      const pct = Math.round((s/Math.max(maxStreak,1))*100);
      return `<div class="streak-row">
        <div style="flex:1">
          <div class="streak-name">${h.emoji||'H'} ${h.name}</div>
          <div class="streak-bar-wrap"><div class="streak-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="streak-badge">${s} day${s === 1 ? '' : 's'}</div>
      </div>`;
    }).join('');
  } catch {}
}


// ═══════════════════════════════════════════════════════════
// AI STUDY SUGGESTIONS (rule-based)
// ═══════════════════════════════════════════════════════════
function generateSuggestions() {
  const el = document.getElementById('aiSuggestions');
  if (!el) return;
  const sessions = state.sessions;
  if (!sessions.length) { el.innerHTML = '<p class="empty-msg">Log some sessions to get suggestions</p>'; return; }

  const suggestions = [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0,10);
  const weekAgo  = new Date(now - 7*86400000).toISOString().slice(0,10);

  // Sessions this week
  const thisWeek = sessions.filter(s => s.date >= weekAgo && s.date <= todayStr);
  const totalMins = thisWeek.reduce((a,s) => a + (s.actualDuration||s.plannedDuration||0), 0) / 60;

  // Subject frequency
  const subjectCount = {};
  sessions.forEach(s => { subjectCount[s.subject] = (subjectCount[s.subject]||0) + 1; });
  const subjects = Object.entries(subjectCount).sort((a,b) => b[1]-a[1]);
  const topSubject = subjects[0]?.[0];
  const leastSubject = subjects[subjects.length-1]?.[0];

  // Last session date
  const lastDate = sessions.slice().sort((a,b) => b.date.localeCompare(a.date))[0]?.date;
  const daysSinceLast = lastDate ? Math.floor((now - new Date(lastDate+'T00:00:00'))/86400000) : 99;

  // Generate suggestions
  if (daysSinceLast >= 2)
    suggestions.push({ text: `You haven't studied in ${daysSinceLast} days. Start with a short 25-min Pomodoro session today.`, type: 'warn' });

  if (totalMins < 60)
    suggestions.push({ text: `Only ${Math.round(totalMins)} min studied this week. Aim for at least 2 hours to build momentum.`, type: 'warn' });
  else if (totalMins >= 300)
    suggestions.push({ text: `Great week! ${Math.round(totalMins/60)}h studied. Keep the streak going.`, type: 'good' });

  if (topSubject)
    suggestions.push({ text: `Your most studied subject is <b>${topSubject}</b>. Consider reviewing it with practice problems.`, type: '' });

  if (leastSubject && leastSubject !== topSubject)
    suggestions.push({ text: `<b>${leastSubject}</b> has the fewest sessions. Schedule at least one session this week.`, type: 'warn' });

  if (subjects.length >= 3)
    suggestions.push({ text: `You're tracking ${subjects.length} subjects. Try the Pomodoro timer for focused 25-min blocks per subject.`, type: '' });

  const hour = now.getHours();
  if (hour >= 6 && hour < 10)
    suggestions.push({ text: 'Morning is a great time to study. Your focus is highest in the first 2 hours after waking.', type: 'good' });
  else if (hour >= 22)
    suggestions.push({ text: 'Late night studying reduces retention. Try to finish by 10 PM and get 7–8 hours of sleep.', type: 'warn' });

  if (!suggestions.length)
    suggestions.push({ text: 'Keep logging sessions to get personalized suggestions.', type: '' });

  el.innerHTML = suggestions.map(s =>
    `<div class="ai-suggestion ${s.type}">${s.text}</div>`
  ).join('');
}

document.getElementById('refreshSuggestBtn')?.addEventListener('click', generateSuggestions);





