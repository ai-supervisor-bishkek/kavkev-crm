// ABC-анализ ассортимента, out-of-stock и упущенная выручка (26.10.2026).
//
// ПРАВИЛА ПОЛЬЗОВАТЕЛЯ (26.10.2026, не менять без его согласия):
//  - «Продано» в отчёте остатков 1С («Остатки товаров в днях») — реальные продажи компании;
//    скорость продаж и упущенную выручку считаем по ним, НЕ по срезам агентов.
//  - Цена — прайс для салонов без скидок (data/import/price_list.json; нет в прайсе —
//    средняя цена продаж по истории).
//  - По агентам: доля агента = медиана его месячных продаж товара (всплески вверх
//    медиана отбрасывает) / сумма медиан всех агентов.
//  - Частичная потеря (остаток был, но меньше обычных недельных продаж) — считается
//    отдельно и включается фильтром.
//
// Снимки остатков: data/import/stock_history/<дата>.json (с кодом) + <PERSIST>/stock_history
// (загруженные с сайта; при совпадении даты берётся загруженный). Каждый снимок — остаток
// на дату и «Продано» за 8 дней (пн–пн), соседние снимки перекрываются на 1 день → неделя
// берётся как 7/8 периода.
const fs = require('fs');
const path = require('path');
const { PERSIST_DIR } = require('./paths');

const IMPORT_DIR = path.join(__dirname, '..', 'data', 'import');
const HIST_DIRS = [path.join(IMPORT_DIR, 'stock_history'), path.join(PERSIST_DIR, 'stock_history')];
const PRICE_FILES = [path.join(IMPORT_DIR, 'price_list.json'), path.join(PERSIST_DIR, 'price_list.json')];
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const YEAR = 2026;
const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }

let snapCache = { key: '', snaps: [] };
function loadSnapshots() {
  const files = {};
  HIST_DIRS.forEach((d) => { try { fs.readdirSync(d).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).forEach((f) => { files[f] = path.join(d, f); }); } catch (e) { /* нет папки */ } });
  const names = Object.keys(files).sort();
  const key = names.map((f) => { try { return files[f] + fs.statSync(files[f]).mtimeMs; } catch (e) { return f; } }).join('|');
  if (snapCache.key === key) return snapCache.snaps;
  const snaps = names.map((f) => readJson(files[f], null)).filter(Boolean);
  snaps.forEach((s) => { s.byArt = {}; Object.values(s.items).forEach((x) => { if (x.art) s.byArt[norm(x.art)] = x; }); s.keys = Object.keys(s.items); });
  snapCache = { key, snaps };
  return snaps;
}

function loadPrices() {
  const out = {};
  PRICE_FILES.forEach((f) => Object.assign(out, readJson(f, {})));
  return out;
}

function saveSnapshot(snap) {
  const dir = HIST_DIRS[1];
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, snap.date + '.json');
  const existed = fs.existsSync(f) || fs.existsSync(path.join(HIST_DIRS[0], snap.date + '.json'));
  fs.writeFileSync(f, JSON.stringify(snap));
  snapCache.key = '';
  return { existed };
}

function savePrices(map) {
  const f = PRICE_FILES[1];
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const cur = readJson(f, {});
  Object.assign(cur, map);
  fs.writeFileSync(f, JSON.stringify(cur));
}

let articles = null;
function artOf(k) { if (!articles) articles = readJson(path.join(IMPORT_DIR, 'articles.json'), {}); return articles[k]; }
const itemKey = (name, art) => (art ? 'a:' + norm(art) : 'n:' + norm(name));

// Товар из продаж/прайса → ключ товара в снимках (артикул → имя → артикул в имени → префикс обрезанного имени).
function makeMatcher(items) {
  const byArt = {}; const byName = {}; const names = [];
  items.forEach((it, k) => { if (it.art) byArt[norm(it.art)] = k; byName[norm(it.name)] = k; names.push(norm(it.name)); });
  return (salesName) => {
    const k = norm(salesName);
    const a = artOf(k);
    if (a && byArt[norm(a)]) return byArt[norm(a)];
    if (byName[k]) return byName[k];
    const m = k.match(/\b(\d{2,3}-\d{3})\b/);
    if (m && byArt[m[1]]) return byArt[m[1]];
    if (k.length >= 20) { const p = k.replace(/[ ,]+$/, ''); const hit = names.find((n) => n.startsWith(p)); if (hit) return byName[hit]; }
    return null;
  };
}

function monthDays(m) { const i = MONTHS.indexOf(m); return i < 0 ? 30 : new Date(Date.UTC(YEAR, i + 1, 0)).getUTCDate(); }

// Общие данные: товары из снимков + история продаж по карточкам клиентов.
function prepare(clients) {
  const snaps = loadSnapshots();
  const prices = loadPrices();
  const items = new Map();
  snaps.forEach((s, i) => Object.values(s.items).forEach((x) => {
    const k = itemKey(x.name, x.art);
    const it = items.get(k) || { key: k, name: x.name, art: x.art, group: x.group, stock: Array(snaps.length).fill(0), sold: Array(snaps.length).fill(0), seen: Array(snaps.length).fill(false) };
    it.stock[i] += x.qty; it.sold[i] += x.sold; it.seen[i] = true; it.name = x.name; it.group = x.group || it.group;
    items.set(k, it);
  }));
  const match = makeMatcher(items);
  // История продаж: по товару — выручка/маржа/шт по месяцам, по агентам — шт по месяцам.
  const salesMonths = new Set();
  const unmatchedSales = new Map();
  clients.forEach((c) => {
    Object.entries(c.monthlyAssortment || {}).forEach(([m, list]) => (list || []).forEach((x) => {
      salesMonths.add(m);
      const k = match(x.product) || ('s:' + norm(x.product));
      let it = items.get(k);
      if (!it) {
        it = unmatchedSales.get(k) || { key: k, name: x.product, art: '', group: '', stock: null, sold: null, seen: null, noStock: true };
        unmatchedSales.set(k, it);
      }
      it.brand = it.brand || x.brand || '';
      it.category = it.category || x.category || '';
      const mm = (it.months = it.months || {});
      const r = mm[m] || (mm[m] = { revenue: 0, margin: 0, qty: 0, clients: new Set() });
      r.revenue += x.revenue || 0; r.margin += x.margin || 0; r.qty += x.qty || 0; r.clients.add(c.id);
      const ag = (it.agentQty = it.agentQty || {});
      const a = ag[c.ownerId || 0] || (ag[c.ownerId || 0] = {});
      a[m] = (a[m] || 0) + (x.qty || 0);
      const ar = (it.agentRev = it.agentRev || {});
      ar[c.ownerId || 0] = (ar[c.ownerId || 0] || 0) + (x.revenue || 0);
    }));
  });
  unmatchedSales.forEach((v, k) => items.set(k, v));
  const monthsSorted = MONTHS.filter((m) => salesMonths.has(m));
  // Цена (прайс для салонов → средняя цена продаж), медиана продаж в неделю, доли агентов.
  items.forEach((it) => {
    const pl = (it.art && prices['a:' + norm(it.art)]) || prices['n:' + norm(it.name)];
    let rev = 0; let qty = 0;
    Object.values(it.months || {}).forEach((r) => { rev += r.revenue; qty += r.qty; });
    it.price = pl ? pl.price : (qty ? rev / qty : 0);
    it.priceSource = pl ? 'прайс' : (qty ? 'ср. цена продаж' : '');
    if (it.stock) {
      const inStock = it.sold.filter((_, i) => it.stock[i] > 0);
      it.normalWeek = median(inStock);
    } else it.normalWeek = 0;
    const meds = {};
    Object.entries(it.agentQty || {}).forEach(([a, mm]) => { if (Number(a)) meds[a] = median(monthsSorted.map((m) => mm[m] || 0)); });
    let sum = Object.values(meds).reduce((x, y) => x + y, 0);
    if (!sum) { Object.entries(it.agentQty || {}).forEach(([a, mm]) => { if (Number(a)) meds[a] = Object.values(mm).reduce((x, y) => x + y, 0); }); sum = Object.values(meds).reduce((x, y) => x + y, 0); }
    it.agentShare = {};
    Object.entries(meds).forEach(([a, v]) => { if (v > 0) it.agentShare[a] = v / sum; });
  });
  return { snaps, items, monthsSorted, prices };
}

// Упущенная выручка за период [from, to] (даты недель снимков).
function oosReport({ clients, agents, from, to, partial, agentId }) {
  const { snaps, items } = prepare(clients);
  const agentName = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const weeks = snaps.map((s, i) => ({ i, date: s.date, periodFrom: s.periodFrom, periodTo: s.periodTo, k: Math.min(1, 7 / (s.periodDays || 8)) }))
    .filter((w) => (!to || w.periodFrom <= to) && (!from || w.periodTo > from));
  const byWeek = weeks.map((w) => ({ date: w.date, periodFrom: w.periodFrom, periodTo: w.periodTo, full: 0, partial: 0, itemsOos: 0, itemsPartial: 0 }));
  const byAgent = {};
  const rows = [];
  items.forEach((it) => {
    if (!it.stock || !(it.normalWeek > 0)) return;
    const share = agentId ? (it.agentShare[agentId] || 0) : 1;
    if (agentId && !share) return;
    let fullQty = 0; let partQty = 0; let oosWeeks = 0; let partWeeks = 0; const weekMarks = [];
    weeks.forEach((w, j) => {
      const st = it.stock[w.i]; const sold = it.sold[w.i];
      const shortQty = Math.max(0, it.normalWeek - sold) * w.k;
      let type = '';
      if (st <= 0 && shortQty > 0) { type = 'oos'; fullQty += shortQty; oosWeeks++; byWeek[j].full += shortQty * it.price * share; byWeek[j].itemsOos++; }
      else if (partial && st > 0 && w.i > 0) {
        // Частичная потеря: на начало недели товара было меньше обычных продаж, поступления
        // не было (остаток не вырос), и почти всё имевшееся продали — спрос упёрся в остаток.
        // Упущено = обычные продажи − остаток на начало (осторожная оценка).
        const prev = it.stock[w.i - 1];
        const receipt = st - (prev - sold);
        if (prev > 0 && prev < it.normalWeek && receipt <= 0.5 && sold >= 0.7 * prev) {
          const q = (it.normalWeek - prev) * w.k;
          if (q > 0) { type = 'partial'; partQty += q; partWeeks++; byWeek[j].partial += q * it.price * share; byWeek[j].itemsPartial++; }
        }
      }
      weekMarks.push(type ? { date: w.date, type, stock: st, sold, lost: Math.round(shortQty * it.price * share) } : null);
    });
    const lostFull = fullQty * it.price * share; const lostPart = partQty * it.price * share;
    if (lostFull + lostPart <= 0) return;
    const shares = agentId ? { [agentId]: 1 } : it.agentShare;
    Object.entries(shares).forEach(([a, sh]) => {
      const r = byAgent[a] || (byAgent[a] = { agentId: Number(a), agentName: agentName[a] || '—', full: 0, partial: 0, items: 0 });
      r.full += lostFull * sh; r.partial += lostPart * sh; r.items++;
    });
    if (!agentId && !Object.keys(shares).length) {
      const r = byAgent[0] || (byAgent[0] = { agentId: 0, agentName: 'без агента (нет продаж по клиентам)', full: 0, partial: 0, items: 0 });
      r.full += lostFull; r.partial += lostPart; r.items++;
    }
    const last = it.stock.length - 1;
    rows.push({
      name: it.name, art: it.art, group: it.group, brand: it.brand || '',
      normalWeek: it.normalWeek, price: Math.round(it.price), priceSource: it.priceSource,
      oosWeeks, partWeeks, lostQty: Math.round((fullQty + partQty) * share * 10) / 10,
      lostFull: Math.round(lostFull), lostPartial: Math.round(lostPart), lost: Math.round(lostFull + lostPart),
      stockNow: it.stock[last], soldLastWeek: it.sold[last],
      nowStatus: it.stock[last] <= 0 ? 'oos' : it.stock[last] < it.normalWeek ? 'low' : 'ok',
      agents: Object.entries(it.agentShare).sort((x, y) => y[1] - x[1]).map(([a, sh]) => ({ agentName: agentName[a] || '—', share: Math.round(sh * 100) })),
      weeks: weekMarks
    });
  });
  rows.sort((a, b) => b.lost - a.lost);
  const r0 = (x) => Math.round(x);
  return {
    from, to, partial: !!partial,
    snapshots: snaps.map((s) => ({ date: s.date, periodFrom: s.periodFrom, periodTo: s.periodTo })),
    weeks: byWeek.map((w) => ({ ...w, full: r0(w.full), partial: r0(w.partial) })),
    totalFull: r0(rows.reduce((a, x) => a + x.lostFull, 0)),
    totalPartial: r0(rows.reduce((a, x) => a + x.lostPartial, 0)),
    byAgent: Object.values(byAgent).map((a) => ({ ...a, full: r0(a.full), partial: r0(a.partial), total: r0(a.full + a.partial) })).sort((x, y) => y.total - x.total),
    rows
  };
}

// ABC по выбранным закрытым месяцам: A — первые 80% суммы, B — до 95%, C — остальное.
function abcReport({ clients, agents, months, agentId, brand }) {
  const { snaps, items, monthsSorted } = prepare(clients);
  const sel = (months && months.length ? months : monthsSorted.slice(-3)).filter((m) => monthsSorted.includes(m));
  const agentName = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const list = [];
  items.forEach((it) => {
    if (!it.months) return;
    if (brand && it.brand !== brand) return;
    let revenue = 0; let margin = 0; let qty = 0; const cl = new Set(); let mcount = 0;
    sel.forEach((m) => { const r = it.months[m]; if (!r) return; revenue += r.revenue; margin += r.margin; qty += r.qty; r.clients.forEach((x) => cl.add(x)); mcount++; });
    if (agentId) {
      const total = Object.values(it.agentRev || {}).reduce((a, b) => a + b, 0);
      const sh = total ? (it.agentRev[agentId] || 0) / total : 0;
      if (!sh) return;
      revenue *= sh; margin *= sh; qty *= sh;
    }
    if (revenue <= 0) return;
    const last = it.stock ? it.stock.length - 1 : -1;
    const stockNow = last >= 0 ? it.stock[last] : null;
    list.push({
      name: it.name, brand: it.brand || '', group: it.group || '', category: it.category || '',
      revenue, margin, qty, clients: cl.size, months: mcount,
      stockNow, normalWeek: it.normalWeek, coverWeeks: stockNow != null && it.normalWeek > 0 ? Math.round(stockNow / it.normalWeek * 10) / 10 : null,
      nowStatus: stockNow == null ? 'nodata' : stockNow <= 0 ? 'oos' : it.normalWeek > 0 && stockNow < it.normalWeek ? 'low' : 'ok',
      price: Math.round(it.price),
      topAgent: Object.entries(it.agentRev || {}).filter(([a]) => Number(a)).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([a]) => agentName[a] || '—').join(', ')
    });
  });
  const cls = (field, key) => {
    const tot = list.reduce((a, x) => a + Math.max(0, x[field]), 0); let acc = 0;
    [...list].sort((a, b) => b[field] - a[field]).forEach((x) => { const before = acc; acc += Math.max(0, x[field]); x[key] = x[field] <= 0 ? 'C' : before / (tot || 1) < 0.8 ? 'A' : before / (tot || 1) < 0.95 ? 'B' : 'C'; });
    return tot;
  };
  const totalRevenue = cls('revenue', 'abcRev');
  const totalMargin = cls('margin', 'abcMargin');
  list.sort((a, b) => b.revenue - a.revenue);
  const sum = (c) => { const r = list.filter((x) => x.abcRev === c); return { count: r.length, revenue: Math.round(r.reduce((a, x) => a + x.revenue, 0)), oos: r.filter((x) => x.nowStatus === 'oos').length, low: r.filter((x) => x.nowStatus === 'low').length }; };
  return {
    months: sel, allMonths: monthsSorted, latestStock: snaps.length ? snaps[snaps.length - 1].date : null,
    totalRevenue: Math.round(totalRevenue), totalMargin: Math.round(totalMargin),
    summary: { A: sum('A'), B: sum('B'), C: sum('C') },
    rows: list.map((x) => ({ ...x, revenue: Math.round(x.revenue), margin: Math.round(x.margin), qty: Math.round(x.qty * 10) / 10 }))
  };
}

module.exports = { oosReport, abcReport, loadSnapshots, saveSnapshot, savePrices, loadPrices };
