
const AUTH_TOKEN_KEY = 'iiko-office-auth-v59';
const CONNECTION_KEY = 'iiko-office-connection-v59';

const authState = {
  token: localStorage.getItem(AUTH_TOKEN_KEY) || '',
  me: null,
  connectionId: localStorage.getItem(CONNECTION_KEY) || ''
};

function telegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function permissionGranted(permission) {
  const permissions = authState.me?.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}

async function publicApi(path, options = {}) {
  const response = await fetch(`${cfg.workerUrl}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({
    ok: false,
    error: `HTTP ${response.status}`
  }));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', headers.get('Accept') || 'application/json');

  if (authState.token) {
    headers.set('Authorization', `Bearer ${authState.token}`);
  }

  if (authState.connectionId) {
    headers.set('X-Connection-ID', authState.connectionId);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    showAuthGate('Сессия закончилась. Войдите снова.');
  }

  return response;
}

function saveAuth(token, me) {
  authState.token = token || authState.token;
  authState.me = me || authState.me;

  if (authState.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, authState.token);
  }

  const available = authState.me?.connections || [];
  if (!available.some((x) => String(x.id) === String(authState.connectionId))) {
    authState.connectionId = authState.me?.activeConnection?.id || available[0]?.id || '';
  }

  if (authState.connectionId) {
    localStorage.setItem(CONNECTION_KEY, authState.connectionId);
  }
}

function clearAuth() {
  authState.token = '';
  authState.me = null;
  authState.connectionId = '';
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(CONNECTION_KEY);
}

function setAuthError(message = '') {
  const box = $('#authError');
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

function showAuthGate(message = '') {
  document.body.classList.add('auth-pending');
  document.body.classList.remove('authenticated');
  $('#authGate').hidden = false;
  if (message) {
    $('#authHint').textContent = message;
  }
}

function hideAuthGate() {
  document.body.classList.remove('auth-pending');
  document.body.classList.add('authenticated');
  $('#authGate').hidden = true;
}


function isPendingAccess() {
  return authState.me?.role === 'PENDING';
}

function renderPendingAccess() {
  configureMainControls({
    showStore: false,
    showBalanceFilters: false,
    showDates: false
  });

  metrics([]);

  const connection = currentConnection();

  $('#content').innerHTML = `
    <div class="pending-access-card">
      <div class="pending-access-icon">✓</div>
      <h2>Аккаунт iiko привязан</h2>
      <p>
        Telegram ID и логин iiko сохранены для
        <strong>${escapeHtml(connection?.name || 'этого сервера')}</strong>.
      </p>
      <p>
        Владелец должен один раз выбрать вашу роль.
        После этого разделы появятся автоматически.
      </p>
      <div class="pending-access-meta">
        <span>Роль</span>
        <strong>Ожидает подтверждения</strong>
      </div>
    </div>
  `;
}

function applyPermissions() {
  $$('.menu-item[data-permission]').forEach((button) => {
    const allowed = permissionGranted(button.dataset.permission);
    button.hidden = !allowed;
  });

  if (!permissionGranted('stock.view') && state.tab === 'balances') {
    const first = $$('.menu-item[data-permission]').find((x) => !x.hidden);
    if (first) state.tab = first.dataset.tab;
  }

  $('#adminPanel').hidden = !permissionGranted('admin.manage');
}

function currentConnection() {
  return (authState.me?.connections || []).find(
    (x) => String(x.id) === String(authState.connectionId)
  ) || authState.me?.activeConnection || null;
}

function applyConnectionToApp() {
  const connection = currentConnection();
  if (!connection) return;

  const discoveredStores =
    Array.isArray(connection.stores) ? connection.stores : [];

  if (discoveredStores.length) {
    LIVE_STORES = discoveredStores;
  }

  state.data.stores = LIVE_STORES;

  const previous = String(state.storeId || '');
  if (!LIVE_STORES.some((x) => String(x.id) === previous)) {
    state.storeId = LIVE_STORES[0]?.id || '';
  }

  $('#connectionName').textContent = connection.name;
  $('#connectionRole').textContent = connection.roleLabel || connection.role || '';
  $('#connectionStatus').textContent = `${connection.name} · ${connection.roleLabel || ''}`;
  $('#accountName').textContent = authState.me?.user?.name || 'Пользователь';

  fillStores();
  renderConnectionPanel();
  applyPermissions();
}


async function loadOwnerRegistrations() {
  if (!permissionGranted('admin.manage')) return;

  const list = $('#registrationList');
  if (!list) return;

  list.innerHTML = '<div class="panel-loading">Загрузка…</div>';

  try {
    const response = await apiFetch(
      `${cfg.workerUrl}/api/admin/registrations`,
      { method: 'GET' }
    );

    const payload = await response.json();

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const rows = payload.registrations || [];

    if (!rows.length) {
      list.innerHTML = '<div class="panel-empty">Пользователей пока нет</div>';
      return;
    }

    list.innerHTML = rows.map((row) => `
      <div class="registration-item ${row.role === 'PENDING' ? 'pending' : ''}">
        <div class="registration-item__main">
          <strong>${escapeHtml(row.name || row.telegramId)}</strong>
          <span>${escapeHtml(row.connectionName)}</span>
          <small>
            TG: ${escapeHtml(row.telegramId)}
            ${row.iikoLogin ? ` · iiko: ${escapeHtml(row.iikoLogin)}` : ''}
          </small>
        </div>
        <div class="registration-item__actions">
          ${row.role === 'PENDING'
            ? `
              <select
                class="registration-role-select"
                data-registration-role
                data-user-id="${escAttr(row.userId)}"
                data-connection-id="${escAttr(row.connectionId)}"
              >
                <option value="CHEF">Шеф-повар</option>
                <option value="BAR_MANAGER">Бар-менеджер</option>
                <option value="MANAGER">Менеджер</option>
                <option value="MANAGING">Управляющий</option>
              </select>
              <button
                class="auth-secondary registration-approve"
                type="button"
                data-approve-registration
                data-user-id="${escAttr(row.userId)}"
                data-connection-id="${escAttr(row.connectionId)}"
              >Подтвердить</button>
            `
            : `<span class="registration-role-badge">${escapeHtml(row.roleLabel)}</span>`
          }
        </div>
      </div>
    `).join('');

    $$('[data-approve-registration]').forEach((button) => {
      button.addEventListener('click', async () => {
        const userId = button.dataset.userId;
        const connectionId = button.dataset.connectionId;
        const select = $(
          `[data-registration-role][data-user-id="${CSS.escape(userId)}"][data-connection-id="${CSS.escape(connectionId)}"]`
        );

        try {
          const response = await apiFetch(
            `${cfg.workerUrl}/api/admin/registrations/role`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                connectionId,
                role: select.value
              })
            }
          );

          const payload = await response.json();

          if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || `HTTP ${response.status}`);
          }

          toast('Роль назначена');
          await loadOwnerRegistrations();
        } catch (error) {
          toast(error.message);
        }
      });
    });
  } catch (error) {
    list.innerHTML = `<div class="panel-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderConnectionPanel() {
  const list = $('#connectionList');
  if (!list) return;

  const connections = authState.me?.connections || [];
  list.innerHTML = connections.map((connection) => `
    <button
      type="button"
      class="connection-item ${String(connection.id) === String(authState.connectionId) ? 'active' : ''}"
      data-connection-id="${escAttr(connection.id)}"
    >
      <span>
        <strong>${escapeHtml(connection.name)}</strong>
        <small>${escapeHtml(connection.roleLabel || connection.role || '')}</small>
      </span>
      <b>${String(connection.id) === String(authState.connectionId) ? '✓' : ''}</b>
    </button>
  `).join('');

  $$('[data-connection-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      authState.connectionId = button.dataset.connectionId;
      localStorage.setItem(CONNECTION_KEY, authState.connectionId);

      const mePayload = await publicApi('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${authState.token}`,
          'X-Connection-ID': authState.connectionId
        }
      });

      saveAuth('', mePayload.me);
      resetConnectionData();
      applyConnectionToApp();
      closeConnectionPanel();
      startFastLoad();
    });
  });

  const select = $('#newUserConnection');
  if (select) {
    select.innerHTML = connections.map((connection) =>
      `<option value="${escAttr(connection.id)}">${escapeHtml(connection.name)}</option>`
    ).join('');
  }

  if (permissionGranted('admin.manage')) {
    loadOwnerRegistrations();
  }
}

function resetConnectionData() {
  state.liveStockItems = [];
  state.liveStockTotal = 0;
  state.liveStockLoaded = false;
  state.dishes = [];
  state.dishDetail = null;
  state.turnoverRows = [];
  state.documents = [];
  state.page = 1;
}

function openConnectionPanel() {
  $('#connectionPanel').classList.add('open');
  $('#connectionPanel').setAttribute('aria-hidden', 'false');
  $('#connectionPanelBackdrop').hidden = false;
}

function closeConnectionPanel() {
  $('#connectionPanel').classList.remove('open');
  $('#connectionPanel').setAttribute('aria-hidden', 'true');
  $('#connectionPanelBackdrop').hidden = true;
}

async function loginWithExistingSession() {
  if (!authState.token) return false;

  try {
    const payload = await publicApi('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${authState.token}`,
        ...(authState.connectionId ? { 'X-Connection-ID': authState.connectionId } : {})
      }
    });
    saveAuth('', payload.me);
    return true;
  } catch {
    clearAuth();
    return false;
  }
}


async function loadPublicConnections() {
  const payload = await publicApi('/api/auth/connections');
  const select = $('#loginConnection');

  if (!select) return payload.connections || [];

  const rows = payload.connections || [];

  select.innerHTML = rows.map((connection) => `
    <option value="${escAttr(connection.id)}">
      ${escapeHtml(connection.name)}
    </option>
  `).join('');

  return rows;
}

async function iikoLogin() {
  const payload = await publicApi('/api/auth/iiko', {
    method: 'POST',
    body: JSON.stringify({
      connectionId: $('#loginConnection').value,
      login: $('#loginIikoLogin').value,
      password: $('#loginIikoPassword').value,
      initData: telegramInitData()
    })
  });

  $('#loginIikoPassword').value = '';
  saveAuth(payload.token, payload.me);
}

async function telegramLogin() {
  const initData = telegramInitData();
  if (!initData) {
    throw new Error('Откройте приложение из Telegram-бота.');
  }

  const payload = await publicApi('/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData })
  });

  saveAuth(payload.token, payload.me);
}

async function initializeAuth() {
  showAuthGate();
  setAuthError('');

  if (await loginWithExistingSession()) {
    return true;
  }

  const status = await publicApi('/api/auth/status');

  if (!status.configured) {
    $('#authTitle').textContent = 'Первое подключение';
    $('#authHint').textContent =
      'Владелец подключает первый iikoServer один раз.';
    $('#firstSetupForm').hidden = false;
    $('#loginChoiceBox').hidden = true;
    $('#ownerClaimBox').hidden = true;
    return false;
  }

  $('#firstSetupForm').hidden = true;
  $('#loginChoiceBox').hidden = false;
  $('#ownerClaimBox').hidden = true;

  $('#authTitle').textContent = 'Вход';
  $('#authHint').textContent =
    'Войдите аккаунтом iiko. Если вы новый пользователь и открыли Mini App в Telegram, ваш Telegram ID привяжется автоматически. Либо войдите через Telegram, если привязка уже есть.';

  await loadPublicConnections();

  // Inside Telegram try the mapped Telegram account automatically.
  if (telegramInitData()) {
    try {
      await telegramLogin();
      return true;
    } catch (error) {
      $('#authHint').textContent =
        `${error.message} Можно войти аккаунтом iiko ниже.`;
      // One-time owner claim stays hidden from normal users.
      if (/доступ|выдан/i.test(error.message)) {
        $('#ownerClaimBox').hidden = false;
      }
    }
  }

  return false;
}

async function finishAuthorizedStartup() {
  hideAuthGate();
  applyConnectionToApp();
  setDefaultDates();

  if (isPendingAccess()) {
    renderPendingAccess();
    return;
  }

  startFastLoad();
}


const cfg = window.APP_CONFIG || {};

let LIVE_STORES = [
  { id: '4ba256dc-ac44-4df2-9e92-3746549c5b4b', name: 'Бар Сургут' },
  { id: '73a57aee-1b68-4a18-bc7c-a308d61c92c2', name: 'Кухня Сургут' },
  { id: 'c8d5ad09-4cf9-4f8c-9273-fd4b25b40446', name: 'Хоз.склад Сургут' },
  { id: '6f84bcad-19e0-40ef-82b6-7ce463d64fe5', name: 'Сыроварня Сургут' },
  { id: '8901986b-b0c5-4ac5-becd-9c746e90dd21', name: 'Бар Лиличка NEW' },
  { id: '3378ac9f-e453-42dc-b930-9293d7030fce', name: 'Кухня Лиличка NEW' },
  { id: '5554ba08-e6cb-4f43-b394-9b23eaec3b5a', name: 'Хозы Лиличка NEW' }
];


const state = {
  tab: 'balances',
  data: {
    stores: LIVE_STORES,
    products: [],
    balances: [],
    documents: [],
    inventories: [],
    dishes: [],
    movements: []
  },
  query: '',
  storeId: LIVE_STORES[0].id,
  liveStockItems: [],
  liveStockTotal: 0,
  liveStockLoading: false,
  liveStockLoaded: false,
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
  documentTypeFilter: 'all',
  dishes: [],
  dishesLoading: false,
  dishTypeFilter: 'all',
  dishDetail: null,
  dishesSource: '',
  turnoverRows: [],
  turnoverLoading: false,
  turnoverMode: 'both'
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

async function apiLiveStock({ forceRefresh = false } = {}) {
  const selectedStore = LIVE_STORES.find((store) =>
    String(store.id) === String(state.storeId)
  ) || LIVE_STORES[0];

  const params = new URLSearchParams({
    store: selectedStore.name,
    q: '',
    limit: '5000',
    offset: '0'
  });

  if (forceRefresh) {
    params.set('_', String(Date.now()));
  }

  const response = await apiFetch(
    `${cfg.workerUrl}/api/stock-live?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }
  );

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

const LIVE_STOCK_UI_CACHE_PREFIX = 'iiko-live-stock-ui-v44:';

function liveStockUiCacheKey() {
  return `${LIVE_STOCK_UI_CACHE_PREFIX}${state.storeId}|${state.page}|${state.pageSize}|${state.query.trim().toLocaleLowerCase('ru-RU')}`;
}

function readLiveStockUiCache() {
  try {
    const raw = localStorage.getItem(liveStockUiCacheKey());
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;

    return parsed;
  } catch {
    return null;
  }
}

function saveLiveStockUiCache(payload) {
  try {
    localStorage.setItem(
      liveStockUiCacheKey(),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        items: payload.items || [],
        pagination: payload.pagination || { total: 0 },
        time: payload.time || new Date().toISOString()
      })
    );
  } catch {
    // localStorage may be unavailable in some embedded browsers.
  }
}

function applyLiveStockPayload(payload, { cachedPreview = false } = {}) {
  state.liveStockItems = payload.items || [];
  state.liveStockTotal = Number(payload.pagination?.total || 0);
  state.liveStockLoaded = true;
  state.lastUpdatedAt = payload.time || payload.savedAt || new Date().toISOString();

  if (cachedPreview) {
    $('#connectionStatus').textContent =
      `Сохранённые данные · обновляем…`;
  } else {
    $('#connectionStatus').textContent =
      `iikoOffice ОСВ · 1 запрос на склад · ${formatUpdatedTime(state.lastUpdatedAt)}`;
  }

  renderBalances();
}

async function loadBalances({ forceRefresh = false, keepVisible = false } = {}) {
  if (state.liveStockLoading) return;

  state.liveStockLoading = true;
  $('#refreshBtn').disabled = true;

  let showedCachedPreview = false;

  if (!forceRefresh && (!keepVisible || !state.liveStockLoaded)) {
    const cached = readLiveStockUiCache();

    if (cached) {
      applyLiveStockPayload(cached, { cachedPreview: true });
      showedCachedPreview = true;
    }
  }

  if (!showedCachedPreview) {
    if (!keepVisible || !state.liveStockLoaded) {
      $('#connectionStatus').textContent = 'Загрузка живых остатков…';
      $('#summary').innerHTML = '';
      $('#content').innerHTML =
        '<div class="loading">Получаем всю ведомость склада одним запросом…</div>';
    } else {
      $('#connectionStatus').textContent = 'Обновляем живые остатки…';
    }
  }

  try {
    const payload = await apiLiveStock({ forceRefresh });

    saveLiveStockUiCache(payload);
    applyLiveStockPayload(payload);

    if (forceRefresh) {
      toast('Живые остатки обновлены');
    }
  } catch (error) {
    console.error(error);

    $('#connectionStatus').textContent = 'Ошибка получения живых остатков';

    if (!keepVisible || !state.liveStockLoaded) {
      $('#summary').innerHTML = '';
      $('#content').innerHTML = `
        <div class="empty-state">
          <strong>Не удалось получить живые остатки</strong>
          ${escapeHtml(error.message)}
        </div>
      `;
    }

    toast(error.message);
  } finally {
    state.liveStockLoading = false;
    $('#refreshBtn').disabled = false;
  }
}

function startFastLoad() {
  fillStores();
  loadBalances();
}

function fillStores() {
  const select = $('#storeFilter');
  if (!select) return;

  if (!Array.isArray(LIVE_STORES) || !LIVE_STORES.length) {
    select.innerHTML = '<option value="">Склады не найдены</option>';
    state.storeId = '';
    select.value = '';
    return;
  }

  const previous = state.storeId || LIVE_STORES[0].id;

  select.innerHTML = LIVE_STORES.map((store) =>
    `<option value="${escAttr(store.id)}">${escapeHtml(store.name)}</option>`
  ).join('');

  if (LIVE_STORES.some((store) => String(store.id) === String(previous))) {
    state.storeId = previous;
  } else {
    state.storeId = LIVE_STORES[0].id;
  }

  select.value = state.storeId;
}

function getBalanceRows({ paged = true } = {}) {
  let rows = (state.liveStockItems || []).map((item) => ({
    ...item,
    quantity: Number.isFinite(Number(item.quantity))
      ? Number(item.quantity)
      : null
  }));

  const q = state.query.trim().toLocaleLowerCase('ru-RU');

  if (q) {
    rows = rows.filter((row) =>
      String(row.productName || '').toLocaleLowerCase('ru-RU').includes(q) ||
      String(row.productNum || '').toLocaleLowerCase('ru-RU').includes(q)
    );
  }

  if (state.balanceFilter === 'stock') {
    rows = rows.filter((row) =>
      row.balanceStatus === 'ok' && row.quantity !== 0
    );
  }

  if (state.balanceFilter === 'negative') {
    rows = rows.filter((row) =>
      row.balanceStatus === 'ok' && row.quantity < 0
    );
  }

  state.liveStockTotal = rows.length;

  if (!paged) {
    return rows;
  }

  const start = (state.page - 1) * state.pageSize;
  return rows.slice(start, start + state.pageSize);
}

function configureMainControls({
  showStore = true,
  showBalanceFilters = false,
  showDates = false
} = {}) {
  $('#balanceControls').hidden = false;
  $('#periodControls').hidden = !showDates;

  const storeField = document.querySelector('.field--store');
  if (storeField) storeField.hidden = !showStore;

  const balanceFilters = $('#balanceFilterChips');
  if (balanceFilters) balanceFilters.hidden = !showBalanceFilters;
}

function renderBalances() {
  configureMainControls({
    showStore: true,
    showBalanceFilters: false,
    showDates: false
  });

  const rows = getBalanceRows();
  const withBalance = rows.filter((row) => row.balanceStatus === 'ok').length;
  const notOnStore = rows.filter((row) =>
    row.balanceStatus === 'not_on_store_or_no_balance'
  ).length;

  const selectedStore = LIVE_STORES.find((store) =>
    String(store.id) === String(state.storeId)
  );

  metrics([
    ['Склад', selectedStore?.name || '—'],
    ['Найдено', fmt.format(state.liveStockTotal)],
    ['На странице', fmt.format(rows.length)],
    ['Нет на складе', fmt.format(notOnStore)]
  ]);

  const pageCount = Math.max(1, Math.ceil(state.liveStockTotal / state.pageSize));
  state.page = Math.min(state.page, pageCount);

  const start = (state.page - 1) * state.pageSize;

  if (!rows.length) {
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Ничего не найдено</strong>
        Попробуйте изменить склад или поисковый запрос.
      </div>
    `;
    return;
  }

  $('#content').innerHTML = `
    <div class="balance-head balance-head--live">
      <div>Товар / артикул</div>
      <div>Склад</div>
      <div>Живой остаток</div>
    </div>

    <div class="balance-list">
      ${rows.map(renderBalanceRow).join('')}
    </div>

    <div class="pagination">
      <div class="pagination__info">
        ${fmt.format(start + 1)}–${fmt.format(Math.min(start + rows.length, state.liveStockTotal))}
        из ${fmt.format(state.liveStockTotal)}
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
  const hasBalance = row.balanceStatus === 'ok';
  const isNegative = hasBalance && row.quantity < 0;

  let quantityText = 'Нет на складе';
  let quantityClass = 'muted';

  if (hasBalance) {
    quantityText = fmt.format(row.quantity);
    quantityClass = isNegative ? 'negative' : '';
  } else if (row.balanceStatus === 'error') {
    quantityText = 'Ошибка';
    quantityClass = 'negative';
  }

  return `
    <article class="balance-row balance-row--live ${isNegative ? 'row-negative' : ''}">
      <div class="product-cell">
        <div class="product-name ${isNegative ? 'negative' : ''}">
          ${escapeHtml(row.productName || row.id)}
        </div>
        <div class="product-meta">
          <span>${escapeHtml(row.productNum || 'Без артикула')}</span>
        </div>
      </div>

      <div class="cell-store">
        <span class="store-badge">${escapeHtml(storeName(state.storeId))}</span>
      </div>

      <div class="value-cell cell-qty">
        <div class="value-primary ${quantityClass}">
          ${escapeHtml(quantityText)}
        </div>
        <div class="value-secondary">
          ${hasBalance ? escapeHtml(row.unit || '') : ''}
        </div>
      </div>
    </article>
  `;
}

async function loadDocuments({ forceRefresh = false } = {}) {
  state.documentsLoading = false;
  configureMainControls({
    showStore: false,
    showBalanceFilters: false,
    showDates: false
  });
  metrics([]);
  $('#connectionStatus').textContent = 'iikoOffice · раздел готовим';
  $('#content').innerHTML = `
    <div class="empty-state">
      <strong>Документы переводим на iikoOffice</strong>
      Старую интеграцию с iikoWeb отключили. Следующий захват Fiddler подключим напрямую к iikoOffice.
    </div>
  `;
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
  configureMainControls({
    showStore: true,
    showBalanceFilters: false,
    showDates: true
  });

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
              <span>${escapeHtml(cleanUnitName(item.unitName))}</span>
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



async function apiDishes({ forceRefresh = false } = {}) {
  const params = new URLSearchParams();
  if (forceRefresh) params.set('refresh', '1');
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch(`${cfg.workerUrl}/api/nomenclature${suffix}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return {
    ...payload,
    dishes: payload.items || []
  };
}

async function apiDishDetail(productId) {
  const response = await apiFetch(
    `${cfg.workerUrl}/api/nomenclature/${encodeURIComponent(productId)}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } }
  );
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return {
    ...payload,
    dish: payload.item
  };
}

async function loadDishes({ forceRefresh = false } = {}) {
  if (state.dishesLoading) return;
  state.dishesLoading = true;

  $('#content').innerHTML = '<div class="loading">Загружаем блюда, товары и полуфабрикаты…</div>';

  try {
    const payload = await apiDishes({ forceRefresh });
    state.dishes = payload.dishes || [];
    state.dishesSource = payload.source || '';
    $('#connectionStatus').textContent =
      `iikoOffice · ${payload.cached ? 'кэш · ' : ''}обновлено ${formatUpdatedTime(payload.updatedAt || new Date().toISOString())}`;
    renderDishes();
  } catch (error) {
    console.error(error);
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Не удалось загрузить номенклатуру</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
    toast(error.message);
  } finally {
    state.dishesLoading = false;
  }
}



function displayText(value, fallback = '') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'object') {
    const candidate =
      value.name ??
      value.displayName ??
      value.title ??
      value.value ??
      value.text ??
      value.code ??
      '';

    if (candidate !== '' && candidate !== null && candidate !== undefined) {
      return String(candidate);
    }
  }

  return fallback || String(value);
}


function recipeMeasure(value, unit) {
  const n = Number(value ?? 0);
  const rawUnit = String(unit || '').trim();
  const u = rawUnit
    .toLocaleLowerCase('ru-RU')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!Number.isFinite(n)) {
    return `${displayText(value, '0')} ${rawUnit}`.trim();
  }

  // productCharts returns recipe quantities in the ingredient's main unit.
  // For the card we convert kg -> g and liters -> ml.
  if (['кг', 'kg', 'килограмм', 'килограммы'].includes(u)) {
    return `${fmt.format(n * 1000)} г`;
  }

  if (['л', 'l', 'литр', 'литры', 'литров'].includes(u)) {
    return `${fmt.format(n * 1000)} мл`;
  }

  if (['г', 'гр', 'g', 'грамм', 'граммы'].includes(u)) {
    return `${fmt.format(n)} г`;
  }

  if (['мл', 'ml', 'миллилитр', 'миллилитры'].includes(u)) {
    return `${fmt.format(n)} мл`;
  }

  if (['шт', 'штука', 'штуки', 'pcs', 'pc'].includes(u)) {
    return `${fmt.format(n)} шт`;
  }

  if (['порц', 'порция', 'порции'].includes(u)) {
    return `${fmt.format(n)} порц`;
  }

  return `${fmt.format(n)}${rawUnit ? ` ${rawUnit}` : ''}`;
}

function shortRecipeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) return shortOfficeDate(value);

  const year = Number(match[1]);

  if (year >= 2100) {
    return 'Бессрочно';
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function ruProductType(type) {
  const value = String(type || '').toUpperCase();

  if (value === 'DISH') return 'Блюдо';
  if (value === 'GOODS') return 'Товар';
  if (value === 'PREPARED') return 'Полуфабрикат';

  return type || 'Номенклатура';
}

function filteredDishes() {
  let rows = state.dishes.filter((item) => matches(
    item.name,
    item.code,
    item.num,
    item.category,
    ruProductType(item.type)
  ));

  if (state.dishTypeFilter !== 'all') {
    rows = rows.filter((item) => item.type === state.dishTypeFilter);
  }

  return rows.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ru')
  );
}

function renderDishes() {
  configureMainControls({
    showStore: false,
    showBalanceFilters: false,
    showDates: false
  });

  const rows = filteredDishes();
  const dishesCount = rows.filter((x) => x.type === 'DISH').length;
  const prepCount = rows.filter((x) => x.type === 'PREPARED').length;
  const goodsCount = rows.filter((x) => x.type === 'GOODS').length;

  metrics([
    ['Всего', fmt.format(rows.length)],
    ['Блюд', fmt.format(dishesCount)],
    ['Полуфабрикатов', fmt.format(prepCount)],
    ['Товаров', fmt.format(goodsCount)]
  ]);

  const types = [
    ['all', 'Все'],
    ['DISH', 'Блюда'],
    ['GOODS', 'Товары'],
    ['PREPARED', 'Полуфабрикаты']
  ];

  $('#content').innerHTML = `
    <div class="document-toolbar">
      <div class="filter-chips">
        ${types.map(([value, label]) => `
          <button class="filter-chip ${state.dishTypeFilter === value ? 'active' : ''}"
            type="button" data-dish-filter="${value}">${label}</button>
        `).join('')}
      </div>
    </div>

    ${rows.length ? `
      <div class="dish-list">
        ${rows.slice(0, 300).map((item) => `
          <button class="dish-row" type="button" data-dish-id="${escAttr(item.id)}">
            <div class="dish-row__main">
              <strong>${escapeHtml(displayText(item.name, 'Без названия'))}</strong>
              <span>
                ${escapeHtml(item.code || item.num || 'Без кода')}
                ${item.category ? ` · ${escapeHtml(item.category)}` : ''}
              </span>
            </div>
            <div class="dish-row__type">${escapeHtml(ruProductType(item.type))}</div>
            <div class="dish-row__price">
              ${item.menuPrice ? money.format(item.menuPrice) : '—'}
            </div>
            <div class="dish-row__arrow">›</div>
          </button>
        `).join('')}
      </div>
      ${rows.length > 300 ? `<div class="list-note">Показаны первые 300 позиций. Используйте поиск для быстрого доступа.</div>` : ''}
    ` : `
      <div class="empty-state">
        <strong>Ничего не найдено</strong>
        Измените поиск или тип номенклатуры.
      </div>
    `}
  `;

  $$('[data-dish-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dishTypeFilter = button.dataset.dishFilter;
      renderDishes();
    });
  });

  $$('.dish-row').forEach((button) => {
    button.addEventListener('click', () => openDish(button.dataset.dishId));
  });
}

async function openDish(productId) {
  $('#summary').innerHTML = '';
  $('#content').innerHTML = '<div class="loading">Открываем техкарту…</div>';

  try {
    const payload = await apiDishDetail(productId);
    state.dishDetail = payload.dish;
    renderDishDetail();
  } catch (error) {
    console.error(error);
    toast(error.message);
    renderDishes();
  }
}


function shortOfficeDate(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return text;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function renderDishDetail() {
  const dish = state.dishDetail;
  if (!dish) return renderDishes();

  const ingredients = dish.ingredients || [];

  $('#content').innerHTML = `
    <div class="document-detail">
      <div class="document-detail__top">
        <button id="backToDishesBtn" class="back-button" type="button">← Назад</button>
        <span class="status-badge">${escapeHtml(ruProductType(dish.type))}</span>
      </div>

      <div class="document-detail__header">
        <div>
          <div class="document-detail__type">${escapeHtml(dish.code || 'Номенклатура')}</div>
          <h2>${escapeHtml(displayText(dish.name, 'Без названия'))}</h2>
          <p>
            ${dish.category ? escapeHtml(dish.category) : 'Без категории'}
            ${dish.unit ? ` · ${escapeHtml(dish.unit)}` : ''}
          </p>
        </div>
        <div class="nomenclature-price-stack">
          <span>Себестоимость</span>
          <strong class="document-detail__sum">
            ${Number.isFinite(Number(dish.costPrice)) ? money.format(Number(dish.costPrice)) : '—'}
          </strong>
          ${dish.menuPrice ? `<small>Цена меню: ${money.format(dish.menuPrice)}</small>` : ''}
        </div>
      </div>

      ${(dish.recipeDateFrom || dish.recipeDateTo || dish.cookingPlaceType) ? `
        <div class="dish-facts">
          <div><span>Техкарта с</span><strong>${escapeHtml(shortRecipeDate(dish.recipeDateFrom))}</strong></div>
          <div><span>Техкарта до</span><strong>${escapeHtml(shortRecipeDate(dish.recipeDateTo))}</strong></div>
        </div>
      ` : ''}

      ${dish.technology ? `
        <div class="dish-technology">
          <span>Технология приготовления</span>
          <p>${escapeHtml(dish.technology).replace(/\n/g, '<br>')}</p>
        </div>
      ` : ''}

      <div class="document-items-title">${dish.type === 'GOODS' ? 'Товар' : `Состав · ${fmt.format(ingredients.length)}`}</div>

      ${ingredients.length ? `
        <div class="document-items">
          ${ingredients.map((item) => `
            <div class="dish-ingredient dish-ingredient--server">
              <div class="document-item__name">
                <strong>${escapeHtml(displayText(item.name, item.productId || 'Ингредиент'))}</strong>
              </div>
              <div class="ingredient-weight">
                <strong>${escapeHtml(recipeMeasure(item.gross ?? item.amount ?? 0, item.unit))}</strong>
                <span>брутто${item.unit ? ` · ${escapeHtml(item.unit)}` : ''}</span>
              </div>
              <div class="ingredient-weight">
                <strong>${escapeHtml(recipeMeasure(item.net ?? 0, item.unit))}</strong>
                <span>нетто${item.unit ? ` · ${escapeHtml(item.unit)}` : ''}</span>
              </div>
              <div class="ingredient-weight">
                <strong>${escapeHtml(recipeMeasure(item.out ?? 0, item.unit))}</strong>
                <span>выход${item.unit ? ` · ${escapeHtml(item.unit)}` : ''}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <strong>${dish.type === 'GOODS' ? 'Техкарта не требуется' : 'Состав не найден'}</strong>
          ${dish.type === 'GOODS'
            ? 'Это товар. Для него показываются карточка номенклатуры и себестоимость.'
            : 'Для этой позиции iikoOffice не вернул строки действующей техкарты.'}
        </div>
      `}
    </div>
  `;

  $('#backToDishesBtn').addEventListener('click', () => {
    state.dishDetail = null;
    renderDishes();
  });
}


async function apiTurnover({ forceRefresh = false } = {}) {
  if (!state.from || !state.to) {
    setDefaultDates();
  }

  const selectedStore = LIVE_STORES.find((store) =>
    String(store.id) === String(state.storeId)
  ) || LIVE_STORES[0];

  const params = new URLSearchParams({
    store: selectedStore.name,
    from: state.from,
    to: state.to
  });

  if (forceRefresh) {
    params.set('_', String(Date.now()));
  }

  const response = await apiFetch(
    `${cfg.workerUrl}/api/turnover?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }
  );

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

async function loadTurnover({ forceRefresh = false } = {}) {
  if (state.turnoverLoading) return;
  state.turnoverLoading = true;

  $('#content').innerHTML = '<div class="loading">Строим ОСВ…</div>';

  try {
    const payload = await apiTurnover({ forceRefresh });
    state.turnoverRows = payload.rows || [];
    renderTurnover();
  } catch (error) {
    console.error(error);
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Не удалось построить ОСВ</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
    toast(error.message);
  } finally {
    state.turnoverLoading = false;
  }
}

function turnoverFilteredRows() {
  return state.turnoverRows.filter((row) => matches(
    row.name, row.code, row.category, row.unit
  ));
}

function renderTurnover() {
  configureMainControls({
    showStore: true,
    showBalanceFilters: false,
    showDates: true
  });

  const rows = turnoverFilteredRows();

  const openQty = rows.reduce((sum, x) => sum + Number(x.openQty || 0), 0);
  const openAmt = rows.reduce((sum, x) => sum + Number(x.openAmt || 0), 0);
  const closeQty = rows.reduce((sum, x) => sum + Number(x.closeQty || 0), 0);
  const closeAmt = rows.reduce((sum, x) => sum + Number(x.closeAmt || 0), 0);

  metrics([
    ['Начальный остаток', fmt.format(openQty)],
    ['Стоимость на начало', money.format(openAmt)],
    ['Конечный остаток', fmt.format(closeQty)],
    ['Стоимость остатка', money.format(closeAmt)]
  ]);

  const mode = state.turnoverMode;

  const pairValue = (qty, amt) => {
    if (mode === 'qty') {
      return `<strong>${fmt.format(qty || 0)}</strong>`;
    }

    if (mode === 'amount') {
      return `<strong>${money.format(amt || 0)}</strong>`;
    }

    return `
      <strong>${fmt.format(qty || 0)}</strong>
      <span class="turnover-cost">${money.format(amt || 0)}</span>
    `;
  };

  const hasMovement = (qty, amt) =>
    Math.abs(Number(qty || 0)) > 0.000001 ||
    Math.abs(Number(amt || 0)) > 0.01;

  const mobileMovementRows = (row) => {
    const items = [
      ['Приход', row.purchaseQty, row.purchaseAmt],
      ['Продажи', row.salesQty, row.salesAmt],
      ['Перемещения', row.transferQty, row.transferAmt],
      ['Списания', row.writeoffQty, row.writeoffAmt],
      ['Инвентаризация', row.inventoryQty, row.inventoryAmt],
      ['Расходные накладные', row.outgoingInvoiceQty, row.outgoingInvoiceAmt],
      ['Производство', row.productionQty, row.productionAmt],
      ['Преобразование', row.transformationQty, row.transformationAmt],
      ['Возвраты', row.returnedQty, row.returnedAmt],
      ['Возврат прихода', row.incomingReturnedQty, row.incomingReturnedAmt],
      ['Разборка', row.disassembleQty, row.disassembleAmt]
    ].filter(([, qty, amt]) => hasMovement(qty, amt));

    if (Math.abs(Number(row.costCorrection || 0)) > 0.01) {
      items.push(['Коррекция себестоимости', null, row.costCorrection]);
    }

    if (hasMovement(row.otherQty, row.otherAmt)) {
      items.push(['Прочее ⚠️', row.otherQty, row.otherAmt]);
    }

    if (!items.length) {
      return `
        <div class="osv-mobile-empty-movement">
          Движений за период нет
        </div>
      `;
    }

    return items.map(([label, qty, amt]) => `
      <div class="osv-mobile-movement-row ${label.startsWith('Прочее') ? 'is-warning' : ''}">
        <span>${escapeHtml(label)}</span>
        <div>
          ${qty === null
            ? ''
            : `<strong>${fmt.format(qty || 0)}</strong>`}
          ${mode !== 'qty'
            ? `<small>${money.format(amt || 0)}</small>`
            : ''}
        </div>
      </div>
    `).join('');
  };

  $('#content').innerHTML = `
    <div class="document-toolbar">
      <div class="filter-chips">
        <button class="filter-chip ${mode === 'both' ? 'active' : ''}"
          type="button" data-turnover-mode="both">Количество + ₽</button>
        <button class="filter-chip ${mode === 'qty' ? 'active' : ''}"
          type="button" data-turnover-mode="qty">Количество</button>
        <button class="filter-chip ${mode === 'amount' ? 'active' : ''}"
          type="button" data-turnover-mode="amount">Суммы ₽</button>
      </div>
    </div>

    ${rows.length ? `
      <div class="turnover-note">
        ОСВ строится в расширенном режиме iikoOffice.
        На телефоне показываются только ненулевые движения.
        «Прочее» — контрольная разница и в норме должна быть около нуля.
      </div>

      <div class="osv-mobile-list">
        ${rows.map((row) => {
          const deltaQty =
            Number(row.closeQty || 0) - Number(row.openQty || 0);
          const deltaAmt =
            Number(row.closeAmt || 0) - Number(row.openAmt || 0);

          return `
            <details class="osv-mobile-card">
              <summary>
                <div class="osv-mobile-card-head">
                  <div class="osv-mobile-title">
                    <strong>${escapeHtml(row.name)}</strong>
                    <span>
                      ${escapeHtml(row.code || '')}
                      ${row.unit ? ` · ${escapeHtml(row.unit)}` : ''}
                    </span>
                  </div>
                  <span class="osv-mobile-chevron">⌄</span>
                </div>

                <div class="osv-mobile-balance">
                  <div>
                    <span>Начало</span>
                    ${pairValue(row.openQty, row.openAmt)}
                  </div>
                  <div class="osv-mobile-arrow">→</div>
                  <div>
                    <span>Конец</span>
                    ${pairValue(row.closeQty, row.closeAmt)}
                  </div>
                </div>

                <div class="osv-mobile-delta ${deltaQty < 0 ? 'is-negative' : deltaQty > 0 ? 'is-positive' : ''}">
                  За период:
                  <strong>${deltaQty > 0 ? '+' : ''}${fmt.format(deltaQty)}</strong>
                  ${mode !== 'qty'
                    ? `<span>${deltaAmt > 0 ? '+' : ''}${money.format(deltaAmt)}</span>`
                    : ''}
                </div>
              </summary>

              <div class="osv-mobile-details">
                ${mobileMovementRows(row)}
              </div>
            </details>
          `;
        }).join('')}
      </div>

      <div class="turnover-scroll osv-desktop-table">
        <table class="turnover-table turnover-table--osv">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Начало</th>
              <th>Приход</th>
              <th>Продажи</th>
              <th>Перемещения</th>
              <th>Списания</th>
              <th>Инвентаризация</th>
              <th>Расх. накладные</th>
              <th>Производство</th>
              <th>Преобразование</th>
              <th>Возвраты</th>
              <th>Возврат прихода</th>
              <th>Разборка</th>
              <th>Корр. себестоимости</th>
              <th>Прочее</th>
              <th>Конец</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.name)}</strong>
                  <span>
                    ${escapeHtml(row.code || '')}
                    ${row.unit ? ` · ${escapeHtml(row.unit)}` : ''}
                    ${row.category ? ` · ${escapeHtml(row.category)}` : ''}
                  </span>
                </td>

                <td>${pairValue(row.openQty, row.openAmt)}</td>
                <td>${pairValue(row.purchaseQty, row.purchaseAmt)}</td>
                <td>${pairValue(row.salesQty, row.salesAmt)}</td>
                <td>${pairValue(row.transferQty, row.transferAmt)}</td>
                <td>${pairValue(row.writeoffQty, row.writeoffAmt)}</td>
                <td>${pairValue(row.inventoryQty, row.inventoryAmt)}</td>
                <td>${pairValue(row.outgoingInvoiceQty, row.outgoingInvoiceAmt)}</td>
                <td>${pairValue(row.productionQty, row.productionAmt)}</td>
                <td>${pairValue(row.transformationQty, row.transformationAmt)}</td>
                <td>${pairValue(row.returnedQty, row.returnedAmt)}</td>
                <td>${pairValue(row.incomingReturnedQty, row.incomingReturnedAmt)}</td>
                <td>${pairValue(row.disassembleQty, row.disassembleAmt)}</td>
                <td>
                  ${mode === 'qty'
                    ? '<span class="turnover-cost">—</span>'
                    : `<strong>${money.format(row.costCorrection || 0)}</strong>`}
                </td>
                <td class="${hasMovement(row.otherQty, row.otherAmt) ? 'turnover-other-cell' : ''}">
                  ${pairValue(row.otherQty, row.otherAmt)}
                </td>
                <td class="turnover-end-cell">
                  ${pairValue(row.closeQty, row.closeAmt)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div class="empty-state">
        <strong>Нет данных за период</strong>
        Измените склад, даты или поиск.
      </div>
    `}
  `;

  $$('[data-turnover-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.turnoverMode = button.dataset.turnoverMode;
      renderTurnover();
    });
  });
}

function renderNotConnected() {
  $('#balanceControls').hidden = true;
  $('#periodControls').hidden = false;

  const labels = {
    documents: 'Документы',
    inventories: 'Инвентаризации',
    dishes: 'Номенклатура',
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
    if (state.liveStockLoaded) {
      renderBalances();
    } else if (!state.liveStockLoading) {
      loadBalances();
    }
  } else if (state.tab === 'documents') {
    if (state.documents.length) {
      renderDocuments();
    } else if (!state.documentsLoading) {
      loadDocuments();
    }
  } else if (state.tab === 'dishes') {
    if (state.dishes.length) {
      renderDishes();
    } else if (!state.dishesLoading) {
      loadDishes();
    }
  } else if (state.tab === 'turnover') {
    if (state.turnoverRows.length) {
      renderTurnover();
    } else if (!state.turnoverLoading) {
      loadTurnover();
    }
  } else if (['autoorder', 'supplierPrices', 'dashboard', 'olap'].includes(state.tab)) {
    configureMainControls({
      showStore: false,
      showBalanceFilters: false,
      showDates: false
    });
    const names = {
      autoorder: 'Автозаказ / Автозаявки',
      supplierPrices: 'Прайс-листы поставщиков',
      dashboard: 'Дашборд',
      olap: 'OLAP отчёты'
    };
    metrics([]);
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(names[state.tab] || 'Раздел')}</strong>
        Доступ уже учитывается по роли. Сам раздел подключим следующим этапом.
      </div>
    `;
  } else {
    renderNotConnected();
  }
}

function setTab(tab) {
  state.tab = tab;
  state.page = 1;
  state.documentDetail = null;
  state.dishDetail = null;

  const placeholders = {
    balances: 'Товар, код, категория',
    documents: 'Номер, тип, склад, комментарий',
    dishes: 'Блюдо, товар, полуфабрикат, код',
    turnover: 'Товар, код, категория',
    autoorder: 'Автозаказ',
    supplierPrices: 'Поставщик, товар',
    dashboard: 'Показатель',
    olap: 'Отчёт'
  };
  $('#searchInput').placeholder = placeholders[tab] || 'Поиск';

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
  } else if (state.tab === 'dishes') {
    state.dishes = [];
    loadDishes({ forceRefresh: true });
  } else if (state.tab === 'turnover') {
    state.turnoverRows = [];
    loadTurnover({ forceRefresh: true });
  } else {
    loadBalances({ forceRefresh: true, keepVisible: true });
  }
});

$('#storeFilter').addEventListener('change', (event) => {
  state.storeId = event.target.value;
  state.page = 1;

  if (state.tab === 'balances') {
    state.liveStockLoaded = false;
    loadBalances();
  } else if (state.tab === 'turnover') {
    state.turnoverRows = [];
    loadTurnover();
  } else {
    render();
  }
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

    if (state.tab === 'balances') {
      renderBalances();
    } else {
      render();
    }
  });
});

$('#dateFrom').addEventListener('change', (event) => {
  state.from = event.target.value;
  if (state.tab === 'documents') {
    state.documents = [];
    loadDocuments();
  } else if (state.tab === 'turnover') {
    state.turnoverRows = [];
    loadTurnover();
  } else {
    render();
  }
});

$('#dateTo').addEventListener('change', (event) => {
  state.to = event.target.value;
  if (state.tab === 'documents') {
    state.documents = [];
    loadDocuments();
  } else if (state.tab === 'turnover') {
    state.turnoverRows = [];
    loadTurnover();
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
      tg.setHeaderColor('#090a0c');
    } catch {}
  }

  if (tg.setBackgroundColor) {
    try {
      tg.setBackgroundColor('#090a0c');
    } catch {}
  }
}


$('#connectionBtn').addEventListener('click', openConnectionPanel);
$('#closeConnectionPanel').addEventListener('click', closeConnectionPanel);
$('#connectionPanelBackdrop').addEventListener('click', closeConnectionPanel);


$('#iikoLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  setAuthError('');

  try {
    await iikoLogin();
    await finishAuthorizedStartup();
  } catch (error) {
    setAuthError(error.message);
  }
});

$('#telegramLoginBtn').addEventListener('click', async () => {
  setAuthError('');
  try {
    await telegramLogin();
    await finishAuthorizedStartup();
  } catch (error) {
    setAuthError(error.message);
  }
});

$('#ownerLoginBtn').addEventListener('click', async () => {
  setAuthError('');
  try {
    const payload = await publicApi('/api/auth/web-owner', {
      method: 'POST',
      body: JSON.stringify({ setupCode: $('#ownerCode').value, initData: telegramInitData() })
    });
    saveAuth(payload.token, payload.me);
    await finishAuthorizedStartup();
  } catch (error) {
    setAuthError(error.message);
  }
});

$('#firstSetupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  setAuthError('');

  try {
    const payload = await publicApi('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        serverName: $('#setupServerName').value,
        serverUrl: $('#setupServerUrl').value,
        login: $('#setupLogin').value,
        password: $('#setupPassword').value,
        timezoneOffsetMinutes: Number($('#setupTimezone').value),
        setupCode: $('#setupCode').value,
        initData: telegramInitData()
      })
    });

    saveAuth(payload.token, payload.me);
    $('#setupPassword').value = '';
    $('#setupCode').value = '';
    await finishAuthorizedStartup();
  } catch (error) {
    setAuthError(error.message);
  }
});

$('#addConnectionForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const response = await apiFetch(`${cfg.workerUrl}/api/admin/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverName: $('#addServerName').value,
        serverUrl: $('#addServerUrl').value,
        login: $('#addServerLogin').value,
        password: $('#addServerPassword').value,
        timezoneOffsetMinutes: Number($('#addServerTimezone').value)
      })
    });

    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    $('#addServerPassword').value = '';
    const mePayload = await publicApi('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${authState.token}`,
        'X-Connection-ID': authState.connectionId
      }
    });
    saveAuth('', mePayload.me);
    applyConnectionToApp();
    toast('Сервер добавлен');
  } catch (error) {
    toast(error.message);
  }
});

$('#addUserForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const response = await apiFetch(`${cfg.workerUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: $('#newUserTelegramId').value,
        displayName: $('#newUserName').value,
        connectionId: $('#newUserConnection').value,
        role: $('#newUserRole').value,
        iikoLogin: $('#newUserIikoLogin').value,
        iikoPassword: $('#newUserIikoPassword').value
      })
    });

    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    $('#newUserTelegramId').value = '';
    $('#newUserName').value = '';
    $('#newUserIikoLogin').value = '';
    $('#newUserIikoPassword').value = '';
    toast('Доступ и аккаунт iiko сохранены');
  } catch (error) {
    toast(error.message);
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try {
    if (authState.token) {
      await apiFetch(`${cfg.workerUrl}/api/auth/logout`, { method: 'POST' });
    }
  } catch {}

  clearAuth();
  location.reload();
});

(async () => {
  try {
    const ready = await initializeAuth();
    if (ready) {
      await finishAuthorizedStartup();
    }
  } catch (error) {
    showAuthGate(error.message);
    setAuthError(error.message);
  }
})();
