// Задачник для торговых агентов — фронтенд на чистом JS, без сборки и фреймворков.

const state = {
  user: null,
  stages: [],
  saleTags: [],
  waitlistStages: [],
  waitlistTags: [],
  taskTags: [],
  paymentMethods: [],
  contractStatuses: [],
  pointTypes: [],
  clients: [],
  tasks: [],
  users: [],
  supervisorMeetings: [],
  view: 'dashboard',
  stats: null,
  clientFilters: { visitDay: '', pointType: '', paymentMethod: '', ownerId: '', onlyRegular: false, onlyDebt: false, onlyShortfall: false, onlyDiscount: false, onlyWa: false, onlyNoWa: false, onlyPendingApproval: false, showClosed: false, geo: '', search: '' },
  clientSort: { key: null, dir: -1 },
  taskTagFilter: new Set(),
  saleTagFilter: new Set(),
  waitlistTagFilter: new Set(),
  // П.8 бэклога (08.09.2026): фильтр «есть заявка на перенос даты», общий для
  // всех трёх воронок задач (поле dateChangeRequest не завязано на taskType).
  onlyDateChangeRequest: false,
  // Фаза 29 (14.09.2026): фильтр «Просроченные» на странице «Задачи» — по
  // тому же принципу, что и onlyDateChangeRequest выше (общий для всех
  // четырёх воронок задач, критерий — isTaskOverdue()).
  onlyOverdue: false,
  // П.2 бэклога (08.09.2026): поиск клиента на странице «Задачи» — по образцу
  // поиска на странице «Клиенты» (filter-search).
  taskClientSearch: '',
  // Бэклог, зафиксирован 17.09.2026, реализован 18.09.2026 (Фаза 33): фильтр
  // по агентам на странице «Задачи» — по образцу filter-ownerId на «Клиентах»
  // (видим только супервайзеру/админу). Фильтрует по assigneeId задачи — общий
  // для всех четырёх воронок (визиты/продажи/лист ожидания/агенту), как и
  // onlyOverdue/onlyDateChangeRequest выше.
  taskFilterOwnerId: '',
  // hiddenTypes (Фаза 31, 14.09.2026): набор taskType, скрытых фильтром по воронкам
  // в Календаре — 'visit'|'sale'|'waitlist'|'agent'. Пусто по умолчанию — показаны все.
  calendar: { mode: 'month', date: new Date(), hiddenTypes: new Set(), agentId: '', visitDay: '' },
  clientBulkMode: false,
  clientBulkSelected: new Set(),
  taskBulkMode: false,
  taskBulkSelected: new Set(),
  // Правка 31.08.2026 (п.2): по умолчанию открывается первая вкладка после
  // смены порядка — «Воронка продаж» (была — «Визиты»).
  taskTypeView: 'sale',
  ratingSelectedMonths: new Set(),
  // Фаза 15, п.5: фильтр по месяцам для карточки "Продано всего" на дашборде
  // агента — пусто = все 7 месяцев (как раньше), иначе — выбранные месяцы.
  salesAllMonthsSelected: new Set()
};

// Единственный "активный" (ещё не завершённый) этап — раньше их было три
// (new/in_progress/waiting), теперь "Новая задача" и "Лист ожидания" убраны
// с доски (см. api.js), остался только "В работе".
const ACTIVE_STAGES = ['in_progress'];

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
// Месяцы, за которые есть полная 6-месячная история ассортимента (regular/test
// assortment), приходят с сервера через /api/me (state.salesMonths, заполняется
// в boot() из MONTH_ORDER, src/import.js) — используются чипами-фильтрами по
// месяцам («Продано всего», рейтинг клиентов, отчёт «Ассортимент по агентам»).
// Правка 14.09.2026 (Фаза 32): раньше здесь же была функция latestSalesMonth(),
// подписывавшая карточки «Топ-10 по брендам»/«Выручка»/«План»/«Факт» последним
// месяцем ЭТОЙ 6-месячной истории (август) — но сами эти карточки считаются НЕ
// из неё, а из currentMonthRevenue/currentMonthItems (см. topByBrand/salesPerformance
// в src/api.js) — отдельного, уже живого источника (data/import/current_month_sales.json,
// обновляется срезами в течение месяца, а не раз в 6 месяцев). Из-за этого карточки
// с абсолютно актуальными (сентябрьскими) цифрами были подписаны «(Август)» — жалоба
// пользователя: «продажи текущий месяц а не август как сейчас». Функция удалена,
// эти 4 места теперь подписаны статично «текущий месяц» — см. renderTopBrandTable-
// панель и renderPerf() ниже. Ограничение из старого комментария (не выводить месяц
// из new Date(), чтобы не создавать впечатление «живых» цифр по НЕ обновлённым
// данным) по-прежнему в силе — но относится только к 6-месячной истории ниже,
// которая действительно обновляется редко и не совпадает с текущим календарём.

// "Продажа" (taskType: 'sale') — до Фазы 22 была отдельной воронкой "звонок →
// встреча → сделка/провал" со своими этапами. С Фазы 22 технически устроена так
// же, как обычная задача-визит (те же этапы — state.stages/ACTIVE_STAGES, тот же
// общий отчёт при закрытии в "Выполнена"), отличается только своим набором тегов
// (бренды + "Договор" — приходят с сервера в state.saleTags) и заголовком/вкладкой
// в интерфейсе, чтобы сохранить отдельную фильтрацию.
const WAITLIST_ACTIVE_STAGES_CLIENT = ['waiting', 'invoiced'];
// Активна ли задача (не закрыта), независимо от типа воронки — используется
// для клиентского пересчёта карточек дашборда при фильтре по агенту (см. dashCardValue).
function isTaskActiveClient(t) {
  if (t.taskType === 'waitlist') return WAITLIST_ACTIVE_STAGES_CLIENT.includes(t.stage);
  return ACTIVE_STAGES.includes(t.stage);
}

// Правка 14.09.2026 (Фаза 29): «просрочено» — тот же критерий, что уже
// использовался поштучно на карточках четырёх досок (дата в прошлом + этап
// ещё активный, т.е. isTaskActiveClient) и в счётчике «Просроченных задач»
// на дашборде (см. case 'overdueTasksCount' в dashCardValue) — вынесено в
// одну функцию, чтобы фильтр «Просроченные» на странице «Задачи» считал
// ровно так же, а не по своей отдельной логике.
// Фаза 40 (25.09.2026): срок любой задачи — до 20:00 (Бишкек) её дня; после
// 20:00 активная задача этого дня уже «просрочена» (то же правило на сервере).
const TASK_DEADLINE_HOUR = 20;
function isTaskOverdue(t) {
  if (!t.dueDate || !isTaskActiveClient(t)) return false;
  const bk = new Date(Date.now() + 6 * 3600 * 1000);
  const today = bk.toISOString().slice(0, 10);
  return t.dueDate < today || (t.dueDate === today && bk.getUTCHours() >= TASK_DEADLINE_HOUR);
}
// Задачу «Посещение» открываем карточкой клиента (там кнопка отметки).
function openTaskOrClient(t) {
  if (t.taskType === 'checkin') {
    const c = clientById(t.clientId);
    if (c) return openClientModal(c);
  }
  return openTaskModal(t);
}

// ---------- Утилита запросов к API ----------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || 'Ошибка запроса');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function apiUpload(path, formData) {
  const res = await fetch(path, { method: 'POST', body: formData });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки файла');
  return data;
}

function fmtMoney(n) { return Number(n || 0).toLocaleString('ru-RU') + ' сом'; }
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  if (!day) return d;
  return `${day}.${m}.${y}`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------- Поле ввода даты с годом в 2 цифры (ДД.ММ.ГГ) ----------
// Хранение и передача на сервер — в прежнем формате ISO (YYYY-MM-DD),
// меняется только то, как год отображается пользователю при вводе.
function isoToShortDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!d) return '';
  return `${d}.${m}.${(y || '').slice(-2)}`;
}
function shortDisplayToIso(disp) {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*$/.exec(disp || '');
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  d = pad2(Number(d)); mo = pad2(Number(mo));
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${mo}-${d}`;
}
let _dateFieldSeq = 0;
function dateFieldHTML(opts) {
  const { name, id, value, required, disabled } = opts || {};
  const hiddenId = id || `df-${name}-${++_dateFieldSeq}`;
  return `
    <span class="date-field">
      <input type="hidden" name="${name}" id="${hiddenId}" value="${value || ''}" ${required ? 'data-required="1"' : ''}>
      <input type="text" class="date-display-input" inputmode="numeric" placeholder="ДД.ММ.ГГ" maxlength="8"
             value="${isoToShortDisplay(value)}" data-for="${hiddenId}" ${disabled ? 'disabled' : ''} autocomplete="off">
      <button type="button" class="date-pick-btn" data-for="${hiddenId}" ${disabled ? 'disabled' : ''} title="Выбрать дату">📅</button>
    </span>`;
}
function _dateFieldSync(hiddenInput) {
  const wrap = hiddenInput.closest('.date-field');
  const textInput = wrap && wrap.querySelector('.date-display-input');
  if (textInput) textInput.value = isoToShortDisplay(hiddenInput.value);
}
document.addEventListener('input', (e) => {
  if (!e.target.classList || !e.target.classList.contains('date-display-input')) return;
  const hidden = document.getElementById(e.target.dataset.for);
  if (!hidden) return;
  const iso = shortDisplayToIso(e.target.value);
  if (iso) { hidden.value = iso; e.target.classList.remove('invalid'); }
  else if (e.target.value.trim()) e.target.classList.add('invalid');
  else { hidden.value = ''; e.target.classList.remove('invalid'); }
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.date-pick-btn');
  if (btn) { e.preventDefault(); if (btn.disabled) return; openMiniDatePicker(btn); return; }
  const openPopup = document.querySelector('.mini-date-picker');
  if (openPopup && !openPopup.contains(e.target) && !(e.target.closest && e.target.closest('.date-pick-btn'))) openPopup.remove();
});
function openMiniDatePicker(anchorBtn) {
  const existing = document.querySelector('.mini-date-picker');
  if (existing) existing.remove();
  const hidden = document.getElementById(anchorBtn.dataset.for);
  if (!hidden) return;
  const base = hidden.value ? new Date(hidden.value) : new Date();
  const view = { y: base.getFullYear(), m: base.getMonth() };
  const pop = el('<div class="mini-date-picker"></div>');
  const rect = anchorBtn.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = `${rect.bottom + 4}px`;
  pop.style.left = `${Math.max(4, rect.left - 200)}px`;
  document.body.appendChild(pop);
  function draw() {
    const todayKey = toDateKey(new Date());
    const selKey = hidden.value || '';
    const startDate = startOfWeek(new Date(view.y, view.m, 1));
    let html = `
      <div class="mdp-header">
        <button type="button" class="mdp-nav" data-dir="-1">‹</button>
        <span>${MONTH_LABELS[view.m]} ${view.y}</span>
        <button type="button" class="mdp-nav" data-dir="1">›</button>
      </div>
      <div class="mdp-grid">
        ${WEEKDAY_LABELS.map((w) => `<div class="mdp-wd">${w}</div>`).join('')}
    `;
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = toDateKey(d);
      const outside = d.getMonth() !== view.m;
      html += `<div class="mdp-cell ${outside ? 'mdp-outside' : ''} ${key === todayKey ? 'mdp-today' : ''} ${key === selKey ? 'mdp-selected' : ''}" data-key="${key}">${d.getDate()}</div>`;
    }
    html += '</div>';
    pop.innerHTML = html;
    pop.querySelectorAll('.mdp-nav').forEach((btnEl) => btnEl.addEventListener('click', () => {
      const dir = Number(btnEl.dataset.dir);
      view.m += dir;
      if (view.m < 0) { view.m = 11; view.y--; }
      if (view.m > 11) { view.m = 0; view.y++; }
      draw();
    }));
    pop.querySelectorAll('.mdp-cell').forEach((c) => c.addEventListener('click', () => {
      hidden.value = c.dataset.key;
      _dateFieldSync(hidden);
      pop.remove();
    }));
  }
  draw();
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function isStaff() { return state.user.role === 'admin' || state.user.role === 'supervisor'; }
function isAdmin() { return state.user.role === 'admin'; }

function clientById(id) { return state.clients.find((c) => c.id === id); }
function userName(id) { const u = state.users.find((u) => u.id === id); return u ? u.name : '—'; }
function roleLabel(r) { return { admin: 'администратор', supervisor: 'супервайзер', agent: 'вэн-агент' }[r] || r; }

// ---------- Вход / выход ----------

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    await api('POST', '/api/login', { email, password });
    await boot();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// 09.10.2026: смена своего пароля (любая роль).
document.getElementById('my-password-btn').addEventListener('click', () => {
  openModal(`
    <h2>Сменить пароль</h2>
    <form>
      <label>Текущий пароль</label>
      <input type="password" name="oldPassword" required autocomplete="current-password">
      <label>Новый пароль (не короче 6 символов)</label>
      <input type="password" name="newPassword" required minlength="6" autocomplete="new-password">
      <label>Новый пароль ещё раз</label>
      <input type="password" name="newPassword2" required minlength="6" autocomplete="new-password">
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cancel-modal">Отмена</button>
        <button type="submit" class="btn-primary">Сменить</button>
      </div>
    </form>`, async (form) => {
    const d = Object.fromEntries(new FormData(form).entries());
    if (d.newPassword !== d.newPassword2) throw new Error('Новые пароли не совпадают');
    await api('POST', '/api/me/password', { oldPassword: d.oldPassword, newPassword: d.newPassword });
    closeModal();
    showToast('Пароль изменён. На других устройствах нужно войти заново.', 'ok');
  });
});

// Администратор задаёт пароль сотруднику (вкладка «Команда»).
function openSetPasswordModal(u) {
  openModal(`
    <h2>Новый пароль: ${escapeHtml(u.name)}</h2>
    <p class="muted" style="margin-top:0">${escapeHtml(u.email || '')} · старый пароль перестанет работать, сотрудник выйдет на всех устройствах.</p>
    <form>
      <label>Новый пароль (не короче 6 символов)</label>
      <input type="text" name="password" required minlength="6" autocomplete="off">
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cancel-modal">Отмена</button>
        <button type="submit" class="btn-primary">Сохранить пароль</button>
      </div>
    </form>`, async (form) => {
    const pwd = new FormData(form).get('password');
    await api('PUT', `/api/users/${u.id}/password`, { password: pwd });
    closeModal();
    showToast(`Пароль для «${u.name}» изменён`, 'ok');
  });
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  location.reload();
});

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
}

// ---------- Загрузка данных ----------

async function loadAll() {
  const [clientsRes, tasksRes, usersRes, statsRes, supMeetingsRes] = await Promise.all([
    api('GET', '/api/clients'),
    api('GET', '/api/tasks'),
    api('GET', '/api/users'),
    api('GET', '/api/stats'),
    api('GET', '/api/supervisor-meetings')
  ]);
  state.clients = clientsRes.clients;
  state.tasks = tasksRes.tasks;
  state.stages = tasksRes.stages;
  state.saleTags = tasksRes.saleTags || [];
  state.waitlistStages = tasksRes.waitlistStages || [];
  state.waitlistTags = tasksRes.waitlistTags || state.waitlistTags;
  state.users = usersRes.users;
  state.stats = statsRes;
  state.supervisorMeetings = supMeetingsRes.meetings || [];
  // Фаза 43: отметка «WhatsApp синхронизирован» по клиентам (clientId → { count, lastAt }).
  try { state.waSummary = (await api('GET', '/api/whatsapp/summary')).clients || {}; } catch (e) { state.waSummary = {}; }
  updateNavBadges();
}

function updateNavBadges() {
  const tasksBadge = document.getElementById('badge-tasks');
  const clientsBadge = document.getElementById('badge-clients');
  const s = state.stats;
  if (tasksBadge) {
    const n = s ? s.overdueTasksCount : 0;
    tasksBadge.textContent = n || '';
    tasksBadge.style.display = n ? 'inline-flex' : 'none';
  }
  if (clientsBadge) {
    const n = s && isStaff() ? (s.pendingApprovalCount || 0) + (s.pendingClosureCount || 0) : 0;
    clientsBadge.textContent = n || '';
    clientsBadge.style.display = n ? 'inline-flex' : 'none';
  }
}

async function boot() {
  try {
    const me = await api('GET', '/api/me');
    if (me.user && me.user.role === 'client') { location.href = '/cabinet.html'; return; } // Kav&Kev: кабинет клиента
    state.user = me.user;
    state.stages = me.stages;
    state.saleTags = me.saleTags || [];
    state.waitlistStages = me.waitlistStages || [];
    state.waitlistTags = me.waitlistTags || [];
    state.paymentMethods = me.paymentMethods;
    state.contractStatuses = me.contractStatuses;
    state.pointTypes = me.pointTypes || [];
    state.taskTags = me.taskTags || [];
    // Правка 01.09.2026: реальная текущая дата (для шапки) + признак того, что
    // данные о продажах/акциях за текущий месяц ещё не загружены (сервер сам
    // решает это по факту календаря, см. withFreshCurrentMonth в src/api.js).
    state.serverDate = me.serverDate ? new Date(me.serverDate) : new Date();
    state.salesMonths = me.salesMonths || [];
    state.latestSalesMonth = me.latestSalesMonth || '';
    state.currentMonthDataFresh = me.currentMonthDataFresh !== false;
    state.stockAsOf = me.stockAsOf || '';
  } catch (e) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
    return;
  }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-name').textContent = `${state.user.name} (${roleLabel(state.user.role)})`;
  // Правка 01.09.2026: видимая текущая дата в шапке — чтобы было явно понятно,
  // на какой момент считаются "текущий месяц"/"на сегодня" показатели.
  const todayEl = document.getElementById('today-date');
  if (todayEl) todayEl.textContent = 'Сегодня: ' + new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('team-tab').style.display = isAdmin() ? '' : 'none';
  document.getElementById('myday-tab').style.display = state.user.role === 'agent' ? '' : 'none';
  document.getElementById('reports-tab').style.display = isStaff() ? '' : 'none';
  document.getElementById('tracker-tab').style.display = isStaff() ? '' : 'none';
  document.getElementById('dynamics-tab').style.display = isStaff() ? '' : 'none';
  document.getElementById('abc-tab').style.display = 'none'; // Kav&Kev: раздел ABC/остатки косметики отключён
  document.getElementById('activity-tab').style.display = isStaff() ? '' : 'none';
  await loadAll();
  render();
  setupNotifications();
  primeGeolocation();
  startGeoPings();
  logActivity();
}

// 26.10.2026: отметка открытия CRM (сеанс агента) + где был. Координаты необязательны.
let lastActivityAt = 0;
function logActivity() {
  if (!state.user || state.user.role !== 'agent') return;
  if (Date.now() - lastActivityAt < 2 * 60 * 1000) return;
  lastActivityAt = Date.now();
  const send = (lat, lng, acc) => { api('POST', '/api/activity', { lat, lng, accuracy: acc }).catch(() => {}); };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => send(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      () => send(), { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 }
    );
  } else send();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') logActivity(); });

// ---------- Рендер по вкладкам ----------

function render() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  if (state.view !== 'whatsapp') stopWaPolling();
  if (state.view !== 'tracker') stopTrackerTimer();
  if (state.view === 'dashboard') return renderDashboard(content);
  if (state.view === 'clients') return renderClients(content);
  if (state.view === 'tasks') return renderTasks(content);
  if (state.view === 'brands') return renderBrands(content);
  if (state.view === 'calendar') return renderCalendar(content);
  if (state.view === 'myday') return renderMyDay(content);
  if (state.view === 'reports') return renderReports(content);
  if (state.view === 'team') return renderTeam(content);
  if (state.view === 'whatsapp') return renderWhatsapp(content);
  if (state.view === 'tracker') return renderTracker(content);
  if (state.view === 'dynamics') return renderDynamics(content);
  if (state.view === 'abc') return renderAbc(content);
  if (state.view === 'activity') return renderActivity(content);
  if (state.view.startsWith('van') && typeof renderVan === 'function') return renderVan(state.view, content);
}

// ---------- 26.10.2026: «Активность» — открытия CRM агентами (сеансы + карта) ----------
let activityState = null;
function renderActivity(content) {
  if (!isStaff()) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  if (!activityState) activityState = { from: today, to: today, agentId: '', showClients: false };
  const agents = state.users.filter((u) => u.role === 'agent');
  content.appendChild(el(`<div>
    <div class="toolbar"><h2 style="margin:0">Активность: открытия CRM</h2></div>
    <p class="muted" style="margin-top:0">Когда агент открывал сайт CRM в браузере. Сеанс — работа подряд; перерыв больше 30 минут считается новым открытием. «Где открыл» — место агента в начале сеанса, если он дал доступ к геолокации (значок 📍). Время в сети — приблизительно, по активности внутри сеанса.</p>
    <div class="filter-bar">
      <label class="muted" style="margin:0">с <input type="date" id="ac-from" value="${activityState.from}"></label>
      <label class="muted" style="margin:0">по <input type="date" id="ac-to" value="${activityState.to}"></label>
      <button type="button" class="link-btn ac-q" data-q="today">сегодня</button>
      <button type="button" class="link-btn ac-q" data-q="week">7 дней</button>
      <button type="button" class="link-btn ac-q" data-q="month">этот месяц</button>
      <select id="ac-agent"><option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}" ${String(activityState.agentId) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
      <label class="filter-check" title="Показать точки клиентов на карте — видно, рядом с какими клиентами агент открывал CRM"><input type="checkbox" id="ac-clients" ${activityState.showClients ? 'checked' : ''}> точки клиентов</label>
    </div>
    <div id="ac-map" style="height:46vh;min-height:300px;border-radius:10px;overflow:hidden;background:#1d1828;margin:8px 0"></div>
    <div class="muted" style="font-size:12px">📍 — где агент открыл CRM (начало сеанса). <span style="color:#8c829f">●</span> — точки клиентов (галочка выше). Нажмите на метку — время, день недели и длительность.</div>
    <div id="ac-box" class="muted" style="margin-top:10px">Загрузка…</div>
  </div>`));
  let map = null, layer = null, L = null, data = null;
  async function ensureMap() {
    if (map) return true;
    try { L = await loadLeaflet(); } catch (e) { const b = document.getElementById('ac-map'); if (b) b.innerHTML = `<p class="error" style="padding:12px">${escapeHtml(e.message)}</p>`; return false; }
    const box = document.getElementById('ac-map'); if (!box) return false;
    map = L.map(box);
    L.tileLayer('https://tile2.maps.2gis.com/tiles?x={x}&y={y}&z={z}', { maxZoom: 18, attribution: '© 2ГИС' }).addTo(map);
    layer = L.layerGroup().addTo(map); map.setView([42.8746, 74.5698], 12);
    return true;
  }
  function drawMap() {
    if (!map || !data) return;
    layer.clearLayers(); const bounds = [];
    if (activityState.showClients) {
      const shownAgents = new Set(data.rows.map((r) => r.agentId));
      state.clients.filter((c) => !c.closed && c.geo && (!activityState.agentId ? shownAgents.has(c.ownerId) : c.ownerId === Number(activityState.agentId))).forEach((c) => {
        L.circleMarker([c.geo.lat, c.geo.lng], { radius: 4, color: '#1d1828', weight: 1, fillColor: '#8c829f', fillOpacity: 0.85 })
          .addTo(layer).bindTooltip(`${escapeHtml(c.name)}${c.visitDay ? ' · ' + escapeHtml(c.visitDay.toLowerCase()) : ''} · ${escapeHtml(userName(c.ownerId))}`);
      });
    }
    data.rows.forEach((a) => {
      const color = TRACK_COLORS[(state.users.filter((u) => u.role === 'agent').findIndex((u) => u.id === a.agentId) + 6) % 6];
      a.sessions.filter((s) => s.lat != null).forEach((s) => {
        L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'tr-pin', html: `<div class="tr-pin-in" style="background:${color}">📍 ${escapeHtml(a.agentName)}</div>`, iconSize: null }) })
          .addTo(layer).bindPopup(`<div class="tr-pop"><strong>${escapeHtml(a.agentName)}</strong><div class="muted">Открыл CRM ${escapeHtml(acT(s.start))} (${escapeHtml(wdOf(s.start))})${s.durationMin ? ` · в сети ~${s.durationMin} мин` : ''}${s.acc ? `<br>точность ±${s.acc} м` : ''}</div></div>`, { className: 'tr-popup' });
        bounds.push([s.lat, s.lng]);
      });
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }
  const WDF = { 0: 'воскресенье', 1: 'понедельник', 2: 'вторник', 3: 'среда', 4: 'четверг', 5: 'пятница', 6: 'суббота' };
  const wdOf = (sec) => WDF[new Date((sec + 6 * 3600) * 1000).getUTCDay()];
  const acT = (sec) => new Date(sec * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' });
  const acHM = (sec) => new Date(sec * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' });
  const dur = (m) => m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
  async function load() {
    const qs = new URLSearchParams({ from: activityState.from, to: activityState.to });
    if (activityState.agentId) qs.set('agentId', activityState.agentId);
    const box = document.getElementById('ac-box');
    try { data = await api('GET', '/api/activity/report?' + qs); } catch (e) { box.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`; return; }
    box.classList.remove('muted');
    box.innerHTML = `
      <div class="table-wrap"><table class="mini-table"><thead><tr><th>Агент</th><th>Открытий</th><th>Дней активен</th><th>В сети всего</th><th>Первое</th><th>Последнее</th></tr></thead><tbody>
        ${data.rows.map((a) => `<tr><td><button type="button" class="link-btn ac-expand" data-id="${a.agentId}">${escapeHtml(a.agentName)}</button></td><td>${a.sessionsCount}</td><td>${a.daysActive}</td><td>${a.totalMin ? dur(a.totalMin) : '—'}</td><td>${a.firstAt ? acT(a.firstAt) : '—'}</td><td>${a.lastAt ? acT(a.lastAt) : '—'}</td></tr>
        <tr class="ac-detail" data-for="${a.agentId}" style="display:none"><td colspan="6">${a.sessions.length ? `<table class="mini-table" style="margin:0"><thead><tr><th>Дата</th><th>День недели</th><th>Открыл</th><th>Активен до</th><th>Длительность</th><th>Где</th></tr></thead><tbody>${a.sessions.slice().reverse().map((s) => `<tr><td>${s.date.split('-').reverse().join('.')}</td><td>${escapeHtml(wdOf(s.start))}</td><td>${acHM(s.start)}</td><td>${acHM(s.end)}</td><td>${dur(s.durationMin)}</td><td>${s.lat != null ? `<button type="button" class="link-btn ac-goto" data-lat="${s.lat}" data-lng="${s.lng}">📍 на карте</button>` : '<span class="muted">без GPS</span>'}</td></tr>`).join('')}</tbody></table>` : '<span class="muted">Открытий за период нет</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Открытий за период нет</td></tr>'}
      </tbody></table></div>`;
    box.querySelectorAll('.ac-expand').forEach((b) => b.addEventListener('click', () => { const r = box.querySelector(`.ac-detail[data-for="${b.dataset.id}"]`); if (r) r.style.display = r.style.display === 'none' ? '' : 'none'; }));
    box.querySelectorAll('.ac-goto').forEach((b) => b.addEventListener('click', () => { if (map) { map.setView([Number(b.dataset.lat), Number(b.dataset.lng)], 16); document.getElementById('ac-map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } }));
    if (await ensureMap()) setTimeout(() => { map.invalidateSize(); drawMap(); }, 30);
  }
  const setR = (f, t) => { activityState.from = f; activityState.to = t; document.getElementById('ac-from').value = f; document.getElementById('ac-to').value = t; load(); };
  document.getElementById('ac-from').addEventListener('change', (e) => { activityState.from = e.target.value; load(); });
  document.getElementById('ac-to').addEventListener('change', (e) => { activityState.to = e.target.value; load(); });
  document.getElementById('ac-agent').addEventListener('change', (e) => { activityState.agentId = e.target.value; load(); });
  document.getElementById('ac-clients').addEventListener('change', (e) => { activityState.showClients = e.target.checked; drawMap(); });
  document.querySelectorAll('.ac-q').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.q === 'today') setR(today, today);
    else if (b.dataset.q === 'week') { const d = new Date(Date.now() + 6 * 3600 * 1000 - 6 * 864e5).toISOString().slice(0, 10); setR(d, today); }
    else setR(today.slice(0, 8) + '01', today);
  }));
  load();
}

// ---------- 26.10.2026: «ABC и остатки» — out-of-stock, упущенная выручка, ABC ----------
let abcState = null;
function renderAbc(content) {
  if (!isStaff()) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  if (!abcState) abcState = { from: '', to: '', partial: false, agentId: '', months: null, abcAgent: '', brand: '', cls: '', status: '' };
  const agents = state.users.filter((u) => u.role === 'agent');
  const agOpts = (sel) => `<option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}" ${String(sel) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}`;
  content.appendChild(el(`<div>
    <div class="toolbar"><h2 style="margin:0">ABC и остатки</h2></div>
    <div class="panel">
      <h2>Загрузка остатков и прайса</h2>
      <div class="chart-desc">Раз в неделю (в понедельник) — отчёт 1С «Остатки товаров в днях на ДД.ММ.ГГ» с продажами за прошедшую неделю (пн–пн). Прайс-лист — после переоценки. Только формат <b>.xlsx</b> (в 1С: «Лист Excel 2007», или откройте .xls в Excel и сохраните как .xlsx). Можно выбрать несколько файлов сразу.</div>
      <div class="filter-bar"><input type="file" id="abc-file" accept=".xlsx" multiple><button type="button" class="btn-primary" id="abc-upload">⬆ Загрузить</button><span class="muted" id="abc-snaps" style="font-size:12px"></span></div>
      <div id="abc-upload-res"></div>
    </div>
    <div class="panel">
      <h2>Упущенная выручка (out-of-stock)</h2>
      <div class="chart-desc">Неделя без товара — на дату отчёта остаток 0 (или товара нет в отчёте). Упущено = обычные продажи за неделю (медиана «Продано» в недели, когда товар был, всплески не влияют) − продано × цена прайса. Частичная потеря — на начало недели товара было меньше обычных продаж, поступления не было и имевшееся раскупили (включается галочкой). По агентам — по медиане их месячных продаж товара.</div>
      <div class="filter-bar">
        <label class="muted" style="margin:0">с <input type="date" id="oos-from"></label>
        <label class="muted" style="margin:0">по <input type="date" id="oos-to"></label>
        <button type="button" class="link-btn oos-q" data-q="week">последняя неделя</button>
        <button type="button" class="link-btn oos-q" data-q="month">этот месяц</button>
        <button type="button" class="link-btn oos-q" data-q="prev">прошлый месяц</button>
        <button type="button" class="link-btn oos-q" data-q="all">весь период</button>
        <select id="oos-agent">${agOpts(abcState.agentId)}</select>
        <label class="filter-check" title="Отдельно считать недели, когда товара было меньше обычных продаж"><input type="checkbox" id="oos-partial" ${abcState.partial ? 'checked' : ''}> частичная потеря</label>
      </div>
      <div id="oos-box" class="muted">Загрузка…</div>
    </div>
    <div class="panel">
      <h2>ABC-анализ ассортимента</h2>
      <div class="chart-desc">По закрытым месяцам продаж (карточки клиентов): A — товары, дающие первые 80% выручки (маржи), B — следующие 15%, C — последние 5%. Две буквы: выручка / маржа. «Сейчас» — по последнему отчёту остатков: нет в наличии / заканчивается (меньше недели обычных продаж).</div>
      <div class="filter-bar"><span id="abc-months"></span><select id="abc-agent">${agOpts(abcState.abcAgent)}</select><select id="abc-brand"><option value="">Все линейки</option>${['Классика', 'Мясные', 'Премиум'].map((b) => `<option ${abcState.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div id="abc-box" class="muted">Загрузка…</div>
    </div>
  </div>`));
  const ym = (d) => d.slice(0, 7);
  let snapsInfo = [];
  const setRange = (f, t) => { abcState.from = f; abcState.to = t; document.getElementById('oos-from').value = f; document.getElementById('oos-to').value = t; loadOos(); };
  async function loadOos() {
    const qs = new URLSearchParams({ from: abcState.from, to: abcState.to, partial: abcState.partial ? '1' : '0' });
    if (abcState.agentId) qs.set('agentId', abcState.agentId);
    const box = document.getElementById('oos-box');
    let d; try { d = await api('GET', '/api/abc/oos?' + qs); } catch (e) { box.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`; return; }
    snapsInfo = d.snapshots;
    const sn = document.getElementById('abc-snaps');
    if (sn) sn.textContent = d.snapshots.length ? `Загружено отчётов остатков: ${d.snapshots.length} (с ${d.snapshots[0].periodFrom.split('-').reverse().join('.')} по ${d.snapshots[d.snapshots.length - 1].date.split('-').reverse().join('.')})` : 'Отчётов остатков ещё нет';
    if (!abcState.from && d.snapshots.length) { abcState.from = d.snapshots[0].periodFrom; abcState.to = d.snapshots[d.snapshots.length - 1].date; document.getElementById('oos-from').value = abcState.from; document.getElementById('oos-to').value = abcState.to; }
    box.classList.remove('muted');
    const dt = (x) => x.split('-').reverse().join('.').slice(0, 5);
    const total = d.totalFull + (d.partial ? d.totalPartial : 0);
    const max = Math.max(1, ...d.weeks.map((w) => w.full + (d.partial ? w.partial : 0)));
    const bars = d.weeks.map((w) => { const tot = w.full + (d.partial ? w.partial : 0); const h1 = Math.round(w.full / max * 120); const h2 = d.partial ? Math.round(w.partial / max * 120) : 0; return `<div class="oos-col" title="${escapeAttr(`Неделя ${dt(w.periodFrom)}–${dt(w.periodTo)}: упущено ${fmtMoney(tot)} (нет в наличии ${fmtMoney(w.full)}, товаров ${w.itemsOos}${d.partial ? `; частично ${fmtMoney(w.partial)}, товаров ${w.itemsPartial}` : ''})`)}"><div class="oos-val">${tot >= 1000 ? Math.round(tot / 1000) + 'т' : tot}</div><div class="oos-stack">${h2 ? `<div style="height:${h2}px;background:var(--c2)"></div>` : ''}<div style="height:${h1}px;background:var(--c4)"></div></div><div class="oos-lbl">${dt(w.periodTo)}</div></div>`; }).join('');
    const st = { oos: '<span class="badge badge-overdue">нет</span>', low: '<span class="badge badge-amber">мало</span>', ok: '<span class="muted">есть</span>' };
    box.innerHTML = `
      <div class="agent-metric-grid" style="margin-bottom:10px">
        <div class="stat-card"><div class="num">${fmtMoney(total)}</div><div class="label">Упущено за период${abcState.agentId ? ' (агент)' : ''}</div></div>
        <div class="stat-card"><div class="num">${fmtMoney(d.totalFull)}</div><div class="label">Нет в наличии (остаток 0)</div></div>
        ${d.partial ? `<div class="stat-card"><div class="num">${fmtMoney(d.totalPartial)}</div><div class="label">Частичная потеря (мало товара)</div></div>` : ''}
        <div class="stat-card"><div class="num">${d.rows.length}</div><div class="label">Товаров с потерями · сейчас нет ${d.rows.filter((r) => r.nowStatus === 'oos').length}</div></div>
      </div>
      <div class="oos-chart">${bars || '<span class="muted">Нет недель в выбранном периоде</span>'}</div>
      <div class="muted" style="font-size:12px;margin:2px 0 10px"><span style="color:var(--c4)">■</span> нет в наличии ${d.partial ? '· <span style="color:var(--c2)">■</span> частичная потеря' : ''} · подпись — дата отчёта (конец недели)</div>
      <h3 style="margin:10px 0 6px">По агентам</h3>
      <div class="table-wrap"><table class="mini-table"><thead><tr><th>Агент</th><th>Упущено</th><th>нет в наличии</th>${d.partial ? '<th>частично</th>' : ''}<th>Товаров</th></tr></thead><tbody>
        ${d.byAgent.map((a) => `<tr><td>${a.agentId ? `<button type="button" class="link-btn oos-ag" data-id="${a.agentId}">${escapeHtml(a.agentName)}</button>` : escapeHtml(a.agentName)}</td><td><b>${fmtMoney(a.full + (d.partial ? a.partial : 0))}</b></td><td>${fmtMoney(a.full)}</td>${d.partial ? `<td>${fmtMoney(a.partial)}</td>` : ''}<td>${a.items}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Потерь нет</td></tr>'}
      </tbody></table></div>
      <div style="margin-top:10px">${repFold('fold-oos', `Товары с потерями <span class="muted">(${d.rows.length})</span>`, `<div class="table-wrap"><table class="mini-table"><thead><tr><th>Товар</th><th>Группа</th><th>Недель без товара</th>${d.partial ? '<th>Недель мало</th>' : ''}<th>Обычно в неделю</th><th>Цена</th><th>Упущено</th><th>Сейчас</th><th>Агенты (доля)</th></tr></thead><tbody>
        ${d.rows.map((r) => `<tr><td style="max-width:340px;white-space:normal">${escapeHtml(r.name)}${r.art ? ` <span class="muted">${escapeHtml(r.art)}</span>` : ''}</td><td class="muted" style="font-size:12px">${escapeHtml(r.group || '')}</td><td>${r.oosWeeks || '—'}</td>${d.partial ? `<td>${r.partWeeks || '—'}</td>` : ''}<td>${r.normalWeek}</td><td title="${escapeAttr(r.priceSource)}">${fmtMoney(r.price)}${r.priceSource !== 'прайс' ? '*' : ''}</td><td><b>${fmtMoney(abcState.partial ? r.lost : r.lostFull)}</b></td><td>${st[r.nowStatus] || ''} <span class="muted">${r.stockNow}</span></td><td class="muted" style="font-size:12px;white-space:normal">${r.agents.map((a) => `${escapeHtml(a.agentName)} ${a.share}%`).join(', ') || '—'}</td></tr>`).join('')}
      </tbody></table></div><div class="muted" style="font-size:12px">* нет в прайсе — взята средняя цена продаж.</div>`)}</div>`;
    box.querySelectorAll('.oos-ag').forEach((b) => b.addEventListener('click', () => { abcState.agentId = b.dataset.id; document.getElementById('oos-agent').value = b.dataset.id; loadOos(); }));
  }
  async function loadAbc() {
    const qs = new URLSearchParams();
    if (abcState.months) qs.set('months', abcState.months.join(','));
    if (abcState.abcAgent) qs.set('agentId', abcState.abcAgent);
    if (abcState.brand) qs.set('brand', abcState.brand);
    const box = document.getElementById('abc-box');
    let d; try { d = await api('GET', '/api/abc?' + qs); } catch (e) { box.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`; return; }
    if (!abcState.months) abcState.months = d.months;
    document.getElementById('abc-months').innerHTML = d.allMonths.map((m) => `<button type="button" class="tag-filter-btn abc-m ${abcState.months.includes(m) ? 'active' : ''}" data-m="${m}">${m}</button>`).join('');
    document.querySelectorAll('.abc-m').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.m; abcState.months = abcState.months.includes(m) ? abcState.months.filter((x) => x !== m) : abcState.months.concat(m); if (!abcState.months.length) abcState.months = [m]; loadAbc(); }));
    box.classList.remove('muted');
    const pct = (v) => d.totalRevenue ? Math.round(v / d.totalRevenue * 100) : 0;
    const st = { oos: '<span class="badge badge-overdue">нет</span>', low: '<span class="badge badge-amber">мало</span>', ok: '<span class="muted">есть</span>', nodata: '<span class="muted">?</span>' };
    let rows = d.rows;
    if (abcState.cls) rows = rows.filter((r) => r.abcRev === abcState.cls);
    if (abcState.status) rows = rows.filter((r) => r.nowStatus === abcState.status);
    box.innerHTML = `<div class="agent-metric-grid" style="margin-bottom:10px">
        ${['A', 'B', 'C'].map((c) => { const s2 = d.summary[c]; return `<div class="stat-card abc-card ${abcState.cls === c ? 'active' : ''}" data-c="${c}" style="cursor:pointer" title="Показать только класс ${c}"><div class="num">${c}: ${s2.count}</div><div class="label">${fmtMoney(s2.revenue)} · ${pct(s2.revenue)}% выручки<br>сейчас нет: <b>${s2.oos}</b> · мало: <b>${s2.low}</b></div></div>`; }).join('')}
      </div>
      <div class="filter-bar"><span class="muted" style="font-size:13px">Сейчас на складе:</span>${[['', 'все'], ['oos', 'нет в наличии'], ['low', 'заканчивается']].map(([k, l]) => `<button type="button" class="tag-filter-btn abc-st ${abcState.status === k ? 'active' : ''}" data-s="${k}">${l}</button>`).join('')}${abcState.cls ? `<button type="button" class="link-btn" id="abc-cls-reset">все классы</button>` : ''}<span class="muted" style="font-size:12px">отчёт остатков на ${d.latestStock ? d.latestStock.split('-').reverse().join('.') : '—'}</span></div>
      ${repFold('fold-abc', `Товары <span class="muted">(${rows.length}${rows.length > 400 ? ', показаны первые 400' : ''})</span>`, `<div class="table-wrap"><table class="mini-table"><thead><tr><th>ABC</th><th>Товар</th><th>Бренд</th><th>Выручка</th><th>Маржа</th><th>Шт</th><th>Клиентов</th><th>Остаток</th><th>Хватит, нед.</th><th>Сейчас</th><th>Больше всех продают</th></tr></thead><tbody>
        ${rows.slice(0, 400).map((r) => `<tr><td><b class="abc-${r.abcRev}">${r.abcRev}</b><span class="muted">${r.abcMargin}</span></td><td style="max-width:340px;white-space:normal">${escapeHtml(r.name)}</td><td>${escapeHtml(r.brand)}</td><td>${fmtMoney(r.revenue)}</td><td>${fmtMoney(r.margin)}</td><td>${r.qty}</td><td>${r.clients}</td><td>${r.stockNow == null ? '—' : r.stockNow}</td><td>${r.coverWeeks == null ? '—' : r.coverWeeks}</td><td>${st[r.nowStatus] || ''}</td><td class="muted" style="font-size:12px">${escapeHtml(r.topAgent)}</td></tr>`).join('')}
      </tbody></table></div>`)}`;
    box.querySelectorAll('.abc-card').forEach((c) => c.addEventListener('click', () => { abcState.cls = abcState.cls === c.dataset.c ? '' : c.dataset.c; repFoldOpen['fold-abc'] = true; loadAbc(); }));
    box.querySelectorAll('.abc-st').forEach((b) => b.addEventListener('click', () => { abcState.status = b.dataset.s; repFoldOpen['fold-abc'] = true; loadAbc(); }));
    const rr = document.getElementById('abc-cls-reset'); if (rr) rr.addEventListener('click', () => { abcState.cls = ''; loadAbc(); });
  }
  ['from', 'to'].forEach((k) => document.getElementById('oos-' + k).addEventListener('change', (e) => { abcState[k] = e.target.value; loadOos(); }));
  document.getElementById('oos-agent').addEventListener('change', (e) => { abcState.agentId = e.target.value; loadOos(); });
  document.getElementById('oos-partial').addEventListener('change', (e) => { abcState.partial = e.target.checked; loadOos(); });
  document.querySelectorAll('.oos-q').forEach((b) => b.addEventListener('click', () => {
    const last = snapsInfo.length ? snapsInfo[snapsInfo.length - 1] : null;
    if (b.dataset.q === 'all' && snapsInfo.length) setRange(snapsInfo[0].periodFrom, last.date);
    else if (b.dataset.q === 'week' && last) setRange(last.periodFrom, last.date);
    else if (b.dataset.q === 'month') setRange(ym(today) + '-01', today);
    else if (b.dataset.q === 'prev') { const d0 = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)); const d1 = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0)); setRange(d0.toISOString().slice(0, 10), d1.toISOString().slice(0, 10)); }
  }));
  document.getElementById('abc-agent').addEventListener('change', (e) => { abcState.abcAgent = e.target.value; loadAbc(); });
  document.getElementById('abc-brand').addEventListener('change', (e) => { abcState.brand = e.target.value; loadAbc(); });
  document.getElementById('abc-upload').addEventListener('click', async () => {
    const inp = document.getElementById('abc-file');
    if (!inp.files.length) return alert('Выберите файл(ы) .xlsx');
    const fd = new FormData();
    [...inp.files].forEach((f) => fd.append('file', f, f.name));
    const out = document.getElementById('abc-upload-res');
    out.innerHTML = '<span class="muted">Загружаю…</span>';
    try {
      const r = await fetch('/api/abc/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Ошибка загрузки');
      out.innerHTML = j.results.map((x) => x.error ? `<div class="error">✗ ${escapeHtml(x.file)}: ${escapeHtml(x.error)}</div>` : x.kind === 'stock' ? `<div>✓ ${escapeHtml(x.file)}: остатки на ${x.date.split('-').reverse().join('.')} (продажи ${escapeHtml(x.period)}), товаров ${x.items}${x.replaced ? ' — <b>заменил</b> ранее загруженный отчёт на эту дату' : ''}</div>` : `<div>✓ ${escapeHtml(x.file)}: прайс «${escapeHtml(x.title)}», позиций ${x.items}</div>`).join('') + (j.gaps.length ? `<div class="error">Пропущены недели между отчётами: ${j.gaps.map(escapeHtml).join(', ')} — загрузите отчёты на эти понедельники.</div>` : '');
      inp.value = '';
      abcState.from = ''; loadOos(); loadAbc();
    } catch (e) { out.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`; }
  });
  if (abcState.from) { document.getElementById('oos-from').value = abcState.from; document.getElementById('oos-to').value = abcState.to; }
  loadOos();
  loadAbc();
}

// 26.10.2026: «Динамика по дням» — отдельной вкладкой (была в «Отчётах»).
function renderDynamics(content) {
  if (!isStaff()) return;
  content.appendChild(el(`<div>      <div class="panel">
        <h2>Динамика по дням: продажи, посещения, WhatsApp</h2>
        <div class="chart-desc">Сумма реализации по датам накладных (из срезов агентов), посещения — сколько точек агенты посетили (отметки у точек, «без GPS» не считаются), и активность в WhatsApp — скольким клиентам агенты написали. Красный столбик с ▼ — падение: меньше половины среднего за рабочие дни (Пн–Пт) периода; выходные затенены. Наведите на столбик — цифры дня и изменение к предыдущему рабочему дню.</div>
        <div id="dd-box"></div>
      </div></div>`));
  wireDailyDynamics();
}

// ---------- Ссылки: позвонить / открыть карту ----------

// Ссылка WhatsApp — по номеру телефона (kg-номера, как правило, набраны без
// кода страны в наших данных: "0555..." → +996555... для wa.me).
function waLink(phone) {
  if (!phone) return '';
  let digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '996' + digits.slice(1);
  if (!digits) return '';
  return `<a class="wa-link" target="_blank" rel="noopener" href="https://wa.me/${digits}" onclick="event.stopPropagation()" title="Написать в WhatsApp">🟢</a>`;
}

function telLink(phone, label) {
  if (!phone) return escapeHtml(label !== undefined ? label : '—');
  const digits = phone.replace(/[^\d+]/g, '');
  return `<a class="tel-link" href="tel:${digits}" onclick="event.stopPropagation()">${escapeHtml(label !== undefined ? label : phone)}</a> ${waLink(phone)}`;
}

// 28.09.2026: если у клиента уже есть координаты точки (первая отметка
// посещения, client.geo) — ссылка «Карта» ведёт по координатам, а не по
// поиску адреса в 2ГИС (адрес часто неточный).
function mapsLink(address, geo) {
  if (geo && geo.lat != null && geo.lng != null) {
    return `<a class="maps-link" target="_blank" rel="noopener" href="https://2gis.kg/geo/${geo.lng},${geo.lat}" onclick="event.stopPropagation()" title="По сохранённым координатам точки">📍 Карта ✓</a>`;
  }
  if (!address) return '';
  return `<a class="maps-link" target="_blank" rel="noopener" href="https://2gis.kg/bishkek/search/${encodeURIComponent(address)}" onclick="event.stopPropagation()" title="Поиск по адресу — координат точки ещё нет">📍 Карта</a>`;
}

// Фаза 15, п.12: поле "Соцсети/WhatsApp" переименовано в "Instagram" (WhatsApp
// у клиента и так есть автоматически — иконка рядом с телефоном, см. waLink()
// внутри telLink(), это отдельная фича и её не трогаем). Значение может быть
// голым username, "@username" или уже готовой ссылкой — приводим к рабочей
// ссылке на профиль в любом случае, не заставляя пользователя вводить URL самому.
function instagramLink(value) {
  const raw = (value || '').trim();
  if (!raw) return '';
  let handle = raw.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
  const url = /^https?:\/\//i.test(raw) ? raw : `https://instagram.com/${handle}`;
  return `<a class="maps-link" target="_blank" rel="noopener" href="${escapeAttr(url)}" onclick="event.stopPropagation()">📷 ${escapeHtml(raw)}</a>`;
}

// ---------- Аватар сотрудника ----------

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

function avatarHtml(userId, size) {
  const u = state.users.find((u) => u.id === userId);
  const px = size || 24;
  if (u && u.avatarUrl) {
    return `<img src="${u.avatarUrl}" class="avatar" style="width:${px}px;height:${px}px" title="${escapeHtml(u.name)}">`;
  }
  return `<span class="avatar avatar-fallback" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.4)}px" title="${escapeHtml(u ? u.name : '')}">${escapeHtml(initials(u ? u.name : ''))}</span>`;
}

function agentTag(userId) {
  return `<span class="agent-tag">${avatarHtml(userId, 20)}<span>${escapeHtml(userName(userId))}</span></span>`;
}

// ---------- Дашборд ----------

function renderTopBrandTable(brandLabel, items, colorantsExcluded) {
  if (!items || !items.length) return `<h3 style="margin:12px 0 6px">${escapeHtml(brandLabel)}</h3><div class="muted" style="font-size:13px">Нет продаж по этой линейке в этом месяце.</div>`;
  return `
    <h3 style="margin:12px 0 6px">${escapeHtml(brandLabel)}${colorantsExcluded ? ' <span class="muted" style="font-weight:400;font-size:12px">(без красителей и оксидов)</span>' : ''}</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Товар</th><th>Шт (месяц)</th><th>Выручка</th></tr></thead>
        <tbody>
          ${items.map((p) => `<tr><td>${escapeHtml(p.product)}</td><td>${Math.round(p.qty * 100) / 100}</td><td>${fmtMoney(p.revenue)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Пересчёт значения одной карточки дашборда супервайзера/админа с учётом фильтра
// по агенту — на уже загруженных на клиенте state.clients/state.tasks (эти списки
// для admin/supervisor и так содержат всех клиентов/все задачи, см. scoped() в api.js).
function dashCardValue(key, agentId, paymentMethod) {
  const aid = agentId ? Number(agentId) : null;
  let clientsF = aid ? state.clients.filter((c) => c.ownerId === aid) : state.clients;
  if (paymentMethod) clientsF = clientsF.filter((c) => (c.paymentMethod || '') === paymentMethod);
  const tasksF = aid ? state.tasks.filter((t) => t.assigneeId === aid) : state.tasks;
  const today = new Date().toISOString().slice(0, 10);
  switch (key) {
    case 'clientsCount': return String(clientsF.length);
    case 'todayTasksCount': return String(tasksF.filter((t) => isTaskActiveClient(t) && t.dueDate === today).length);
    case 'overdueTasksCount': return String(tasksF.filter(isTaskOverdue).length);
    case 'atRiskClientsCount': return String(clientsF.filter((c) => riskCount(c) > 0).length);
    case 'totalDebt': return fmtMoney(clientsF.reduce((s, c) => s + (c.debtAmount || 0), 0));
    default: return '';
  }
}
function agentFilterSelectHTML(cardKey) {
  const agents = state.users.filter((u) => u.role === 'agent');
  return `
    <select class="card-agent-filter" data-card="${cardKey}" onclick="event.stopPropagation()">
      <option value="">Все агенты</option>
      ${agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
    </select>`;
}
function paymentMethodFilterSelectHTML(cardKey) {
  return `
    <select class="card-payment-filter" data-card="${cardKey}" onclick="event.stopPropagation()">
      <option value="">Все формы оплаты</option>
      ${state.paymentMethods.map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join('')}
    </select>`;
}
function wireCardAgentFilters(root) {
  function recompute(card) {
    // Некоторые select с классом .card-agent-filter (например #perf-agent-filter
    // в панели «Выполнение плана») находятся не внутри .stat-card, а у них своя
    // отдельная логика/обработчик (см. renderPerf) — тут для них просто нечего
    // пересчитывать, card будет null.
    if (!card) return;
    const agentSel = card.querySelector('.card-agent-filter');
    const paySel = card.querySelector('.card-payment-filter');
    const numEl = card.querySelector('.num');
    const key = (agentSel || paySel).dataset.card;
    if (numEl) numEl.textContent = dashCardValue(key, agentSel ? agentSel.value : '', paySel ? paySel.value : '');
  }
  root.querySelectorAll('.card-agent-filter, .card-payment-filter').forEach((sel) => {
    sel.addEventListener('change', () => recompute(sel.closest('.stat-card')));
  });
}

async function renderDashboard(content) {
  const stats = await api('GET', '/api/stats');
  content.appendChild(el(`
    <div>
      ${!state.currentMonthDataFresh ? `
      <div class="notice notice-warn" style="margin-bottom:14px">
        Нет новых данных о продажах за текущий месяц — последний присланный реестр за
        <b>${escapeHtml(capitalize(state.latestSalesMonth))}</b>. Показатели «текущий месяц» ниже (продано,
        выполнение плана) показывают 0 — это ожидаемо, а не ошибка. Они обновятся, как только
        придёт новая выгрузка продаж за текущий месяц.
      </div>` : ''}
      <div class="stat-grid">
        <div class="stat-card"><div class="num">${stats.clientsCount}</div><div class="label">Клиентов</div>${isStaff() ? agentFilterSelectHTML('clientsCount') : ''}</div>
        <div class="stat-card"><div class="num">${stats.todayTasksCount}</div><div class="label">Задач на сегодня</div>${isStaff() ? agentFilterSelectHTML('todayTasksCount') : ''}</div>
        <div class="stat-card"><div class="num">${stats.overdueTasksCount}</div><div class="label">Просроченных задач</div>${isStaff() ? agentFilterSelectHTML('overdueTasksCount') : ''}</div>
        <div class="stat-card stat-card-alert"><div class="num">${stats.atRiskClientsCount}</div><div class="label">Клиентов «недопродано»</div>${isStaff() ? agentFilterSelectHTML('atRiskClientsCount') : ''}</div>
        <div class="stat-card"><div class="num">${fmtMoney(stats.totalDebt)}</div><div class="label">Общий долг</div>${isStaff() ? agentFilterSelectHTML('totalDebt') + paymentMethodFilterSelectHTML('totalDebt') : ''}</div>
        ${isStaff() && stats.teamTotals ? `<div class="stat-card"><div class="num">${stats.teamTotals.totalTasks}</div><div class="label">Всего задач по команде (в работе: ${stats.teamTotals.open})</div></div>` : ''}
        ${isStaff() ? `<div class="stat-card"><div class="num">${stats.pendingApprovalCount}</div><div class="label">Новых точек на согласовании</div></div>` : ''}
        ${isStaff() && stats.pendingClosureCount ? `<div class="stat-card"><div class="num">${stats.pendingClosureCount}</div><div class="label">Заявок на закрытие точки</div></div>` : ''}
        ${isStaff() && stats.newMastersCount ? `<div class="stat-card"><div class="num">${stats.newMastersCount}</div><div class="label">Новых мастеров (не просмотрено)</div></div>` : ''}
      </div>

      ${stats.byAgent ? `
      <div class="panel">
        <h2>План vs факт по агентам <span class="muted" style="font-weight:400;font-size:12px">· текущий месяц</span></h2>
        <div class="chart-desc">План — общая цифра на агента в месяц (задаётся на странице «Команда»). Факт — продано с начала месяца на сегодня.</div>
        ${stats.byAgent.map((a, i) => `
          <div class="bar-row">
            <div class="bar-top"><span class="bar-name">${agentTag(a.agentId)}</span><span class="bar-pct">${a.monthlyPlan ? a.planPct + '% плана' : 'план не задан'}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${a.monthlyPlan ? Math.min(100, a.planPct) : 0}%;background:var(--c${(i % 6) + 1})"></div></div>
            <div class="bar-foot"><span>факт ${fmtMoney(a.actualThisMonth)}</span><span>${a.monthlyPlan ? 'план ' + fmtMoney(a.monthlyPlan) : ''}</span></div>
          </div>
        `).join('')}
        ${stats.byAgent.every((a) => !a.monthlyPlan) ? '<div class="muted" style="font-size:12px;margin-top:10px">План ни у одного агента ещё не задан — заполните на странице «Команда», тогда появится % выполнения.</div>' : ''}
      </div>` : ''}

      ${stats.criticalDebts && stats.criticalDebts.length ? `
      <div class="panel">
        <h2>Критичные долги <span class="muted" style="font-weight:400;font-size:12px">· &gt;3 000 сом и &gt;7 дней</span></h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Клиент</th><th>Ответственный</th><th>Долг</th><th>Дней</th></tr></thead>
            <tbody>
              ${stats.criticalDebts.map((d) => `
                <tr>
                  <td>${escapeHtml(d.clientName)}<br><span class="critical-pill">критично</span></td>
                  <td>${agentTag(d.ownerId)}</td>
                  <td>${fmtMoney(d.debtAmount)}</td>
                  <td>${d.daysOverdue == null ? '—' : d.daysOverdue}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      ${stats.agentDashboard ? `
      <div class="panel">
        <h2>Мои показатели</h2>
        <div class="agent-metric-grid">
          <div class="stat-card"><div class="num">${fmtMoney(stats.agentDashboard.salesTotalThisMonth)}</div><div class="label">Продано в этом месяце</div></div>
          <div class="stat-card"><div class="num">${stats.agentDashboard.clientsBoughtThisMonth}/${stats.agentDashboard.clientsNotBoughtThisMonth}</div><div class="label">Купили / не купили в этом месяце</div></div>
          <div class="stat-card" title="Сумма планов из карточек ваших клиентов (без закрытых точек)"><div class="num">${fmtMoney(stats.agentDashboard.clientsPlanTotal || 0)}</div><div class="label">Общий план по клиентам${stats.agentDashboard.clientsPlanTotal ? ` · остаток ${fmtMoney(Math.max(0, stats.agentDashboard.clientsPlanTotal - (stats.agentDashboard.clientsPlanFact || 0)))}` : ''}</div></div>
          <div class="stat-card"><div class="num">${stats.agentDashboard.salesDoneToday}/${stats.agentDashboard.salesToday}</div><div class="label">Задачи «Продажа» сегодня: закрыто / всего</div></div>
          <div class="stat-card"><div class="num">${stats.agentDashboard.doneTasksToday}</div><div class="label">Выполнено сегодня</div></div>
          <div class="stat-card"><div class="num">${stats.agentDashboard.overdueTasksCount}</div><div class="label">Просрочено</div></div>
          <div class="stat-card" id="sales-all-months-card" title="По умолчанию — сумма за все 7 месяцев; фильтр ниже сужает до выбранных">
            <div class="num" id="sales-all-months-num">${fmtMoney(stats.agentDashboard.salesTotalAllMonths)}</div>
            <div class="label" id="sales-all-months-label">Продано всего (7 мес.) <button type="button" class="link-btn" id="sales-by-client-toggle" style="font-size:12px">по клиентам ▾</button></div>
          </div>
        </div>
        <div class="assort-brand-filter" id="sales-all-months-bar" style="margin:8px 0">
          <button type="button" class="brand-chip ${!state.salesAllMonthsSelected.size ? 'active' : ''}" data-month="all">Все месяцы (7 мес)</button>
          ${(state.salesMonths || []).map((m) => `<button type="button" class="brand-chip ${state.salesAllMonthsSelected.has(m) ? 'active' : ''}" data-month="${escapeAttr(m)}">${escapeHtml(capitalize(m))}</button>`).join('')}
        </div>
        <div id="sales-by-client-panel" class="assort-panel" style="display:none">
          <div class="muted" style="font-size:12px;margin-bottom:6px" id="sales-by-client-hint">Формат: клиент / сумма за 7 месяцев.</div>
          <div style="max-height:260px;overflow:auto" id="sales-by-client-list">
            ${stats.agentDashboard.salesByClientAllMonths.map((r) => `<div>${escapeHtml(r.clientName)} / ${fmtMoney(r.revenue)}</div>`).join('')}
          </div>
        </div>
        <button type="button" class="assort-btn" id="top-brands-toggle">🏆 Топ-10 по линейкам (текущий месяц)</button>
        <div class="assort-panel" id="top-brands-panel" style="display:none">
          ${renderTopBrandTable('Премиум', stats.agentDashboard.topByBrand.Премиум, true)}
          ${renderTopBrandTable('Мясные', stats.agentDashboard.topByBrand.Мясные, true)}
          ${renderTopBrandTable('Классика', stats.agentDashboard.topByBrand.Классика, false)}
        </div>
      </div>` : ''}

      ${stats.teamTasksToday ? `
      <div class="panel">
        <h2>Задачи на день по команде</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Агент</th><th>Задач сегодня</th><th>Выполнено</th><th>Не выполнено</th></tr></thead>
            <tbody>
              ${stats.teamTasksToday.map((a) => `
                <tr>
                  <td>${agentTag(a.agentId)}</td>
                  <td>${a.total}</td>
                  <td>${a.done}</td>
                  <td>${a.notDone ? `<span class="badge badge-overdue">${a.notDone}</span>` : '0'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <div class="panel">
        <h2>Клиенты на сегодня</h2>
        <div class="mini-card-grid" id="today-kanban"></div>
      </div>

      <div class="panel">
        <h2>Клиенты на сегодня с задолженностью</h2>
        ${stats.todayClientsWithDebt.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Клиент</th><th>Ответственный</th><th>Долг</th></tr></thead>
            <tbody>
              ${stats.todayClientsWithDebt.map((c) => `
                <tr>
                  <td>${escapeHtml(c.name)}</td>
                  <td>${agentTag(c.ownerId)}</td>
                  <td><span class="badge ${c.debtOverdue ? 'badge-overdue' : 'badge-pay'}">${fmtMoney(c.debtAmount)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : '<div class="empty-state">Сегодня нет визитов к клиентам с долгом.</div>'}
      </div>

      <div class="panel">
        <h2>Просроченные задачи</h2>
        ${stats.overdueTasks.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Задача</th><th>Клиент</th><th>Ответственный</th><th>Срок</th><th>Этап</th></tr></thead>
            <tbody>
              ${stats.overdueTasks.map((t) => `
                <tr>
                  <td>${escapeHtml(t.title)}</td>
                  <td>${escapeHtml(clientById(t.clientId) ? clientById(t.clientId).name : '—')}</td>
                  <td>${agentTag(t.assigneeId)}</td>
                  <td>${fmtDate(t.dueDate)}</td>
                  <td>${escapeHtml(stageLabel(t.stage))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : '<div class="empty-state">Просроченных задач нет.</div>'}
      </div>

      ${stats.byAgent ? `
      <div class="panel">
        <h2>Долг по агентам</h2>
        <div class="chart-desc">Сумма долга клиентов, закреплённых за агентом (ownerId в CRM).</div>
        ${(() => {
          const sorted = stats.byAgent.slice().sort((a, b) => b.totalDebt - a.totalDebt);
          const max = Math.max(1, ...sorted.map((a) => a.totalDebt));
          return sorted.map((a) => {
            const i = stats.byAgent.indexOf(a);
            return `
            <div class="hbar-grid">
              <div class="hbar-name">${escapeHtml(userName(a.agentId))}</div>
              <div class="hbar-track"><div class="hbar-fill" style="width:${Math.round((a.totalDebt / max) * 100)}%;background:var(--c${(i % 6) + 1})"></div></div>
              <div class="hbar-val">${fmtMoney(a.totalDebt)}</div>
            </div>`;
          }).join('');
        })()}
      </div>

      <div class="panel">
        <h2>Выполнение задач по агентам</h2>
        <div class="chart-desc">Доля задач, закрытых как «выполнена», от закрытых задач (выполнена + не выполнена).</div>
        ${stats.byAgent.map((a, i) => `
          <div class="bar-row">
            <div class="bar-top"><span class="bar-name">${escapeHtml(userName(a.agentId))}</span><span class="bar-pct">${a.completionRate === null ? '—' : a.done + ' из ' + (a.done + a.notDone)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${a.completionRate || 0}%;background:${a.completionRate === null ? 'var(--muted)' : a.completionRate >= 70 ? 'var(--success)' : a.completionRate >= 40 ? 'var(--warning)' : 'var(--danger)'}"></div></div>
          </div>
        `).join('')}
        ${stats.byAgent.some((a) => a.overdueCount) ? `<div class="chart-desc" style="margin:12px 0 0">Просрочено сейчас: ${stats.byAgent.filter((a) => a.overdueCount).map((a) => `${escapeHtml(userName(a.agentId))} — ${a.overdueCount}`).join(', ')}</div>` : ''}
      </div>

      <div class="panel">
        <h2>Выполнение по агентам</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Агент</th><th>Всего задач</th><th>В работе</th><th>Выполнено</th><th>Не выполнено</th><th>% выполнения</th><th>Долг клиентов</th></tr></thead>
            <tbody>
              ${stats.byAgent.map((a) => `
                <tr>
                  <td>${agentTag(a.agentId)}</td>
                  <td>${a.totalTasks}</td>
                  <td>${a.open}</td>
                  <td>${a.done}</td>
                  <td>${a.notDone}</td>
                  <td>${a.completionRate === null ? '—' : a.completionRate + '%'}</td>
                  <td>${fmtMoney(a.totalDebt)}</td>
                </tr>
              `).join('')}
              <tr>
                <td><strong>Итого по команде</strong></td>
                <td><strong>${stats.teamTotals.totalTasks}</strong></td>
                <td><strong>${stats.teamTotals.open}</strong></td>
                <td><strong>${stats.teamTotals.done}</strong></td>
                <td><strong>${stats.teamTotals.notDone}</strong></td>
                <td>—</td>
                <td><strong>${fmtMoney(stats.byAgent.reduce((s, a) => s + (a.totalDebt || 0), 0))}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>` : ''}

      ${(stats.salesChecks || []).length ? `
      <div class="panel sales-check-panel">
        <h2>Сверка срезов продаж</h2>
        ${stats.salesChecks.map((ch) => `<div class="sales-check-row"><strong>${escapeHtml(ch.agentName)}</strong> (${escapeHtml(ch.period || '')}): сумма продаж ${fmtMoney(ch.total)}, по клиентам ${fmtMoney(ch.distributed)}${ch.unmatched && ch.unmatched.length ? ` · нет карточки: ${ch.unmatched.map((u) => escapeHtml(u.name)).join(', ')}` : ''}</div>`).join('')}
        <div class="muted" style="font-size:12px;margin-top:4px">Факт агента = «Итого» его последнего файла. Разница — суммы среза, которых нет на карточках клиентов (нет карточки или строки не сохранились) — уйдёт со следующим файлом агента.</div>
      </div>` : ''}

      ${stats.salesPerformance ? `
      <div class="panel">
        <h2>Выполнение плана (сом) <select class="card-agent-filter" id="perf-agent-filter"><option value="">Все агенты</option>${state.users.filter((u) => u.role === 'agent').map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></h2>
        <div class="agent-metric-grid" id="perf-stat-cards"></div>
        <div class="table-wrap" style="margin-top:10px">
          <table>
            <thead><tr><th>Бренд</th><th>План</th><th>Факт (текущий месяц)</th><th>%</th></tr></thead>
            <tbody id="perf-brand-tbody"></tbody>
          </table>
        </div>
      </div>` : ''}

      ${stats.noTaskThisWeek ? `
      <div class="panel">
        <h2>Клиенты без задачи на этой неделе <span class="col-sum">· ${stats.noTaskThisWeek.length}</span> <select class="card-agent-filter" id="notask-agent-filter"><option value="">Все агенты</option>${state.users.filter((u) => u.role === 'agent').map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></h2>
        <div id="notask-table-wrap">
        ${stats.noTaskThisWeek.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Клиент</th><th>День визита</th><th>Ответственный</th></tr></thead>
            <tbody>
              ${stats.noTaskThisWeek.slice(0, 30).map((c) => `
                <tr>
                  <td>${escapeHtml(c.name)}</td>
                  <td>${escapeHtml(c.visitDay)}</td>
                  <td>${agentTag(c.ownerId)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${stats.noTaskThisWeek.length > 30 ? `<div class="muted" style="margin-top:6px;font-size:12px">Показаны первые 30 из ${stats.noTaskThisWeek.length}.</div>` : ''}
        ` : '<div class="empty-state">На всех клиентов с днём визита на этой неделе задачи уже созданы.</div>'}
        </div>
      </div>` : ''}

      ${stats.clientRating ? `
      <div class="panel">
        <h2>Рейтинг клиентов (выручка / маржа / активные месяцы) <select class="card-agent-filter" id="rating-agent-filter"><option value="">Все агенты</option>${state.users.filter((u) => u.role === 'agent').map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></h2>
        <div class="assort-brand-filter" id="rating-month-bar" style="margin-bottom:10px">
          <button type="button" class="brand-chip ${!state.ratingSelectedMonths.size ? 'active' : ''}" data-month="all">Все месяцы (7 мес)</button>
          ${(state.salesMonths || []).map((m) => `<button type="button" class="brand-chip ${state.ratingSelectedMonths.has(m) ? 'active' : ''}" data-month="${escapeAttr(m)}">${escapeHtml(capitalize(m))}</button>`).join('')}
        </div>
        <div id="rating-table-wrap">
        ${stats.clientRating.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Клиент</th><th>Агент</th><th>Выручка (7 мес)</th><th>Маржа</th><th>% маржи</th><th>Активных мес.</th></tr></thead>
            <tbody>
              ${stats.clientRating.slice(0, 30).map((r) => `
                <tr>
                  <td>${escapeHtml(r.clientName)}</td>
                  <td>${escapeHtml(r.agentName)}</td>
                  <td>${fmtMoney(r.revenue)}</td>
                  <td>${fmtMoney(r.margin)}</td>
                  <td>${r.marginPct}%</td>
                  <td>${r.activeMonths}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="muted" style="margin-top:6px;font-size:12px">Маржа считается из тех же файлов продаж (себестоимость/стоимость построчно).</div>
        ` : '<div class="empty-state">Пока нет данных о продажах для рейтинга.</div>'}
        </div>
      </div>` : ''}
    </div>
  `));

  if (stats.agentDashboard) {
    wireToggle('top-brands-toggle', 'top-brands-panel');
    wireToggle('sales-by-client-toggle', 'sales-by-client-panel');
  }
  if (isStaff()) wireCardAgentFilters(content);

  // Фаза 15, п.5: фильтр по месяцам для карточки "Продано всего" — та же
  // логика/UI, что и в "Рейтинге клиентов" (computeMonthlyRating выше), но
  // проще (только сумма + разбивка по клиентам, без маржи). При "Все месяцы"
  // (по умолчанию) используем готовую сумму с сервера (regularAssortment +
  // testAssortment за все 7 мес., см. salesTotalAllMonths в src/api.js), при
  // выборе конкретных месяцев считаем из client.monthlyAssortment на клиенте.
  function computeSalesForMonths(months) {
    if (!months.length) {
      return state.clients
        .map((c) => {
          const items = [...(c.regularAssortment || []), ...(c.testAssortment || [])];
          return { clientId: c.id, clientName: c.name, revenue: items.reduce((s, it) => s + (it.revenue || 0), 0) };
        })
        .filter((r) => r.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue);
    }
    return state.clients
      .map((c) => {
        const items = months.flatMap((m) => (c.monthlyAssortment && c.monthlyAssortment[m]) || []);
        return { clientId: c.id, clientName: c.name, revenue: items.reduce((s, it) => s + (it.revenue || 0), 0) };
      })
      .filter((r) => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }
  function renderSalesAllMonthsPanel() {
    const bar = document.getElementById('sales-all-months-bar');
    if (!bar) return;
    const months = Array.from(state.salesAllMonthsSelected);
    const rows = computeSalesForMonths(months);
    const total = rows.reduce((s, r) => s + r.revenue, 0);
    const label = months.length ? months.map((m) => capitalize(m)).join(' + ') : `${(state.salesMonths || []).length || 7} мес.`;
    document.getElementById('sales-all-months-num').textContent = fmtMoney(total);
    document.getElementById('sales-all-months-label').innerHTML = `Продано всего (${label}) <button type="button" class="link-btn" id="sales-by-client-toggle" style="font-size:12px">по клиентам ▾</button>`;
    document.getElementById('sales-by-client-hint').textContent = `Формат: клиент / сумма за ${months.length ? label.toLowerCase() : 'все 7 месяцев'}.`;
    document.getElementById('sales-by-client-list').innerHTML = rows.map((r) => `<div>${escapeHtml(r.clientName)} / ${fmtMoney(r.revenue)}</div>`).join('') || '<div class="muted">Нет продаж за выбранный период.</div>';
    wireToggle('sales-by-client-toggle', 'sales-by-client-panel');
  }
  if (stats.agentDashboard) {
    const salesMonthsBar = document.getElementById('sales-all-months-bar');
    salesMonthsBar.querySelectorAll('.brand-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const m = chip.dataset.month;
        if (m === 'all') state.salesAllMonthsSelected.clear();
        else if (state.salesAllMonthsSelected.has(m)) state.salesAllMonthsSelected.delete(m);
        else state.salesAllMonthsSelected.add(m);
        salesMonthsBar.querySelectorAll('.brand-chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.month === 'all' ? state.salesAllMonthsSelected.size === 0 : state.salesAllMonthsSelected.has(c.dataset.month));
        });
        renderSalesAllMonthsPanel();
      });
    });
  }

  // ---- Правки 31.08.2026: фильтры по агенту, реагирующие на state.clients уже
  // загруженный на клиенте (та же логика, что и dashCardValue/wireCardAgentFilters
  // выше, но для панелей с таблицами, а не одиночных чисел карточки). ----

  function renderPerf() {
    const sel = document.getElementById('perf-agent-filter');
    if (!sel) return;
    const aid = sel.value ? Number(sel.value) : null;
    // Фаза 36: план — сумма agent.monthlyPlan (см. stats.byAgent), а не старый
    // per-client c.salesPlan (то поле так и не используется, всегда 0 — раньше
    // тут поэтому всегда показывался план 0 сом, отсюда и была жалоба на дашборд).
    const planTotal = aid
      ? ((stats.byAgent || []).find((a) => a.agentId === aid) || {}).monthlyPlan || 0
      : (stats.byAgent || []).reduce((s, a) => s + (a.monthlyPlan || 0), 0);
    // Фаза 39: факт = «Итого» последних срезов агентов (stats.byAgent[].actualThisMonth),
    // а не сумма по карточкам клиентов — см. src/agentSales.js.
    const actualTotal = (aid ? (stats.byAgent || []).filter((a) => a.agentId === aid) : (stats.byAgent || []))
      .reduce((s, a) => s + (a.actualThisMonth || 0), 0);
    const pct = planTotal ? Math.round((actualTotal / planTotal) * 100) : null;
    document.getElementById('perf-stat-cards').innerHTML = `
      <div class="stat-card"><div class="num">${fmtMoney(planTotal)}</div><div class="label">План (текущий месяц)</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(actualTotal)}</div><div class="label">Факт (текущий месяц)</div></div>
      <div class="stat-card"><div class="num">${pct === null ? '—' : pct + '%'}</div><div class="label">Выполнение</div></div>
    `;
    // Фаза 37 (21.09.2026): план по брендам — статичные значения из brandPlans
    // на агенте (см. data/import/brand_plans.json / src/import.js), прописаны
    // пользователем и не редактируются из интерфейса. Источник — stats.byAgent
    // (посчитан на сервере в /api/stats), а не state.users: /api/users отдаёт
    // полный набор полей только админу, а супервайзеру — только id/name/role,
    // так что для брендов, как и для monthlyPlan/actualThisMonth выше, нужно
    // брать именно stats.byAgent, иначе у супервайзера план по брендам будет
    // всегда пустым.
    const BRAND_BUCKETS = ['Мясные', 'Премиум', 'Классика'];
    const agentStats = aid
      ? (stats.byAgent || []).filter((a) => a.agentId === aid)
      : (stats.byAgent || []);
    const actualByBucket = { Мясные: 0, Премиум: 0, 'Классика': 0 };
    const planByBucket = { Мясные: 0, Премиум: 0, 'Классика': 0 };
    let hasAnyPlan = false;
    agentStats.forEach((a) => {
      BRAND_BUCKETS.forEach((b) => { actualByBucket[b] += (a.actualByBrand && a.actualByBrand[b]) || 0; });
      if (a.brandPlans) {
        hasAnyPlan = true;
        BRAND_BUCKETS.forEach((b) => { planByBucket[b] += a.brandPlans[b] || 0; });
      }
    });
    document.getElementById('perf-brand-tbody').innerHTML = BRAND_BUCKETS.map((b) => {
      const plan = planByBucket[b];
      const actual = actualByBucket[b];
      const pct = plan ? Math.round((actual / plan) * 100) : null;
      return `<tr><td>${escapeHtml(b)}</td><td>${plan ? fmtMoney(plan) : '—'}</td><td>${fmtMoney(actual)}</td><td>${pct === null ? '—' : pct + '%'}</td></tr>`;
    }).join('') + (!hasAnyPlan ? '<tr><td colspan="4" class="muted">План по линейкам для выбранного агента не задан.</td></tr>' : '');
  }
  if (stats.salesPerformance) {
    renderPerf();
    document.getElementById('perf-agent-filter').addEventListener('change', renderPerf);
  }

  function renderNoTaskFiltered() {
    const sel = document.getElementById('notask-agent-filter');
    if (!sel) return;
    const aid = sel.value ? Number(sel.value) : null;
    const list = aid ? stats.noTaskThisWeek.filter((c) => c.ownerId === aid) : stats.noTaskThisWeek;
    const wrap = document.getElementById('notask-table-wrap');
    wrap.innerHTML = list.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Клиент</th><th>День визита</th><th>Ответственный</th></tr></thead>
          <tbody>
            ${list.slice(0, 30).map((c) => `
              <tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.visitDay)}</td>
                <td>${agentTag(c.ownerId)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${list.length > 30 ? `<div class="muted" style="margin-top:6px;font-size:12px">Показаны первые 30 из ${list.length}.</div>` : ''}
    ` : '<div class="empty-state">На всех клиентов с днём визита на этой неделе задачи уже созданы.</div>';
  }
  if (stats.noTaskThisWeek) {
    document.getElementById('notask-agent-filter').addEventListener('change', renderNoTaskFiltered);
  }

  // Правка 01.09.2026 (п.1 надиктованного списка): фильтр по месяцам в «Рейтинге
  // клиентов». По умолчанию («Все месяцы») — как раньше, берём готовый 7-месячный
  // расчёт с сервера (stats.clientRating). При выборе одного/нескольких месяцев —
  // пересчитываем выручку/маржу на клиенте прямо в браузере из client.monthlyAssortment
  // (те же данные, что уже использует помесячный отчёт в «Отчётах», п.6 Фазы 11) —
  // без похода на сервер, по аналогии с остальными фильтрами на этом дашборде.
  // ВАЖНО: у месяца «август» маржа всегда будет 0 — в присланных 31.08.2026 финальных
  // файлах продаж за август нет себестоимости (см. Фазу 10/11) — это ограничение
  // исходных данных, не ошибка подсчёта.
  function computeMonthlyRating(months) {
    return state.clients.map((c) => {
      const items = months.flatMap((m) => (c.monthlyAssortment && c.monthlyAssortment[m]) || []);
      const revenue = items.reduce((s, it) => s + (it.revenue || 0), 0);
      const margin = items.reduce((s, it) => s + (it.margin || 0), 0);
      const monthsWithSales = months.filter((m) => ((c.monthlyAssortment && c.monthlyAssortment[m]) || []).length > 0).length;
      const owner = state.users.find((u) => u.id === c.ownerId);
      return {
        clientId: c.id, ownerId: c.ownerId, clientName: c.name, agentName: owner ? owner.name : '',
        revenue, margin, marginPct: revenue ? Math.round((margin / revenue) * 100) : 0, activeMonths: monthsWithSales
      };
    }).filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 50);
  }

  function renderRatingFiltered() {
    const sel = document.getElementById('rating-agent-filter');
    if (!sel) return;
    const aid = sel.value ? Number(sel.value) : null;
    const months = Array.from(state.ratingSelectedMonths);
    const useMonths = months.length > 0;
    let list = useMonths ? computeMonthlyRating(months) : stats.clientRating;
    if (aid) {
      list = list.filter((r) => (useMonths ? r.ownerId === aid : (clientById(r.clientId) && clientById(r.clientId).ownerId === aid)));
    }
    const revenueHeader = useMonths ? (months.length === 1 ? `Выручка (${capitalize(months[0])})` : 'Выручка (за выбр. мес.)') : 'Выручка (7 мес)';
    const activeHeader = useMonths ? 'Мес. с продажами (из выбр.)' : 'Активных мес.';
    const wrap = document.getElementById('rating-table-wrap');
    wrap.innerHTML = list.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Клиент</th><th>Агент</th><th>${revenueHeader}</th><th>Маржа</th><th>% маржи</th><th>${activeHeader}</th></tr></thead>
          <tbody>
            ${list.slice(0, 30).map((r) => `
              <tr>
                <td>${escapeHtml(r.clientName)}</td>
                <td>${escapeHtml(r.agentName)}</td>
                <td>${fmtMoney(r.revenue)}</td>
                <td>${fmtMoney(r.margin)}</td>
                <td>${r.marginPct}%</td>
                <td>${r.activeMonths}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${useMonths && (months.includes('август') || months.includes('сентябрь'))
        ? '<div class="muted" style="margin-top:6px;font-size:12px">За август и сентябрь маржа показана как 0 — в присланных файлах продаж за эти месяцы нет данных о себестоимости (есть только количество и сумма).</div>'
        : '<div class="muted" style="margin-top:6px;font-size:12px">Маржа считается из тех же файлов продаж (себестоимость/стоимость построчно).</div>'}
    ` : '<div class="empty-state">Нет данных о продажах за выбранный период.</div>';
  }
  if (stats.clientRating) {
    document.getElementById('rating-agent-filter').addEventListener('change', renderRatingFiltered);
    const ratingMonthBar = document.getElementById('rating-month-bar');
    ratingMonthBar.querySelectorAll('.brand-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const m = chip.dataset.month;
        if (m === 'all') state.ratingSelectedMonths.clear();
        else if (state.ratingSelectedMonths.has(m)) state.ratingSelectedMonths.delete(m);
        else state.ratingSelectedMonths.add(m);
        ratingMonthBar.querySelectorAll('.brand-chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.month === 'all' ? state.ratingSelectedMonths.size === 0 : state.ratingSelectedMonths.has(c.dataset.month));
        });
        renderRatingFiltered();
      });
    });
  }

  const todayKanban = document.getElementById('today-kanban');
  if (!stats.todayTasks.length) {
    todayKanban.appendChild(el('<div class="empty-state">На сегодня задач нет.</div>'));
  }
  stats.todayTasks.forEach((t) => {
    const client = clientById(t.clientId);
    const card = el(`
      <div class="deal-card deal-card-mini">
        <div class="deal-title">${escapeHtml(client ? client.name : t.title)}</div>
        <div class="deal-client">${agentTag(t.assigneeId)}</div>
        ${t.report ? '<span class="report-check" title="Отчёт заполнен">✓ отчёт</span>' : ''}
      </div>
    `);
    card.addEventListener('click', () => openTaskModal(t));
    todayKanban.appendChild(card);
  });
}

// ---------- Клиенты ----------

const VISIT_DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
// «Понедельник» → «Пн» (вкладка «По брендам», 05.10.2026); неизвестный текст — как есть.
// 21.10.2026: «Остаток по плану» = план из карточки − продано в этом месяце.
function planLeft(c) { return (Number(c.salesPlan) || 0) - (Number(c.currentMonthRevenue) || 0); }
function planLeftHtml(c) {
  if (!c.salesPlan) return '<span class="muted">—</span>';
  const v = planLeft(c);
  return v > 0 ? fmtMoney(v) : `<span class="plan-done" title="План выполнен${v < 0 ? ', сверх плана ' + escapeAttr(fmtMoney(-v)) : ''}">✓ ${v < 0 ? '+' + fmtMoney(-v) : ''}</span>`;
}
function dayShort(d) {
  const map = { 'понедельник': 'Пн', 'вторник': 'Вт', 'среда': 'Ср', 'четверг': 'Чт', 'пятница': 'Пт', 'суббота': 'Сб', 'воскресенье': 'Вс' };
  return map[String(d || '').trim().toLowerCase()] || String(d || '');
}

function riskCount(c) { return (c.regularAssortment || []).filter((p) => p.atRisk).length; }

// 01.10.2026: столбец скидки — не шире 3 символов. «-10%» → «10%», «без скидок» → «0»,
// пусто → «—», любой другой текст — первые 3 символа (полный текст — при наведении).
// Скидка числом для сортировки столбца «%»: «10%» → 10, «без скидки» → 0,
// другой текст условий → 0.5 (есть условия, но не процент), пусто → null.
function discountPct(c) {
  const t = (c.discountTerms || '').trim();
  if (!t) return null;
  const m = t.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  if (/без\s*скид/i.test(t)) return 0;
  return 0.5;
}
function shortDiscount(v) {
  const t = (v || '').trim();
  if (!t) return '<span class="muted">—</span>';
  const m = t.match(/(\d{1,2})\s*%/);
  if (m) return `${m[1]}%`;
  if (/без\s*скид/i.test(t)) return '0';
  return escapeHtml(t.slice(0, 3));
}
function filteredClients() {
  const f = state.clientFilters;
  let list = state.clients.filter((c) => {
    // 01.10.2026 (жалоба «фильтр закрытые не работает»): раньше галочка лишь
    // ДОБАВЛЯЛА закрытые точки к ~700 открытым — найти их в общем списке было
    // невозможно. Теперь галочка показывает ТОЛЬКО закрытые точки.
    if (isStaff() && f.showClosed) { if (!c.closed) return false; }
    else if (c.closed) return false;
    if (f.visitDay && c.visitDay !== f.visitDay) return false;
    if (f.pointType && (c.pointType || '') !== f.pointType) return false;
    if (f.paymentMethod && (c.paymentMethod || '') !== f.paymentMethod) return false;
    if (f.onlyRegular && !c.isRegularClient) return false;
    if (f.onlyDebt && !(c.debtAmount > 0)) return false;
    if (f.onlyShortfall && !riskCount(c)) return false;
    if (f.onlyDiscount && !(c.discountTerms || '').trim()) return false;
    if (f.onlyWa && !(state.waSummary || {})[c.id]) return false;
    if (f.onlyNoWa && (state.waSummary || {})[c.id]) return false; // 23.10.2026: нет привязанной переписки
    // Правка 14.09.2026 (Фаза 30): «На согласовании» должен ловить ВСЁ, что ждёт
    // решения супервайзера/админа по клиенту — не только новую точку от агента
    // (pendingApproval), но и запрос на закрытие точки (closureRequested). Раньше
    // фильтр проверял только pendingApproval, и клиенты с запросом на закрытие
    // (у которых в списке уже был свой бейдж «на закрытие») под фильтр не попадали.
    if (f.onlyPendingApproval && !(c.pendingApproval || c.closureRequested)) return false;
    if (f.geo === 'yes' && !c.geo) return false;
    if (f.geo === 'no' && c.geo) return false;
    if (f.ownerId && c.ownerId !== Number(f.ownerId)) return false;
    if (f.search) {
      const q = f.search.trim().toLowerCase();
      const hay = `${c.name} ${c.phone || ''} ${c.contactName || ''} ${(c.extraContacts || []).map((x) => `${x.name} ${x.role || ''}`).join(' ')}`.toLowerCase();
      if (!hay.includes(q) && !clientMatchesPhone(c, q)) return false;
    }
    return true;
  });
  const { key, dir } = state.clientSort;
  if (key) {
    // 02.10.2026: «Тип точки» (по алфавиту), «%» (размер скидки), «План» — пустые всегда внизу.
    const emptyOf = (c) => (key === 'type' ? !(c.pointType || '').trim() : key === 'discount' ? discountPct(c) === null : (key === 'plan' || key === 'planleft') ? !c.salesPlan : false);
    if (key === 'type' || key === 'discount' || key === 'plan' || key === 'planleft') {
      const val = (c) => (key === 'type' ? (c.pointType || '').trim().toLowerCase() : key === 'discount' ? discountPct(c) : key === 'planleft' ? planLeft(c) : c.salesPlan);
      return list.slice().sort((a, b) => {
        const ea = emptyOf(a), eb = emptyOf(b);
        if (ea !== eb) return ea ? 1 : -1;
        if (ea) return 0;
        const va = val(a), vb = val(b);
        const cmp = key === 'type' ? va.localeCompare(vb, 'ru') : va - vb;
        return (cmp || a.name.localeCompare(b.name, 'ru')) * dir;
      });
    }
    const sortVal = (c) => {
      if (key === 'debt') return c.debtAmount || 0;
      if (key === 'route') return c.routeNumber == null ? Infinity : c.routeNumber;
      if (key === 'sales') return c.currentMonthRevenue || 0;
      if (key === 'geo') return c.geo ? 1 : 0;
      if (key === 'lastsale') { const i = lastSaleInfo(c); return i ? new Date(i.key).getTime() : 0; }
      if (key === 'wa') return waLastContactAt(c);
      return riskCount(c);
    };
    list = list.slice().sort((a, b) => (sortVal(a) - sortVal(b)) * dir);
  }
  return list;
}

// 09.10.2026 (восстановлено): дата последней продажи клиенту. Текущий месяц —
// точная дата последней накладной из среза (currentMonthLastSale); иначе —
// последний месяц с продажами из истории (activeMonths, 2026 г.).
const LAST_SALE_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
function lastSaleInfo(c) {
  if (c.currentMonthLastSale) {
    const d = new Date(c.currentMonthLastSale + 'T00:00:00');
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return { key: c.currentMonthLastSale, label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }), days, exact: true };
  }
  const months = (c.activeMonths || []).map((m) => LAST_SALE_MONTHS.indexOf(String(m).toLowerCase())).filter((i) => i >= 0);
  if (!months.length) return null;
  const mi = Math.max(...months);
  const key = `2026-${String(mi + 1).padStart(2, '0')}-01`;
  const days = Math.floor((Date.now() - new Date(2026, mi + 1, 0).getTime()) / 86400000);
  return { key, label: `${LAST_SALE_MONTHS[mi]} 2026`, days, exact: false };
}
function lastSaleHtml(c) {
  const i = lastSaleInfo(c);
  if (!i) return '<span class="muted">—</span>';
  const cls = i.days > 30 ? 'age-old' : i.days > 7 ? 'age-mid' : 'age-new';
  return `<span class="${cls}" title="${i.exact ? 'Последняя накладная в этом месяце' : 'Последний месяц с продажами (точной даты нет)'}">${escapeHtml(i.label)}</span>`;
}
function lastSaleText(c) { const i = lastSaleInfo(c); return i ? i.label : ''; }

// 09.10.2026 (восстановлено): дата последнего сообщения WhatsApp с клиентом.
function waLastContactAt(c) { const w = (state.waSummary || {})[c.id]; return w && w.lastAt ? w.lastAt : 0; }
function waLastContactHtml(c) {
  const t = waLastContactAt(c);
  if (!t) return '<span class="muted">—</span>';
  const days = Math.floor((Date.now() / 1000 - t) / 86400);
  const cls = days > 30 ? 'age-old' : days > 7 ? 'age-mid' : 'age-new';
  const d = new Date(t * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return `<span class="${cls}" title="Последнее сообщение WhatsApp: ${escapeAttr(waTime(t))} (${days} дн. назад)">${d}</span>`;
}

function sortArrow(key) {
  if (state.clientSort.key !== key) return '';
  return state.clientSort.dir === 1 ? ' ▲' : ' ▼';
}

// В исходной выгрузке долгов (data/import/debts.json) у части клиентов вместо
// даты буквально стоит текст "Нет данных" (сама выгрузка так размечена) — для
// таких показывать "— на Нет данных" бессмысленно, поэтому проверяем, похоже
// ли значение на настоящую дату (ДД.ММ или ДД.ММ.ГГГГ), прежде чем его показывать.
function debtAsOfLabel(c) {
  if (!c.debtAsOf || !/^\d{1,2}[.,]\d{1,2}/.test(c.debtAsOf.trim())) return '';
  return c.debtAsOf.trim();
}

function daysOverdueText(c) {
  if (!c.debtOverdue || !c.debtAmount) return '';
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((c.debtAsOf || '').trim());
  if (!m) return '';
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days > 0 ? `просрочено ${days} дн.` : '';
}

function exportClientsCsv(list) {
  const headers = ['Название', 'Телефон', 'Адрес', 'Контактное лицо', 'Тип точки', 'Маршрут №', 'План', 'Остаток по плану', 'Продано', 'Посл. продажа', 'WhatsApp (посл. сообщение)', 'Долг', 'Особые условия (скидка)', 'Недопродано', 'День визита', 'Ответственный'];
  const rows = list.map((c) => [c.name, c.phone || '', c.address || '', c.contactName || '', c.pointType || '', c.routeNumber != null ? c.routeNumber : '', c.salesPlan || 0, c.salesPlan ? planLeft(c) : '', c.currentMonthRevenue || 0, lastSaleText(c), waLastContactAt(c) ? new Date(waLastContactAt(c) * 1000).toLocaleDateString('ru-RU') : '', c.debtAmount || 0, c.discountTerms || '', riskCount(c), c.visitDay || '', userName(c.ownerId)]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `клиенты-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderClients(content) {
  // Фаза 19: "тип точки" стал фиксированным списком из 8 категорий (см.
  // state.pointTypes, приходит с сервера через /api/me) — раньше здесь
  // вычислялся динамический список из фактических значений клиентов,
  // но теперь после миграции значения и так только из этого набора.
  const pointTypes = state.pointTypes;
  const f = state.clientFilters;
  const filtersActive = f.visitDay || f.pointType || f.paymentMethod || f.ownerId || f.onlyRegular || f.onlyDebt || f.onlyShortfall || f.onlyDiscount || f.onlyWa || f.onlyNoWa || f.onlyPendingApproval || f.showClosed || f.geo || f.search;
  const bulk = state.clientBulkMode;
  content.appendChild(el(`
    <div>
      <div class="toolbar">
        <h2 style="margin:0">Клиенты</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${state.user.role === 'supervisor' ? '<button type="button" class="btn-secondary" id="export-csv-btn">Экспорт в CSV</button>' : ''}
          ${isStaff() ? `<button type="button" class="btn-secondary ${bulk ? 'active' : ''}" id="bulk-mode-btn">${bulk ? 'Отменить выбор' : 'Выбрать несколько'}</button>` : ''}
          <button class="btn-primary" id="add-client-btn">+ Новый клиент</button>
        </div>
      </div>
      <div class="filter-bar">
        <input type="text" id="filter-search" placeholder="Поиск: название, номер телефона, контакт..." value="${escapeAttr(f.search)}" style="max-width:220px">
        <select id="filter-visitDay">
          <option value="">День недели: все</option>
          ${VISIT_DAYS.map((d) => `<option value="${d}" ${f.visitDay === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
        <select id="filter-pointType">
          <option value="">Тип точки: все</option>
          ${pointTypes.map((p) => `<option value="${escapeAttr(p)}" ${f.pointType === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
        <select id="filter-paymentMethod">
          <option value="">Способ оплаты: все</option>
          ${state.paymentMethods.map((p) => `<option value="${p}" ${f.paymentMethod === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <label class="filter-check"><input type="checkbox" id="filter-onlyRegular" ${f.onlyRegular ? 'checked' : ''}> Постоянный клиент</label>
        <label class="filter-check"><input type="checkbox" id="filter-onlyDebt" ${f.onlyDebt ? 'checked' : ''}> Есть задолженность</label>
        <label class="filter-check"><input type="checkbox" id="filter-onlyShortfall" ${f.onlyShortfall ? 'checked' : ''}> Не добрал</label>
        <label class="filter-check"><input type="checkbox" id="filter-onlyDiscount" ${f.onlyDiscount ? 'checked' : ''}> Со скидкой/особыми условиями</label>
        <label class="filter-check" title="Клиенты, у которых в карточке уже есть переписка из подключённого WhatsApp"><input type="checkbox" id="filter-onlyWa" ${f.onlyWa ? 'checked' : ''}> 💬 Есть переписка WhatsApp (${Object.keys(state.waSummary || {}).length})</label>
        <label class="filter-check" title="Клиенты, к которым не привязан ни один чат WhatsApp: нет номера, номер не совпал или переписки ещё не было"><input type="checkbox" id="filter-onlyNoWa" ${f.onlyNoWa ? 'checked' : ''}> 🚫 Нет WhatsApp (${state.clients.filter((c) => !c.closed && !(state.waSummary || {})[c.id]).length})</label>
        <select id="filter-geo" title="Сохранены ли координаты точки (первая отметка посещения)">
          <option value="">Координаты: все</option>
          <option value="yes" ${f.geo === 'yes' ? 'selected' : ''}>✓ Координаты есть</option>
          <option value="no" ${f.geo === 'no' ? 'selected' : ''}>Координат нет</option>
        </select>
        ${isStaff() ? `<label class="filter-check" title="Новые точки от агентов, ожидающие подтверждения, и точки с запросом на закрытие"><input type="checkbox" id="filter-onlyPendingApproval" ${f.onlyPendingApproval ? 'checked' : ''}> На согласовании</label>` : ''}
        ${isStaff() ? `<select id="filter-ownerId">
          <option value="">Агент: все</option>
          ${state.users.filter((u) => u.role === 'agent').map((u) => `<option value="${u.id}" ${String(f.ownerId) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
        </select>` : ''}
        ${isStaff() ? `<label class="filter-check" title="Показать только закрытые точки"><input type="checkbox" id="filter-showClosed" ${f.showClosed ? 'checked' : ''}> Закрытые (${state.clients.filter((c) => c.closed).length})</label>` : ''}
        ${filtersActive ? '<button type="button" class="link-btn" id="filter-reset">Сбросить</button>' : ''}
      </div>
      ${bulk ? `<div class="filter-bar" id="bulk-bar">
        <span class="muted" style="font-size:13px">Выбрано: <span id="bulk-count">0</span></span>
        <select id="bulk-owner-select">
          <option value="">Переназначить агенту...</option>
          ${state.users.filter((u) => u.role === 'agent').map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}
        </select>
        <button type="button" class="btn-secondary" id="bulk-reassign-btn">Применить</button>
      </div>` : ''}
      <div class="table-wrap table-wrap-fit">
        <table class="clients-table">
          <thead><tr>
            ${bulk ? '<th></th>' : ''}
            <th class="sticky-col">Название</th>
            <th class="sortable col-narrow" data-sort="sales">Продано<br>в этом месяце${sortArrow('sales')}</th>
            <th class="sortable col-narrow" data-sort="lastsale" title="Дата последней продажи (текущий месяц — по накладной, раньше — месяц)">Посл.<br>продажа${sortArrow('lastsale')}</th>
            <th class="sortable col-narrow col-risk" data-sort="risk" title="Сколько позиций регулярного ассортимента ещё не куплено в этом месяце">Недо-<br>продано${sortArrow('risk')}</th>
            <th class="sortable col-narrow" data-sort="wa" title="Последнее сообщение в WhatsApp с клиентом">WhatsApp${sortArrow('wa')}</th>
            <th class="sortable col-narrow" data-sort="debt">Долг${sortArrow('debt')}</th>
            <th class="col-cond sortable" data-sort="discount" title="Скидка / особые условия (полный текст — при наведении на ячейку). Нажмите — сортировка по размеру скидки">%${sortArrow('discount')}</th>
            <th>Номер телефона</th>
            <th>Адрес</th>
            <th class="col-narrow sortable" data-sort="geo" title="Координаты точки сохранены (первая отметка посещения)">Коорд.${sortArrow('geo')}</th>
            <th class="col-contact">Контактное лицо</th>
            <th class="sortable" data-sort="type" title="Нажмите — сортировка по типу точки (А→Я / Я→А)">Тип точки${sortArrow('type')}</th>
            <th class="sortable" data-sort="route">Маршрут №${sortArrow('route')}</th>
            <th class="sortable" data-sort="plan" title="Нажмите — сортировка по плану продаж">План${sortArrow('plan')}</th>
            <th class="sortable" data-sort="planleft" title="План минус продано в этом месяце. Отрицательное — план перевыполнен">Остаток<br>по плану${sortArrow('planleft')}</th>
          </tr></thead>
          <tbody id="clients-tbody"></tbody>
        </table>
      </div>
    </div>
  `));
  document.getElementById('add-client-btn').addEventListener('click', () => openClientModal());
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) exportBtn.addEventListener('click', () => exportClientsCsv(filteredClients()));
  const bulkModeBtn = document.getElementById('bulk-mode-btn');
  if (bulkModeBtn) bulkModeBtn.addEventListener('click', () => { state.clientBulkMode = !state.clientBulkMode; state.clientBulkSelected = new Set(); render(); });

  // Фаза 21 (07.09.2026, исправление бага): полный render() на каждое нажатие
  // клавиши пересоздаёт DOM всей страницы «Клиенты», включая сам этот <input>
  // — новый элемент не в фокусе, поэтому раньше можно было ввести только одну
  // букву за раз (после каждой буквы приходилось кликать в поле заново).
  // Фикс: запоминаем позицию курсора перед перерисовкой и сразу после нее
  // возвращаем фокус и курсор на новый (пересозданный) элемент с тем же id.
  document.getElementById('filter-search').addEventListener('input', (e) => {
    const cursorPos = e.target.selectionStart;
    state.clientFilters.search = e.target.value;
    render();
    const refreshed = document.getElementById('filter-search');
    if (refreshed) {
      refreshed.focus();
      refreshed.setSelectionRange(cursorPos, cursorPos);
    }
  });
  document.getElementById('filter-visitDay').addEventListener('change', (e) => { state.clientFilters.visitDay = e.target.value; render(); });
  document.getElementById('filter-pointType').addEventListener('change', (e) => { state.clientFilters.pointType = e.target.value; render(); });
  document.getElementById('filter-paymentMethod').addEventListener('change', (e) => { state.clientFilters.paymentMethod = e.target.value; render(); });
  document.getElementById('filter-onlyRegular').addEventListener('change', (e) => { state.clientFilters.onlyRegular = e.target.checked; render(); });
  document.getElementById('filter-onlyDebt').addEventListener('change', (e) => { state.clientFilters.onlyDebt = e.target.checked; render(); });
  document.getElementById('filter-onlyShortfall').addEventListener('change', (e) => { state.clientFilters.onlyShortfall = e.target.checked; render(); });
  document.getElementById('filter-onlyDiscount').addEventListener('change', (e) => { state.clientFilters.onlyDiscount = e.target.checked; render(); });
  document.getElementById('filter-onlyWa').addEventListener('change', (e) => { state.clientFilters.onlyWa = e.target.checked; if (e.target.checked) state.clientFilters.onlyNoWa = false; render(); });
  document.getElementById('filter-onlyNoWa').addEventListener('change', (e) => { state.clientFilters.onlyNoWa = e.target.checked; if (e.target.checked) state.clientFilters.onlyWa = false; render(); });
  const geoFilterSel = document.getElementById('filter-geo');
  if (geoFilterSel) geoFilterSel.addEventListener('change', (e) => { state.clientFilters.geo = e.target.value; render(); });
  const onlyPendingApprovalCb = document.getElementById('filter-onlyPendingApproval');
  if (onlyPendingApprovalCb) onlyPendingApprovalCb.addEventListener('change', (e) => { state.clientFilters.onlyPendingApproval = e.target.checked; render(); });
  const ownerSel = document.getElementById('filter-ownerId');
  if (ownerSel) ownerSel.addEventListener('change', (e) => { state.clientFilters.ownerId = e.target.value; render(); });
  const showClosedCb = document.getElementById('filter-showClosed');
  if (showClosedCb) showClosedCb.addEventListener('change', (e) => { state.clientFilters.showClosed = e.target.checked; render(); });
  const resetBtn = document.getElementById('filter-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    state.clientFilters = { visitDay: '', pointType: '', paymentMethod: '', ownerId: '', onlyRegular: false, onlyDebt: false, onlyShortfall: false, onlyDiscount: false, onlyWa: false, onlyNoWa: false, onlyPendingApproval: false, showClosed: false, geo: '', search: '' };
    render();
  });
  content.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.clientSort.key === k) state.clientSort.dir *= -1;
      else { state.clientSort.key = k; state.clientSort.dir = k === 'type' ? 1 : -1; } // тип точки — сначала А→Я
      render();
    });
  });
  const bulkReassignBtn = document.getElementById('bulk-reassign-btn');
  if (bulkReassignBtn) bulkReassignBtn.addEventListener('click', async () => {
    const ownerId = document.getElementById('bulk-owner-select').value;
    if (!ownerId) return alert('Выберите агента');
    if (!state.clientBulkSelected.size) return alert('Не выбрано ни одного клиента');
    await api('POST', '/api/clients/bulk-reassign', { ids: Array.from(state.clientBulkSelected), ownerId });
    state.clientBulkMode = false;
    state.clientBulkSelected = new Set();
    await loadAll();
    render();
  });

  const tbody = document.getElementById('clients-tbody');
  const list = filteredClients();
  // 22.10.2026: поиск ищет и среди закрытых — если там есть совпадения, подсказка со ссылкой.
  if (isStaff() && state.clientFilters.search.trim() && !state.clientFilters.showClosed) {
    const q = state.clientFilters.search.trim().toLowerCase();
    const closedHits = state.clients.filter((c) => c.closed && (`${c.name} ${c.phone || ''} ${c.contactName || ''} ${c.address || ''} ${(c.extraContacts || []).map((x) => `${x.name} ${x.role || ''}`).join(' ')}`.toLowerCase().includes(q) || clientMatchesPhone(c, q)));
    if (closedHits.length) {
      const hint = el(`<div class="closed-hint">🔒 Среди закрытых точек тоже найдено: ${closedHits.slice(0, 5).map((c) => `<button type="button" class="link-btn closed-hit" data-id="${c.id}">${escapeHtml(c.name)}</button>`).join(', ')}${closedHits.length > 5 ? ` и ещё ${closedHits.length - 5}` : ''} · <button type="button" class="link-btn" id="closed-hint-all">показать закрытые (${closedHits.length})</button></div>`);
      tbody.closest('.table-wrap').before(hint);
      hint.querySelectorAll('.closed-hit').forEach((b) => b.addEventListener('click', () => { const c = clientById(Number(b.dataset.id)); if (c) openClientModal(c); }));
      hint.querySelector('#closed-hint-all').addEventListener('click', () => { state.clientFilters.showClosed = true; render(); });
    }
  }
  if (!list.length) {
    tbody.appendChild(el(`<tr><td colspan="${bulk ? 16 : 15}"><div class="empty-state">${state.clients.length ? 'Ничего не найдено по выбранным фильтрам.' : 'Пока нет клиентов. Добавьте первого.'}</div></td></tr>`));
    return;
  }
  list.forEach((c) => {
    const risk = riskCount(c);
    const overdueDays = daysOverdueText(c);
    const row = el(`
      <tr class="${c.closed ? 'row-closed' : ''}">
        ${bulk ? `<td><input type="checkbox" class="bulk-check" data-id="${c.id}" ${state.clientBulkSelected.has(c.id) ? 'checked' : ''}></td>` : ''}
        <td class="sticky-col open-client" title="Двойной клик — открыть карточку">
          <strong class="name-2l" title="${escapeAttr(c.name)}">${escapeHtml(c.name)}</strong>
          ${c.closed ? '<span class="badge badge-offroute">закрыта</span>' : ''}
          ${c.closureRequested ? '<span class="badge badge-pending">на закрытие</span>' : ''}
          ${c.pendingApproval ? '<span class="badge badge-pending">на согласовании</span>' : ''}
          ${c.isOffRoute ? '<span class="badge badge-offroute">вне маршрута</span>' : ''}
          ${waBadgeHtml(c)}
        </td>
        <td class="col-narrow">${c.currentMonthRevenue ? fmtMoney(c.currentMonthRevenue) : '—'}</td>
        <td class="col-narrow">${lastSaleHtml(c)}</td>
        <td class="col-narrow col-risk">${risk ? `<span class="badge badge-overdue" title="${risk} поз. недопродано">${risk}</span>` : '—'}</td>
        <td class="col-narrow">${waLastContactHtml(c)}</td>
        <td class="col-narrow">${c.debtAmount ? `<span class="badge ${c.debtOverdue ? 'badge-overdue' : 'badge-pay'}" title="${escapeAttr([overdueDays, debtAsOfLabel(c) ? 'на ' + debtAsOfLabel(c) : ''].filter(Boolean).join(', '))}">${fmtMoney(c.debtAmount)}</span>` : '—'}</td>
        <td class="col-cond" title="${escapeAttr(c.discountTerms || '')}">${shortDiscount(c.discountTerms)}</td>
        <td class="col-phone">${telLink(c.phone)}</td>
        <td class="col-addr">${escapeHtml(c.address || '—')} ${mapsLink(c.address, c.geo)}</td>
        <td class="col-narrow">${c.geo ? `<span class="geo-yes" title="Координаты сохранены ${escapeAttr(fmtVisitTime(c.geo.setAt))}${c.geo.setBy ? ' (' + escapeAttr(c.geo.setBy) + ')' : ''}">✓</span>` : '<span class="muted">—</span>'}</td>
        <td class="col-contact">${escapeHtml(c.contactName || '—')}</td>
        <td>${escapeHtml(c.pointType || '—')}</td>
        <td>${c.routeNumber != null ? escapeHtml(String(c.routeNumber)) : '—'}</td>
        <td>${c.salesPlan ? fmtMoney(c.salesPlan) : '—'}</td>
        <td>${planLeftHtml(c)}</td>
      </tr>
    `);
    row.querySelector('.open-client').addEventListener('dblclick', () => openClientModal(c));
    const cb = row.querySelector('.bulk-check');
    if (cb) cb.addEventListener('change', () => {
      if (cb.checked) state.clientBulkSelected.add(c.id); else state.clientBulkSelected.delete(c.id);
      const countEl = document.getElementById('bulk-count');
      if (countEl) countEl.textContent = state.clientBulkSelected.size;
    });
    tbody.appendChild(row);
  });
}

function fieldRow(label, value, locked) {
  return `<div class="field"><span class="k">${label}${locked ? ' <span class="lock" title="Редактирует только администратор или супервайзер">🔒</span>' : ''}</span><span class="v">${value}</span></div>`;
}

// ---------- "Давно не был" — последний визит по клиенту ----------

function clientTasksSorted(clientId) {
  return state.tasks.filter((t) => t.clientId === clientId).slice().sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
}

function lastVisitInfo(client) {
  const tasks = clientTasksSorted(client.id);
  if (!tasks.length) return { html: 'визитов ещё не было', stale: !!client.visitDay };
  const last = tasks[0];
  const days = Math.floor((Date.now() - new Date(last.dueDate).getTime()) / 86400000);
  const stale = days > 21;
  return { html: `${fmtDate(last.dueDate)} (${days} дн. назад)`, stale };
}

// ---------- Заметки/звонки по клиенту ----------

function notesListHtml(notes) {
  return (notes || []).length ? notes.map((n) => `
    <div class="history-row" data-note="${n.id}">
      <div class="muted">${fmtDateTime(n.createdAt)} · ${escapeHtml(userName(n.authorId))} ${isStaff() ? `<button type="button" class="icon-btn del-note" data-id="${n.id}">✕</button>` : ''}</div>
      <div>${escapeHtml(n.text)}</div>
    </div>
  `).join('') : '<div class="muted">Заметок пока нет.</div>';
}

function renderContactNotes(client) {
  return `
    <div class="assort-panel">
      <h3>Заметки / звонки</h3>
      <form id="note-form" class="note-form">
        <textarea name="text" placeholder="Например: звонил(а), не ответил" style="min-height:44px"></textarea>
        <button type="submit" class="btn-secondary">Добавить</button>
      </form>
      <div id="notes-list">${notesListHtml(client.contactNotes)}</div>
    </div>
  `;
}

function wireContactNotes(clientId) {
  const form = document.getElementById('note-form');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.querySelector('textarea[name=text]').value.trim();
    if (!text) return;
    const res = await api('POST', `/api/clients/${clientId}/notes`, { text });
    const client = clientById(clientId);
    if (client) client.contactNotes = res.client.contactNotes;
    document.getElementById('notes-list').innerHTML = notesListHtml(res.client.contactNotes);
    form.reset();
    wireContactNoteDeletes(clientId);
  });
  wireContactNoteDeletes(clientId);
}

function wireContactNoteDeletes(clientId) {
  document.querySelectorAll('.del-note').forEach((btn) => {
    btn.onclick = async () => {
      const res = await api('DELETE', `/api/clients/${clientId}/notes/${btn.dataset.id}`);
      const client = clientById(clientId);
      if (client) client.contactNotes = res.client.contactNotes;
      document.querySelector(`[data-note="${btn.dataset.id}"]`).remove();
    };
  });
}

// ---------- Доп. контакты клиента (09.10.2026, восстановлено) ----------

function extraContactsListHtml(list) {
  return (list || []).length ? list.map((x) => `
    <div class="master-card" data-contact="${escapeAttr(x.id)}">
      <div>
        <div class="name">${escapeHtml(x.name)}${x.role ? ` <span class="muted">· ${escapeHtml(x.role)}</span>` : ''}</div>
        <div class="spec">${x.phone ? telLink(x.phone) : '<span class="muted">без телефона</span>'}</div>
      </div>
      <button type="button" class="icon-btn del-contact" data-id="${escapeAttr(x.id)}" title="Удалить контакт">✕</button>
    </div>`).join('') : '<div class="muted">Дополнительных контактов нет.</div>';
}

function renderExtraContactsSection(client) {
  return `
    <div class="assort-panel">
      <h3>Доп. контакты</h3>
      <div class="muted" style="font-size:12px;margin-bottom:6px">Второй номер точки, ЛПР, администратор, бухгалтер… Переписка WhatsApp с этих номеров тоже попадает в карточку.</div>
      <div id="contacts-list">${extraContactsListHtml(client.extraContacts)}</div>
      <form id="contact-form" class="note-form" style="margin-top:8px">
        <input name="name" placeholder="Имя">
        <input name="role" placeholder="Роль (администратор, ЛПР…)">
        <input name="phone" placeholder="Телефон">
        <button type="submit" class="btn-secondary">+ Добавить контакт</button>
      </form>
    </div>`;
}

function wireExtraContactsSection(client) {
  const form = document.getElementById('contact-form');
  const refresh = (updated) => {
    const c = clientById(client.id);
    if (c) c.extraContacts = updated.extraContacts;
    client.extraContacts = updated.extraContacts;
    document.getElementById('contacts-list').innerHTML = extraContactsListHtml(updated.extraContacts);
    wireDeletes();
    loadClientWhatsapp(client);
  };
  function wireDeletes() {
    document.querySelectorAll('.del-contact').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Удалить контакт?')) return;
        const res = await api('DELETE', `/api/clients/${client.id}/contacts/${encodeURIComponent(btn.dataset.id)}`);
        refresh(res.client);
      };
    });
  }
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!(data.name || '').trim() && !(data.phone || '').trim()) return;
    try {
      const res = await api('POST', `/api/clients/${client.id}/contacts`, data);
      form.reset();
      refresh(res.client);
    } catch (err) { alert(err.message); }
  });
  wireDeletes();
}

// ---------- Мастера точки ----------

function mastersListHtml(masters) {
  return (masters || []).length ? masters.map((m) => `
    <div class="master-card" data-master="${m.id}">
      <div>
        <div class="name">${escapeHtml(m.name)} ${m.isNew ? '<span class="badge badge-amber">новый</span>' : ''}</div>
        <div class="spec">${escapeHtml(m.specialization || '—')} ${m.phone ? '· ' + telLink(m.phone) : ''}</div>
      </div>
      ${isStaff() ? `<button type="button" class="icon-btn del-master" data-id="${m.id}">✕</button>` : ''}
    </div>
  `).join('') : '<div class="muted">Мастера пока не добавлены.</div>';
}

function renderMastersSection(client) {
  return `
    <div class="assort-panel">
      <h3>Мастера точки</h3>
      <div id="masters-list">${mastersListHtml(client.masters)}</div>
      <form id="master-form" class="note-form" style="margin-top:8px">
        <input name="name" placeholder="ФИО мастера" required>
        <input name="specialization" placeholder="Специализация (парикмахер, косметолог...)">
        <input name="phone" placeholder="Телефон">
        <button type="submit" class="btn-secondary">+ Добавить мастера</button>
      </form>
    </div>
  `;
}

function wireMastersSection(clientId) {
  const form = document.getElementById('master-form');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.name.trim()) return;
    const res = await api('POST', `/api/clients/${clientId}/masters`, data);
    const client = clientById(clientId);
    if (client) client.masters = res.client.masters;
    document.getElementById('masters-list').innerHTML = mastersListHtml(res.client.masters);
    form.reset();
    wireMasterDeletes(clientId);
  });
  wireMasterDeletes(clientId);
}

function wireMasterDeletes(clientId) {
  document.querySelectorAll('.del-master').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Удалить мастера?')) return;
      const res = await api('DELETE', `/api/clients/${clientId}/masters/${btn.dataset.id}`);
      const client = clientById(clientId);
      if (client) client.masters = res.client.masters;
      document.querySelector(`[data-master="${btn.dataset.id}"]`).remove();
    };
  });
}

// ---------- "Точка закрыта" ----------

function renderClosureBlock(client) {
  if (client.closed) {
    return `<p class="note-pending">Точка закрыта${isStaff() ? '' : ''}</p>${isStaff() ? '<button type="button" class="btn-secondary" id="reopen-client">Открыть заново</button>' : ''}`;
  }
  if (client.closureRequested) {
    if (isStaff()) {
      return `<p class="note-pending">Точку предлагают закрыть (${escapeHtml(userName(client.closureRequestedBy))}) — подтвердить?</p>
        <button type="button" class="btn-secondary" id="confirm-closure">Подтвердить закрытие</button>
        <button type="button" class="btn-secondary" id="reject-closure">Отклонить</button>`;
    }
    return `<p class="note-pending">Заявка на закрытие точки отправлена — ждём подтверждения.</p>`;
  }
  return `<button type="button" class="btn-secondary" id="request-closure">Точка закрыта</button>`;
}

function wireClosureBlock(clientId) {
  const reload = async () => { await loadAll(); closeModal(); render(); };
  const reqBtn = document.getElementById('request-closure');
  if (reqBtn) reqBtn.addEventListener('click', async () => {
    if (!confirm('Отправить заявку на закрытие точки?')) return;
    await api('POST', `/api/clients/${clientId}/request-closure`);
    await reload();
  });
  const confirmBtn = document.getElementById('confirm-closure');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => { await api('POST', `/api/clients/${clientId}/confirm-closure`); await reload(); });
  const rejectBtn = document.getElementById('reject-closure');
  if (rejectBtn) rejectBtn.addEventListener('click', async () => { await api('POST', `/api/clients/${clientId}/reject-closure`); await reload(); });
  const reopenBtn = document.getElementById('reopen-client');
  if (reopenBtn) reopenBtn.addEventListener('click', async () => { await api('POST', `/api/clients/${clientId}/reopen`); await reload(); });
}

async function openClientModal(client) {
  waClientOpen = { id: null, open: false }; // WhatsApp в карточке — свёрнут при каждом открытии
  const isEdit = !!client;
  const isOwner = isEdit && client.ownerId === state.user.id;
  // Фаза 15, п.4: раньше полную редактируемую форму видел только админ/
  // супервайзер, агент — read-only вид (см. ветку ниже). Пользователь явно
  // попросил дать агентам возможность редактировать ВСЕ поля своих клиентов —
  // теперь ответственный агент тоже получает полную форму, как и админ/
  // супервайзер (владелец клиента и так гарантирован API-скоупингом —
  // агенту в state.clients в принципе попадают только его клиенты).
  const canEditCore = isStaff() || isOwner;

  const ownerOptions = state.users.filter((u) => u.role === 'agent' || u.role === undefined);

  const lastVisit = isEdit ? lastVisitInfo(client) : null;

  const canEditContact = isOwner && !!state.user.canEditClientContact;

  // Быстрое создание задачи по любой из 3 воронок прямо из карточки клиента.
  const taskButtonsHtml = isEdit ? `
    ${(isOwner || isStaff()) ? visitBlockHtml(client) : ''}
    ${(isOwner || isStaff()) ? '<div id="wa-client-box" class="wa-client-box"></div>' : ''}
    <div class="filter-bar" style="margin:8px 0">
      <span class="muted" style="font-size:13px">Создать задачу:</span>
      <button type="button" class="btn-secondary" id="quick-task-visit">Визит</button>
      <button type="button" class="btn-secondary" id="quick-task-sale">Продажа</button>
    </div>` : '';

  let bodyHtml;
  if (isEdit && !canEditCore) {
    // Просмотр для агента: карточка + доступное редактирование заметок
    // (+ адрес/телефон/конт.лицо, если администратор выдал такое разрешение — см. «Команда»).
    bodyHtml = `
      <h2>${escapeHtml(client.name)} ${waBadgeHtml(client)}</h2>
      ${client.pendingApproval ? '<p class="note-pending">Точка на согласовании у администратора</p>' : ''}
      ${taskButtonsHtml}
      ${renderClosureBlock(client)}
      <div class="panel-inline">
        ${fieldRow('Тип точки', escapeHtml(client.pointType || '—'), true)}
        ${canEditContact ? '' : fieldRow('Адрес', `${escapeHtml(client.address || '—')} ${mapsLink(client.address, client.geo)}`, true)}
        ${canEditContact ? '' : fieldRow('Телефон', telLink(client.phone), true)}
        ${canEditContact ? '' : fieldRow('Контактное лицо', escapeHtml(client.contactName || '—'), true)}
        ${fieldRow('День визита', escapeHtml(client.visitDay || '—'), true)}
        ${fieldRow('Работает по договору', escapeHtml(client.contractStatus), true)}
        ${fieldRow('Способ оплаты', escapeHtml(client.paymentMethod || 'не указан'), true)}
        ${fieldRow('Скидка / условия оплаты', escapeHtml(client.discountTerms || '—'), true)}
        ${fieldRow('План продаж (мес.)', client.salesPlan ? `${fmtMoney(client.salesPlan)} (продано в этом месяце: ${fmtMoney(client.currentMonthRevenue || 0)}${!state.currentMonthDataFresh ? ' — нет данных за текущий месяц' : ''})` : '—', true)}
        ${isStaff() ? fieldRow('Радиус посещения', `${client.visitRadius || 30} м${client.visitRadius ? '' : ' (по умолчанию)'}`, true) : ''}
        ${fieldRow('Ответственный', escapeHtml(userName(client.ownerId)), true)}
        ${fieldRow('Задолженность', client.debtAmount ? fmtMoney(client.debtAmount) + (client.debtOverdue ? ' (просрочка)' : '') + (debtAsOfLabel(client) ? ` — на ${escapeHtml(debtAsOfLabel(client))}` : '') : 'нет', true)}
        ${fieldRow('Последний визит', `<span class="${lastVisit.stale ? 'stale-visit' : ''}">${lastVisit.html}</span>`, true)}
        ${fieldRow('Последняя продажа', lastSaleHtml(client), true)}
        ${fieldRow('Особенности приёма', escapeHtml(client.orderWindow || '—'), true)}
        ${fieldRow('Номер маршрута', client.routeNumber != null ? String(client.routeNumber) : '—', true)}
        ${fieldRow('Время приёмки товара', escapeHtml(client.bestCallTime || '—'), true)}
        ${fieldRow('ФИО ЛПР', escapeHtml(client.decisionMakerName || '—'), true)}
        ${fieldRow('Особые пожелания', escapeHtml(client.specialRequests || '—'), true)}
      </div>
      <form id="client-form">
        ${canEditContact ? `
        <label>Адрес ${client.address || client.geo ? mapsLink(client.address, client.geo) : ''}</label>
        <input name="address" value="${escapeAttr(client.address)}">
        <div class="field-row">
          <div><label>Телефон ${client.phone ? telLink(client.phone) : ''}</label><input name="phone" value="${escapeAttr(client.phone)}"></div>
          <div><label>Контактное лицо</label><input name="contactName" value="${escapeAttr(client.contactName)}"></div>
        </div>` : ''}
        <label>Заметки</label>
        <textarea name="notes">${escapeHtml(client.notes || '')}</textarea>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="cancel-modal">Закрыть</button>
          <button type="submit" class="btn-primary">Сохранить${canEditContact ? '' : ' заметки'}</button>
        </div>
      </form>
      ${renderExtraContactsSection(client)}
      ${typeof vanClientSectionHtml === 'function' ? vanClientSectionHtml(client) : ''}
      ${renderRecentSalesSection(client)}
      ${renderContactNotes(client)}
      <div id="history-section" class="assort-panel"><h3>История визитов</h3><div class="muted">Загрузка…</div></div>
    `;
  } else {
    bodyHtml = `
      <h2>${isEdit ? 'Контрагент' : 'Новый контрагент'} ${isEdit ? waBadgeHtml(client) : ''}</h2>
      ${taskButtonsHtml}
      <form id="client-form">
        <label>Название *</label>
        <input name="name" required value="${client ? escapeAttr(client.name) : ''}">
        <div class="field-row">
          <div><label>Тип точки</label>
            <select name="pointType">
              <option value="">не указан</option>
              ${state.pointTypes.map((p) => `<option value="${escapeAttr(p)}" ${client && client.pointType === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
            </select>
          </div>
          <div><label>День визита</label>
            <select name="visitDay">
              <option value="">—</option>
              ${VISIT_DAYS.map((d) => `<option value="${d}" ${client && client.visitDay === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
        </div>
        <label>Адрес ${client && (client.address || client.geo) ? mapsLink(client.address, client.geo) : ''}</label>
        <input name="address" value="${client ? escapeAttr(client.address) : ''}">
        <div class="field-row">
          <div><label>Телефон ${client && client.phone ? telLink(client.phone, '📞') : ''}</label><input name="phone" value="${client ? escapeAttr(client.phone) : ''}"></div>
          <div><label>Контактное лицо</label><input name="contactName" value="${client ? escapeAttr(client.contactName) : ''}"></div>
        </div>
        <div class="field-row">
          <div><label>Работает по договору</label>
            <select name="contractStatus">
              ${state.contractStatuses.map((s) => `<option value="${s}" ${client && client.contractStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div><label>Способ оплаты</label>
            <select name="paymentMethod">
              <option value="">не указан</option>
              ${state.paymentMethods.map((p) => `<option value="${p}" ${client && client.paymentMethod === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        <label>Скидка / условия оплаты</label>
        <input name="discountTerms" value="${client ? escapeAttr(client.discountTerms || '') : ''}" placeholder="Например: -10%, нал/безнал">
        <label>План продаж на клиента (сом/мес.)</label>
        <input type="number" min="0" step="1" name="salesPlan" value="${client && client.salesPlan ? client.salesPlan : ''}" placeholder="Например: 50000">
        ${isStaff() ? `<label>Радиус засчёта посещения (м) <span class="muted" style="font-weight:400">— пусто = 30 по умолчанию</span></label>
        <input type="number" min="10" max="2000" step="5" name="visitRadius" value="${client && client.visitRadius ? client.visitRadius : ''}" placeholder="30">` : ''}

        ${isStaff() ? `<label>Ответственный агент</label>
          <select name="ownerId">
            ${ownerOptions.map((u) => `<option value="${u.id}" ${client && client.ownerId === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
          </select>` : ''}
        <label>Особенности приёма (день/время, только для сведения)</label>
        <input name="orderWindow" value="${client ? escapeAttr(client.orderWindow || '') : ''}" placeholder="Например: заявки только вт/чт, 10:00–13:00">
        <div class="field-row">
          <div><label>Номер маршрута (для порядка посещения)</label><input type="number" min="0" step="1" name="routeNumber" value="${client && client.routeNumber != null ? client.routeNumber : ''}" placeholder="Например: 3"></div>
          <div><label>Время приёмки товара</label><input name="bestCallTime" value="${client ? escapeAttr(client.bestCallTime || '') : ''}" placeholder="Например: 07:00–10:00"></div>
        </div>
        <div class="field-row">
          <div><label>ФИО ЛПР (если отличается)</label><input name="decisionMakerName" value="${client ? escapeAttr(client.decisionMakerName || '') : ''}"></div>
        </div>
        <label>Особые пожелания</label>
        <input name="specialRequests" value="${client ? escapeAttr(client.specialRequests || '') : ''}">
        <label>Заметки</label>
        <textarea name="notes">${client ? escapeHtml(client.notes || '') : ''}</textarea>
        ${isEdit ? `<div class="muted" style="font-size:13px;margin-top:6px">Последний визит: <span class="${lastVisit.stale ? 'stale-visit' : ''}">${lastVisit.html}</span> · Последняя продажа: ${lastSaleHtml(client)}</div>` : ''}
        <div class="modal-actions">
          ${isEdit && isStaff() ? '<button type="button" class="btn-secondary" id="delete-client">Удалить</button>' : ''}
          ${isEdit && client.pendingApproval && isStaff() ? '<button type="button" class="btn-secondary" id="approve-client">Одобрить точку</button>' : ''}
          <button type="button" class="btn-secondary btn-cancel-muted" id="cancel-modal">Отмена</button>
          <button type="submit" class="btn-primary">Сохранить</button>
        </div>
      </form>
      ${isEdit ? renderClosureBlock(client) : ''}
      ${isEdit ? renderExtraContactsSection(client) : ''}
      ${isEdit && typeof vanClientSectionHtml === 'function' ? vanClientSectionHtml(client) : ''}
      ${isEdit ? renderRecentSalesSection(client) : ''}
      ${isEdit ? renderContactNotes(client) : ''}
      ${isEdit ? '<div id="history-section" class="assort-panel"><h3>История визитов</h3><div class="muted">Загрузка…</div></div>' : ''}
    `;
  }

  openModal(bodyHtml, async (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      if (client) await api('PUT', `/api/clients/${client.id}`, data);
      else await api('POST', '/api/clients', data);
    } catch (err) {
      if (err.status === 409 && err.data && err.data.duplicate) {
        const d = err.data.duplicate;
        const ok = confirm(`Похоже, такой контрагент уже есть:\n«${d.name}», ${d.address || 'без адреса'}, ${d.phone || 'без телефона'}\n\nВсё равно добавить как новый?`);
        if (!ok) return;
        data.force = true;
        await api('POST', '/api/clients', data);
      } else {
        throw err;
      }
    }
    await loadAll();
    closeModal();
    render();
  });

  // Закрытие карточки клиента свайпом вправо (мобильные тач-жесты).
  wireSwipeToClose(document.querySelector('#modal-root .modal'), closeModal);

  const delBtn = document.getElementById('delete-client');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('Удалить контрагента? Связанные задачи останутся, но потеряют ссылку на него.')) return;
    await api('DELETE', `/api/clients/${client.id}`);
    await loadAll();
    closeModal();
    render();
  });

  const approveBtn = document.getElementById('approve-client');
  if (approveBtn) approveBtn.addEventListener('click', async () => {
    await api('POST', `/api/clients/${client.id}/approve`);
    await loadAll();
    closeModal();
    render();
  });

  const quickTaskVisitBtn = document.getElementById('quick-task-visit');
  if (quickTaskVisitBtn) quickTaskVisitBtn.addEventListener('click', () => { closeModal(); openTaskModal(null, 'visit', client.id); });
  const quickTaskSaleBtn = document.getElementById('quick-task-sale');
  if (quickTaskSaleBtn) quickTaskSaleBtn.addEventListener('click', () => { closeModal(); openTaskModal(null, 'sale', client.id); });
  const quickTaskWaitlistBtn = document.getElementById('quick-task-waitlist');
  if (quickTaskWaitlistBtn) quickTaskWaitlistBtn.addEventListener('click', () => { closeModal(); openTaskModal(null, 'waitlist', client.id); });

  if (isEdit) {
    wireVisitBlock(client);
    loadClientWhatsapp(client);
    wireAssortmentToggle(client.id);
    wireContactNotes(client.id);
    wireClosureBlock(client.id);
    if (typeof wireVanClientSection === 'function') wireVanClientSection(client);
    wireExtraContactsSection(client);
    loadClientHistory(client.id);
  }
}

// Раздел «Акции» на карточке клиента убран по просьбе пользователя (Фаза 24,
// 09.09.2026) вместе со всей фичей акций — см. withFreshCurrentMonth() в
// src/api.js. Функция renderPromotionsSection() удалена; если понадобится
// вернуть — история реализации в claude/crm-mvp-status.md, Фаза 6/6.1.

// Остаток на складе (stockQty) — бейдж убран по просьбе пользователя (Фаза 24,
// 09.09.2026, «убери остаток кол-во везде где он есть он больше не нужен»).
// Функция оставлена пустой веткой (не удалена совсем), чтобы не трогать вызов
// в assortRow() ниже — если понадобится вернуть бейдж, достаточно откатить эту
// функцию к прежнему виду (см. историю в claude/crm-mvp-status.md, Фаза 6.1/19).
function stockBadgeHtml() {
  return '';
}
function formatQty(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
}

// Артикул товара (Фаза 20) — из справочника номенклатуры, сопоставляется по
// названию товара при импорте (см. src/import.js, articleByName). Не у всех
// товаров он находится (обрезанные/неточные названия в файлах продаж — то же
// ограничение, что и у сопоставления остатков, см. Фазу 6.1) — тогда бейдж
// просто не показывается, а не пишется "нет данных" на каждой строке.
function skuBadgeHtml(p) {
  if (!p.sku) return '';
  return `<span class="sku-badge" title="Артикул">#${escapeHtml(p.sku)}</span> `;
}

// Правка 11.09.2026 (Фаза 27): позиция регулярного ассортимента, уже купленная
// в текущем месяце (atRisk === false — см. computeAtRisk() в src/api.js),
// помечается бейджем «оформлено» прямо в общем списке — чтобы не путать
// с «⚠️ Недопродано» ниже, но и не терять из виду совсем. У тестового
// ассортимента поля atRisk нет вовсе (undefined !== false) — там бейдж не
// показывается, это не тот список, к которому применимо понятие «недопродано».
function assortRow(p) {
  return `
    <div class="assort-row">
      <span>${skuBadgeHtml(p)}${escapeHtml(p.product)} <span class="brand-badge">${escapeHtml(p.brand || 'Прочее')}</span> ${stockBadgeHtml(p)}${p.atRisk === false ? ' <span class="badge badge-yes" title="Уже куплено в этом месяце">оформлено</span>' : ''}</span>
      <span class="freq">${p.monthsCount} из 6 посл. мес · ~${p.avgQty} шт/мес · посл.: ${p.lastMonth}</span>
    </div>
  `;
}

// "Последние продажи" (Фаза 20) — по просьбе пользователя показывает последние
// поставки клиенту. Настоящих номеров/дат отдельных накладных в исходных данных
// нет (проверено — только помесячные суммы по товару в client.monthlyAssortment,
// без разбивки на конкретные документы), поэтому используется согласованный с
// пользователем аналог: последние 3 месяца из тех, где у клиента были продажи,
// с товарами/кол-вом/ценой по каждому. Если позже появится реальная выгрузка с
// номерами/датами документов — эту функцию нужно будет переписать под неё.
function renderRecentSalesSection(client) {
  const monthly = client.monthlyAssortment || {};
  const monthsWithSales = (state.salesMonths || []).filter((m) => (monthly[m] || []).length > 0);
  const last3 = monthsWithSales.slice(-3).reverse(); // от новых к старым
  if (!last3.length) return '';
  return `
    <button type="button" class="assort-btn" id="recent-sales-toggle-${client.id}">🧾 Последние продажи</button>
    <div class="assort-panel" id="recent-sales-panel-${client.id}" style="display:none">
      <div class="muted" style="font-size:12px;margin-bottom:6px">Точных номеров и дат накладных в данных нет — показаны товары за последние ${last3.length} мес. с продажами (не обязательно подряд).</div>
      ${last3.map((m) => {
        const items = monthly[m] || [];
        const total = items.reduce((s, it) => s + (it.revenue || 0), 0);
        return `
          <div class="recent-sale-month">
            <div class="recent-sale-month-heading">${capitalize(m)} — ${fmtMoney(total)}</div>
            ${items.map((it) => `
              <div class="assort-row">
                <span>${skuBadgeHtml(it)}${escapeHtml(it.product)} <span class="brand-badge">${escapeHtml(it.brand || 'Прочее')}</span></span>
                <span class="freq">${formatQty(it.qty)} шт · ${fmtMoney(it.qty ? it.revenue / it.qty : 0)}/шт · ${fmtMoney(it.revenue || 0)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Фильтр по бренду/категории — общий для регулярного, тестового и "не добрал"
// списков, чтобы можно было быстро отделить, скажем, только красители Kapous,
// когда готовишь коммерческое предложение. Правка 02.09.2026: добавлен отдельный
// переключатель "Убрать краски/оксиды" — прячет эту группу из списка независимо
// от того, какой бренд выбран (в т.ч. можно убрать их из "Все" — общего реестра).
function brandFilterBarHtml(items, groupId) {
  const brands = Array.from(new Set(items.map((p) => p.brand || 'Прочее')));
  return `
    <div class="assort-brand-filter" data-group="${groupId}">
      <button type="button" class="brand-chip active" data-brand="all">Все</button>
      ${brands.map((b) => `<button type="button" class="brand-chip" data-brand="${escapeAttr(b)}">${escapeHtml(b)}</button>`).join('')}
      <button type="button" class="brand-chip" data-brand="colorants">Красители/оксиды</button>
      <label class="colorant-exclude-toggle"><input type="checkbox" class="exclude-colorants-cb" data-group="${groupId}"> Убрать краски/оксиды</label>
    </div>
  `;
}

function filterAssortItems(items, brand, excludeColorants) {
  let out = items;
  if (brand && brand !== 'all') {
    out = brand === 'colorants' ? out.filter(isColorantItem) : out.filter((p) => (p.brand || 'Прочее') === brand);
  }
  if (excludeColorants) out = out.filter((p) => !isColorantItem(p));
  return out;
}

function renderAssortmentSection(client) {
  const items = client.regularAssortment || [];
  if (!items.length) return '';
  return `
    <button type="button" class="assort-btn" id="assort-toggle-${client.id}">🛒 Регулярный ассортимент (${items.length})</button>
    <div class="assort-panel" id="assort-panel-${client.id}" style="display:none">
      ${brandFilterBarHtml(items, `assort-${client.id}`)}
      <div id="assort-body-${client.id}"></div>
    </div>
  `;
}

// Тестовый ассортимент — товары, купленные хотя бы раз, но не дотянувшие до
// регулярного (разовые/пробные покупки). Отдельный список от регулярного ассортимента.
function renderTestAssortmentSection(client) {
  const items = client.testAssortment || [];
  if (!items.length) return '';
  return `
    <button type="button" class="assort-btn assort-btn-test" id="test-assort-toggle-${client.id}">🧪 Тестовый ассортимент (${items.length})</button>
    <div class="assort-panel" id="test-assort-panel-${client.id}" style="display:none">
      ${brandFilterBarHtml(items, `test-assort-${client.id}`)}
      <div id="test-assort-body-${client.id}"></div>
    </div>
  `;
}

// Краски и оксиды — отдельная видимая группа внутри регулярного/тестового
// ассортимента (по просьбе пользователя), а не просто пункт фильтра по бренду.
// В разделе "риск отвала" (не добрал) такого разделения нет — там остаётся
// единый список, как раньше.
function isColorantItem(p) { return p.category === 'Краситель' || p.category === 'Оксид'; }

function renderGroupedAssort(items) {
  if (!items.length) return '<div class="muted" style="font-size:13px;padding:4px 0">Нет позиций по этому фильтру.</div>';
  const colorants = items.filter(isColorantItem);
  const others = items.filter((p) => !isColorantItem(p));
  return `
    ${others.length ? others.map(assortRow).join('') : ''}
    ${colorants.length ? `
      <div class="assort-group-heading">🎨 Краски и оксиды</div>
      ${colorants.map(assortRow).join('')}
    ` : ''}
  `;
}

function renderAssortBody(items, brand, mode, excludeColorants) {
  const filtered = filterAssortItems(items, brand, excludeColorants);
  if (mode === 'regular') {
    const normal = filtered.filter((p) => !p.atRisk);
    const risky = filtered.filter((p) => p.atRisk);
    return `
      ${normal.length ? renderGroupedAssort(normal) : '<div class="muted" style="font-size:13px;padding:4px 0">Нет позиций по этому фильтру.</div>'}
      ${risky.length ? `
        <div class="assort-risk-heading">⚠️ Недопродано — ещё не покупали в текущем месяце</div>
        ${risky.map(assortRow).join('')}
      ` : ''}
    `;
  }
  if (mode === 'test') return renderTestByMonth(filtered);
  return renderGroupedAssort(filtered);
}

// 09.10.2026 (восстановлено): тестовый ассортимент — группами по месяцу последней
// покупки, от ближайшего к текущей дате. Купленное в текущем месяце — группой
// текущего месяца. Внутри группы — по выручке.
const ASSORT_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
function monthRecency(name) {
  const i = ASSORT_MONTHS.indexOf(String(name || '').toLowerCase());
  if (i < 0) return 99;
  const cur = new Date().getMonth();
  return (cur - i + 12) % 12; // 0 = текущий месяц, 1 = прошлый, ...
}
function renderTestByMonth(items) {
  if (!items.length) return '<div class="muted" style="font-size:13px;padding:4px 0">Нет позиций по этому фильтру.</div>';
  const curName = ASSORT_MONTHS[new Date().getMonth()];
  const groups = new Map();
  items.forEach((p) => {
    const m = p.boughtThisMonth ? curName : (p.lastMonth || 'месяц не указан');
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(p);
  });
  return [...groups.entries()]
    .sort((a, b) => monthRecency(a[0]) - monthRecency(b[0]))
    .map(([m, list]) => `
      <div class="assort-group-heading">📅 ${escapeHtml(m.charAt(0).toUpperCase() + m.slice(1))}${m === curName ? ' (текущий месяц)' : ''} · ${list.length}</div>
      ${list.slice().sort((a, b) => (b.revenue || 0) - (a.revenue || 0)).map(assortRow).join('')}`)
    .join('');
}

function wireBrandFilter(groupId, items, bodyElId, mode) {
  const bar = document.querySelector(`.assort-brand-filter[data-group="${groupId}"]`);
  const body = document.getElementById(bodyElId);
  if (!bar || !body) return;
  let currentBrand = 'all';
  const excludeCb = bar.querySelector('.exclude-colorants-cb');
  body.innerHTML = renderAssortBody(items, currentBrand, mode, false);
  bar.querySelectorAll('.brand-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentBrand = chip.dataset.brand;
      bar.querySelectorAll('.brand-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      body.innerHTML = renderAssortBody(items, currentBrand, mode, excludeCb && excludeCb.checked);
    });
  });
  // "Убрать краски/оксиды" (02.09.2026) — независимый переключатель, сочетается
  // с любым выбранным брендом (в т.ч. с "Все" — прячет их из общего реестра).
  if (excludeCb) {
    excludeCb.addEventListener('change', () => {
      body.innerHTML = renderAssortBody(items, currentBrand, mode, excludeCb.checked);
    });
  }
}

// Скрипты, вставленные через innerHTML/template, браузер не выполняет —
// поэтому переключатели ассортимента навешиваются явным addEventListener
// после того, как модалка реально попала в DOM (см. вызовы в openClientModal/openTaskModal).
function wireToggle(btnId, panelId) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
}
function wireAssortmentToggle(clientId) {
  const client = clientById(clientId);
  wireToggle(`assort-toggle-${clientId}`, `assort-panel-${clientId}`);
  wireToggle(`test-assort-toggle-${clientId}`, `test-assort-panel-${clientId}`);
  wireToggle(`recent-sales-toggle-${clientId}`, `recent-sales-panel-${clientId}`);
  if (client) {
    wireBrandFilter(`assort-${clientId}`, client.regularAssortment || [], `assort-body-${clientId}`, 'regular');
    const boughtNow = new Set((client.currentMonthItems || []).map((it) => String(it.product || '').trim().toLowerCase()));
    const testItems = (client.testAssortment || []).map((p) => ({ ...p, boughtThisMonth: boughtNow.has(String(p.product || '').trim().toLowerCase()) }));
    wireBrandFilter(`test-assort-${clientId}`, testItems, `test-assort-body-${clientId}`, 'test');
  }
}

async function loadClientHistory(clientId) {
  const box = document.getElementById('history-section');
  if (!box) return;
  try {
    const res = await api('GET', `/api/clients/${clientId}/history`);
    if (!res.tasks.length) {
      box.innerHTML = '<h3>История визитов</h3><div class="muted">Задач по этому клиенту ещё не было.</div>';
      return;
    }
    box.innerHTML = '<h3>История визитов</h3>' + res.tasks.map((t) => `
      <div class="history-row">
        <div><strong>${stageLabel(t.stage)}</strong> — ${escapeHtml(t.title)}</div>
        <div class="muted">${fmtDateTime(t.updatedAt || t.createdAt)} · ${escapeHtml(userName(t.assigneeId))}</div>
        ${t.comment ? `<div class="comment">${escapeHtml(t.comment)}</div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    box.innerHTML = '<h3>История визитов</h3><div class="muted">Не удалось загрузить.</div>';
  }
}

// П.3 бэклога (08.09.2026): время визита — диапазон «от–до» вместо одного
// значения (visitTime — «от», visitTimeTo — «до», см. src/api.js). Задачи,
// созданные до этой правки, могут иметь только visitTime (без visitTimeTo) —
// показываем как есть, без тире.
function visitTimeLabel(t) {
  if (!t.visitTime) return '';
  return t.visitTimeTo ? `${t.visitTime}–${t.visitTimeTo}` : t.visitTime;
}

function stageLabel(key) {
  const s = state.stages.find((s) => s.key === key);
  return s ? s.label : key;
}

// Общий для всех трёх воронок задач (визиты/продажи/лист ожидания) фильтр —
// поиск клиента (п.2 бэклога) и «есть заявка на перенос даты» (п.8 бэклога).
// Вынесено в отдельную функцию, чтобы не дублировать в трёх render*Kanban().
function matchesTaskListFilters(t) {
  if (state.onlyDateChangeRequest && !t.dateChangeRequest) return false;
  if (state.onlyOverdue && !isTaskOverdue(t)) return false;
  if (state.taskFilterOwnerId && String(t.assigneeId) !== String(state.taskFilterOwnerId)) return false;
  const q = (state.taskClientSearch || '').trim().toLowerCase();
  if (q) {
    const client = clientById(t.clientId);
    const hay = `${client ? client.name : ''} ${client ? (client.phone || '') : ''} ${t.title || ''}`.toLowerCase();
    if (!hay.includes(q) && !clientMatchesPhone(client, q)) return false;
  }
  return true;
}

// ---------- Задачи (доска) ----------

function taskTagBadges(t) {
  return (t.tags || []).map((tag) => `<span class="badge tag-badge">${escapeHtml(tag)}</span>`).join(' ');
}

function renderTasks(content) {
  const bulk = state.taskBulkMode;
  // Правка 31.08.2026 (п.2): порядок воронок — продажи → лист ожидания → визиты
  // (был: визиты → продажи → лист ожидания); по умолчанию открывается первая — продажи.
  const typeView = state.taskTypeView || 'sale';
  content.appendChild(el(`
    <div>
      <div class="toolbar">
        <h2 style="margin:0">Задачи по клиентам</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isStaff() ? `<button type="button" class="btn-secondary ${bulk ? 'active' : ''}" id="task-bulk-mode-btn">${bulk ? 'Отменить выбор' : 'Выбрать несколько'}</button>` : ''}
          ${isStaff() ? `
            <a class="btn-secondary" href="/api/tasks/export" download>⬇ Выгрузить задачи в файл</a>
            <button type="button" class="btn-secondary" id="task-import-btn">⬆ Загрузить задачи из файла</button>
            <input type="file" id="task-import-input" accept=".json" style="display:none">
          ` : ''}
          <button class="btn-primary" id="add-task-btn">+ Новая задача</button>
        </div>
      </div>
      <div class="filter-bar">
        <button type="button" class="btn-secondary ${typeView === 'sale' ? 'active' : ''}" id="task-type-sale-btn">Воронка продаж</button>
        <button type="button" class="btn-secondary ${typeView === 'waitlist' ? 'active' : ''}" id="task-type-waitlist-btn">Лист ожидания</button>
        <button type="button" class="btn-secondary ${typeView === 'visit' ? 'active' : ''}" id="task-type-visit-btn">Визиты с супервайзером</button>
        <button type="button" class="btn-secondary ${typeView === 'agent' ? 'active' : ''}" id="task-type-agent-btn">Задачи агенту</button>
        <button type="button" class="btn-secondary ${typeView === 'checkin' ? 'active' : ''}" id="task-type-checkin-btn">Посещения</button>
      </div>
      <div class="filter-bar">
        <input type="text" id="task-client-filter" placeholder="Поиск: клиент, номер телефона..." value="${escapeAttr(state.taskClientSearch || '')}" style="max-width:260px">
        ${isStaff() && typeView !== 'checkin' ? `<select id="task-filter-ownerId">
          <option value="">Агент: все</option>
          ${state.users.filter((u) => u.role === 'agent').map((u) => `<option value="${u.id}" ${String(state.taskFilterOwnerId) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}
        </select>` : ''}
        <label class="filter-check"><input type="checkbox" id="filter-onlyOverdue" ${state.onlyOverdue ? 'checked' : ''}> Просроченные</label>
        <label class="filter-check"><input type="checkbox" id="filter-onlyDateChangeRequest" ${state.onlyDateChangeRequest ? 'checked' : ''}> Есть заявка на перенос даты</label>
      </div>
      ${typeView === 'visit' ? `
      <div class="filter-bar">
        <span class="muted" style="font-size:13px">Фильтр по тегам:</span>
        ${state.taskTags.map((tag) => `<button type="button" class="tag-filter-btn ${state.taskTagFilter.has(tag) ? 'active' : ''}" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join('')}
        ${state.taskTagFilter.size ? '<button type="button" class="link-btn" id="tag-filter-reset">Сбросить</button>' : ''}
      </div>` : typeView === 'sale' ? `
      <div class="filter-bar">
        <span class="muted" style="font-size:13px">Фильтр по тегам:</span>
        ${state.saleTags.map((tag) => `<button type="button" class="tag-filter-btn sale-tag-filter-btn ${state.saleTagFilter.has(tag) ? 'active' : ''}" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join('')}
        ${state.saleTagFilter.size ? '<button type="button" class="link-btn" id="sale-tag-filter-reset">Сбросить</button>' : ''}
      </div>
      ` : typeView === 'waitlist' ? `
      <div class="sub muted" style="margin-bottom:6px">Клиент ждёт товар → Накладная оформлена → Товар получен клиентом (закрытая — подтверждает администратор/супервайзер).</div>
      <div class="filter-bar">
        <span class="muted" style="font-size:13px">Фильтр по тегам:</span>
        ${(state.waitlistTags || []).map((tag) => `<button type="button" class="tag-filter-btn waitlist-tag-filter-btn ${state.waitlistTagFilter.has(tag) ? 'active' : ''}" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join('')}
        ${state.waitlistTagFilter.size ? '<button type="button" class="link-btn" id="waitlist-tag-filter-reset">Сбросить</button>' : ''}
      </div>
      ` : typeView === 'checkin' ? `
      <div class="sub muted" style="margin-bottom:6px">Кнопка «Создать задачи» ставит «Посещение» на выбранную дату всем клиентам агента, у кого день визита — день недели этой даты (повторно не дублирует). Закрываются кнопкой «📍 Отметить посещение». Срок — до 20:00.</div>
      <div class="filter-bar">
        <label class="muted" style="margin:0">с <input type="date" id="checkin-date" value="${escapeAttr(state.checkinDate || new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10))}"></label>
        <label class="muted" style="margin:0">по <input type="date" id="checkin-date-to" value="${escapeAttr(state.checkinDateTo || state.checkinDate || new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10))}"></label>
        ${isStaff() ? `<select id="checkin-gen-agent" title="Фильтр доски и агент для создания задач"><option value="">Все агенты</option>${state.users.filter((u) => u.role === 'agent').map((u) => `<option value="${u.id}" ${String(state.taskFilterOwnerId || '') === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select>` : ''}
        <button type="button" class="btn-primary" id="checkin-generate-btn">+ Создать задачи на посещения</button>
      </div>
      ` : `
      <div class="sub muted" style="margin-bottom:6px">Задачи, не привязанные к клиенту — напоминания и поручения агенту напрямую (например, сдать отчёт, забрать образцы и т.п.).</div>
      `}
      ${bulk ? `<div class="filter-bar task-bulk-bar">
        <span class="muted" style="font-size:13px">Выбрано: <b id="task-bulk-count">${state.taskBulkSelected.size}</b></span>
        <span class="muted" style="font-size:12px">(отметьте карточки или «все» в заголовке колонки)</span>
        <select id="task-bulk-stage"><option value="">Перенести в стадию…</option>${taskBoardStages(typeView).map((st) => `<option value="${st.key}">${escapeHtml(st.label)}</option>`).join('')}</select>
        <button type="button" class="btn-primary" id="task-bulk-move-btn">Перенести</button>
        <button type="button" class="btn-secondary" id="task-bulk-delete-btn">🗑 Удалить выбранные</button>
      </div>` : ''}
      <div class="kanban ${typeView === 'sale' ? 'sale-board' : ''}" id="kanban"></div>
    </div>
  `));
  document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal(null, typeView));
  // Экспорт/импорт задач файлом (п.11, 31.08.2026) — на случай пересборки проекта,
  // после которой data/db.json не переносится и все задачи теряются. "Выгрузить" —
  // просто ссылка на скачивание (сессия и так авторизована через cookie). "Загрузить"
  // читает выбранный файл на клиенте и шлёт его содержимое на /api/tasks/import —
  // сервер сам сопоставит клиентов/агентов по имени и пропустит дубли/нераспознанное.
  const taskImportBtn = document.getElementById('task-import-btn');
  const taskImportInput = document.getElementById('task-import-input');
  if (taskImportBtn && taskImportInput) {
    taskImportBtn.addEventListener('click', () => taskImportInput.click());
    taskImportInput.addEventListener('change', async () => {
      const file = taskImportInput.files[0];
      if (!file) return;
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch (e) {
        alert('Не удалось прочитать файл — это не корректный JSON');
        taskImportInput.value = '';
        return;
      }
      try {
        const result = await api('POST', '/api/tasks/import', { tasks: parsed.tasks || [] });
        let msg = `Загружено новых задач: ${result.imported}.\nПропущено (уже есть): ${result.skippedDuplicate}.`;
        if (result.unresolvedCount) {
          msg += `\nНе удалось распознать: ${result.unresolvedCount} (клиент не найден в текущей базе) — список в консоли браузера.`;
          console.log('Не распознано при импорте задач:', result.unresolved);
        }
        alert(msg);
        await loadAll();
        render();
      } catch (e) {
        alert('Ошибка загрузки: ' + e.message);
      }
      taskImportInput.value = '';
    });
  }
  // Поиск клиента на странице «Задачи» (п.2 бэклога) — тот же паттерн сохранения
  // курсора при перерисовке, что и у поиска на странице «Клиенты» (см. renderClients).
  const taskClientFilterInput = document.getElementById('task-client-filter');
  if (taskClientFilterInput) taskClientFilterInput.addEventListener('input', (e) => {
    const cursorPos = e.target.selectionStart;
    state.taskClientSearch = e.target.value;
    render();
    const refreshed = document.getElementById('task-client-filter');
    if (refreshed) {
      refreshed.focus();
      refreshed.setSelectionRange(cursorPos, cursorPos);
    }
  });
  const dateChangeFilterCb = document.getElementById('filter-onlyDateChangeRequest');
  if (dateChangeFilterCb) dateChangeFilterCb.addEventListener('change', (e) => { state.onlyDateChangeRequest = e.target.checked; render(); });
  const taskOwnerSel = document.getElementById('task-filter-ownerId');
  if (taskOwnerSel) taskOwnerSel.addEventListener('change', (e) => { state.taskFilterOwnerId = e.target.value; render(); });
  const overdueFilterCb = document.getElementById('filter-onlyOverdue');
  if (overdueFilterCb) overdueFilterCb.addEventListener('change', (e) => { state.onlyOverdue = e.target.checked; render(); });
  document.getElementById('task-type-visit-btn').addEventListener('click', () => { state.taskTypeView = 'visit'; render(); });
  document.getElementById('task-type-sale-btn').addEventListener('click', () => { state.taskTypeView = 'sale'; render(); });
  document.getElementById('task-type-waitlist-btn').addEventListener('click', () => { state.taskTypeView = 'waitlist'; render(); });
  document.getElementById('task-type-agent-btn').addEventListener('click', () => { state.taskTypeView = 'agent'; render(); });
  document.getElementById('task-type-checkin-btn').addEventListener('click', () => { state.taskTypeView = 'checkin'; render(); });
  const checkinDateInput = document.getElementById('checkin-date');
  // 29.09.2026: период «с — по» вместо одного дня (и для доски, и для создания задач).
  if (checkinDateInput) checkinDateInput.addEventListener('change', (e) => {
    state.checkinDate = e.target.value;
    if (!state.checkinDateTo || state.checkinDateTo < state.checkinDate) state.checkinDateTo = state.checkinDate;
    render();
  });
  const checkinDateToInput = document.getElementById('checkin-date-to');
  if (checkinDateToInput) checkinDateToInput.addEventListener('change', (e) => {
    if (!state.checkinDate) state.checkinDate = document.getElementById('checkin-date').value;
    state.checkinDateTo = e.target.value;
    if (!state.checkinDate || state.checkinDate > state.checkinDateTo) state.checkinDate = state.checkinDateTo;
    render();
  });
  const checkinGenAgent = document.getElementById('checkin-gen-agent');
  // 29.09.2026: на «Посещениях» один выбор агента — он и фильтрует доску, и
  // задаёт агента для «Создать задачи» (жалоба «фильтр по агентам не работает»:
  // раньше этот список влиял только на создание, а доску фильтровал другой).
  if (checkinGenAgent) checkinGenAgent.addEventListener('change', (e) => { state.taskFilterOwnerId = e.target.value; render(); });
  const checkinGenBtn = document.getElementById('checkin-generate-btn');
  if (checkinGenBtn) checkinGenBtn.addEventListener('click', async () => {
    const dateFrom = document.getElementById('checkin-date').value;
    const dateTo = document.getElementById('checkin-date-to').value || dateFrom;
    const agentSel = document.getElementById('checkin-gen-agent');
    const agentId = agentSel ? agentSel.value : '';
    const who = agentSel ? (agentId ? agentSel.options[agentSel.selectedIndex].text : 'всех агентов') : 'себя';
    const fmt = (d) => d.split('-').reverse().join('.');
    if (!confirm(`Создать задачи «Посещение» ${dateFrom === dateTo ? 'на ' + fmt(dateFrom) : `с ${fmt(dateFrom)} по ${fmt(dateTo)}`} для: ${who}?`)) return;
    checkinGenBtn.disabled = true;
    try {
      const r = await api('POST', '/api/tasks/checkin-generate', { dateFrom, dateTo, agentId: agentId || null });
      state.checkinDate = dateFrom; state.checkinDateTo = dateTo;
      showToast(`Создано задач — ${r.created}${r.skipped ? `, уже были — ${r.skipped}` : ''} (${r.days} дн.)`, r.created ? 'ok' : 'warn');
      await loadAll();
      render();
    } catch (e) { showToast(e.message, 'warn'); checkinGenBtn.disabled = false; }
  });
  const taskBulkModeBtn = document.getElementById('task-bulk-mode-btn');
  if (taskBulkModeBtn) taskBulkModeBtn.addEventListener('click', () => { state.taskBulkMode = !state.taskBulkMode; state.taskBulkSelected = new Set(); render(); });
  const taskBulkDeleteBtn = document.getElementById('task-bulk-delete-btn');
  if (taskBulkDeleteBtn) taskBulkDeleteBtn.addEventListener('click', async () => {
    if (!state.taskBulkSelected.size) return alert('Не выбрано ни одной задачи');
    if (!confirm(`Удалить ${state.taskBulkSelected.size} задач(и)?`)) return;
    await api('POST', '/api/tasks/bulk-delete', { ids: Array.from(state.taskBulkSelected) });
    state.taskBulkMode = false;
    state.taskBulkSelected = new Set();
    await loadAll();
    render();
  });

  content.querySelectorAll('.tag-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (state.taskTagFilter.has(tag)) state.taskTagFilter.delete(tag);
      else state.taskTagFilter.add(tag);
      render();
    });
  });
  const tagResetBtn = document.getElementById('tag-filter-reset');
  if (tagResetBtn) tagResetBtn.addEventListener('click', () => { state.taskTagFilter = new Set(); render(); });

  content.querySelectorAll('.sale-tag-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (state.saleTagFilter.has(tag)) state.saleTagFilter.delete(tag);
      else state.saleTagFilter.add(tag);
      render();
    });
  });
  const saleTagResetBtn = document.getElementById('sale-tag-filter-reset');
  if (saleTagResetBtn) saleTagResetBtn.addEventListener('click', () => { state.saleTagFilter = new Set(); render(); });

  content.querySelectorAll('.waitlist-tag-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (state.waitlistTagFilter.has(tag)) state.waitlistTagFilter.delete(tag);
      else state.waitlistTagFilter.add(tag);
      render();
    });
  });
  const waitlistTagResetBtn = document.getElementById('waitlist-tag-filter-reset');
  if (waitlistTagResetBtn) waitlistTagResetBtn.addEventListener('click', () => { state.waitlistTagFilter = new Set(); render(); });

  const taskBulkMoveBtn = document.getElementById('task-bulk-move-btn');
  if (taskBulkMoveBtn) taskBulkMoveBtn.addEventListener('click', async () => {
    const stage = document.getElementById('task-bulk-stage').value;
    if (!stage) return alert('Выберите стадию, куда перенести');
    const ids = Array.from(state.taskBulkSelected).filter((id) => { const t = state.tasks.find((x) => x.id === id); return t && t.stage !== stage; });
    if (!ids.length) return alert('Не выбрано ни одной задачи (или все уже в этой стадии)');
    const label = (taskBoardStages(typeView).find((x) => x.key === stage) || {}).label || stage;
    if (!confirm(`Перенести ${ids.length} задач(и) в «${label}»?`)) return;
    taskBulkMoveBtn.disabled = true;
    const errors = {};
    let ok = 0;
    // По одной задаче через обычное сохранение — те же правила, что при перетаскивании
    // (например, в «Выполнена» без отчёта не переносится).
    for (let i = 0; i < ids.length; i += 5) {
      await Promise.all(ids.slice(i, i + 5).map(async (id) => {
        try { await api('PUT', `/api/tasks/${id}`, { stage }); ok++; } catch (e) { errors[e.message] = (errors[e.message] || 0) + 1; }
      }));
      taskBulkMoveBtn.textContent = `Переношу… ${Math.min(i + 5, ids.length)}/${ids.length}`;
    }
    state.taskBulkSelected = new Set();
    await loadAll();
    render();
    const errText = Object.entries(errors).map(([m, n]) => `${n} — ${m}`).join('\n');
    if (errText) alert(`Перенесено: ${ok}. Не перенесены:\n${errText}`); else showToast(`Перенесено задач: ${ok}`, 'ok');
  });

  if (typeView === 'sale') renderSaleKanban();
  else if (typeView === 'waitlist') renderWaitlistKanban();
  else if (typeView === 'agent') renderAgentTasksKanban();
  else if (typeView === 'checkin') renderCheckinKanban();
  else renderVisitKanban(bulk);
  enhanceKanbanBulk(typeView);
}

// 26.10.2026: стадии текущей доски задач (для группового переноса).
function taskBoardStages(typeView) {
  if (typeView === 'waitlist') return state.waitlistStages || [];
  if (typeView === 'checkin') return [{ key: 'in_progress', label: 'Ждёт отметки' }, { key: 'done', label: 'Отмечено' }, { key: 'not_done', label: 'Не выполнена' }];
  return state.stages || [];
}

// 26.10.2026: групповые действия на любой доске задач (админ/супервайзер):
// галочки на карточках и «все» в заголовке колонки в режиме «Выбрать несколько»,
// в колонке «Архив» — «Очистить архив» (удаляет все видимые в ней задачи по текущим фильтрам).
function enhanceKanbanBulk(typeView) {
  const kanban = document.getElementById('kanban');
  if (!kanban || !isStaff()) return;
  const bulk = state.taskBulkMode;
  const updCount = () => { const c = document.getElementById('task-bulk-count'); if (c) c.textContent = state.taskBulkSelected.size; };
  // Выбор действует только на то, что видно на доске (сменили воронку или фильтр — лишнее снимается).
  const visible = new Set([...kanban.querySelectorAll('.deal-card[data-id]')].map((c) => Number(c.dataset.id)));
  state.taskBulkSelected = new Set([...state.taskBulkSelected].filter((id) => visible.has(id)));
  updCount();
  kanban.querySelectorAll('.kanban-col').forEach((col) => {
    const cards = [...col.querySelectorAll('.deal-card[data-id]')];
    const ids = cards.map((c) => Number(c.dataset.id));
    const h3 = col.querySelector('h3');
    if (bulk) {
      cards.forEach((card) => {
        const id = Number(card.dataset.id);
        let cb = card.querySelector('.task-bulk-check');
        if (!cb) { cb = el(`<input type="checkbox" class="bulk-check task-bulk-check" data-id="${id}">`); card.prepend(cb); }
        cb.checked = state.taskBulkSelected.has(id);
        card.classList.toggle('bulk-selected', cb.checked);
      });
      if (h3 && ids.length) {
        const all = el(`<label class="col-select-all" title="Выбрать все задачи этой колонки (по текущим фильтрам)"><input type="checkbox"> все</label>`);
        const allCb = all.querySelector('input');
        allCb.checked = ids.every((id) => state.taskBulkSelected.has(id));
        allCb.addEventListener('change', () => {
          ids.forEach((id) => (allCb.checked ? state.taskBulkSelected.add(id) : state.taskBulkSelected.delete(id)));
          cards.forEach((card) => { const cb = card.querySelector('.task-bulk-check'); if (cb) cb.checked = allCb.checked; card.classList.toggle('bulk-selected', allCb.checked); });
          updCount();
        });
        h3.appendChild(all);
      }
    }
    if (col.dataset.stage === 'archive' && h3 && ids.length) {
      const clr = el(`<button type="button" class="link-btn col-clear-btn" title="Удалить все задачи в этой колонке (по текущим фильтрам)">🗑 очистить</button>`);
      clr.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить ВСЕ ${ids.length} задач(и) из колонки «Архив»${state.taskFilterOwnerId || state.taskClientSearch ? ' (по текущим фильтрам)' : ''}?\n\nУдаление нельзя отменить.`)) return;
        try { const r = await api('POST', '/api/tasks/bulk-delete', { ids }); showToast(`Удалено задач: ${r.removed}`, 'ok'); } catch (err) { alert(err.message); }
        state.taskBulkSelected = new Set();
        await loadAll();
        render();
      });
      h3.appendChild(clr);
    }
  });
  if (bulk) {
    // В режиме выбора клик по карточке ставит/снимает галочку, а не открывает задачу.
    kanban.addEventListener('click', (e) => {
      const card = e.target.closest('.deal-card[data-id]');
      if (!card) return;
      e.stopPropagation();
      if (e.target.closest('button')) { e.preventDefault(); }
      const id = Number(card.dataset.id);
      const cb = card.querySelector('.task-bulk-check');
      const on = e.target === cb ? cb.checked : !state.taskBulkSelected.has(id);
      if (on) state.taskBulkSelected.add(id); else state.taskBulkSelected.delete(id);
      if (cb) cb.checked = on;
      card.classList.toggle('bulk-selected', on);
      updCount();
    }, true);
  }
}

function renderVisitKanban(bulk) {

  const today = new Date().toISOString().slice(0, 10);
  const kanban = document.getElementById('kanban');
  state.stages.forEach((stage) => {
    let inStage = state.tasks.filter((t) => (t.taskType || 'visit') === 'visit' && t.stage === stage.key);
    if (state.taskTagFilter.size) {
      inStage = inStage.filter((t) => (t.tags || []).some((tag) => state.taskTagFilter.has(tag)));
    }
    inStage = inStage.filter(matchesTaskListFilters);
    const col = el(`
      <div class="kanban-col" data-stage="${stage.key}">
        <h3>${stage.label} <span class="col-sum">· ${inStage.length}</span></h3>
        <div class="col-body"></div>
      </div>
    `);
    const colBody = col.querySelector('.col-body');
    inStage.forEach((t) => {
      const client = clientById(t.clientId);
      const overdue = isTaskOverdue(t);
      const card = el(`
        <div class="deal-card" draggable="true" data-id="${t.id}">
          <div class="deal-title">${escapeHtml(t.title)}</div>
          <div class="deal-client">${client ? escapeHtml(client.name) : '—'}</div>
          <div class="deal-client">${agentTag(t.assigneeId)} ${t.dueDate ? '· ' + fmtDate(t.dueDate) : ''}${visitTimeLabel(t) ? ' · ' + escapeHtml(visitTimeLabel(t)) : ''} ${overdue ? '<span class="badge badge-overdue">просрочено</span>' : ''} ${t.report ? '<span class="report-check" title="Отчёт заполнен">✓ отчёт</span>' : ''}</div>
          ${t.dateChangeRequest ? '<div class="badge badge-amber" style="margin-top:4px">заявка на перенос даты</div>' : ''}
          ${taskTagBadges(t) ? `<div class="card-tags">${taskTagBadges(t)}</div>` : ''}
          ${attachBadgeHtml(t)}
        </div>
      `);
      card.addEventListener('click', () => { if (!bulk) openTaskModal(t); });
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', t.id));
      colBody.appendChild(card);
    });
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      await api('PUT', `/api/tasks/${id}`, { stage: stage.key });
      await loadAll();
      render();
    });
    kanban.appendChild(col);
  });
}

// ---------- Продажа: с Фазы 22 — обычная односложная задача по клиенту (без
// отдельных этапов "звонок/встреча/сделка/провал"), только со своим набором
// тегов (бренды + "Договор", state.saleTags) — доска устроена так же, как у
// визитов (state.stages), просто отфильтрована по taskType === 'sale'. ----------

function renderSaleKanban() {
  const kanban = document.getElementById('kanban');
  const today = new Date().toISOString().slice(0, 10);
  state.stages.forEach((stage) => {
    let inStage = state.tasks.filter((t) => t.taskType === 'sale' && t.stage === stage.key);
    if (state.saleTagFilter.size) {
      inStage = inStage.filter((t) => (t.tags || []).some((tag) => state.saleTagFilter.has(tag)));
    }
    inStage = inStage.filter(matchesTaskListFilters);
    const col = el(`
      <div class="kanban-col" data-stage="${stage.key}">
        <h3>${escapeHtml(stage.label)} <span class="col-sum">· ${inStage.length}</span></h3>
        <div class="col-body"></div>
      </div>
    `);
    const colBody = col.querySelector('.col-body');
    inStage.forEach((t) => {
      const client = clientById(t.clientId);
      const overdue = isTaskOverdue(t);
      const card = el(`
        <div class="deal-card" draggable="true" data-id="${t.id}">
          <div class="deal-title">${escapeHtml(t.title)}</div>
          <div class="deal-client">${client ? escapeHtml(client.name) : '—'}</div>
          <div class="deal-client">${agentTag(t.assigneeId)} ${t.dueDate ? '· ' + fmtDate(t.dueDate) : ''} ${overdue ? '<span class="badge badge-overdue">просрочено</span>' : ''} ${t.report ? '<span class="report-check" title="Отчёт заполнен">✓ отчёт</span>' : ''}</div>
          ${t.dateChangeRequest ? '<div class="badge badge-amber" style="margin-top:4px">заявка на перенос даты</div>' : ''}
          ${taskTagBadges(t) ? `<div class="card-tags">${taskTagBadges(t)}</div>` : ''}
          ${attachBadgeHtml(t)}
        </div>
      `);
      card.addEventListener('click', () => openTaskModal(t));
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', t.id));
      colBody.appendChild(card);
    });
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const draggedTask = state.tasks.find((x) => String(x.id) === String(id));
      // В "Выполнена" нельзя перетащить без заполненного отчёта — открываем
      // карточку задачи, где есть это поле, вместо прямого переноса.
      if (draggedTask && stage.key === 'done' && draggedTask.stage !== 'done' && !String(draggedTask.report || '').trim()) {
        openTaskModal(draggedTask);
        return;
      }
      try {
        await api('PUT', `/api/tasks/${id}`, { stage: stage.key });
        await loadAll();
        render();
      } catch (err) { alert(err.message); }
    });
    kanban.appendChild(col);
  });
}

// ---------- Воронка "Лист ожидания": клиент ждёт товар → накладная → получен ----------

function renderWaitlistKanban() {
  const kanban = document.getElementById('kanban');
  const stages = state.waitlistStages || [];
  const today = new Date().toISOString().slice(0, 10);
  stages.forEach((stage) => {
    let inStage = state.tasks.filter((t) => t.taskType === 'waitlist' && t.stage === stage.key);
    if (state.waitlistTagFilter.size) {
      inStage = inStage.filter((t) => (t.tags || []).some((tag) => state.waitlistTagFilter.has(tag)));
    }
    inStage = inStage.filter(matchesTaskListFilters);
    const col = el(`
      <div class="kanban-col" data-stage="${stage.key}">
        <h3>${escapeHtml(stage.label)} <span class="col-sum">· ${inStage.length}</span></h3>
        <div class="col-body"></div>
      </div>
    `);
    const colBody = col.querySelector('.col-body');
    inStage.forEach((t) => {
      const client = clientById(t.clientId);
      const overdue = isTaskOverdue(t);
      const card = el(`
        <div class="deal-card" draggable="true" data-id="${t.id}">
          <div class="deal-title">${escapeHtml(t.title)}</div>
          <div class="deal-client">${client ? escapeHtml(client.name) : '—'}</div>
          <div class="deal-client">${agentTag(t.assigneeId)} ${t.dueDate ? '· ' + fmtDate(t.dueDate) : ''} ${overdue ? '<span class="badge badge-overdue">просрочено</span>' : ''}</div>
          ${t.dateChangeRequest ? '<div class="badge badge-amber" style="margin-top:4px">заявка на перенос даты</div>' : ''}
          ${taskTagBadges(t) ? `<div class="card-tags">${taskTagBadges(t)}</div>` : ''}
          ${attachBadgeHtml(t)}
        </div>
      `);
      card.addEventListener('click', () => openTaskModal(t));
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', t.id));
      colBody.appendChild(card);
    });
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      try {
        await api('PUT', `/api/tasks/${id}`, { stage: stage.key });
        await loadAll();
        render();
      } catch (err) { alert(err.message); }
    });
    kanban.appendChild(col);
  });
}

// ---------- Воронка "Задачи агенту" (п.6 бэклога, 08.09.2026): задачи без
// привязки к клиенту (taskType === 'agent', clientId === null) — напоминания
// и поручения агенту напрямую. Использует общие этапы TASK_STAGES (state.stages),
// как и визиты, но без клиента/времени визита/тегов. ----------

function renderAgentTasksKanban() {
  const kanban = document.getElementById('kanban');
  const today = new Date().toISOString().slice(0, 10);
  state.stages.forEach((stage) => {
    let inStage = state.tasks.filter((t) => t.taskType === 'agent' && t.stage === stage.key);
    inStage = inStage.filter(matchesTaskListFilters);
    const col = el(`
      <div class="kanban-col" data-stage="${stage.key}">
        <h3>${escapeHtml(stage.label)} <span class="col-sum">· ${inStage.length}</span></h3>
        <div class="col-body"></div>
      </div>
    `);
    const colBody = col.querySelector('.col-body');
    inStage.forEach((t) => {
      const overdue = isTaskOverdue(t);
      const card = el(`
        <div class="deal-card" draggable="true" data-id="${t.id}">
          <div class="deal-title">${escapeHtml(t.title)}</div>
          <div class="deal-client">${agentTag(t.assigneeId)} ${t.dueDate ? '· ' + fmtDate(t.dueDate) : ''} ${overdue ? '<span class="badge badge-overdue">просрочено</span>' : ''} ${t.report ? '<span class="report-check" title="Отчёт заполнен">✓ отчёт</span>' : ''}</div>
          ${t.dateChangeRequest ? '<div class="badge badge-amber" style="margin-top:4px">заявка на перенос даты</div>' : ''}
          ${attachBadgeHtml(t)}
        </div>
      `);
      card.addEventListener('click', () => openTaskModal(t));
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', t.id));
      colBody.appendChild(card);
    });
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const draggedTask = state.tasks.find((x) => String(x.id) === String(id));
      if (draggedTask && stage.key === 'done' && draggedTask.stage !== 'done' && !String(draggedTask.report || '').trim()) {
        openTaskModal(draggedTask);
        return;
      }
      try {
        await api('PUT', `/api/tasks/${id}`, { stage: stage.key });
        await loadAll();
        render();
      } catch (err) { alert(err.message); }
    });
    kanban.appendChild(col);
  });
}

// ---------- Воронка «Посещения» (Фаза 40): автозадачи по дню визита ----------
function renderCheckinKanban() {
  const kanban = document.getElementById('kanban');
  const dateFrom = state.checkinDate || new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const dateTo = state.checkinDateTo && state.checkinDateTo >= dateFrom ? state.checkinDateTo : dateFrom;
  const cols = [
    { key: 'in_progress', label: 'Ждёт отметки' },
    { key: 'done', label: 'Отмечено' },
    { key: 'not_done', label: 'Не выполнена' }
  ];
  cols.forEach((stage) => {
    let inStage = state.tasks.filter((t) => t.taskType === 'checkin' && t.dueDate >= dateFrom && t.dueDate <= dateTo && (stage.key === 'done' ? ['done', 'archived'].includes(t.stage) : t.stage === stage.key));
    inStage = inStage.filter(matchesTaskListFilters);
    inStage.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.assigneeId - b.assigneeId);
    const col = el(`
      <div class="kanban-col" data-stage="${stage.key}">
        <h3>${escapeHtml(stage.label)} <span class="col-sum">· ${inStage.length}</span></h3>
        <div class="col-body"></div>
      </div>
    `);
    const colBody = col.querySelector('.col-body');
    inStage.forEach((t) => {
      const client = clientById(t.clientId);
      const overdue = isTaskOverdue(t);
      const canCheck = client && t.stage === 'in_progress' && t.assigneeId === state.user.id;
      const card = el(`
        <div class="deal-card" data-id="${t.id}">
          <div class="deal-title">${client ? escapeHtml(client.name) : escapeHtml(t.title)}</div>
          <div class="deal-client">${client ? escapeHtml(client.address || '') : ''}</div>
          <div class="deal-client">${agentTag(t.assigneeId)} · ${fmtDate(t.dueDate)} до 20:00 ${overdue ? '<span class="badge badge-overdue">просрочено</span>' : ''}${t.lateCheckin ? ' <span class="badge badge-amber">после 20:00</span>' : ''}</div>
          ${t.report ? `<div class="muted" style="font-size:12px">${escapeHtml(t.report)}</div>` : ''}
          ${canCheck ? '<button type="button" class="btn-primary checkin-card-btn" style="margin-top:6px">📍 Отметить посещение</button>' : ''}
        </div>
      `);
      card.addEventListener('click', () => openTaskOrClient(t));
      const btn = card.querySelector('.checkin-card-btn');
      if (btn) btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const r = await checkInVisit(client, btn);
        if (r) { await loadAll(); render(); }
      });
      colBody.appendChild(card);
    });
    kanban.appendChild(col);
  });
}

function openTaskModal(task, forceType, presetClientId) {
  const isEdit = !!task;
  // "Задачи агенту" (п.6 бэклога) не привязаны к клиенту — единственный тип
  // задачи, который можно создать, даже если в системе ещё нет ни одного клиента.
  const willBeAgentTask = isEdit ? task.taskType === 'agent' : forceType === 'agent';
  if (!state.clients.length && !willBeAgentTask) {
    alert('Сначала добавьте хотя бы одного клиента во вкладке «Клиенты».');
    return;
  }
  const agentOptions = state.users.filter((u) => u.role === 'agent');
  const assigneeBlock = isStaff()
    ? `<label>Ответственный агент</label><select name="assigneeId">${agentOptions.map((u) => `<option value="${u.id}" ${task && task.assigneeId === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select>`
    : '';

  const myClients = state.user.role === 'agent' ? state.clients.filter((c) => c.ownerId === state.user.id) : state.clients;

  // Дату можно менять свободно, пока она не проставлена; после установки —
  // только администратор/супервайзер (у агента поле блокируется).
  // 14.10.2026: в «Листе ожидания» агент переносит срок сам, без заявки супервайзеру.
  const dateLocked = isEdit && !isStaff() && !!task.dueDate && task.taskType !== 'waitlist';
  const taskClient = isEdit ? clientById(task.clientId) : null;
  const hasAssortment = taskClient && ((taskClient.regularAssortment || []).length || (taskClient.testAssortment || []).length);
  const isSale = isEdit ? task.taskType === 'sale' : forceType === 'sale';
  const isWaitlist = isEdit ? task.taskType === 'waitlist' : forceType === 'waitlist';
  // П.6 бэклога (08.09.2026): отдельная воронка "Задачи агенту" — задача без
  // привязки к клиенту (taskType === 'agent', clientId === null).
  const isAgentTask = isEdit ? task.taskType === 'agent' : forceType === 'agent';
  // С Фазы 22 у 'sale' те же этапы, что у визита (state.stages) — свои остались
  // только у 'waitlist'. У 'agent' тоже общие этапы TASK_STAGES (state.stages).
  const stageOptions = isWaitlist ? (state.waitlistStages || []) : state.stages;

  const typeSelectBlock = !isEdit ? `
      <label>Тип задачи</label>
      <select name="taskType" id="task-type-select">
        <option value="visit" ${forceType !== 'sale' && forceType !== 'waitlist' && forceType !== 'agent' ? 'selected' : ''}>Визит</option>
        <option value="sale" ${forceType === 'sale' ? 'selected' : ''}>Продажа</option>
        <option value="waitlist" ${forceType === 'waitlist' ? 'selected' : ''}>Лист ожидания (товар под заказ)</option>
        <option value="agent" ${forceType === 'agent' ? 'selected' : ''}>Задача агенту (без клиента)</option>
      </select>
  ` : '';

  const body = `
    <h2>${isEdit ? (isSale ? 'Задача продажи' : isWaitlist ? 'Задача листа ожидания' : isAgentTask ? 'Задача агенту' : 'Задача') : 'Новая задача'}</h2>
    ${isEdit && isStaff() ? `<div class="muted" style="font-size:12px;margin-bottom:8px">Создано: ${fmtDateTime(task.createdAt)} · ${escapeHtml(userName(task.createdBy))}</div>` : ''}
    ${isEdit && task.taskType !== 'agent' ? `
    <label>Воронка (тип задачи)</label>
    <select id="task-type-change-select">
      <option value="visit" ${task.taskType !== 'sale' && task.taskType !== 'waitlist' ? 'selected' : ''}>Визит</option>
      <option value="sale" ${task.taskType === 'sale' ? 'selected' : ''}>Продажа</option>
      <option value="waitlist" ${task.taskType === 'waitlist' ? 'selected' : ''}>Лист ожидания (товар под заказ)</option>
    </select>
    <div class="muted" style="font-size:12px;margin:-6px 0 10px">При смене воронки этап и теги, недопустимые в новой воронке, будут сброшены. Задачи агенту (без клиента) сюда не входят — у них своя отдельная воронка.</div>
    ` : ''}
    <form id="task-form">
      ${!isAgentTask ? `
      <label>Клиент *</label>
      ${!isEdit ? '<input type="text" id="task-client-search" placeholder="Поиск клиента по названию..." autocomplete="off" style="margin-bottom:6px">' : ''}
      <select name="clientId" id="task-client-select" required ${isEdit ? 'disabled' : ''}>
        ${myClients.map((c) => `<option value="${c.id}" ${(task && task.clientId === c.id) || (!isEdit && presetClientId && Number(presetClientId) === c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
      ${isEdit && taskClient && taskClient.phone ? `<div class="muted" style="font-size:13px;margin:-6px 0 10px">📞 ${telLink(taskClient.phone)}</div>` : ''}
      ` : ''}
      ${typeSelectBlock}
      <label>Название</label>
      <input name="title" value="${task ? escapeAttr(task.title) : ''}" placeholder="${isSale ? 'Продажа клиенту' : isWaitlist ? 'Ожидание товара' : isAgentTask ? 'Например: Сдать отчёт по остаткам' : 'Посетить клиента'}">
      <label>Описание</label>
      <textarea name="description">${task ? escapeHtml(task.description || '') : ''}</textarea>
      <div class="field-row">
        <div><label>Срок *${dateLocked ? ' <span class="lock" title="Обратитесь к супервайзеру">🔒</span>' : ''}</label>
          ${dateFieldHTML({ name: 'dueDate', value: task ? task.dueDate : '', required: true, disabled: dateLocked })}
        </div>
        ${!isSale && !isWaitlist && !isAgentTask ? `<div><label>Время визита (от–до)</label><div style="display:flex;gap:6px"><input type="time" name="visitTime" value="${task ? escapeAttr(task.visitTime || '') : ''}"><input type="time" name="visitTimeTo" value="${task ? escapeAttr(task.visitTimeTo || '') : ''}"></div></div>` : ''}
        ${isEdit ? `<div><label>Этап</label><select name="stage">${stageOptions.map((s) => `<option value="${s.key}" ${task.stage === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>` : ''}
      </div>
      ${assigneeBlock}
      ${!isWaitlist && !isAgentTask ? `
      <label>Теги</label>
      <div class="tag-checks">
        ${(isSale ? state.saleTags : state.taskTags).map((tag) => `<label class="tag-check"><input type="checkbox" name="tags" value="${escapeAttr(tag)}" ${task && (task.tags || []).includes(tag) ? 'checked' : ''}> ${escapeHtml(tag)}</label>`).join('')}
      </div>` : ''}
      ${isWaitlist ? `
      <label>Бренд товара</label>
      <div class="tag-checks">
        ${(state.waitlistTags || []).map((tag) => `<label class="tag-check"><input type="checkbox" name="tags" value="${escapeAttr(tag)}" ${task && (task.tags || []).includes(tag) ? 'checked' : ''}> ${escapeHtml(tag)}</label>`).join('')}
      </div>` : ''}
      ${isEdit && !isWaitlist ? `<label>Комментарий${isSale ? '' : isAgentTask ? '' : ' по визиту'}</label><textarea name="comment">${escapeHtml(task.comment || '')}</textarea>` : ''}
      ${isEdit && !isWaitlist ? `<label>Отчёт по задаче ${task.stage === 'done' ? '*' : ''}</label><textarea name="report" placeholder="Без отчёта нельзя перевести в «Выполнена»">${escapeHtml(task.report || '')}</textarea>` : ''}
      ${renderAttachmentsSection(isEdit ? task : null)}
      <div class="modal-actions">
        ${isEdit && isStaff() ? '<button type="button" class="btn-secondary" id="delete-task">Удалить</button>' : ''}
        <button type="button" class="btn-secondary" id="cancel-modal">Отмена</button>
        <button type="submit" class="btn-primary">Сохранить</button>
      </div>
    </form>
    ${isEdit ? renderDateChangeSection(task) : ''}
    ${isEdit && hasAssortment ? `<div class="assort-panel"><h3>Ассортимент клиента: ${escapeHtml(taskClient.name)}</h3>${renderAssortmentSection(taskClient)}${renderTestAssortmentSection(taskClient)}</div>` : ''}
  `;
  openModal(body, async (form) => {
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.tags = fd.getAll('tags');
    if (recBusy()) throw new Error('Сначала остановите запись голоса (кнопка «⏹ Остановить»)');
    if (task) await api('PUT', `/api/tasks/${task.id}`, data);
    else {
      const created = await api('POST', '/api/tasks', data);
      if (created && created.task) await uploadPendingAttachments(created.task.id);
    }
    await loadAll();
    closeModal();
    render();
  });
  const delBtn = document.getElementById('delete-task');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('Удалить задачу?')) return;
    await api('DELETE', `/api/tasks/${task.id}`);
    await loadAll();
    closeModal();
    render();
  });
  // П.4 бэклога (08.09.2026): смена воронки применяется сразу отдельным запросом
  // (не вместе с формой) — состав полей (теги/этапы/время визита) отличается
  // между воронками, проще сразу перезагрузить и переоткрыть карточку в новом
  // виде, чем на лету пересобирать форму под новый тип.
  const typeChangeSelect = document.getElementById('task-type-change-select');
  if (typeChangeSelect) typeChangeSelect.addEventListener('change', async (e) => {
    const newType = e.target.value;
    if (newType === task.taskType) return;
    if (!confirm('Сменить воронку задачи? Этап и теги, недопустимые в новой воронке, будут сброшены.')) {
      e.target.value = task.taskType || 'visit';
      return;
    }
    try {
      await api('PUT', `/api/tasks/${task.id}`, { taskType: newType });
      await loadAll();
      closeModal();
      const updated = state.tasks.find((x) => x.id === task.id);
      if (updated) openTaskModal(updated);
      render();
    } catch (err) {
      alert(err.message);
    }
  });
  if (isEdit && hasAssortment) wireAssortmentToggle(taskClient.id);
  wireAttachments(isEdit ? task : null);
  if (isEdit) wireDateChangeSection(task);
  if (!isEdit) wireTaskClientSearch(myClients);
}

// Поиск клиента над длинным <select> (в очереди с 02.09.2026, реализовано в
// Фазе 18 для формы «Новая задача»; обобщено в Фазе 26, 11.09.2026, и
// переиспользовано в форме «Встреча с клиентом» в Календаре — там до этого
// был точно такой же длинный список без фильтра, без поиска). Текстовое поле
// над <select> живьём перестраивает список опций по подстроке в названии
// клиента (без учёта регистра) — сам <select> остаётся источником истины для
// отправки формы (clientId всегда валиден), просто его опции сужаются на лету.
function wireClientSearchSelect(searchInputId, selectId, clients) {
  const searchInput = document.getElementById(searchInputId);
  const select = document.getElementById(selectId);
  if (!searchInput || !select) return;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const currentValue = select.value;
    const filtered = q ? clients.filter((c) => (c.name || '').toLowerCase().includes(q)) : clients;
    select.innerHTML = filtered.map((c) => `<option value="${c.id}" ${String(c.id) === currentValue ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    // Если текущий выбор отфильтрован — выбираем первый в списке (select
    // required не пропустит пустое значение при отправке формы).
    if (!filtered.some((c) => String(c.id) === currentValue) && filtered.length) {
      select.value = String(filtered[0].id);
    }
  });
}

// Поле поиска есть только при создании новой задачи — при редактировании
// клиент задачи заблокирован (disabled select), искать нечего.
function wireTaskClientSearch(myClients) {
  wireClientSearchSelect('task-client-search', 'task-client-select', myClients);
}

// ---------- Заявка на перенос даты задачи ----------

function renderDateChangeSection(task) {
  const req = task.dateChangeRequest;
  if (req) {
    return `
      <div class="date-change-note">
        <strong>Заявка на перенос даты:</strong> на ${fmtDate(req.requestedDate)}${req.reason ? ' — ' + escapeHtml(req.reason) : ''}
        <div class="muted" style="margin-top:4px">От: ${escapeHtml(userName(req.requestedBy))} · ${fmtDateTime(req.createdAt)}</div>
        ${isStaff() ? `
          <div style="margin-top:8px;display:flex;gap:8px">
            <button type="button" class="btn-primary" id="approve-date-change">Одобрить</button>
            <button type="button" class="btn-secondary" id="reject-date-change">Отклонить</button>
          </div>` : '<div class="muted" style="margin-top:4px">Ожидает решения супервайзера/администратора.</div>'}
      </div>
    `;
  }
  if (isStaff() || task.taskType === 'waitlist') return '';
  return `
    <div class="assort-panel">
      <h3>Перенос даты</h3>
      <button type="button" class="btn-secondary" id="open-date-change-form">Запросить перенос даты</button>
      <div id="date-change-form" style="display:none;margin-top:8px">
        <label>Новая дата</label>
        ${dateFieldHTML({ name: 'dateChangeDate', id: 'date-change-date', value: task.dueDate || '' })}
        <label>Причина</label>
        <textarea id="date-change-reason" placeholder="Почему нужно перенести"></textarea>
        <button type="button" class="btn-primary" id="submit-date-change" style="margin-top:6px">Отправить заявку</button>
      </div>
    </div>
  `;
}

function wireDateChangeSection(task) {
  const openBtn = document.getElementById('open-date-change-form');
  if (openBtn) openBtn.addEventListener('click', () => {
    document.getElementById('date-change-form').style.display = '';
    openBtn.style.display = 'none';
  });
  const submitBtn = document.getElementById('submit-date-change');
  if (submitBtn) submitBtn.addEventListener('click', async () => {
    const requestedDate = document.getElementById('date-change-date').value;
    const reason = document.getElementById('date-change-reason').value;
    if (!requestedDate) return alert('Укажите дату');
    try {
      await api('POST', `/api/tasks/${task.id}/request-date-change`, { requestedDate, reason });
      await loadAll();
      closeModal();
      const fresh = state.tasks.find((t) => t.id === task.id);
      render();
      if (fresh) openTaskModal(fresh);
    } catch (e) { alert(e.message); }
  });
  const approveBtn = document.getElementById('approve-date-change');
  if (approveBtn) approveBtn.addEventListener('click', async () => {
    await api('POST', `/api/tasks/${task.id}/approve-date-change`);
    await loadAll();
    closeModal();
    render();
  });
  const rejectBtn = document.getElementById('reject-date-change');
  if (rejectBtn) rejectBtn.addEventListener('click', async () => {
    if (!confirm('Отклонить заявку на перенос?')) return;
    await api('POST', `/api/tasks/${task.id}/reject-date-change`);
    await loadAll();
    closeModal();
    render();
  });
}

// ---------- Вложения задач: фото и аудио (доработка 05.10.2026) ----------
// Кнопки «📷 Сфотографировать» (камера телефона), «🖼 Из галереи / файл» и
// «🎤 Записать голос» (запись прямо в браузере). Работает и при СОЗДАНИИ задачи:
// файлы копятся в форме и загружаются сразу после сохранения. Крупные фото
// сжимаются на телефоне до ~1600 px (экономит трафик и место на диске).
const ATTACH_MAX_SIDE = 1600;
let attachCtx = null; // { task, pending: [{file, url}] , recorder, stream, chunks, timer }

// Значок на карточке задачи: сколько фото и голосовых прикреплено.
function attachBadgeHtml(t) {
  const list = t.attachments || [];
  if (!list.length) return '';
  const img = list.filter((a) => (a.mimeType || '').startsWith('image/')).length;
  const aud = list.length - img;
  return `<div class="muted" title="Вложения задачи">${[img ? '📷 ' + img : '', aud ? '🎤 ' + aud : ''].filter(Boolean).join(' · ')}</div>`;
}

function fmtFileSize(n) {
  if (!n) return '';
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ';
}

function attachItemHtml(a, opts) {
  const isImg = (a.mimeType || '').startsWith('image/');
  const media = isImg
    ? `<a href="${a.url}" target="_blank" rel="noopener" title="Открыть крупно"><img src="${a.url}" class="attach-thumb"></a>`
    : `<audio controls preload="metadata" src="${a.url}"></audio>`;
  const name = isImg ? (a.filename || 'Фото') : (a.filename && !/^voice_/.test(a.filename) ? a.filename : '🎤 Голосовое');
  return `
    <div class="attach-row">
      ${media}
      <span class="muted">${escapeHtml(name)}${a.size ? ' · ' + fmtFileSize(a.size) : ''}${opts && opts.pending ? ' · <i>загрузится после сохранения</i>' : ''}${!isImg ? ` · <a href="${a.url}" download>скачать</a>` : ''}</span>
      <button type="button" class="icon-btn ${opts && opts.pending ? 'del-pending' : 'del-attach'}" data-id="${escapeAttr(String(a.id))}" title="Удалить">✕</button>
    </div>`;
}

function renderAttachListHtml(items) {
  const saved = (items || []).map((a) => attachItemHtml(a)).join('');
  const pending = attachCtx && !attachCtx.task ? attachCtx.pending.map((p, i) => attachItemHtml({ id: i, url: p.url, filename: p.file.name, mimeType: p.file.type, size: p.file.size }, { pending: true })).join('') : '';
  return saved + pending || '<div class="muted">Пока нет файлов</div>';
}

function renderAttachmentsSection(task) {
  return `
    <div class="assort-panel attach-panel">
      <h3>Фото и аудио</h3>
      <div id="attach-list">${renderAttachListHtml(task ? task.attachments : [])}</div>
      <div class="attach-actions">
        <label class="btn-secondary attach-btn">📷 Сфотографировать<input type="file" id="attach-camera" accept="image/*" capture="environment" hidden></label>
        <label class="btn-secondary attach-btn">🖼 Из галереи / файл<input type="file" id="attach-input" accept="image/*,audio/*" multiple hidden></label>
        <button type="button" class="btn-secondary attach-btn" id="attach-rec">🎤 Записать голос</button>
        <span id="attach-status" class="muted"></span>
      </div>
    </div>
  `;
}

// Сжатие фото: если сторона > 1600 px или файл > 1,5 МБ — перерисовываем в JPEG 85%.
function compressImage(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const big = Math.max(img.naturalWidth, img.naturalHeight);
      if (big <= ATTACH_MAX_SIDE && file.size <= 1.5 * 1048576) { URL.revokeObjectURL(url); return resolve(file); }
      const k = Math.min(1, ATTACH_MAX_SIDE / big);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => {
        if (!blob || blob.size >= file.size) return resolve(file);
        resolve(new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // не смогли прочитать (например, HEIC в Chrome) — отправляем как есть
    img.src = url;
  });
}

function setAttachStatus(text) {
  const s = document.getElementById('attach-status');
  if (s) s.textContent = text || '';
}

function redrawAttachList() {
  const list = document.getElementById('attach-list');
  if (!list || !attachCtx) return;
  list.innerHTML = renderAttachListHtml(attachCtx.task ? attachCtx.task.attachments : []);
  wireAttachDeletes();
}

async function uploadAttachFiles(taskId, files) {
  // по одному файлу — чтобы не упереться в лимит 20 МБ на запрос
  let last = null;
  for (const f of files) {
    const fd = new FormData();
    fd.append('file', f, f.name);
    last = await apiUpload(`/api/tasks/${taskId}/attachments`, fd);
  }
  return last;
}

async function addAttachFiles(fileList) {
  if (!attachCtx || !fileList || !fileList.length) return;
  setAttachStatus('Подготовка…');
  const files = [];
  for (const f of Array.from(fileList)) files.push(await compressImage(f));
  if (!attachCtx.task) {
    files.forEach((file) => attachCtx.pending.push({ file, url: URL.createObjectURL(file) }));
    setAttachStatus('');
    redrawAttachList();
    return;
  }
  try {
    setAttachStatus('Загрузка…');
    const res = await uploadAttachFiles(attachCtx.task.id, files);
    if (res) attachCtx.task.attachments = res.task.attachments;
    setAttachStatus('');
    redrawAttachList();
  } catch (e) {
    setAttachStatus('');
    alert('Не удалось загрузить: ' + e.message);
  }
}

// Запись голоса в браузере (MediaRecorder). Нужен HTTPS — на Render он есть.
function recMimeType() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

async function toggleVoiceRecording(btn) {
  if (!attachCtx) return;
  if (attachCtx.recorder && attachCtx.recorder.state === 'recording') { attachCtx.recorder.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { alert('Этот браузер не умеет записывать звук. Запишите голосовое на телефоне и прикрепите через «Из галереи / файл».'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { alert('Нет доступа к микрофону. Разрешите микрофон для этого сайта в настройках браузера.'); return; }
  const mime = recMimeType();
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks = [];
  const started = Date.now();
  attachCtx.recorder = rec;
  attachCtx.stream = stream;
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    clearInterval(attachCtx && attachCtx.timer);
    stream.getTracks().forEach((t) => t.stop());
    btn.textContent = '🎤 Записать голос';
    btn.classList.remove('rec-on');
    const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const blob = new Blob(chunks, { type });
    if (!blob.size || Date.now() - started < 700) { setAttachStatus(''); return; }
    const d = new Date();
    const name = `voice_${d.toISOString().slice(0, 10)}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}.${ext}`;
    await addAttachFiles([new File([blob], name, { type })]);
  };
  rec.start();
  btn.textContent = '⏹ Остановить';
  btn.classList.add('rec-on');
  attachCtx.timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    setAttachStatus(`● Запись ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    if (s >= 300) rec.stop(); // не дольше 5 минут
  }, 500);
}

function recBusy() { return !!(attachCtx && attachCtx.recorder && attachCtx.recorder.state === 'recording'); }

function stopAttachRecording() {
  if (attachCtx && attachCtx.recorder && attachCtx.recorder.state === 'recording') {
    try { attachCtx.recorder.onstop = null; attachCtx.recorder.stop(); } catch (e) {}
    try { attachCtx.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    clearInterval(attachCtx.timer);
  }
}

function wireAttachments(task) {
  stopAttachRecording();
  attachCtx = { task: task || null, pending: [] };
  const cam = document.getElementById('attach-camera');
  const input = document.getElementById('attach-input');
  [cam, input].forEach((inp) => inp && inp.addEventListener('change', async () => {
    const files = Array.from(inp.files || []);
    inp.value = '';
    await addAttachFiles(files);
  }));
  const recBtn = document.getElementById('attach-rec');
  if (recBtn) recBtn.addEventListener('click', () => toggleVoiceRecording(recBtn));
  wireAttachDeletes();
}

function wireAttachDeletes() {
  document.querySelectorAll('.del-attach').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Удалить этот файл из задачи?')) return;
      const res = await api('DELETE', `/api/tasks/${attachCtx.task.id}/attachments/${encodeURIComponent(btn.dataset.id)}`);
      attachCtx.task.attachments = res.task.attachments;
      redrawAttachList();
    };
  });
  document.querySelectorAll('.del-pending').forEach((btn) => {
    btn.onclick = () => {
      const p = attachCtx.pending.splice(Number(btn.dataset.id), 1)[0];
      if (p) URL.revokeObjectURL(p.url);
      redrawAttachList();
    };
  });
}

// После создания задачи — догружаем файлы, выбранные в форме.
async function uploadPendingAttachments(taskId) {
  if (!attachCtx || attachCtx.task || !attachCtx.pending.length) return;
  const files = attachCtx.pending.map((p) => p.file);
  try { await uploadAttachFiles(taskId, files); } catch (e) { alert('Задача сохранена, но файлы не загрузились: ' + e.message + '\nОткройте задачу и прикрепите их ещё раз.'); }
  attachCtx.pending.forEach((p) => URL.revokeObjectURL(p.url));
  attachCtx.pending = [];
}

// ---------- По брендам: клиент × бренд (Фаза 39, 23.09.2026) ----------
// Просьба пользователя: «не видно какие клиенты купили по брендам Kapous/EPICA/
// Чистовье — нужна отдельная вкладка для недопроданных по брендам, чтобы было
// видно сразу клиента и ассортимент». Выбран вид «таблица клиент × бренд».
// В ячейке: сумма покупок бренда в текущем месяце (c.currentMonthItems) и число
// позиций регулярного ассортимента этого бренда, ещё не купленных в этом месяце
// (atRisk — та же логика «Недопродано», что везде, computeAtRisk() на сервере).
// Клик по ячейке раскрывает под строкой ассортимент: что куплено / что недопродано.
const BRAND_MATRIX_BRANDS = ['Классика', 'Мясные', 'Премиум'];

function brandCell(c, brand) {
  const bought = (c.currentMonthItems || []).filter((it) => (it.brand || 'Прочее') === brand);
  const sum = bought.reduce((s, it) => s + (it.revenue || 0), 0);
  const risk = (c.regularAssortment || []).filter((p) => p.brand === brand && p.atRisk);
  const regular = (c.regularAssortment || []).filter((p) => p.brand === brand);
  return { bought, sum, risk, regular };
}

function renderBrands(content) {
  const f = state.brandMatrix || (state.brandMatrix = { agentId: '', q: '', show: 'active', sortBrand: '', open: null, visitDay: '' });
  if (f.visitDay === undefined) f.visitDay = '';
  content.appendChild(el(`
    <div>
      <div class="toolbar"><h2 style="margin:0">По линейкам — купили / недопродано</h2></div>
      <div class="sub muted" style="margin-bottom:8px">В ячейке: сумма покупок линейки в текущем месяце и ⚠ число позиций регулярного ассортимента линейки, которые клиент ещё не купил. Нажмите на ячейку — откроется ассортимент.</div>
      <div class="filter-bar">
        <input type="text" id="bm-q" placeholder="Поиск клиента..." value="${escapeHtml(f.q)}" autocomplete="off">
        ${isStaff() ? `<select id="bm-agent"><option value="">Все агенты</option>${state.users.filter((u) => u.role === 'agent').map((a) => `<option value="${a.id}" ${String(f.agentId) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>` : ''}
        <select id="bm-day" title="День визита клиента"><option value="">День недели: все</option>${VISIT_DAYS.map((d) => `<option value="${d}" ${f.visitDay === d ? 'selected' : ''}>${d}</option>`).join('')}<option value="-" ${f.visitDay === '-' ? 'selected' : ''}>День не указан</option></select>
        <select id="bm-show">
          <option value="active" ${f.show === 'active' ? 'selected' : ''}>Есть покупки или недопродано</option>
          <option value="risk" ${f.show === 'risk' ? 'selected' : ''}>Только с недопроданным</option>
          <option value="bought" ${f.show === 'bought' ? 'selected' : ''}>Только купившие</option>
          <option value="all" ${f.show === 'all' ? 'selected' : ''}>Все клиенты</option>
        </select>
      </div>
      <div id="bm-totals" class="agent-metric-grid" style="margin:10px 0"></div>
      <div class="table-wrap brand-matrix-wrap"><table class="brand-matrix"><thead><tr>
        <th class="sticky-col">Клиент</th><th class="bm-day-col" title="День визита">День</th>${isStaff() ? '<th>Агент</th>' : ''}
        ${BRAND_MATRIX_BRANDS.map((b) => `<th class="sortable bm-sort" data-brand="${escapeHtml(b)}" title="Сортировать: больше недопроданного — выше">${escapeHtml(b)}${f.sortBrand === b ? ' ↓' : ''}</th>`).join('')}
      </tr></thead><tbody id="bm-tbody"></tbody></table></div>
      <div id="bm-more" class="muted" style="font-size:12px;margin-top:6px"></div>
    </div>
  `));

  function draw() {
    const aid = f.agentId ? Number(f.agentId) : null;
    const q = f.q.trim().toLowerCase();
    let rows = state.clients
      .filter((c) => !c.closed)
      .filter((c) => !aid || c.ownerId === aid)
      .filter((c) => !q || (c.name || '').toLowerCase().includes(q))
      .filter((c) => !f.visitDay || (f.visitDay === '-' ? !(c.visitDay || '').trim() : c.visitDay === f.visitDay))
      .map((c) => ({ c, cells: Object.fromEntries(BRAND_MATRIX_BRANDS.map((b) => [b, brandCell(c, b)])) }));
    const hasRisk = (r) => BRAND_MATRIX_BRANDS.some((b) => r.cells[b].risk.length);
    const hasBought = (r) => BRAND_MATRIX_BRANDS.some((b) => r.cells[b].sum > 0);
    if (f.show === 'risk') rows = rows.filter(hasRisk);
    else if (f.show === 'bought') rows = rows.filter(hasBought);
    else if (f.show === 'active') rows = rows.filter((r) => hasRisk(r) || hasBought(r));
    if (f.sortBrand) rows.sort((a, b) => (b.cells[f.sortBrand].risk.length - a.cells[f.sortBrand].risk.length) || (b.cells[f.sortBrand].sum - a.cells[f.sortBrand].sum));
    else rows.sort((a, b) => BRAND_MATRIX_BRANDS.reduce((s, br) => s + b.cells[br].risk.length, 0) - BRAND_MATRIX_BRANDS.reduce((s, br) => s + a.cells[br].risk.length, 0));

    document.getElementById('bm-totals').innerHTML = BRAND_MATRIX_BRANDS.map((b) => {
      const sum = rows.reduce((s, r) => s + r.cells[b].sum, 0);
      const boughtN = rows.filter((r) => r.cells[b].sum > 0).length;
      const riskN = rows.filter((r) => r.cells[b].risk.length).length;
      return `<div class="stat-card"><div class="num" style="font-size:18px">${fmtMoney(sum)}</div><div class="label">${escapeHtml(b)} · купили ${boughtN} · недопродано у ${riskN}</div></div>`;
    }).join('');

    const LIMIT = 300;
    const cols = BRAND_MATRIX_BRANDS.length + (isStaff() ? 3 : 2);
    const tbody = document.getElementById('bm-tbody');
    tbody.innerHTML = rows.slice(0, LIMIT).map((r) => {
      const c = r.c;
      const main = `<tr>
        <td class="sticky-col open-client" data-id="${c.id}" title="Двойной клик — карточка клиента">${escapeHtml(c.name)}</td>
        <td class="bm-day-col" title="${escapeAttr(c.visitDay || 'день не указан')}">${c.visitDay ? escapeHtml(dayShort(c.visitDay)) : '<span class="muted">—</span>'}</td>
        ${isStaff() ? `<td>${escapeHtml(calAgentShort(c.ownerId))}</td>` : ''}
        ${BRAND_MATRIX_BRANDS.map((b) => {
          const cell = r.cells[b];
          if (!cell.sum && !cell.risk.length && !cell.regular.length) return '<td class="bm-cell bm-empty">—</td>';
          const cls = cell.risk.length ? (cell.sum ? 'bm-partial' : 'bm-risk') : (cell.sum ? 'bm-ok' : '');
          const isOpen = f.open && f.open.id === c.id && f.open.brand === b;
          return `<td class="bm-cell ${cls} ${isOpen ? 'bm-open' : ''}" data-id="${c.id}" data-brand="${escapeHtml(b)}">
            <div>${cell.sum ? fmtMoney(cell.sum) : '<span class="muted">не брал</span>'}</div>
            ${cell.risk.length ? `<div class="bm-risk-n">⚠ ${cell.risk.length} недопр.</div>` : ''}
          </td>`;
        }).join('')}
      </tr>`;
      if (!(f.open && f.open.id === c.id)) return main;
      const cell = r.cells[f.open.brand];
      const boughtByProduct = {};
      cell.bought.forEach((it) => {
        const k = it.product;
        boughtByProduct[k] = boughtByProduct[k] || { ...it, qty: 0, revenue: 0 };
        boughtByProduct[k].qty += it.qty || 0; boughtByProduct[k].revenue += it.revenue || 0;
      });
      const bought = Object.values(boughtByProduct).sort((a, b) => b.revenue - a.revenue);
      return main + `<tr class="bm-detail"><td colspan="${cols}">
        <div class="bm-detail-grid">
          <div><div class="bm-detail-h">⚠ Недопродано — ${escapeHtml(f.open.brand)} (${cell.risk.length})</div>
            ${cell.risk.length ? cell.risk.map((p) => `<div class="assort-row"><span>${skuBadgeHtml(p)}${escapeHtml(p.product)}</span><span class="freq">~${p.avgQty} шт/мес · посл.: ${escapeHtml(p.lastMonth || '')}</span></div>`).join('') : '<div class="muted">Весь регулярный ассортимент линейки уже куплен.</div>'}
          </div>
          <div><div class="bm-detail-h">✓ Куплено в этом месяце — ${escapeHtml(f.open.brand)} (${fmtMoney(cell.sum)})</div>
            ${bought.length ? bought.map((it) => `<div class="assort-row"><span>${skuBadgeHtml(it)}${escapeHtml(it.product)}</span><span class="freq">${it.qty} шт · ${fmtMoney(it.revenue)}${it.soldBy ? ` · продал(а) ${escapeHtml(it.soldBy)}` : ''}</span></div>`).join('') : '<div class="muted">В этом месяце не покупал.</div>'}
          </div>
        </div>
      </td></tr>`;
    }).join('') || `<tr><td colspan="${cols}" class="muted">Нет клиентов по выбранным фильтрам.</td></tr>`;
    document.getElementById('bm-more').textContent = rows.length > LIMIT ? `Показаны первые ${LIMIT} из ${rows.length} — уточните фильтр или поиск.` : `Клиентов: ${rows.length}`;

    tbody.querySelectorAll('.bm-cell[data-brand]').forEach((td) => {
      td.addEventListener('click', () => {
        const id = Number(td.dataset.id); const brand = td.dataset.brand;
        f.open = (f.open && f.open.id === id && f.open.brand === brand) ? null : { id, brand };
        draw();
      });
    });
    tbody.querySelectorAll('.open-client').forEach((td) => {
      td.addEventListener('dblclick', () => { const c = clientById(Number(td.dataset.id)); if (c) openClientModal(c); });
    });
  }

  const qInput = document.getElementById('bm-q');
  qInput.addEventListener('input', (e) => { f.q = e.target.value; draw(); });
  const agSel = document.getElementById('bm-agent');
  if (agSel) agSel.addEventListener('change', (e) => { f.agentId = e.target.value; f.open = null; draw(); });
  document.getElementById('bm-show').addEventListener('change', (e) => { f.show = e.target.value; draw(); });
  document.getElementById('bm-day').addEventListener('change', (e) => { f.visitDay = e.target.value; f.open = null; draw(); });
  document.querySelectorAll('.bm-sort').forEach((th) => {
    th.addEventListener('click', () => { f.sortBrand = f.sortBrand === th.dataset.brand ? '' : th.dataset.brand; render(); });
  });
  draw();
}

// ---------- Отчёт «Продажи по брендам и клиентам» (Фаза 39, 23.09.2026) ----------
// Просьба: «в отчётах не видно, сколько продано по каждому бренду и по клиентам».
// Период — текущий месяц (срезы агентов, c.currentMonthItems) и/или любые из
// закрытых месяцев (c.monthlyAssortment). Считается в браузере из state.clients.
// Агент строки текущего месяца — кто продал (soldBy, если клиент чужой), иначе
// владелец карточки. Факт агента по срезу («Итого») может быть больше суммы по
// клиентам — если в срезе есть строки без карточки (см. «Сверка срезов» на дашборде).
function wireSalesBrandReport(stats) {
  const box = document.getElementById('sr-box');
  if (!box) return;
  const st = { months: new Set(['current']), agentId: '', brand: '', open: null, q: '' };
  const agents = state.users.filter((u) => u.role === 'agent');
  const nameToId = {}; agents.forEach((a) => { nameToId[a.name] = a.id; });
  box.innerHTML = `
    <div class="filter-bar" id="sr-months">
      <button type="button" class="brand-chip active" data-month="current">Текущий месяц</button>
      ${(state.salesMonths || []).slice().reverse().map((m) => `<button type="button" class="brand-chip" data-month="${escapeAttr(m)}">${escapeHtml(capitalize(m))}</button>`).join('')}
    </div>
    <div class="filter-bar">
      <select id="sr-agent"><option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
      <input type="text" id="sr-q" placeholder="Поиск клиента..." autocomplete="off">
    </div>
    <div id="sr-fact" class="muted" style="font-size:12px;margin:6px 0"></div>
    <div class="table-wrap"><table><thead><tr><th>Бренд</th><th>Сумма</th><th>Шт</th><th>Клиентов</th><th>Доля</th></tr></thead><tbody id="sr-brands"></tbody></table></div>
    <div style="margin-top:14px">${repFold('fold-sr', '<h3 id="sr-clients-h" style="display:inline;margin:0"></h3>', `<div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Клиент</th><th>Агент</th><th>Сумма</th><th>Шт</th><th>Позиций</th></tr></thead><tbody id="sr-clients"></tbody></table></div>`)}</div>
    <div id="sr-more" class="muted" style="font-size:12px;margin-top:6px"></div>
  `;

  function lines() {
    const out = [];
    state.clients.forEach((c) => {
      st.months.forEach((m) => {
        const items = m === 'current' ? (c.currentMonthItems || []) : ((c.monthlyAssortment && c.monthlyAssortment[m]) || []);
        items.forEach((it) => {
          const agentId = it.soldBy && nameToId[it.soldBy] ? nameToId[it.soldBy] : c.ownerId;
          out.push({ c, agentId, brand: it.brand || 'Прочее', product: it.product, sku: it.sku, qty: it.qty || 0, revenue: it.revenue || 0 });
        });
      });
    });
    const aid = st.agentId ? Number(st.agentId) : null;
    return aid ? out.filter((l) => l.agentId === aid) : out;
  }

  function draw() {
    const all = lines();
    const total = all.reduce((s, l) => s + l.revenue, 0);
    const byBrand = {};
    all.forEach((l) => {
      const b = byBrand[l.brand] || (byBrand[l.brand] = { brand: l.brand, revenue: 0, qty: 0, clients: new Set() });
      b.revenue += l.revenue; b.qty += l.qty; b.clients.add(l.c.id);
    });
    const brands = Object.values(byBrand).sort((a, b) => b.revenue - a.revenue);
    document.getElementById('sr-brands').innerHTML = brands.map((b) => `
      <tr class="sr-brand-row ${st.brand === b.brand ? 'bm-open' : ''}" data-brand="${escapeAttr(b.brand)}" style="cursor:pointer">
        <td><span class="brand-badge">${escapeHtml(b.brand)}</span></td><td>${fmtMoney(b.revenue)}</td><td>${b.qty}</td><td>${b.clients.size}</td><td>${total ? Math.round(b.revenue / total * 100) : 0}%</td>
      </tr>`).join('') + `<tr><td><strong>Итого</strong></td><td><strong>${fmtMoney(total)}</strong></td><td><strong>${all.reduce((s, l) => s + l.qty, 0)}</strong></td><td><strong>${new Set(all.map((l) => l.c.id)).size}</strong></td><td></td></tr>`;

    // Подсказка про факт по срезам — только когда выбран текущий месяц.
    const factBox = document.getElementById('sr-fact');
    if (st.months.has('current') && stats && stats.byAgent) {
      const list = st.agentId ? stats.byAgent.filter((a) => String(a.agentId) === String(st.agentId)) : stats.byAgent;
      const fact = list.reduce((s, a) => s + (a.actualThisMonth || 0), 0);
      factBox.textContent = `Текущий месяц: факт по срезам агентов (Итого файлов) — ${fmtMoney(fact)}.` + (st.months.size === 1 && fact !== total ? ` По клиентам — ${fmtMoney(total)} (разница — см. «Сверка срезов продаж» на дашборде).` : '');
    } else factBox.textContent = '';

    const q = st.q.trim().toLowerCase();
    const scoped = all.filter((l) => (!st.brand || l.brand === st.brand) && (!q || (l.c.name || '').toLowerCase().includes(q)));
    const byClient = {};
    scoped.forEach((l) => {
      const r = byClient[l.c.id] || (byClient[l.c.id] = { c: l.c, agentIds: new Set(), revenue: 0, qty: 0, products: {} });
      r.agentIds.add(l.agentId); r.revenue += l.revenue; r.qty += l.qty;
      const p = r.products[l.product] || (r.products[l.product] = { product: l.product, sku: l.sku, brand: l.brand, qty: 0, revenue: 0 });
      p.qty += l.qty; p.revenue += l.revenue;
    });
    const clients = Object.values(byClient).sort((a, b) => b.revenue - a.revenue);
    document.getElementById('sr-clients-h').textContent = `Клиенты${st.brand ? ` — ${st.brand}` : ' — все бренды'} (${clients.length})`;
    const LIMIT = 200;
    document.getElementById('sr-clients').innerHTML = clients.slice(0, LIMIT).map((r) => {
      const main = `<tr class="sr-client-row" data-id="${r.c.id}" style="cursor:pointer">
        <td>${escapeHtml(r.c.name)}</td><td>${[...r.agentIds].map((id) => escapeHtml(calAgentShort(id))).join(', ')}</td>
        <td>${fmtMoney(r.revenue)}</td><td>${r.qty}</td><td>${Object.keys(r.products).length}</td></tr>`;
      if (st.open !== r.c.id) return main;
      const prods = Object.values(r.products).sort((a, b) => b.revenue - a.revenue);
      return main + `<tr class="bm-detail"><td colspan="5">${prods.map((p) => `<div class="assort-row"><span>${skuBadgeHtml(p)}${escapeHtml(p.product)} <span class="brand-badge">${escapeHtml(p.brand)}</span></span><span class="freq">${p.qty} шт · ${fmtMoney(p.revenue)}</span></div>`).join('')}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Нет продаж по выбранным фильтрам.</td></tr>';
    document.getElementById('sr-more').textContent = clients.length > LIMIT ? `Показаны первые ${LIMIT} из ${clients.length}.` : '';

    box.querySelectorAll('.sr-brand-row').forEach((tr) => tr.addEventListener('click', () => {
      st.brand = st.brand === tr.dataset.brand ? '' : tr.dataset.brand; st.open = null; draw();
    }));
    box.querySelectorAll('.sr-client-row').forEach((tr) => tr.addEventListener('click', () => {
      const id = Number(tr.dataset.id); st.open = st.open === id ? null : id; draw();
    }));
  }

  box.querySelectorAll('#sr-months .brand-chip').forEach((chip) => chip.addEventListener('click', () => {
    const m = chip.dataset.month;
    if (st.months.has(m)) { if (st.months.size > 1) st.months.delete(m); } else st.months.add(m);
    box.querySelectorAll('#sr-months .brand-chip').forEach((c) => c.classList.toggle('active', st.months.has(c.dataset.month)));
    draw();
  }));
  document.getElementById('sr-agent').addEventListener('change', (e) => { st.agentId = e.target.value; st.open = null; draw(); });
  document.getElementById('sr-q').addEventListener('input', (e) => { st.q = e.target.value; draw(); });
  draw();
}

// ---------- Отметка посещения (Фаза 40, 25.09.2026) ----------
// Агент у точки жмёт «📍 Отметить посещение» — браузер отдаёт координаты
// (нужен https и разрешение на геолокацию), сервер ставит своё время и
// сравнивает с координатами точки (client.geo, запоминаются первой отметкой).
const VISIT_STATUS_LABELS = {
  near: '✓ у точки',
  first: '📌 первая отметка — координаты точки сохранены',
  far: '⚠ далеко',
  nogps: '⚠ без GPS',
  lowacc: '⚠ слабый GPS — координаты точки не сохранены',
  reset: '✕ координаты сброшены — не засчитано'
};
function visitStatusText(v) {
  if (v.status === 'far') return `⚠ далеко, ${v.distance} м`;
  if (v.status === 'near') return `✓ у точки${v.distance != null ? `, ${v.distance} м` : ''}`;
  return VISIT_STATUS_LABELS[v.status] || v.status;
}
function fmtVisitTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'Геолокация не поддерживается этим браузером' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => resolve({ error: e.code === 1 ? 'Нет разрешения на геолокацию — разрешите доступ к местоположению для сайта в настройках браузера' : 'Не удалось определить местоположение' }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}
// Фаза 40, правка 25.09.2026 («сделай сразу без запроса, чтобы брал текущий GPS»):
// одно нажатие — сразу берём текущие координаты и отмечаем, без окна комментария
// и без подтверждений. Если GPS недоступен — отметка сохраняется «без GPS».
// Итог показывается всплывающей плашкой (не окном, которое надо закрывать).
// Разрешение на геолокацию браузер спрашивает сам один раз на устройстве — это
// нельзя обойти с сайта; чтобы оно не всплывало у точки, у агента мы запрашиваем
// его сразу при входе в приложение (primeGeolocation()).
function showToast(text, kind) {
  let box = document.getElementById('toast-box');
  if (!box) { box = document.createElement('div'); box.id = 'toast-box'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${kind ? 'toast-' + kind : ''}`;
  t.textContent = text;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
async function checkInVisit(client, btn) {
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Отмечаю…'; }
  try {
    const pos = await getPosition();
    const res = await api('POST', `/api/clients/${client.id}/visit`, pos.error ? {} : { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
    const idx = state.clients.findIndex((c) => c.id === client.id);
    if (idx !== -1) state.clients[idx] = res.client;
    const noGps = res.visit.status === 'nogps';
    showToast(noGps
      ? `${client.name}: GPS не получен — посещение НЕ засчитано. Включите геолокацию и нажмите ещё раз.`
      : `${client.name}: ${visitStatusText(res.visit)}`, ['near', 'first'].includes(res.visit.status) ? 'ok' : 'warn');
    return res;
  } catch (e) {
    showToast(e.message || 'Не удалось отметить посещение', 'warn');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}
function primeGeolocation() {
  if (!navigator.geolocation || state.user.role !== 'agent') return;
  try { navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }); } catch (e) {}
}
function visitBlockHtml(client) {
  const visits = (client.visits || []).slice(-5).reverse();
  const geo = client.geo;
  return `
    <div class="visit-block">
      <div class="filter-bar" style="margin:8px 0">
        <button type="button" class="btn-primary" id="visit-checkin-btn">📍 Отметить посещение</button>
        <span class="muted" style="font-size:12px">${geo ? `Координаты точки сохранены ${fmtVisitTime(geo.setAt)}${geo.setBy ? ` (${escapeHtml(geo.setBy)})` : ''} · <a class="maps-link" href="https://2gis.kg/geo/${geo.lng},${geo.lat}" target="_blank" rel="noopener">на карте</a>` : 'Координат точки ещё нет — их сохранит первая отметка у точки.'}</span>
        ${geo && isStaff() ? '<button type="button" class="link-btn" id="visit-reset-geo">Сбросить координаты</button>' : ''}
      </div>
      ${visits.length ? `<div class="visit-list">${visits.map((v) => `<div class="visit-row"><span>${fmtVisitTime(v.at)} · ${escapeHtml(v.agentName || userName(v.agentId))}</span><span class="visit-st visit-${v.status}">${visitStatusText(v)}</span>${v.comment ? `<span class="muted">${escapeHtml(v.comment)}</span>` : ''}</div>`).join('')}</div>` : ''}
    </div>`;
}
function wireVisitBlock(client) {
  const btn = document.getElementById('visit-checkin-btn');
  if (btn) btn.addEventListener('click', async () => {
    const res = await checkInVisit(client, btn);
    if (res) { closeModal(); await loadAll(); render(); openClientModal(res.client); }
  });
  const resetBtn = document.getElementById('visit-reset-geo');
  if (resetBtn) resetBtn.addEventListener('click', async () => {
    if (!confirm('Сбросить сохранённые координаты точки?\n\nОтметка, которой они были сохранены, не будет засчитана, а её задача «Посещение» вернётся в «Ждёт отметки». Координаты заново сохранит следующая отметка у точки.')) return;
    const res = await api('DELETE', `/api/clients/${client.id}/geo`);
    showToast(res.reopened ? `Координаты сброшены, задач возвращено в «Ждёт отметки»: ${res.reopened}` : 'Координаты сброшены', 'ok');
    await loadAll();
    const idx = state.clients.findIndex((c) => c.id === client.id);
    if (idx !== -1) state.clients[idx] = res.client;
    closeModal(); openClientModal(res.client);
  });
}

// Отчёт «Посещения» (Отчёты, админ/супервайзер).
let visitsReportLimit = 10; // сколько последних отметок показывать (0 — все)
let vrSelected = new Set(); // выбранные отметки (индексы в last.rows) для карты
let vrShowDistrict = false; // 19.10.2026: галочка «точки района по дню недели»
function wireVisitsReport() {
  const box = document.getElementById('visits-box');
  if (!box) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const agents = state.users.filter((u) => u.role === 'agent');
  box.innerHTML = `
    <div class="filter-bar">
      <label class="muted" style="margin:0">с <input type="date" id="vr-from" value="${today}"></label>
      <label class="muted" style="margin:0">по <input type="date" id="vr-to" value="${today}"></label>
      <select id="vr-agent"><option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
      <button type="button" class="btn-secondary" id="vr-csv">⬇ Выгрузить в Excel (CSV)</button>
      <label class="filter-check" style="margin:0" title="Клиенты агента с днём визита, совпадающим с днём недели каждой даты периода: 🟢 зашёл, 🟡 не зашёл, но была переписка в WhatsApp в этот день, 🔴 ни того, ни другого"><input type="checkbox" id="vr-district" ${vrShowDistrict ? 'checked' : ''}> точки района по дню недели</label>
    </div>
    <div id="vr-district-box"></div>
    <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Агент</th><th>Посещений</th><th>Точек</th><th>✓ у точки</th><th>📌 первая</th><th>⚠ далеко</th><th>⚠ без GPS</th><th>По дню визита</th><th>После 20:00</th><th>Первое / последнее</th></tr></thead><tbody id="vr-summary"></tbody></table></div>
    <div class="filter-bar" style="margin:14px 0 6px;align-items:center">
      <h3 style="margin:0">Отметки <span class="muted" id="vr-count" style="font-weight:400;font-size:13px"></span></h3>
      <label class="filter-check" style="margin:0" title="Отметить все отметки периода (с учётом агента), не только показанные"><input type="checkbox" id="vr-select-all"> выбрать все</label>
      <button type="button" class="btn-primary" id="vr-map-btn" disabled>🗺 Показать на карте</button>
      <label class="muted" style="margin:0">показать последние
        <select id="vr-limit">${[10, 20, 50, 100].map((n) => `<option value="${n}" ${visitsReportLimit === n ? 'selected' : ''}>${n}</option>`).join('')}<option value="0" ${visitsReportLimit === 0 ? 'selected' : ''}>все</option></select>
      </label>
    </div>
    <div class="table-wrap"><table><thead><tr><th style="width:28px"></th><th>Дата</th><th>Время</th><th>Агент</th><th>Клиент</th><th>Статус</th><th>Комментарий</th><th>Где отметился</th></tr></thead><tbody id="vr-rows"></tbody></table></div>`;
  let last = null;
  const t = (iso) => iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
  async function load() {
    const qs = new URLSearchParams({ from: document.getElementById('vr-from').value, to: document.getElementById('vr-to').value });
    const aid = document.getElementById('vr-agent').value;
    if (aid) qs.set('agentId', aid);
    last = await api('GET', `/api/reports/visits?${qs.toString()}`);
    last.rows.forEach((r, i) => { r._i = i; });
    vrSelected = new Set();
    document.getElementById('vr-summary').innerHTML = last.summary.map((s) => `<tr>
      <td>${escapeHtml(s.agentName)}</td><td>${s.visits}</td><td>${s.clients}</td><td>${s.near}</td><td>${s.first}</td>
      <td>${s.far ? `<strong class="visit-far">${s.far}</strong>` : 0}</td><td>${s.nogps ? `<strong class="visit-far">${s.nogps}</strong>` : 0}</td>
      <td>${s.planned ? `${s.plannedVisited} из ${s.planned}` : '—'}</td><td>${s.late ? `<strong class="visit-far">${s.late}</strong>` : 0}</td><td>${t(s.firstAt)} / ${t(s.lastAt)}</td></tr>`).join('');
    drawRows();
  }
  // 09.10.2026: отметки занимают много места — по умолчанию последние 10,
  // выбор 20/50/100/все (CSV по-прежнему выгружает все отметки периода).
  function drawRows() {
    if (!last) return;
    const shown = visitsReportLimit ? last.rows.slice(0, visitsReportLimit) : last.rows;
    const cnt = document.getElementById('vr-count');
    if (cnt) cnt.textContent = last.rows.length ? (shown.length < last.rows.length ? `· показаны последние ${shown.length} из ${last.rows.length}` : `· ${last.rows.length}`) : '';
    document.getElementById('vr-rows').innerHTML = shown.map((r) => `<tr>
      <td>${r.lat != null ? `<input type="checkbox" class="vr-pick" data-i="${r._i}" ${vrSelected.has(r._i) ? 'checked' : ''}>` : ''}</td>
      <td>${escapeHtml(r.date.split('-').reverse().join('.'))}</td><td>${escapeHtml(r.time)}</td><td>${escapeHtml(r.agentName)}</td>
      <td>${escapeHtml(r.clientName)}${r.ownerName !== r.agentName ? ` <span class="muted">(клиент: ${escapeHtml(r.ownerName)})</span>` : ''}</td>
      <td><span class="visit-st visit-${r.status}">${visitStatusText(r)}</span>${r.accuracy ? ` <span class="muted">±${r.accuracy} м</span>` : ''}</td>
      <td>${escapeHtml(r.comment || '')}</td>
      <td>${r.lat != null ? `<a class="maps-link" href="https://2gis.kg/geo/${r.lng},${r.lat}" target="_blank" rel="noopener">${r.status === 'far' ? '📍 где отметился' : 'карта'}</a>` : '—'}${r.status === 'far' && r.pointLat != null ? `<br><a class="maps-link" href="https://2gis.kg/geo/${r.pointLng},${r.pointLat}" target="_blank" rel="noopener">🏠 точка клиента</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">За выбранный период отметок нет.</td></tr>';
    document.querySelectorAll('#vr-rows .vr-pick').forEach((cb) => cb.addEventListener('change', () => {
      const i = Number(cb.dataset.i);
      if (cb.checked) vrSelected.add(i); else vrSelected.delete(i);
      syncPick();
    }));
    syncPick();
  }
  // 15.10.2026: группа отметок на одной карте — галочки у строк, «выбрать все»
  // (все отметки периода с координатами, не только показанные), кнопка карты.
  function syncPick() {
    const withGeo = last ? last.rows.filter((r) => r.lat != null) : [];
    const all = document.getElementById('vr-select-all');
    if (all) {
      all.checked = withGeo.length > 0 && withGeo.every((r) => vrSelected.has(r._i));
      all.indeterminate = !all.checked && vrSelected.size > 0;
      all.parentElement.lastChild.textContent = ` выбрать все (${withGeo.length})`;
    }
    const btn = document.getElementById('vr-map-btn');
    if (btn) { btn.disabled = !vrSelected.size; btn.textContent = `🗺 Показать на карте${vrSelected.size ? ' (' + vrSelected.size + ')' : ''}`; }
  }
  ['vr-from', 'vr-to', 'vr-agent'].forEach((id) => document.getElementById(id).addEventListener('change', () => { load(); loadDistrict(); }));
  // 19.10.2026: точки района по дню недели — 🟢 зашёл (засчитанная отметка в этот день),
  // 🟡 не зашёл, но в этот день была переписка WhatsApp с клиентом, 🔴 ни того, ни другого.
  let district = null;
  const DCOL = { green: '#2e9e5b', yellow: '#e0b21e', red: '#d0473c' };
  const dstat = (r) => (r.visit ? 'green' : (r.waOut || r.waIn) ? 'yellow' : 'red');
  async function loadDistrict() {
    const dbox = document.getElementById('vr-district-box');
    if (!dbox) return;
    if (!vrShowDistrict) { dbox.innerHTML = ''; return; }
    dbox.innerHTML = '<p class="muted">Загрузка…</p>';
    const qs = new URLSearchParams({ from: document.getElementById('vr-from').value, to: document.getElementById('vr-to').value });
    const aid = document.getElementById('vr-agent').value;
    if (aid) qs.set('agentId', aid);
    district = (await api('GET', `/api/reports/coverage?${qs.toString()}`)).rows;
    const cnt = (st) => district.filter((r) => dstat(r) === st).length;
    const withGeo = district.filter((r) => r.lat != null).length;
    const byAgentDate = new Map();
    district.forEach((r) => { const k = `${r.ownerName}|${r.date}`; if (!byAgentDate.has(k)) byAgentDate.set(k, []); byAgentDate.get(k).push(r); });
    const order = { red: 0, yellow: 1, green: 2 };
    dbox.innerHTML = `
      <div class="assort-panel" style="margin-top:8px">
        <div class="filter-bar" style="align-items:center;margin:0 0 6px">
          <h3 style="margin:0">Точки района по дню недели</h3>
          <span><span class="dist-dot" style="background:${DCOL.green}"></span> зашёл — ${cnt('green')}</span>
          <span><span class="dist-dot" style="background:${DCOL.yellow}"></span> WhatsApp в этот день — ${cnt('yellow')}</span>
          <span><span class="dist-dot" style="background:${DCOL.red}"></span> не зашёл — ${cnt('red')}</span>
          <button type="button" class="btn-primary" id="vr-district-map" ${withGeo ? '' : 'disabled'}>🗺 На карте (${withGeo} с координатами)</button>
        </div>
        ${district.length ? [...byAgentDate.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([k, rs]) => {
          const [agent, date] = k.split('|');
          return `<div style="margin:6px 0"><strong>${escapeHtml(agent)}</strong> · ${escapeHtml(date.split('-').reverse().join('.'))} · ${escapeHtml((rs[0].visitDay || '').toLowerCase())} <span class="muted">(${rs.length} точек: зашёл ${rs.filter((r) => dstat(r) === 'green').length}, WA ${rs.filter((r) => dstat(r) === 'yellow').length}, нет ${rs.filter((r) => dstat(r) === 'red').length})</span>
            <div class="dist-chips">${rs.slice().sort((a, b) => order[dstat(a)] - order[dstat(b)] || a.clientName.localeCompare(b.clientName, 'ru')).map((r) => {
              const st = dstat(r);
              const tip = st === 'green' ? `зашёл ${r.visitAt ? new Date(r.visitAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }) : ''}` : st === 'yellow' ? `WhatsApp: агент ${r.waOut}, клиент ${r.waIn}` : 'не зашёл, переписки не было';
              return `<button type="button" class="dist-chip dist-${st}" data-id="${r.clientId}" title="${escapeAttr(tip + (r.address ? ' · ' + r.address : ''))}">${escapeHtml(r.clientName)}</button>`;
            }).join('')}</div></div>`;
        }).join('') : '<p class="muted">В выбранные даты нет клиентов с этим днём визита (у клиентов без дня визита район не определён).</p>'}
      </div>`;
    dbox.querySelectorAll('.dist-chip').forEach((b) => b.addEventListener('click', () => { const c = clientById(Number(b.dataset.id)); if (c) openClientModal(c); }));
    const mb = document.getElementById('vr-district-map');
    if (mb) mb.addEventListener('click', () => openDistrictMap(district, dstat, DCOL));
  }
  document.getElementById('vr-district').addEventListener('change', (e) => { vrShowDistrict = e.target.checked; loadDistrict(); });
  loadDistrict();
  document.getElementById('vr-limit').addEventListener('change', (e) => { visitsReportLimit = Number(e.target.value) || 0; drawRows(); });
  document.getElementById('vr-select-all').addEventListener('change', (e) => {
    vrSelected = new Set(e.target.checked && last ? last.rows.filter((r) => r.lat != null).map((r) => r._i) : []);
    drawRows();
  });
  document.getElementById('vr-map-btn').addEventListener('click', () => {
    if (!last || !vrSelected.size) return;
    openVisitsMap(last.rows.filter((r) => vrSelected.has(r._i)));
  });
  document.getElementById('vr-csv').addEventListener('click', () => {
    if (!last) return;
    const head = ['Дата', 'Время', 'Агент', 'Клиент', 'Адрес', 'Закреплён за', 'Статус', 'Расстояние, м', 'Точность GPS, м', 'Комментарий', 'Где отметился (карта)', 'Точка клиента (карта)'];
    const lines = last.rows.map((r) => [r.date, r.time, r.agentName, r.clientName, r.clientAddress, r.ownerName, visitStatusText(r), r.distance ?? '', r.accuracy ?? '', r.comment || '', r.lat != null ? `https://2gis.kg/geo/${r.lng},${r.lat}` : '', r.pointLat != null ? `https://2gis.kg/geo/${r.pointLng},${r.pointLat}` : '']);
    const csv = '﻿' + [head, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `posescheniya_${last.from}_${last.to}.csv`;
    a.click();
  });
  load();
}

// ---------- Карта группы отметок (15.10.2026) ----------
// Leaflet подгружается из CDN только при первом открытии карты; подложка — 2ГИС.
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletPromise = null; reject(new Error('Не удалось загрузить карту — проверьте интернет')); };
    document.head.appendChild(js);
  });
  return leafletPromise;
}

const VISIT_MAP_COLORS = { near: '#2e9e5b', first: '#2e9e5b', far: '#e08a1e', nogps: '#e08a1e', lowacc: '#e08a1e', reset: '#d0473c' };

async function openVisitsMap(rows) {
  const agents = [...new Set(rows.map((r) => r.agentName))];
  openModal(`
    <h2>Отметки на карте <span class="muted" style="font-size:14px;font-weight:400">· ${rows.length}</span></h2>
    <div class="muted" style="font-size:12px;margin:-4px 0 6px">
      <span style="color:#2e9e5b">●</span> у точки / первая · <span style="color:#e08a1e">●</span> далеко / без точного GPS · <span style="color:#d0473c">●</span> сброшена · ○ точка клиента (для «далеко») · линия — порядок по времени у каждого агента
    </div>
    ${agents.length > 1 ? `<div class="wa-tabs" id="vmap-agents"><button type="button" class="wa-tab active" data-agent="">Все агенты</button>${agents.map((a) => `<button type="button" class="wa-tab" data-agent="${escapeAttr(a)}">${escapeHtml(a)}</button>`).join('')}</div>` : ''}
    <div id="visits-map" style="height:65vh;min-height:360px;border-radius:8px;overflow:hidden;background:#1d1828"></div>
    <div class="modal-actions"><button type="button" class="btn-secondary" id="cancel-modal">Закрыть</button></div>`);
  document.querySelector('#modal-root .modal').classList.add('modal-wide');
  let L;
  try { L = await loadLeaflet(); } catch (e) { document.getElementById('visits-map').innerHTML = `<p class="error" style="padding:12px">${escapeHtml(e.message)}</p>`; return; }
  const box = document.getElementById('visits-map');
  if (!box) return;
  const map = L.map(box);
  L.tileLayer('https://tile2.maps.2gis.com/tiles?x={x}&y={y}&z={z}', { maxZoom: 18, attribution: '© 2ГИС' }).addTo(map);
  let layer = L.layerGroup().addTo(map);
  const t = (r) => `${escapeHtml(r.date.split('-').reverse().join('.'))} ${escapeHtml(r.time)}`;
  function draw(agent) {
    layer.clearLayers();
    const list = rows.filter((r) => !agent || r.agentName === agent);
    const bounds = [];
    list.forEach((r) => {
      const color = VISIT_MAP_COLORS[r.status] || '#f0712c';
      const m = L.circleMarker([r.lat, r.lng], { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }).addTo(layer);
      m.bindPopup(`<strong>${escapeHtml(r.clientName)}</strong><br>${escapeHtml(r.agentName)} · ${t(r)}<br>${visitStatusText(r)}${r.distance != null ? ` · ${r.distance} м` : ''}${r.comment ? `<br><em>${escapeHtml(r.comment)}</em>` : ''}<br><a href="https://2gis.kg/geo/${r.lng},${r.lat}" target="_blank" rel="noopener">открыть в 2ГИС</a>`);
      m.bindTooltip(`${escapeHtml(r.clientName)} · ${escapeHtml(r.time)}`);
      bounds.push([r.lat, r.lng]);
      if (r.status === 'far' && r.pointLat != null) {
        L.circleMarker([r.pointLat, r.pointLng], { radius: 6, color: color, weight: 2, fillColor: '#fff', fillOpacity: 0.9 }).addTo(layer).bindTooltip(`Точка клиента: ${escapeHtml(r.clientName)}`);
        L.polyline([[r.lat, r.lng], [r.pointLat, r.pointLng]], { color, weight: 2, dashArray: '4 4' }).addTo(layer);
        bounds.push([r.pointLat, r.pointLng]);
      }
    });
    // Маршрут агента — отметки по времени.
    [...new Set(list.map((r) => r.agentName))].forEach((a, i) => {
      const pts = list.filter((r) => r.agentName === a).sort((x, y) => (x.at < y.at ? -1 : 1)).map((r) => [r.lat, r.lng]);
      if (pts.length > 1) L.polyline(pts, { color: ['#f0712c', '#d8b46a', '#5ec8e0', '#f28fb0', '#3fbfa0', '#f2a154'][i % 6], weight: 2, opacity: 0.7 }).addTo(layer);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }
  setTimeout(() => { map.invalidateSize(); draw(''); }, 50);
  document.querySelectorAll('#vmap-agents .wa-tab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#vmap-agents .wa-tab').forEach((x) => x.classList.toggle('active', x === b));
    draw(b.dataset.agent);
  }));
}

// ---------- Отчёт «WhatsApp: переписка с точками» (15.10.2026) ----------
let wrGroupBy = 'agent';
const WR_DAY_ORDER = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
function wireWhatsappReport() {
  const box = document.getElementById('wr-box');
  if (!box) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const agents = state.users.filter((u) => u.role === 'agent');
  box.innerHTML = `
    <div class="filter-bar">
      <label class="muted" style="margin:0">с <input type="date" id="wr-from" value="${today.slice(0, 8)}01"></label>
      <label class="muted" style="margin:0">по <input type="date" id="wr-to" value="${today}"></label>
      <select id="wr-agent"><option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
      <select id="wr-group">
        <option value="agent" ${wrGroupBy === 'agent' ? 'selected' : ''}>по агентам</option>
        <option value="day" ${wrGroupBy === 'day' ? 'selected' : ''}>по дню визита (маршрут)</option>
        <option value="agentday" ${wrGroupBy === 'agentday' ? 'selected' : ''}>агент + день визита</option>
        <option value="type" ${wrGroupBy === 'type' ? 'selected' : ''}>по типу точки</option>
      </select>
      <button type="button" class="btn-secondary" id="wr-csv">⬇ Выгрузить в Excel (CSV)</button>
    </div>
    <div id="wr-conn" class="muted" style="font-size:12px;margin:6px 0"></div>
    <div class="table-wrap"><table><thead><tr><th>Группа</th><th>Точек</th><th>С номером</th><th>Написали</th><th>% от точек</th><th>Ответили</th><th>Не написали</th><th>Сообщений агента</th><th>Первое / последнее сообщение</th></tr></thead><tbody id="wr-rows"></tbody></table></div>
    <div id="wr-list"></div>`;
  let last = null;
  const groupKey = (r) => {
    const day = r.visitDay ? r.visitDay.trim().toLowerCase() : '';
    if (wrGroupBy === 'day') return day || 'день не указан';
    if (wrGroupBy === 'agentday') return `${r.ownerName} · ${day || 'день не указан'}`;
    if (wrGroupBy === 'type') return r.pointType || 'тип не указан';
    return r.ownerName;
  };
  const dayRank = (k) => { const i = WR_DAY_ORDER.findIndex((d) => k.endsWith(d)); return i < 0 ? 99 : i; };
  function groups() {
    const map = new Map();
    last.rows.forEach((r) => { const k = groupKey(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); });
    let list = [...map.entries()].map(([k, rs]) => ({
      key: k, rows: rs,
      total: rs.length,
      phone: rs.filter((r) => r.hasPhone).length,
      wrote: rs.filter((r) => r.out > 0),
      replied: rs.filter((r) => r.inc > 0).length,
      notWrote: rs.filter((r) => r.out === 0),
      msgs: rs.reduce((x, r) => x + r.out, 0),
      firstOut: rs.reduce((x, r) => (r.firstOut && (!x || r.firstOut < x) ? r.firstOut : x), 0),
      lastOut: rs.reduce((x, r) => (r.lastOut > x ? r.lastOut : x), 0)
    }));
    if (wrGroupBy === 'day') list.sort((a, b) => dayRank(a.key) - dayRank(b.key));
    else if (wrGroupBy === 'agentday') list.sort((a, b) => a.key.split(' · ')[0].localeCompare(b.key.split(' · ')[0], 'ru') || dayRank(a.key) - dayRank(b.key));
    else list.sort((a, b) => b.total - a.total);
    return list;
  }
  function draw() {
    const gs = groups();
    const sum = (f) => gs.reduce((x, g) => x + f(g), 0);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    const tr = (g, i, bold) => `<tr${bold ? ' style="font-weight:700"' : ''}>
      <td>${escapeHtml(g.key)}</td><td>${g.total}</td><td>${g.phone}</td>
      <td>${g.wrote.length ? `<button type="button" class="link-btn wr-show" data-i="${i}" data-kind="wrote">${g.wrote.length}</button>` : 0}</td>
      <td>${pct(g.wrote.length, g.total)}</td><td>${g.replied}</td>
      <td>${g.notWrote.length ? `<button type="button" class="link-btn wr-show" data-i="${i}" data-kind="not">${g.notWrote.length}</button>` : 0}</td>
      <td>${g.msgs}</td><td>${g.firstOut ? `${escapeHtml(waTime(g.firstOut))} / ${escapeHtml(waTime(g.lastOut))}` : '—'}</td></tr>`;
    const total = { key: 'Итого', total: sum((g) => g.total), phone: sum((g) => g.phone), wrote: gs.flatMap((g) => g.wrote), replied: sum((g) => g.replied), notWrote: gs.flatMap((g) => g.notWrote), msgs: sum((g) => g.msgs),
      firstOut: gs.reduce((x, g) => (g.firstOut && (!x || g.firstOut < x) ? g.firstOut : x), 0), lastOut: gs.reduce((x, g) => (g.lastOut > x ? g.lastOut : x), 0) };
    document.getElementById('wr-rows').innerHTML = gs.map((g, i) => tr(g, i)).join('') + (gs.length > 1 ? tr(total, -1, true) : '') || '<tr><td colspan="9" class="muted">Нет точек.</td></tr>';
    document.getElementById('wr-list').innerHTML = '';
    document.querySelectorAll('#wr-rows .wr-show').forEach((b) => b.addEventListener('click', () => {
      const g = Number(b.dataset.i) < 0 ? total : gs[Number(b.dataset.i)];
      const list = b.dataset.kind === 'wrote' ? g.wrote : g.notWrote;
      const title = `${b.dataset.kind === 'wrote' ? 'Написали' : 'Не написали'} — ${escapeHtml(g.key)} (${list.length})`;
      document.getElementById('wr-list').innerHTML = `<h3 style="margin:14px 0 6px">${title}</h3>
        <div class="table-wrap"><table><thead><tr><th>Точка</th><th>Агент</th><th>День визита</th><th>Адрес</th><th>Номер</th><th>Написано</th><th>Ответов</th><th>Первое от агента</th><th>Последнее от агента</th><th>Последний ответ клиента</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td><button type="button" class="link-btn wr-open" data-id="${r.clientId}">${escapeHtml(r.clientName)}</button></td><td>${escapeHtml(r.ownerName)}${r.writers.length && r.writers.some((w) => w !== r.ownerName) ? ` <span class="muted">(писал: ${escapeHtml(r.writers.join(', '))})</span>` : ''}</td><td>${escapeHtml(r.visitDay || '—')}</td><td>${escapeHtml(r.address || '—')}</td><td>${r.hasPhone ? '✓' : '<span class="muted">нет номера</span>'}</td><td>${r.out}</td><td>${r.inc}</td><td>${r.firstOut ? escapeHtml(waTime(r.firstOut)) : '—'}</td><td>${r.lastOut ? escapeHtml(waTime(r.lastOut)) : '—'}</td><td>${r.lastIn ? escapeHtml(waTime(r.lastIn)) : '—'}</td></tr>`).join('')}
        </tbody></table></div>`;
      document.querySelectorAll('#wr-list .wr-open').forEach((x) => x.addEventListener('click', () => { const c = clientById(Number(x.dataset.id)); if (c) openClientModal(c); }));
      document.getElementById('wr-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  async function load() {
    const qs = new URLSearchParams({ from: document.getElementById('wr-from').value, to: document.getElementById('wr-to').value });
    const aid = document.getElementById('wr-agent').value;
    if (aid) qs.set('agentId', aid);
    document.getElementById('wr-rows').innerHTML = '<tr><td colspan="9" class="muted">Загрузка…</td></tr>';
    last = await api('GET', `/api/reports/whatsapp?${qs.toString()}`);
    const off = (last.connected || []).filter((c) => c.status !== 'connected' && (!aid || String(c.agentId) === aid));
    document.getElementById('wr-conn').innerHTML = off.length ? `⚠ WhatsApp сейчас не подключён: ${off.map((c) => escapeHtml(c.agentName)).join(', ')} — их новые сообщения в отчёт не попадают.` : '';
    draw();
  }
  ['wr-from', 'wr-to', 'wr-agent'].forEach((id) => document.getElementById(id).addEventListener('change', load));
  document.getElementById('wr-group').addEventListener('change', (e) => { wrGroupBy = e.target.value; if (last) draw(); });
  document.getElementById('wr-csv').addEventListener('click', () => {
    if (!last) return;
    const head = ['Точка', 'Агент', 'День визита', 'Тип точки', 'Адрес', 'Есть номер', 'Написано агентом', 'Ответов клиента', 'Первое от агента', 'Последнее от агента', 'Последний ответ клиента', 'Писали агенты'];
    const lines = last.rows.map((r) => [r.clientName, r.ownerName, r.visitDay, r.pointType, r.address, r.hasPhone ? 'да' : 'нет', r.out, r.inc, r.firstOut ? waTime(r.firstOut) : '', r.lastOut ? waTime(r.lastOut) : '', r.lastIn ? waTime(r.lastIn) : '', r.writers.join(', ')]);
    const csv = '\ufeff' + [head, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `whatsapp_${last.from}_${last.to}.csv`;
    a.click();
  });
  load();
}

// ---------- Отчёт «WhatsApp: клиенты без ответа до 20:00» (15.10.2026) ----------
function wireWhatsappUnansweredReport() {
  const box = document.getElementById('wu-box');
  if (!box) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() + 6 * 3600 * 1000 - 6 * 86400000).toISOString().slice(0, 10);
  const agents = state.users.filter((u) => u.role === 'agent');
  box.innerHTML = `
    <div class="filter-bar">
      <label class="muted" style="margin:0">с <input type="date" id="wu-from" value="${weekAgo}"></label>
      <label class="muted" style="margin:0">по <input type="date" id="wu-to" value="${today}"></label>
      <select id="wu-agent"><option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
      <select id="wu-status"><option value="">Нет ответа + позже срока</option><option value="none">Только нет ответа</option><option value="late">Только ответ позже срока</option></select>
      <button type="button" class="btn-secondary" id="wu-csv">⬇ Выгрузить в Excel (CSV)</button>
    </div>
    <div id="wu-summary" class="muted" style="font-size:13px;margin:6px 0"></div>
    ${repFold('fold-wu', 'Список клиентов <span class="muted" id="wu-cnt"></span>', `<div class="table-wrap"><table><thead><tr><th>Клиент написал</th><th>Клиент</th><th>Агент (номер)</th><th>Сообщение клиента</th><th>Срок ответа</th><th>Ответ агента</th><th>Статус</th></tr></thead><tbody id="wu-rows"></tbody></table></div>`)}`;
  let last = null;
  const filtered = () => {
    const st = document.getElementById('wu-status').value;
    return last.rows.filter((r) => !st || r.status === st);
  };
  const late = (r) => {
    const h = Math.round((r.replyAt - r.deadline) / 3600);
    return h >= 1 ? `+${h} ч` : `+${Math.max(1, Math.round((r.replyAt - r.deadline) / 60))} мин`;
  };
  function draw() {
    const list = filtered();
    const byAgent = {};
    list.forEach((r) => { byAgent[r.agentName] = (byAgent[r.agentName] || 0) + 1; });
    const none = list.filter((r) => r.status === 'none').length;
    document.getElementById('wu-summary').innerHTML = list.length
      ? `Всего: <strong>${list.length}</strong> (нет ответа — <strong class="visit-far">${none}</strong>, позже срока — ${list.length - none}) · ${Object.entries(byAgent).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${escapeHtml(a)} — ${n}`).join(', ')}`
      : '';
    const wuCnt = document.getElementById('wu-cnt'); if (wuCnt) wuCnt.textContent = `(${list.length})`;
    document.getElementById('wu-rows').innerHTML = list.map((r) => `<tr>
      <td>${escapeHtml(waTime(r.msgAt))}</td>
      <td><button type="button" class="link-btn wu-open" data-id="${r.clientId}">${escapeHtml(r.clientName)}</button>${r.ownerName !== r.agentName ? ` <span class="muted">(клиент: ${escapeHtml(r.ownerName)})</span>` : ''}</td>
      <td>${escapeHtml(r.agentName)}<br><span class="muted">${escapeHtml(r.phone)}</span></td>
      <td style="max-width:320px">${escapeHtml(r.msgText || '—')}${r.msgCount > 1 ? ` <span class="muted">(+${r.msgCount - 1} сообщ.)</span>` : ''}</td>
      <td>${escapeHtml(waTime(r.deadline))}</td>
      <td>${r.replyAt ? `${escapeHtml(waTime(r.replyAt))} <span class="muted">(${late(r)})</span>` : '—'}</td>
      <td>${r.status === 'none' ? '<strong class="visit-far">нет ответа</strong>' : '<span class="visit-st visit-far">позже срока</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">За период все обращения клиентов отвечены до 20:00 (или переписки нет).</td></tr>';
    document.querySelectorAll('#wu-rows .wu-open').forEach((b) => b.addEventListener('click', () => { const c = clientById(Number(b.dataset.id)); if (c) openClientModal(c); }));
  }
  async function load() {
    const qs = new URLSearchParams({ from: document.getElementById('wu-from').value, to: document.getElementById('wu-to').value });
    const aid = document.getElementById('wu-agent').value;
    if (aid) qs.set('agentId', aid);
    document.getElementById('wu-rows').innerHTML = '<tr><td colspan="7" class="muted">Загрузка…</td></tr>';
    last = await api('GET', `/api/reports/whatsapp-unanswered?${qs.toString()}`);
    draw();
  }
  ['wu-from', 'wu-to', 'wu-agent'].forEach((id) => document.getElementById(id).addEventListener('change', load));
  document.getElementById('wu-status').addEventListener('change', () => { if (last) draw(); });
  document.getElementById('wu-csv').addEventListener('click', () => {
    if (!last) return;
    const head = ['Клиент написал', 'Клиент', 'Ответственный', 'Агент (номер)', 'Номер клиента', 'Сообщение клиента', 'Сообщений подряд', 'Срок ответа', 'Ответ агента', 'Статус'];
    const lines = filtered().map((r) => [waTime(r.msgAt), r.clientName, r.ownerName, r.agentName, r.phone, r.msgText, r.msgCount, waTime(r.deadline), r.replyAt ? waTime(r.replyAt) : '', r.status === 'none' ? 'нет ответа' : 'позже срока']);
    const csv = '\ufeff' + [head, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bez_otveta_${last.from}_${last.to}.csv`;
    a.click();
  });
  load();
}

// ---------- Отчёт «Охват района: посещение / WhatsApp» (15.10.2026) ----------
const CV_STATUS = { both: 'посещение + WhatsApp', visit: 'только посещение', wa: 'только WhatsApp', none: 'ни того, ни другого' };
function wireCoverageReport() {
  const box = document.getElementById('cv-box');
  if (!box) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const agents = state.users.filter((u) => u.role === 'agent');
  box.innerHTML = `
    <div class="filter-bar">
      <label class="muted" style="margin:0">с <input type="date" id="cv-from" value="${today}"></label>
      <label class="muted" style="margin:0">по <input type="date" id="cv-to" value="${today}"></label>
      <select id="cv-agent"><option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
      <select id="cv-day"><option value="">День недели: все</option>${VISIT_DAYS.map((d) => `<option value="${d}">${d}</option>`).join('')}</select>
      <button type="button" class="btn-secondary" id="cv-csv">⬇ Выгрузить в Excel (CSV)</button>
    </div>
    <h3 style="margin:10px 0 4px">Общий охват за период по районам — без привязки к дате</h3>
    <div class="muted" style="font-size:12px;margin-bottom:4px">Клиент охвачен, если за период было посещение в любой день и/или агент написал ему в WhatsApp. Районы — по дню визита клиента.</div>
    <div class="table-wrap"><table><thead><tr><th>Агент</th><th>Район (день визита)</th><th>Клиентов</th><th>Посещено</th><th>Написал в WA</th><th>Охвачено</th><th>Ни того, ни другого</th></tr></thead><tbody id="cvp-rows"></tbody></table></div>
    <h3 style="margin:14px 0 4px">По датам: район дня</h3>
    <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Агент</th><th>Дата / район</th><th>Клиентов в районе</th><th>Посещение + WhatsApp</th><th>Только посещение</th><th>Только WhatsApp</th><th>Охвачено</th><th>Ни того, ни другого</th><th title="Клиенты агента (все, не только района дня), которым он написал в WhatsApp хотя бы раз за выбранный период">WhatsApp за период<br><span class="muted" style="font-weight:400">все клиенты</span></th></tr></thead><tbody id="cv-rows"></tbody></table></div>
    <div id="cv-list"></div>`;
  let last = null;
  const t = (iso) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }) : '');
  const ts = (sec) => (sec ? new Date(sec * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }) : '');
  function draw() {
    const map = new Map();
    last.rows.forEach((r) => {
      const k = `${r.ownerName}|${r.date}`;
      if (!map.has(k)) map.set(k, { agent: r.ownerName, date: r.date, day: r.visitDay, rows: [] });
      map.get(k).rows.push(r);
    });
    const gs = [...map.values()].sort((a, b) => a.agent.localeCompare(b.agent, 'ru') || a.date.localeCompare(b.date));
    const cnt = (rs, st) => rs.filter((r) => r.status === st);
    const cell = (i, st, list) => (list.length ? `<button type="button" class="link-btn cv-show" data-i="${i}" data-st="${st}">${list.length}</button>` : '0');
    const line = (g, i, bold) => {
      const covered = g.rows.length - cnt(g.rows, 'none').length;
      const pct = g.rows.length ? Math.round((covered / g.rows.length) * 100) : 0;
      return `<tr${bold ? ' style="font-weight:700"' : ''}><td>${escapeHtml(g.agent)}</td><td>${g.date ? escapeHtml(g.date.split('-').reverse().join('.')) + ' · ' + escapeHtml((g.day || '').toLowerCase()) : ''}</td>
        <td>${cell(i, 'all', g.rows)}</td><td>${cell(i, 'both', cnt(g.rows, 'both'))}</td><td>${cell(i, 'visit', cnt(g.rows, 'visit'))}</td><td>${cell(i, 'wa', cnt(g.rows, 'wa'))}</td>
        <td>${covered} <span class="muted">(${pct}%)</span></td><td>${cnt(g.rows, 'none').length ? `<strong class="visit-far">${cell(i, 'none', cnt(g.rows, 'none'))}</strong>` : 0}</td>${waCell(g, i, bold)}</tr>`;
    };
    // Охват WhatsApp за период — одна цифра на агента (в первой строке агента), в «Итого» — по всем.
    const firstOfAgent = new Set();
    const waCell = (g, i, bold) => {
      const wp = last.waPeriod || {};
      if (bold) {
        const all = Object.values(wp);
        const w = all.reduce((x, v) => x + v.written, 0); const t = all.reduce((x, v) => x + v.total, 0);
        return `<td>${t ? Math.round(w / t * 100) : 0}% <span class="muted">(${w} из ${t})</span></td>`;
      }
      if (firstOfAgent.has(g.agent)) return '<td></td>';
      firstOfAgent.add(g.agent);
      const v = wp[g.rows[0].ownerId];
      return v ? `<td>${v.total ? Math.round(v.written / v.total * 100) : 0}% <span class="muted">(${v.written} из ${v.total})</span></td>` : '<td>—</td>';
    };
    const total = { agent: 'Итого', date: '', day: '', rows: last.rows };
    document.getElementById('cv-rows').innerHTML = gs.map((g, i) => line(g, i)).join('') + (gs.length > 1 ? line(total, -1, true) : '')
      || '<tr><td colspan="9" class="muted">В выбранные даты нет клиентов с этим днём визита (у клиентов без дня визита район не определён).</td></tr>';
    // Общий охват за период по районам.
    const pmap = new Map();
    (last.periodRows || []).forEach((r) => {
      const k = `${r.ownerName}|${r.visitDay}`;
      if (!pmap.has(k)) pmap.set(k, { agent: r.ownerName, day: r.visitDay, rows: [] });
      pmap.get(k).rows.push(r);
    });
    const DAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
    const drank = (d) => { const i = DAYS.indexOf(d); return i < 0 ? 99 : i; };
    const pgs = [...pmap.values()].sort((a, b) => a.agent.localeCompare(b.agent, 'ru') || drank(a.day) - drank(b.day));
    const pline = (g, i, bold) => {
      const v = g.rows.filter((r) => r.visits).length, w = g.rows.filter((r) => r.waOut).length;
      const none = g.rows.filter((r) => !r.visits && !r.waOut);
      const cov = g.rows.length - none.length;
      return `<tr${bold ? ' style="font-weight:700"' : ''}><td>${escapeHtml(g.agent)}</td><td>${g.day ? escapeHtml(g.day) : (bold ? '' : '<span class="muted">день не указан</span>')}</td>
        <td>${g.rows.length}</td><td>${v}</td><td>${w}</td><td>${cov} <span class="muted">(${g.rows.length ? Math.round(cov / g.rows.length * 100) : 0}%)</span></td>
        <td>${none.length ? `<button type="button" class="link-btn cvp-show" data-i="${i}"><strong class="visit-far">${none.length}</strong></button>` : 0}</td></tr>`;
    };
    const ptotal = { agent: 'Итого', day: '', rows: last.periodRows || [] };
    document.getElementById('cvp-rows').innerHTML = pgs.map((g, i) => pline(g, i)).join('') + (pgs.length > 1 ? pline(ptotal, -1, true) : '') || '<tr><td colspan="7" class="muted">Нет клиентов.</td></tr>';
    document.querySelectorAll('#cvp-rows .cvp-show').forEach((b) => b.addEventListener('click', () => {
      const g = Number(b.dataset.i) < 0 ? ptotal : pgs[Number(b.dataset.i)];
      const list = g.rows.filter((r) => !r.visits && !r.waOut);
      document.getElementById('cv-list').innerHTML = `<h3 style="margin:14px 0 6px">${escapeHtml(g.agent)}${g.day ? ' · ' + escapeHtml(g.day) : ''} — не охвачены за период (${list.length})</h3>
        <div class="table-wrap"><table><thead><tr><th>Клиент</th><th>Агент</th><th>День визита</th><th>Адрес</th><th>Номер</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td><button type="button" class="link-btn cv-open" data-id="${r.clientId}">${escapeHtml(r.clientName)}</button></td><td>${escapeHtml(r.ownerName)}</td><td>${escapeHtml(r.visitDay || '—')}</td><td>${escapeHtml(r.address || '—')}</td><td>${r.hasPhone ? '✓' : '<span class="muted">нет номера</span>'}</td></tr>`).join('')}
        </tbody></table></div>`;
      document.querySelectorAll('#cv-list .cv-open').forEach((x) => x.addEventListener('click', () => { const c = clientById(Number(x.dataset.id)); if (c) openClientModal(c); }));
      document.getElementById('cv-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    document.getElementById('cv-list').innerHTML = '';
    document.querySelectorAll('#cv-rows .cv-show').forEach((b) => b.addEventListener('click', () => {
      const g = Number(b.dataset.i) < 0 ? total : gs[Number(b.dataset.i)];
      const st = b.dataset.st;
      const list = st === 'all' ? g.rows : g.rows.filter((r) => r.status === st);
      document.getElementById('cv-list').innerHTML = `<h3 style="margin:14px 0 6px">${escapeHtml(g.agent)}${g.date ? ' · ' + escapeHtml(g.date.split('-').reverse().join('.')) : ''} — ${st === 'all' ? 'все клиенты района' : CV_STATUS[st]} (${list.length})</h3>
        <div class="table-wrap"><table><thead><tr><th>Дата</th><th>Клиент</th><th>Агент</th><th>Адрес</th><th>Посещение</th><th>WhatsApp</th><th>Итог</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td>${escapeHtml(r.date.split('-').reverse().join('.'))}</td>
          <td><button type="button" class="link-btn cv-open" data-id="${r.clientId}">${escapeHtml(r.clientName)}</button></td><td>${escapeHtml(r.ownerName)}</td><td>${escapeHtml(r.address || '—')}</td>
          <td>${r.visit ? `✓ ${t(r.visitAt)}` : '—'}</td>
          <td>${r.waOut || r.waIn ? `✓ ${ts(r.waFirstAt)}${r.waLastAt !== r.waFirstAt ? '–' + ts(r.waLastAt) : ''} <span class="muted">(агент ${r.waOut}, клиент ${r.waIn})</span>` : (r.hasPhone ? '—' : '<span class="muted">нет номера</span>')}</td>
          <td>${r.status === 'none' ? '<strong class="visit-far">ни того, ни другого</strong>' : escapeHtml(CV_STATUS[r.status])}</td></tr>`).join('')}
        </tbody></table></div>`;
      document.querySelectorAll('#cv-list .cv-open').forEach((x) => x.addEventListener('click', () => { const c = clientById(Number(x.dataset.id)); if (c) openClientModal(c); }));
      document.getElementById('cv-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  async function load() {
    const qs = new URLSearchParams({ from: document.getElementById('cv-from').value, to: document.getElementById('cv-to').value });
    const aid = document.getElementById('cv-agent').value;
    const day = document.getElementById('cv-day').value;
    if (aid) qs.set('agentId', aid);
    if (day) qs.set('day', day);
    document.getElementById('cv-rows').innerHTML = '<tr><td colspan="9" class="muted">Загрузка…</td></tr>';
    last = await api('GET', `/api/reports/coverage?${qs.toString()}`);
    draw();
  }
  ['cv-from', 'cv-to', 'cv-agent', 'cv-day'].forEach((id) => document.getElementById(id).addEventListener('change', load));
  document.getElementById('cv-csv').addEventListener('click', () => {
    if (!last) return;
    const head = ['Дата', 'День визита', 'Клиент', 'Агент', 'Адрес', 'Посещение', 'Время посещения', 'Сообщений агента', 'Сообщений клиента', 'WhatsApp время', 'Итог'];
    const lines = last.rows.map((r) => [r.date, r.visitDay, r.clientName, r.ownerName, r.address, r.visit ? 'да' : 'нет', t(r.visitAt), r.waOut, r.waIn, r.waFirstAt ? ts(r.waFirstAt) + (r.waLastAt !== r.waFirstAt ? '–' + ts(r.waLastAt) : '') : '', CV_STATUS[r.status]]);
    const csv = '\ufeff' + [head, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `ohvat_${last.from}_${last.to}.csv`;
    a.click();
  });
  load();
}

// ---------- Недельный отчёт по агентам для PDF (15.10.2026) ----------
function lastFullWeek() {
  const now = new Date(Date.now() + 6 * 3600 * 1000);
  const wd = (now.getUTCDay() + 6) % 7; // 0 = понедельник
  const mon = new Date(now.getTime() - (wd + 7) * 86400000);
  const sat = new Date(mon.getTime() + 5 * 86400000);
  return [mon.toISOString().slice(0, 10), sat.toISOString().slice(0, 10)];
}
// 26.10.2026: списки клиентов в отчётах — свёрнуты, разворачиваются по клику;
// раскрытое остаётся раскрытым при смене фильтров (до перезагрузки страницы).
const repFoldOpen = {};
function repFold(id, summaryHtml, innerHtml) {
  return `<details class="rep-fold" id="${id}" ${repFoldOpen[id] ? 'open' : ''}><summary>${summaryHtml}</summary>${innerHtml}</details>`;
}
document.addEventListener('toggle', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('rep-fold')) repFoldOpen[t.id] = t.open; }, true);

// 26.10.2026: график «Динамика по дням» — два графика с общей осью дат
// (одна шкала на график: суммы и количества не смешиваем на двух осях).
let ddState = null;
function wireDailyDynamics() {
  const box = document.getElementById('dd-box');
  if (!box) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  if (!ddState) ddState = { from: today.slice(0, 8) + '01', to: today, agentId: '', metric: 'clients', mx: 'sales' };
  const agents = state.users.filter((u) => u.role === 'agent');
  box.innerHTML = `<div class="filter-bar">
      <label class="muted" style="margin:0">с <input type="date" id="dd-from" value="${ddState.from}"></label>
      <label class="muted" style="margin:0">по <input type="date" id="dd-to" value="${ddState.to}"></label>
      <select id="dd-agent"><option value="">Вся команда</option>${agents.map((a) => `<option value="${a.id}" ${String(ddState.agentId) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
      <select id="dd-metric" title="Что показывать на графике WhatsApp"><option value="clients" ${ddState.metric === 'clients' ? 'selected' : ''}>WhatsApp: клиентов написали</option><option value="out" ${ddState.metric === 'out' ? 'selected' : ''}>WhatsApp: сообщений агента</option></select>
    </div><div id="dd-charts" class="muted">Загрузка…</div>`;
  const load = async () => {
    const qs = new URLSearchParams({ from: ddState.from, to: ddState.to });
    if (ddState.agentId) qs.set('agentId', ddState.agentId);
    let d;
    try { d = await api('GET', '/api/reports/daily?' + qs.toString()); } catch (e) { document.getElementById('dd-charts').innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`; return; }
    drawDaily(d);
  };
  ['from', 'to', 'agentId', 'metric'].forEach((k) => {
    const elx = document.getElementById(k === 'agentId' ? 'dd-agent' : 'dd-' + k);
    elx.addEventListener('change', () => { ddState[k] = elx.value; load(); });
  });
  load();
}

function drawDaily(d) {
  const host = document.getElementById('dd-charts');
  if (!host) return;
  host.classList.remove('muted');
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const WD = { понедельник: 'Пн', вторник: 'Вт', среда: 'Ср', четверг: 'Чт', пятница: 'Пт', суббота: 'Сб', воскресенье: 'Вс' };
  const waKey = ddState.metric === 'out' ? 'waOut' : 'waClients';
  const salesUntil = d.salesAsOf || today;
  const series = [
    { key: 'sales', title: 'Реализация, сом', color: 'var(--c3)', fmt: (v) => fmtMoney(v), short: (v) => (v >= 1000 ? Math.round(v / 1000) + 'т' : String(v)), until: salesUntil, note: d.salesAsOf ? `данные срезов по ${d.salesAsOf.split('-').reverse().join('.')}` : 'срезов за период нет' },
    { key: 'visitClients', title: 'Посещения: сколько точек посетили', color: 'var(--c2)', fmt: (v) => String(v), short: String, until: today, note: 'по отметкам у точек' },
    { key: waKey, title: ddState.metric === 'out' ? 'WhatsApp: сообщений от агентов' : 'WhatsApp: скольким клиентам написали', color: 'var(--c5)', fmt: (v) => String(v), short: String, until: today, note: '' }
  ];
  const days = d.days;
  const W = Math.max(days.length * 26, (host.clientWidth || 800) - 4), H = 170, PL = 64, PR = 8, PT = 14, PB = 34;
  const bw = (W - PL - PR) / days.length;
  const svgFor = (sr) => {
    // Рабочие дни для среднего и «падения» — Пн–Пт (в субботу/воскресенье продаж обычно нет).
    const isWeekend = (x) => x.wd === 'воскресенье' || x.wd === 'суббота';
    // Сегодняшний день ещё идёт — в среднее и «падение» не берём.
    const work = days.filter((x) => !isWeekend(x) && x.date <= sr.until && x.date < today);
    const avg = work.length ? work.reduce((a, x) => a + x[sr.key], 0) / work.length : 0;
    const max = Math.max(1, ...days.map((x) => x[sr.key]));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
    const y = (v) => PT + (H - PT - PB) * (1 - v / nice);
    const ticks = sr.key !== 'sales' && nice < 2 ? [0, nice] : [0, nice / 2, nice];
    let prevWork = null;
    const bars = days.map((x, i) => {
      const v = x[sr.key];
      const future = x.date > sr.until;
      const sunday = isWeekend(x);
      const drop = !future && !sunday && x.date < today && avg > 0 && v < avg * 0.5;
      const delta = prevWork != null && !sunday && !future ? v - prevWork[sr.key] : null;
      if (!sunday && !future) prevWork = x;
      const bx = PL + i * bw + 1, w = Math.max(2, bw - 2), top = y(v), base = y(0), r = Math.min(4, w / 2, base - top);
      const path = v > 0 ? `M${bx},${base} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + w - r} Q${bx + w},${top} ${bx + w},${top + r} V${base} Z` : '';
      const tip = `${x.date.split('-').reverse().join('.')} (${WD[x.wd] || ''})\n${sr.title}: ${future ? 'данных ещё нет' : sr.fmt(v)}${sr.key === 'sales' && x.invoices ? ' · накладных ' + x.invoices : ''}${sr.key === 'visitClients' ? ` · отметок ${x.visits}` : sr.key !== 'sales' ? ` · ответов клиентов ${x.waIn}` : ''}${delta != null ? `\nк пред. рабочему дню: ${delta >= 0 ? '+' : ''}${sr.fmt(delta)}` : ''}${drop ? '\n▼ падение: меньше половины среднего (' + sr.fmt(Math.round(avg)) + ')' : ''}`;
      return `<g class="dd-bar"><title>${escapeHtml(tip)}</title>
        ${sunday ? `<rect x="${PL + i * bw}" y="${PT}" width="${bw}" height="${H - PT - PB}" fill="var(--surface-2)" opacity=".6"></rect>` : ''}
        <rect x="${PL + i * bw}" y="${PT}" width="${bw}" height="${H - PT}" fill="transparent"></rect>
        ${path ? `<path d="${path}" fill="${drop ? 'var(--danger)' : sr.color}"></path>` : ''}
        ${!future && v > 0 && bw >= 20 ? `<text x="${bx + w / 2}" y="${top - (drop ? 13 : 3)}" text-anchor="middle" font-size="9" fill="var(--muted)">${escapeHtml(sr.short(v))}</text>` : ''}
        ${drop ? `<text x="${bx + w / 2}" y="${Math.min(top, base) - 3}" text-anchor="middle" font-size="10" fill="var(--danger)">▼</text>` : ''}
        <text x="${PL + i * bw + bw / 2}" y="${H - PB + 13}" text-anchor="middle" font-size="10" fill="var(--muted)">${Number(x.date.slice(8))}</text>
        <text x="${PL + i * bw + bw / 2}" y="${H - PB + 25}" text-anchor="middle" font-size="9" fill="var(--muted)" opacity=".8">${WD[x.wd] || ''}</text></g>`;
    }).join('');
    const avgLine = avg > 0 ? `<line x1="${PL}" x2="${W - PR}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1"></line>` : '';
    const grid = ticks.map((t) => `<line x1="${PL}" x2="${W - PR}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)" stroke-width="1"></line><text x="${PL - 6}" y="${y(t) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${escapeHtml(sr.key === 'sales' ? (t >= 1000 ? Math.round(t / 1000) + ' тыс' : String(t)) : String(Math.round(t)))}</text>`).join('');
    const total = days.filter((x) => x.date <= sr.until).reduce((a, x) => a + x[sr.key], 0);
    const drops = days.filter((x) => x.date <= sr.until && x.date < today && !isWeekend(x) && avg > 0 && x[sr.key] < avg * 0.5);
    return `<div class="dd-chart"><div class="dd-head"><b>${escapeHtml(sr.title)}</b> <span class="muted">· за период ${escapeHtml(sr.fmt(total))}${avg > 0 ? ' · среднее за раб. день (пунктир) ' + escapeHtml(sr.fmt(Math.round(avg))) : ''}${sr.note ? ' · ' + escapeHtml(sr.note) : ''}</span>${drops.length ? ` <span class="badge badge-overdue">▼ падение: ${drops.map((x) => Number(x.date.slice(8)) + '.' + x.date.slice(5, 7)).join(', ')}</span>` : ''}</div>
      <div class="dd-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeAttr(sr.title)} по дням">${grid}${bars}${avgLine}</svg></div></div>`;
  };
  // Расшифровка по агентам: итоги за период + матрица «агент × день» по выбранному показателю.
  const sumK = (arr, k, until) => arr.filter((x) => !until || x.date <= until).reduce((a, x) => a + (x[k] || 0), 0);
  const workDays = days.filter((x) => x.wd !== 'суббота' && x.wd !== 'воскресенье' && x.date < today);
  const agentsHtml = (d.byAgent || []).length > 1 || ddState.agentId ? `
    <h3 style="margin:14px 0 6px">Расшифровка по агентам</h3>
    <div class="table-wrap"><table class="mini-table dd-agents"><thead><tr><th>Агент</th><th>Реализация</th><th>Накладных</th><th>В среднем за раб. день</th><th>Посещено точек</th><th>Отметок</th><th>WA: клиентов написали</th><th>WA: сообщений агента</th><th>WA: от клиентов</th></tr></thead><tbody>
      ${(d.byAgent || []).map((a) => { const wd = workDays.filter((x) => x.date <= salesUntil).length || 1; return `<tr><td><button type="button" class="link-btn dd-pick" data-id="${a.agentId}" title="Показать графики этого агента">${escapeHtml(a.agentName)}</button></td><td>${fmtMoney(sumK(a.days, 'sales', salesUntil))}</td><td>${sumK(a.days, 'invoices', salesUntil)}</td><td>${fmtMoney(Math.round(sumK(a.days.filter((x) => x.wd !== 'суббота' && x.wd !== 'воскресенье' && x.date < today), 'sales', salesUntil) / wd))}</td><td>${sumK(a.days, 'visitClients')}</td><td>${sumK(a.days, 'visits')}</td><td>${sumK(a.days, 'waClients')}</td><td>${sumK(a.days, 'waOut')}</td><td>${sumK(a.days, 'waIn')}</td></tr>`; }).join('')}
      ${(d.byAgent || []).length > 1 ? `<tr class="tot"><td>Итого</td><td>${fmtMoney(sumK(days, 'sales', salesUntil))}</td><td>${sumK(days, 'invoices', salesUntil)}</td><td>${fmtMoney(Math.round(sumK(workDays.filter((x) => x.date <= salesUntil), 'sales') / (workDays.filter((x) => x.date <= salesUntil).length || 1)))}</td><td>${sumK(days, 'visitClients')}</td><td>${sumK(days, 'visits')}</td><td>${sumK(days, 'waClients')}</td><td>${sumK(days, 'waOut')}</td><td>${sumK(days, 'waIn')}</td></tr>` : ''}
    </tbody></table></div>
    <div class="filter-bar" style="margin-top:10px"><span class="muted" style="font-size:13px">По агентам по дням:</span>
      ${[['sales', 'Реализация'], ['visitClients', 'Посещения'], ['waClients', 'WA: клиентов'], ['waOut', 'WA: сообщений']].map(([k, l]) => `<button type="button" class="tag-filter-btn dd-mx ${ddState.mx === k ? 'active' : ''}" data-k="${k}">${l}</button>`).join('')}
    </div>
    <div class="table-wrap dd-matrix">${(() => {
      const k = ddState.mx || 'sales';
      const until = k === 'sales' ? salesUntil : today;
      const cell = (a, x) => {
        if (x.date > until) return '<td class="muted">·</td>';
        const v = x[k] || 0;
        const wk = a.days.filter((y) => y.wd !== 'суббота' && y.wd !== 'воскресенье' && y.date <= until && y.date < today);
        const avg = wk.length ? wk.reduce((s2, y) => s2 + (y[k] || 0), 0) / wk.length : 0;
        const weekend = x.wd === 'суббота' || x.wd === 'воскресенье';
        const drop = !weekend && x.date < today && avg > 0 && v < avg * 0.5;
        return `<td class="${weekend ? 'dd-we' : ''} ${drop ? 'dd-drop' : ''}" title="${escapeAttr(a.agentName + ', ' + x.date.split('-').reverse().join('.') + ': ' + (k === 'sales' ? fmtMoney(v) : v) + (drop ? ' — падение (среднее ' + (k === 'sales' ? fmtMoney(Math.round(avg)) : Math.round(avg)) + ')' : ''))}">${v ? (k === 'sales' ? (v >= 1000 ? Math.round(v / 1000) + 'т' : v) : v) : '<span class="muted">0</span>'}${drop ? ' ▼' : ''}</td>`;
      };
      const rows = (d.byAgent || []).map((a) => `<tr><td class="sticky-col">${escapeHtml(a.agentName)}</td>${a.days.map((x) => cell(a, x)).join('')}</tr>`).join('');
      return `<table class="mini-table"><thead><tr><th class="sticky-col">Агент</th>${days.map((x) => `<th class="${x.wd === 'суббота' || x.wd === 'воскресенье' ? 'dd-we' : ''}">${Number(x.date.slice(8))}<br><span class="muted" style="font-weight:400">${WD[x.wd] || ''}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    })()}</div>` : '';
  host.innerHTML = series.map(svgFor).join('') + agentsHtml + `<details style="margin-top:6px"><summary class="muted">Таблица по дням</summary><div class="table-wrap"><table class="mini-table"><thead><tr><th>Дата</th><th>День</th><th>Реализация</th><th>Накладных</th><th>Посещено точек</th><th>Отметок</th><th>WA: клиентов написали</th><th>WA: сообщений агента</th><th>WA: от клиентов</th></tr></thead><tbody>${days.map((x) => `<tr><td>${x.date.split('-').reverse().join('.')}</td><td>${WD[x.wd] || ''}</td><td>${x.date <= salesUntil ? fmtMoney(x.sales) : '—'}</td><td>${x.date <= salesUntil ? x.invoices : '—'}</td><td>${x.visitClients}</td><td>${x.visits}</td><td>${x.waClients}</td><td>${x.waOut}</td><td>${x.waIn}</td></tr>`).join('')}</tbody></table></div></details>`;
  host.querySelectorAll('.dd-pick').forEach((b) => b.addEventListener('click', () => { ddState.agentId = b.dataset.id; const sel = document.getElementById('dd-agent'); if (sel) sel.value = b.dataset.id; sel.dispatchEvent(new Event('change')); }));
  host.querySelectorAll('.dd-mx').forEach((b) => b.addEventListener('click', () => { ddState.mx = b.dataset.k; drawDaily(d); }));
}

function wireWeekReport() {
  const box = document.getElementById('wk-box');
  if (!box) return;
  const [mon, sat] = lastFullWeek();
  box.innerHTML = `
    <div class="filter-bar">
      <label class="muted" style="margin:0">с <input type="date" id="wk-from" value="${mon}"></label>
      <label class="muted" style="margin:0">по <input type="date" id="wk-to" value="${sat}"></label>
      <button type="button" class="btn-primary" id="wk-open">📄 Сформировать отчёт (PDF)</button>
      <span class="muted" id="wk-status" style="font-size:12px"></span>
    </div>`;
  document.getElementById('wk-open').addEventListener('click', async () => {
    const from = document.getElementById('wk-from').value;
    const to = document.getElementById('wk-to').value;
    const st = document.getElementById('wk-status');
    // Окно открываем сразу (иначе браузер заблокирует всплывающее окно после await).
    const w = window.open('', '_blank');
    if (!w) { alert('Браузер заблокировал новое окно — разрешите всплывающие окна для сайта'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:20px">Формирую отчёт…</p>');
    st.textContent = 'Формирую…';
    try {
      const data = await api('GET', `/api/reports/week?from=${from}&to=${to}`);
      w.document.open();
      w.document.write(weekReportHtml(data));
      w.document.close();
      st.textContent = '';
    } catch (e) {
      w.close();
      st.textContent = '';
      alert('Не удалось сформировать: ' + e.message);
    }
  });
}

function weekReportHtml(d) {
  const esc = escapeHtml;
  const dmy = (k) => k.split('-').reverse().join('.');
  const keys = d.agents.length ? d.agents[0].metrics.map((m) => m.key) : [];
  const labels = d.agents.length ? d.agents[0].metrics.map((m) => m.label) : [];
  const short = { visits: 'Посещения за период', coverage: 'Общий охват', answers: 'Ответы до 20:00', sales: 'Продажи / план', shortfall: 'Недопродано', phones: 'Номера', geo: 'Координаты', overdue: 'Просрочка задач', newClients: 'Новые клиенты', akb: 'АКБ/ОКБ', avgCheck: 'Средний чек' };
  const scoreColor = (s, max) => (s >= max * 0.75 ? '#3fd07f' : s >= max * 0.45 ? '#f2b84b' : '#ff6b5e');
  const cell = (m) => `<td class="${m.ok ? 'ok' : 'bad'}"><b>${esc(m.value)}</b><span>${m.ok ? '+1' : '0'}</span></td>`;
  // Итоги по пунктам: где хорошо / где плохо по команде.
  const byKey = keys.map((k, i) => ({ key: k, label: short[k] || labels[i], ok: d.agents.filter((a) => a.metrics[i].ok).length }));
  const good = byKey.filter((x) => x.ok >= Math.ceil(d.agents.length * 0.67)).map((x) => x.label);
  const bad = byKey.filter((x) => x.ok <= Math.floor(d.agents.length * 0.33)).map((x) => x.label);

  const team = `
    <section class="page">
      <header><div><h1>Итоги недели по агентам</h1><div class="sub">${dmy(d.from)} — ${dmy(d.to)} · сформировано ${esc(new Date(d.generatedAt).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek' }))}</div></div>
        <div class="legend"><span class="ok">+1 норма выполнена</span><span class="bad">0 не выполнена</span></div></header>
      <table class="team"><thead><tr><th>#</th><th>Агент</th>${byKey.map((x) => `<th>${esc(x.label)}</th>`).join('')}<th class="info">WhatsApp за период<br><span>без баллов</span></th><th>Балл</th></tr></thead><tbody>
        ${d.agents.map((a) => `<tr><td>${a.rank}</td><td class="nm">${esc(a.agentName)}</td>${a.metrics.map(cell).join('')}<td class="info"><b>${a.waPeriod.pct}%</b><span>${a.waPeriod.written} из ${a.waPeriod.total}</span></td><td class="score" style="color:${scoreColor(a.score, a.max)}">${a.score}<small>/${a.max}</small></td></tr>`).join('')}
        <tr class="tot"><td></td><td>Выполнили норму</td>${byKey.map((x) => `<td>${x.ok} из ${d.agents.length}</td>`).join('')}<td class="info">${(() => { const w = d.agents.reduce((s2, a) => s2 + a.waPeriod.written, 0); const t = d.agents.reduce((s2, a) => s2 + a.waPeriod.total, 0); return t ? Math.round(w / t * 100) + '% (' + w + ' из ' + t + ')' : '—'; })()}</td><td></td></tr>
      </tbody></table>
      <div class="sum">
        <div><h3>👍 Хорошо по команде</h3><p>${good.length ? esc(good.join(', ')) : '—'}</p></div>
        <div><h3>⚠ Плохо по команде</h3><p>${bad.length ? esc(bad.join(', ')) : '—'}</p></div>
        <div><h3>Нормы</h3><p>посещения (хоть раз за период) и общий охват (посещение или WhatsApp за период, в любой день) ≥ ${d.norms.visitPct}% клиентов, ответ клиенту до 20:00, продажи ≥ плана по графику рабочих дней, недопродано снизилось за неделю, номера ≥ ${d.norms.phonePct}%, координаты ≥ ${d.norms.geoPct}%, просроченных задач 0, ≥ 1 новый клиент, АКБ/ОКБ выше, чем неделю назад, средний чек ≥ прошлого месяца.</p></div>
      </div>
    </section>`;

  const agentPage = (a) => `
    <section class="page">
      <header><div><h1>${esc(a.agentName)}</h1><div class="sub">${dmy(d.from)} — ${dmy(d.to)} · место ${a.rank} из ${d.agents.length}</div></div>
        <div class="big" style="color:${scoreColor(a.score, a.max)}">${a.score}<small>/${a.max}</small></div></header>
      <div class="tiles">
        <div class="tile info"><div class="t">Охват WhatsApp за период (все клиенты, без баллов)</div><div class="v">${a.waPeriod.pct}%</div><div class="dt">написал ${a.waPeriod.written} из ${a.waPeriod.total} клиентов; из клиентов с номером — ${a.waPeriod.pctOfPhones}% (${a.waPeriod.withPhone})</div><div class="nr">хотя бы одно сообщение агента за ${dmy(d.from)}–${dmy(d.to)}</div></div>
        ${a.metrics.map((m) => `<div class="tile ${m.ok ? 'ok' : 'bad'}"><div class="t">${esc(m.label)}</div><div class="v">${esc(m.value)} <span class="pt">${m.ok ? '+1' : '0'}</span></div><div class="dt">${esc(m.detail || '')}</div><div class="nr">норма: ${esc(m.norm)}</div></div>`).join('')}
      </div>
      <div class="cols">
        <div><h3>Общий охват за период по районам (дню визита)</h3><table class="mini"><thead><tr><th>Район</th><th>Клиентов</th><th>Посещено</th><th>Написал WA</th><th>Охват</th><th>Ни того, ни др.</th></tr></thead><tbody>
          ${a.districts.map((x) => `<tr><td>${x.day ? esc(x.day.charAt(0).toUpperCase() + x.day.slice(1)) : '<span class="smp">день не указан</span>'}</td><td>${x.total}</td><td>${x.visited}</td><td>${x.wa}</td><td>${x.total ? Math.round(x.covered / x.total * 100) : 0}%</td><td class="${x.nothing ? 'badt' : ''}">${x.nothing}</td></tr>`).join('')}
          ${(() => { const t = (f) => a.districts.reduce((s2, x) => s2 + x[f], 0); const tot = t('total'); return `<tr><td><b>Итого</b></td><td><b>${tot}</b></td><td><b>${t('visited')}</b></td><td><b>${t('wa')}</b></td><td><b>${tot ? Math.round(t('covered') / tot * 100) : 0}%</b></td><td class="badt">${t('nothing')}</td></tr>`; })()}
        </tbody></table><div class="smp">Посещение или сообщение агента в любой день периода — без привязки к дню визита.</div></div>
        <div><h3>Топ-10: не охвачены за период (ни посещения, ни WhatsApp) · всего ${a.nothingCount}</h3><table class="mini"><tbody>
          ${a.notCovered.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc((x.visitDay || '').toLowerCase())}</td><td>${x.hasPhone ? '' : 'нет номера'}</td></tr>`).join('') || '<tr><td>Все клиенты района охвачены 👍</td></tr>'}
        </tbody></table></div>
        <div><h3>Топ-10: больше всего недопродано</h3><table class="mini"><tbody>
          ${a.topShort.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}<div class="smp">${esc(x.sample.join('; '))}</div></td><td>${x.risk} из ${x.total}</td></tr>`).join('') || '<tr><td>Нет недопроданного 👍</td></tr>'}
        </tbody></table></div>
      </div>
    </section>`;

  // Расшифровка по дням Пн–Пт (без баллов) — один лист на всю команду.
  const WD2 = { 'понедельник': 'Пн', 'вторник': 'Вт', 'среда': 'Ср', 'четверг': 'Чт', 'пятница': 'Пт' };
  const som = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU'));
  const dailyPage = `
    <section class="page">
      <header><div><h1>Расшифровка по дням (Пн–Пт)</h1><div class="sub">${dmy(d.from)} — ${dmy(d.to)} · без баллов</div></div></header>
      <table class="team daily"><thead><tr><th rowspan="2">Агент</th><th rowspan="2">День</th><th colspan="4">Район дня (клиенты с этим днём визита)</th><th colspan="3">Работа за день</th><th colspan="2">WhatsApp: без ответа до 20:00</th><th colspan="2">Продажи по накладным</th><th rowspan="2">Новые клиенты</th></tr>
        <tr><th>Клиентов</th><th>Посещено</th><th>Написали в WA</th><th>Ни того, ни др.</th><th>Отметок всего</th><th>Сообщений агента</th><th>Клиентам написал</th><th>Нет ответа</th><th>Позже срока</th><th>Сумма, сом</th><th>Накладных</th></tr></thead><tbody>
        ${d.agents.map((a) => a.daily.map((x, i) => `<tr class="${i === 0 ? 'first' : ''}">${i === 0 ? `<td class="nm" rowspan="${a.daily.length + 1}">${esc(a.agentName)}</td>` : ''}<td>${WD2[x.wd] || ''} ${dmy(x.date).slice(0, 5)}</td>
          <td>${x.district}</td><td>${x.districtVisited}</td><td>${x.districtWa}</td><td class="${x.districtNothing ? 'badt' : ''}">${x.districtNothing}</td>
          <td>${x.visitsAll}</td><td>${x.waOut}</td><td>${x.waClients}</td><td class="${x.unanswered ? 'badt' : ''}">${x.unanswered}</td><td>${x.late}</td>
          <td>${som(x.sales)}</td><td>${x.invoices == null ? '—' : x.invoices}</td><td>${x.newClients}</td></tr>`).join('')
          + (() => { const t = (f) => a.daily.reduce((s2, x) => s2 + (x[f] || 0), 0); return `<tr class="tot"><td>Итого</td><td>${t('district')}</td><td>${t('districtVisited')}</td><td>${t('districtWa')}</td><td>${t('districtNothing')}</td><td>${t('visitsAll')}</td><td>${t('waOut')}</td><td>${t('waClients')}</td><td>${t('unanswered')}</td><td>${t('late')}</td><td>${som(t('sales'))}</td><td>${t('invoices')}</td><td>${t('newClients')}</td></tr>`; })()).join('')}
      </tbody></table>
    </section>`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Неделя ${dmy(d.from)}–${dmy(d.to)}</title>
  <style>
    /* 15.10.2026: тёмная тема (как сайт). print-color-adjust: exact — фон печатается в PDF. */
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { background: #17131f; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #ece8f4; margin: 0; font-size: 10.5px; }
    .page { page-break-after: always; break-after: page; padding: 8mm; min-height: 210mm; background: #17131f; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0712c; padding-bottom: 4px; margin-bottom: 6px; }
    h1 { font-size: 18px; margin: 0; color: #fff; } h3 { font-size: 11px; margin: 6px 0 3px; color: #d8b46a; }
    .sub { color: #9a90ad; font-size: 10px; }
    .big { font-size: 34px; font-weight: 800; } .big small, .score small { font-size: 12px; color: #8c829f; }
    .legend span { margin-left: 8px; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
    .ok { background: rgba(46, 158, 91, .22); } .bad { background: rgba(208, 71, 60, .22); }
    table { border-collapse: collapse; width: 100%; }
    table.team th { background: #2c2440; color: #cfc6e2; font-size: 9px; padding: 4px 3px; border: 1px solid #3a3150; }
    table.team td { border: 1px solid #3a3150; padding: 3px; text-align: center; font-size: 10px; }
    table.team td b { display: block; color: #fff; } table.team td span { font-size: 9px; color: #b9b0cc; }
    table.team td.nm { text-align: left; font-weight: 700; white-space: nowrap; background: #221c31; }
    td.score { font-size: 18px; font-weight: 800; background: #221c31; }
    tr.tot td { background: #221c31; font-size: 9px; color: #b9b0cc; }
    .sum { display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 10px; margin-top: 8px; } .sum p { margin: 0; color: #d9d3e6; }
    .sum > div { background: #221c31; border: 1px solid #3a3150; border-radius: 8px; padding: 6px 8px; }
    .tiles { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }
    .tile { border: 1px solid #3a3150; border-radius: 8px; padding: 5px 7px; background: #221c31; }
    .tile.ok { border-color: #2e9e5b; background: linear-gradient(180deg, rgba(46,158,91,.20), #221c31 70%); }
    .tile.bad { border-color: #b8443a; background: linear-gradient(180deg, rgba(208,71,60,.20), #221c31 70%); }
    .tile.info { border-color: #5ec8e0; background: linear-gradient(180deg, rgba(94,200,224,.18), #221c31 70%); }
    table.team th.info, table.team td.info { background: rgba(94,200,224,.14); } table.team th.info span { font-weight: 400; color: #9a90ad; }
    .tile .t { font-size: 9px; color: #b9b0cc; min-height: 22px; } .tile .v { font-size: 16px; font-weight: 800; color: #fff; }
    .tile .pt { font-size: 10px; font-weight: 700; color: #d8b46a; } .tile .dt { font-size: 8.5px; color: #d9d3e6; min-height: 22px; } .tile .nr { font-size: 8.5px; color: #8c829f; }
    .cols { display: grid; grid-template-columns: 0.9fr 1.3fr 1.6fr; gap: 10px; margin-top: 4px; }
    .cols > div { background: #221c31; border: 1px solid #3a3150; border-radius: 8px; padding: 4px 8px; }
    table.mini td, table.mini th { border-bottom: 1px solid #332a47; padding: 2px 3px; font-size: 9.5px; text-align: left; }
    table.mini th { color: #9a90ad; font-weight: 600; } .badt { color: #ff7b6e; font-weight: 700; }
    .smp { font-size: 8px; color: #8c829f; }
    table.daily td, table.daily th { font-size: 8.5px; padding: 1.5px 3px; }
    table.daily tr.first td { border-top: 2px solid #f0712c; }
    .noprint { position: fixed; top: 8px; right: 8px; } @media print { .noprint { display: none; } }
    .noprint button { font-size: 14px; padding: 8px 14px; cursor: pointer; background: #f0712c; color: #fff; border: 0; border-radius: 8px; }
  </style></head><body>
  <div class="noprint"><button onclick="window.print()">🖨 Сохранить как PDF</button></div>
  ${team}${dailyPage}${d.agents.map(agentPage).join('')}
  </body></html>`;
}

// 19.10.2026: карта точек района: цвет — зашёл / WhatsApp / не зашёл.
async function openDistrictMap(rows, dstat, DCOL) {
  const pts = rows.filter((r) => r.lat != null);
  const noGeo = rows.length - pts.length;
  openModal(`
    <h2>Точки района на карте <span class="muted" style="font-size:14px;font-weight:400">· ${pts.length}${noGeo ? `, без координат ещё ${noGeo}` : ''}</span></h2>
    <div class="muted" style="font-size:12px;margin:-4px 0 6px"><span style="color:${DCOL.green}">●</span> зашёл · <span style="color:${DCOL.yellow}">●</span> WhatsApp в этот день · <span style="color:${DCOL.red}">●</span> не зашёл</div>
    <div id="district-map" style="height:65vh;min-height:360px;border-radius:8px;overflow:hidden;background:#1d1828"></div>
    <div class="modal-actions"><button type="button" class="btn-secondary" id="cancel-modal">Закрыть</button></div>`);
  document.querySelector('#modal-root .modal').classList.add('modal-wide');
  let L;
  try { L = await loadLeaflet(); } catch (e) { document.getElementById('district-map').innerHTML = `<p class="error" style="padding:12px">${escapeHtml(e.message)}</p>`; return; }
  const box = document.getElementById('district-map');
  if (!box) return;
  const map = L.map(box);
  L.tileLayer('https://tile2.maps.2gis.com/tiles?x={x}&y={y}&z={z}', { maxZoom: 18, attribution: '© 2ГИС' }).addTo(map);
  const bounds = [];
  pts.forEach((r) => {
    const st = dstat(r);
    const m = L.circleMarker([r.lat, r.lng], { radius: 8, color: '#fff', weight: 2, fillColor: DCOL[st], fillOpacity: 0.95 }).addTo(map);
    m.bindTooltip(escapeHtml(r.clientName));
    m.bindPopup(`<strong>${escapeHtml(r.clientName)}</strong><br>${escapeHtml(r.ownerName)} · ${escapeHtml(r.date.split('-').reverse().join('.'))}<br>${st === 'green' ? 'зашёл' : st === 'yellow' ? `WhatsApp: агент ${r.waOut}, клиент ${r.waIn}` : 'не зашёл'}${r.address ? '<br>' + escapeHtml(r.address) : ''}`);
    bounds.push([r.lat, r.lng]);
  });
  setTimeout(() => { map.invalidateSize(); if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 }); }, 50);
}

// 19.10.2026: фоновый трекер — приложение Traccar Client на телефоне агента.
async function openTrackerSetupModal(u) {
  let r;
  try { r = await api('GET', `/api/users/${u.id}/tracker`); } catch (e) { alert(e.message); return; }
  const url = `${location.origin}/api/geo/osmand`;
  const draw = (token, last) => openModal(`
    <h2>📡 Фоновый трекер: ${escapeHtml(u.name)}</h2>
    <p class="muted" style="margin-top:0">Сайт не может передавать местоположение, когда он закрыт. Для постоянного трекинга на телефон агента ставится бесплатное приложение <b>Traccar Client</b> — оно работает в фоне и шлёт координаты в CRM (в рабочее время 07:00–21:00, остальное CRM отбрасывает).</p>
    <div class="assort-panel">
      <div><b>Идентификатор устройства</b> (Device identifier): <code style="font-size:16px">${escapeHtml(token)}</code></div>
      <div style="margin-top:4px"><b>Адрес сервера</b> (Server URL): <code>${escapeHtml(url)}</code></div>
      <div class="muted" style="margin-top:4px">${last ? `Последняя точка: ${escapeHtml(new Date(last.t * 1000).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek' }))}${last.src === 'app' ? ' (из приложения)' : ' (с сайта)'}` : 'Точек ещё не было.'}</div>
    </div>
    <ol style="font-size:13px;line-height:1.5">
      <li>Установить <b>Traccar Client</b> из Google Play / App Store.</li>
      <li>В настройках приложения: «Идентификатор устройства» — ключ выше; «Адрес сервера» — адрес выше; «Частота» — 60 сек; «Точность» — высокая; «Буферизация офлайн» — включить.</li>
      <li>Разрешить приложению геолокацию <b>«Всегда»</b> (Android: «Разрешить в любом режиме»), отключить для него экономию батареи.</li>
      <li>Включить переключатель «Статус службы». Через минуту-две агент появится в «Трекер → 📍 Где агент?».</li>
    </ol>
    <div class="assort-panel"><b>Последние запросы от приложений</b> <span class="muted" style="font-size:12px">(видно, доходит ли телефон до CRM и с каким ключом)</span><div id="tr-attempts" class="muted" style="font-size:12px">Загрузка…</div></div>
    <p class="muted" style="font-size:12px">Сообщите агенту, что в рабочее время его местоположение видит супервайзер. Если ключ попал не туда — нажмите «Новый ключ» и пропишите его в приложении заново.</p>
    <div class="modal-actions"><button type="button" class="btn-secondary" id="tr-reset">Новый ключ</button><button type="button" class="btn-primary" id="cancel-modal">Готово</button></div>`);
  const loadAttempts = async () => {
    const box = document.getElementById('tr-attempts');
    if (!box) return;
    try {
      const a = (await api('GET', '/api/tracker/attempts')).attempts;
      box.innerHTML = a.length ? `<table class="mini-table"><thead><tr><th>Пришёл</th><th title="Время, когда телефон снял координаты. Если сильно раньше «Пришёл» — телефон досылает накопленные точки">Время точки</th><th>Ключ</th><th>Агент</th><th>Результат</th><th>Формат</th></tr></thead><tbody>${a.slice(0, 10).map((x) => `<tr><td>${escapeHtml(new Date(x.at).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Bishkek' }))}</td><td>${x.pointAt ? (() => { const lag = Math.round((new Date(x.at) - new Date(x.pointAt)) / 60000); return escapeHtml(new Date(x.pointAt).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Bishkek', hour: '2-digit', minute: '2-digit' })) + (lag >= 3 ? ` <span class="badge badge-overdue" title="точка снята на ${lag} мин раньше, чем пришла">−${lag} мин</span>` : ''); })() : '—'}</td><td><code>${escapeHtml(x.id || '—')}</code></td><td>${escapeHtml(x.agentName || '—')}</td><td>${escapeHtml(x.result || '')}</td><td title="${escapeAttr((x.ctype || '') + '\n' + (x.sample || ''))}">${escapeHtml(x.method + ' ' + x.format)}</td></tr>`).join('')}</tbody></table>${a[0] && a[0].result !== 'OK' ? `<details style="margin-top:4px"><summary>что прислал телефон (для разбора)</summary><pre style="white-space:pre-wrap;font-size:11px">${escapeHtml((a[0].ctype || '') + '\n' + (a[0].sample || '(пусто)') + (a[0].ua ? '\n' + a[0].ua : ''))}</pre></details>` : ''}` : 'С момента последнего перезапуска сервера запросов от приложений не было — телефон до CRM не достучался (проверьте адрес сервера и что служба включена).';
    } catch (e) { box.textContent = e.message; }
  };
  const bind = () => {
    loadAttempts();
    const b = document.getElementById('tr-reset');
    if (b) b.addEventListener('click', async () => {
      if (!confirm('Создать новый ключ? Старый перестанет работать — его нужно будет заменить в приложении.')) return;
      const x = await api('POST', `/api/users/${u.id}/tracker/reset`);
      draw(x.token, r.last); bind();
    });
  };
  draw(r.token, r.last); bind();
}

// ---------- Трекер агентов (19.10.2026) ----------
// Агент: пока открыт сайт, в рабочее время раз в 5 минут отправляем местоположение
// (браузер не позволяет следить в фоне — при закрытой вкладке точек нет).
let geoPingTimer = null;
function startGeoPings() {
  if (!state.user || state.user.role !== 'agent' || !navigator.geolocation || geoPingTimer) return;
  const ind = document.getElementById('geo-indicator');
  const send = () => {
    if (document.visibilityState === 'hidden') return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        api('POST', '/api/geo/ping', { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy })
          .then((r) => { if (ind) { ind.style.display = ''; ind.textContent = r && r.saved ? '📍 геолокация' : ind.textContent; } })
          .catch(() => {});
      },
      () => { if (ind) { ind.style.display = ''; ind.textContent = '📍 геолокация выключена'; } },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  };
  if (ind) ind.style.display = '';
  send();
  geoPingTimer = setInterval(send, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') send(); });
}

let trackerTimer = null;
let trackerState = { from: '', to: '', agentId: '', showClients: true, showTrack: true, showVisits: true, showRoute: true, days: [], daysAuto: true, repFrom: '', repTo: '' }; // days: дни визита клиентов на карте (20.10.2026), пусто = все
// Фильтр клиентов трекера по дню визита: '-' = день не указан.
function trackerDayOk(c) {
  const ds = trackerState.days || [];
  if (!ds.length) return true;
  const d = String(c.visitDay || '').trim().toLowerCase();
  return d ? ds.includes(d) : ds.includes('-');
}
function trackerPeriodDays() {
  const names = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const out = new Set();
  const a = new Date(trackerState.from + 'T00:00:00Z'), b = new Date(trackerState.to + 'T00:00:00Z');
  for (let d = a, n = 0; d <= b && n < 7; d = new Date(d.getTime() + 864e5), n++) out.add(names[d.getUTCDay()]);
  // Вся неделя попала в период — «Все» (вместе с клиентами без дня визита).
  return out.size >= 7 ? [] : [...out];
}
function stopTrackerTimer() { if (trackerTimer) { clearInterval(trackerTimer); trackerTimer = null; } }
const TRACK_COLORS = ['#f0712c', '#d8b46a', '#5ec8e0', '#f28fb0', '#3fbfa0', '#f2a154'];
function agoText(sec, now) {
  const d = Math.max(0, (now || Date.now() / 1000) - sec);
  if (d < 90) return 'только что';
  if (d < 3600) return `${Math.round(d / 60)} мин назад`;
  if (d < 86400) return `${Math.round(d / 3600)} ч назад`;
  return `${Math.round(d / 86400)} дн назад`;
}
function tmS(sec) { return new Date(sec * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }); }

// 23.10.2026: короткий отчёт по точке за период трекера (продажи, сделки, WhatsApp).
function trackerClientPopup(c, a) {
  const rf = c.repFrom || trackerState.repFrom, rt = c.repTo || trackerState.repTo;
  const per = rf === rt ? rf.split('-').reverse().join('.') : `${rf.split('-').reverse().join('.')}–${rt.split('-').reverse().join('.')}`;
  const s = c.sale || {}; const w = c.wa || {};
  const dt = (iso) => iso ? iso.split('-').reverse().join('.') : '—';
  return `<div class="tr-pop"><strong>${escapeHtml(c.name)}</strong><div class="muted">${escapeHtml(a.agentName)}${c.visitDay ? ' · ' + escapeHtml(c.visitDay.toLowerCase()) : ''}${c.address ? '<br>' + escapeHtml(c.address) : ''}</div>
    <div class="tr-pop-h">За период ${escapeHtml(per)}</div>
    <table class="tr-pop-t">
      <tr><td>Посещение</td><td>${c.visitCount ? `✅ ${c.visitCount} раз${c.lastVisitAt ? ', ' + escapeHtml(new Date(c.lastVisitAt).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : ''}` : '— не было'}</td></tr>
      <tr><td>Продажи</td><td>${s.sum ? `<b>${fmtMoney(s.sum)}</b> · сделок ${s.deals}` : '— нет'}</td></tr>
      <tr><td>WhatsApp</td><td>${w.count ? `💬 ${w.count} сообщ. (агент ${w.out}, клиент ${w.in}) · дней ${w.days}` : '— касаний не было'}</td></tr>
    </table>
    <div class="muted" style="font-size:11px;margin-top:4px">Посл. продажа: ${dt(s.lastSale)} · за месяц ${fmtMoney(s.monthSum || 0)}<br>Посл. переписка: ${w.lastAt ? escapeHtml(waTime(w.lastAt)) : 'нет'}</div>
    <button type="button" class="link-btn tr-pop-open" data-id="${c.id}" style="margin-top:4px">Открыть карточку</button></div>`;
}
function renderTracker(content) {
  if (!isStaff()) return;
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  if (!trackerState.from) { trackerState.from = today; trackerState.to = today; }
  // Период отчёта по точкам (продажи/WhatsApp) — свой, по умолчанию с 1-го числа месяца по сегодня.
  if (!trackerState.repFrom) { trackerState.repFrom = today.slice(0, 8) + '01'; trackerState.repTo = today; }
  const agents = state.users.filter((u) => u.role === 'agent');
  content.appendChild(el(`
    <div>
      <div class="toolbar"><h2 style="margin:0">Трекер агентов</h2>
        <span class="muted" id="tr-upd" style="font-size:12px;margin-left:auto"></span>
        <button type="button" class="btn-secondary" id="tr-refresh" title="Обновить карту сейчас">⟳ Обновить</button>
        <button type="button" class="btn-primary" id="tr-where">📍 Где агент?</button></div>
      <p class="muted" style="margin-top:0">Местоположение приходит с телефона агента, пока у него открыт сайт CRM (в рабочее время, раз в 5 минут), и при каждой отметке посещения. Если вкладка закрыта или геолокация выключена — точек нет.</p>
      <div class="filter-bar">
        <label class="muted" style="margin:0">с <input type="date" id="tr-from" value="${trackerState.from}"></label>
        <label class="muted" style="margin:0">по <input type="date" id="tr-to" value="${trackerState.to}"></label>
        <select id="tr-agent"><option value="">Все агенты</option>${agents.map((a) => `<option value="${a.id}" ${String(trackerState.agentId) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
        <label class="filter-check"><input type="checkbox" id="tr-clients" ${trackerState.showClients ? 'checked' : ''}> локации клиентов</label>
        <label class="filter-check"><input type="checkbox" id="tr-track" ${trackerState.showTrack ? 'checked' : ''}> трек</label>
        <label class="filter-check"><input type="checkbox" id="tr-visits" ${trackerState.showVisits ? 'checked' : ''}> отметки посещений</label>
        <label class="filter-check" title="Остановки по порядку (стоял дольше 8 минут), стрелки направления движения"><input type="checkbox" id="tr-route" ${trackerState.showRoute ? 'checked' : ''}> маршрут (остановки)</label>
      </div>
 <div class="filter-bar tr-rep-bar" title="Период для окна клиента на карте: продажи, сделки, WhatsApp, посещения. Не зависит от периода трека">
        <span class="muted" style="font-size:12px">📊 Отчёт по точке (клик по клиенту на карте):</span>
        <label class="muted" style="margin:0">с <input type="date" id="tr-rep-from" value="${trackerState.repFrom}"></label>
        <label class="muted" style="margin:0">по <input type="date" id="tr-rep-to" value="${trackerState.repTo}"></label>
        <button type="button" class="link-btn" id="tr-rep-month">этот месяц</button>
        <button type="button" class="link-btn" id="tr-rep-same">как трек</button>
      </div>
      <div class="filter-bar" id="tr-days" title="Какие клиенты показывать на карте — по дню визита"></div>
      <div id="tr-where-box"></div>
      <div id="tr-map" style="height:62vh;min-height:380px;border-radius:10px;overflow:hidden;background:#1d1828;margin:8px 0"></div>
      <div class="muted" style="font-size:12px">Клиенты: <span style="color:#2e9e5b">●</span> посещён за период · <span style="color:#8c829f">●</span> не посещён. Трек — линия по времени, цвет агента; крупные точки — отметки посещений; 📍 — последнее местоположение.</div>
      <div id="tr-gaps-box"></div>
      <div id="tr-route-box"></div>
      <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Агент</th><th>Точек трека</th><th>Первая / последняя</th><th>Пройдено</th><th>Отметок</th><th>Посещено клиентов</th><th>Клиентов с координатами</th><th title="Сколько минут в рабочее время (7–21) не было точек — перерывы дольше 10 минут">Офлайн</th><th>Последнее местоположение</th></tr></thead><tbody id="tr-rows"></tbody></table></div>
    </div>`));
  let map = null;
  let layer = null;
  let data = null;
  let L = null;
  async function ensureMap() {
    if (map) return true;
    try { L = await loadLeaflet(); } catch (e) { document.getElementById('tr-map').innerHTML = `<p class="error" style="padding:12px">${escapeHtml(e.message)}</p>`; return false; }
    const box = document.getElementById('tr-map');
    if (!box) return false;
    map = L.map(box);
    L.tileLayer('https://tile2.maps.2gis.com/tiles?x={x}&y={y}&z={z}', { maxZoom: 18, attribution: '© 2ГИС' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('popupopen', (e) => {
      const btn = e.popup.getElement() && e.popup.getElement().querySelector('.tr-pop-open');
      if (btn) btn.addEventListener('click', () => { const c = clientById(Number(btn.dataset.id)); if (c) openClientModal(c); });
    });
    map.setView([42.8746, 74.5698], 12);
    return true;
  }
  function draw(fit) {
    if (!map || !data) return;
    layer.clearLayers();
    const bounds = [];
    data.agents.forEach((a, i) => {
      const color = TRACK_COLORS[(state.users.filter((u) => u.role === 'agent').findIndex((u) => u.id === a.agentId) + 6) % 6];
      if (trackerState.showClients) a.clients.filter((c) => c.lat != null && trackerDayOk(c)).forEach((c) => {
        L.circleMarker([c.lat, c.lng], { radius: 5, color: '#1d1828', weight: 1, fillColor: c.visited ? '#2e9e5b' : '#8c829f', fillOpacity: 0.9 })
          .addTo(layer).bindTooltip(`${escapeHtml(c.name)} · ${escapeHtml(a.agentName)}${c.visitDay ? ' · ' + escapeHtml(c.visitDay.toLowerCase()) : ''}`)
          .bindPopup(() => trackerClientPopup(c, a), { className: 'tr-popup' });
        bounds.push([c.lat, c.lng]);
      });
      if (trackerState.showTrack && a.pings.length) {
        const pts = a.pings.map((p) => [p.lat, p.lng]);
        if (pts.length > 1) L.polyline(pts, { color, weight: 3, opacity: 0.8 }).addTo(layer);
        (a.gaps || []).forEach((g) => { if (g.fromLat != null && g.toLat != null) L.polyline([[g.fromLat, g.fromLng], [g.toLat, g.toLng]], { color: '#e05a5a', weight: 2, opacity: 0.9, dashArray: '6 6' }).addTo(layer).bindTooltip(`⚠ перерыв ${g.minutes} мин: ${tmS(g.fromT).slice(-5)}–${tmS(g.toT).slice(-5)}`); });
        a.pings.forEach((p) => {
          L.circleMarker([p.lat, p.lng], { radius: 3, color, weight: 1, fillColor: color, fillOpacity: 1 }).addTo(layer)
            .bindTooltip(`${escapeHtml(a.agentName)} · ${tmS(p.t)}${p.acc ? ' · ±' + p.acc + ' м' : ''}`);
          bounds.push([p.lat, p.lng]);
        });
      }
      if (trackerState.showRoute && a.pings.length > 1) {
        // Стрелки направления — на середине каждого заметного отрезка.
        for (let k = 1; k < a.pings.length; k++) {
          const p0 = a.pings[k - 1], p1 = a.pings[k];
          const dy = p1.lat - p0.lat, dx = (p1.lng - p0.lng) * Math.cos(p0.lat * Math.PI / 180);
          if (Math.hypot(dx, dy) * 111000 < 150) continue;
          const ang = Math.atan2(dx, dy) * 180 / Math.PI;
          L.marker([(p0.lat + p1.lat) / 2, (p0.lng + p1.lng) / 2], { interactive: false, icon: L.divIcon({ className: 'tr-arrow', html: `<div style="transform:rotate(${ang}deg);color:${color}">▲</div>`, iconSize: [14, 14] }) }).addTo(layer);
        }
        const first = a.pings[0], lastP = a.pings[a.pings.length - 1];
        L.marker([first.lat, first.lng], { icon: L.divIcon({ className: 'tr-pin', html: `<div class="tr-pin-in" style="background:#2e9e5b">старт ${tmS(first.t).slice(-5)}</div>`, iconSize: null }) }).addTo(layer);
        L.marker([lastP.lat, lastP.lng], { icon: L.divIcon({ className: 'tr-pin', html: `<div class="tr-pin-in" style="background:#c0392b">финиш ${tmS(lastP.t).slice(-5)}</div>`, iconSize: null }) }).addTo(layer);
        (a.stops || []).forEach((st, n) => {
          L.marker([st.lat, st.lng], { icon: L.divIcon({ className: 'tr-stop', html: `<div class="tr-stop-in" style="border-color:${color}">${n + 1}</div>`, iconSize: [22, 22] }) })
            .addTo(layer).bindTooltip(`${n + 1}. ${tmS(st.from).slice(-5)}–${tmS(st.to).slice(-5)} (${st.minutes} мин)${st.place ? ' · ' + escapeHtml(st.place) : ''}`);
        });
      }
      if (trackerState.showVisits) a.visits.filter((v) => v.lat != null).forEach((v) => {
        // 26.10.2026: отметка посещения тоже открывает карточку клиента (клиент на карте — под ней).
        const cc = a.clients.find((x) => x.id === v.clientId);
        L.circleMarker([v.lat, v.lng], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(layer)
          .bindTooltip(`✓ ${escapeHtml(v.clientName)} · ${escapeHtml(a.agentName)} · ${new Date(v.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' })}`)
          .bindPopup(() => cc ? trackerClientPopup(cc, a) : `<div class="tr-pop"><strong>${escapeHtml(v.clientName)}</strong><div class="muted">${escapeHtml(a.agentName)} · отметка ${new Date(v.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' })}</div><button type="button" class="link-btn tr-pop-open" data-id="${v.clientId}" style="margin-top:4px">Открыть карточку</button></div>`, { className: 'tr-popup' });
        bounds.push([v.lat, v.lng]);
      });
      if (a.last) {
        L.marker([a.last.lat, a.last.lng], { icon: L.divIcon({ className: 'tr-pin', html: `<div class="tr-pin-in" style="background:${color}">📍 ${escapeHtml(a.agentName)}</div>`, iconSize: null }) })
          .addTo(layer).bindPopup(`<strong>${escapeHtml(a.agentName)}</strong><br>${tmS(a.last.t)} (${agoText(a.last.t)})${a.last.source === 'visit' ? '<br>отметка у: ' + escapeHtml(a.last.clientName || '') : ''}${a.last.acc ? '<br>точность ±' + a.last.acc + ' м' : ''}`);
      }
    });
    if (fit && bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }
  function drawRoute() {
    const box = document.getElementById('tr-route-box');
    if (!box) return;
    const withStops = data.agents.filter((a) => a.pings.length > 1);
    if (!trackerState.showRoute || !withStops.length) { box.innerHTML = ''; return; }
    box.innerHTML = withStops.map((a) => {
      const p0 = a.pings[0], p1 = a.pings[a.pings.length - 1];
      return `<div class="assort-panel" style="margin:6px 0"><h3 style="margin:0 0 4px">Маршрут: ${escapeHtml(a.agentName)} <span class="muted" style="font-weight:400;font-size:12px">· старт ${tmS(p0.t)} · финиш ${tmS(p1.t)} · ${a.distanceKm} км · остановок ${a.stops.length}</span></h3>
        ${a.stops.length ? `<table class="mini-table"><thead><tr><th>№</th><th>С — по</th><th>Стоял</th><th>Где</th><th></th></tr></thead><tbody>${a.stops.map((st, n) => `<tr><td>${n + 1}</td><td>${tmS(st.from)} — ${tmS(st.to).slice(-5)}</td><td>${st.minutes} мин</td><td>${st.place ? escapeHtml(st.place) + (st.checkin ? ' <span class="badge badge-yes">отметка</span>' : ' <span class="muted">(рядом с точкой)</span>') : '<span class="muted">не у клиента</span>'}</td><td><button type="button" class="link-btn tr-stop-go" data-lat="${st.lat}" data-lng="${st.lng}">на карте</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Остановок у клиентов дольше 5 минут нет.</div>'}</div>`;
    }).join('');
    box.querySelectorAll('.tr-stop-go').forEach((b) => b.addEventListener('click', () => { if (map) { map.setView([Number(b.dataset.lat), Number(b.dataset.lng)], 17); document.getElementById('tr-map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } }));
  }
  function drawGaps() {
    const box = document.getElementById('tr-gaps-box');
    if (!box) return;
    const withGaps = data.agents.filter((a) => (a.gaps || []).length || a.silentNow);
    if (!withGaps.length) { box.innerHTML = ''; return; }
    box.innerHTML = withGaps.map((a) => `<div class="assort-panel" style="margin:6px 0"><h3 style="margin:0 0 4px">Перерывы трекера: ${escapeHtml(a.agentName)} <span class="muted" style="font-weight:400;font-size:12px">· офлайн в рабочее время ${a.offlineMin} мин${a.silentNow ? ` · <span class="badge badge-overdue">молчит сейчас ${a.silentNow} мин</span>` : ''}</span></h3>
      ${(a.gaps || []).length ? `<table class="mini-table"><thead><tr><th>С — по</th><th>Длительность</th><th></th></tr></thead><tbody>${a.gaps.map((g) => `<tr><td>${tmS(g.fromT)} — ${tmS(g.toT).slice(-5)}</td><td>${g.minutes} мин</td><td>${g.fromLat != null ? `<button type="button" class="link-btn tr-stop-go" data-lat="${g.fromLat}" data-lng="${g.fromLng}">где пропал</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Трекер замолчал и пока не возобновился.</div>'}</div>`).join('');
    box.querySelectorAll('.tr-stop-go').forEach((b) => b.addEventListener('click', () => { if (map) { map.setView([Number(b.dataset.lat), Number(b.dataset.lng)], 16); document.getElementById('tr-map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } }));
  }
  function drawTable() {
    drawGaps();
    drawRoute();
    document.getElementById('tr-rows').innerHTML = data.agents.map((a) => `<tr>
      <td><strong>${escapeHtml(a.agentName)}</strong></td><td>${a.pingCount}${a.skippedSpikes ? ` <span class="muted" title="GPS-выбросы убраны из трека (прыжок дальше 1 км и возврат)">(−${a.skippedSpikes} выбр.)</span>` : ''}</td>
      <td>${a.firstAt ? `${tmS(a.firstAt)} / ${tmS(a.lastAt)}` : '—'}</td><td>${a.distanceKm ? a.distanceKm + ' км' : '—'}</td>
      <td>${a.visits.length}</td><td>${a.clients.filter((c) => c.visited && trackerDayOk(c)).length} из ${a.clients.filter(trackerDayOk).length}</td><td>${a.clients.filter((c) => c.lat != null && trackerDayOk(c)).length}</td>
      <td>${a.offlineMin ? `<span class="badge badge-amber" title="перерывов: ${(a.gaps || []).length}">${a.offlineMin} мин</span>` : '<span class="muted">—</span>'}${a.silentNow ? ` <span class="badge badge-overdue">молчит ${a.silentNow} мин</span>` : ''}</td>
      <td>${a.last ? `<button type="button" class="link-btn tr-goto" data-id="${a.agentId}">${tmS(a.last.t)}</button> <span class="muted">(${agoText(a.last.t)}${a.last.source === 'visit' ? ', отметка' : ''})</span>` : '<span class="muted">нет данных</span>'}</td></tr>`).join('');
    document.querySelectorAll('.tr-goto').forEach((b) => b.addEventListener('click', () => {
      const a = data.agents.find((x) => String(x.agentId) === b.dataset.id);
      if (a && a.last && map) { map.setView([a.last.lat, a.last.lng], 16); document.getElementById('tr-map').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }));
  }
  function drawDays() {
    const box = document.getElementById('tr-days');
    if (!box) return;
    const ds = trackerState.days;
    const chip = (v, label) => `<button type="button" class="tr-day ${ds.includes(v) ? 'on' : ''}" data-v="${v}">${label}</button>`;
    box.innerHTML = `<span class="muted" style="font-size:12px">Клиенты по дню визита:</span>
      <button type="button" class="tr-day ${ds.length ? '' : 'on'}" data-v="*">Все</button>
      ${VISIT_DAYS.map((d) => chip(d.toLowerCase(), dayShort(d))).join('')}${chip('воскресенье', 'Вс')}${chip('-', 'без дня')}
      <button type="button" class="link-btn" id="tr-days-period" title="Только дни недели, попадающие в выбранный период; дальше меняется вместе с датами">по датам периода${trackerState.daysAuto ? ' ✓' : ''}</button>`;
    box.querySelectorAll('.tr-day').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.v;
      if (v === '*') trackerState.days = [];
      else trackerState.days = ds.includes(v) ? ds.filter((x) => x !== v) : ds.concat(v);
      trackerState.daysAuto = false; // выбрали вручную — при смене дат не перезаписываем
      redrawDays();
    }));
    document.getElementById('tr-days-period').addEventListener('click', () => { trackerState.daysAuto = true; trackerState.days = trackerPeriodDays(); redrawDays(); });
  }
  function redrawDays() { drawDays(); if (data) { drawTable(); draw(true); } }
  // 23.10.2026: по умолчанию клиенты на карте — по дням недели выбранного периода
  // (сменили даты — фильтр дней пересчитался сам), пока дни не выбраны вручную.
  if (trackerState.daysAuto) trackerState.days = trackerPeriodDays();
  drawDays();
  async function load(fit) {
    const qs = new URLSearchParams({ from: trackerState.from, to: trackerState.to, repFrom: trackerState.repFrom, repTo: trackerState.repTo });
    if (trackerState.agentId) qs.set('agentId', trackerState.agentId);
    data = await api('GET', `/api/tracker?${qs.toString()}`);
    if (state.view !== 'tracker') return;
    const upd = document.getElementById('tr-upd');
    if (upd) upd.textContent = 'карта обновлена в ' + new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Bishkek', hour: '2-digit', minute: '2-digit' }) + ' · автообновление раз в минуту';
    drawTable();
    if (await ensureMap()) { setTimeout(() => { map.invalidateSize(); draw(fit); }, 30); }
  }
  [['tr-from', 'from'], ['tr-to', 'to'], ['tr-agent', 'agentId']].forEach(([id, k]) => document.getElementById(id).addEventListener('change', (e) => {
    trackerState[k] = e.target.value;
    if (k !== 'agentId' && trackerState.daysAuto) { trackerState.days = trackerPeriodDays(); drawDays(); }
    load(true);
  }));
  [['tr-clients', 'showClients'], ['tr-track', 'showTrack'], ['tr-visits', 'showVisits'], ['tr-route', 'showRoute']].forEach(([id, k]) => document.getElementById(id).addEventListener('change', (e) => { trackerState[k] = e.target.checked; draw(false); drawRoute(); }));
  document.getElementById('tr-where').addEventListener('click', async () => {
    const r = await api('GET', '/api/tracker/where');
    const box = document.getElementById('tr-where-box');
    const list = r.agents.filter((a) => !trackerState.agentId || String(a.agentId) === String(trackerState.agentId));
    box.innerHTML = `<div class="assort-panel" style="margin:6px 0"><h3 style="margin:0 0 6px">Где агент — последнее местоположение</h3>
      <div class="dist-chips">${list.map((a) => a.last
        ? `<button type="button" class="dist-chip tr-where-go" data-id="${a.agentId}" style="background:${(r.now - a.last.t) < 1800 ? '#2e9e5b' : (r.now - a.last.t) < 4 * 3600 ? '#c99a12' : '#6b6380'}">📍 ${escapeHtml(a.agentName)} — ${agoText(a.last.t, r.now)}${a.last.source === 'visit' ? ' (отметка)' : ''}</button>`
        : `<span class="dist-chip" style="background:#3a3150">${escapeHtml(a.agentName)} — нет данных</span>`).join('')}</div>
      <div class="muted" style="font-size:12px;margin-top:4px">Зелёный — менее 30 минут назад, жёлтый — менее 4 часов, серый — давно. Нажмите на агента — карта покажет его точку.</div></div>`;
    if (!(await ensureMap())) return;
    const pts = [];
    list.forEach((a, i) => {
      if (!a.last) return;
      const color = TRACK_COLORS[(state.users.filter((u) => u.role === 'agent').findIndex((u) => u.id === a.agentId) + 6) % 6];
      L.marker([a.last.lat, a.last.lng], { icon: L.divIcon({ className: 'tr-pin', html: `<div class="tr-pin-in" style="background:${color}">📍 ${escapeHtml(a.agentName)} · ${agoText(a.last.t, r.now)}</div>`, iconSize: null }) }).addTo(layer);
      pts.push([a.last.lat, a.last.lng]);
    });
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    box.querySelectorAll('.tr-where-go').forEach((b) => b.addEventListener('click', () => {
      const a = list.find((x) => String(x.agentId) === b.dataset.id);
      if (a && a.last) map.setView([a.last.lat, a.last.lng], 16);
    }));
  });
  load(true);
  document.getElementById('tr-refresh').addEventListener('click', () => load(false));
  const setRep = (f, t) => { trackerState.repFrom = f; trackerState.repTo = t; document.getElementById('tr-rep-from').value = f; document.getElementById('tr-rep-to').value = t; if (map) map.closePopup(); load(false); };
  document.getElementById('tr-rep-from').addEventListener('change', (e) => setRep(e.target.value, trackerState.repTo < e.target.value ? e.target.value : trackerState.repTo));
  document.getElementById('tr-rep-to').addEventListener('change', (e) => setRep(trackerState.repFrom > e.target.value ? e.target.value : trackerState.repFrom, e.target.value));
  document.getElementById('tr-rep-month').addEventListener('click', () => setRep(today.slice(0, 8) + '01', today));
  document.getElementById('tr-rep-same').addEventListener('click', () => setRep(trackerState.from, trackerState.to));
  stopTrackerTimer();
  // Обновление раз в минуту (22.10.2026; было 2 мин), пока открыта вкладка и в периоде есть сегодня.
  trackerTimer = setInterval(() => { if (state.view !== 'tracker') return stopTrackerTimer(); if (trackerState.to >= new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10)) load(false); }, 60000);
}

// ---------- Отчёты (админ/супервайзер) ----------

async function renderReports(content) {
  if (!isStaff()) return;
  const stats = await api('GET', '/api/stats');
  content.appendChild(el(`
    <div>
      ${stats.periodComparison ? `
      <div class="panel">
        <h2>Продажи: сравнение периодов</h2>
        <div class="chart-desc">Этот месяц (нарастающим итогом на сегодня) против ${escapeHtml(capitalize(stats.periodComparison.lastClosedMonth))}а — последнего полностью закрытого месяца. Не день-в-день (там весь месяц), но видно динамику.</div>
        <div class="bar-row">
          <div class="bar-top"><span class="bar-name">Команда</span><span class="bar-pct">${fmtMoney(stats.periodComparison.thisMonthSoFar)} vs ${fmtMoney(stats.periodComparison.lastMonthTotal)}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${stats.periodComparison.lastMonthTotal ? Math.min(100, Math.round(stats.periodComparison.thisMonthSoFar / stats.periodComparison.lastMonthTotal * 100)) : 0}%;background:var(--c1)"></div></div>
        </div>
        ${stats.periodComparison.byAgent.map((a, i) => `
          <div class="bar-row">
            <div class="bar-top"><span class="bar-name">${escapeHtml(a.agentName)}</span><span class="bar-pct">${fmtMoney(a.thisMonthSoFar)} vs ${fmtMoney(a.lastMonthTotal)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${a.lastMonthTotal ? Math.min(100, Math.round(a.thisMonthSoFar / a.lastMonthTotal * 100)) : 0}%;background:var(--c${(i % 6) + 1})"></div></div>
          </div>
        `).join('')}
      </div>` : ''}



      <div class="panel">
        <h2>Посещения</h2>
        <div class="chart-desc">Отметки агентов у точек («📍 Отметить посещение»). ✓ у точки — ближе 150 м к сохранённым координатам точки; 📌 первая — координаты точки сохранены этой отметкой; ⚠ далеко — дальше 150 м; ⚠ без GPS — геолокация была недоступна, такая отметка задачу НЕ закрывает. У отметок «далеко» есть две ссылки: где агент реально отметился и где точка клиента. «По дню визита» — сколько клиентов с днём визита на эти даты отмечены (как задачи «Посещения»); «После 20:00» — отметки позже срока.</div>
        <div id="visits-box"></div>
      </div>

      <div class="panel">
        <h2>Неделя по агентам — отчёт в PDF</h2>
        <div class="chart-desc">Статистика отработанной недели: лист команды (все агенты, 11 пунктов, баллы, рейтинг) + по листу на агента (плитки с баллами, дни Пн–Сб, топ-10 неохваченных и топ-10 по недопроданному). Балл: +1 за каждый выполненный пункт, итог 0–11. Откроется страница для печати — выберите «Сохранить как PDF», ориентация альбомная.</div>
        <div id="wk-box"></div>
      </div>

      <div class="panel">
        <h2>Охват района: посещение / WhatsApp</h2>
        <div class="chart-desc">Район = клиенты агента с днём визита, совпадающим с днём недели даты. По каждому клиенту на каждую дату периода: было ли посещение (отметка у точки; «без GPS» и сброшенные не считаются), была ли переписка в WhatsApp в этот день (агент написал или клиент написал), или не было ни того, ни другого. Нажмите на число — список клиентов.</div>
        <div id="cv-box"></div>
      </div>

      <div class="panel">
        <h2>WhatsApp: переписка с точками</h2>
        <div class="chart-desc">Сколько точек в группе, у скольких есть номер телефона, скольким агенты написали за период и сколько ответили. Группировка — по агенту, по дню визита (маршрут дня) или по типу точки. Нажмите на число «не написали» / «написали» — список точек. Учитываются только сообщения с номеров, подключённых к CRM (вкладка WhatsApp).</div>
        <div id="wr-box"></div>
      </div>

      <div class="panel">
        <h2>WhatsApp: клиенты без ответа до 20:00</h2>
        <div class="chart-desc">Клиент написал агенту, а ответа до 20:00 того же дня не было (если клиент написал после 20:00 — срок до 20:00 следующего дня). «Нет ответа» — агент так и не ответил; «Ответ позже срока» — ответил, но после 20:00. Несколько сообщений клиента подряд считаются одним обращением. Обращения, срок ответа по которым ещё не наступил, не показываются.</div>
        <div id="wu-box"></div>
      </div>

      <div class="panel">
        <h2>Продажи по линейкам и клиентам</h2>
        <div class="chart-desc">Сколько продано по каждой линейке и каким клиентам. Период — текущий месяц и/или закрытые месяцы (можно несколько). Нажмите на линейку — список клиентов по нему; на клиента — его товары.</div>
        <div id="sr-box"></div>
      </div>

      <div class="panel">
        <h2>История по клиенту / агенту</h2>
        <div class="chart-desc">Поиск клиента или агента — сводка по продажам в этом месяце, долгу и задачам.</div>
        <input type="text" id="history-search" placeholder="Найти клиента или агента..." autocomplete="off" style="width:100%;max-width:420px;margin-bottom:10px">
        <div id="history-results"></div>
      </div>

      <h2>Ассортимент по агентам</h2>
      <div class="sub muted" style="margin-bottom:10px">Товар / линейка / штук / выручка / число клиентов — фильтры по линейке, агенту и месяцу (по умолчанию — 7-месячная агрегация; при выборе конкретного месяца показаны данные только за него).</div>
      <div class="filter-bar" style="margin-bottom:10px">
        <select id="reports-agent-filter">
          <option value="">Все агенты</option>
        </select>
      </div>
      <div id="reports-month-bar" class="assort-brand-filter" style="margin-bottom:10px"></div>
      <div id="reports-brand-bar" class="assort-brand-filter" style="margin-bottom:6px"></div>
      <div id="reports-colorant-bar" class="assort-brand-filter"></div>
      ${repFold('fold-assort', 'Таблица товаров <span class="muted" id="reports-cnt"></span>', '<div id="reports-table" class="report-table-wrap"><div class="muted">Загрузка…</div></div>')}
    </div>
  `));
  wireSalesBrandReport(stats);
  wireVisitsReport();
  wireWeekReport();
  wireCoverageReport();
  wireWhatsappReport();
  wireWhatsappUnansweredReport();

  // Правка 02.09.2026: фильтр по бренду стал мультивыбором (можно отметить сразу
  // Kapous+EPICA+Studio и т.п.), а "Красители/оксиды" вынесен в отдельный
  // трёхпозиционный переключатель, который сочетается с выбором бренда —
  // "Kapous" + "Только краски/оксиды" покажет краски/оксиды именно Kapous.
  // "Без красок/оксидов" — обратный фильтр, чтобы убрать их из общего реестра.
  const selectedBrands = new Set();
  let colorantMode = 'all'; // 'all' | 'only' | 'exclude'
  // Правка 31.08.2026: раньше был select одного месяца, теперь можно выбрать
  // несколько сразу (чипы, как у фильтра по бренду) — пустой набор = все 7 мес.
  const selectedMonths = new Set();

  function monthsParam() {
    return selectedMonths.size ? Array.from(selectedMonths).join(',') : '';
  }

  async function load() {
    const agentId = document.getElementById('reports-agent-filter').value;
    const qs = new URLSearchParams();
    if (agentId) qs.set('agentId', agentId);
    const mp = monthsParam();
    if (mp) qs.set('month', mp);
    const res = await api('GET', `/api/reports/assortment-by-agent?${qs.toString()}`);

    const agentSel = document.getElementById('reports-agent-filter');
    if (!agentSel.dataset.filled) {
      agentSel.innerHTML = '<option value="">Все агенты</option>' +
        res.agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
      agentSel.value = agentId;
      agentSel.dataset.filled = '1';
    }
    const monthBar = document.getElementById('reports-month-bar');
    if (!monthBar.dataset.filled) {
      monthBar.innerHTML = `
        <button type="button" class="brand-chip ${!selectedMonths.size ? 'active' : ''}" data-month="all">Все месяцы (7 мес)</button>
        ${res.months.map((m) => `<button type="button" class="brand-chip" data-month="${escapeAttr(m)}">${escapeHtml(m.charAt(0).toUpperCase() + m.slice(1))}</button>`).join('')}
      `;
      monthBar.dataset.filled = '1';
      monthBar.querySelectorAll('.brand-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const m = chip.dataset.month;
          if (m === 'all') {
            selectedMonths.clear();
          } else {
            if (selectedMonths.has(m)) selectedMonths.delete(m); else selectedMonths.add(m);
          }
          monthBar.querySelectorAll('.brand-chip').forEach((c) => {
            c.classList.toggle('active', c.dataset.month === 'all' ? !selectedMonths.size : selectedMonths.has(c.dataset.month));
          });
          load();
        });
      });
    }
    const month = mp; // используется ниже только для подписи колонки "Шт"

    const bar = document.getElementById('reports-brand-bar');
    bar.innerHTML = `
      <button type="button" class="brand-chip ${!selectedBrands.size ? 'active' : ''}" data-brand="all">Все линейки</button>
      ${res.brands.map((b) => `<button type="button" class="brand-chip ${selectedBrands.has(b) ? 'active' : ''}" data-brand="${escapeAttr(b)}">${escapeHtml(b)}</button>`).join('')}
    `;
    const colorantBar = document.getElementById('reports-colorant-bar');
    colorantBar.innerHTML = `
      <button type="button" class="brand-chip ${colorantMode === 'all' ? 'active' : ''}" data-colorant-mode="all">Все категории</button>
      <button type="button" class="brand-chip ${colorantMode === 'only' ? 'active' : ''}" data-colorant-mode="only">Только краски/оксиды</button>
      <button type="button" class="brand-chip ${colorantMode === 'exclude' ? 'active' : ''}" data-colorant-mode="exclude">Убрать краски/оксиды</button>
    `;

    function renderTable() {
      let rows = res.rows;
      if (selectedBrands.size) rows = rows.filter((r) => selectedBrands.has(r.brand));
      if (colorantMode === 'only') rows = rows.filter((r) => r.category === 'Краситель' || r.category === 'Оксид');
      else if (colorantMode === 'exclude') rows = rows.filter((r) => r.category !== 'Краситель' && r.category !== 'Оксид');
      const qtyHeader = month ? 'Шт (за выбр. месяцы)' : 'Шт (7 мес)';
      const rc = document.getElementById('reports-cnt'); if (rc) rc.textContent = `(${rows.length}${rows.length > 300 ? ', показаны первые 300' : ''})`;
      document.getElementById('reports-table').innerHTML = rows.length ? `
        <table>
          <thead><tr><th>Агент</th><th>Товар</th><th>Бренд</th><th>${qtyHeader}</th><th>Выручка</th><th>Клиентов</th></tr></thead>
          <tbody>
            ${rows.slice(0, 300).map((r) => `
              <tr>
                <td>${escapeHtml(r.agentName)}</td>
                <td>${escapeHtml(r.product)}</td>
                <td><span class="brand-badge">${escapeHtml(r.brand)}</span></td>
                <td>${r.qty}</td>
                <td>${fmtMoney(r.revenue)}</td>
                <td>${r.clientsCount}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${rows.length > 300 ? `<div class="muted" style="margin-top:6px;font-size:12px">Показаны первые 300 из ${rows.length} — сузьте фильтр по бренду.</div>` : ''}
      ` : '<div class="empty-state">Нет данных по этому фильтру.</div>';
    }
    renderTable();
    // Фильтр по бренду — мультивыбор: можно отметить сразу несколько чипов
    // (Kapous+EPICA+Studio и т.п.), "Все бренды" сбрасывает выбор.
    bar.querySelectorAll('.brand-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const b = chip.dataset.brand;
        if (b === 'all') {
          selectedBrands.clear();
        } else {
          if (selectedBrands.has(b)) selectedBrands.delete(b); else selectedBrands.add(b);
        }
        bar.querySelectorAll('.brand-chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.brand === 'all' ? !selectedBrands.size : selectedBrands.has(c.dataset.brand));
        });
        renderTable();
      });
    });
    colorantBar.querySelectorAll('.brand-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        colorantMode = chip.dataset.colorantMode;
        colorantBar.querySelectorAll('.brand-chip').forEach((c) => c.classList.toggle('active', c.dataset.colorantMode === colorantMode));
        renderTable();
      });
    });
  }

  document.getElementById('reports-agent-filter').addEventListener('change', load);
  await load();
  // Отчёт «Акции» убран по просьбе пользователя (Фаза 24, 09.09.2026) вместе
  // со всей фичей акций — см. withFreshCurrentMonth()/удалённый эндпоинт
  // /api/reports/promotions в src/api.js.

  // «История по клиенту/агенту» (Фаза 36) — тот же паттерн поиска, что и везде
  // в приложении (см. filteredClients()/matchesTaskListFilters() выше): запрос
  // и «сенник» полей приводятся к нижнему регистру через .trim().toLowerCase(),
  // совпадение — простой .includes(), без учёта ё/е и прочей нормализации —
  // одинаково везде, чтобы поведение поиска не отличалось от вкладки к вкладке.
  const historySearch = document.getElementById('history-search');
  const historyResults = document.getElementById('history-results');
  function renderHistoryResults() {
    const q = (historySearch.value || '').trim().toLowerCase();
    if (!q) { historyResults.innerHTML = ''; return; }
    const agentMatches = stats.byAgent.filter((a) => a.agentName.toLowerCase().includes(q));
    const clientMatches = state.clients.filter((c) => `${c.name} ${c.phone || ''} ${c.contactName || ''}`.toLowerCase().includes(q)).slice(0, 20);
    if (!agentMatches.length && !clientMatches.length) {
      historyResults.innerHTML = '<div class="empty-state">Ничего не нашлось.</div>';
      return;
    }
    historyResults.innerHTML = `
      ${agentMatches.map((a) => `
        <div class="panel" style="margin-bottom:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${escapeHtml(a.agentName)}</strong><span class="muted" style="font-size:12px">агент</span>
          </div>
          <div class="field"><span class="k">Продано в этом месяце</span><span class="v">${fmtMoney(a.actualThisMonth)}</span></div>
          <div class="field"><span class="k">План на месяц</span><span class="v">${a.monthlyPlan ? fmtMoney(a.monthlyPlan) + ' (' + a.planPct + '%)' : '—'}</span></div>
          <div class="field"><span class="k">Долг клиентов</span><span class="v">${fmtMoney(a.totalDebt)}</span></div>
          <div class="field"><span class="k">Задач в работе / просрочено</span><span class="v">${a.open} / ${a.overdueCount}</span></div>
        </div>
      `).join('')}
      ${clientMatches.map((c) => `
        <div class="panel" style="margin-bottom:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${escapeHtml(c.name)}</strong><span class="muted" style="font-size:12px">клиент · ${escapeHtml(userName(c.ownerId))}</span>
          </div>
          <div class="field"><span class="k">Продано в этом месяце</span><span class="v">${fmtMoney(c.currentMonthRevenue || 0)}</span></div>
          <div class="field"><span class="k">Долг</span><span class="v">${c.debtAmount ? fmtMoney(c.debtAmount) + (c.debtOverdue ? ' (просрочка)' : '') : 'нет'}</span></div>
        </div>
      `).join('')}
    `;
  }
  historySearch.addEventListener('input', renderHistoryResults);
}

// ---------- Команда (только админ) ----------

function renderTeam(content) {
  if (!isAdmin()) return;
  content.appendChild(el(`
    <div>
      <div class="toolbar">
        <h2 style="margin:0">Команда</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn-secondary" href="/api/clients/export" download style="text-decoration:none;display:inline-block" title="Ручные поля клиентов (адрес/телефон/контакт/маршрут/договор/заметки и т.п.) — чтобы перенести правки в новую базу при следующей пересборке. Скачивайте перед КАЖДОЙ пересборкой архива — включая клиентов, которых агенты завели сами.">⬇ Выгрузить клиентов</a>
          <button type="button" class="btn-secondary" id="client-import-btn" title="Обновить ручные поля существующих клиентов из ранее выгруженного файла (по имени и агенту) — а тех, кого не нашло (например, клиентов, заведённых агентом самостоятельно), создаёт заново">⬆ Загрузить клиентов</button>
          <input type="file" id="client-import-input" accept=".json" style="display:none">
          <button type="button" class="btn-secondary" id="debts-import-btn" title="Обновить задолженность по всем клиентам — без пересборки архива. Понимает и простую таблицу клиент/сумма/дата, и «Ведомость консигнации» (.xlsx) прямо из бухгалтерской программы — дата и просрочка (>50 000 сом и >7 дней) считаются сами. Формат .xlsb не читаем — пересохраните как .xlsx. Полностью заменяет прежний снимок долгов (клиент, которого нет в новом файле, — долг 0).">⬆ Загрузить долги</button>
          <input type="file" id="debts-import-input" accept=".xlsx,.xls,.xlsb,.csv" style="display:none">
          <a class="btn-secondary" href="/api/backup" style="text-decoration:none;display:inline-block" title="Полный архив: клиенты, задачи, сотрудники, вложения">Скачать резервную копию (всё)</a>
          <button class="btn-primary" id="add-user-btn">+ Сотрудник</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Аватар</th><th>Имя</th><th>Email</th><th>Роль</th><th title="Общий план продаж на месяц — используется на дашборде («План vs факт по агентам»). Не по каждому клиенту, одна цифра на агента.">План (мес.)</th><th></th></tr></thead>
          <tbody id="users-tbody"></tbody>
        </table>
      </div>
    </div>
  `));
  document.getElementById('add-user-btn').addEventListener('click', () => openUserModal());
  // Загрузка ранее выгруженного файла клиентов (пара к "Выгрузить клиентов", 02.09.2026) —
  // обновляет ручные поля уже существующих клиентов по имени+агенту, без дублей;
  // тот же паттерн, что и у загрузки задач на вкладке "Задачи".
  const clientImportBtn = document.getElementById('client-import-btn');
  const clientImportInput = document.getElementById('client-import-input');
  if (clientImportBtn && clientImportInput) {
    clientImportBtn.addEventListener('click', () => clientImportInput.click());
    clientImportInput.addEventListener('change', async () => {
      const file = clientImportInput.files[0];
      if (!file) return;
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch (e) {
        alert('Не удалось прочитать файл — это не корректный JSON');
        clientImportInput.value = '';
        return;
      }
      try {
        const result = await api('POST', '/api/clients/import', { clients: parsed.clients || [] });
        let msg = `Обновлено клиентов: ${result.updated}.`;
        if (result.created) msg += ` Создано заново (не найдены в текущей базе — например, заведённые агентом самостоятельно): ${result.created}.`;
        if (result.unresolvedCount) {
          msg += `\nНе удалось сопоставить: ${result.unresolvedCount} (агент не найден в текущей базе — переименован/удалён) — список в консоли браузера.`;
          console.log('Не распознано при загрузке клиентов:', result.unresolved);
        }
        alert(msg);
        await loadAll();
        render();
      } catch (e) {
        alert('Ошибка загрузки: ' + e.message);
      } finally {
        clientImportInput.value = '';
      }
    });
  }
  // Загрузка долгов/остатков напрямую через панель (Фаза 19, 04.09.2026) —
  // без пересборки архива, файл .xlsx или .csv. Оба эндпойнта полностью
  // заменяют прежний снимок (см. пояснение в src/api.js) — предупреждаем об
  // этом в подтверждении перед отправкой.
  function wireTableUploadButton(btnId, inputId, endpoint, confirmText, successMsg) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      if (!confirm(confirmText)) { input.value = ''; return; }
      const fd = new FormData();
      fd.append('file', file);
      try {
        const result = await apiUpload(endpoint, fd);
        alert(successMsg(result));
        await loadAll();
        render();
      } catch (e) {
        alert('Ошибка загрузки: ' + e.message);
      } finally {
        input.value = '';
      }
    });
  }
  wireTableUploadButton(
    'debts-import-btn', 'debts-import-input', '/api/debts/import',
    'Это полностью заменит текущие данные о долгах у всех клиентов (клиент, которого нет в новом файле, останется с долгом 0). Продолжить?',
    (r) => {
      let msg = `Готово. Строк в файле: ${r.parsedRows}, сопоставлено с клиентами: ${r.matchedClients}.`;
      if (r.unmatchedCount) {
        msg += `\nНе удалось сопоставить: ${r.unmatchedCount} (нет такого клиента в CRM — переименован, разовая продажа или ещё не заведён) — список в консоли браузера.`;
        console.log('Не распознано при загрузке долгов:', r.unmatched);
      }
      return msg;
    }
  );
  const tbody = document.getElementById('users-tbody');
  state.users.forEach((u) => {
    const row = el(`
      <tr>
        <td>
          <label class="avatar-upload" title="Загрузить аватар">
            ${avatarHtml(u.id, 36)}
            <input type="file" accept="image/*" class="avatar-input" data-id="${u.id}" style="display:none">
          </label>
        </td>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email || '')}</td>
        <td>${roleLabel(u.role)}</td>
        <td>${u.role === 'agent' ? `<input type="number" min="0" step="1000" class="plan-input" data-id="${u.id}" value="${u.monthlyPlan || ''}" placeholder="0" style="width:110px">` : '—'}</td>
        <td>${u.role === 'agent' ? '<button class="link-btn tracker-setup" title="Настроить фоновый трекер на телефоне агента">📡 Трекер</button> ' : ''}<button class="link-btn set-password" title="Задать новый пароль">🔑 Пароль</button> ${u.id !== state.user.id ? '<button class="link-btn delete-user">Удалить</button>' : ''}</td>
      </tr>
    `);
    row.querySelector('.set-password').addEventListener('click', () => openSetPasswordModal(u));
    const trBtn = row.querySelector('.tracker-setup');
    if (trBtn) trBtn.addEventListener('click', () => openTrackerSetupModal(u));
    const delBtn = row.querySelector('.delete-user');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm('Удалить сотрудника?')) return;
      await api('DELETE', `/api/users/${u.id}`);
      await loadAll();
      render();
    });
    const avatarInput = row.querySelector('.avatar-input');
    avatarInput.addEventListener('change', async () => {
      if (!avatarInput.files.length) return;
      const fd = new FormData();
      fd.append('file', avatarInput.files[0]);
      try {
        await apiUpload(`/api/users/${u.id}/avatar`, fd);
        await loadAll();
        render();
      } catch (e) { alert(e.message); }
    });
    // План на месяц (Фаза 36) — сохраняем по blur/Enter, без отдельной кнопки
    // «Сохранить», как и остальные быстрые правки на этой странице.
    const planInput = row.querySelector('.plan-input');
    if (planInput) {
      const savePlan = async () => {
        const val = Math.max(0, Math.round(Number(planInput.value) || 0));
        planInput.value = val || '';
        try {
          await api('PUT', `/api/users/${u.id}/plan`, { monthlyPlan: val });
          const su = state.users.find((x) => x.id === u.id);
          if (su) su.monthlyPlan = val;
        } catch (e) { alert('Не удалось сохранить план: ' + e.message); }
      };
      planInput.addEventListener('blur', savePlan);
      planInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') planInput.blur(); });
    }
    tbody.appendChild(row);
  });
}

function openUserModal() {
  const body = `
    <h2>Новый сотрудник</h2>
    <form id="user-form">
      <label>Имя *</label><input name="name" required>
      <label>Email *</label><input name="email" type="email" required>
      <label>Пароль *</label><input name="password" type="password" required minlength="4">
      <label>Роль</label>
      <select name="role">
        <option value="agent">Торговый агент</option>
        <option value="supervisor">Супервайзер</option>
        <option value="admin">Администратор</option>
      </select>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cancel-modal">Отмена</button>
        <button type="submit" class="btn-primary">Создать</button>
      </div>
    </form>
  `;
  openModal(body, async (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    await api('POST', '/api/users', data);
    await loadAll();
    closeModal();
    render();
  });
}

// ---------- Календарь ----------

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_LABELS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
// Фаза 31 (14.09.2026): те же 4 воронки задач, что на странице «Задачи» — подписи
// намеренно совпадают дословно с кнопками-переключателями там (task-type-*-btn).
const CALENDAR_TASK_TYPES = [
  { key: 'visit', label: 'Визиты с супервайзером' },
  { key: 'sale', label: 'Воронка продаж' },
  { key: 'waitlist', label: 'Лист ожидания' },
  { key: 'agent', label: 'Задачи агенту' },
  { key: 'checkin', label: 'Посещения' }
];

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfWeek(d) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const res = new Date(d);
  res.setDate(d.getDate() + diff);
  res.setHours(0, 0, 0, 0);
  return res;
}
function fmtDateShort(d) { return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`; }
function fmtDateLong(d) { return `${d.getDate()} ${(MONTH_LABELS[d.getMonth()] || '').toLowerCase()} ${d.getFullYear()}`; }
// Фаза 31 (14.09.2026): фильтр по воронкам в Календаре — задача скрыта, если её
// taskType (по умолчанию 'visit', см. остальной код) в state.calendar.hiddenTypes.
// Единая точка фильтрации — используется во всех представлениях (месяц/неделя/день)
// и в «Печати маршрута», поэтому скрытые воронки не просачиваются никуда.
// Фаза 39 (23.09.2026): плюс фильтр по агенту (state.calendar.agentId, только у
// администратора/супервайзера) — через ту же единую точку.
function tasksOnDate(dateKey) {
  const aid = state.calendar.agentId ? Number(state.calendar.agentId) : null;
  // 15.10.2026: фильтр «день недели» — задачи по клиентам с этим днём визита (район дня);
  // «-» — клиенты без дня визита. Задачи без клиента при включённом фильтре скрыты.
  const vd = state.calendar.visitDay;
  return state.tasks.filter((t) => t.dueDate === dateKey
    && !state.calendar.hiddenTypes.has(t.taskType || 'visit')
    && (!aid || t.assigneeId === aid)
    && (!vd || (() => { const c = clientById(t.clientId); if (!c) return false; const d = (c.visitDay || '').trim(); return vd === '-' ? !d : d.toLowerCase() === vd.toLowerCase(); })()));
}
// Короткое имя агента для чипа календаря (Фаза 39): первое слово имени.
function calAgentShort(userId) {
  const n = userName(userId);
  if (/^Агент \d/.test(n || '')) return n; // ДЕМО-ВЕРСИЯ: псевдонимы «Агент N» не сокращаем
  return n && n !== '—' ? n.split(/\s+/)[0] : '';
}
// Цвет задачи в календаре (Фаза 40, 25.09.2026): зелёный — выполнена,
// красный — не выполнена, синий — ожидается, жёлтый — просрочена (после 20:00 дня).
function calTaskStatus(t) {
  if (['done', 'archived', 'received'].includes(t.stage)) return 'done';
  if (t.stage === 'not_done') return 'failed';
  if (isTaskOverdue(t)) return 'overdue';
  return 'pending';
}
const CAL_STATUS_LABELS = { done: 'выполнена', failed: 'не выполнена', pending: 'ожидается', overdue: 'просрочена' };
function calStatusCounts(tasks) {
  const n = { done: 0, failed: 0, pending: 0, overdue: 0 };
  tasks.forEach((t) => { n[calTaskStatus(t)]++; });
  return ['done', 'failed', 'pending', 'overdue'].filter((k) => n[k]).map((k) => `<span class="cal-cnt cal-st-${k}" title="${CAL_STATUS_LABELS[k]}">${n[k]}</span>`).join('');
}
function calChipLabel(t) {
  const c = clientById(t.clientId);
  const who = isStaff() ? calAgentShort(t.assigneeId) : '';
  return `${who ? `<span class="cal-chip-agent">${escapeHtml(who)}</span> ` : ''}${escapeHtml(c ? c.name : t.title)}`;
}
function supMeetingsOnDate(dateKey) { return (state.supervisorMeetings || []).filter((m) => m.date === dateKey); }

function shiftCalendar(dir) {
  const cal = state.calendar;
  const d = new Date(cal.date);
  if (cal.mode === 'month') d.setMonth(d.getMonth() + dir);
  else if (cal.mode === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setDate(d.getDate() + dir);
  state.calendar.date = d;
}

function renderCalendar(content) {
  const cal = state.calendar;
  content.appendChild(el(`
    <div>
      <div class="toolbar">
        <h2 style="margin:0">Календарь</h2>
        <div class="cal-controls">
          <button type="button" class="btn-secondary cal-mode-btn" id="cal-mode-month">Месяц</button>
          <button type="button" class="btn-secondary cal-mode-btn" id="cal-mode-week">Неделя</button>
          <button type="button" class="btn-secondary cal-mode-btn" id="cal-mode-day">День</button>
          <button type="button" class="btn-secondary" id="cal-prev">←</button>
          <button type="button" class="btn-secondary" id="cal-today">Сегодня</button>
          <button type="button" class="btn-secondary" id="cal-next">→</button>
          ${state.user.role === 'supervisor' ? '<button type="button" class="btn-secondary" id="cal-print">Печать маршрута (неделя)</button>' : ''}
          ${state.user.role === 'supervisor' ? '<button type="button" class="btn-primary" id="cal-add-sup-meeting">+ Встреча с клиентом</button>' : ''}
        </div>
      </div>
      <div class="filter-bar">
        ${CALENDAR_TASK_TYPES.map((t) => `<label class="filter-check"><input type="checkbox" class="cal-type-filter" data-type="${t.key}" ${cal.hiddenTypes.has(t.key) ? '' : 'checked'}> ${t.label}</label>`).join('')}
        ${isStaff() ? `<select id="cal-agent-filter" class="card-agent-filter"><option value="">Все агенты</option>${state.users.filter((u) => u.role === 'agent').map((a) => `<option value="${a.id}" ${String(cal.agentId) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>` : ''}
        <select id="cal-visitday-filter" title="Задачи по клиентам с этим днём визита"><option value="">День недели: все</option>${VISIT_DAYS.map((d) => `<option value="${d}" ${cal.visitDay === d ? 'selected' : ''}>${d}</option>`).join('')}<option value="-" ${cal.visitDay === '-' ? 'selected' : ''}>День не указан</option></select>
        ${cal.hiddenTypes.size || cal.agentId || cal.visitDay ? '<button type="button" class="link-btn" id="cal-type-filter-reset">Сбросить</button>' : ''}
      </div>
      ${state.user.role !== 'supervisor' ? '<div class="sub muted" style="margin-bottom:6px">🟣 — в этот день у супервайзера запланирована встреча с клиентом (день занят).</div>' : ''}
      <div class="cal-legend"><span class="cal-cnt cal-st-done">выполнена</span><span class="cal-cnt cal-st-failed">не выполнена</span><span class="cal-cnt cal-st-pending">ожидается</span><span class="cal-cnt cal-st-overdue">просрочена</span></div>
      <div id="cal-title" class="cal-title"></div>
      <div id="cal-body"></div>
      <div id="print-route" class="print-only"></div>
    </div>
  `));

  const printBtn = document.getElementById('cal-print');
  if (printBtn) printBtn.addEventListener('click', () => { renderPrintRoute(); window.print(); });
  const addSupBtn = document.getElementById('cal-add-sup-meeting');
  if (addSupBtn) addSupBtn.addEventListener('click', () => openSupervisorMeetingModal(toDateKey(cal.date)));

  // Фильтр по воронкам (Фаза 31, 14.09.2026) — снятая галочка прячет задачи этой
  // воронки во всех представлениях календаря и в «Печати маршрута» (см. tasksOnDate()).
  document.querySelectorAll('.cal-type-filter').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const type = e.target.getAttribute('data-type');
      if (e.target.checked) cal.hiddenTypes.delete(type);
      else cal.hiddenTypes.add(type);
      render();
    });
  });
  const calTypeResetBtn = document.getElementById('cal-type-filter-reset');
  if (calTypeResetBtn) calTypeResetBtn.addEventListener('click', () => { cal.hiddenTypes.clear(); cal.agentId = ''; cal.visitDay = ''; render(); });
  const calDaySel = document.getElementById('cal-visitday-filter');
  if (calDaySel) calDaySel.addEventListener('change', (e) => { cal.visitDay = e.target.value; render(); });
  const calAgentSel = document.getElementById('cal-agent-filter');
  if (calAgentSel) calAgentSel.addEventListener('change', (e) => { cal.agentId = e.target.value; render(); });

  ['month', 'week', 'day'].forEach((m) => {
    const btn = document.getElementById(`cal-mode-${m}`);
    btn.classList.toggle('active', cal.mode === m);
    btn.addEventListener('click', () => { state.calendar.mode = m; render(); });
  });
  document.getElementById('cal-today').addEventListener('click', () => { state.calendar.date = new Date(); render(); });
  document.getElementById('cal-prev').addEventListener('click', () => { shiftCalendar(-1); render(); });
  document.getElementById('cal-next').addEventListener('click', () => { shiftCalendar(1); render(); });

  if (cal.mode === 'month') renderCalMonth();
  else if (cal.mode === 'week') renderCalWeek();
  else renderCalDay();
}

function renderCalMonth() {
  const cal = state.calendar;
  const y = cal.date.getFullYear(), m = cal.date.getMonth();
  document.getElementById('cal-title').textContent = `${MONTH_LABELS[m]} ${y}`;
  const startDate = startOfWeek(new Date(y, m, 1));
  const todayKey = toDateKey(new Date());
  const grid = el('<div class="cal-month-grid"></div>');
  WEEKDAY_LABELS.forEach((wd) => grid.appendChild(el(`<div class="cal-weekday">${wd}</div>`)));
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = toDateKey(d);
    const dayTasks = tasksOnDate(key);
    const inMonth = d.getMonth() === m;
    // Мобильная версия: вместо списка карточек (не помещается) — точка-индикатор.
    // Все задачи в ячейке имеют один и тот же срок (= дата ячейки), поэтому
    // цвет общий на ячейку: зелёная — срок ещё не прошёл, красная — просрочено.
    // Показывается только если есть незавершённые задачи (этап "В работе").
    const incomplete = dayTasks.filter((t) => ACTIVE_STAGES.includes(t.stage));
    const dotClass = incomplete.length ? (key < todayKey ? 'cal-dot-red' : 'cal-dot-green') : '';
    const supMeetings = supMeetingsOnDate(key);
    const cell = el(`
      <div class="cal-day-cell ${inMonth ? '' : 'cal-day-outside'} ${key === todayKey ? 'cal-day-today' : ''}">
        <div class="cal-day-num">${d.getDate()} ${supMeetings.length ? '<span class="cal-dot cal-dot-sup" title="Встреча супервайзера в этот день">●</span>' : ''}</div>
        <div class="cal-day-tasks">
          ${dayTasks.length ? `<div class="cal-counts">${calStatusCounts(dayTasks)}</div>` : ''}
          ${dayTasks.slice(0, 3).map((t) => `<div class="cal-chip cal-st-${calTaskStatus(t)}">${calChipLabel(t)}</div>`).join('')}
          ${dayTasks.length > 3 ? `<div class="cal-more">+${dayTasks.length - 3}</div>` : ''}
        </div>
        ${dayTasks.length ? `<div class="cal-day-dot-wrap">${calStatusCounts(dayTasks)}</div>` : ''}
      </div>
    `);
    cell.addEventListener('click', () => { state.calendar.date = d; state.calendar.mode = 'day'; render(); });
    grid.appendChild(cell);
  }
  document.getElementById('cal-body').appendChild(grid);
}

function renderCalWeek() {
  const cal = state.calendar;
  const start = startOfWeek(cal.date);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  document.getElementById('cal-title').textContent = `${fmtDateShort(days[0])} – ${fmtDateShort(days[6])}`;
  const todayKey = toDateKey(new Date());
  const grid = el('<div class="cal-week-grid"></div>');
  days.forEach((d) => {
    const key = toDateKey(d);
    const dayTasks = tasksOnDate(key);
    const dayMeetings = supMeetingsOnDate(key);
    const col = el(`
      <div class="cal-week-col ${key === todayKey ? 'cal-day-today' : ''}">
        <div class="cal-week-head">${WEEKDAY_LABELS[(d.getDay() + 6) % 7]} ${d.getDate()}</div>
        <div class="cal-week-body"></div>
        <div class="cal-week-sup-col"></div>
      </div>
    `);
    const colBody = col.querySelector('.cal-week-body');
    if (!dayTasks.length) colBody.appendChild(el('<div class="muted" style="font-size:12px;padding:4px">—</div>'));
    dayTasks.forEach((t) => {
      const c = clientById(t.clientId);
      const card = el(`<div class="cal-chip cal-chip-block cal-st-${calTaskStatus(t)}">${calChipLabel(t)}<div class="muted" style="font-size:11px">${CAL_STATUS_LABELS[calTaskStatus(t)]}</div></div>`);
      card.addEventListener('click', () => openTaskOrClient(t));
      colBody.appendChild(card);
    });
    // Отдельный столбец/раздел встреч супервайзера — виден всем (агенты видят,
    // какие дни у клиента уже заняты), но добавлять/удалять может только супервайзер.
    const supCol = col.querySelector('.cal-week-sup-col');
    supCol.appendChild(el('<div class="cal-week-sup-head">👔 Супервайзер</div>'));
    if (!dayMeetings.length) {
      supCol.appendChild(el('<div class="muted" style="font-size:11px;padding:2px 4px">—</div>'));
    }
    dayMeetings.forEach((m) => {
      const c = clientById(m.clientId);
      const chip = el(`
        <div class="cal-chip cal-chip-block cal-chip-sup">
          ${escapeHtml(c ? c.name : '—')} ${m.time ? `<span class="muted">· ${escapeHtml(m.time)}</span>` : ''}
          ${state.user.role === 'supervisor' ? '<button type="button" class="icon-btn del-sup-meeting" title="Удалить">✕</button>' : ''}
        </div>
      `);
      const delBtn = chip.querySelector('.del-sup-meeting');
      if (delBtn) delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Удалить встречу?')) return;
        await api('DELETE', `/api/supervisor-meetings/${m.id}`);
        await loadAll();
        render();
      });
      supCol.appendChild(chip);
    });
    grid.appendChild(col);
  });
  document.getElementById('cal-body').appendChild(grid);
}

function renderCalDay() {
  const cal = state.calendar;
  const key = toDateKey(cal.date);
  document.getElementById('cal-title').textContent = fmtDateLong(cal.date);
  const dayTasks = tasksOnDate(key);
  const dayMeetings = supMeetingsOnDate(key);
  const body = document.getElementById('cal-body');

  if (!dayTasks.length) {
    body.appendChild(el('<div class="empty-state">На этот день задач нет.</div>'));
  } else {
    const list = el('<div class="cal-day-list"></div>');
    dayTasks.forEach((t) => {
      const c = clientById(t.clientId);
      const row = el(`
        <div class="history-row cal-day-row cal-row-${calTaskStatus(t)}">
          <div><strong>${escapeHtml(c ? c.name : t.title)}</strong> <span class="badge cal-st-${calTaskStatus(t)}">${CAL_STATUS_LABELS[calTaskStatus(t)]}</span></div>
          <div class="muted">${agentTag(t.assigneeId)}</div>
          ${taskTagBadges(t) ? `<div class="card-tags">${taskTagBadges(t)}</div>` : ''}
        </div>
      `);
      row.addEventListener('click', () => openTaskOrClient(t));
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  // Отдельный раздел — встречи супервайзера на этот день (свой "столбец" данных,
  // не смешан с задачами агентов). У супервайзера — с кнопкой удаления.
  const panel = el(`
    <div class="panel">
      <h2 style="margin:0 0 8px">👔 Встречи супервайзера</h2>
      <div id="cal-day-sup-list"></div>
    </div>
  `);
  const supList = panel.querySelector('#cal-day-sup-list');
  if (!dayMeetings.length) {
    supList.appendChild(el('<div class="muted">Встреч не запланировано.</div>'));
  }
  dayMeetings.forEach((m) => {
    const c = clientById(m.clientId);
    const row = el(`
      <div class="history-row cal-day-row">
        <div><strong>${escapeHtml(c ? c.name : '—')}</strong> ${m.time ? `<span class="badge">${escapeHtml(m.time)}</span>` : ''}</div>
        <div class="muted">${c ? agentTag(c.ownerId) : ''}</div>
        ${m.note ? `<div class="muted">${escapeHtml(m.note)}</div>` : ''}
        ${state.user.role === 'supervisor' ? '<button type="button" class="btn-secondary del-sup-meeting" style="margin-top:6px">Удалить</button>' : ''}
      </div>
    `);
    const delBtn = row.querySelector('.del-sup-meeting');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm('Удалить встречу?')) return;
      await api('DELETE', `/api/supervisor-meetings/${m.id}`);
      await loadAll();
      render();
    });
    supList.appendChild(row);
  });
  body.appendChild(panel);
}

function openSupervisorMeetingModal(dateKey) {
  const body = `
    <h2>Встреча с клиентом</h2>
    <form id="sup-meeting-form">
      <label>Клиент *</label>
      <input type="text" id="sup-meeting-client-search" placeholder="Поиск клиента по названию..." autocomplete="off" style="margin-bottom:6px">
      <select name="clientId" id="sup-meeting-client-select" required>
        ${state.clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
      </select>
      <label>Дата *</label>
      ${dateFieldHTML({ name: 'date', value: dateKey || '', required: true })}
      <label>Время</label>
      <input name="time" type="time">
      <label>Заметка</label>
      <textarea name="note" placeholder="Тема встречи, детали"></textarea>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cancel-modal">Отмена</button>
        <button type="submit" class="btn-primary">Добавить</button>
      </div>
    </form>
  `;
  openModal(body, async (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    await api('POST', '/api/supervisor-meetings', data);
    await loadAll();
    closeModal();
    render();
  });
  wireClientSearchSelect('sup-meeting-client-search', 'sup-meeting-client-select', state.clients);
}

// ---------- "Мой день" — упрощённый вид для агента в дороге ----------

function renderMyDay(content) {
  const stats = state.stats;
  const tasks = stats ? stats.todayTasks : [];
  content.appendChild(el(`
    <div>
      <h2 style="margin:0 0 14px">Мой день — ${fmtDateLong(new Date())}</h2>
      <div id="myday-list"></div>
    </div>
  `));
  const list = document.getElementById('myday-list');
  if (!tasks.length) {
    list.appendChild(el('<div class="empty-state">На сегодня задач нет.</div>'));
    return;
  }
  tasks.forEach((t) => {
    const client = clientById(t.clientId);
    const card = el(`
      <div class="myday-card">
        <div class="myday-name">${escapeHtml(client ? client.name : t.title)}</div>
        ${client ? `<div class="myday-row">${escapeHtml(client.address || 'адрес не указан')} ${mapsLink(client.address, client.geo)}</div>` : ''}
        ${client && client.phone ? `<div class="myday-row">${telLink(client.phone, '📞 ' + client.phone)}</div>` : ''}
        <div class="myday-row muted">${escapeHtml(stageLabel(t.stage))}${t.report ? ' · ✓ отчёт' : ''}</div>
        <div class="filter-bar" style="margin-top:6px">
          ${client && !(t.taskType === 'checkin' && t.stage !== 'in_progress') ? '<button type="button" class="btn-primary myday-visit">📍 Отметить посещение</button>' : ''}
          <button type="button" class="btn-secondary myday-open">${t.taskType === 'checkin' ? 'Карточка клиента' : 'Открыть задачу'}</button>
        </div>
        ${client && (client.visits || []).length ? `<div class="myday-row muted" style="font-size:12px">Последняя отметка: ${fmtVisitTime(client.visits[client.visits.length - 1].at)} · ${visitStatusText(client.visits[client.visits.length - 1])}</div>` : ''}
      </div>
    `);
    card.querySelector('.myday-open').addEventListener('click', () => openTaskOrClient(t));
    const vBtn = card.querySelector('.myday-visit');
    if (vBtn) vBtn.addEventListener('click', async () => { const r = await checkInVisit(client, vBtn); if (r) { await loadAll(); render(); } });
    list.appendChild(card);
  });
}

// ---------- Уведомления (Notification API + Service Worker) ----------

let notifiedTaskIds = null;
function loadNotifiedIds() {
  if (notifiedTaskIds) return notifiedTaskIds;
  try {
    const raw = localStorage.getItem('notifiedTasks_' + new Date().toISOString().slice(0, 10));
    notifiedTaskIds = new Set(raw ? JSON.parse(raw) : []);
  } catch (e) { notifiedTaskIds = new Set(); }
  return notifiedTaskIds;
}
function saveNotifiedIds() {
  try { localStorage.setItem('notifiedTasks_' + new Date().toISOString().slice(0, 10), JSON.stringify(Array.from(notifiedTaskIds || []))); } catch (e) {}
}

async function checkAndNotify() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!state.stats) return;
  const seen = loadNotifiedIds();
  const toNotify = [...(state.stats.todayTasks || []), ...(state.stats.overdueTasks || [])].filter((t) => !seen.has(t.id));
  if (!toNotify.length) return;
  let reg = null;
  try { reg = await navigator.serviceWorker.getRegistration(); } catch (e) {}
  toNotify.forEach((t) => {
    const client = clientById(t.clientId);
    const overdue = (state.stats.overdueTasks || []).some((o) => o.id === t.id);
    const title = overdue ? 'Просроченная задача' : 'Задача на сегодня';
    const bodyText = client ? client.name : t.title;
    try {
      if (reg && reg.showNotification) reg.showNotification(title, { body: bodyText, tag: 'task-' + t.id });
      else new Notification(title, { body: bodyText });
    } catch (e) {}
    seen.add(t.id);
  });
  saveNotifiedIds();
}

function setupNotifications() {
  if (!('Notification' in window)) return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(() => checkAndNotify());
  } else if (Notification.permission === 'granted') {
    checkAndNotify();
  }
  // Работает и когда вкладка свёрнута в фон (таймер будет реже срабатывать,
  // но не остановится, пока страница открыта в браузере).
  setInterval(async () => {
    try { await loadAll(); checkAndNotify(); } catch (e) {}
  }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAndNotify();
  });
}

// Печать маршрута на неделю (только супервайзер) — простой список по агентам/дням.
// Правка 01.09.2026 (Фаза 16, п.6/следствие): внутри каждого дня точки теперь
// сортируются по полю "Номер маршрута" клиента (по возрастанию) — как только у
// клиента проставлено значение, он встаёт на своё место; у кого номер не
// проставлен — остаются в конце, в исходном порядке между собой (стабильная
// сортировка, ничего не перетасовывает лишний раз).
function renderPrintRoute() {
  const box = document.getElementById('print-route');
  if (!box) return;
  const start = startOfWeek(state.calendar.date);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  const agents = state.users.filter((u) => u.role === 'agent');
  let html = `<h1>Маршрут на неделю: ${fmtDateShort(days[0])} – ${fmtDateShort(days[6])}</h1>`;
  agents.forEach((agent) => {
    html += `<h2>${escapeHtml(agent.name)}</h2>`;
    days.forEach((d) => {
      const key = toDateKey(d);
      const dayTasks = tasksOnDate(key).filter((t) => t.assigneeId === agent.id);
      if (!dayTasks.length) return;
      const sortedTasks = dayTasks.slice().sort((a, b) => {
        const ca = clientById(a.clientId), cb = clientById(b.clientId);
        const ra = ca && ca.routeNumber != null ? ca.routeNumber : Infinity;
        const rb = cb && cb.routeNumber != null ? cb.routeNumber : Infinity;
        return ra - rb;
      });
      html += `<h3>${WEEKDAY_LABELS[(d.getDay() + 6) % 7]} ${fmtDateShort(d)}</h3><ul>`;
      sortedTasks.forEach((t) => {
        const c = clientById(t.clientId);
        const routeLabel = c && c.routeNumber != null ? `№${escapeHtml(String(c.routeNumber))} — ` : '';
        html += `<li>${routeLabel}${escapeHtml(c ? c.name : t.title)}${c && c.address ? ' — ' + escapeHtml(c.address) : ''}${c && c.phone ? ' — ' + escapeHtml(c.phone) : ''}</li>`;
      });
      html += '</ul>';
    });
  });
  box.innerHTML = html;
}

// ---------- Модальные окна ----------

function openModal(innerHtml, onSubmit) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay"><div class="modal">${innerHtml}</div></div>`;
  const overlay = root.querySelector('.modal-overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  const cancelBtn = root.querySelector('#cancel-modal');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  const form = root.querySelector('form');
  if (!form) return;
  const errBox = el('<p class="error"></p>');
  form.appendChild(errBox);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.textContent = '';
    // Скрытые поля даты (виджет ДД.ММ.ГГ) не участвуют в нативной HTML5-валидации
    // required, поэтому обязательность проверяем вручную.
    const missingDate = Array.from(form.querySelectorAll('.date-field input[type="hidden"][data-required="1"]')).find((h) => !h.value);
    if (missingDate) {
      const textInput = missingDate.closest('.date-field').querySelector('.date-display-input');
      errBox.textContent = 'Укажите корректную дату (ДД.ММ.ГГ)';
      if (textInput) textInput.classList.add('invalid');
      return;
    }
    try {
      await onSubmit(form);
    } catch (err) {
      errBox.textContent = err.message;
    }
  });
}

function closeModal() {
  stopAttachRecording();
  document.getElementById('modal-root').innerHTML = '';
}

// Свайп вправо для закрытия модалки (тач-жест, мобильные устройства).
// Подключается точечно там, где это нужно (сейчас — карточка клиента),
// а не глобально в openModal(), чтобы не мешать горизонтальному скроллу
// внутри других модалок (широкие чипы фильтров, недельный календарь и т.п.).
function wireSwipeToClose(modalEl, onClose) {
  if (!modalEl) return;
  const THRESHOLD_PX = 90;
  const MAX_DURATION_MS = 700;
  let startX = null;
  let startY = null;
  let startTime = 0;
  let tracking = false;
  modalEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    // Не перехватываем жест, начавшийся на элементах со своим горизонтальным
    // скроллом (чипы-фильтры, недельный/месячный календарь) — иначе свайп
    // для прокрутки чипов случайно закрывал бы карточку.
    if (e.target.closest('.assort-brand-filter, .cal-week-grid, .cal-month-grid, input[type="range"]')) {
      tracking = false;
      return;
    }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    tracking = true;
  }, { passive: true });
  modalEl.addEventListener('touchend', (e) => {
    if (!tracking || startX === null) return;
    tracking = false;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const duration = Date.now() - startTime;
    if (duration <= MAX_DURATION_MS && dx > THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onClose();
    }
  }, { passive: true });
}

// ---------- Экранирование ----------

// ---------- WhatsApp (Фаза 43, 02.10.2026) ----------
// Вкладка «WhatsApp»: подключение номеров агентов по QR и чаты, которые не удалось
// сопоставить с клиентом по телефону. CRM только читает переписку.
let waPollTimer = null;
let waUnmatchedAgent = ''; // фильтр «Не сопоставленные чаты» по агенту
let waUnmatchedSearch = ''; // 08.10.2026: поиск «Не сопоставленных чатов» по номеру телефона
function stopWaPolling() { if (waPollTimer) { clearInterval(waPollTimer); waPollTimer = null; } }

// Только цифры номера — чтобы «+996 555 123 456», «0555123456» и «555-123-456» находились одним и тем же поиском.
// 09.10.2026: поиск по номеру телефона «как ни введи» — 0555 12 34 56, 555123456,
// +996 555..., 996555... находят одно и то же. Общая функция для «Клиентов»,
// «Задач» и «WhatsApp» (правило: где поиск — логика одинаковая).
function phoneQueryDigits(q) {
  const s = String(q || '').trim();
  if (!s || /[a-zа-яё]/i.test(s)) return ''; // есть буквы — это поиск по названию
  let d = s.replace(/\D/g, '');
  if (d.length < 3) return '';
  if (d.startsWith('996') && d.length > 9) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return d;
}
// Все номера клиента: основной телефон, номера WhatsApp (ручные привязки), мастера.
function clientPhoneDigits(c) {
  if (!c) return '';
  const parts = [c.phone || ''];
  (c.waPhones || []).forEach((k) => parts.push(String(k)));
  (c.masters || []).forEach((m) => parts.push(m.phone || ''));
  (c.extraContacts || []).forEach((x) => parts.push(x.phone || ''));
  return parts.map((x) => String(x).replace(/\D/g, '')).filter(Boolean).join(' ');
}
function clientMatchesPhone(c, q) {
  const d = phoneQueryDigits(q);
  return Boolean(d) && clientPhoneDigits(c).includes(d);
}

function waOnlyDigits(s) { return String(s || '').replace(/\D/g, ''); }

const WA_STATUS_TEXT = {
  connected: '🟢 Подключён',
  qr: '🟡 Ждёт сканирования QR',
  connecting: '🟡 Подключается…',
  off: '⚪ Не подключён',
  error: '🔴 Ошибка'
};

function waTime(isoOrSec) {
  if (!isoOrSec) return '—';
  const d = typeof isoOrSec === 'number' ? new Date(isoOrSec * 1000) : new Date(isoOrSec);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function waBubblesHtml(messages, opts) {
  opts = opts || {};
  if (!messages.length) return '<p class="muted">Сообщений пока нет.</p>';
  let lastDay = '';
  return messages.map((m) => {
    const d = new Date(m.t * 1000);
    const day = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
    const sep = day !== lastDay ? `<div class="wa-day">${day}</div>` : '';
    lastDay = day;
    const who = m.me ? escapeHtml(userName(m.a)) : escapeHtml((opts.labels && m.k && opts.labels[m.k]) || m.n || 'Клиент');
    return `${sep}<div class="wa-msg ${m.me ? 'wa-out' : 'wa-in'}"><div class="wa-meta">${who} · ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>${waBodyHtml(m)}</div>`;
  }).join('');
}

// Тело сообщения: текст или вложение (фото / голосовое / видео / документ).
function waBodyHtml(m) {
  const text = (t) => (t ? `<div class="wa-text">${escapeHtml(t)}</div>` : '');
  if (!m.ext) return text(m.x);
  const url = `/api/whatsapp/media/${m.a}/${encodeURIComponent(m.id)}`;
  const caption = String(m.x || '').replace(/^\[[^\]]+\]\s*/, '');
  if (!m.hm) {
    const why = m.sz && m.sz > 15 * 1024 * 1024 ? 'файл больше 15 МБ — не сохраняется' : 'файл загружается или WhatsApp его уже не отдаёт';
    return text(m.x) + `<div class="wa-nofile">${why}</div>`;
  }
  if (m.ty === 'image') return `<a href="${url}" target="_blank" rel="noopener"><img class="wa-img" loading="lazy" src="${url}" alt="Фото"></a>` + text(caption);
  if (m.ty === 'audio') return `<div class="wa-audio"><span>${m.x.startsWith('[Голос') ? '🎤' : '🎵'}${m.sec ? ' ' + Math.floor(m.sec / 60) + ':' + String(m.sec % 60).padStart(2, '0') : ''}</span><audio controls preload="none" src="${url}"></audio></div><a class="wa-dl" href="${url}" download>скачать</a>`;
  if (m.ty === 'video') return `<video class="wa-img" controls preload="none" src="${url}"></video>` + text(caption);
  return `<a class="wa-doc" href="${url}" target="_blank" rel="noopener">📄 ${escapeHtml(m.fn || 'Документ')}</a>` + (m.sz ? ` <span class="wa-nofile">${m.sz >= 1048576 ? (m.sz / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(m.sz / 1024)) + ' КБ'}</span>` : '');
}

function renderWhatsapp(content) {
  content.appendChild(el(`
    <div>
      <div class="toolbar"><h2 style="margin:0">WhatsApp</h2></div>
      <p class="muted" style="margin-top:0">CRM подключается к номеру агента как «связанное устройство» и только читает личные чаты — ничего не отправляет. Переписка попадает в карточку клиента по номеру телефона. Чтобы подключить: нажмите «Подключить», затем на телефоне агента WhatsApp → Настройки → Связанные устройства → Привязать устройство и наведите камеру на QR на этом экране.</p>
      <div id="wa-lib-note"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Агент</th><th>Статус</th><th>Номер</th><th>Сообщений</th><th>Последнее</th><th></th></tr></thead>
        <tbody id="wa-agents"><tr><td colspan="6" class="muted">Загрузка…</td></tr></tbody>
      </table></div>
      <div id="wa-qr-box"></div>
      <div class="filter-bar" style="margin:18px 0 6px;align-items:center">
        <h3 style="margin:0">Не сопоставленные чаты <span class="muted" id="wa-unm-count"></span></h3>
        <input type="search" id="wa-unm-search" placeholder="Поиск по номеру: 0555…, 996…" value="${escapeHtml(waUnmatchedSearch)}" style="max-width:220px">
        ${isStaff() ? `<select id="wa-unm-agent" title="Показать чаты номера одного агента"><option value="">Все агенты</option>${state.users.filter((u) => u.role === 'agent').map((u) => `<option value="${u.id}" ${String(waUnmatchedAgent) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select>` : ''}
      </div>
      <div id="wa-unm-clients"></div>
      <p class="muted" style="margin-top:0">Номера, которых нет в карточках клиентов. Привяжите номер к клиенту — и вся переписка с ним появится в карточке. Личные и посторонние чаты можно просто не трогать.</p>
      <div class="table-wrap"><table>
        <thead><tr><th class="sticky-col wa-num-col">Номер</th><th>Имя в WhatsApp</th><th>Агент</th><th>Сообщ.</th><th>Последнее сообщение</th><th></th></tr></thead>
        <tbody id="wa-unmatched"><tr><td colspan="6" class="muted">Загрузка…</td></tr></tbody>
      </table></div>
      <div id="wa-closed"></div>
    </div>`));

  let qrAgentId = null; // для какого агента показываем QR
  let lastAgentsKey = '';
  let lastUnmatchedKey = '';
  let unmatchedLoadedAt = 0;
  let unmatchedAll = [];
  const agentSel = document.getElementById('wa-unm-agent');
  if (agentSel) agentSel.addEventListener('change', () => { waUnmatchedAgent = agentSel.value; drawUnmatched(); });
  const searchInp = document.getElementById('wa-unm-search');
  if (searchInp) searchInp.addEventListener('input', () => { waUnmatchedSearch = searchInp.value; drawUnmatched(); });

  async function loadStatus() {
    let data;
    try { data = await api('GET', '/api/whatsapp/status'); } catch (e) { return; }
    if (state.view !== 'whatsapp') return stopWaPolling();
    const note = document.getElementById('wa-lib-note');
    if (note) note.innerHTML = data.lib.ok ? '' : `<p class="error">${escapeHtml(data.lib.error || 'Модуль WhatsApp не установлен на сервере.')}</p>`;
    const tbody = document.getElementById('wa-agents');
    if (!tbody) return;
    // 05.10.2026: перерисовываем таблицу, только если что-то изменилось — раньше
    // она пересобиралась каждые 3 с, и кнопки/строки «дёргались».
    const agentsKey = JSON.stringify(data.agents.map((a) => [a.id, a.status, a.phone, a.msgCount, a.lastAt, a.note, a.linked, a.qr ? a.qr.length : 0]));
    const agentsChanged = agentsKey !== lastAgentsKey;
    lastAgentsKey = agentsKey;
    if (agentsChanged) tbody.innerHTML = data.agents.map((a) => `
      <tr>
        <td>${escapeHtml(a.name)}</td>
        <td>${WA_STATUS_TEXT[a.status] || a.status}${a.note ? `<div class="muted" style="font-size:12px">${escapeHtml(a.note)}</div>` : ''}</td>
        <td>${a.phone ? '+' + escapeHtml(a.phone) : '—'}</td>
        <td>${a.msgCount || 0}</td>
        <td>${waTime(a.lastAt)}</td>
        <td style="white-space:nowrap">
          ${a.status === 'off' || a.status === 'error' ? `<button type="button" class="btn-primary wa-connect" data-id="${a.id}">${a.linked ? 'Переподключить' : 'Подключить'}</button>` : ''}
          ${a.status === 'qr' ? `<button type="button" class="btn-secondary wa-showqr" data-id="${a.id}">Показать QR</button>` : ''}
          ${a.status === 'connected' || a.status === 'qr' || a.status === 'connecting' || a.linked ? `<button type="button" class="link-btn wa-disconnect" data-id="${a.id}">Отключить</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">Агентов нет</td></tr>';

    // QR выбранного агента
    const box = document.getElementById('wa-qr-box');
    const qa = data.agents.find((a) => a.id === qrAgentId);
    if (box) {
      if (qa && qa.status === 'qr' && qa.qr) {
        setBoxHtml(box, `<div class="wa-qr"><img src="${qa.qr}" alt="QR"><div><b>${escapeHtml(qa.name)}</b>: на телефоне откройте WhatsApp → ⋮ / Настройки → <b>Связанные устройства</b> → <b>Привязать устройство</b> и наведите камеру на этот код.<br><span class="muted">Код обновляется каждые ~20 секунд — страница подхватит новый сама.</span></div></div>`);
      } else if (qa && qa.status === 'connected') {
        setBoxHtml(box, `<p class="wa-ok">✅ ${escapeHtml(qa.name)}: WhatsApp подключён. Переписка начнёт появляться в карточках клиентов.</p>`);
        qrAgentId = null;
      } else if (qa && (qa.status === 'connecting')) {
        setBoxHtml(box, '<p class="muted">Подключаюсь… QR появится через несколько секунд.</p>');
      } else if (!qa) {
        setBoxHtml(box, '');
      }
    }

    if (agentsChanged) wireAgentButtons();
    if (Date.now() - unmatchedLoadedAt > 30000) loadUnmatched();
  }

  function setBoxHtml(box, html) { if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; } }

  function wireAgentButtons() {
    const tbody = document.getElementById('wa-agents');
    if (!tbody) return;
    tbody.querySelectorAll('.wa-connect').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      qrAgentId = Number(b.dataset.id);
      try { await api('POST', `/api/whatsapp/${b.dataset.id}/connect`); } catch (e) { alert(e.message); }
      lastAgentsKey = '';
      loadStatus();
    }));
    tbody.querySelectorAll('.wa-showqr').forEach((b) => b.addEventListener('click', () => { qrAgentId = Number(b.dataset.id); loadStatus(); }));
    tbody.querySelectorAll('.wa-disconnect').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Отключить WhatsApp этого агента от CRM?\n\nCRM отвяжется от номера (на телефоне устройство пропадёт из «Связанных устройств»). Уже сохранённая переписка останется в карточках. Подключить заново можно в любой момент через QR.')) return;
      try { await api('POST', `/api/whatsapp/${b.dataset.id}/disconnect`, { logout: true }); } catch (e) { alert(e.message); }
      if (qrAgentId === Number(b.dataset.id)) qrAgentId = null;
      lastAgentsKey = '';
      loadStatus();
    }));
  }

  async function loadUnmatched() {
    unmatchedLoadedAt = Date.now();
    let res;
    try { res = await api('GET', '/api/whatsapp/unmatched'); } catch (e) { return; }
    unmatchedAll = res.chats || [];
    const key = JSON.stringify(unmatchedAll.map((c) => [c.key, c.agentId, c.count, c.lastAt]));
    if (key === lastUnmatchedKey) return; // ничего нового — таблицу не трогаем
    lastUnmatchedKey = key;
    drawUnmatched();
  }

  // Фильтр по агенту (02.10.2026) и поиск по номеру (08.10.2026) — на стороне браузера, выбор помнится до перезагрузки страницы.
  function drawUnmatched() {
    const tbody = document.getElementById('wa-unmatched');
    if (!tbody) return;
    const searchDigits = phoneQueryDigits(waUnmatchedSearch);
    let chats = waUnmatchedAgent ? unmatchedAll.filter((c) => String(c.agentId) === String(waUnmatchedAgent)) : unmatchedAll;
    if (searchDigits) chats = chats.filter((c) => waOnlyDigits(c.display).includes(searchDigits) || waOnlyDigits(c.key).includes(searchDigits));
    // 09.10.2026: номер уже привязан к клиенту — показать карточку(и), из которых открывается переписка.
    const hitsBox = document.getElementById('wa-unm-clients');
    if (hitsBox) {
      const hits = searchDigits ? state.clients.filter((c) => clientPhoneDigits(c).includes(searchDigits)).slice(0, 20) : [];
      hitsBox.innerHTML = hits.length ? `<div class="muted" style="margin:4px 0">Номер есть в карточках клиентов:</div>` + hits.map((c) => `<button type="button" class="btn-secondary wa-hit" data-id="${c.id}" style="margin:2px 6px 2px 0">${escapeHtml(c.name)} · ${escapeHtml(userName(c.ownerId))}</button>`).join('') : '';
      hitsBox.querySelectorAll('.wa-hit').forEach((b) => b.addEventListener('click', () => { const c = clientById(Number(b.dataset.id)); if (c) openClientModal(c); }));
    }
    const data = { chats };
    const cnt = document.getElementById('wa-unm-count');
    const filtered = Boolean(waUnmatchedAgent) || Boolean(searchDigits);
    if (cnt) cnt.textContent = filtered ? `(${data.chats.length} из ${unmatchedAll.length})` : (unmatchedAll.length ? `(${unmatchedAll.length})` : '');
    tbody.innerHTML = data.chats.map((c, i) => `
      <tr>
        <td class="sticky-col wa-num-col">${escapeHtml(c.display)}</td>
        <td>${escapeHtml(c.name || '—')}</td>
        <td>${escapeHtml(userName(c.agentId))}</td>
        <td>${c.count}</td>
        <td><span class="muted" style="font-size:12px">${waTime(c.lastAt)}</span><br>${escapeHtml(c.lastText)}</td>
        <td style="white-space:nowrap"><button type="button" class="btn-secondary wa-open" data-i="${i}">Открыть</button> <button type="button" class="btn-primary wa-link" data-i="${i}">Привязать</button></td>
      </tr>`).join('') || `<tr><td colspan="6" class="muted">${searchDigits ? 'По этому номеру ничего не найдено.' : (waUnmatchedAgent ? 'У этого агента нет не сопоставленных чатов.' : 'Все чаты сопоставлены с клиентами (или переписки ещё нет).')}</td></tr>`;
    tbody.querySelectorAll('.wa-open').forEach((b) => b.addEventListener('click', () => openWaChat(data.chats[Number(b.dataset.i)], data.chats, searchDigits ? data.chats : unmatchedAll)));
    tbody.querySelectorAll('.wa-link').forEach((b) => b.addEventListener('click', () => openWaLink(data.chats[Number(b.dataset.i)], () => { unmatchedLoadedAt = 0; loadUnmatched(); })));
  }

  // 22.10.2026: переписка с клиентами, чьи точки ушли в «Закрытые», — отдельным списком
  // (в «Клиентах» закрытые скрыты, а чат с ними продолжает сопоставляться).
  async function drawClosed() {
    try { state.waSummary = (await api('GET', '/api/whatsapp/summary')).clients || {}; } catch (e) { /* остаётся старая сводка */ }
    const box = document.getElementById('wa-closed');
    if (!box || state.view !== 'whatsapp') return;
    const sum = state.waSummary || {};
    const rows = state.clients.filter((c) => c.closed && sum[c.id]).map((c) => ({ c, w: sum[c.id] })).sort((a, b) => (b.w.lastAt || 0) - (a.w.lastAt || 0));
    box.innerHTML = `<details class="wa-closed-list" style="margin-top:18px" open>
      <summary><h3 style="display:inline;margin:0">Чаты закрытых клиентов <span class="muted">(${rows.length})</span></h3></summary>
      <p class="muted" style="margin:4px 0">Точки, переведённые в «Закрытые», с которыми есть переписка в WhatsApp. Свежее сообщение — повод проверить, не вернулся ли клиент.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Клиент</th><th>Ответственный</th><th>Чей WhatsApp</th><th>Сообщ.</th><th>Последнее сообщение</th><th></th></tr></thead>
        <tbody>${rows.map(({ c, w }) => `<tr>
          <td>${escapeHtml(c.name)} <span class="badge badge-offroute">закрыта</span></td>
          <td>${escapeHtml(userName(c.ownerId))}</td>
          <td>${escapeHtml((w.agents || []).map(userName).join(', ') || '—')}</td>
          <td>${w.count}${w.chats > 1 ? ` <span class="muted">(${w.chats} чата)</span>` : ''}</td>
          <td>${w.lastAt ? escapeHtml(waTime(w.lastAt)) : '—'}${w.lastAt && Date.now() / 1000 - w.lastAt < 14 * 86400 ? ' <span class="badge badge-pay">недавно</span>' : ''}</td>
          <td><button type="button" class="btn-secondary wa-closed-open" data-id="${c.id}">Открыть карточку</button></td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">Переписки с закрытыми клиентами нет.</td></tr>'}</tbody>
      </table></div></details>`;
    box.querySelectorAll('.wa-closed-open').forEach((b) => b.addEventListener('click', () => { const c = clientById(Number(b.dataset.id)); if (c) openClientModal(c); }));
  }

  stopWaPolling();
  loadStatus();
  drawClosed();
  waPollTimer = setInterval(() => {
    if (state.view !== 'whatsapp') return stopWaPolling();
    loadStatus();
  }, 3000);
}

// Прокрутка ленты к последнему сообщению (фото имеют фиксированный размер,
// поэтому лента после догрузки картинок больше не «прыгает»).
function scrollFeedBottom(feed) {
  if (!feed) return;
  feed.scrollTop = feed.scrollHeight;
  requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
}

// 09.10.2026 (восстановлено): переход между чатами без закрытия окна — ◀ ▶ по
// текущему списку «Не сопоставленных» и вкладки агентов (у админа/супервайзера).
var waClientOpen = { id: null, open: false };
async function openWaChat(chat, list, allList) {
  allList = allList || list || [chat];
  list = list || [chat];
  const idx = list.findIndex((c) => c.key === chat.key && String(c.agentId) === String(chat.agentId));
  const data = await api('GET', `/api/whatsapp/chat?agentId=${chat.agentId}&key=${encodeURIComponent(chat.key)}`);
  const agentIds = [...new Set(allList.map((c) => String(c.agentId)))];
  const agentTabs = isStaff() && agentIds.length > 1 ? `<div class="wa-tabs">${agentIds.map((id) => {
    const n = allList.filter((c) => String(c.agentId) === id).length;
    return `<button type="button" class="wa-tab ${id === String(chat.agentId) ? 'active' : ''}" data-agent="${id}">${escapeHtml(userName(Number(id)))} (${n})</button>`;
  }).join('')}</div>` : '';
  const nav = list.length > 1 ? `<div class="wa-nav"><button type="button" class="btn-secondary" id="wa-prev" ${idx <= 0 ? 'disabled' : ''}>◀</button><span class="muted">${idx + 1} из ${list.length}</span><button type="button" class="btn-secondary" id="wa-next" ${idx >= list.length - 1 ? 'disabled' : ''}>▶</button></div>` : '';
  openModal(`
    ${agentTabs}
    ${nav}
    <h2>${escapeHtml(chat.name || chat.display)}</h2>
    <p class="muted" style="margin-top:0">${escapeHtml(chat.display)} · номер агента: ${escapeHtml(userName(chat.agentId))}</p>
    ${data.messages.length > 80 ? `<p class="muted" style="font-size:12px;margin:0 0 4px">Показаны последние 80 из ${data.messages.length}. <button type="button" class="link-btn" id="wa-chat-all">Показать все</button></p>` : ''}
    <div class="wa-feed" id="wa-chat-feed">${waBubblesHtml(data.messages.slice(-80))}</div>
    <div class="modal-actions"><button type="button" class="btn-primary" id="wa-chat-link">Привязать к клиенту</button><button type="button" class="btn-secondary" id="cancel-modal">Закрыть</button></div>`);
  const feed = document.getElementById('wa-chat-feed');
  scrollFeedBottom(feed);
  const allBtn = document.getElementById('wa-chat-all');
  if (allBtn) allBtn.addEventListener('click', () => { feed.innerHTML = waBubblesHtml(data.messages); allBtn.parentElement.remove(); scrollFeedBottom(feed); });
  const prev = document.getElementById('wa-prev');
  const next = document.getElementById('wa-next');
  if (prev) prev.addEventListener('click', () => { if (idx > 0) openWaChat(list[idx - 1], list, allList); });
  if (next) next.addEventListener('click', () => { if (idx < list.length - 1) openWaChat(list[idx + 1], list, allList); });
  document.querySelectorAll('.wa-tab[data-agent]').forEach((b) => b.addEventListener('click', () => {
    const sub = allList.filter((c) => String(c.agentId) === b.dataset.agent);
    if (sub.length) openWaChat(sub[0], sub, allList);
  }));
  document.getElementById('wa-chat-link').addEventListener('click', () => openWaLink(chat, () => { if (state.view === 'whatsapp') render(); }));
}

function openWaLink(chat, onDone) {
  // Агент видит только своих клиентов (state.clients уже отфильтрован сервером);
  // админу сначала предлагаем клиентов агента, с чьего номера идёт переписка.
  const own = state.clients.filter((c) => c.ownerId === chat.agentId);
  const others = state.clients.filter((c) => c.ownerId !== chat.agentId);
  const opt = (c) => `<option value="${escapeAttr(c.name)} — ${escapeAttr(userName(c.ownerId))} #${c.id}"></option>`;
  openModal(`
    <h2>Привязать чат к клиенту</h2>
    <p class="muted" style="margin-top:0">${escapeHtml(chat.display)}${chat.name ? ' · ' + escapeHtml(chat.name) : ''}</p>
    <form id="wa-link-form">
      <label>Клиент (начните вводить название)</label>
      <input id="wa-link-input" list="wa-link-list" required autocomplete="off" placeholder="Название точки">
      <datalist id="wa-link-list">${own.map(opt).join('')}${others.map(opt).join('')}</datalist>
      <p class="muted" style="font-size:12px">${chat.key.startsWith('lid:') ? 'WhatsApp скрыл номер этого собеседника — привязка запомнится по его внутреннему идентификатору.' : 'Номер добавится к клиенту как дополнительный номер WhatsApp (поле «Телефон» не меняется).'}</p>
      <div class="modal-actions"><button type="submit" class="btn-primary">Привязать</button><button type="button" class="btn-secondary" id="cancel-modal">Отмена</button></div>
    </form>`, async () => {
    const v = document.getElementById('wa-link-input').value;
    const m = v.match(/#(\d+)\s*$/);
    if (!m) throw new Error('Выберите клиента из списка подсказок');
    await api('POST', '/api/whatsapp/link', { clientId: Number(m[1]), key: chat.key });
    closeModal();
    showToast('Чат привязан к клиенту', 'ok');
    await loadAll();
    if (onDone) onDone();
  });
}

// Отметка «WhatsApp синхронизирован» (таблица клиентов, шапка карточки).
function waBadgeHtml(c) {
  const w = (state.waSummary || {})[c.id];
  if (!w) return '';
  // 09.10.2026: один чат — «💬 WA», несколько (разные агенты/номера) — «💬 WA 3».
  const chats = w.chats || 1;
  return `<span class="badge badge-wa" title="WhatsApp синхронизирован с карточкой: ${chats > 1 ? chats + ' чатов, ' : ''}${w.count} сообщ., последнее ${escapeAttr(waTime(w.lastAt))}">💬 WA${chats > 1 ? ' ' + chats : ''}</span>`;
}

// Чаты клиента: группировка сообщений по (номер агента, номер клиента).
function waGroupChats(messages, keys) {
  const byKey = {};
  (keys || []).forEach((k) => { byKey[k.key] = k; });
  const map = new Map();
  messages.forEach((m) => {
    const id = `${m.a}|${m.k || ''}`;
    if (!map.has(id)) {
      const k = byKey[m.k] || {};
      map.set(id, { agentId: m.a, key: m.k, label: k.asContact || k.display || m.k || 'чат', messages: [] });
    }
    map.get(id).messages.push(m);
  });
  return [...map.values()].sort((a, b) => b.messages[b.messages.length - 1].t - a.messages[a.messages.length - 1].t);
}

// Блок «WhatsApp» в карточке клиента: подгружается после открытия карточки.
async function loadClientWhatsapp(client) {
  const box = document.getElementById('wa-client-box');
  if (!box) return;
  let data;
  try { data = await api('GET', `/api/clients/${client.id}/whatsapp`); } catch (e) { box.innerHTML = ''; return; }
  if (!document.getElementById('wa-client-box')) return;
  const manual = data.keys.filter((k) => k.manual);
  // 15.10.2026: админ/супервайзер видит все номера, по которым к карточке привязан
  // WhatsApp (из телефона, доп. контактов, вручную), и может отвязать любой —
  // переписка с номера уходит в «Не сопоставленные». Отвязанные — с кнопкой «вернуть».
  const SRC = { phone: 'телефон карточки', contact: 'доп. контакт', manual: 'привязан вручную', other: '' };
  const manualHtml = isStaff()
    ? `<div class="wa-numbers" style="font-size:12px;margin:4px 0">${data.keys.length ? `<span class="muted">Номера WhatsApp:</span> ${data.keys.map((k) => `<span class="wa-num-chip">${escapeHtml(k.asContact ? k.asContact + ' · ' : '')}${escapeHtml(k.display)}${SRC[k.source] ? ` <span class="muted">(${SRC[k.source]})</span>` : ''} <button type="button" class="link-btn wa-unlink" data-key="${escapeAttr(k.key)}" title="Отвязать WhatsApp этого номера от клиента">отвязать</button></span>`).join(' ')}` : ''}
        ${(data.excluded || []).length ? `<div class="muted" style="margin-top:3px">Отвязаны: ${data.excluded.map((k) => `${escapeHtml(k.display)} <button type="button" class="link-btn wa-relink" data-key="${escapeAttr(k.key)}">вернуть</button>`).join(', ')}</div>` : ''}</div>`
    : (manual.length ? `<div class="muted" style="font-size:12px;margin:4px 0">Привязанные номера WhatsApp: ${manual.map((k) => `${escapeHtml(k.display)} <button type="button" class="link-btn wa-unlink" data-key="${escapeAttr(k.key)}" title="Отвязать">✕</button>`).join(', ')}</div>` : '');
  // 08.10.2026: добавить номер заранее, не дожидаясь первого сообщения от него (раньше это
  // было можно только из «Не сопоставленных чатов» — т.е. после того, как сообщение уже пришло).
  const addNumHtml = `<div class="wa-add-num" style="font-size:12px;margin:4px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    <input type="text" id="wa-add-num-input" placeholder="Номер телефона для WhatsApp…" style="max-width:190px">
    <button type="button" class="link-btn" id="wa-add-num-btn">+ Добавить номер</button>
  </div>`;
  if (!data.messages.length) {
    const hasExcluded = (data.excluded || []).length > 0;
    box.innerHTML = `<details class="wa-details" ${hasExcluded && isStaff() ? 'open' : ''}><summary>💬 WhatsApp — <span class="muted">${hasExcluded && !data.keys.length ? 'отвязан' : 'не синхронизирован (переписки нет)'}</span></summary><p class="muted" style="font-size:12px">${data.keys.length ? 'С номерами этого клиента переписки в подключённых WhatsApp пока нет.' : hasExcluded ? 'WhatsApp отвязан от клиента — переписка с этим номером в «Не сопоставленных чатах».' : 'В карточке нет номера телефона — переписку не к чему привязать. Добавьте телефон или привяжите чат во вкладке WhatsApp.'}</p>${manualHtml}${addNumHtml}</details>`;
  } else {
    const last = data.messages[data.messages.length - 1];
    // 09.10.2026 (восстановлено): вкладки чатов — «Все» + каждый номер/агент отдельно,
    // номер доп. контакта подписан «Имя (роль)».
    const labels = {};
    data.keys.forEach((k) => { if (k.asContact) labels[k.key] = k.asContact; });
    const chats = waGroupChats(data.messages, data.keys);
    // 09.10.2026: с клиентом переписываются несколько агентов — по умолчанию открывается
    // чат агента, который «ведёт» клиента (выбор админа/супервайзера, иначе ответственный).
    // Агент получает с сервера только свои чаты; «Все» — только админу/супервайзеру.
    const leadAgentId = client.waChatAgentId || client.ownerId;
    let defaultIdx = chats.findIndex((c) => c.agentId === leadAgentId);
    if (defaultIdx < 0) defaultIdx = chats.length > 1 ? -1 : 0;
    const chatAgents = [...new Set(chats.map((c) => c.agentId))];
    const leadSelect = isStaff() && chatAgents.length > 1 ? `<div style="font-size:12px;margin:4px 0">Чат клиента ведёт:
      <select id="wa-lead-agent"><option value="">ответственный (${escapeHtml(userName(client.ownerId))})</option>${chatAgents.map((id) => `<option value="${id}" ${client.waChatAgentId === id ? 'selected' : ''}>${escapeHtml(userName(id))}</option>`).join('')}</select></div>` : '';
    const showAll = isStaff() && chats.length > 1;
    const tabsHtml = chats.length > 1 ? `<div class="wa-tabs" id="wa-client-tabs">${chats.map((c, i) => `<button type="button" class="wa-tab ${i === defaultIdx ? 'active' : ''}" data-chat="${i}">${escapeHtml(userName(c.agentId))} · ${escapeHtml(c.label)} (${c.messages.length})</button>`).join('')}${showAll ? `<button type="button" class="wa-tab ${defaultIdx < 0 ? 'active' : ''}" data-chat="">Все (${data.messages.length})</button>` : ''}</div>` : '';
    // 22.10.2026: при открытии карточки WhatsApp свёрнут — разворачивается по клику на ▸.
    // После действий внутри (отвязать, сменить агента) остаётся развёрнутым.
    const keepOpen = waClientOpen.id === client.id && waClientOpen.open;
    box.innerHTML = `<details class="wa-details" id="wa-client-details" ${keepOpen ? 'open' : ''}><summary>💬 WhatsApp — <span class="wa-sync">✓ синхронизирован</span> · ${data.messages.length} сообщ., последнее ${waTime(last.t)}</summary>
      ${manualHtml}
      ${addNumHtml}
      ${leadSelect}
      ${tabsHtml}
      <p class="muted" style="font-size:12px" id="wa-show-all-row"></p>
      <div class="wa-feed" id="wa-client-feed"></div></details>`;
    const feed = document.getElementById('wa-client-feed');
    const showRow = document.getElementById('wa-show-all-row');
    const draw = (msgs) => {
      const shown = msgs.slice(-60);
      feed.innerHTML = waBubblesHtml(shown, { showAgent: true, labels });
      showRow.innerHTML = msgs.length > shown.length ? `Показаны последние ${shown.length} из ${msgs.length}. <button type="button" class="link-btn" id="wa-show-all">Показать все</button>` : '';
      const all = document.getElementById('wa-show-all');
      if (all) all.addEventListener('click', () => { feed.innerHTML = waBubblesHtml(msgs, { showAgent: true, labels }); showRow.innerHTML = ''; scrollFeedBottom(feed); });
      scrollFeedBottom(feed);
    };
    draw(defaultIdx >= 0 && chats.length > 1 ? chats[defaultIdx].messages : data.messages);
    document.getElementById('wa-client-details').addEventListener('toggle', (e) => {
      waClientOpen = { id: client.id, open: e.target.open };
      if (e.target.open) scrollFeedBottom(feed);
    });
    const leadSel = document.getElementById('wa-lead-agent');
    if (leadSel) leadSel.addEventListener('change', async () => {
      try {
        const res = await api('PUT', `/api/clients/${client.id}/wa-agent`, { agentId: leadSel.value || null });
        client.waChatAgentId = res.client.waChatAgentId || null;
        const c = clientById(client.id);
        if (c) c.waChatAgentId = client.waChatAgentId;
        showToast('Сохранено', 'ok');
        loadClientWhatsapp(client);
      } catch (e) { alert(e.message); }
    });
    box.querySelectorAll('#wa-client-tabs .wa-tab').forEach((b) => b.addEventListener('click', () => {
      box.querySelectorAll('#wa-client-tabs .wa-tab').forEach((x) => x.classList.toggle('active', x === b));
      draw(b.dataset.chat === '' ? data.messages : chats[Number(b.dataset.chat)].messages);
    }));
  }
  box.querySelectorAll('.wa-unlink').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Отвязать WhatsApp этого номера от клиента? Переписка с ним уйдёт в «Не сопоставленные чаты». Телефон в карточке не меняется.')) return;
    try { await api('POST', '/api/whatsapp/unlink', { clientId: client.id, key: b.dataset.key }); } catch (e) { alert(e.message); return; }
    try { state.waSummary = (await api('GET', '/api/whatsapp/summary')).clients || {}; } catch (e) { /* не критично */ }
    loadClientWhatsapp(client);
  }));
  box.querySelectorAll('.wa-relink').forEach((b) => b.addEventListener('click', async () => {
    try { await api('POST', '/api/whatsapp/link', { clientId: client.id, key: b.dataset.key }); } catch (e) { alert(e.message); return; }
    try { state.waSummary = (await api('GET', '/api/whatsapp/summary')).clients || {}; } catch (e) { /* не критично */ }
    loadClientWhatsapp(client);
  }));
  const addInput = document.getElementById('wa-add-num-input');
  const addBtn = document.getElementById('wa-add-num-btn');
  if (addBtn && addInput) {
    const submitNum = async () => {
      const v = addInput.value.trim();
      if (!v) return;
      addBtn.disabled = true;
      try {
        await api('POST', '/api/whatsapp/link', { clientId: client.id, key: v });
        showToast('Номер добавлен', 'ok');
        loadClientWhatsapp(client);
      } catch (e) {
        alert(e.message);
        addBtn.disabled = false;
      }
    };
    addBtn.addEventListener('click', submitNum);
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitNum(); } });
  }
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ---------- Старт ----------

boot();
