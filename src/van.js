// Kav&Kev (демо): вэн-продажи — загрузка машины, накладные, возвраты и списания,
// инкассация, заявки на завтра (план производства) и кабинет клиента.
// Исторические данные — data/import/van_*.json (генератор scripts/gen_kavkev_demo.js).
// Новые заявки/возвраты из демо хранятся в памяти и сбрасываются при перезапуске.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./auth');
const { PRODUCTS, LINES, RETURN_REASONS } = require('./vanCatalog');

const IMPORT_DIR = path.join(__dirname, '..', 'data', 'import');
const bySku = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p]));
const load = (n, def) => { try { return JSON.parse(fs.readFileSync(path.join(IMPORT_DIR, n), 'utf8')); } catch (e) { return def; } };
const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

let D = null;
function data() {
  if (D) return D;
  const clients = db.all('clients');
  const users = db.all('users').filter((u) => u.role === 'agent');
  const cid = {}; clients.forEach((c) => { cid[norm(c.name)] = c.id; });
  const aid = {}; users.forEach((u) => { aid[u.name] = u.id; });
  const points = load('van_points.json', {});
  const fix = (x) => Object.assign(x, { clientId: cid[norm(x.client)] || null, agentId: aid[x.agent] || null });
  let oid = 0;
  D = {
    points: Object.fromEntries(Object.entries(points).map(([k, v]) => [cid[norm(k)], v]).filter(([k]) => k)),
    invoices: load('van_invoices.json', []).map(fix),
    loads: load('van_loads.json', []).map((x) => Object.assign(x, { agentId: aid[x.agent] || null })),
    cash: load('van_cash.json', []).map((x) => Object.assign(x, { agentId: aid[x.agent] || null })),
    orders: load('van_orders.json', []).map(fix).map((o) => Object.assign(o, { id: ++oid })),
    nextOrderId: () => ++oid
  };
  return D;
}
function today() { return new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10); }
function sum(a, f) { return a.reduce((s, x) => s + (f(x) || 0), 0); }
function qtyOf(items) { return sum(items || [], (x) => x.qty); }
function moneyOf(items) { return sum(items || [], (x) => x.qty * (x.price || (bySku[x.sku] || {}).price || 0)); }
function inRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('Некорректный JSON')); } });
  });
}
const isStaff = (u) => u.role === 'admin' || u.role === 'supervisor';
function guard(handler, opts = {}) {
  return async (req, res, params) => {
    const user = auth.currentUser(req);
    if (!user) return send(res, 401, { error: 'Требуется вход' });
    if (opts.client ? user.role !== 'client' : user.role === 'client') return send(res, 403, { error: 'Недостаточно прав' });
    const q = new URL(req.url, 'http://x').searchParams;
    return handler(req, res, params, user, q);
  };
}
function agentScope(user, q) {
  if (user.role === 'agent') return user.id;
  return q.get('agentId') ? Number(q.get('agentId')) : null;
}
function clientName(id) { const c = db.find('clients', id); return c ? c.name : '—'; }
function decorateInvoice(i) { return Object.assign({}, i, { clientName: i.client }); }

function agentsList() {
  return db.all('users').filter((u) => u.role === 'agent').map((u) => ({ id: u.id, name: u.name, van: u.van || '', plate: u.vanPlate || '' }));
}

function summary(from, to, agentId) {
  const d = data();
  const inv = d.invoices.filter((i) => inRange(i.date, from, to) && (!agentId || i.agentId === agentId));
  const loads = d.loads.filter((l) => inRange(l.date, from, to) && (!agentId || l.agentId === agentId));
  const cash = d.cash.filter((c) => inRange(c.date, from, to) && (!agentId || c.agentId === agentId));
  const rows = agentsList().filter((a) => !agentId || a.id === agentId).map((a) => {
    const ai = inv.filter((i) => i.agentId === a.id);
    const al = loads.filter((l) => l.agentId === a.id);
    const ac = cash.filter((c) => c.agentId === a.id);
    const rets = ai.flatMap((i) => i.returns);
    const byReason = {}; RETURN_REASONS.forEach((r) => { byReason[r] = 0; });
    rets.forEach((r) => { byReason[r.reason] = (byReason[r.reason] || 0) + r.qty; });
    const soldQty = sum(ai, (i) => qtyOf(i.items));
    const loadedQty = sum(al, (l) => sum(Object.values(l.loaded), (x) => x));
    return {
      agentId: a.id, name: a.name, van: a.van, plate: a.plate, days: al.length,
      loadedQty, soldQty, soldSum: sum(ai, (i) => i.total), invoices: ai.length, points: new Set(ai.map((i) => i.clientId)).size,
      returnsQty: qtyOf(rets), returnsSum: moneyOf(rets), byReason, returnPct: soldQty ? Math.round(qtyOf(rets) / soldQty * 1000) / 10 : 0,
      leftoverQty: sum(al.filter((l) => l.closed), (l) => sum(Object.values(l.leftover), (x) => x)),
      sellThrough: loadedQty ? Math.round(soldQty / loadedQty * 1000) / 10 : 0,
      cash: sum(ac, (c) => c.cash), qr: sum(ac, (c) => c.qr), debtGiven: sum(ac, (c) => c.debtGiven), debtCollected: sum(ac, (c) => c.debtCollected),
      handed: sum(ac, (c) => c.handed), diff: sum(ac, (c) => c.diff), pendingCash: sum(ac.filter((c) => c.status === 'ожидает сдачи'), (c) => c.cash)
    };
  });
  const byDate = {};
  inv.forEach((i) => { const x = byDate[i.date] || (byDate[i.date] = { date: i.date, sold: 0, soldSum: 0, returns: 0, returnsSum: 0 }); x.sold += qtyOf(i.items); x.soldSum += i.total; x.returns += qtyOf(i.returns); x.returnsSum += moneyOf(i.returns); });
  const sku = PRODUCTS.map((p) => {
    const sold = sum(inv, (i) => sum(i.items.filter((x) => x.sku === p.sku), (x) => x.qty));
    const ret = sum(inv, (i) => sum(i.returns.filter((x) => x.sku === p.sku), (x) => x.qty));
    return { sku: p.sku, name: p.name, line: p.line, price: p.price, sold, soldSum: sold * p.price, returns: ret, returnPct: sold ? Math.round(ret / sold * 1000) / 10 : 0 };
  });
  return { from, to, rows, byDate: Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1)), sku };
}

function clientDebt(clientId) {
  const d = data();
  let debt = 0;
  d.invoices.filter((i) => i.clientId === clientId).sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((i) => { debt += i.pay.debt; debt -= i.pay.debtPaid; });
  return Math.max(0, debt);
}
function nextVisit(client) {
  const names = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const idx = names.indexOf(client.visitDay);
  if (idx < 0) return null;
  const t = new Date(today() + 'T00:00:00Z');
  for (let k = 1; k <= 7; k++) { const x = new Date(t.getTime() + k * 86400000); if (x.getUTCDay() === idx) return x.toISOString().slice(0, 10); }
  return null;
}
function clientInfo(clientId) {
  const d = data();
  const c = db.find('clients', clientId);
  if (!c) return null;
  const p = d.points[clientId] || {};
  const inv = d.invoices.filter((i) => i.clientId === clientId).sort((a, b) => (a.at < b.at ? 1 : -1));
  const rets = inv.flatMap((i) => i.returns.map((r) => Object.assign({ date: i.date, no: i.no }, r)));
  const sold = sum(inv, (i) => qtyOf(i.items));
  const owner = db.find('users', c.ownerId);
  return {
    clientId, name: c.name, address: c.address, phone: c.phone, contactName: c.contactName, visitDay: c.visitDay, nextVisit: nextVisit(c),
    agent: owner ? { id: owner.id, name: owner.name, van: owner.van || '' } : null,
    matrix: (p.matrix || []).map((s) => bySku[s]).filter(Boolean), size: p.size || null, pay: p.pay || c.paymentMethod || '', credit: !!p.credit, acceptTime: p.acceptTime || '',
    invoices: inv.slice(0, 20).map(decorateInvoice), soldQty: sold, soldSum: sum(inv, (i) => i.total), returnsQty: qtyOf(rets), returnsSum: moneyOf(rets),
    returnPct: sold ? Math.round(qtyOf(rets) / sold * 1000) / 10 : 0, returns: rets.slice(0, 20), debt: clientDebt(clientId),
    orders: d.orders.filter((o) => o.clientId === clientId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 15)
  };
}
function cleanItems(items, withReason) {
  return (Array.isArray(items) ? items : []).map((x) => ({ sku: String(x.sku), qty: Math.max(0, Math.min(999, Math.round(Number(x.qty) || 0))), ...(withReason ? { reason: RETURN_REASONS.includes(x.reason) ? x.reason : RETURN_REASONS[0] } : {}) }))
    .filter((x) => bySku[x.sku] && x.qty > 0);
}
function addOrder(o) {
  const d = data();
  const c = db.find('clients', o.clientId);
  const owner = c && db.find('users', c.ownerId);
  const rec = Object.assign({ id: d.nextOrderId(), client: c ? c.name : '', clientId: o.clientId, agent: owner ? owner.name : '', agentId: owner ? owner.id : null, createdAt: new Date().toISOString(), status: 'new' }, o);
  d.orders.push(rec);
  return rec;
}

function register(router) {
  router.get('/api/van/catalog', guard(async (req, res) => send(res, 200, { products: PRODUCTS, lines: LINES, reasons: RETURN_REASONS, agents: agentsList(), today: today() })));

  router.get('/api/van/day', guard(async (req, res, p, user, q) => {
    const d = data();
    const date = q.get('date') || today();
    const agentId = agentScope(user, q) || (agentsList()[0] || {}).id;
    const a = agentsList().find((x) => x.id === agentId);
    send(res, 200, {
      date, agent: a, load: d.loads.find((l) => l.agentId === agentId && l.date === date) || null,
      cash: d.cash.find((c) => c.agentId === agentId && c.date === date) || null,
      invoices: d.invoices.filter((i) => i.agentId === agentId && i.date === date).map(decorateInvoice).sort((x, y) => (x.at < y.at ? -1 : 1)),
      orders: d.orders.filter((o) => o.agentId === agentId && o.forDate === date && o.status !== 'delivered')
    });
  }));

  router.get('/api/van/summary', guard(async (req, res, p, user, q) => {
    send(res, 200, summary(q.get('from') || '2026-10-01', q.get('to') || today(), agentScope(user, q)));
  }));

  router.get('/api/van/returns', guard(async (req, res, p, user, q) => {
    const d = data();
    const from = q.get('from') || '2026-10-01', to = q.get('to') || today();
    const agentId = agentScope(user, q);
    const lines = [];
    d.invoices.filter((i) => inRange(i.date, from, to) && (!agentId || i.agentId === agentId)).forEach((i) => i.returns.forEach((r) => {
      lines.push({ date: i.date, no: i.no, agent: i.agent, agentId: i.agentId, client: i.client, clientId: i.clientId, sku: r.sku, name: bySku[r.sku].name, qty: r.qty, sum: r.qty * r.price, reason: r.reason });
    }));
    const byClient = {};
    lines.forEach((l) => { const x = byClient[l.clientId] || (byClient[l.clientId] = { clientId: l.clientId, client: l.client, agent: l.agent, qty: 0, sum: 0 }); x.qty += l.qty; x.sum += l.sum; });
    const sold = {};
    d.invoices.filter((i) => inRange(i.date, from, to) && (!agentId || i.agentId === agentId)).forEach((i) => { sold[i.clientId] = (sold[i.clientId] || 0) + qtyOf(i.items); });
    const top = Object.values(byClient).map((x) => Object.assign(x, { sold: sold[x.clientId] || 0, pct: sold[x.clientId] ? Math.round(x.qty / sold[x.clientId] * 1000) / 10 : 0 })).sort((a, b) => b.sum - a.sum).slice(0, 25);
    const requests = d.orders.filter((o) => o.kind === 'return' && (!agentId || o.agentId === agentId));
    send(res, 200, { from, to, lines: lines.sort((a, b) => (a.date < b.date ? 1 : -1)), top, requests });
  }));

  router.get('/api/van/cash', guard(async (req, res, p, user, q) => {
    const d = data();
    const from = q.get('from') || '2026-10-01', to = q.get('to') || today();
    const agentId = agentScope(user, q);
    send(res, 200, { from, to, rows: d.cash.filter((c) => inRange(c.date, from, to) && (!agentId || c.agentId === agentId)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.agent.localeCompare(b.agent))) });
  }));

  router.get('/api/van/orders', guard(async (req, res, p, user, q) => {
    const d = data();
    const date = q.get('date');
    const agentId = agentScope(user, q);
    const list = d.orders.filter((o) => (!date || o.forDate === date) && (!agentId || o.agentId === agentId)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const plan = PRODUCTS.map((pr) => ({ sku: pr.sku, name: pr.name, line: pr.line, qty: sum(list.filter((o) => o.kind === 'order' && o.status !== 'cancelled'), (o) => sum(o.items.filter((x) => x.sku === pr.sku), (x) => x.qty)) }));
    const byAgent = agentsList().filter((a) => !agentId || a.id === agentId).map((a) => {
      const ao = list.filter((o) => o.agentId === a.id && o.kind === 'order');
      const qty = sum(ao, (o) => qtyOf(o.items));
      return { agentId: a.id, name: a.name, van: a.van, orders: ao.length, qty, loadPlan: Math.ceil(qty * 1.12), sum: sum(ao, (o) => moneyOf(o.items)) };
    });
    send(res, 200, { date, list, plan, byAgent });
  }));

  router.post('/api/van/orders', guard(async (req, res, p, user) => {
    let b; try { b = await body(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const c = db.find('clients', b.clientId);
    if (!c) return send(res, 400, { error: 'Укажите точку' });
    if (user.role === 'agent' && c.ownerId !== user.id) return send(res, 403, { error: 'Это не ваша точка' });
    const kind = b.kind === 'return' ? 'return' : 'order';
    const items = cleanItems(b.items, kind === 'return');
    if (!items.length) return send(res, 400, { error: 'Добавьте хотя бы одну позицию' });
    send(res, 201, { order: addOrder({ clientId: c.id, kind, items, forDate: b.forDate || nextVisit(c) || today(), comment: String(b.comment || '').slice(0, 300), source: 'agent' }) });
  }));

  router.post('/api/van/orders/:id/status', guard(async (req, res, p, user) => {
    if (!isStaff(user) && user.role !== 'agent') return send(res, 403, { error: 'Недостаточно прав' });
    let b; try { b = await body(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const o = data().orders.find((x) => x.id === Number(p.id));
    if (!o) return send(res, 404, { error: 'Заявка не найдена' });
    if (user.role === 'agent' && o.agentId !== user.id) return send(res, 403, { error: 'Не ваша заявка' });
    if (!['new', 'accepted', 'loaded', 'delivered', 'cancelled'].includes(b.status)) return send(res, 400, { error: 'Неизвестный статус' });
    o.status = b.status; o.updatedAt = new Date().toISOString(); o.updatedBy = user.name;
    send(res, 200, { order: o });
  }));

  router.get('/api/van/client/:id', guard(async (req, res, p, user) => {
    const info = clientInfo(Number(p.id));
    if (!info) return send(res, 404, { error: 'Не найдено' });
    if (user.role === 'agent' && info.agent && info.agent.id !== user.id) return send(res, 403, { error: 'Не ваша точка' });
    send(res, 200, info);
  }));

  // ---- Кабинет клиента ----
  router.get('/api/cabinet/me', guard(async (req, res, p, user) => {
    const info = clientInfo(user.clientId);
    if (!info) return send(res, 404, { error: 'Точка не найдена' });
    send(res, 200, Object.assign(info, { products: PRODUCTS, reasons: RETURN_REASONS, today: today() }));
  }, { client: true }));
  router.post('/api/cabinet/orders', guard(async (req, res, p, user) => {
    let b; try { b = await body(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const kind = b.kind === 'return' ? 'return' : 'order';
    const items = cleanItems(b.items, kind === 'return');
    if (!items.length) return send(res, 400, { error: 'Добавьте хотя бы одну позицию' });
    const forDate = /^\d{4}-\d{2}-\d{2}$/.test(b.forDate || '') && b.forDate > today() ? b.forDate : null;
    if (kind === 'order' && !forDate) return send(res, 400, { error: 'Выберите дату доставки (не раньше завтра)' });
    send(res, 201, { order: addOrder({ clientId: user.clientId, kind, items, forDate: forDate || nextVisit(db.find('clients', user.clientId)), comment: String(b.comment || '').slice(0, 300), source: 'cabinet' }) });
  }, { client: true }));
}

// Пользователь «кабинет клиента» для демо-входа: крупная точка с историей.
function cabinetUser() {
  const d = data();
  let u = db.all('users').find((x) => x.role === 'client');
  if (u) return u;
  const counts = {};
  d.invoices.forEach((i) => { counts[i.clientId] = (counts[i.clientId] || 0) + i.total; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id]) => db.find('clients', Number(id))).find((c) => c && /Супермаркет|БЦ|Буфет/.test(c.name)) || db.find('clients', Number(Object.keys(counts)[0]));
  return db.insert('users', { name: best.name, email: 'client@kavkev.demo', role: 'client', clientId: best.id, passwordHash: auth.hashPassword('client123'), createdAt: new Date().toISOString() });
}

module.exports = { register, data, cabinetUser };
