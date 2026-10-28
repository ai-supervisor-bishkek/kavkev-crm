// ДЕМО-ВЕРСИЯ: фиксированная дата (см. src/demoClock.js) — строго до остальных модулей.
require('./demoClock');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const Router = require('./router');
const api = require('./api');
const db = require('./db');
const auth = require('./auth');
const { runImport } = require('./import');
const whatsapp = require('./whatsapp');
const demoSeed = require('./demoSeed');
const van = require('./van');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const { UPLOADS_DIR, PERSIST_DIR } = require('./paths');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.weba': 'audio/webm',
  '.opus': 'audio/ogg',
  '.aac': 'audio/aac',
  '.amr': 'audio/amr',
  '.3gp': 'audio/3gpp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon'
};

const router = new Router();
api.register(router);
van.register(router);

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  // Защита от выхода за пределы public/
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(400).end('Bad request');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-фолбэк: неизвестные пути отдаём как index.html
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
        if (err2) return res.writeHead(404).end('Not found');
        res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveUpload(req, res, pathname) {
  // /uploads/<taskId>/<filename> — только для вошедших пользователей
  const user = auth.currentUser(req);
  if (!user) return res.writeHead(401).end('Требуется вход в систему');

  const rel = pathname.replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOADS_DIR, rel);
  if (!filePath.startsWith(UPLOADS_DIR)) return res.writeHead(400).end('Bad request');

  // 05.10.2026: отдаём потоком и с поддержкой Range — без неё Safari/iPhone
  // не проигрывает аудио и не даёт перематывать голосовые.
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return res.writeHead(404).end('Not found');
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' };
    const m = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (m && (m[1] || m[2])) {
      let start, end;
      if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1; }
      else { start = Math.max(0, stat.size - Number(m[2])); end = stat.size - 1; }
      if (start > end || start >= stat.size) return res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      res.writeHead(206, Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 }));
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, Object.assign(headers, { 'Content-Length': stat.size }));
    fs.createReadStream(filePath).pipe(res);
  });
}

db.ensureLoaded();

// Переименования агентов — ОБЯЗАТЕЛЬНО до runImport() (см. комментарий у
// migrateAgentRenames() в api.js): иначе сопоставление владельца клиента по
// имени внутри runImport() использует ещё не переименованную запись.
api.migrateAgentRenames();

// При каждом запуске подтягиваем/обновляем данные из data/import/*.json (контрагенты,
// регулярный ассортимент, долги) — если файлы есть. Новых контрагентов и пользователей
// создаём один раз; расчётные поля (ассортимент/долг) обновляем при каждом запуске,
// а вручную исправленные карточки (адрес/телефон и т.п.) не трогаем.
const importResult = runImport();
if (importResult.usersCreated) {
  console.log(`Первый запуск: создана команда (администратор + супервайзер + агенты).`);
  console.log('ВАЖНО: смените пароли после первого входа (раздел «Команда»).');
}
if (importResult.clientsCreated || importResult.clientsUpdated) {
  console.log(`Импорт данных: новых контрагентов — ${importResult.clientsCreated}, обновлено (ассортимент/долг) — ${importResult.clientsUpdated}.`);
}
if (importResult.extraAgentsAdded) {
  console.log(`Добавлено новых торговых агентов: ${importResult.extraAgentsAdded} (Агент 4/Агент 1/Агент 6).`);
}

// Миграция старых данных под новую схему (см. api.js) — безопасно запускать
// при каждом старте, после первого раза она ничего не делает.
api.migrateLegacyTaskStages();
api.dedupeDuplicateAgentTasks();
api.migrateClientDefaults();
api.migrateUserDefaults();
api.migrateDocumentsStatus();

// Воронка «Посещения» (Фаза 40): задачи создаются кнопкой на вкладке «Посещения»
// (с 28.09.2026 — не автоматически). Здесь только досинхронизация отметок с задачами.
api.syncCheckinTasks();

// Снимок показателей по текущим срезам продаж (АКБ, недопродано, средний чек) —
// для недельного отчёта «неделя к неделе» (15.10.2026).
try { api.recordSalesSnapshots(); } catch (e) { console.error('Снимок продаж не записан:', e.message); }
setInterval(() => { try { api.syncCheckinTasks(); } catch (e) { console.error(e); } }, 60 * 1000);

// ДЕМО-ВЕРСИЯ: наполнение вымышленными задачами, посещениями, треками, активностью и перепиской.
try { demoSeed.run(); } catch (e) { console.error('Демо-наполнение не выполнено:', e); }
api.syncCheckinTasks();

// WhatsApp (Фаза 43): читаем сохранённую переписку и переподключаем агентов,
// которые уже сканировали QR. Без установленной библиотеки — просто пишет в лог.
whatsapp.init(db);

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.startsWith('/api/')) {
    // ---- ДЕМО-ВЕРСИЯ: вход без пароля по роли и режим «только просмотр» ----
    if (req.method === 'POST' && pathname === '/api/demo-login') {
      let raw = '';
      req.on('data', (ch) => { raw += ch; if (raw.length > 2000) req.destroy(); });
      req.on('end', () => {
        let role = 'admin';
        try { role = JSON.parse(raw || '{}').role || 'admin'; } catch (e) {}
        const users = db.all('users');
        if (role === 'client') { const cu = van.cabinetUser(); auth.createSessionForUser(res, cu.id); return api.sendJson(res, 200, { ok: true, redirect: '/cabinet.html' }); }
        const user = role === 'agent'
          ? users.find((u) => u.role === 'agent' && u.name === 'Азамат') || users.find((u) => u.role === 'agent')
          : users.find((u) => u.role === role) || users.find((u) => u.role === 'admin');
        auth.createSessionForUser(res, user.id);
        api.sendJson(res, 200, { ok: true });
      });
      return;
    }
    // Kav&Kev демо: заявки и возвраты (вэн-модуль и кабинет клиента) можно создавать — хранятся в памяти до перезапуска.
    const demoWritable = /^\/api\/van\/orders(\/\d+\/status)?$/.test(pathname) || pathname.startsWith('/api/cabinet/');
    if (req.method !== 'GET' && !demoWritable && !['/api/login', '/api/logout'].includes(pathname)) {
      req.resume();
      if (['/api/activity', '/api/geo/ping'].includes(pathname)) return api.sendJson(res, 200, { ok: true, demo: true });
      return api.sendJson(res, 403, { error: 'Демо-версия: изменения отключены. Доступен только просмотр.' });
    }
    if (pathname === '/api/geo/osmand') return api.sendJson(res, 403, { error: 'Демо-версия' });
    const match = router.match(req.method, pathname);
    if (!match) {
      api.sendJson(res, 404, { error: 'Метод/маршрут не найден' });
      return;
    }
    Promise.resolve(match.handler(req, res, match.params)).catch((err) => {
      console.error(err);
      if (!res.headersSent) api.sendJson(res, 500, { error: 'Внутренняя ошибка сервера' });
    });
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    return serveUpload(req, res, pathname);
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`CRM запущена: http://localhost:${PORT}`);
  console.log(`Данные (база и вложения) хранятся в: ${PERSIST_DIR}`);
});
