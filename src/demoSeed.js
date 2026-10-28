// Kav&Kev (демо): наполнение рабочей базы при старте — координаты точек,
// отметки посещений и GPS-треки (по накладным из data/import/van_invoices.json),
// активность, задачи, заметки, переписка WhatsApp. Детерминированно.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const api = require('./api');
const van = require('./van');
const { PERSIST_DIR } = require('./paths');

const TZ = 6 * 3600 * 1000;
const DAY = 86400000;
const WAREHOUSE = [42.8655, 74.5560]; // условная точка производства/склада

let seed = 20261027;
function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function chance(p) { return rnd() < p; }
function r6(x) { return Math.round(x * 1e6) / 1e6; }
function haversine(a, b) {
  const R = 6371000, toR = (x) => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function offsetPoint(p, m) {
  const ang = rnd() * 2 * Math.PI;
  return [p[0] + (m * Math.cos(ang)) / 111320, p[1] + (m * Math.sin(ang)) / (111320 * Math.cos(p[0] * Math.PI / 180))];
}
function bkDateStr(ms) { return new Date(ms + TZ).toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
function weekdayOf(d) { return ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][new Date(d + 'T00:00:00Z').getUTCDay()]; }
function writeJsonl(dir, id, rows) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id + '.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

function run() {
  if (db.all('tasks').length > 0) return;
  const nowMs = Date.now();
  const today = bkDateStr(nowMs);
  const users = db.all('users');
  const sup = users.find((u) => u.role === 'supervisor') || users.find((u) => u.role === 'admin');
  const agents = users.filter((u) => u.role === 'agent');
  const V = van.data();

  db.beginBatch();
  try {
    // ---- 1. Координаты точек ----
    db.all('clients').forEach((c) => {
      const p = V.points[c.id];
      if (!p) return;
      db.update('clients', c.id, { geo: { lat: p.lat, lng: p.lng, accuracy: ri(5, 15), setAt: '2026-09-01T05:00:00.000Z', setBy: 'импорт' }, visits: [], paymentMethod: p.pay, bestCallTime: p.acceptTime });
    });

    // ---- 2. Посещения и GPS-трек по накладным ----
    agents.forEach((ag) => {
      const inv = V.invoices.filter((i) => i.agentId === ag.id).sort((a, b) => (a.at < b.at ? -1 : 1));
      const track = [], activity = [];
      const byDate = {};
      inv.forEach((i) => { (byDate[i.date] = byDate[i.date] || []).push(i); });
      const dates = Object.keys(byDate).sort();
      const gapDay = dates[dates.length - 1 - ri(1, 5)];
      const spikeDay = dates[dates.length - 1 - ri(1, 5)];
      dates.forEach((date) => {
        const list = byDate[date];
        let pos = WAREHOUSE;
        const loadRec = V.loads.find((l) => l.agentId === ag.id && l.date === date);
        let tSec = Math.floor(Date.parse(loadRec ? loadRec.loadedAt : list[0].at) / 1000) + 600;
        const ping = (t, p, acc) => track.push({ t, lat: r6(p[0]), lng: r6(p[1]), acc: acc || ri(4, 20), src: 'app' });
        // утреннее открытие CRM на складе
        activity.push({ t: tSec - 900, lat: r6(WAREHOUSE[0]), lng: r6(WAREHOUSE[1]), acc: ri(8, 30) });
        list.forEach((i, idx) => {
          const c = db.find('clients', i.clientId);
          if (!c || !c.geo) return;
          const dest = [c.geo.lat, c.geo.lng];
          const arrive = Math.floor(Date.parse(i.at) / 1000) - ri(2, 4) * 60;
          for (let t = tSec + 60; t < arrive; t += 60) {
            const k = (t - tSec) / Math.max(60, arrive - tSec);
            ping(t, offsetPoint([pos[0] + (dest[0] - pos[0]) * k, pos[1] + (dest[1] - pos[1]) * k], ri(0, 20)));
          }
          const roll = rnd();
          const status = roll < 0.9 ? 'near' : roll < 0.97 ? 'far' : 'nogps';
          const vPos = status === 'far' ? offsetPoint(dest, ri(60, 350)) : offsetPoint(dest, ri(2, 20));
          const visit = {
            id: `${Date.parse(i.at)}_${ag.id}`, at: i.at, agentId: ag.id, agentName: ag.name,
            lat: status === 'nogps' ? null : r6(vPos[0]), lng: status === 'nogps' ? null : r6(vPos[1]), accuracy: status === 'nogps' ? null : ri(4, 22),
            distance: status === 'nogps' ? null : Math.round(haversine(vPos, dest)), status,
            comment: i.returns.length ? `Накладная ${i.no}, возврат ${i.returns.reduce((s, r) => s + r.qty, 0)} шт.` : `Накладная ${i.no}`
          };
          db.update('clients', c.id, { visits: [...(c.visits || []), visit] });
          const stay = ri(6, 14);
          for (let m = 0; m < stay; m += ri(1, 2)) ping(arrive + m * 60, offsetPoint(dest, ri(0, 12)));
          if (idx % 4 === 1) activity.push({ t: arrive + 120, lat: r6(dest[0]), lng: r6(dest[1]), acc: ri(5, 25) });
          tSec = arrive + stay * 60;
          pos = dest;
        });
        // возврат на склад (кроме сегодня — маршрут ещё идёт)
        if (date !== today) {
          for (let m = 1; m <= 20; m++) ping(tSec + m * 60, [pos[0] + (WAREHOUSE[0] - pos[0]) * m / 20, pos[1] + (WAREHOUSE[1] - pos[1]) * m / 20]);
          activity.push({ t: tSec + 25 * 60, lat: r6(WAREHOUSE[0]), lng: r6(WAREHOUSE[1]), acc: ri(8, 30) });
        }
      });
      let tr = track.sort((a, b) => a.t - b.t);
      if (gapDay) { const g = tr.find((p) => new Date(p.t * 1000 + TZ).toISOString().slice(0, 10) === gapDay && new Date(p.t * 1000 + TZ).getUTCHours() >= 12); if (g) tr = tr.filter((p) => !(p.t >= g.t && p.t < g.t + ri(25, 45) * 60)); }
      if (spikeDay) { const s = tr.find((p) => new Date(p.t * 1000 + TZ).toISOString().slice(0, 10) === spikeDay && new Date(p.t * 1000 + TZ).getUTCHours() >= 11); if (s) { const o = offsetPoint([s.lat, s.lng], 2200); s.lat = r6(o[0]); s.lng = r6(o[1]); s.acc = 60; } }
      writeJsonl(path.join(PERSIST_DIR, 'geo'), ag.id, tr);
      writeJsonl(path.join(PERSIST_DIR, 'activity'), ag.id, activity.sort((a, b) => a.t - b.t));
    });

    // ---- 3. Задачи «Посещение» по маршруту ----
    for (let back = 5; back >= -1; back--) {
      const d = addDays(today, -back);
      if (weekdayOf(d) === 'Воскресенье') continue;
      api.createCheckinTasks(d, null, sup.id);
    }
    db.all('tasks').filter((t) => t.taskType === 'checkin' && t.stage === 'in_progress' && t.dueDate < today)
      .forEach((t) => { if (chance(0.9)) db.update('tasks', t.id, { stage: 'not_done', report: pick(['Точка закрыта', 'Не успел — перенос на завтра', 'Приёмка товара закончилась']) }); });
  } finally {
    db.endBatch();
  }

  // ---- 4. Ручные задачи ----
  db.beginBatch();
  try {
    const mk = (o) => db.insert('tasks', Object.assign({ description: '', visitTime: '', visitTimeTo: '', tags: [], comment: '', report: '', dateChangeRequest: null, attachments: [],
      createdAt: new Date(nowMs - ri(1, 9) * DAY).toISOString(), updatedAt: new Date(nowMs - ri(0, 2) * DAY).toISOString() }, o));
    const lines = ['Классика', 'Мясные', 'Премиум'];
    agents.forEach((ag) => {
      const own = db.all('clients').filter((c) => c.ownerId === ag.id && !c.closed);
      if (!own.length) return;
      for (let i = 0; i < 4; i++) {
        const c = pick(own);
        const due = addDays(today, ri(-4, 5));
        const done = due < today && chance(0.6);
        const tk = mk({ clientId: c.id, taskType: 'visit', title: pick([`Выкладка на полке: ${c.name}`, `Дегустация новинок: ${c.name}`, `Переговоры о расширении матрицы: ${c.name}`, `Сверка возвратов: ${c.name}`]),
          description: pick(['Поставить ценники и шелфтокер', 'Предложить «Кебаб» и «Чеддер»', 'Обсудить холодильник под продукцию', '']), dueDate: due,
          visitTime: pick(['09:00', '10:30', '12:00']), visitTimeTo: pick(['10:00', '11:30', '13:00']), stage: done ? 'done' : 'in_progress',
          tags: [pick(lines)].concat(chance(0.25) ? ['Возврат'] : []), report: done ? pick(['Матрица расширена на 2 позиции', 'Выкладка исправлена', 'Решение через неделю']) : '',
          assigneeId: ag.id, createdBy: chance(0.5) ? sup.id : ag.id });
        if (!done && i === 0 && due >= today) db.update('tasks', tk.id, { dateChangeRequest: { requestedDate: addDays(due, 2), reason: 'Точка просит перенести визит', requestedBy: ag.id, createdAt: new Date(nowMs - 3 * 3600000).toISOString() } });
      }
      for (let i = 0; i < 2; i++) {
        const c = pick(own);
        const due = addDays(today, ri(-3, 5));
        mk({ clientId: c.id, taskType: 'sale', title: `Подключить линейку: ${c.name}`, dueDate: due, stage: due < today ? pick(['done', 'not_done']) : 'in_progress', tags: [pick(lines)].concat(chance(0.3) ? ['Договор'] : []), report: due < today ? 'Первая поставка оформлена' : '', assigneeId: ag.id, createdBy: ag.id });
      }
      mk({ clientId: null, taskType: 'agent', title: pick(['Сдать недостачу по кассе', 'Помыть и обработать холодильный отсек', 'Собрать заявки школ на понедельник', 'Проверить сроки годности в машине']),
        dueDate: addDays(today, ri(-1, 3)), stage: 'in_progress', assigneeId: ag.id, createdBy: sup.id });
    });

    // ---- 5. Заметки, совместные визиты, новые точки ----
    const all = db.all('clients').filter((c) => !c.closed);
    for (let i = 0; i < 60; i++) {
      const c = pick(all);
      db.update('clients', c.id, { contactNotes: [{ id: `demo_${i}`, text: pick(['Приёмка только до 10 утра', 'Просят больше «Кебаба», уходит к обеду', 'Холодильник тёплый — риск возвратов', 'Директор хочет скидку за объём', 'Новый продавец, показать выкладку']), authorId: c.ownerId, createdAt: new Date(nowMs - ri(1, 20) * DAY).toISOString() }].concat(c.contactNotes || []) });
    }
    for (let i = 0; i < 6; i++) db.insert('supervisorMeetings', { clientId: pick(all).id, date: addDays(today, ri(0, 7)), time: pick(['09:00', '11:00', '14:00']), note: 'Совместный визит: аудит выкладки', createdBy: sup.id, createdAt: new Date(nowMs - DAY).toISOString() });
    agents.slice(0, 3).forEach((ag, i) => {
      const base = all.find((c) => c.ownerId === ag.id && c.geo);
      const p = base ? offsetPoint([base.geo.lat, base.geo.lng], 700) : [42.87, 74.6];
      db.insert('clients', {
        name: ['Минимаркет «Новый»', 'Кофейня «Демо»', 'АЗС «Пример» №7'][i], pointType: ['Магазин у дома', 'Кафе / столовая', 'АЗС'][i],
        address: `ул. Демо, ${10 + i}`, phone: `09990000${i}0`, contactName: pick(['Айпери', 'Ольга', 'Тимур']), visitDay: pick(['Понедельник', 'Среда', 'Пятница']),
        contractStatus: 'неизвестно', paymentMethod: 'Наличные', discountTerms: '', salesPlan: 0, notes: 'Новая точка от вэн-агента (демо)',
        ownerId: ag.id, isOffRoute: true, pendingApproval: true, regularAssortment: [], testAssortment: [], debtAmount: 0, debtOverdue: false, debtAsOf: null,
        closed: false, closureRequested: false, closureRequestedBy: null, contactNotes: [], masters: [], extraContacts: [], socialContact: '', bestCallTime: '08:00–11:00',
        decisionMakerName: '', specialRequests: '', orderWindow: '', routeNumber: null, meetingRecords: [], visits: [],
        geo: { lat: r6(p[0]), lng: r6(p[1]), accuracy: 9, setAt: new Date(nowMs - DAY).toISOString(), setBy: ag.name }, createdBy: ag.id, createdAt: new Date(nowMs - DAY).toISOString()
      });
    });
  } finally {
    db.endBatch();
  }

  seedWhatsApp(agents, nowMs);
  console.log('Демо-наполнение Kav&Kev выполнено.');
}

const DIALOGS = [
  [[0, 'Здравствуйте! Завтра привезите 20 «Нежных» и 10 с курицей'], [1, 'Добрый день! Принял, буду с 9 до 10'], [0, 'Спасибо 🙏']],
  [[0, 'Кебаб весь разобрали к обеду, можно больше?'], [1, 'Да, в следующий раз добавлю +6 шт'], [0, 'Отлично']],
  [[1, 'Добрый день, у вас 4 сэндвича с истекающим сроком, заберу на обмен'], [0, 'Хорошо, лежат в холодильнике справа']],
  [[0, 'Сделайте накладную на безнал, бухгалтер ждёт'], [1, '[Документ] Накладная KK-2381.pdf'], [0, 'Получили']],
  [[1, 'Напоминаю про оплату за прошлую поставку'], [0, 'Да, сегодня отдадим наличными'], [0, '[Фото] чек']],
  [[0, '[Голосовое сообщение]'], [1, 'Понял, «Чеддер» привезу в пятницу, сейчас нет в машине'], [0, 'Ок']],
  [[0, 'Можно на мероприятие 60 сэндвичей к 12:00 в четверг?'], [1, 'Оформлю заявку, производство подтвердит до вечера'], [1, 'Подтверждено ✅']]
];

function seedWhatsApp(agents, nowMs) {
  const dir = path.join(PERSIST_DIR, 'whatsapp', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  agents.forEach((ag, ai) => {
    const own = db.all('clients').filter((c) => c.ownerId === ag.id && c.phone && !c.closed);
    const chosen = own.filter(() => chance(0.4)).slice(0, 22);
    const recs = [];
    chosen.forEach((c, ci) => {
      const key = String(c.phone).replace(/\D/g, '').slice(-9);
      const dialog = pick(DIALOGS);
      let t = Math.floor((nowMs - ri(0, 25) * DAY - ri(1, 8) * 3600000) / 1000);
      dialog.forEach(([me, text], mi) => {
        t += ri(60, 1500);
        if (t * 1000 > nowMs) t = Math.floor(nowMs / 1000) - (dialog.length - mi) * 30;
        const ty = text.startsWith('[Фото]') ? 'image' : text.startsWith('[Документ]') ? 'document' : text.startsWith('[Голосовое') ? 'audio' : 'text';
        recs.push({ id: `D${ag.id}_${ci}_${mi}`, a: ag.id, k: key, me: !!me, t, x: text, ty, n: me ? '' : (c.contactName || c.name) });
      });
    });
    for (let u = 0; u < 2; u++) {
      const key = '999' + String(800000 + ai * 10 + u);
      let t = Math.floor((nowMs - ri(1, 5) * DAY) / 1000);
      [[0, 'Здравствуйте, хотим ставить ваши сэндвичи в нашем магазине'], [1, 'Здравствуйте! Подскажите адрес, заеду с образцами'], [0, 'Скину локацию']].forEach(([me, text], mi) => {
        t += ri(60, 900);
        recs.push({ id: `U${ag.id}_${u}_${mi}`, a: ag.id, k: key, me: !!me, t, x: text, ty: 'text', n: me ? '' : pick(['Айгуль магазин', 'Камила', '']) });
      });
    }
    fs.writeFileSync(path.join(dir, ag.id + '.jsonl'), recs.sort((a, b) => a.t - b.t).map((r) => JSON.stringify(r)).join('\n') + '\n');
  });
}

module.exports = { run };
