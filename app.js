import { demoData } from './demo-data.js';

const cfg = window.APP_CONFIG;
const state = {
  tab: 'balances',
  data: null,
  query: '',
  storeId: '',
  from: '',
  to: '',
  loading: false
};

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2
});

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

function esc(v) {
  return String(v ?? '').replace(/"/g, '&quot;');
}

function escapeHtml(v) {
  const d = document.createElement('div');
  d.textContent = String(v ?? '');
  return d.innerHTML;
}

function nameBy(list, id) {
  return list.find((x) => String(x.id) === String(id))?.name || id || '—';
}

function inPeriod(date) {
  return (!state.from || date >= state.from) && (!state.to || date <= state.to);
}

function matches(...values) {
  const q = state.query.trim().toLowerCase();
  return !q || values.some((v) => String(v ?? '').toLowerCase().includes(q));
}

function table(headers, rows) {
  if (!rows.length) return '<div class="empty">Нет данных по выбранным фильтрам</div>';
  return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function metrics(items) {
  $('#summary').innerHTML = items
    .map(([label, value]) => `<div class="card metric"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');
}

function isoDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setDefaultDates() {
  if ($('#dateFrom').value && $('#dateTo').value) return;

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  state.from = isoDateLocal(first);
  state.to = isoDateLocal(last);
  $('#dateFrom').value = state.from;
  $('#dateTo').value = state.to;
}

async function apiStoreBalance() {
  const endpoint = cfg.storeBalanceEndpoint || '/api/store-balance';
  const res = await fetch(`${cfg.workerUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  const responseText = await res.text();
  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`Worker вернул не JSON (HTTP ${res.status})`);
  }

  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }

  return payload;
}

function transformStoreBalance(payload) {
  const stores = (payload.storages || []).
    filter((s) => !s.deleted).
    map((s) => ({
      id: s.id,
      name: s.name || 'Без названия'
    }));

  const productMap = new Map();
  const balances = [];

  for (const storage of payload.storages || []) {
    if (storage.deleted) continue;

    for (const p of storage.products || []) {
      if (!p.id || p.deleted) continue;

      if (!productMap.has(p.id)) {
        productMap.set(p.id, {
          id: p.id,
          name: p.name || '',
          sku: p.code || p.num || '',
          code: p.code || '',
          num: p.num || '',
          unit: p.unit || '',
          category: p.category || '',
          productType: p.productType || '',
          deleted: Boolean(p.deleted)
        });
      }

      balances.push({
        productId: p.id,
        storeId: storage.id,
        quantity: Number(p.quantity || 0),
        amount: Number(p.amount || 0),
        cost: Number(p.costPrice || 0),
        consumptionForecast: Number(p.consumptionForecast || 0),
        suggestedQty: Number(p.suggestedQty || 0)
      });
    }
  }

  return {
    stores,
    products: Array.from(productMap.values()),
    balances,
    documents: [],
    inventories: [],
    dishes: [],
    movements: [],
    meta: {
      source: 'iikoWeb store-balance',
      storageCount: payload.storageCount ?? stores.length,
      version: payload.version || ''
    }
  };
}

async function loadAll() {
  if (state.loading) return;
  state.loading = true;
  $('#refreshBtn').disabled = true;
  $('#connectionStatus').textContent = 'Загрузка данных…';
  $('#content').innerHTML = '<div class="loading">Получаем данные из iikoWeb…</div>';
  $('#summary').innerHTML = '';

  try {
    if (cfg.demoMode) {
      state.data = structuredClone(demoData);
    } else {
      if (!state.from || !state.to) setDefaultDates();
      const raw = await apiStoreBalance();
      state.data = transformStoreBalance(raw);
    }

    fillStores();
    render();

    $('#connectionStatus').textContent = cfg.demoMode
      ? 'Демо-данные'
      : `iikoWeb · обновлено ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (e) {
    console.error(e);
    $('#connectionStatus').textContent = 'Ошибка подключения';
    $('#summary').innerHTML = '';
    $('#content').innerHTML = `<div class="empty"><b>Не удалось получить данные из iikoWeb</b><br><br>${escapeHtml(e.message)}</div>`;
    toast(e.message);
  } finally {
    state.loading = false;
    $('#refreshBtn').disabled = false;
  }
}

function fillStores() {
  const select = $('#storeFilter');
  const previous = select.value;
  const stores = state.data?.stores || [];
  select.innerHTML = '<option value="">Все склады</option>' + stores
    .map((s) => `<option value="${esc(s.id)}">${escapeHtml(s.name)}</option>`)
    .join('');

  if (stores.some((s) => String(s.id) === String(previous))) {
    select.value = previous;
  } else {
    select.value = '';
    state.storeId = '';
  }
}

function render() {
  if (!state.data) return;

  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === state.tab);
  });

  if (!cfg.demoMode && state.tab !== 'balances') {
    renderNotConnected();
    return;
  }

  const renders = {
    balances: renderBalances,
    documents: renderDocuments,
    inventories: renderInventories,
    dishes: renderDishes,
    turnover: renderTurnover
  };

  (renders[state.tab] || renderBalances)();
}

function renderNotConnected() {
  const names = {
    documents: 'Документы',
    inventories: 'Инвентаризации',
    dishes: 'Блюда и техкарты',
    turnover: 'ОСВ'
  };

  metrics([
    ['Источник', 'iikoWeb'],
    ['Статус', 'Следующий этап']
  ]);

  $('#content').innerHTML = `
    <div class="empty">
      <b>${escapeHtml(names[state.tab] || 'Раздел')} пока не подключён к реальным данным.</b><br><br>
      Сейчас реально работает раздел <b>«Остатки»</b>. Остальные разделы подключим следующими и не будем подменять их демо-данными.
    </div>`;
}

function renderBalances() {
  const rows = state.data.balances
    .filter((x) => !state.storeId || String(x.storeId) === String(state.storeId))
    .map((x) => ({
      ...x,
      product: state.data.products.find((p) => p.id === x.productId)
    }))
    .filter((x) => matches(
      x.product?.name,
      x.product?.sku,
      x.product?.category,
      nameBy(state.data.stores, x.storeId)
    ));

  const totalAmount = rows.reduce((s, x) => s + Number(x.amount || 0), 0);

  metrics([
    ['Позиций', fmt.format(rows.length)],
    ['Количество', fmt.format(rows.reduce((s, x) => s + Number(x.quantity || 0), 0))],
    ['Стоимость', money.format(totalAmount)],
    ['Отрицательных', fmt.format(rows.filter((x) => x.quantity < 0).length)]
  ]);

  $('#content').innerHTML = `
    <div class="muted" style="padding:0 0 12px 0">
      Реальные текущие остатки iikoWeb. Даты сверху пока не влияют на этот раздел.
    </div>
    ${table(
      ['Товар', 'Код', 'Категория', 'Склад', 'Остаток', 'Ед.', 'Себестоимость', 'Сумма'],
      rows.map((x) => `<tr>
        <td>${escapeHtml(x.product?.name || x.productId)}</td>
        <td>${escapeHtml(x.product?.sku || '—')}</td>
        <td>${escapeHtml(x.product?.category || '—')}</td>
        <td>${escapeHtml(nameBy(state.data.stores, x.storeId))}</td>
        <td class="${x.quantity < 0 ? 'negative' : ''}">${fmt.format(x.quantity)}</td>
        <td>${escapeHtml(x.product?.unit || '')}</td>
        <td>${x.quantity !== 0 ? money.format(x.cost || 0) : '—'}</td>
        <td class="${x.amount < 0 ? 'negative' : ''}">${money.format(x.amount || 0)}</td>
      </tr>`)
    )}`;
}

// Ниже остаются demo-renderers. В live-режиме они не вызываются,
// пока соответствующие iikoWeb endpoints не будут подключены.
function renderDocuments() {
  const rows = state.data.documents.filter((x) =>
    (!state.storeId || x.storeId === state.storeId) &&
    inPeriod(x.date) &&
    matches(x.type, x.number, nameBy(state.data.stores, x.storeId))
  );
  metrics([
    ['Документов', rows.length],
    ['Общая сумма', money.format(rows.reduce((s, x) => s + Number(x.amount || 0), 0))]
  ]);
  $('#content').innerHTML = table(
    ['Дата', 'Тип', 'Номер', 'Склад', 'Сумма'],
    rows.map((x) => `<tr><td>${escapeHtml(x.date)}</td><td>${escapeHtml(x.type)}</td><td>${escapeHtml(x.number)}</td><td>${escapeHtml(nameBy(state.data.stores, x.storeId))}</td><td>${money.format(x.amount || 0)}</td></tr>`)
  );
}

function renderInventories() {
  const rows = state.data.inventories.filter((x) =>
    (!state.storeId || x.storeId === state.storeId) &&
    inPeriod(x.date) &&
    matches(x.status, nameBy(state.data.stores, x.storeId))
  );
  metrics([['Инвентаризаций', rows.length]]);
  $('#content').innerHTML = table(
    ['Дата', 'Склад', 'Статус', 'Позиций'],
    rows.map((x) => `<tr><td>${escapeHtml(x.date)}</td><td>${escapeHtml(nameBy(state.data.stores, x.storeId))}</td><td>${escapeHtml(x.status)}</td><td>${x.items?.length || 0}</td></tr>`)
  );
}

function renderDishes() {
  const rows = state.data.dishes.filter((x) => matches(x.name, x.category));
  metrics([['Блюд', rows.length]]);
  $('#content').innerHTML = table(
    ['Блюдо', 'Категория', 'Порция', 'Себестоимость'],
    rows.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.portion)}</td><td>${money.format(x.cost || 0)}</td></tr>`)
  );
}

function renderTurnover() {
  metrics([['Строк ОСВ', 0]]);
  $('#content').innerHTML = '<div class="empty">ОСВ пока не подключена к реальным данным iikoWeb.</div>';
}

document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => {
    state.tab = b.dataset.tab;
    render();
  };
});

$('#refreshBtn').onclick = () => loadAll();

$('#storeFilter').onchange = (e) => {
  state.storeId = e.target.value;
  render();
};

$('#searchInput').oninput = (e) => {
  state.query = e.target.value;
  render();
};

$('#dateFrom').onchange = async (e) => {
  state.from = e.target.value;
  render();
};

$('#dateTo').onchange = async (e) => {
  state.to = e.target.value;
  render();
};

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

setDefaultDates();
loadAll();
