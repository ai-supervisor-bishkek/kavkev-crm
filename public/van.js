// Kav&Kev (демо): вкладки вэн-продаж — «Вэн», «Заявки», «Возвраты», «Инкассация»
// и блок в карточке точки. Использует общие помощники app.js (api, el, escapeHtml, fmtMoney…).
/* global api, el, escapeHtml, fmtMoney, state, isStaff, openModal, closeModal, openClientModal, showToast */
const vanState = { catalog: null, from: '2026-10-01', to: null, agentId: '', day: null, ordersDate: null };
const VAN_TZ = { timeZone: 'Asia/Bishkek' };

function vanToday() { return new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); }
function vanAddDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
function vanDmy(d) { return d ? d.split('-').reverse().join('.') : '—'; }
function vanTime(iso) { return new Date(iso).toLocaleTimeString('ru-RU', Object.assign({ hour: '2-digit', minute: '2-digit' }, VAN_TZ)); }
function vanN(n) { return Number(n || 0).toLocaleString('ru-RU'); }
function vanSku(sku) { const p = (vanState.catalog.products || []).find((x) => x.sku === sku); return p ? p.name.replace(/^Сэндвич\s*/, '') : sku; }
function vanBar(pct, warn) { return `<div class="van-bar ${warn ? 'warn' : ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`; }
function vanKpi(v, label, cls) { return `<div class="van-kpi ${cls || ''}"><b>${v}</b><span>${label}</span></div>`; }
const VAN_STATUS = { new: ['новая', 'new'], accepted: ['принята', 'ok'], loaded: ['в машине', 'ok'], delivered: ['доставлена', 'ok'], cancelled: ['отменена', 'bad'] };

async function vanCatalog() {
  if (!vanState.catalog) vanState.catalog = await api('GET', '/api/van/catalog');
  if (!vanState.to) vanState.to = vanState.catalog.today;
  if (!vanState.day) vanState.day = vanState.catalog.today;
  if (!vanState.ordersDate) vanState.ordersDate = vanAddDays(vanState.catalog.today, 1);
  return vanState.catalog;
}
function vanAgentSelect(id, withAll) {
  if (!isStaff()) return '';
  return `<select id="${id}">${withAll ? '<option value="">Все машины</option>' : ''}${vanState.catalog.agents.map((a) => `<option value="${a.id}" ${String(vanState.agentId) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.van)} · ${escapeHtml(a.name)}</option>`).join('')}</select>`;
}
function vanPeriodBar(extra) {
  return `<div class="filter-bar">
    <label class="muted" style="font-size:12px">с <input type="date" id="van-from" value="${vanState.from}"></label>
    <label class="muted" style="font-size:12px">по <input type="date" id="van-to" value="${vanState.to}"></label>
    <button type="button" class="link-btn" data-vp="today">сегодня</button>
    <button type="button" class="link-btn" data-vp="week">7 дней</button>
    <button type="button" class="link-btn" data-vp="month">этот месяц</button>
    ${vanAgentSelect('van-agent', true)}${extra || ''}</div>`;
}
function vanWirePeriod(root, rerender) {
  const f = root.querySelector('#van-from'), t = root.querySelector('#van-to'), a = root.querySelector('#van-agent');
  if (f) f.addEventListener('change', () => { vanState.from = f.value; rerender(); });
  if (t) t.addEventListener('change', () => { vanState.to = t.value; rerender(); });
  if (a) a.addEventListener('change', () => { vanState.agentId = a.value; rerender(); });
  root.querySelectorAll('[data-vp]').forEach((b) => b.addEventListener('click', () => {
    const td = vanToday();
    vanState.to = td;
    vanState.from = b.dataset.vp === 'today' ? td : b.dataset.vp === 'week' ? vanAddDays(td, -6) : td.slice(0, 8) + '01';
    rerender();
  }));
}
function vanQuery(extra) {
  const q = new URLSearchParams({ from: vanState.from, to: vanState.to });
  if (vanState.agentId) q.set('agentId', vanState.agentId);
  Object.entries(extra || {}).forEach(([k, v]) => q.set(k, v));
  return q.toString();
}
function vanOpenClient(id) { const c = (state.clients || []).find((x) => x.id === Number(id)); if (c) openClientModal(c); }
function vanWireClientLinks(root) {
  root.querySelectorAll('[data-client]').forEach((x) => x.addEventListener('click', (e) => { e.stopPropagation(); vanOpenClient(x.dataset.client); }));
}

// Простая SVG-диаграмма: столбцы (продажи) + линия (возвраты)
function vanChart(rows, barKey, lineKey, barLabel, lineLabel) {
  if (!rows.length) return '<div class="muted">Нет данных за период</div>';
  const W = 1200, H = 230, pl = 52, pr = 44, pt = 14, pb = 26;
  const maxB = Math.max(...rows.map((r) => r[barKey])) || 1, maxL = Math.max(...rows.map((r) => r[lineKey])) || 1;
  const bw = (W - pl - pr) / rows.length;
  const y = (v, m) => pt + (H - pt - pb) * (1 - v / m);
  const bars = rows.map((r, i) => `<rect x="${pl + i * bw + bw * 0.15}" y="${y(r[barKey], maxB)}" width="${bw * 0.7}" height="${H - pb - y(r[barKey], maxB)}" rx="2" fill="var(--primary)" opacity=".85"><title>${vanDmy(r.date)}: ${barLabel} ${vanN(r[barKey])}, ${lineLabel} ${vanN(r[lineKey])}</title></rect>`).join('');
  const pts = rows.map((r, i) => `${pl + i * bw + bw / 2},${y(r[lineKey], maxL)}`).join(' ');
  const labels = rows.map((r, i) => (i % Math.ceil(rows.length / 14) === 0 ? `<text x="${pl + i * bw + bw / 2}" y="${H - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${r.date.slice(8)}.${r.date.slice(5, 7)}</text>` : '')).join('');
  return `<svg class="van-chart" viewBox="0 0 ${W} ${H}">
    <line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" stroke="var(--border)"/>
    <text x="${pl - 6}" y="${pt + 8}" font-size="10" text-anchor="end" fill="var(--muted)">${vanN(maxB)}</text>
    <text x="${W - pr + 6}" y="${pt + 8}" font-size="10" fill="#f87171">${vanN(maxL)}</text>
    ${bars}<polyline points="${pts}" fill="none" stroke="#f87171" stroke-width="2"/>${labels}</svg>
    <div class="muted" style="font-size:12px"><span style="color:var(--primary)">■</span> ${barLabel} · <span style="color:#f87171">━</span> ${lineLabel}</div>`;
}

// ---------- Вкладка «Вэн» ----------
async function renderVanMain(content) {
  if (!isStaff()) vanState.agentId = String(state.user.id);
  const box = el('<div><div class="toolbar"><h2 style="margin:0">🚚 Вэн-продажи</h2></div><p class="muted" style="margin-top:0">Загрузка машины утром → продажи по накладным → возвраты с точек → остаток вечером на склад. Sell-through — доля загруженного, которая продана.</p><div id="van-body" class="muted">Загрузка…</div></div>');
  content.appendChild(box);
  const draw = async () => {
    const s = await api('GET', '/api/van/summary?' + vanQuery());
    const T = s.rows.reduce((acc, r) => { Object.keys(r).forEach((k) => { if (typeof r[k] === 'number') acc[k] = (acc[k] || 0) + r[k]; }); return acc; }, {});
    const st = T.loadedQty ? Math.round(T.soldQty / T.loadedQty * 1000) / 10 : 0;
    const rp = T.soldQty ? Math.round(T.returnsQty / T.soldQty * 1000) / 10 : 0;
    const body = box.querySelector('#van-body');
    body.className = '';
    body.innerHTML = `${vanPeriodBar()}
      <div class="van-kpis">
        ${vanKpi(fmtMoney(T.soldSum), 'Выручка (отгрузка)')}
        ${vanKpi(vanN(T.soldQty) + ' шт', `Продано из ${vanN(T.loadedQty)} загруженных`)}
        ${vanKpi(st + '%', 'Sell-through', st >= 85 ? 'good' : st < 75 ? 'bad' : '')}
        ${vanKpi(rp + '%', `Возвраты: ${vanN(T.returnsQty)} шт · ${fmtMoney(T.returnsSum)}`, rp > 6 ? 'bad' : 'good')}
        ${vanKpi(vanN(T.leftoverQty) + ' шт', 'Остаток вернули на склад')}
        ${vanKpi(fmtMoney(T.cash), 'Наличные')}
        ${vanKpi(fmtMoney(T.qr), 'QR / безнал')}
        ${vanKpi(fmtMoney(T.debtGiven - T.debtCollected), 'Отсрочка: выдано − собрано')}
        ${vanKpi(fmtMoney(-T.diff), 'Недостача по кассе', T.diff ? 'bad' : 'good')}
      </div>
      <div class="van-panel"><h3>Продажи и возвраты по дням</h3>${vanChart(s.byDate, 'soldSum', 'returnsSum', 'выручка, сом', 'возвраты, сом')}</div>
      ${isStaff() && !vanState.agentId ? `<div class="van-panel"><h3>По машинам <span class="muted" style="font-weight:400">· нажмите строку — загрузочный лист и накладные дня</span></h3>
        <table class="van-table"><thead><tr><th>Машина</th><th>Агент</th><th class="num">Дней</th><th class="num">Загружено</th><th class="num">Продано</th><th>Sell-through</th><th class="num">Возвр. %</th><th class="num">Выручка</th><th class="num">Нал</th><th class="num">QR</th><th class="num">Отсрочка</th><th class="num">Недостача</th></tr></thead><tbody>
        ${s.rows.sort((a, b) => b.soldSum - a.soldSum).map((r) => `<tr class="clickable" data-agent="${r.agentId}"><td>${escapeHtml(r.van)}<div class="muted" style="font-size:11px">${escapeHtml(r.plate)}</div></td><td>${escapeHtml(r.name)}</td><td class="num">${r.days}</td><td class="num">${vanN(r.loadedQty)}</td><td class="num">${vanN(r.soldQty)}</td><td>${vanBar(r.sellThrough, r.sellThrough < 80)}<span class="muted" style="font-size:11px">${r.sellThrough}%</span></td><td class="num" style="color:${r.returnPct > 6 ? 'var(--danger)' : 'inherit'}">${r.returnPct}%</td><td class="num">${fmtMoney(r.soldSum)}</td><td class="num">${fmtMoney(r.cash)}</td><td class="num">${fmtMoney(r.qr)}</td><td class="num">${fmtMoney(r.debtGiven - r.debtCollected)}</td><td class="num" style="color:${r.diff ? 'var(--danger)' : 'inherit'}">${r.diff ? fmtMoney(-r.diff) : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
      <div class="van-panel"><h3>Ассортимент: продано и возвращено</h3>
        <table class="van-table"><thead><tr><th>SKU</th><th>Сэндвич</th><th>Линейка</th><th class="num">Цена</th><th class="num">Продано, шт</th><th class="num">Выручка</th><th class="num">Возвраты, шт</th><th>Возвраты, %</th></tr></thead><tbody>
        ${s.sku.sort((a, b) => b.soldSum - a.soldSum).map((r) => `<tr><td>${r.sku}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.line)}</td><td class="num">${fmtMoney(r.price)}</td><td class="num">${vanN(r.sold)}</td><td class="num">${fmtMoney(r.soldSum)}</td><td class="num">${vanN(r.returns)}</td><td>${vanBar(r.returnPct * 8, r.returnPct > 6)}<span class="muted" style="font-size:11px">${r.returnPct}%</span></td></tr>`).join('')}
        </tbody></table></div>
      <div id="van-day"></div>`;
    vanWirePeriod(body, draw);
    body.querySelectorAll('tr[data-agent]').forEach((tr) => tr.addEventListener('click', () => { vanState.dayAgent = tr.dataset.agent; drawDay(); body.querySelector('#van-day').scrollIntoView({ behavior: 'smooth' }); }));
    drawDay();
  };
  const drawDay = async () => {
    const agentId = vanState.dayAgent || vanState.agentId || (vanState.catalog.agents[0] || {}).id;
    const d = await api('GET', `/api/van/day?date=${vanState.day}&agentId=${agentId}`);
    const holder = box.querySelector('#van-day');
    if (!holder) return;
    const L = d.load;
    const skus = L ? Object.keys(L.loaded).sort() : [];
    holder.innerHTML = `<div class="van-panel"><h3>Загрузочный лист и накладные · ${escapeHtml(d.agent ? d.agent.van + ' · ' + d.agent.name : '')}</h3>
      <div class="filter-bar"><label class="muted" style="font-size:12px">день <input type="date" id="van-day-date" value="${vanState.day}"></label>
      ${isStaff() ? `<select id="van-day-agent">${vanState.catalog.agents.map((a) => `<option value="${a.id}" ${String(a.id) === String(agentId) ? 'selected' : ''}>${escapeHtml(a.van)} · ${escapeHtml(a.name)}</option>`).join('')}</select>` : ''}
      ${L ? `<span class="van-chip ${L.closed ? 'ok' : 'new'}">${L.closed ? 'день закрыт ' + vanTime(L.closedAt) : 'машина на маршруте'}</span> <span class="muted" style="font-size:12px">загрузка ${vanTime(L.loadedAt)}</span>` : '<span class="muted">Нет выезда в этот день</span>'}</div>
      ${L ? `<div class="van-grid"><div>
        <table class="van-table"><thead><tr><th>Сэндвич</th><th class="num">Загружено</th><th class="num">Продано</th><th class="num">Возврат с точек</th><th class="num">${L.closed ? 'Сдано на склад' : 'В машине'}</th></tr></thead><tbody>
        ${skus.map((k) => `<tr><td>${escapeHtml(vanSku(k))}</td><td class="num">${L.loaded[k]}</td><td class="num">${L.sold[k] || 0}</td><td class="num">${L.returnsFromPoints[k] || 0}</td><td class="num">${L.leftover[k]}</td></tr>`).join('')}
        <tr><td><b>Итого</b></td><td class="num"><b>${vanN(skus.reduce((s, k) => s + L.loaded[k], 0))}</b></td><td class="num"><b>${vanN(skus.reduce((s, k) => s + (L.sold[k] || 0), 0))}</b></td><td class="num"><b>${vanN(Object.values(L.returnsFromPoints).reduce((s, v) => s + v, 0))}</b></td><td class="num"><b>${vanN(skus.reduce((s, k) => s + L.leftover[k], 0))}</b></td></tr>
        </tbody></table>
        ${d.cash ? `<p style="font-size:13px">Касса дня: нал <b>${fmtMoney(d.cash.cash)}</b> · QR <b>${fmtMoney(d.cash.qr)}</b> · отсрочка выдана ${fmtMoney(d.cash.debtGiven)}, собрано ${fmtMoney(d.cash.debtCollected)} · <span class="van-chip ${d.cash.status === 'принято' ? 'ok' : d.cash.status === 'недостача' ? 'bad' : 'new'}">${escapeHtml(d.cash.status)}${d.cash.diff ? ' ' + fmtMoney(-d.cash.diff) : ''}</span></p>` : ''}
        ${d.orders.length ? `<p class="muted" style="font-size:13px">Заявок к доставке в этот день: ${d.orders.length}</p>` : ''}
      </div><div>
        ${d.invoices.map((i) => `<div class="van-inv"><div class="van-inv-head"><span><b>${vanTime(i.at)}</b> · <a href="#" data-client="${i.clientId}">${escapeHtml(i.clientName)}</a> ${i.source === 'cabinet' ? '<span class="van-chip cab">заказ из кабинета</span>' : ''}</span><span class="muted">${escapeHtml(i.no)}</span></div>
          <div style="font-size:12px;margin-top:4px">${i.items.map((x) => `${escapeHtml(vanSku(x.sku))} × ${x.qty}`).join(' · ')}</div>
          ${i.returns.length ? `<div style="font-size:12px;color:var(--danger)">↩ возврат: ${i.returns.map((x) => `${escapeHtml(vanSku(x.sku))} × ${x.qty} (${escapeHtml(x.reason.toLowerCase())})`).join(' · ')}</div>` : ''}
          <div style="font-size:12px;margin-top:4px">Сумма <b>${fmtMoney(i.total)}</b>${i.retTotal ? ` − возврат ${fmtMoney(i.retTotal)}` : ''} · ${i.pay.cash ? 'нал ' + fmtMoney(i.pay.cash) + ' ' : ''}${i.pay.qr ? 'QR ' + fmtMoney(i.pay.qr) + ' ' : ''}${i.pay.debt ? '<span style="color:#fbbf24">отсрочка ' + fmtMoney(i.pay.debt) + '</span> ' : ''}${i.pay.debtPaid ? '· погашен долг ' + fmtMoney(i.pay.debtPaid) : ''}</div></div>`).join('') || '<div class="muted">Накладных нет</div>'}
      </div></div>` : ''}</div>`;
    const dd = holder.querySelector('#van-day-date');
    if (dd) dd.addEventListener('change', () => { vanState.day = dd.value; drawDay(); });
    const da = holder.querySelector('#van-day-agent');
    if (da) da.addEventListener('change', () => { vanState.dayAgent = da.value; drawDay(); });
    holder.querySelectorAll('a[data-client]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); vanOpenClient(a.dataset.client); }));
  };
  await draw();
}

// ---------- Вкладка «Заявки» ----------
async function renderVanOrders(content) {
  const box = el(`<div><div class="toolbar"><h2 style="margin:0">Заявки на доставку и план производства</h2>
    <button type="button" class="btn-primary" id="van-new-order">+ Заявка</button></div>
    <p class="muted" style="margin-top:0">Агент собирает заявки точек на следующий визит, клиенты заказывают сами в кабинете (в т.ч. вне графика). Сумма заявок на дату = план производства; загрузка машины = заявки + 12% запас.</p><div id="vo-body" class="muted">Загрузка…</div></div>`);
  content.appendChild(box);
  box.querySelector('#van-new-order').addEventListener('click', () => vanOrderModal({ onDone: draw }));
  async function draw() {
    const q = new URLSearchParams({ date: vanState.ordersDate });
    if (vanState.agentId && isStaff()) q.set('agentId', vanState.agentId);
    const d = await api('GET', '/api/van/orders?' + q);
    const orders = d.list.filter((o) => o.kind === 'order');
    const rets = d.list.filter((o) => o.kind === 'return');
    const totalQty = d.plan.reduce((s, x) => s + x.qty, 0);
    const maxQ = Math.max(1, ...d.plan.map((x) => x.qty));
    const body = box.querySelector('#vo-body');
    body.className = '';
    body.innerHTML = `<div class="filter-bar"><label class="muted" style="font-size:12px">доставка на <input type="date" id="vo-date" value="${vanState.ordersDate}"></label>${vanAgentSelect('vo-agent', true)}</div>
      <div class="van-kpis">${vanKpi(orders.length, 'Заявок на доставку')}${vanKpi(vanN(totalQty) + ' шт', 'К производству')}${vanKpi(vanN(Math.ceil(totalQty * 1.12)) + ' шт', 'Загрузка с запасом 12%')}${vanKpi(orders.filter((o) => o.source === 'cabinet').length, 'Из кабинета клиента')}${vanKpi(rets.length, 'Заявок на возврат', rets.length ? 'bad' : '')}</div>
      <div class="van-grid"><div class="van-panel"><h3>План производства по SKU</h3>
        <table class="van-table"><thead><tr><th>Сэндвич</th><th class="num">Заявки, шт</th><th class="num">+12%</th><th></th></tr></thead><tbody>
        ${d.plan.map((x) => `<tr><td>${escapeHtml(x.name.replace(/^Сэндвич\s*/, ''))}</td><td class="num">${vanN(x.qty)}</td><td class="num">${vanN(Math.ceil(x.qty * 1.12))}</td><td style="width:30%">${vanBar(x.qty / maxQ * 100)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="van-panel"><h3>Загрузка по машинам</h3>
        <table class="van-table"><thead><tr><th>Машина</th><th class="num">Заявок</th><th class="num">Шт</th><th class="num">Загрузить</th><th class="num">Сумма</th></tr></thead><tbody>
        ${d.byAgent.map((a) => `<tr><td>${escapeHtml(a.van)} · ${escapeHtml(a.name)}</td><td class="num">${a.orders}</td><td class="num">${vanN(a.qty)}</td><td class="num">${vanN(a.loadPlan)}</td><td class="num">${fmtMoney(a.sum)}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="van-panel"><h3>Список заявок</h3>
        <table class="van-table"><thead><tr><th>Создана</th><th>Точка</th><th>Машина</th><th>Тип</th><th>Позиции</th><th class="num">Шт</th><th>Статус</th><th></th></tr></thead><tbody>
        ${d.list.map((o) => `<tr><td>${vanDmy(o.createdAt.slice(0, 10))} ${vanTime(o.createdAt)}</td><td><a href="#" data-client="${o.clientId}">${escapeHtml(o.client)}</a>${o.comment ? `<div class="muted" style="font-size:11px">${escapeHtml(o.comment)}</div>` : ''}</td><td>${escapeHtml(o.agent)}</td>
          <td>${o.kind === 'return' ? '<span class="van-chip bad">возврат</span>' : 'заказ'} ${o.source === 'cabinet' ? '<span class="van-chip cab">кабинет</span>' : ''}</td>
          <td style="font-size:12px">${o.items.map((x) => `${escapeHtml(vanSku(x.sku))} × ${x.qty}${x.reason ? ' (' + escapeHtml(x.reason.toLowerCase()) + ')' : ''}`).join('<br>')}</td>
          <td class="num">${o.items.reduce((s, x) => s + x.qty, 0)}</td><td><span class="van-chip ${(VAN_STATUS[o.status] || [])[1] || ''}">${(VAN_STATUS[o.status] || [o.status])[0]}</span></td>
          <td style="white-space:nowrap">${o.status === 'new' ? `<button type="button" class="link-btn" data-st="accepted" data-id="${o.id}">Принять</button> <button type="button" class="link-btn" data-st="cancelled" data-id="${o.id}">Отменить</button>` : o.status === 'accepted' ? `<button type="button" class="link-btn" data-st="loaded" data-id="${o.id}">В машину</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Заявок на эту дату нет</td></tr>'}
        </tbody></table></div>`;
    body.querySelector('#vo-date').addEventListener('change', (e) => { vanState.ordersDate = e.target.value; draw(); });
    const ag = body.querySelector('#vo-agent');
    if (ag) ag.addEventListener('change', () => { vanState.agentId = ag.value; draw(); });
    body.querySelectorAll('a[data-client]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); vanOpenClient(a.dataset.client); }));
    body.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('POST', `/api/van/orders/${b.dataset.id}/status`, { status: b.dataset.st }); showToast('Статус заявки обновлён', 'ok'); draw(); } catch (e) { showToast(e.message, 'error'); }
    }));
  }
  await draw();
}

function vanOrderModal({ clientId, kind, onDone }) {
  const cat = vanState.catalog;
  const clients = (state.clients || []).filter((c) => !c.closed && (isStaff() || c.ownerId === state.user.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const isRet = kind === 'return';
  openModal(`<h2>${isRet ? 'Возврат с точки' : 'Заявка на доставку'}</h2>
    <form>
      <label>Точка</label>
      <select name="clientId" required>${clientId ? '' : '<option value="">— выберите —</option>'}${clients.filter((c) => !clientId || c.id === clientId).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>
      ${isRet ? '' : `<label>Дата доставки</label><input type="date" name="forDate" value="${vanAddDays(vanToday(), 1)}" min="${vanAddDays(vanToday(), 1)}">`}
      <div style="margin-top:10px">${cat.products.map((p) => `<div class="van-sku-row"><span>${escapeHtml(p.name.replace(/^Сэндвич\s*/, ''))} <span class="muted" style="font-size:11px">${fmtMoney(p.price)}</span></span><input type="number" min="0" max="999" name="q_${p.sku}" placeholder="0">${isRet ? `<select name="r_${p.sku}">${cat.reasons.map((r) => `<option>${escapeHtml(r)}</option>`).join('')}</select>` : '<span></span>'}</div>`).join('')}</div>
      <label>Комментарий</label><input name="comment" placeholder="${isRet ? 'Например: заберите в четверг' : 'Например: к 9 утра'}">
      <div class="modal-actions"><button type="button" class="btn-secondary" id="cancel-modal">Отмена</button><button type="submit" class="btn-primary">${isRet ? 'Оформить возврат' : 'Создать заявку'}</button></div>
    </form>`, async (form) => {
    const fd = new FormData(form);
    const items = cat.products.map((p) => ({ sku: p.sku, qty: Number(fd.get('q_' + p.sku) || 0), reason: fd.get('r_' + p.sku) || undefined })).filter((x) => x.qty > 0);
    await api('POST', '/api/van/orders', { clientId: Number(fd.get('clientId')), forDate: fd.get('forDate'), kind: isRet ? 'return' : 'order', items, comment: fd.get('comment') });
    closeModal();
    showToast(isRet ? 'Возврат оформлен' : 'Заявка создана', 'ok');
    if (onDone) onDone();
  });
}

// ---------- Вкладка «Возвраты» ----------
async function renderVanReturns(content) {
  if (!isStaff()) vanState.agentId = String(state.user.id);
  const box = el('<div><div class="toolbar"><h2 style="margin:0">Возвраты и списания</h2></div><p class="muted" style="margin-top:0">Возвраты принимаются с точек при визите (по сроку годности, браку, обмену). Норма для сэндвичей — до 5–6% от отгрузки; точки выше нормы — кандидаты на уменьшение заказа или смену матрицы.</p><div id="vr-body" class="muted">Загрузка…</div></div>');
  content.appendChild(box);
  const draw = async () => {
    const [d, s] = await Promise.all([api('GET', '/api/van/returns?' + vanQuery()), api('GET', '/api/van/summary?' + vanQuery())]);
    const byReason = {};
    d.lines.forEach((l) => { const x = byReason[l.reason] || (byReason[l.reason] = { qty: 0, sum: 0 }); x.qty += l.qty; x.sum += l.sum; });
    const tq = d.lines.reduce((a, l) => a + l.qty, 0), ts = d.lines.reduce((a, l) => a + l.sum, 0);
    const sold = s.rows.reduce((a, r) => a + r.soldQty, 0);
    const body = box.querySelector('#vr-body');
    body.className = '';
    body.innerHTML = `${vanPeriodBar()}
      <div class="van-kpis">${vanKpi(vanN(tq) + ' шт', 'Возвращено с точек')}${vanKpi(fmtMoney(ts), 'Списано по цене')}${vanKpi((sold ? Math.round(tq / sold * 1000) / 10 : 0) + '%', 'Доля от отгрузки', tq / (sold || 1) > 0.06 ? 'bad' : 'good')}
        ${Object.entries(byReason).map(([r, x]) => vanKpi(vanN(x.qty) + ' шт', escapeHtml(r) + ' · ' + fmtMoney(x.sum))).join('')}${vanKpi(d.requests.length, 'Заявок на возврат (кабинет)', d.requests.length ? 'bad' : '')}</div>
      <div class="van-panel"><h3>Возвраты по дням</h3>${vanChart(s.byDate, 'sold', 'returns', 'продано, шт', 'возвраты, шт')}</div>
      <div class="van-grid"><div class="van-panel"><h3>По сэндвичам</h3>
        <table class="van-table"><thead><tr><th>Сэндвич</th><th class="num">Продано</th><th class="num">Возврат</th><th>%</th></tr></thead><tbody>
        ${s.sku.sort((a, b) => b.returnPct - a.returnPct).map((r) => `<tr><td>${escapeHtml(r.name.replace(/^Сэндвич\s*/, ''))}</td><td class="num">${vanN(r.sold)}</td><td class="num">${vanN(r.returns)}</td><td>${vanBar(r.returnPct * 8, r.returnPct > 6)}<span class="muted" style="font-size:11px">${r.returnPct}%</span></td></tr>`).join('')}
        </tbody></table></div>
      <div class="van-panel"><h3>Точки с наибольшими возвратами</h3>
        <table class="van-table"><thead><tr><th>Точка</th><th>Агент</th><th class="num">Шт</th><th class="num">Сумма</th><th class="num">% от отгрузки</th></tr></thead><tbody>
        ${d.top.map((r) => `<tr class="clickable" data-client="${r.clientId}"><td>${escapeHtml(r.client)}</td><td>${escapeHtml(r.agent)}</td><td class="num">${r.qty}</td><td class="num">${fmtMoney(r.sum)}</td><td class="num" style="color:${r.pct > 6 ? 'var(--danger)' : 'inherit'}">${r.pct}%</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="van-panel"><h3>Журнал возвратов <span class="muted" style="font-weight:400">· ${d.lines.length} строк</span></h3>
        <table class="van-table"><thead><tr><th>Дата</th><th>Накладная</th><th>Точка</th><th>Агент</th><th>Сэндвич</th><th class="num">Шт</th><th class="num">Сумма</th><th>Причина</th></tr></thead><tbody>
        ${d.lines.slice(0, 300).map((l) => `<tr class="clickable" data-client="${l.clientId}"><td>${vanDmy(l.date)}</td><td>${escapeHtml(l.no)}</td><td>${escapeHtml(l.client)}</td><td>${escapeHtml(l.agent)}</td><td>${escapeHtml(vanSku(l.sku))}</td><td class="num">${l.qty}</td><td class="num">${fmtMoney(l.sum)}</td><td>${escapeHtml(l.reason)}</td></tr>`).join('')}
        </tbody></table></div>`;
    vanWirePeriod(body, draw);
    vanWireClientLinks(body);
  };
  await draw();
}

// ---------- Вкладка «Инкассация» ----------
async function renderVanCash(content) {
  if (!isStaff()) vanState.agentId = String(state.user.id);
  const box = el('<div><div class="toolbar"><h2 style="margin:0">Инкассация</h2></div><p class="muted" style="margin-top:0">Наличные и QR по накладным, отсрочка (оплата при следующем визите) и сдача кассы в конце дня. Расхождение между собранным и сданным — недостача.</p><div id="vc-body" class="muted">Загрузка…</div></div>');
  content.appendChild(box);
  const draw = async () => {
    const d = await api('GET', '/api/van/cash?' + vanQuery());
    const T = d.rows.reduce((a, r) => { ['cash', 'qr', 'debtGiven', 'debtCollected', 'handed', 'diff'].forEach((k) => { a[k] = (a[k] || 0) + (r[k] || 0); }); return a; }, {});
    const pending = d.rows.filter((r) => r.status === 'ожидает сдачи');
    const body = box.querySelector('#vc-body');
    body.className = '';
    body.innerHTML = `${vanPeriodBar()}
      <div class="van-kpis">${vanKpi(fmtMoney(T.cash), 'Наличные собраны')}${vanKpi(fmtMoney(T.qr), 'QR / безнал')}${vanKpi(fmtMoney(T.handed), 'Сдано в кассу')}
        ${vanKpi(fmtMoney(-T.diff), 'Недостача', T.diff ? 'bad' : 'good')}${vanKpi(fmtMoney(pending.reduce((s, r) => s + r.cash, 0)), `Ожидает сдачи (${pending.length} маш.)`, pending.length ? '' : 'good')}
        ${vanKpi(fmtMoney(T.debtGiven), 'Отсрочка выдана')}${vanKpi(fmtMoney(T.debtCollected), 'Отсрочка собрана')}</div>
      <div class="van-panel"><table class="van-table"><thead><tr><th>Дата</th><th>Агент</th><th class="num">Наличные</th><th class="num">QR</th><th class="num">Отсрочка выдана</th><th class="num">Долг собран</th><th class="num">Сдано</th><th class="num">Расхождение</th><th>Статус</th><th>Время сдачи</th></tr></thead><tbody>
        ${d.rows.map((r) => `<tr><td>${vanDmy(r.date)}</td><td>${escapeHtml(r.agent)}</td><td class="num">${fmtMoney(r.cash)}</td><td class="num">${fmtMoney(r.qr)}</td><td class="num">${fmtMoney(r.debtGiven)}</td><td class="num">${fmtMoney(r.debtCollected)}</td><td class="num">${r.handed == null ? '—' : fmtMoney(r.handed)}</td><td class="num" style="color:${r.diff ? 'var(--danger)' : 'inherit'}">${r.diff ? fmtMoney(r.diff) : '—'}</td><td><span class="van-chip ${r.status === 'принято' ? 'ok' : r.status === 'недостача' ? 'bad' : 'new'}">${escapeHtml(r.status)}</span></td><td>${r.handedAt ? vanTime(r.handedAt) : '—'}</td></tr>`).join('')}
      </tbody></table></div>`;
    vanWirePeriod(body, draw);
  };
  await draw();
}

async function renderVan(view, content) {
  try {
    await vanCatalog();
    if (view === 'van') return await renderVanMain(content);
    if (view === 'vanorders') return await renderVanOrders(content);
    if (view === 'vanreturns') return await renderVanReturns(content);
    if (view === 'vancash') return await renderVanCash(content);
  } catch (e) { content.appendChild(el(`<p class="error">Не удалось загрузить: ${escapeHtml(e.message)}</p>`)); }
}

// ---------- Блок в карточке точки ----------
function vanClientSectionHtml(client) {
  return `<div id="van-client-box" class="assort-panel" style="display:block"><h3>🥪 Вэн-продажи по точке</h3><div class="muted">Загрузка…</div></div>`;
}
async function wireVanClientSection(client) {
  const box = document.getElementById('van-client-box');
  if (!box) return;
  try {
    await vanCatalog();
    const d = await api('GET', '/api/van/client/' + client.id);
    box.innerHTML = `<h3>🥪 Вэн-продажи по точке</h3>
      <div class="van-kpis" style="margin:6px 0">${vanKpi(fmtMoney(d.soldSum), `Отгружено в октябре · ${vanN(d.soldQty)} шт`)}${vanKpi(d.returnPct + '%', `Возвраты · ${vanN(d.returnsQty)} шт`, d.returnPct > 6 ? 'bad' : 'good')}${vanKpi(fmtMoney(d.debt), d.credit ? 'Долг (работает с отсрочкой)' : 'Долг', d.debt ? 'bad' : '')}${vanKpi(vanDmy(d.nextVisit), 'Следующий визит')}</div>
      <div style="font-size:13px;margin-bottom:6px">Оплата: <b>${escapeHtml(d.pay || '—')}</b> · приёмка товара: <b>${escapeHtml(d.acceptTime || '—')}</b> · средний заказ ≈ ${d.size || '—'} шт</div>
      <div style="font-size:13px"><b>Матрица точки:</b> ${d.matrix.map((p) => `<span class="van-chip" style="margin:2px">${escapeHtml(p.name.replace(/^Сэндвич\s*/, ''))}</span>`).join('')}</div>
      <div class="filter-bar" style="margin:10px 0"><button type="button" class="btn-secondary" id="van-c-order">+ Заявка на доставку</button><button type="button" class="btn-secondary" id="van-c-return">↩ Возврат</button></div>
      ${d.orders.length ? `<div style="font-size:13px;margin-bottom:8px"><b>Заявки:</b><br>${d.orders.map((o) => `${vanDmy(o.forDate)} · ${o.kind === 'return' ? 'возврат' : 'заказ'} ${o.source === 'cabinet' ? '<span class="van-chip cab">кабинет</span>' : ''} · ${o.items.reduce((s, x) => s + x.qty, 0)} шт · <span class="van-chip ${(VAN_STATUS[o.status] || [])[1] || ''}">${(VAN_STATUS[o.status] || [o.status])[0]}</span>`).join('<br>')}</div>` : ''}
      <b style="font-size:13px">Последние накладные</b>
      ${d.invoices.slice(0, 6).map((i) => `<div class="van-inv"><div class="van-inv-head"><span>${vanDmy(i.date)} ${vanTime(i.at)} · ${escapeHtml(i.no)} ${i.source === 'cabinet' ? '<span class="van-chip cab">из кабинета</span>' : ''}</span><b>${fmtMoney(i.total)}</b></div>
        <div style="font-size:12px">${i.items.map((x) => `${escapeHtml(vanSku(x.sku))} × ${x.qty}`).join(' · ')}</div>
        ${i.returns.length ? `<div style="font-size:12px;color:var(--danger)">↩ ${i.returns.map((x) => `${escapeHtml(vanSku(x.sku))} × ${x.qty} (${escapeHtml(x.reason.toLowerCase())})`).join(' · ')}</div>` : ''}</div>`).join('') || '<div class="muted">Накладных пока нет</div>'}`;
    const reopen = () => openClientModal(client);
    box.querySelector('#van-c-order').addEventListener('click', () => vanOrderModal({ clientId: client.id, onDone: reopen }));
    box.querySelector('#van-c-return').addEventListener('click', () => vanOrderModal({ clientId: client.id, kind: 'return', onDone: reopen }));
  } catch (e) { box.innerHTML = `<h3>🥪 Вэн-продажи по точке</h3><div class="muted">${escapeHtml(e.message)}</div>`; }
}
