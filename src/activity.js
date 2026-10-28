// Статистика открытий CRM в браузере (26.10.2026): когда агент заходил на сайт,
// сколько сеансов за день, сколько был в сети, и где был при открытии (если дал
// геолокацию). Хранение — JSONL по агенту: <DATA>/activity/<agentId>.jsonl,
// {t, lat?, lng?, acc?}. Запись не чаще MIN_GAP_SEC (чтобы не засорять). Сеанс —
// события подряд с перерывом меньше SESSION_GAP_MIN; перерыв больше — новый сеанс.
const fs = require('fs');
const path = require('path');
const { PERSIST_DIR } = require('./paths');

const DIR = path.join(PERSIST_DIR, 'activity');
const KEEP_DAYS = 90;
const MIN_GAP_SEC = 120;        // не пишем чаще, чем раз в 2 минуты
const SESSION_GAP_MIN = 30;     // перерыв больше 30 минут = новый сеанс

const store = new Map(); // agentId -> [{t, lat, lng, acc}]
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(DIR)) return;
    const cutoff = Date.now() / 1000 - KEEP_DAYS * 86400;
    fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).forEach((f) => {
      const id = Number(f.replace('.jsonl', ''));
      const arr = [];
      fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').forEach((line) => {
        if (!line.trim()) return;
        try { const r = JSON.parse(line); if (r.t >= cutoff) arr.push(r); } catch (e) { /* битая строка */ }
      });
      arr.sort((a, b) => a.t - b.t);
      store.set(id, arr);
    });
  } catch (e) { console.error('Активность: не удалось прочитать', e.message); }
}

function log(agentId, lat, lng, acc) {
  load();
  const now = Math.floor(Date.now() / 1000);
  const arr = store.get(agentId) || [];
  const last = arr[arr.length - 1];
  const hasGps = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && !(Number(lat) === 0 && Number(lng) === 0);
  // Слишком частые открытия не пишем, НО если появились координаты, а у последней записи их не было — обновим последнюю.
  if (last && now - last.t < MIN_GAP_SEC) {
    if (hasGps && last.lat == null) { last.lat = Math.round(Number(lat) * 1e6) / 1e6; last.lng = Math.round(Number(lng) * 1e6) / 1e6; last.acc = acc != null ? Math.round(Number(acc)) : null; rewrite(agentId, arr); }
    return { saved: false, reason: 'often' };
  }
  const rec = { t: now };
  if (hasGps) { rec.lat = Math.round(Number(lat) * 1e6) / 1e6; rec.lng = Math.round(Number(lng) * 1e6) / 1e6; rec.acc = acc != null ? Math.round(Number(acc)) : null; }
  arr.push(rec);
  store.set(agentId, arr);
  try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(path.join(DIR, agentId + '.jsonl'), JSON.stringify(rec) + '\n'); } catch (e) { console.error('Активность: запись не удалась', e.message); }
  return { saved: true };
}

function rewrite(agentId, arr) {
  try { fs.writeFileSync(path.join(DIR, agentId + '.jsonl'), arr.map((r) => JSON.stringify(r)).join('\n') + (arr.length ? '\n' : '')); } catch (e) { /* не критично */ }
}

function bishkekDate(sec) { return new Date((sec + 6 * 3600) * 1000).toISOString().slice(0, 10); }

// Сеансы агента за период [fromSec, toSec]. Возвращает [{date, start, end, durationMin, events, lat, lng, acc}].
function sessions(agentId, fromSec, toSec) {
  load();
  const arr = (store.get(agentId) || []).filter((r) => r.t >= fromSec && r.t <= toSec);
  const out = [];
  let cur = null;
  arr.forEach((r) => {
    if (!cur || r.t - cur.end > SESSION_GAP_MIN * 60) {
      cur = { date: bishkekDate(r.t), start: r.t, end: r.t, events: 1, lat: r.lat != null ? r.lat : null, lng: r.lng != null ? r.lng : null, acc: r.acc != null ? r.acc : null };
      out.push(cur);
    } else {
      cur.end = r.t; cur.events++;
      if (cur.lat == null && r.lat != null) { cur.lat = r.lat; cur.lng = r.lng; cur.acc = r.acc; }
    }
  });
  return out.map((s) => ({ ...s, durationMin: Math.round((s.end - s.start) / 60) }));
}

module.exports = { log, sessions, SESSION_GAP_MIN };
