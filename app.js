const cfg = window.APP_CONFIG || {};

const state = {
  tab: 'balances',
  data: null,
  query: '',
  storeId: '',
  balanceFilter: 'all',
  from: '',
  to: '',
  loading: false,
  page: 1,
  pageSize: 30
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const fmt = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3
});

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2
});

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function escAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 3500);
}

function isoDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setDefaultDates() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  state.from = isoDateLocal(first);
  state.to = isoDateLocal(last);

  $('#dateFrom').value = state.from;
  $('#dateTo').value = state.to;
}

function matches(...values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;

  return values.some((value) =>
    String(value ?? '').toLowerCase().includes(query)
  );
}

function storeName(id) {
  return state.data?.stores?.find((store) =>
    String(store.id) === String(id)
  )?.name || '—';
}

function inPeriod(date) {
  return (!state.from || date >= state.from) &&
    (!state.to || date <= state.to);
}

function openMenu() {
  $('#sideMenu').classList.add('open');
  $('#sideMenu').setAttribute('aria-hidden', 'false');
  $('#menuBackdrop').hidden = false;
  $('#menuBtn').setAttribute('aria-expanded', 'true');
}

function closeMenu() {
  $('#sideMenu').classList.remove('open');
  $('#sideMenu').setAttribute('aria-hidden', 'true');
  $('#menuBackdrop').hidden = true;
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}

function updateMenu() {
  $$('.menu-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
  });
}

function metrics(items) {
  $('#summary').innerHTML = items.map(([label, value]) => `
    <article class="metric-card">
      <span class="metric-card__label">${escapeHtml(label)}</span>
      <strong class="metric-card__value">${escapeHtml(value)}</strong>
    </article>
  `).join('');
}

async function apiStoreBalance() {
  const endpoint = cfg.storeBalanceEndpoint || '/api/store-balance';

  const response = await fetch(`${cfg.workerUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Worker вернул не JSON (HTTP ${response.status})`);
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function transformStoreBalance(payload) {
  const storages = (payload.storages || []).filter((storage) => !storage.deleted);

  const stores = storages.map((storage) => ({
    id: storage.id,
    name: storage.name || 'Без названия'
  }));

  const products = new Map();
  const balances = [];

  for (const storage of storages) {
    for (const item of storage.products || []) {
      if (!item.id || item.deleted) continue;

      if (!products.has(item.id)) {
        products.set(item.id, {
          id: item.id,
          name: item.name || '',
          sku: item.code || item.num || '',
          code: item.code || '',
          num: item.num || '',
          unit: item.unit || '',
          category: item.category || '',
          productType: item.productType || ''
        });
      }

      balances.push({
        productId: item.id,
        storeId: storage.id,
        quantity: Number(item.quantity ?? item.amount ?? 0),
        amount: Number(item.amount ?? 0),
        cost: Number(item.costPrice ?? 0),
        consumptionForecast: Number(item.consumptionForecast ?? 0),
        suggestedQty: Number(item.suggestedQty ?? 0)
      });
    }
  }

  return {
    stores,
    products: [...products.values()],
    balances,
    documents: [],
    inventories: [],
    dishes: [],
    movements: []
  };
}

async function loadAll() {
  if (state.loading) return;

  state.loading = true;
  $('#refreshBtn').disabled = true;
  $('#connectionStatus').textContent = 'Загрузка данных…';
  $('#summary').innerHTML = '';
  $('#content').innerHTML = '<div class="loading">Получаем данные из iikoWeb…</div>';

  try {
    const raw = await apiStoreBalance();
    state.data = transformStoreBalance(raw);
    fillStores();
    render();

    $('#connectionStatus').textContent =
      `iikoWeb · обновлено ${new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })}`;
  } catch (error) {
    console.error(error);
    $('#connectionStatus').textContent = 'Ошибка подключения';
    $('#summary').innerHTML = '';
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Не удалось получить данные из iikoWeb</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
    toast(error.message);
  } finally {
    state.loading = false;
    $('#refreshBtn').disabled = false;
  }
}

function fillStores() {
  const select = $('#storeFilter');
  const previous = state.storeId;

  select.innerHTML =
    '<option value="">Все склады</option>' +
    (state.data?.stores || []).map((store) =>
      `<option value="${escAttr(store.id)}">${escapeHtml(store.name)}</option>`
    ).join('');

  if ((state.data?.stores || []).some((store) =>
    String(store.id) === String(previous)
  )) {
    select.value = previous;
  } else {
    state.storeId = '';
    select.value = '';
  }
}

function getBalanceRows() {
  const productById = new Map(
    (state.data?.products || []).map((product) => [product.id, product])
  );

  let rows = (state.data?.balances || [])
    .filter((row) => !state.storeId ||
      String(row.storeId) === String(state.storeId))
    .map((row) => ({
      ...row,
      product: productById.get(row.productId)
    }))
    .filter((row) => matches(
      row.product?.name,
      row.product?.sku,
      row.product?.code,
      row.product?.num,
      row.product?.category,
      storeName(row.storeId)
    ));

  if (state.balanceFilter === 'stock') {
    rows = rows.filter((row) => row.quantity !== 0);
  }

  if (state.balanceFilter === 'negative') {
    rows = rows.filter((row) => row.quantity < 0);
  }

  return rows.sort((a, b) => {
    if (a.quantity < 0 && b.quantity >= 0) return -1;
    if (b.quantity < 0 && a.quantity >= 0) return 1;
    return String(a.product?.name || '').localeCompare(
      String(b.product?.name || ''),
      'ru'
    );
  });
}

function renderBalances() {
  $('#balanceControls').hidden = false;
  $('#periodControls').hidden = true;

  const rows = getBalanceRows();

  const totalValue = rows.reduce((sum, row) =>
    sum + Number(row.amount || 0), 0);

  const withStock = rows.filter((row) => row.quantity !== 0).length;

  metrics([
    ['Складов', fmt.format(state.storeId ? 1 : state.data.stores.length)],
    ['Позиций', fmt.format(rows.length)],
    ['С остатком', fmt.format(withStock)],
    ['Стоимость', money.format(totalValue)]
  ]);

  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);

  const start = (state.page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);

  if (!pageRows.length) {
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Ничего не найдено</strong>
        Попробуйте изменить склад, поиск или фильтр.
      </div>
    `;
    return;
  }

  $('#content').innerHTML = `
    <div class="balance-head">
      <div>Товар / код / категория</div>
      <div>Склад</div>
      <div>Остаток</div>
      <div>Себестоимость</div>
      <div>Сумма</div>
    </div>

    <div class="balance-list">
      ${pageRows.map(renderBalanceRow).join('')}
    </div>

    <div class="pagination">
      <div class="pagination__info">
        ${fmt.format(start + 1)}–${fmt.format(Math.min(start + state.pageSize, rows.length))}
        из ${fmt.format(rows.length)}
      </div>

      <div class="pagination__buttons">
        <button id="prevPageBtn" class="page-button" type="button" ${state.page <= 1 ? 'disabled' : ''}>
          ←
        </button>
        <button id="nextPageBtn" class="page-button" type="button" ${state.page >= pageCount ? 'disabled' : ''}>
          →
        </button>
      </div>
    </div>
  `;

  $('#prevPageBtn')?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      renderBalances();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  $('#nextPageBtn')?.addEventListener('click', () => {
    if (state.page < pageCount) {
      state.page += 1;
      renderBalances();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

function renderBalanceRow(row) {
  const product = row.product || {};
  const isNegative = row.quantity < 0;

  return `
    <article class="balance-row ${isNegative ? 'row-negative' : ''}">
      <div class="product-cell">
        <div class="product-name ${isNegative ? 'negative' : ''}">
          ${escapeHtml(product.name || row.productId)}
        </div>
        <div class="product-meta">
          <span>${escapeHtml(product.sku || 'Без кода')}</span>
          ${product.category ? `<span>• ${escapeHtml(product.category)}</span>` : ''}
        </div>
      </div>

      <div class="cell-store">
        <span class="store-badge">${escapeHtml(storeName(row.storeId))}</span>
      </div>

      <div class="value-cell cell-qty">
        <div class="value-primary ${isNegative ? 'negative' : ''}">
          ${fmt.format(row.quantity)}
        </div>
        <div class="value-secondary">${escapeHtml(product.unit || '')}</div>
      </div>

      <div class="value-cell cell-cost">
        <div class="value-primary">${money.format(row.cost || 0)}</div>
        <div class="value-secondary">за ед.</div>
      </div>

      <div class="value-cell cell-sum">
        <div class="value-primary ${row.amount < 0 ? 'negative' : ''}">
          ${money.format(row.amount || 0)}
        </div>
        <div class="value-secondary">сумма</div>
      </div>
    </article>
  `;
}

function renderNotConnected() {
  $('#balanceControls').hidden = true;
  $('#periodControls').hidden = false;

  const labels = {
    documents: 'Документы',
    inventories: 'Инвентаризации',
    dishes: 'Блюда',
    turnover: 'ОСВ'
  };

  metrics([
    ['Источник', 'iikoWeb'],
    ['Статус', 'Следующий этап']
  ]);

  $('#content').innerHTML = `
    <div class="empty-state">
      <strong>${escapeHtml(labels[state.tab] || 'Раздел')}</strong>
      Этот раздел пока не подключён к реальным данным. Сейчас полностью работает
      «Остатки», а этот раздел подключим следующим этапом.
    </div>
  `;
}

function render() {
  if (!state.data) return;

  updateMenu();

  if (state.tab === 'balances') {
    renderBalances();
  } else {
    renderNotConnected();
  }
}

function setTab(tab) {
  state.tab = tab;
  state.page = 1;
  closeMenu();
  render();
}

$('#menuBtn').addEventListener('click', openMenu);
$('#closeMenuBtn').addEventListener('click', closeMenu);
$('#menuBackdrop').addEventListener('click', closeMenu);

$$('.menu-item').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
});

$('#refreshBtn').addEventListener('click', loadAll);

$('#storeFilter').addEventListener('change', (event) => {
  state.storeId = event.target.value;
  state.page = 1;
  render();
});

$('#searchInput').addEventListener('input', (event) => {
  state.query = event.target.value;
  state.page = 1;
  render();
});

$$('[data-balance-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.balanceFilter = button.dataset.balanceFilter;
    state.page = 1;

    $$('[data-balance-filter]').forEach((item) => {
      item.classList.toggle('active', item === button);
    });

    render();
  });
});

$('#dateFrom').addEventListener('change', (event) => {
  state.from = event.target.value;
  render();
});

$('#dateTo').addEventListener('change', (event) => {
  state.to = event.target.value;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();

  if (tg.setHeaderColor) {
    try {
      tg.setHeaderColor('#f5f7fb');
    } catch {}
  }

  if (tg.setBackgroundColor) {
    try {
      tg.setBackgroundColor('#f5f7fb');
    } catch {}
  }
}

setDefaultDates();
loadAll();
