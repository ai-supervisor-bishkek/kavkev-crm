// Трекер агентов (19.10.2026): «пинги» местоположения агента, пока у него открыт
// сайт CRM (браузер не даёт сайту следить в фоне). Хранение — JSONL по агенту на
// постоянном диске: <DATA>/geo/<agentId>.jsonl, в памяти — массив по агенту.
// Храним последние KEEP_DAYS дней. Пишется только в рабочее время (WORK_FROM–WORK_TO
// по Бишкеку) и не чаще MIN_GAP_SEC — частые пинги отбрасываются.
const fs = require('fs');
const path = require('path');
const { PERSIST_DIR } = require('./paths');

const GEO_DIR = path.join(PERSIST_DIR, 'geo');
const KEEP_DAYS = 60;
const MIN_GAP_SEC = 45; // приложение-трекер шлёт раз в минуту — чаще не пишем
const WORK_FROM = 7;
const WORK_TO = 21;

const store = new Map(); // agentId -> [{t, lat, lng, acc}]
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(GEO_DIR)) return;
    const cutoff = Date.now() / 1000 - KEEP_DAYS * 86400;
    fs.readdirSync(GEO_DIR).filter((f) => f.endsWith('.jsonl')).forEach((f) => {
      const id = Number(f.replace('.jsonl', ''));
      const arr = [];
      fs.readFileSync(path.join(GEO_DIR, f), 'utf8').split('\n').forEach((line) => {
        if (!line.trim()) return;
        try { const r = JSON.parse(line); if (r.t >= cutoff) arr.push(r); } catch (e) { /* битая строка */ }
      });
      arr.sort((a, b) => a.t - b.t);
      store.set(id, arr);
      // Перезаписываем файл без старых записей (чистка раз при старте).
      try { fs.writeFileSync(path.join(GEO_DIR, f), arr.map((r) => JSON.stringify(r)).join('\n') + (arr.length ? '\n' : '')); } catch (e) { /* не критично */ }
    });
  } catch (e) { console.error('Трекер: не удалось прочитать', e.message); }
}

function bishkekHour(sec) { return new Date((sec + 6 * 3600) * 1000).getUTCHours(); }

// Возвращает { saved: bool, reason }.
function addPing(agentId, lat, lng, acc, atSec, src) {
  load();
  lat = Number(lat); lng = Number(lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { saved: false, reason: 'bad' };
  const nowSec = Math.floor(Date.now() / 1000);
  // Время точки из приложения (оно может досылать накопленные офлайн точки), но не из будущего и не старше суток.
  const t = atSec && isFinite(atSec) && atSec <= nowSec + 60 && atSec >= nowSec - 86400 ? Math.floor(atSec) : nowSec;
  const h = bishkekHour(t);
  if (h < WORK_FROM || h >= WORK_TO) return { saved: false, reason: 'offhours' };
  const arr = store.get(agentId) || [];
  if (arr.some((r) => Math.abs(r.t - t) < MIN_GAP_SEC)) return { saved: false, reason: 'often' };
  const rec = { t, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc: acc != null && isFinite(Number(acc)) ? Math.round(Number(acc)) : null };
  if (src) rec.src = src;
  arr.push(rec);
  if (arr.length > 1 && arr[arr.length - 2].t > t) arr.sort((a, b) => a.t - b.t);
  store.set(agentId, arr);
  try {
    fs.mkdirSync(GEO_DIR, { recursive: true });
    fs.appendFileSync(path.join(GEO_DIR, agentId + '.jsonl'), JSON.stringify(rec) + '\n');
  } catch (e) { console.error('Трекер: запись не удалась', e.message); }
  return { saved: true };
}

function pings(agentId, fromSec, toSec) {
  load();
  return (store.get(agentId) || []).filter((r) => r.t >= fromSec && r.t <= toSec);
}

function lastPing(agentId) {
  load();
  const arr = store.get(agentId) || [];
  return arr.length ? arr[arr.length - 1] : null;
}

module.exports = { addPing, pings, lastPing, WORK_FROM, WORK_TO, MIN_GAP_SEC };
