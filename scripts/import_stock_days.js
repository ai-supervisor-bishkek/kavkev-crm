// Импорт отчёта 1С «Остатки товаров в днях на ДД.ММ.ГГ» (26.10.2026).
// Формат: Номенклатура | Артикул | Остаток | Продано (за период отчёта) | Остаток в днях;
// строки без артикула/цифр — заголовки товарных групп. Товары с нулевым остатком и без
// движения в отчёт не попадают — для CRM «нет в отчёте» = остаток 0.
//
//   node scripts/import_stock_days.js <файл.xlsx> [начало периода ГГГГ-ММ-ДД]
//
// Период продаж («Продано») по умолчанию — 7 дней до даты отчёта включительно
// с даты-7 (как в файле «19-26»: 19.10–26.10). Пишет снимок в
// data/import/stock_history/<дата>.json и обновляет data/import/stock.json
// (актуальные остатки для карточек клиентов), если снимок самый свежий.
const fs = require('fs');
const path = require('path');
const { parseTableFile } = require('../src/fileTable');

const DIR = path.join(__dirname, '..', 'data', 'import');
const HIST = path.join(DIR, 'stock_history');
const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };

function parse(file) { return parseRows(parseTableFile(path.basename(file), fs.readFileSync(file))); }

function parseRows(rows) {
  const title = (rows[0] && rows[0][0]) || '';
  const m = String(title).match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
  if (!m) throw new Error('Не нашёл дату в заголовке: ' + title);
  const date = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}`;
  const h = rows.findIndex((r) => String(r[0] || '').trim() === 'Номенклатура');
  if (h < 0) throw new Error('Нет строки заголовка «Номенклатура»');
  const items = {};
  let group = '';
  rows.slice(h + 1).forEach((r) => {
    const name = String(r[0] || '').trim();
    if (!name) return;
    const art = String(r[1] || '').trim();
    const rest = [r[2], r[3], r[4]].map((x) => String(x == null ? '' : x).trim());
    if (!art && rest.every((x) => !x)) { group = name; return; }
    const key = norm(name);
    const prev = items[key];
    const rec = { name, art, group, qty: num(r[2]), sold: num(r[3]), days: num(r[4]) };
    if (prev) { prev.qty += rec.qty; prev.sold += rec.sold; } else items[key] = rec;
  });
  return { date, title: String(title).trim(), items };
}

function main() {
  const [, , file, fromArg] = process.argv;
  if (!file) { console.error('Использование: node scripts/import_stock_days.js <файл.xlsx> [ГГГГ-ММ-ДД начало периода]'); process.exit(1); }
  const snap = buildSnapshot(parseTableFile(path.basename(file), fs.readFileSync(file)), fromArg);
  fs.mkdirSync(HIST, { recursive: true });
  fs.writeFileSync(path.join(HIST, snap.date + '.json'), JSON.stringify(snap));
  const list = Object.values(snap.items);
  console.log(`Снимок ${snap.date}: товаров ${list.length}, с остатком ${list.filter((x) => x.qty > 0).length}, остаток 0 ${list.filter((x) => x.qty <= 0).length}, продавались ${list.filter((x) => x.sold > 0).length} (период ${snap.periodFrom}–${snap.periodTo}, ${snap.periodDays} дн.)`);
  const latest = fs.readdirSync(HIST).filter((f) => f.endsWith('.json')).sort().pop();
  if (latest === snap.date + '.json') {
    const stock = {};
    list.forEach((x) => { stock[norm(x.name)] = { name: x.name, unit: 'шт', qty: x.qty }; });
    fs.writeFileSync(path.join(DIR, 'stock.json'), JSON.stringify(stock));
    console.log('stock.json обновлён (актуальные остатки).');
  }
}
if (require.main === module) main();
// Снимок со всеми полями периода (для загрузки с сайта).
function buildSnapshot(rows, fromArg) {
  const snap = parseRows(rows);
  const d = new Date(snap.date + 'T00:00:00Z');
  snap.periodFrom = fromArg || new Date(d.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  snap.periodTo = snap.date;
  snap.periodDays = Math.round((d - new Date(snap.periodFrom + 'T00:00:00Z')) / 864e5) + 1;
  return snap;
}

// Прайс-лист 1С «ПРАЙС ЛИСТ с ДД.ММ.ГГ» (Артикул | Наименование | Цена) → { "a:арт"|"n:название": {name, art, price, file} }.
function parsePriceRows(rows, file) {
  const out = {};
  const h = rows.findIndex((r) => r.some((c) => ['наименование', 'нименование'].includes(String(c || '').trim().toLowerCase())));
  if (h < 0) throw new Error('Нет колонки «Наименование» — это не прайс-лист?');
  const hdr = rows[h].map((c) => String(c || '').trim().toLowerCase());
  const ni = hdr.findIndex((c) => c === 'наименование' || c === 'нименование');
  const pi = hdr.findIndex((c) => c.startsWith('цена'));
  const ai = hdr.findIndex((c) => c === 'артикул');
  if (pi < 0) throw new Error('Нет колонки «Цена»');
  rows.slice(h + 1).forEach((r) => {
    const name = String(r[ni] || '').trim();
    const price = num(r[pi]);
    if (!name || !(price > 0)) return;
    const art = ai >= 0 ? String(r[ai] || '').trim() : '';
    const rec = { name, art, price, file: file || '' };
    out['n:' + norm(name)] = rec;
    if (art) out['a:' + norm(art)] = rec;
  });
  return out;
}

module.exports = { parse, parseRows, buildSnapshot, parsePriceRows, norm };
