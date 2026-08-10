const cfg = window.APP_CONFIG || {};

const LOCAL_CACHE_KEY = 'iiko-miniapp:store-balance:v2';
const LOCAL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
  pageSize: 30,
  lastUpdatedAt: null,
  documents: [],
  documentsLoading: false,
  documentDetail: null,
  documentDetailLoading: false,
  documentTypeFilter: 'all'
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

async function apiStoreBalance({ forceRefresh = false } = {}) {
  const endpoint = cfg.storeBalanceEndpoint || '/api/store-balance';
  const suffix = forceRefresh
    ? `${endpoint.includes('?') ? '&' : '?'}refresh=1&_=${Date.now()}`
    : endpoint;

  const response = await fetch(`${cfg.workerUrl}${suffix}`, {
    method: 'GET',
    cache: 'no-store',
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

function saveLocalCache(raw) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      raw
    }));
  } catch (error) {
    console.warn('LOCAL CACHE: save failed', error);
  }
}

function readLocalCache() {
  try {
    const value = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!value) return null;

    const parsed = JSON.parse(value);
    if (!parsed?.raw || !parsed?.savedAt) return null;

    if (Date.now() - parsed.savedAt > LOCAL_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(LOCAL_CACHE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('LOCAL CACHE: read failed', error);
    return null;
  }
}

function formatUpdatedTime(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function applyRawData(raw, { local = false } = {}) {
  state.data = transformStoreBalance(raw);
  state.lastUpdatedAt = raw.updatedAt || new Date().toISOString();

  fillStores();
  render();

  if (local) {
    $('#connectionStatus').textContent =
      `Сохранённые данные · ${formatUpdatedTime(state.lastUpdatedAt)} · обновляем…`;
  } else {
    const cacheLabel = raw.cached ? 'кэш' : 'iikoWeb';
    $('#connectionStatus').textContent =
      `${cacheLabel} · обновлено ${formatUpdatedTime(state.lastUpdatedAt)}`;
  }
}


async function apiDocuments({ forceRefresh = false } = {}) {
  const params = new URLSearchParams({
    dateFrom: state.from,
    dateTo: state.to
  });

  if (forceRefresh) params.set('refresh', '1');

  const response = await fetch(
    `${cfg.workerUrl}/api/documents?${params.toString()}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function apiDocumentDetail(documentId, type) {
  const response = await fetch(
    `${cfg.workerUrl}/api/document/${encodeURIComponent(documentId)}?type=${encodeURIComponent(type)}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

function ruDocumentType(doc) {
  const map = {
    WRITEOFF_DOCUMENT: 'Списание',
    SALES_DOCUMENT: 'Продажа',
    INCOMING_INVOICE: 'Приходная накладная',
    OUTGOING_INVOICE: 'Расходная накладная',
    INTERNAL_TRANSFER: 'Перемещение',
    RETURN_INVOICE: 'Возврат',
    INVENTORY_DOCUMENT: 'Инвентаризация'
  };

  return map[doc?.type] || doc?.typeName || doc?.type || 'Документ';
}

function ruDocumentStatus(doc) {
  const map = {
    PROCESSED: 'Проведён',
    NEW: 'Новый',
    DELETED: 'Удалён',
    CANCELLED: 'Отменён'
  };

  return map[doc?.status] || doc?.statusName || doc?.status || '';
}

function formatDocumentDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ru-RU', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }
  );
}

function documentStorageLabel(doc) {
  if (doc.storage) return storeName(doc.storage);

  const from = doc.storageFrom ? storeName(doc.storageFrom) : '';
  const to = doc.storageTo ? storeName(doc.storageTo) : '';

  if (from && to) return `${from} → ${to}`;
  return from || to || '—';
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

async function loadAll({ forceRefresh = false, keepVisible = false } = {}) {
  if (state.loading) return;

  state.loading = true;
  $('#refreshBtn').disabled = true;

  if (!keepVisible || !state.data) {
    $('#connectionStatus').textContent = 'Загрузка данных…';
    $('#summary').innerHTML = '';
    $('#content').innerHTML = '<div class="loading">Получаем данные из iikoWeb…</div>';
  } else {
    $('#connectionStatus').textContent = 'Обновляем данные…';
  }

  try {
    const raw = await apiStoreBalance({ forceRefresh });

    saveLocalCache(raw);
    applyRawData(raw);

    if (forceRefresh) {
      toast('Данные обновлены');
    }
  } catch (error) {
    console.error(error);

    if (state.data) {
      $('#connectionStatus').textContent =
        `Сохранённые данные · ${formatUpdatedTime(state.lastUpdatedAt)}`;
      toast(`Не удалось обновить: ${error.message}`);
    } else {
      $('#connectionStatus').textContent = 'Ошибка подключения';
      $('#summary').innerHTML = '';
      $('#content').innerHTML = `
        <div class="empty-state">
          <strong>Не удалось получить данные из iikoWeb</strong>
          ${escapeHtml(error.message)}
        </div>
      `;
      toast(error.message);
    }
  } finally {
    state.loading = false;
    $('#refreshBtn').disabled = false;
  }
}

function startFastLoad() {
  const cached = readLocalCache();

  if (cached?.raw) {
    try {
      applyRawData(cached.raw, { local: true });

      // Показываем сохранённые остатки сразу, свежие подтягиваем в фоне.
      loadAll({ forceRefresh: false, keepVisible: true });
      return;
    } catch (error) {
      console.warn('LOCAL CACHE: invalid data', error);
      try {
        localStorage.removeItem(LOCAL_CACHE_KEY);
      } catch {}
    }
  }

  loadAll();
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


async function loadDocuments({ forceRefresh = false } = {}) {
  if (state.documentsLoading) return;

  state.documentsLoading = true;
  $('#content').innerHTML = '<div class="loading">Получаем документы из iikoWeb…</div>';

  try {
    const payload = await apiDocuments({ forceRefresh });
    state.documents = payload.documents || [];
    renderDocuments();
  } catch (error) {
    console.error(error);
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Не удалось загрузить документы</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
    toast(error.message);
  } finally {
    state.documentsLoading = false;
  }
}

function filteredDocuments() {
  let docs = state.documents.filter((doc) => matches(
    doc.documentNumber,
    ruDocumentType(doc),
    ruDocumentStatus(doc),
    doc.comment,
    documentStorageLabel(doc)
  ));

  if (state.documentTypeFilter !== 'all') {
    docs = docs.filter((doc) => doc.type === state.documentTypeFilter);
  }

  if (state.storeId) {
    docs = docs.filter((doc) =>
      [doc.storage, doc.storageFrom, doc.storageTo]
        .some((id) => String(id || '') === String(state.storeId))
    );
  }

  return docs.sort((a, b) =>
    String(b.dateIncoming || '').localeCompare(String(a.dateIncoming || ''))
  );
}

function renderDocuments() {
  $('#balanceControls').hidden = false;
  $('#periodControls').hidden = false;

  const docs = filteredDocuments();
  const total = docs.reduce((sum, doc) => sum + Number(doc.sum || 0), 0);
  const posted = docs.filter((doc) => doc.status === 'PROCESSED').length;
  const types = new Set(docs.map((doc) => doc.type).filter(Boolean)).size;

  metrics([
    ['Документов', fmt.format(docs.length)],
    ['Проведено', fmt.format(posted)],
    ['Типов', fmt.format(types)],
    ['Сумма', money.format(total)]
  ]);

  const typeOptions = [
    ['all', 'Все'],
    ['WRITEOFF_DOCUMENT', 'Списания'],
    ['SALES_DOCUMENT', 'Продажи'],
    ['INCOMING_INVOICE', 'Приход'],
    ['OUTGOING_INVOICE', 'Расход'],
    ['INTERNAL_TRANSFER', 'Перемещения']
  ];

  if (!docs.length) {
    $('#content').innerHTML = `
      <div class="document-toolbar">
        <div class="filter-chips">
          ${typeOptions.map(([value, label]) => `
            <button class="filter-chip ${state.documentTypeFilter === value ? 'active' : ''}"
              type="button" data-doc-filter="${escapeHtml(value)}">${escapeHtml(label)}</button>
          `).join('')}
        </div>
      </div>
      <div class="empty-state">
        <strong>Документы не найдены</strong>
        Попробуйте изменить период, склад, поиск или тип документа.
      </div>
    `;
    bindDocumentFilters();
    return;
  }

  $('#content').innerHTML = `
    <div class="document-toolbar">
      <div class="filter-chips">
        ${typeOptions.map(([value, label]) => `
          <button class="filter-chip ${state.documentTypeFilter === value ? 'active' : ''}"
            type="button" data-doc-filter="${escapeHtml(value)}">${escapeHtml(label)}</button>
        `).join('')}
      </div>
    </div>

    <div class="documents-list">
      ${docs.map((doc) => `
        <button class="document-row" type="button"
          data-document-id="${escAttr(doc.id)}"
          data-document-type="${escAttr(doc.type)}">
          <div class="document-row__main">
            <div class="document-row__title">
              ${escapeHtml(ruDocumentType(doc))}
              <span>№${escapeHtml(doc.documentNumber || '—')}</span>
            </div>
            <div class="document-row__meta">
              ${escapeHtml(formatDocumentDate(doc.dateIncoming))}
              · ${escapeHtml(documentStorageLabel(doc))}
            </div>
            ${doc.comment ? `<div class="document-row__comment">${escapeHtml(doc.comment)}</div>` : ''}
          </div>

          <div class="document-row__right">
            <strong>${money.format(doc.sum || 0)}</strong>
            <span class="status-badge">${escapeHtml(ruDocumentStatus(doc))}</span>
            <span class="document-row__arrow">›</span>
          </div>
        </button>
      `).join('')}
    </div>
  `;

  bindDocumentFilters();

  $$('.document-row').forEach((button) => {
    button.addEventListener('click', () => {
      openDocument(button.dataset.documentId, button.dataset.documentType);
    });
  });
}

function bindDocumentFilters() {
  $$('[data-doc-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.documentTypeFilter = button.dataset.docFilter;
      renderDocuments();
    });
  });
}

async function openDocument(documentId, type) {
  state.documentDetailLoading = true;
  $('#content').innerHTML = '<div class="loading">Открываем документ…</div>';

  try {
    const payload = await apiDocumentDetail(documentId, type);
    state.documentDetail = payload.document;
    renderDocumentDetail();
  } catch (error) {
    console.error(error);
    toast(error.message);
    renderDocuments();
  } finally {
    state.documentDetailLoading = false;
  }
}

function renderDocumentDetail() {
  const doc = state.documentDetail;
  if (!doc) {
    renderDocuments();
    return;
  }

  $('#summary').innerHTML = '';

  $('#content').innerHTML = `
    <div class="document-detail">
      <div class="document-detail__top">
        <button id="backToDocumentsBtn" class="back-button" type="button">← Назад</button>
        <span class="status-badge">${escapeHtml(ruDocumentStatus(doc))}</span>
      </div>

      <div class="document-detail__header">
        <div>
          <div class="document-detail__type">${escapeHtml(ruDocumentType(doc))}</div>
          <h2>№${escapeHtml(doc.documentNumber || '—')}</h2>
          <p>${escapeHtml(formatDocumentDate(doc.dateIncoming))}</p>
        </div>
        <strong class="document-detail__sum">${money.format(doc.sum || 0)}</strong>
      </div>

      <div class="document-detail__info">
        <div><span>Склад</span><strong>${escapeHtml(documentStorageLabel(doc))}</strong></div>
        ${doc.comment ? `<div class="document-detail__comment"><span>Комментарий</span><strong>${escapeHtml(doc.comment)}</strong></div>` : ''}
      </div>

      <div class="document-items-title">Позиции · ${fmt.format(doc.items?.length || 0)}</div>

      <div class="document-items">
        ${(doc.items || []).map((item) => `
          <div class="document-item">
            <div class="document-item__name">
              <strong>${escapeHtml(item.name || item.productId || 'Позиция')}</strong>
              <span>${escapeHtml(item.code || '')}${item.type ? ` · ${escapeHtml(item.type)}` : ''}</span>
            </div>
            <div class="document-item__qty">
              <strong>${fmt.format(item.amount)}</strong>
              <span>${escapeHtml(item.unitName || '')}</span>
            </div>
            <div class="document-item__cost">
              <strong>${money.format(item.costPrice || 0)}</strong>
              <span>себестоимость</span>
            </div>
            <div class="document-item__sum">
              ${money.format((item.amount || 0) * (item.costPrice || 0))}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  $('#backToDocumentsBtn').addEventListener('click', () => {
    state.documentDetail = null;
    renderDocuments();
  });
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
  } else if (state.tab === 'documents') {
    if (state.documents.length) {
      renderDocuments();
    } else if (!state.documentsLoading) {
      loadDocuments();
    }
  } else {
    renderNotConnected();
  }
}

function setTab(tab) {
  state.tab = tab;
  state.page = 1;
  state.documentDetail = null;
  closeMenu();
  render();
}

$('#menuBtn').addEventListener('click', openMenu);
$('#closeMenuBtn').addEventListener('click', closeMenu);
$('#menuBackdrop').addEventListener('click', closeMenu);

$$('.menu-item').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
});

$('#refreshBtn').addEventListener('click', () => {
  if (state.tab === 'documents') {
    state.documents = [];
    loadDocuments({ forceRefresh: true });
  } else {
    loadAll({ forceRefresh: true, keepVisible: true });
  }
});

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
  if (state.tab === 'documents') {
    state.documents = [];
    loadDocuments();
  } else {
    render();
  }
});

$('#dateTo').addEventListener('change', (event) => {
  state.to = event.target.value;
  if (state.tab === 'documents') {
    state.documents = [];
    loadDocuments();
  } else {
    render();
  }
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
startFastLoad();
