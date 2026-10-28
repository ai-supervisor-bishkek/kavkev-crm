// Kav&Kev (демо): кабинет клиента — заказ вне графика визитов, возвраты, история.
(function () {
  let me = null;
  let tab = 'order';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Number(n || 0).toLocaleString('ru-RU') + ' сом';
  const dmy = (d) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '—');
  const tm = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' });
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const short = (n) => n.replace(/^Сэндвич\s*/, '');
  const skuName = (sku) => { const p = me.products.find((x) => x.sku === sku); return p ? short(p.name) : sku; };
  const ST = { new: ['принята, ждёт подтверждения', 'new'], accepted: ['подтверждена', 'ok'], loaded: ['в машине', 'ok'], delivered: ['доставлена', 'ok'], cancelled: ['отменена', 'bad'] };
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) { location.href = '/'; throw new Error('Требуется вход'); }
    if (!r.ok) throw new Error(j.error || 'Ошибка');
    return j;
  }
  async function load() {
    me = await api('GET', '/api/cabinet/me');
    $('#cab-name').textContent = me.name;
    $('#cab-info').innerHTML = [
      [me.agent ? `${esc(me.agent.name)}` : '—', `Ваш агент · ${esc(me.agent ? me.agent.van : '')}`],
      [dmy(me.nextVisit), `Плановый визит (${esc((me.visitDay || '').toLowerCase())})`],
      [money(me.debt), me.credit ? 'Долг (отсрочка до визита)' : 'Задолженность'],
      [me.returnPct + '%', 'Возвраты от поставок']
    ].map(([v, l]) => `<div class="van-kpi"><b>${v}</b><span>${l}</span></div>`).join('');
    draw();
  }
  function draw() {
    document.querySelectorAll('.cab-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const body = $('#cab-body');
    const inMatrix = new Set(me.matrix.map((p) => p.sku));
    if (tab === 'order') {
      const tomorrow = addDays(me.today, 1);
      body.innerHTML = `<h3>Заказ вне графика</h3>
        <p class="muted" style="margin-top:0;font-size:13px">Плановый визит агента — ${dmy(me.nextVisit)}. Нужно раньше или больше? Оформите заказ: агент получит заявку, производство включит её в план. ★ — ваш обычный ассортимент.</p>
        <form id="cab-form"><label>Дата доставки</label><input type="date" name="forDate" value="${tomorrow}" min="${tomorrow}" required>
        ${me.products.map((p) => `<div class="cab-sku ${inMatrix.has(p.sku) ? 'in-matrix' : ''}"><div><span class="nm">${esc(short(p.name))}</span><div class="m">${p.line} · ${money(p.price)} · срок ${p.shelfH} ч</div></div><input type="number" min="0" max="999" name="q_${p.sku}" placeholder="0" data-price="${p.price}"></div>`).join('')}
        <label>Комментарий</label><input name="comment" placeholder="Например: привезти до 9:00">
        <div class="cab-total"><span>Итого</span><b id="cab-sum">0 сом</b></div>
        <button type="submit" class="btn-primary" style="width:100%">Отправить заказ</button><p class="error" id="cab-err"></p></form>`;
      const recalc = () => { let s = 0; body.querySelectorAll('input[data-price]').forEach((i) => { s += (Number(i.value) || 0) * Number(i.dataset.price); }); $('#cab-sum').textContent = money(s); };
      body.querySelectorAll('input[data-price]').forEach((i) => i.addEventListener('input', recalc));
      body.querySelector('#cab-form').addEventListener('submit', (e) => submit(e, 'order'));
    } else if (tab === 'return') {
      body.innerHTML = `<h3>Возврат товара</h3>
        <p class="muted" style="margin-top:0;font-size:13px">Истёк срок, повреждена упаковка или товар не продаётся — оформите возврат, агент заберёт его при ближайшем визите (${dmy(me.nextVisit)}).</p>
        <form id="cab-form">
        ${me.products.filter((p) => inMatrix.has(p.sku)).map((p) => `<div class="cab-sku ret"><div><span class="nm">${esc(short(p.name))}</span><div class="m">${money(p.price)}</div></div><input type="number" min="0" max="999" name="q_${p.sku}" placeholder="0"><select name="r_${p.sku}">${me.reasons.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>`).join('')}
        <label>Комментарий</label><input name="comment" placeholder="Например: лежит в холодильнике у кассы">
        <button type="submit" class="btn-primary" style="width:100%;margin-top:12px">Оформить возврат</button><p class="error" id="cab-err"></p></form>`;
      body.querySelector('#cab-form').addEventListener('submit', (e) => submit(e, 'return'));
    } else if (tab === 'orders') {
      body.innerHTML = `<h3>Мои заявки и возвраты</h3>${me.orders.map((o) => `<div class="van-inv"><div class="van-inv-head"><span><b>${o.kind === 'return' ? '↩ Возврат' : '🛒 Заказ'}</b> на ${dmy(o.forDate)} ${o.source === 'cabinet' ? '<span class="van-chip cab">из кабинета</span>' : '<span class="van-chip">через агента</span>'}</span><span class="van-chip ${(ST[o.status] || [])[1] || ''}">${(ST[o.status] || [o.status])[0]}</span></div>
        <div style="font-size:13px;margin-top:4px">${o.items.map((x) => `${esc(skuName(x.sku))} × ${x.qty}${x.reason ? ' (' + esc(x.reason.toLowerCase()) + ')' : ''}`).join(' · ')}</div>
        <div class="muted" style="font-size:12px">создана ${dmy(o.createdAt)} ${tm(o.createdAt)}${o.comment ? ' · ' + esc(o.comment) : ''}</div></div>`).join('') || '<div class="muted">Заявок пока нет</div>'}`;
    } else {
      body.innerHTML = `<h3>Поставки</h3><div class="muted" style="font-size:13px;margin-bottom:8px">За октябрь: ${me.soldQty} шт на ${money(me.soldSum)}, возвращено ${me.returnsQty} шт.</div>
        ${me.invoices.map((i) => `<div class="van-inv"><div class="van-inv-head"><span>${dmy(i.date)} ${tm(i.at)} · ${esc(i.no)}</span><b>${money(i.total)}</b></div>
        <div style="font-size:12px">${i.items.map((x) => `${esc(skuName(x.sku))} × ${x.qty}`).join(' · ')}</div>
        ${i.returns.length ? `<div style="font-size:12px;color:var(--danger)">↩ ${i.returns.map((x) => `${esc(skuName(x.sku))} × ${x.qty}`).join(' · ')}</div>` : ''}
        <div class="muted" style="font-size:12px">${i.pay.cash ? 'наличные ' + money(i.pay.cash) + ' ' : ''}${i.pay.qr ? 'QR ' + money(i.pay.qr) + ' ' : ''}${i.pay.debt ? 'отсрочка ' + money(i.pay.debt) : ''}</div></div>`).join('') || '<div class="muted">Поставок пока нет</div>'}`;
    }
  }
  async function submit(e, kind) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = me.products.map((p) => ({ sku: p.sku, qty: Number(fd.get('q_' + p.sku) || 0), reason: fd.get('r_' + p.sku) || undefined })).filter((x) => x.qty > 0);
    try {
      await api('POST', '/api/cabinet/orders', { kind, items, forDate: fd.get('forDate'), comment: fd.get('comment') });
      tab = 'orders';
      await load();
    } catch (err) { $('#cab-err').textContent = err.message; }
  }
  document.querySelectorAll('.cab-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
  $('#cab-logout').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/'; });
  load().catch((e) => { $('#cab-body').innerHTML = `<p class="error">${esc(e.message)}</p>`; });
})();
