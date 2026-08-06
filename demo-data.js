export const demoData = {
  stores: [{id:'s1',name:'Основной склад'},{id:'s2',name:'Кухня'}],
  products: [
    {id:'p1',name:'Мука пшеничная',sku:'1001',unit:'кг'},
    {id:'p2',name:'Молоко 3,2%',sku:'1002',unit:'л'},
    {id:'p3',name:'Говядина',sku:'1003',unit:'кг'},
    {id:'p4',name:'Картофель',sku:'1004',unit:'кг'}
  ],
  balances: [
    {productId:'p1',storeId:'s1',quantity:32.4,cost:52.3},
    {productId:'p2',storeId:'s2',quantity:-2,cost:91},
    {productId:'p3',storeId:'s2',quantity:18.7,cost:645},
    {productId:'p4',storeId:'s1',quantity:76,cost:38.5}
  ],
  documents: [
    {id:'d1',date:'2026-08-05',type:'Приход',number:'ПН-128',storeId:'s1',amount:34500,items:[{productId:'p1',quantity:50,price:51},{productId:'p4',quantity:100,price:37}]},
    {id:'d2',date:'2026-08-06',type:'Списание',number:'СП-46',storeId:'s2',amount:2120,items:[{productId:'p2',quantity:4,price:91},{productId:'p3',quantity:2.7,price:650}]}
  ],
  inventories: [{id:'i1',date:'2026-08-06',storeId:'s2',status:'Проведена',items:[{productId:'p2',book:3,fact:1,diff:-2},{productId:'p3',book:18.2,fact:18.7,diff:.5}]}],
  dishes: [{id:'r1',name:'Бургер с говядиной',category:'Основное меню',portion:'320 г',cost:188,ingredients:[{name:'Говядина',quantity:.16,unit:'кг',cost:103.2},{name:'Булочка',quantity:1,unit:'шт',cost:31},{name:'Овощи и соус',quantity:1,unit:'порц',cost:53.8}]}],
  movements: [
    {id:'m1',date:'2026-08-01',productId:'p1',storeId:'s1',type:'opening',quantity:10,amount:500},
    {id:'m2',date:'2026-08-05',productId:'p1',storeId:'s1',type:'receipt',quantity:50,amount:2550,documentId:'d1'},
    {id:'m3',date:'2026-08-06',productId:'p1',storeId:'s1',type:'expense',quantity:-27.6,amount:-1443,documentId:'d2'},
    {id:'m4',date:'2026-08-01',productId:'p2',storeId:'s2',type:'opening',quantity:8,amount:728},
    {id:'m5',date:'2026-08-06',productId:'p2',storeId:'s2',type:'writeoff',quantity:-10,amount:-910,documentId:'d2'}
  ]
};
