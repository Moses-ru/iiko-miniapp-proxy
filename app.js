
const AUTH_TOKEN_KEY = 'iiko-office-auth-v59';
const CONNECTION_KEY = 'iiko-office-connection-v59';
const MANUAL_LOGIN_KEY = 'iiko-office-manual-login-v66';

const authState = {
  token: localStorage.getItem(AUTH_TOKEN_KEY) || '',
  me: null,
  connectionId: localStorage.getItem(CONNECTION_KEY) || ''
};

function telegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function permissionGranted(permission) {
  return true;
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

  return fetch(url, {
    ...options,
    headers
  });
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
    showSearch: false,
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
      <details class="admin-user-card ${row.role === 'PENDING' ? 'pending' : ''}">
        <summary>
          <div>
            <strong>${escapeHtml(row.name || row.telegramId)}</strong>
            <small>
              ${escapeHtml(row.connectionName)}
              · ${escapeHtml(row.roleLabel)}
            </small>
          </div>
          <span>›</span>
        </summary>

        <form
          class="admin-user-edit"
          data-admin-user-form
          data-user-id="${escAttr(row.userId)}"
          data-connection-id="${escAttr(row.connectionId)}"
        >
          <label>
            <span>Имя</span>
            <input name="displayName" value="${escAttr(row.name || '')}" required>
          </label>

          <label>
            <span>Telegram ID</span>
            <input name="telegramId" value="${escAttr(row.telegramId || '')}" required>
          </label>

          <label>
            <span>Логин iiko</span>
            <input name="iikoLogin" value="${escAttr(row.iikoLogin || '')}" required>
          </label>

          <label>
            <span>Новый пароль iiko</span>
            <input
              name="iikoPassword"
              type="password"
              placeholder="Не менять"
              autocomplete="new-password"
            >
          </label>

          <label>
            <span>Роль</span>
            <select name="role">
              <option value="PENDING" ${row.role === 'PENDING' ? 'selected' : ''}>Ожидает подтверждения</option>
              <option value="CHEF" ${row.role === 'CHEF' ? 'selected' : ''}>Шеф-повар</option>
              <option value="BAR_MANAGER" ${row.role === 'BAR_MANAGER' ? 'selected' : ''}>Бар-менеджер</option>
              <option value="MANAGER" ${row.role === 'MANAGER' ? 'selected' : ''}>Менеджер</option>
              <option value="MANAGING" ${row.role === 'MANAGING' ? 'selected' : ''}>Управляющий</option>
              <option value="OWNER" ${row.role === 'OWNER' ? 'selected' : ''}>Владелец</option>
            </select>
          </label>

          <div class="admin-user-actions">
            <button class="auth-secondary" type="submit">Сохранить</button>
            ${row.role !== 'OWNER'
              ? `<button
                   class="admin-user-remove"
                   type="button"
                   data-remove-admin-user
                 >Удалить</button>`
              : ''
            }
          </div>
        </form>
      </details>
    `).join('');

    $$('[data-admin-user-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const fd = new FormData(form);

        try {
          const response = await apiFetch(
            `${cfg.workerUrl}/api/admin/users/update`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: form.dataset.userId,
                connectionId: form.dataset.connectionId,
                displayName: fd.get('displayName'),
                telegramId: fd.get('telegramId'),
                iikoLogin: fd.get('iikoLogin'),
                iikoPassword: fd.get('iikoPassword'),
                role: fd.get('role')
              })
            }
          );

          const payload = await response.json();

          if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || `HTTP ${response.status}`);
          }

          toast('Пользователь сохранён');
          await loadOwnerRegistrations();
        } catch (error) {
          toast(error.message);
        }
      });
    });

    $$('[data-remove-admin-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        const form = button.closest('[data-admin-user-form]');
        if (!form) return;

        if (!confirm('Удалить доступ этого пользователя к ресторану?')) {
          return;
        }

        try {
          const response = await apiFetch(
            `${cfg.workerUrl}/api/admin/users/remove`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: form.dataset.userId,
                connectionId: form.dataset.connectionId
              })
            }
          );

          const payload = await response.json();

          if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || `HTTP ${response.status}`);
          }

          toast('Доступ удалён');
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
  state.dashboard = null;
  state.dashboardDetail = '';
  state.page = 1;
}

function openConnectionPanel() {
  $('#connectionPanel').classList.add('open');
  $('#connectionPanel').setAttribute('aria-hidden', 'false');
  $('#connectionPanelBackdrop').hidden = false;
  document.body.classList.add('drawer-open');
}

function closeConnectionPanel() {
  $('#connectionPanel').classList.remove('open');
  $('#connectionPanel').setAttribute('aria-hidden', 'true');
  $('#connectionPanelBackdrop').hidden = true;
  if (!$('#sideMenu').classList.contains('open')) {
    document.body.classList.remove('drawer-open');
  }
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
  localStorage.removeItem(MANUAL_LOGIN_KEY);
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
    return false;
  }

  $('#firstSetupForm').hidden = true;
  $('#loginChoiceBox').hidden = false;

  $('#authTitle').textContent = 'Вход в iiko Office';
  $('#authHint').textContent =
    telegramInitData()
      ? 'Введите свой логин и пароль iiko. Telegram привяжется автоматически.'
      : 'Выберите сервер и войдите своим аккаунтом iiko.';

  await loadPublicConnections();
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
  tab: 'documents',
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
  procurement: null,
  procurementTab: 'overview',
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
  turnoverMode: 'both',
  dashboard: null,
  dashboardLoading: false,
  dashboardPeriod: 'today',
  dashboardScope: 'role',
  dashboardDetail: ''
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
  document.body.classList.add('drawer-open');
}

function closeMenu() {
  $('#sideMenu').classList.remove('open');
  $('#sideMenu').setAttribute('aria-hidden', 'true');
  $('#menuBackdrop').hidden = true;
  $('#menuBtn').setAttribute('aria-expanded', 'false');
  if (!$('#connectionPanel').classList.contains('open')) {
    document.body.classList.remove('drawer-open');
  }
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

async function fetchLiveStockForStore(store, { forceRefresh = false } = {}) {
  const params = new URLSearchParams({
    store: store.name,
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

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function mergeLiveStockPayloads(payloads) {
  const map = new Map();

  for (const payload of payloads) {
    for (const item of payload.items || []) {
      const key = String(item.id || item.productNum || item.productName || '');
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, {
          ...item,
          quantity: Number(item.quantity || 0),
          startQuantity: Number(item.startQuantity || 0),
          endSum: Number(item.endSum || 0),
          balanceStatus: 'ok'
        });
      } else {
        const target = map.get(key);
        target.quantity += Number(item.quantity || 0);
        target.startQuantity += Number(item.startQuantity || 0);
        target.endSum += Number(item.endSum || 0);
      }
    }
  }

  const items = [...map.values()].sort((a, b) =>
    String(a.productName || '').localeCompare(
      String(b.productName || ''),
      'ru',
      { sensitivity: 'base', numeric: true }
    )
  );

  return {
    ok: true,
    storeName: 'Все склады',
    pagination: {
      offset: 0,
      limit: items.length,
      total: items.length,
      returned: items.length,
      hasMore: false
    },
    items,
    time: new Date().toISOString()
  };
}

async function apiLiveStock({ forceRefresh = false } = {}) {
  if (state.storeId === '__ALL__') {
    const payloads = await Promise.all(
      LIVE_STORES.map((store) =>
        fetchLiveStockForStore(store, { forceRefresh })
      )
    );

    return mergeLiveStockPayloads(payloads);
  }

  const selectedStore = LIVE_STORES.find((store) =>
    String(store.id) === String(state.storeId)
  ) || LIVE_STORES[0];

  return fetchLiveStockForStore(selectedStore, { forceRefresh });
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
      `iikoOffice · текущий остаток · ${formatUpdatedTime(state.lastUpdatedAt)}`;
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

function storesForPicker() {
  const allowAll = ['balances', 'turnover', 'dashboard'].includes(state.tab);
  return allowAll
    ? [{ id: '__ALL__', name: 'Все склады' }, ...LIVE_STORES]
    : LIVE_STORES;
}

function fillStores() {
  const select = $('#storeFilter');
  const buttonText = $('#storePickerText');
  const menu = $('#storePickerMenu');

  if (!select || !buttonText || !menu) return;

  const pickerStores = storesForPicker();

  if (!Array.isArray(pickerStores) || !pickerStores.length) {
    select.innerHTML = '<option value="">Склады не найдены</option>';
    menu.innerHTML = '<div class="store-picker-empty">Склады не найдены</div>';
    buttonText.textContent = 'Склады не найдены';
    state.storeId = '';
    select.value = '';
    return;
  }

  const previous = state.storeId || pickerStores[0].id;

  select.innerHTML = pickerStores.map((store) =>
    `<option value="${escAttr(store.id)}">${escapeHtml(store.name)}</option>`
  ).join('');

  if (pickerStores.some((store) => String(store.id) === String(previous))) {
    state.storeId = previous;
  } else {
    state.storeId = pickerStores[0].id;
  }

  select.value = state.storeId;

  const selected = pickerStores.find(
    (store) => String(store.id) === String(state.storeId)
  ) || pickerStores[0];

  buttonText.textContent = selected?.name || 'Выберите склад';

  menu.innerHTML = pickerStores.map((store) => `
    <button
      type="button"
      class="store-picker-option ${String(store.id) === String(state.storeId) ? 'active' : ''}"
      role="option"
      aria-selected="${String(store.id) === String(state.storeId) ? 'true' : 'false'}"
      data-store-picker-id="${escAttr(store.id)}"
    >
      <span>${escapeHtml(store.name)}</span>
      <b>${String(store.id) === String(state.storeId) ? '✓' : ''}</b>
    </button>
  `).join('');

  $$('[data-store-picker-id]').forEach((option) => {
    option.addEventListener('click', () => {
      const nextId = option.dataset.storePickerId;
      select.value = nextId;
      closeStorePicker();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function openStorePicker() {
  const menu = $('#storePickerMenu');
  const button = $('#storePickerButton');
  if (!menu || !button || !LIVE_STORES.length) return;

  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  button.classList.add('open');
}

function closeStorePicker() {
  const menu = $('#storePickerMenu');
  const button = $('#storePickerButton');
  if (!menu || !button) return;

  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.classList.remove('open');
}

function toggleStorePicker() {
  const menu = $('#storePickerMenu');
  if (!menu) return;
  if (menu.hidden) openStorePicker();
  else closeStorePicker();
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

function relocateContextControls() {
  const desktop = $('#desktopContextSlot');
  const mobile = $('#mobileContextSlot');
  const controls = $('#contextControls');
  const period = $('#periodControls');

  if (!desktop || !mobile || !controls || !period) return;

  const desktopMode = window.matchMedia('(min-width: 1100px)').matches;
  const target = desktopMode ? desktop : mobile;

  if (controls.parentElement !== target) target.appendChild(controls);
  if (period.parentElement !== target) target.appendChild(period);

  document.body.classList.toggle('desktop-context', desktopMode);
}

function configureMainControls({
  showStore = true,
  showSearch = true,
  showBalanceFilters = false,
  showDates = false
} = {}) {
  relocateContextControls();

  $('#balanceControls').hidden = false;
  $('#periodControls').hidden = !showDates;

  const storeField = document.querySelector('.field--store');
  if (storeField) storeField.hidden = !showStore;

  const searchField = document.querySelector('.search-field');
  if (searchField) searchField.hidden = !showSearch;

  const controls = $('#contextControls');
  if (controls) controls.hidden = !showStore && !showSearch;

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

  const selectedStore =
    state.storeId === '__ALL__'
      ? { name: 'Все склады' }
      : LIVE_STORES.find((store) =>
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

async function apiProcurement({ forceRefresh = false } = {}) {
  if (!state.from || !state.to) {
    setDefaultDates();
  }

  const params = new URLSearchParams({
    from: state.from,
    to: state.to,
    storeId: state.storeId || '__ALL__'
  });

  if (forceRefresh) {
    params.set('_', String(Date.now()));
  }

  const response = await apiFetch(
    `${cfg.workerUrl}/api/purchases-summary?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store'
    }
  );

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(
      payload.error || `HTTP ${response.status}`
    );
  }

  return payload;
}

async function loadDocuments({ forceRefresh = false } = {}) {
  if (state.documentsLoading) return;

  state.documentsLoading = true;

  configureMainControls({
    showStore: true,
    showSearch: true,
    showBalanceFilters: false,
    showDates: true
  });

  metrics([]);

  $('#connectionStatus').textContent =
    'iikoOffice · закупочная аналитика';

  $('#content').innerHTML = `
    <div class="documents-loading">
      <span class="dashboard-spinner"></span>
      <strong>Собираем закупки…</strong>
      <small>На основе приходного движения iikoOffice</small>
    </div>
  `;

  try {
    state.procurement =
      await apiProcurement({ forceRefresh });
    renderDocuments();
  } catch (error) {
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Не удалось собрать закупки</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
  } finally {
    state.documentsLoading = false;
  }
}

function procurementRows() {
  const rows =
    state.procurement?.products || [];

  if (!state.query) return rows;

  const query =
    state.query.toLocaleLowerCase('ru-RU');

  return rows.filter((row) =>
    [
      row.name,
      row.code,
      row.category,
      ...(row.stores || [])
    ]
      .join(' ')
      .toLocaleLowerCase('ru-RU')
      .includes(query)
  );
}

function procurementAveragePrice(row) {
  const price = Number(row.averagePrice);
  if (!Number.isFinite(price)) return '—';

  return `${money.format(price)} / ${escapeHtml(row.unit || 'ед.')}`;
}

function procurementPercent(value, total) {
  const n = Number(value || 0);
  const t = Number(total || 0);
  if (t <= 0) return 0;
  return Math.max(0, Math.min(100, n / t * 100));
}

function renderProcurementOverview(data) {
  const summary = data.summary || {};
  const total = Number(summary.purchaseValue || 0);
  const rows = procurementRows();

  const top = rows.slice(0, 12);

  return `
    <div class="procurement-kpis">
      <article>
        <span>Закуплено</span>
        <strong>${money.format(total)}</strong>
        <small>${escapeHtml(data.period?.from || '')} — ${escapeHtml(data.period?.to || '')}</small>
      </article>

      <article>
        <span>Товарных позиций</span>
        <strong>${fmt.format(summary.productCount || 0)}</strong>
        <small>с приходным движением</small>
      </article>

      <article>
        <span>Складов</span>
        <strong>${fmt.format(summary.storeCount || 0)}</strong>
        <small>с закупками</small>
      </article>

      <article>
        <span>Категорий</span>
        <strong>${fmt.format(summary.categoryCount || 0)}</strong>
        <small>в закупках</small>
      </article>
    </div>

    <div class="procurement-grid">
      <section class="procurement-card">
        <div class="procurement-card__head">
          <div>
            <span>ТОП</span>
            <h3>Закупки по товарам</h3>
          </div>
        </div>

        <div class="procurement-product-list">
          ${top.length ? top.map((row, index) => `
            <div class="procurement-product">
              <b>${index + 1}</b>
              <div>
                <strong>${escapeHtml(row.name)}</strong>
                <small>
                  ${escapeHtml(row.code || '')}
                  ${row.category ? ` · ${escapeHtml(row.category)}` : ''}
                </small>
              </div>
              <div>
                <strong>${money.format(row.value || 0)}</strong>
                <small>
                  ${fmt.format(row.quantity || 0)}
                  ${escapeHtml(row.unit || '')}
                </small>
              </div>
            </div>
          `).join('') : `
            <div class="dashboard-empty">Нет закупок за период</div>
          `}
        </div>
      </section>

      <section class="procurement-card">
        <div class="procurement-card__head">
          <div>
            <span>СТРУКТУРА</span>
            <h3>По категориям</h3>
          </div>
        </div>

        <div class="procurement-bars">
          ${(data.categories || []).slice(0, 10).map((row) => `
            <div class="procurement-bar">
              <div>
                <strong>${escapeHtml(row.name)}</strong>
                <span>${money.format(row.value || 0)}</span>
              </div>
              <i>
                <b style="width:${procurementPercent(row.value, total)}%"></b>
              </i>
            </div>
          `).join('')}
        </div>
      </section>
    </div>

    <section class="procurement-card">
      <div class="procurement-card__head">
        <div>
          <span>СКЛАДЫ</span>
          <h3>Закупки по складам</h3>
        </div>
      </div>

      <div class="procurement-store-grid">
        ${(data.stores || [])
          .filter((row) => Number(row.value || 0) > 0)
          .map((row) => `
            <div>
              <span>${escapeHtml(row.name)}</span>
              <strong>${money.format(row.value || 0)}</strong>
              <small>${fmt.format(row.products || 0)} позиций</small>
            </div>
          `).join('')}
      </div>
    </section>
  `;
}

function renderProcurementPrices(data) {
  const rows = procurementRows()
    .filter((row) => Number.isFinite(Number(row.averagePrice)))
    .slice(0, 100);

  return `
    <section class="procurement-card">
      <div class="procurement-card__head">
        <div>
          <span>РАСЧЁТ ИЗ ОСВ</span>
          <h3>Средневзвешенная закупочная цена за период</h3>
        </div>
      </div>

      <div class="procurement-note">
        Это <strong>средняя цена за выбранный период</strong>,
        рассчитанная как сумма прихода / количество прихода.
        Это пока не «последняя цена накладной».
      </div>

      <div class="procurement-price-table">
        ${rows.map((row) => `
          <div class="procurement-price-row">
            <div>
              <strong>${escapeHtml(row.name)}</strong>
              <small>${escapeHtml(row.code || '')} · ${escapeHtml(row.category || '')}</small>
            </div>
            <div>
              <strong>${procurementAveragePrice(row)}</strong>
              <small>${money.format(row.value || 0)} закуплено</small>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderProcurementFuture(kind) {
  const texts = {
    documents: {
      title: 'Приходные накладные',
      text:
        'Здесь будет журнал реальных документов: номер, дата, поставщик, склад, сумма и строки накладной.'
    },
    suppliers: {
      title: 'Поставщики',
      text:
        'Здесь появятся рейтинг поставщиков, доля закупок, отклонение от лучшей цены и потенциальная переплата.'
    },
    matrix: {
      title: 'Матрица закупочных цен',
      text:
        'Матрица будет строиться на выбранную дату: последняя известная цена каждого поставщика не позднее этой даты.'
    }
  };

  const item = texts[kind] || texts.documents;

  return `
    <section class="procurement-card procurement-future">
      <span>СЛЕДУЮЩИЙ ИСТОЧНИК ДАННЫХ</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>

      <div class="procurement-future-list">
        <div>✓ Интерфейс и структура аналитики уже определены</div>
        <div>✓ ОСВ и закупочное движение берём из iikoOffice</div>
        <div>→ Нужен один Fiddler-захват открытия приходных накладных в iikoOffice</div>
      </div>
    </section>
  `;
}

function renderDocuments() {
  configureMainControls({
    showStore: true,
    showSearch: true,
    showBalanceFilters: false,
    showDates: true
  });

  const data = state.procurement;

  if (!data) {
    loadDocuments();
    return;
  }

  const tabs = [
    ['overview', 'Обзор'],
    ['prices', 'Цены'],
    ['documents', 'Документы'],
    ['suppliers', 'Поставщики'],
    ['matrix', 'Матрица']
  ];

  let body = '';

  if (state.procurementTab === 'overview') {
    body = renderProcurementOverview(data);
  } else if (state.procurementTab === 'prices') {
    body = renderProcurementPrices(data);
  } else {
    body = renderProcurementFuture(
      state.procurementTab
    );
  }

  metrics([]);

  $('#content').innerHTML = `
    <div class="procurement-header">
      <div>
        <span class="dashboard-eyebrow">Документы</span>
        <h2>Закупки и цены</h2>
        <p>
          Управленческий слой над документами iikoOffice.
          Сейчас уже считаем то, что достоверно доступно из ОСВ.
        </p>
      </div>

      <div class="procurement-total">
        <span>Закупки за период</span>
        <strong>${money.format(data.summary?.purchaseValue || 0)}</strong>
      </div>
    </div>

    <div class="procurement-tabs">
      ${tabs.map(([value, label]) => `
        <button
          type="button"
          class="${state.procurementTab === value ? 'active' : ''}"
          data-procurement-tab="${value}"
        >${escapeHtml(label)}</button>
      `).join('')}
    </div>

    ${body}

    ${(data.failedStores || []).length ? `
      <div class="dashboard-warning">
        Не удалось получить ОСВ по ${data.failedStores.length} складам.
      </div>
    ` : ''}

    <div class="dashboard-source">
      ${escapeHtml(data.source || 'iikoOffice')}
      · ${data.cache?.cached ? 'кэш' : `${fmt.format(data.performance?.totalMs || 0)} мс`}
    </div>
  `;

  $$('[data-procurement-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.procurementTab =
        button.dataset.procurementTab;
      renderDocuments();
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


async function fetchTurnoverForStore(store, { forceRefresh = false } = {}) {
  if (!state.from || !state.to) {
    const today = isoDateLocal(new Date());
    state.from = today;
    state.to = today;
    $('#dateFrom').value = today;
    $('#dateTo').value = today;
  }

  const params = new URLSearchParams({
    store: store.name,
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

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function mergeTurnoverPayloads(payloads) {
  const map = new Map();
  const numericFields = [
    'openQty','openAmt','purchaseQty','purchaseAmt','salesQty','salesAmt',
    'transferQty','transferAmt','writeoffQty','writeoffAmt','inventoryQty','inventoryAmt',
    'outgoingInvoiceQty','outgoingInvoiceAmt','productionQty','productionAmt',
    'transformationQty','transformationAmt','returnedQty','returnedAmt',
    'incomingReturnedQty','incomingReturnedAmt','disassembleQty','disassembleAmt',
    'costCorrection','otherQty','otherAmt','closeQty','closeAmt'
  ];

  for (const payload of payloads) {
    for (const row of payload.rows || []) {
      const key = String(row.id || row.code || row.name || '');
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, { ...row });
        continue;
      }

      const target = map.get(key);
      for (const field of numericFields) {
        target[field] = Number(target[field] || 0) + Number(row[field] || 0);
      }
    }
  }

  return {
    ok: true,
    storeName: 'Все склады',
    period: {
      from: state.from,
      to: state.to
    },
    rows: [...map.values()]
  };
}

async function apiTurnover({ forceRefresh = false } = {}) {
  if (state.storeId === '__ALL__') {
    const payloads = await Promise.all(
      LIVE_STORES.map((store) =>
        fetchTurnoverForStore(store, { forceRefresh })
      )
    );
    return mergeTurnoverPayloads(payloads);
  }

  const selectedStore = LIVE_STORES.find((store) =>
    String(store.id) === String(state.storeId)
  ) || LIVE_STORES[0];

  return fetchTurnoverForStore(selectedStore, { forceRefresh });
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


function dashboardDateRange(period) {
  const now = new Date();

  if (period === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return {
      from: isoDateLocal(from),
      to: isoDateLocal(now)
    };
  }

  if (period === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return {
      from: isoDateLocal(from),
      to: isoDateLocal(now)
    };
  }

  return {
    from: isoDateLocal(now),
    to: isoDateLocal(now)
  };
}

function signedMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) < 0.005) return money.format(0);
  return `${n > 0 ? '+' : '−'}${money.format(Math.abs(n))}`;
}

function dashboardQty(value, unit = '') {
  const n = Number(value || 0);
  return `${fmt.format(n)}${unit ? ` ${escapeHtml(unit)}` : ''}`;
}

async function apiDashboard({ forceRefresh = false } = {}) {
  const range = dashboardDateRange(state.dashboardPeriod);
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    scope: state.dashboardScope
  });

  if (state.dashboardScope === 'store') {
    const realStoreId =
      state.storeId === '__ALL__'
        ? LIVE_STORES[0]?.id
        : state.storeId;

    if (realStoreId) params.set('storeId', realStoreId);
  }

  if (forceRefresh) {
    params.set('_', String(Date.now()));
  }

  const response = await apiFetch(
    `${cfg.workerUrl}/api/dashboard?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store'
    }
  );

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function loadDashboard({ forceRefresh = false } = {}) {
  if (state.dashboardLoading) return;

  state.dashboardLoading = true;
  state.dashboardDetail = '';

  configureMainControls({
    showStore: false,
    showSearch: false,
    showBalanceFilters: false,
    showDates: false
  });

  metrics([]);

  $('#content').innerHTML = `
    <div class="dashboard-loading">
      <span class="dashboard-spinner"></span>
      <strong>Собираем дашборд…</strong>
      <small>ОСВ по доступным складам</small>
    </div>
  `;

  try {
    state.dashboard = await apiDashboard({ forceRefresh });
    renderDashboard();
  } catch (error) {
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Не удалось построить дашборд</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
  } finally {
    state.dashboardLoading = false;
  }
}

function dashboardRoleName() {
  return authState.me?.roleLabel || currentConnection()?.roleLabel || '';
}

function dashboardStoreOptions() {
  const role = authState.me?.role || '';
  const maySeeAll = ['OWNER', 'MANAGING', 'MANAGER'].includes(role);

  return `
    <button
      type="button"
      class="dashboard-scope-chip ${state.dashboardScope === 'role' ? 'active' : ''}"
      data-dashboard-scope="role"
    >${['CHEF', 'BAR_MANAGER'].includes(role) ? 'Мои склады' : 'По роли'}</button>

    ${maySeeAll ? `
      <button
        type="button"
        class="dashboard-scope-chip ${state.dashboardScope === 'all' ? 'active' : ''}"
        data-dashboard-scope="all"
      >Весь ресторан</button>
    ` : ''}

    <button
      type="button"
      class="dashboard-scope-chip ${state.dashboardScope === 'store' ? 'active' : ''}"
      data-dashboard-scope="store"
    >Один склад</button>
  `;
}

function dashboardKpis(data) {
  const s = data.summary || {};
  const role = authState.me?.role || '';

  if (role === 'CHEF' || role === 'BAR_MANAGER') {
    return [
      {
        label: 'Запасы сейчас',
        value: money.format(s.closeValue || 0),
        sub: `${s.storesCount || 0} склад(а)`,
        tone: ''
      },
      {
        label: 'Списания',
        value: money.format(s.writeoffCost || 0),
        sub: 'по себестоимости',
        tone: Number(s.writeoffCost || 0) > 0 ? 'warn' : ''
      },
      {
        label: 'Отрицательные',
        value: fmt.format(s.negativeCount || 0),
        sub: 'позиций',
        tone: Number(s.negativeCount || 0) > 0 ? 'danger' : 'good'
      },
      {
        label: 'Закончились',
        value: fmt.format(s.ranOutCount || 0),
        sub: 'за период',
        tone: Number(s.ranOutCount || 0) > 0 ? 'warn' : ''
      }
    ];
  }

  return [
    {
      label: 'Запасы сейчас',
      value: money.format(s.closeValue || 0),
      sub: `на начало ${money.format(s.openValue || 0)}`,
      tone: ''
    },
    {
      label: 'Изменение запасов',
      value: signedMoney(s.deltaValue || 0),
      sub: 'по себестоимости',
      tone: Number(s.deltaValue || 0) < 0 ? 'warn' : 'good'
    },
    {
      label: 'Приход',
      value: money.format(Math.abs(Number(s.incomingValue || 0))),
      sub: 'по себестоимости',
      tone: ''
    },
    {
      label: 'Расход по продажам',
      value: money.format(Math.abs(Number(s.salesCost || 0))),
      sub: 'это не выручка',
      tone: ''
    },
    {
      label: 'Списания',
      value: money.format(s.writeoffCost || 0),
      sub: 'по себестоимости',
      tone: Number(s.writeoffCost || 0) > 0 ? 'warn' : ''
    },
    {
      label: 'Отрицательные',
      value: fmt.format(s.negativeCount || 0),
      sub: 'позиций',
      tone: Number(s.negativeCount || 0) > 0 ? 'danger' : 'good'
    }
  ];
}

function dashboardListCard(title, rows, valueRenderer, emptyText = 'Нет данных') {
  return `
    <section class="dashboard-card dashboard-list-card">
      <div class="dashboard-card__head">
        <h3>${escapeHtml(title)}</h3>
      </div>

      <div class="dashboard-ranked-list">
        ${rows?.length
          ? rows.map((row, index) => `
            <div class="dashboard-ranked-item">
              <span class="dashboard-rank">${index + 1}</span>
              <div class="dashboard-ranked-name">
                <strong>${escapeHtml(row.name || 'Товар')}</strong>
                <small>
                  ${escapeHtml(row.storeName || '')}
                  ${row.productNum ? ` · ${escapeHtml(row.productNum)}` : ''}
                </small>
              </div>
              <div class="dashboard-ranked-value">
                ${valueRenderer(row)}
              </div>
            </div>
          `).join('')
          : `<div class="dashboard-empty">${escapeHtml(emptyText)}</div>`
        }
      </div>
    </section>
  `;
}

function renderDashboardDetail(type) {
  const data = state.dashboard;
  if (!data) return;

  let title = '';
  let rows = [];

  if (type === 'negative') {
    title = 'Отрицательные остатки';
    rows = data.negatives || [];
  } else if (type === 'ranout') {
    title = 'Закончились за период';
    rows = data.ranOut || [];
  } else if (type === 'reconciliation') {
    title = 'Контрольные расхождения ОСВ';
    rows = data.reconciliation || [];
  }

  state.dashboardDetail = type;

  $('#dashboardDetail').innerHTML = `
    <div class="dashboard-detail-head">
      <strong>${escapeHtml(title)}</strong>
      <button type="button" class="dashboard-detail-close" data-close-dashboard-detail>×</button>
    </div>

    <div class="dashboard-detail-list">
      ${rows.length ? rows.map((row) => `
        <div class="dashboard-detail-row">
          <div>
            <strong>${escapeHtml(row.name || 'Товар')}</strong>
            <small>${escapeHtml(row.storeName || '')}</small>
          </div>
          <div>
            <strong>${dashboardQty(row.closeQty, row.unit)}</strong>
            <small>${money.format(row.closeAmt || 0)}</small>
          </div>
        </div>
      `).join('') : `
        <div class="dashboard-empty">Нет позиций</div>
      `}
    </div>
  `;

  $('#dashboardDetail').hidden = false;

  $('[data-close-dashboard-detail]')?.addEventListener('click', () => {
    $('#dashboardDetail').hidden = true;
    state.dashboardDetail = '';
  });

  $('#dashboardDetail').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function renderDashboard() {
  const data = state.dashboard;

  configureMainControls({
    showStore: state.dashboardScope === 'store',
    showSearch: false,
    showBalanceFilters: false,
    showDates: false
  });

  metrics([]);

  if (!data) {
    loadDashboard();
    return;
  }

  const s = data.summary || {};
  const kpis = dashboardKpis(data);
  const role = authState.me?.role || '';

  const problemCount =
    Number(s.negativeCount || 0) +
    Number(s.ranOutCount || 0) +
    Number(s.reconciliationCount || 0);

  $('#content').innerHTML = `
    <div class="dashboard-shell">
      <div class="dashboard-topbar">
        <div>
          <span class="dashboard-eyebrow">${escapeHtml(dashboardRoleName())}</span>
          <h2>Дашборд</h2>
          <p>
            ${escapeHtml(data.connectionName || currentConnection()?.name || '')}
            · ${escapeHtml(data.period?.from || '')}
            ${data.period?.from !== data.period?.to
              ? `— ${escapeHtml(data.period?.to || '')}`
              : ''}
          </p>
        </div>

        <div class="dashboard-periods">
          <button class="${state.dashboardPeriod === 'today' ? 'active' : ''}" data-dashboard-period="today">Сегодня</button>
          <button class="${state.dashboardPeriod === '7d' ? 'active' : ''}" data-dashboard-period="7d">7 дней</button>
          <button class="${state.dashboardPeriod === '30d' ? 'active' : ''}" data-dashboard-period="30d">30 дней</button>
        </div>
      </div>

      <div class="dashboard-scope-row">
        ${dashboardStoreOptions()}
      </div>

      <div class="dashboard-kpi-grid">
        ${kpis.map((kpi) => `
          <article class="dashboard-kpi ${kpi.tone ? `is-${kpi.tone}` : ''}">
            <span>${escapeHtml(kpi.label)}</span>
            <strong>${kpi.value}</strong>
            <small>${escapeHtml(kpi.sub)}</small>
          </article>
        `).join('')}
      </div>

      <section class="dashboard-attention ${problemCount ? 'has-problems' : ''}">
        <div class="dashboard-card__head">
          <div>
            <span class="dashboard-eyebrow">Контроль</span>
            <h3>Требует внимания</h3>
          </div>
          <strong class="dashboard-attention-total">${fmt.format(problemCount)}</strong>
        </div>

        <div class="dashboard-attention-grid">
          <button type="button" data-dashboard-detail="negative">
            <span>Отрицательные</span>
            <strong>${fmt.format(s.negativeCount || 0)}</strong>
          </button>
          <button type="button" data-dashboard-detail="ranout">
            <span>Закончились</span>
            <strong>${fmt.format(s.ranOutCount || 0)}</strong>
          </button>
          <button type="button" data-dashboard-detail="reconciliation">
            <span>Расхождения ОСВ</span>
            <strong>${fmt.format(s.reconciliationCount || 0)}</strong>
          </button>
        </div>
      </section>

      <div id="dashboardDetail" class="dashboard-detail" hidden></div>

      <section class="dashboard-card">
        <div class="dashboard-card__head">
          <div>
            <span class="dashboard-eyebrow">Склады</span>
            <h3>Стоимость запасов</h3>
          </div>
          <strong>${money.format(s.closeValue || 0)}</strong>
        </div>

        <div class="dashboard-store-list">
          ${(data.stores || []).map((store) => {
            const max = Math.max(
              1,
              ...(data.stores || []).map((x) => Math.abs(Number(x.closeValue || 0)))
            );
            const width = Math.max(
              2,
              Math.min(100, Math.abs(Number(store.closeValue || 0)) / max * 100)
            );

            return `
              <div class="dashboard-store-row">
                <div class="dashboard-store-row__head">
                  <strong>${escapeHtml(store.name)}</strong>
                  <span>${money.format(store.closeValue || 0)}</span>
                </div>
                <div class="dashboard-store-track">
                  <i style="width:${width}%"></i>
                </div>
                <div class="dashboard-store-meta">
                  <span>${signedMoney(store.deltaValue || 0)}</span>
                  <span>${fmt.format(store.negativeCount || 0)} отриц.</span>
                  <span>${fmt.format(store.ranOutCount || 0)} законч.</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <div class="dashboard-two-column">
        ${dashboardListCard(
          role === 'CHEF' || role === 'BAR_MANAGER'
            ? 'Больше всего уменьшились запасы'
            : 'Наибольшее снижение запасов',
          data.topDecrease || [],
          (row) => `
            <strong>${money.format(row.rankValue || 0)}</strong>
            <small>${dashboardQty(row.openQty - row.closeQty, row.unit)}</small>
          `,
          'Снижения запасов нет'
        )}

        ${dashboardListCard(
          'Больше всего списали',
          data.topWriteoff || [],
          (row) => `
            <strong>${money.format(row.rankValue || 0)}</strong>
            <small>${dashboardQty(Math.abs(row.writeoffQty || 0), row.unit)}</small>
          `,
          'Списаний нет'
        )}
      </div>

      ${role === 'MANAGING' || role === 'MANAGER' || role === 'OWNER'
        ? `
          <div class="dashboard-two-column">
            ${dashboardListCard(
              'Наибольший складской расход по продажам',
              data.topSalesUsage || [],
              (row) => `
                <strong>${money.format(row.rankValue || 0)}</strong>
                <small>${dashboardQty(Math.abs(row.salesQty || 0), row.unit)}</small>
              `,
              'Нет расхода по продажам'
            )}

            ${dashboardListCard(
              'Самые дорогие остатки',
              data.topStock || [],
              (row) => `
                <strong>${money.format(row.rankValue || 0)}</strong>
                <small>${dashboardQty(row.closeQty || 0, row.unit)}</small>
              `,
              'Нет остатков'
            )}
          </div>

          <section class="dashboard-card dashboard-movement-card">
            <div class="dashboard-card__head">
              <div>
                <span class="dashboard-eyebrow">ОСВ</span>
                <h3>Движение по себестоимости</h3>
              </div>
            </div>

            <div class="dashboard-movement-grid">
              <div><span>Приход</span><strong>${money.format(Math.abs(Number(s.incomingValue || 0)))}</strong></div>
              <div><span>Расход по продажам</span><strong>${money.format(Math.abs(Number(s.salesCost || 0)))}</strong></div>
              <div><span>Списания</span><strong>${money.format(Math.abs(Number(s.writeoffCost || 0)))}</strong></div>
              <div><span>Инвентаризация</span><strong>${signedMoney(s.inventoryEffect || 0)}</strong></div>
              <div><span>Производство</span><strong>${signedMoney(s.productionEffect || 0)}</strong></div>
              <div><span>Перемещения</span><strong>${signedMoney(s.transferEffect || 0)}</strong></div>
            </div>
          </section>
        `
        : ''
      }

      ${(data.failedStores || []).length
        ? `
          <div class="dashboard-warning">
            Не удалось получить данные по ${data.failedStores.length} складам.
          </div>
        `
        : ''
      }

      <div class="dashboard-source">
        iikoOffice ОСВ · ${fmt.format(s.productRows || 0)} строк ·
        ${data.cache?.cached ? 'кэш' : `${fmt.format(data.performance?.totalMs || 0)} мс`}
      </div>
    </div>
  `;

  $$('[data-dashboard-period]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dashboardPeriod = button.dataset.dashboardPeriod;
      state.dashboard = null;
      loadDashboard();
    });
  });

  $$('[data-dashboard-scope]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dashboardScope = button.dataset.dashboardScope;
      state.dashboard = null;
      loadDashboard();
    });
  });

  $$('[data-dashboard-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      renderDashboardDetail(button.dataset.dashboardDetail);
    });
  });
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
  } else if (state.tab === 'dashboard') {
    if (state.dashboard) {
      renderDashboard();
    } else if (!state.dashboardLoading) {
      loadDashboard();
    }
  } else if (['autoorder', 'supplierPrices', 'olap'].includes(state.tab)) {
    configureMainControls({
      showStore: false,
      showSearch: false,
      showBalanceFilters: false,
      showDates: false
    });
    const names = {
      autoorder: 'Автозаказ / Автозаявки',
      supplierPrices: 'Прайс-листы поставщиков',
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
    state.procurement = null;
    loadDocuments({ forceRefresh: true });
  } else if (state.tab === 'dishes') {
    state.dishes = [];
    loadDishes({ forceRefresh: true });
  } else if (state.tab === 'turnover') {
    state.turnoverRows = [];
    loadTurnover({ forceRefresh: true });
  } else if (state.tab === 'dashboard') {
    state.dashboard = null;
    loadDashboard({ forceRefresh: true });
  } else {
    loadBalances({ forceRefresh: true, keepVisible: true });
  }
});


$('#storePickerButton').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleStorePicker();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.store-picker-field')) {
    closeStorePicker();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeStorePicker();
  }
});

$('#storeFilter').addEventListener('change', (event) => {
  state.storeId = event.target.value;
  state.page = 1;
  fillStores();

  if (state.tab === 'balances') {
    state.liveStockLoaded = false;
    loadBalances();
  } else if (state.tab === 'turnover') {
    state.turnoverRows = [];
    loadTurnover();
  } else if (state.tab === 'dashboard' && state.dashboardScope === 'store') {
    state.dashboard = null;
    loadDashboard();
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
    state.procurement = null;
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
    // Authentication is intentionally paused until the product sections are complete.
    hideAuthGate();
    document.body.classList.add('authenticated');

    authState.me = {
      user: { name: 'Разработка' },
      role: 'OWNER',
      roleLabel: 'Разработка',
      permissions: ['*'],
      connections: []
    };

    setDefaultDates();
    fillStores();
    applyPermissions();

    $('#connectionBtn').hidden = true;
    $('#connectionStatus').textContent = 'ТС — Сургут · iikoOffice';

    render();
  } catch (error) {
    $('#content').innerHTML = `
      <div class="empty-state">
        <strong>Ошибка запуска</strong>
        ${escapeHtml(error.message)}
      </div>
    `;
  }
})();


window.addEventListener('resize', () => {
  relocateContextControls();
});


document.addEventListener('DOMContentLoaded', () => {
  const connectionButton = document.querySelector('#connectionBtn');
  if (connectionButton) connectionButton.hidden = true;
});
