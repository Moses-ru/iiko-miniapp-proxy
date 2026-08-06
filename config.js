window.APP_CONFIG = {
  // После публикации Worker замените адрес ниже.
  workerUrl: "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev",

  // true позволяет открыть интерфейс сразу на тестовых данных.
  demoMode: true,

  // Имена действий совпадают с ROUTES в worker/src/index.js.
  actions: {
    stores: "stores",
    products: "products",
    balances: "balances",
    documents: "documents",
    inventories: "inventories",
    dishes: "dishes",
    movements: "movements"
  },

  // Адаптеры полей. Изменяйте только правые части под ответы вашего iiko API.
  mapping: {
    store: { id: "id", name: "name" },
    product: { id: "id", name: "name", sku: "sku", unit: "unit" },
    balance: { productId: "productId", storeId: "storeId", quantity: "quantity", cost: "cost" },
    document: { id: "id", date: "date", type: "type", number: "number", storeId: "storeId", amount: "amount", items: "items" },
    inventory: { id: "id", date: "date", storeId: "storeId", status: "status", items: "items" },
    dish: { id: "id", name: "name", category: "category", portion: "portion", cost: "cost", ingredients: "ingredients" },
    movement: { id: "id", date: "date", productId: "productId", storeId: "storeId", type: "type", quantity: "quantity", amount: "amount", documentId: "documentId" }
  }
};
