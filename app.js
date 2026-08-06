import { demoData } from './demo-data.js';

const cfg = window.APP_CONFIG;
const state = { tab: 'balances', data: null, query: '', storeId: '', from: '', to: '' };
const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });

function path(obj, key) { return key.split('.').reduce((v, k) => v?.[k], obj); }
function mapItems(items, schema) { return (items || []).map(x => Object.fromEntries(Object.entries(schema).map(([to, from]) => [to, path(x, from)]))); }
function toast(message) { const el=$('#toast'); el.textContent=message; el.hidden=false; setTimeout(()=>el.hidden=true,3500); }
function nameBy(list,id){ return list.find(x=>x.id===id)?.name || id || '—'; }
function inPeriod(date){ return (!state.from || date>=state.from) && (!state.to || date<=state.to); }
function matches(...values){ const q=state.query.trim().toLowerCase(); return !q || values.some(v=>String(v??'').toLowerCase().includes(q)); }

async function api(action, payload={}) {
  const res = await fetch(`${cfg.workerUrl}/api/${encodeURIComponent(action)}`, {
    method:'POST', headers:{'Content-Type':'application/json','X-Telegram-Init-Data':window.Telegram?.WebApp?.initData || ''}, body:JSON.stringify(payload)
  });
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body.data ?? body;
}

async function loadAll() {
  $('#connectionStatus').textContent='Загрузка данных…';
  $('#content').innerHTML='<div class="loading">Получаем данные из iiko…</div>';
  try {
    if (cfg.demoMode) state.data = structuredClone(demoData);
    else {
      const entries = await Promise.all(Object.entries(cfg.actions).map(async ([key, action]) => [key, await api(action)]));
      const raw = Object.fromEntries(entries);
      state.data = {
        stores: mapItems(raw.stores, cfg.mapping.store), products: mapItems(raw.products, cfg.mapping.product),
        balances: mapItems(raw.balances, cfg.mapping.balance), documents: mapItems(raw.documents, cfg.mapping.document),
        inventories: mapItems(raw.inventories, cfg.mapping.inventory), dishes: mapItems(raw.dishes, cfg.mapping.dish),
        movements: mapItems(raw.movements, cfg.mapping.movement)
      };
    }
    fillStores(); render();
    $('#connectionStatus').textContent = cfg.demoMode ? 'Демо-данные' : `Обновлено: ${new Date().toLocaleTimeString('ru-RU')}`;
  } catch (e) {
    $('#connectionStatus').textContent='Ошибка подключения';
    $('#content').innerHTML=`<div class="empty"><b>Не удалось получить данные</b><br>${escapeHtml(e.message)}<br><br>Проверьте адрес Worker, CORS и настройки ROUTES.</div>`;
    toast(e.message);
  }
}

function fillStores(){ const select=$('#storeFilter'); const value=select.value; select.innerHTML='<option value="">Все склады</option>'+state.data.stores.map(s=>`<option value="${esc(s.id)}">${escapeHtml(s.name)}</option>`).join(''); select.value=value; }
function esc(v){ return String(v??'').replace(/"/g,'&quot;'); }
function escapeHtml(v){ const d=document.createElement('div'); d.textContent=String(v??''); return d.innerHTML; }
function table(headers, rows){ if(!rows.length)return '<div class="empty">Нет данных по выбранным фильтрам</div>'; return `<div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`; }
function metrics(items){ $('#summary').innerHTML=items.map(([label,value])=>`<div class="card metric"><span class="muted">${label}</span><strong>${value}</strong></div>`).join(''); }

function render(){ if(!state.data)return; document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab)); ({balances:renderBalances,documents:renderDocuments,inventories:renderInventories,dishes:renderDishes,turnover:renderTurnover}[state.tab])(); }

function renderBalances(){
  const rows=state.data.balances.filter(x=>(!state.storeId||x.storeId===state.storeId)).map(x=>({...x,product:state.data.products.find(p=>p.id===x.productId)})).filter(x=>matches(x.product?.name,x.product?.sku,nameBy(state.data.stores,x.storeId)));
  metrics([['Позиций',fmt.format(rows.length)],['Количество',fmt.format(rows.reduce((s,x)=>s+Number(x.quantity||0),0))],['Стоимость',money.format(rows.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.cost||0),0))],['Отрицательных',fmt.format(rows.filter(x=>x.quantity<0).length)]]);
  $('#content').innerHTML=table(['Товар','Артикул','Склад','Остаток','Ед.','Себестоимость','Сумма'],rows.map(x=>`<tr><td>${escapeHtml(x.product?.name||x.productId)}</td><td>${escapeHtml(x.product?.sku||'—')}</td><td>${escapeHtml(nameBy(state.data.stores,x.storeId))}</td><td class="${x.quantity<0?'negative':''}">${fmt.format(x.quantity)}</td><td>${escapeHtml(x.product?.unit||'')}</td><td>${money.format(x.cost||0)}</td><td>${money.format((x.quantity||0)*(x.cost||0))}</td></tr>`));
}

function renderDocuments(){
  const rows=state.data.documents.filter(x=>(!state.storeId||x.storeId===state.storeId)&&inPeriod(x.date)&&matches(x.type,x.number,nameBy(state.data.stores,x.storeId)));
  metrics([['Документов',rows.length],['Общая сумма',money.format(rows.reduce((s,x)=>s+Number(x.amount||0),0))],['Приходов',rows.filter(x=>/приход/i.test(x.type)).length],['Списаний',rows.filter(x=>/спис/i.test(x.type)).length]]);
  $('#content').innerHTML=table(['Дата','Тип','Номер','Склад','Сумма'],rows.map(x=>`<tr data-clickable data-id="${esc(x.id)}"><td>${escapeHtml(x.date)}</td><td>${escapeHtml(x.type)}</td><td>${escapeHtml(x.number)}</td><td>${escapeHtml(nameBy(state.data.stores,x.storeId))}</td><td>${money.format(x.amount||0)}</td></tr>`));
  document.querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>showDocument(tr.dataset.id));
}
function showDocument(id){ const d=state.data.documents.find(x=>x.id===id); $('#detailsContent').innerHTML=`<h2>${escapeHtml(d.type)} №${escapeHtml(d.number)}</h2><p>${escapeHtml(d.date)} · ${escapeHtml(nameBy(state.data.stores,d.storeId))}</p>${table(['Товар','Количество','Цена','Сумма'],(d.items||[]).map(i=>`<tr><td>${escapeHtml(nameBy(state.data.products,i.productId))}</td><td>${fmt.format(i.quantity)}</td><td>${money.format(i.price||0)}</td><td>${money.format((i.quantity||0)*(i.price||0))}</td></tr>`))}`; $('#detailsDialog').showModal(); }

function renderInventories(){
 const rows=state.data.inventories.filter(x=>(!state.storeId||x.storeId===state.storeId)&&inPeriod(x.date)&&matches(x.status,nameBy(state.data.stores,x.storeId)));
 const diffs=rows.flatMap(x=>x.items||[]).reduce((s,x)=>s+Number(x.diff||0),0);
 metrics([['Инвентаризаций',rows.length],['Общее отклонение',fmt.format(diffs)],['Недостач',rows.flatMap(x=>x.items||[]).filter(x=>x.diff<0).length],['Излишков',rows.flatMap(x=>x.items||[]).filter(x=>x.diff>0).length]]);
 $('#content').innerHTML=table(['Дата','Склад','Статус','Позиций','Отклонение'],rows.map(x=>{const diff=(x.items||[]).reduce((s,i)=>s+Number(i.diff||0),0);return `<tr data-clickable data-inv="${esc(x.id)}"><td>${x.date}</td><td>${escapeHtml(nameBy(state.data.stores,x.storeId))}</td><td>${escapeHtml(x.status)}</td><td>${x.items?.length||0}</td><td class="${diff<0?'negative':'positive'}">${fmt.format(diff)}</td></tr>`;}));
 document.querySelectorAll('tr[data-inv]').forEach(tr=>tr.onclick=()=>{const x=rows.find(r=>r.id===tr.dataset.inv);$('#detailsContent').innerHTML=`<h2>Инвентаризация ${escapeHtml(x.date)}</h2>${table(['Товар','Учёт','Факт','Разница'],(x.items||[]).map(i=>`<tr><td>${escapeHtml(nameBy(state.data.products,i.productId))}</td><td>${fmt.format(i.book)}</td><td>${fmt.format(i.fact)}</td><td class="${i.diff<0?'negative':'positive'}">${fmt.format(i.diff)}</td></tr>`))}`;$('#detailsDialog').showModal();});
}

function renderDishes(){ const rows=state.data.dishes.filter(x=>matches(x.name,x.category)); metrics([['Блюд',rows.length],['Средняя себестоимость',money.format(rows.reduce((s,x)=>s+Number(x.cost||0),0)/(rows.length||1))],['Ингредиентов',rows.reduce((s,x)=>s+(x.ingredients?.length||0),0)],['Категорий',new Set(rows.map(x=>x.category)).size]]); $('#content').innerHTML=table(['Блюдо','Категория','Порция','Себестоимость','Ингредиентов'],rows.map(x=>`<tr data-clickable data-dish="${esc(x.id)}"><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.portion)}</td><td>${money.format(x.cost||0)}</td><td>${x.ingredients?.length||0}</td></tr>`)); document.querySelectorAll('tr[data-dish]').forEach(tr=>tr.onclick=()=>{const x=rows.find(r=>r.id===tr.dataset.dish);$('#detailsContent').innerHTML=`<h2>${escapeHtml(x.name)}</h2>${table(['Ингредиент','Количество','Ед.','Стоимость'],(x.ingredients||[]).map(i=>`<tr><td>${escapeHtml(i.name)}</td><td>${fmt.format(i.quantity)}</td><td>${escapeHtml(i.unit)}</td><td>${money.format(i.cost||0)}</td></tr>`))}`;$('#detailsDialog').showModal();}); }

function renderTurnover(){
 const group=new Map();
 for(const m of state.data.movements.filter(x=>(!state.storeId||x.storeId===state.storeId)&&inPeriod(x.date))){const key=`${m.storeId}:${m.productId}`;if(!group.has(key))group.set(key,{storeId:m.storeId,productId:m.productId,openingQty:0,openingAmount:0,inQty:0,inAmount:0,outQty:0,outAmount:0});const r=group.get(key),q=Number(m.quantity||0),a=Number(m.amount||0);if(m.type==='opening'){r.openingQty+=q;r.openingAmount+=a}else if(q>=0){r.inQty+=q;r.inAmount+=a}else{r.outQty+=Math.abs(q);r.outAmount+=Math.abs(a)}}
 const rows=[...group.values()].map(r=>({...r,closingQty:r.openingQty+r.inQty-r.outQty,closingAmount:r.openingAmount+r.inAmount-r.outAmount})).filter(r=>matches(nameBy(state.data.products,r.productId),nameBy(state.data.stores,r.storeId)));
 metrics([['Строк ОСВ',rows.length],['Начальный остаток',money.format(rows.reduce((s,x)=>s+x.openingAmount,0))],['Оборот',money.format(rows.reduce((s,x)=>s+x.inAmount+x.outAmount,0))],['Конечный остаток',money.format(rows.reduce((s,x)=>s+x.closingAmount,0))]]);
 $('#content').innerHTML=table(['Товар','Склад','Нач. кол-во','Нач. сумма','Приход','Приход сумма','Расход','Расход сумма','Кон. кол-во','Кон. сумма'],rows.map(r=>`<tr><td>${escapeHtml(nameBy(state.data.products,r.productId))}</td><td>${escapeHtml(nameBy(state.data.stores,r.storeId))}</td><td>${fmt.format(r.openingQty)}</td><td>${money.format(r.openingAmount)}</td><td>${fmt.format(r.inQty)}</td><td>${money.format(r.inAmount)}</td><td>${fmt.format(r.outQty)}</td><td>${money.format(r.outAmount)}</td><td class="${r.closingQty<0?'negative':''}">${fmt.format(r.closingQty)}</td><td>${money.format(r.closingAmount)}</td></tr>`));
}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
$('#refreshBtn').onclick=loadAll;
$('#storeFilter').onchange=e=>{state.storeId=e.target.value;render();};
$('#searchInput').oninput=e=>{state.query=e.target.value;render();};
$('#dateFrom').onchange=e=>{state.from=e.target.value;render();};
$('#dateTo').onchange=e=>{state.to=e.target.value;render();};
const tg=window.Telegram?.WebApp; if(tg){tg.ready();tg.expand();}
loadAll();
