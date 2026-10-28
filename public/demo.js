// ДЕМО-ВЕРСИЯ: вход по роли без пароля, плашка «демо» и размытие сумм и контактов.
// Данные в демо уже обезличены на сервере (вымышленные телефоны/адреса/контакты,
// суммы изменены) — размытие на экране лишь дополнительный слой. Клики работают.
(function () {
  // ---------- Вход ----------
  var box = document.querySelector('#login-screen .login-box');
  if (box) {
    var form = document.getElementById('login-form');
    if (form) form.style.display = 'none';
    var sub = box.querySelector('p.muted');
    if (sub) sub.textContent = 'Демо-версия · данные обезличены';
    var wrap = document.createElement('div');
    wrap.className = 'demo-login';
    wrap.innerHTML =
      '<p class="demo-login-hint">Выберите роль, чтобы посмотреть систему. Изменения в демо не сохраняются.</p>' +
      '<button type="button" data-role="admin">Войти как администратор</button>' +
      '<button type="button" data-role="supervisor">Войти как супервайзер</button>' +
      '<button type="button" data-role="agent">Войти как вэн-агент</button>' +
      '<button type="button" data-role="client">Войти как клиент (кабинет точки)</button>' +
      '<p class="error" id="demo-login-error"></p>';
    box.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-role]');
      if (!b) return;
      b.disabled = true;
      fetch('/api/demo-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: b.dataset.role }) })
        .then(function (r) { if (!r.ok) throw new Error('Не удалось войти'); return r.json(); }).then(function (j) { if (j && j.redirect) location.href = j.redirect; else location.reload(); })
        .catch(function (err) { b.disabled = false; document.getElementById('demo-login-error').textContent = err.message; });
    });
  }

  // ---------- Плашка ----------
  var bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.innerHTML = '<b>ДЕМО-ВЕРСИЯ</b> · данные вымышленные · изменения не сохраняются (кроме заявок — до перезапуска)';
  document.body.insertBefore(bar, document.body.firstChild);

  // SVG-фильтр размытия (для подписей на графиках)
  var defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML = '<filter id="dz-blur"><feGaussianBlur stdDeviation="3.2"/></filter>';
  document.body.appendChild(defs);

  // ---------- Размытие ----------
  // Kav&Kev: все данные вымышленные — суммы показываем, размываем только контакты.
  var BLUR_MONEY = false;
  var BLUR_ANY = false;
  var NEVER = /(?!)/g;
  var NUM = '\\d[\\d\\s\\u00a0\\u202f]*(?:[.,]\\d+)?';
  var MONEY = new RegExp('[-−+]?' + NUM + '\\s*(?:(?:тыс\\.?|млн\\.?|т\\.)\\s*)?сом|[-−+]?' + NUM + '\\s*(?:тыс\\.|млн)', 'gi');
  var PHONE = /(?:\+?996|\b0)[\s\-()]*\d{3}[\s\-()]*\d{2,3}[\s\-()]*\d{2,3}(?:[\s\-]*\d{1,3})?/g;
  var SHORT_K = /^\s*[-−]?\d+(?:[.,]\d+)?\s?(?:т|к|тыс\.?|млн)\s*$/i; // «120т» на осях графиков
  var MONEY_HEAD = /сом|сумм|выручк|реализац|план|долг|недопрод|упущ|оборот|ср\.?\s*чек|средний чек|цена|прайс|маржа|стоимост|деньг|оплат|факт|остаток по плану|итого/i;
  var NOT_MONEY_HEAD = /шт|кол-?во|количеств|дн(ей|и)\b|%|доля|клиентов|накладн|позиц|визит|посещ|задач/i;
  var CONTACT_HEAD = /телефон|адрес|контакт|номер|имя в whatsapp/i;
  // вымышленные адреса демо (см. обезличивание) и вымышленные имена контактных лиц
  var ADDRESS = /(?:ул\.|пр\.|мкр\.|бул\.)\s(?:Демо|Примерный|Тестовая|Образцовая|Учебный|Пробная|Условный|Шаблонная|Макетная|Показательный),\s?\d+/g;
  var CNAMES = /(?:Айгуль|Айпери|Нурлан|Бермет|Эркин|Мээрим|Жылдыз|Канат|Асель|Динара|Ольга|Елена|Ирина|Светлана|Чолпон|Гульнара|Наталья|Камила|Анара|Самара|Элеонора|Риталия|Алия|Бактыгуль|Эмир|Жибек)/g;
  var CONTACT_INPUT = /^(phone|address|contactName|decisionMakerName|socialContact|extraPhone|contactPhone|waPhone|masterPhone)$/i;
  var MONEY_INPUT = /plan|sum|amount|price|debt|revenue|epica|kapous|ostal/i;
  if (!BLUR_MONEY) { MONEY = NEVER; SHORT_K = /(?!)/; MONEY_HEAD = /(?!)/; MONEY_INPUT = /(?!)/; }
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, SELECT: 1, NOSCRIPT: 1 };

  function wrapMatches(node, re) {
    var text = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) return false;
    re.lastIndex = 0;
    var frag = document.createDocumentFragment();
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (!m[0].trim()) { re.lastIndex++; continue; }
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var s = document.createElement('span');
      s.className = 'dz';
      s.textContent = m[0];
      frag.appendChild(s);
      last = m.index + m[0].length;
    }
    if (!last) return false;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
    return true;
  }

  function inSvg(el) { return el && el.namespaceURI === 'http://www.w3.org/2000/svg'; }

  function processText(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
        if (!/\d/.test(n.nodeValue) && !(p.closest && p.closest('.wa-meta, .wa-chat-name, .tr-pop'))) return NodeFilter.FILTER_REJECT;
        if (p.closest && (p.closest('.dz') || p.closest('.demo-bar') || p.closest('.demo-nodz'))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var list = [];
    while (walker.nextNode()) list.push(walker.currentNode);
    list.forEach(function (n) {
      var p = n.parentNode;
      if (inSvg(p)) {
        var t = n.nodeValue;
        if (MONEY.test(t) || SHORT_K.test(t) || PHONE.test(t) || p.closest('.dz-svg')) p.setAttribute('filter', 'url(#dz-blur)');
        MONEY.lastIndex = 0; PHONE.lastIndex = 0;
        return;
      }
      if (SHORT_K.test(n.nodeValue)) { var sp = document.createElement('span'); sp.className = 'dz'; sp.textContent = n.nodeValue; p.replaceChild(sp, n); return; }
      if (p.closest && p.closest('.wa-meta') && wrapMatches(n, CNAMES)) return;
      if (!wrapMatches(n, MONEY) && !wrapMatches(n, ADDRESS)) wrapMatches(n, PHONE);
    });
  }

  function headerKind(th) {
    var t = (th.textContent || '').trim();
    if (CONTACT_HEAD.test(t)) return 'c';
    if (MONEY_HEAD.test(t) && !NOT_MONEY_HEAD.test(t)) return 'm';
    return '';
  }

  function processTables(root) {
    var tables = root.querySelectorAll ? root.querySelectorAll('table') : [];
    if (root.nodeName === 'TABLE') tables = [root];
    Array.prototype.forEach.call(tables, function (table) {
      var headRow = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
      if (!headRow) { var r0 = table.rows[0]; if (r0 && r0.querySelector('th')) headRow = r0; }
      if (!headRow) return;
      var kinds = [], col = 0;
      Array.prototype.forEach.call(headRow.cells, function (th) {
        var k = headerKind(th);
        for (var i = 0; i < (th.colSpan || 1); i++) kinds[col++] = k;
      });
      if (!kinds.some(Boolean)) return;
      Array.prototype.forEach.call(table.tBodies, function (tb) {
        Array.prototype.forEach.call(tb.rows, function (tr) {
          var c = 0;
          Array.prototype.forEach.call(tr.cells, function (td) {
            var k = kinds[c];
            c += td.colSpan || 1;
            if (!k || td.classList.contains('dz-cell')) return;
            if (k === 'm' && !/\d/.test(td.textContent) && !td.querySelector('input')) return;
            if (k === 'c' && !(td.textContent || '').trim()) return;
            td.classList.add('dz-cell');
          });
        });
      });
      Array.prototype.forEach.call(table.tFoot ? table.tFoot.rows : [], function (tr) {
        var c = 0;
        Array.prototype.forEach.call(tr.cells, function (td) { if (kinds[c] && /\d/.test(td.textContent)) td.classList.add('dz-cell'); c += td.colSpan || 1; });
      });
    });
  }

  function processInputs(root) {
    var inputs = root.querySelectorAll ? root.querySelectorAll('input, textarea') : [];
    Array.prototype.forEach.call(inputs, function (el) {
      var name = el.getAttribute('name') || el.id || '';
      if (CONTACT_INPUT.test(name) || /phone|телефон/i.test(el.placeholder || '') || el.type === 'tel') el.classList.add('dz-input');
      else if ((el.type === 'number' || el.inputMode === 'numeric' || el.type === 'text') && MONEY_INPUT.test(name)) el.classList.add('dz-input');
    });
    var tipped = root.querySelectorAll ? root.querySelectorAll('[title]') : [];
    Array.prototype.forEach.call(tipped, function (el) {
      var t = el.getAttribute('title');
      if (!/\d/.test(t)) return;
      var n = t.replace(MONEY, '••• сом').replace(PHONE, '•••');
      if (n !== t) el.setAttribute('title', n);
    });
  }

  function processAll(root) {
    if (!BLUR_ANY) return; // Kav&Kev: размытие отключено — все данные вымышленные
    if (!root || root.nodeType !== 1) return;
    processTables(root);
    processInputs(root);
    processText(root);
  }

  var pending = new Set(), scheduled = false;
  function flush() {
    scheduled = false;
    observer.disconnect();
    pending.forEach(function (el) { if (el.isConnected) processAll(el); });
    pending.clear();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  var observer = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      var t = m.type === 'characterData' ? m.target.parentNode : m.target;
      if (t && t.nodeType === 1) pending.add(t.closest('table') || t);
    });
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  });
  processAll(document.body);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
