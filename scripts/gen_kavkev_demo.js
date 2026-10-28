// Kav&Kev (демо): генератор вымышленных данных в data/import.
// Запуск: node scripts/gen_kavkev_demo.js  (детерминированно — каждый раз одно и то же)
const fs = require('fs');
const path = require('path');
const { PRODUCTS, AGENTS, RETURN_REASONS } = require('../src/vanCatalog');

const OUT = path.join(__dirname, '..', 'data', 'import');
let seed = 4242;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const save = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, name.startsWith('van_') || name === 'agent_sales.json' ? 0 : 1));

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const WD = ['Воскресенье', ...DAYS];
const MONTHS = ['март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь'];
const COST = 0.68; // себестоимость от цены — для «маржи» в отчётах

// ---------- 1. Точки ----------
const WORDS = ['Ак-Жол', 'Достук', 'Береке', 'Алтын', 'Нур', 'Ала-Тоо', 'Бакыт', 'Мээрим', 'Айдана', 'Сапат', 'Ырыс', 'Кут', 'Жибек', 'Арзан', 'Ынтымак', 'Самал', 'Тулпар', 'Шамал', 'Асман', 'Байтерек',
  'Каприз', 'Радуга', 'Удача', 'Колос', 'Семья', 'Восток', 'Звезда', 'Уют', 'Лето', 'Весна', 'Кристалл', 'Меридиан', 'Престиж', 'Олимп', 'Дружба', 'Гранат', 'Мечта', 'Ромашка', 'Изумруд', 'Сезон'];
const TYPES = [
  { t: 'Магазин у дома', w: 34, size: [6, 14], pre: ['Магазин', 'Минимаркет', 'Продукты'] },
  { t: 'Киоск / павильон', w: 12, size: [5, 10], pre: ['Киоск', 'Павильон'] },
  { t: 'Супермаркет / сеть', w: 8, size: [25, 55], pre: ['Супермаркет', 'Маркет'] },
  { t: 'АЗС', w: 10, size: [14, 28], pre: ['АЗС'] },
  { t: 'Кафе / столовая', w: 10, size: [10, 22], pre: ['Кафе', 'Столовая', 'Кофейня'] },
  { t: 'Офис / бизнес-центр', w: 9, size: [15, 35], pre: ['БЦ', 'Офис-буфет'] },
  { t: 'Школа / вуз (буфет)', w: 10, size: [20, 45], pre: ['Буфет школы №', 'Буфет колледжа', 'Буфет университета'] },
  { t: 'Больница / поликлиника', w: 5, size: [12, 26], pre: ['Буфет ЦСМ №', 'Буфет больницы №'] },
  { t: 'Другое', w: 2, size: [8, 16], pre: ['Автомойка', 'Фитнес-клуб'] }
];
const STREETS = ['ул. Демо', 'пр. Примерный', 'ул. Тестовая', 'ул. Образцовая', 'мкр. Учебный', 'ул. Пробная', 'пр. Условный', 'ул. Шаблонная', 'ул. Макетная', 'бул. Показательный'];
const FIRST = ['Айгуль', 'Айпери', 'Нурлан', 'Бермет', 'Эркин', 'Мээрим', 'Жылдыз', 'Канат', 'Асель', 'Динара', 'Ольга', 'Елена', 'Ирина', 'Марат', 'Светлана', 'Чолпон', 'Улан', 'Гульнара', 'Азамат', 'Наталья', 'Камила', 'Тимур', 'Анара', 'Самара', 'Элеонора', 'Риталия', 'Алия', 'Бактыгуль', 'Эмир', 'Жибек'];
const totalW = TYPES.reduce((s, t) => s + t.w, 0);
const pickType = () => { let x = rnd() * totalW; for (const t of TYPES) { if ((x -= t.w) < 0) return t; } return TYPES[0]; };

const used = new Set();
let phone = 300000;
const points = [];
AGENTS.forEach((ag) => {
  for (let i = 0; i < 60; i++) {
    const ty = pickType();
    let name;
    do {
      const pre = pick(ty.pre);
      name = pre.endsWith('№') ? `${pre}${ri(1, 99)}` : (ty.t === 'АЗС' ? `АЗС «${pick(WORDS)}» №${ri(1, 40)}` : `${pre} «${pick(WORDS)}»${chance(0.4) ? ' ' + pick(STREETS).replace(/^(ул|пр|мкр|бул)\. /, '') : ''}`);
    } while (used.has(norm(name)));
    used.add(norm(name));
    const size = ri(ty.size[0], ty.size[1]);
    // матрица: классика у всех, мясные почти у всех, премиум — у крупных
    const matrix = PRODUCTS.filter((p) => p.line === 'Классика' ? chance(0.85) : p.line === 'Мясные' ? chance(0.7) : chance(size > 18 ? 0.75 : 0.25)).map((p) => p.sku);
    if (matrix.length < 3) matrix.push('KK-02', 'KK-05');
    const lat = ag.center[0] + (rnd() - 0.5) * 0.045;
    const lng = ag.center[1] + (rnd() - 0.5) * 0.065;
    const pay = chance(0.18) ? 'Безналичные' : chance(0.25) ? 'QR' : 'Наличные';
    points.push({
      agent: ag.name, name, type: ty.t, size, matrix: [...new Set(matrix)].sort(), lat: r6(lat), lng: r6(lng),
      visitDay: DAYS[i % 6], pay, credit: chance(0.22), // работает с отсрочкой (оплата при следующем визите)
      startMonth: chance(0.12) ? ri(1, 6) : 0, // часть точек подключена позже
      acceptTime: pick(['07:00–10:00', '08:00–11:00', '09:00–12:00', 'до 13:00', 'в любое время']),
      phone: '0999' + (phone += ri(3, 41)), contact: pick(FIRST), address: `${pick(STREETS)}, ${ri(1, 240)}`
    });
  }
});

save('agents_clients.json', points.map((p) => ({
  agent: p.agent, name: p.name, visit_day: p.visitDay, point_type: p.type, address: p.address, phone: p.phone,
  contact_name: p.contact, contract_status: p.size > 20 ? 'да' : pick(['да', 'нет', 'неизвестно']),
  discount_terms: p.credit ? 'Отсрочка до следующего визита' : '', sales_plan: Math.round(p.size * 4.3 * 46 / 100) * 100
})));
save('van_points.json', Object.fromEntries(points.map((p) => [p.name, { lat: p.lat, lng: p.lng, matrix: p.matrix, size: p.size, pay: p.pay, credit: p.credit, acceptTime: p.acceptTime }])));

// ---------- 2. История по месяцам (март–сентябрь) ----------
const bySku = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p]));
const season = { 'март': 0.9, 'апрель': 0.95, 'май': 1.0, 'июнь': 0.85, 'июль': 0.8, 'август': 0.88, 'сентябрь': 1.08 };
const monthly = {};
const active = {};
points.forEach((p) => {
  monthly[p.name] = {};
  active[p.name] = [];
  MONTHS.forEach((m, mi) => {
    if (mi < p.startMonth) return;
    if (chance(0.05)) return; // пропуск месяца
    const visits = ri(4, 5);
    const items = p.matrix.map((sku) => {
      const pr = bySku[sku];
      const qty = Math.max(1, Math.round(p.size / p.matrix.length * visits * season[m] * (0.7 + rnd() * 0.6)));
      const revenue = qty * pr.price;
      return { product: pr.name, brand: pr.line, category: sku, qty, revenue, margin: Math.round(revenue * (1 - COST)) };
    }).filter(() => chance(0.93));
    if (items.length) { monthly[p.name][m] = items; active[p.name].push(m); }
  });
});
save('assortment_by_month.json', monthly);
save('active_months.json', active);

const regular = {}, test = {};
points.forEach((p) => {
  const last6 = MONTHS.slice(-6);
  const per = {};
  last6.forEach((m) => (monthly[p.name][m] || []).forEach((it) => {
    const x = per[it.category] || (per[it.category] = { product: it.product, brand: it.brand, category: it.category, months: [], qty: 0, revenue: 0, margin: 0 });
    x.months.push(m); x.qty += it.qty; x.revenue += it.revenue; x.margin += it.margin;
  }));
  Object.values(per).forEach((x) => {
    const row = { product: x.product, brand: x.brand, category: x.category, months_count: x.months.length, last_month: x.months[x.months.length - 1], avg_qty: Math.round(x.qty / x.months.length * 10) / 10, revenue: x.revenue, margin: x.margin };
    const isReg = x.months.length >= 4 && x.months.includes('август') && x.months.includes('сентябрь');
    ((isReg ? regular : test)[p.name] = (isReg ? regular : test)[p.name] || []).push(row);
  });
});
save('regular_assortment.json', regular);
save('test_assortment.json', test);

// ---------- 3. Октябрь: загрузки, накладные, возвраты, инкассация ----------
const pad = (n) => String(n).padStart(2, '0');
const octDays = [];
for (let d = 1; d <= 27; d++) { const ds = `2026-10-${pad(d)}`; const wd = WD[new Date(ds + 'T00:00:00Z').getUTCDay()]; if (wd !== 'Воскресенье') octDays.push({ ds, wd }); }
const TODAY = '2026-10-27';
const iso = (ds, min) => new Date(Date.parse(ds + 'T00:00:00Z') - 6 * 3600000 + min * 60000).toISOString();

const invoices = [], loads = [], cash = [], cabinetOrders = [];
const debt = {}; // имя точки → [{date, amount}]
const lastDelivered = Object.fromEntries(points.map((p) => [p.name, Object.fromEntries(p.matrix.map((sku) => [sku, Math.max(1, Math.round(p.size / p.matrix.length))]))])); // поставка конца сентября
let invNo = 1000;
octDays.forEach(({ ds, wd }) => {
  AGENTS.forEach((ag, ai) => {
    const route = points.filter((p) => p.agent === ag.name && p.visitDay === wd);
    // внеплановые заказы из кабинета клиента (доставка в этот день)
    const extra = points.filter((p) => p.agent === ag.name && p.visitDay !== wd && p.size > 16 && chance(0.03));
    const stops = route.filter(() => chance(0.94)).concat(extra);
    let t = ri(8 * 60, 8 * 60 + 40);
    const dayInv = [];
    stops.forEach((p, si) => {
      t += ri(14, 38);
      const isExtra = extra.includes(p);
      if (p.octSkip === undefined) p.octSkip = chance(0.3) ? pick(p.matrix) : null; // часть точек в октябре не берёт одну позицию → «недопродано»
      const items = p.matrix.filter((sku) => sku !== p.octSkip).map((sku) => ({ sku, qty: Math.max(0, Math.round(p.size / p.matrix.length * (0.7 + rnd() * 0.7))), price: bySku[sku].price })).filter((x) => x.qty > 0);
      const prev = lastDelivered[p.name] || {};
      const returns = [];
      Object.keys(prev).forEach((sku) => {
        if (chance(0.17)) { const q = Math.max(1, Math.round(prev[sku] * (0.05 + rnd() * 0.16))); returns.push({ sku, qty: q, price: bySku[sku].price, reason: chance(0.8) ? RETURN_REASONS[0] : pick(RETURN_REASONS.slice(1)) }); }
      });
      const total = items.reduce((s, x) => s + x.qty * x.price, 0);
      const retTotal = returns.reduce((s, x) => s + x.qty * x.price, 0);
      const toPay = total - retTotal;
      const debtPrev = (debt[p.name] || []).reduce((s, d) => s + d.amount, 0);
      let payCash = 0, payQr = 0, payDebt = 0, debtPaid = 0;
      if (p.credit) { payDebt = toPay; debtPaid = chance(0.85) ? debtPrev : 0; } else if (p.pay === 'QR' || p.pay === 'Безналичные') payQr = toPay; else payCash = toPay;
      if (!p.credit && chance(0.04)) { payDebt = Math.round(toPay * 0.5); payCash = payCash ? toPay - payDebt : 0; payQr = payQr ? toPay - payDebt : 0; }
      if (debtPaid) { if (p.pay === 'Наличные') payCash += debtPaid; else payQr += debtPaid; debt[p.name] = []; }
      if (payDebt) (debt[p.name] = debt[p.name] || []).push({ date: ds, amount: payDebt });
      lastDelivered[p.name] = Object.fromEntries(items.map((x) => [x.sku, x.qty]));
      const inv = { no: `KK-${++invNo}`, date: ds, at: iso(ds, t), agent: ag.name, client: p.name, items, returns, total, retTotal, toPay, pay: { cash: payCash, qr: payQr, debt: payDebt, debtPaid }, source: isExtra ? 'cabinet' : 'route' };
      dayInv.push(inv);
      if (isExtra) cabinetOrders.push({ client: p.name, agent: ag.name, createdAt: iso(ds, ri(-600, -200)), forDate: ds, kind: 'order', items: items.map((x) => ({ sku: x.sku, qty: x.qty })), status: 'delivered', comment: pick(['Закончились сэндвичи, привезите сегодня', 'Мероприятие в офисе', 'Большой спрос, нужна допоставка', '']) });
    });
    if (ds === TODAY) dayInv.splice(Math.ceil(dayInv.length * 0.75)); // сегодня маршрут ещё не закончен
    invoices.push(...dayInv);
    // загрузка утром: план + запас 10–18%
    const need = {};
    dayInv.forEach((inv) => inv.items.forEach((x) => { need[x.sku] = (need[x.sku] || 0) + x.qty; }));
    if (ds === TODAY) stops.slice(dayInv.length).forEach((p) => p.matrix.forEach((sku) => { need[sku] = (need[sku] || 0) + Math.round(p.size / p.matrix.length); }));
    const loaded = Object.fromEntries(Object.entries(need).map(([k, v]) => [k, Math.ceil(v * (1.1 + rnd() * 0.08))]));
    const sold = {}; const back = {};
    dayInv.forEach((inv) => { inv.items.forEach((x) => { sold[x.sku] = (sold[x.sku] || 0) + x.qty; }); inv.returns.forEach((x) => { back[x.sku] = (back[x.sku] || 0) + x.qty; }); });
    const done = ds !== TODAY;
    loads.push({ agent: ag.name, van: ag.van, date: ds, loadedAt: iso(ds, ri(6 * 60 + 40, 7 * 60 + 30)), loaded, sold, returnsFromPoints: back,
      leftover: Object.fromEntries(Object.keys(loaded).map((k) => [k, loaded[k] - (sold[k] || 0)])), closed: done, closedAt: done ? iso(ds, t + ri(40, 90)) : null });
    const c = dayInv.reduce((s, i) => s + i.pay.cash, 0), q = dayInv.reduce((s, i) => s + i.pay.qr, 0);
    const diff = done && chance(0.06) ? -ri(1, 8) * 50 : 0;
    cash.push({ agent: ag.name, date: ds, cash: c, qr: q, debtGiven: dayInv.reduce((s, i) => s + i.pay.debt, 0), debtCollected: dayInv.reduce((s, i) => s + i.pay.debtPaid, 0),
      handed: done ? c + diff : null, diff: done ? diff : null, status: done ? (diff ? 'недостача' : 'принято') : 'ожидает сдачи', acceptedBy: done ? 'Кассир' : null, handedAt: done ? iso(ds, t + ri(60, 110)) : null });
  });
});
save('van_invoices.json', invoices);
save('van_loads.json', loads);
save('van_cash.json', cash);

// ---------- 4. Заявки на завтра (28.10, среда) и кабинет клиента ----------
const TOMORROW = '2026-10-28';
const orders = [];
AGENTS.forEach((ag) => {
  points.filter((p) => p.agent === ag.name && p.visitDay === 'Среда').forEach((p) => {
    if (!chance(0.8)) return;
    orders.push({ client: p.name, agent: ag.name, createdAt: iso('2026-10-27', ri(9 * 60, 17 * 60)), forDate: TOMORROW, kind: 'order', source: chance(0.2) ? 'cabinet' : 'agent',
      items: p.matrix.map((sku) => ({ sku, qty: Math.max(1, Math.round(p.size / p.matrix.length * (0.8 + rnd() * 0.5))) })), status: 'new', comment: '' });
  });
  // возвраты из кабинета
  points.filter((p) => p.agent === ag.name).filter(() => chance(0.04)).forEach((p) => {
    orders.push({ client: p.name, agent: ag.name, createdAt: iso('2026-10-27', ri(8 * 60, 15 * 60)), forDate: TOMORROW, kind: 'return', source: 'cabinet',
      items: [{ sku: pick(p.matrix), qty: ri(2, 6), reason: pick(RETURN_REASONS) }], status: 'new', comment: 'Заберите при следующем визите' });
  });
});
cabinetOrders.forEach((o) => orders.push({ ...o, source: 'cabinet' }));
save('van_orders.json', orders);

// ---------- 5. Срезы продаж агентов (формат базовой CRM) ----------
const sales = { _comment: 'Kav&Kev демо: продажи вэн-агентов за октябрь 2026 (из van_invoices.json).', month: '2026-10' };
AGENTS.forEach((ag) => {
  const inv = invoices.filter((i) => i.agent === ag.name);
  const byDate = {}; const cl = {};
  inv.forEach((i) => {
    const net = i.total;
    const d = byDate[i.date] || (byDate[i.date] = { sum: 0, invoices: 0 }); d.sum += net; d.invoices++;
    const c = cl[i.client] || (cl[i.client] = { name: i.client, revenue: 0, lastDate: null, byDate: {}, items: {} });
    c.revenue += net; c.lastDate = i.date;
    const cd = c.byDate[i.date] || (c.byDate[i.date] = { sum: 0, invoices: 0 }); cd.sum += net; cd.invoices++;
    i.items.forEach((x) => { const pr = bySku[x.sku]; const it = c.items[x.sku] || (c.items[x.sku] = { product: pr.name, brand: pr.line, category: x.sku, qty: 0, revenue: 0 }); it.qty += x.qty; it.revenue += x.qty * x.price; });
  });
  const clients = Object.values(cl).map((c) => ({ ...c, items: Object.values(c.items) }));
  sales[ag.name] = { period: '01.10.26 - 27.10.26', asOf: TODAY, total: clients.reduce((s, c) => s + c.revenue, 0), qty: clients.reduce((s, c) => s + c.items.reduce((a, b) => a + b.qty, 0), 0), invoices: inv.length, byDate, clients };
});
save('agent_sales.json', sales);

// ---------- 6. Планы по линейкам, долги, справочники ----------
const plans = {};
AGENTS.forEach((ag) => {
  const p = { 'Классика': 0, 'Мясные': 0, 'Премиум': 0 };
  points.filter((x) => x.agent === ag.name).forEach((x) => (monthly[x.name]['сентябрь'] || []).forEach((it) => { p[it.brand] += it.revenue; }));
  Object.keys(p).forEach((k) => { p[k] = Math.round(p[k] * 1.08 / 1000) * 1000; });
  plans[ag.name] = p;
});
save('brand_plans.json', plans);
save('debts.json', Object.entries(debt).filter(([, a]) => a.length).map(([name, a]) => {
  const amount = a.reduce((s, d) => s + d.amount, 0);
  const oldest = a[0].date;
  const days = Math.round((Date.parse(TODAY) - Date.parse(oldest)) / 86400000);
  return { client_name: name, debt_amount: amount, payment_date: oldest, is_overdue: amount > 3000 && days > 7 };
}));
save('articles.json', Object.fromEntries(PRODUCTS.map((p) => [norm(p.name), p.sku])));
save('stock.json', {});
save('price_list.json', Object.fromEntries(PRODUCTS.map((p) => ['a:' + p.sku, { name: p.name, art: p.sku, price: p.price, file: 'Прайс Kav&Kev (демо)' }])));
save('promotions.json', {});
save('client_name_aliases.json', {});
save('client_reassignments.json', { moves: [] });
save('agent_duplicates.json', []);
save('documents_status.json', []);
save('sales_snapshots.json', {});
console.log('точек', points.length, 'накладных', invoices.length, 'заявок', orders.length, 'выручка окт', Object.values(sales).filter((x) => x.total).reduce((s, x) => s + x.total, 0));
