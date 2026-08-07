window.APP_CONFIG = {
  // Реальный Cloudflare Worker.
  workerUrl: "https://iiko-miniapp-proxy.iiko-miniapp-proxy.workers.dev",

  // false = использовать реальные данные iikoWeb.
  demoMode: false,

  // Сейчас реально подключён складской отчёт.
  warehouse: {
    endpoint: "/api/warehouse",
    storeId: 180832,
    storeName: "Бар Лиличка"
  }
};
