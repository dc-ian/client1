/* TurboParts store, embedded in index.html. Runs inside a shadow root so its styles never clash with the website. */
(function () {
  var h = document.getElementById('tpHost'); if (!h || h.shadowRoot) return;
  var r = h.attachShadow({ mode: 'open' });
  r.innerHTML = '<link rel="stylesheet" href="parts.css">' +
    '<div id="gate"></div>' +
    '<div class="app hide"><aside class="side"><div class="logo"><i></i><div>TurboParts<small>Store &amp; POS</small></div></div>' +
    '<div class="nav" id="nav"></div><div class="foot" id="foot"></div></aside><main class="main" id="main"></main></div>' +
    '<div id="modal"></div><div id="printarea" aria-hidden="true"></div><div id="toast" class="toast hide" role="status"></div>';
  var f = document.createElement('link'); f.rel = 'stylesheet';
  f.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(f);
})();
(() => {
'use strict';
const CATS = ['Motor Oils', 'Brakes', 'Filters', 'Spark Plugs', 'Tires', 'Batteries', 'Accessories'];
const S = { products: [], tax: 0.12, low: 10, cart: {}, view: 'store', filter: 'All', q: '', invq: '',
  user: null, csrf: '', cfg: {}, lastSaleId: 0, paper: '80', autoPrint: false };
const VIEWS = { owner: ['store', 'inv', 'stats'], cashier: ['store'] };   // the server enforces this too
const LABEL = { store: 'Storefront', inv: 'Inventory', stats: 'Sales & Revenue' };
const pref = {
  get(k, d) { try { const v = localStorage.getItem('tp_' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tp_' + k, v); } catch (e) {} },
};
S.paper = pref.get('paper', '80') === '58' ? '58' : '80';
S.autoPrint = pref.get('auto', '0') === '1';
const host = document.getElementById('tpHost'), R = host.shadowRoot;
const $ = s => R.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ftime = t => new Date(String(t).replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const fdate = t => new Date(String(t).replace(' ', 'T')).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const hue = c => (Math.max(0, CATS.indexOf(c)) * 47 + 200) % 360;
const find = id => S.products.find(p => p.id === +id);
const status = p => p.stock <= 0 ? ['Out of stock', 'b-out'] : p.stock <= S.low ? ['Low stock', 'b-low'] : ['In stock', 'b-in'];
const badge = p => { const [t, c] = status(p); return `<span class="badge ${c}">${t}</span>`; };
const media = p => p.image
  ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
  : `<div class="ph" style="--h:${hue(p.category)}"><b>${esc(p.brand || p.category)}</b><span>${esc(p.category)}</span></div>`;

let tt;
function toast(msg, isErr) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.style.opacity = 1;
  clearTimeout(tt); tt = setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.classList.add('hide'), 260); }, 2600);
}
async function api(action, init = {}) {
  const { quiet, ...opts } = init;   // quiet: a 401 here is an answer (wrong password), not an expired session
  opts.credentials = 'same-origin';
  if (opts.method === 'POST') opts.headers = { ...(opts.headers || {}), 'X-CSRF-Token': S.csrf };
  let r, d;
  try { r = await fetch('api.php?action=' + action, opts); } catch (e) { throw new Error('Cannot reach the server. Is Laragon running?'); }
  try { d = await r.json(); } catch (e) { throw new Error('Unexpected server response. Have you run install.php?'); }
  if (r.status === 401 && !quiet && S.user) { signedOut(); throw new Error('Your session ended. Please sign in again.'); }
  if (!r.ok) throw new Error(d.error || 'Request failed.');
  return d;
}
const post = (action, body, quiet) => api(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), quiet });
function applyConfig(c) { S.cfg = c; S.tax = c.tax; S.low = c.low; }
async function loadProducts() { const d = await api('products'); S.products = d.products; applyConfig(d.config); reconcile(); }
function reconcile() {
  for (const id of Object.keys(S.cart)) {
    const p = find(id);
    if (!p || p.stock <= 0) delete S.cart[id]; else if (S.cart[id] > p.stock) S.cart[id] = p.stock;
  }
}
async function run(fn) { try { await fn(); } catch (e) { toast(e.message, true); } }

/* ---------- Modal helpers ---------- */
let sticky = false;   // a sticky modal (forced password change) cannot be dismissed
function openModal(html, isSticky) {
  sticky = !!isSticky;
  $('#modal').innerHTML = `<div class="modal" id="mbg">${html}</div>`;
  $('#mbg').addEventListener('mousedown', e => { if (e.target.id === 'mbg' && !sticky) closeModal(); });
}
const closeModal = () => { sticky = false; $('#modal').innerHTML = ''; };
document.addEventListener('keydown', e => { if (S.active && e.key === 'Escape' && !sticky) closeModal(); });

/* ---------- Navigation ---------- */
$('#nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  S.view = b.dataset.v; location.hash = 'parts/' + S.view; render();
};
function render() {
  R.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
  window.scrollTo(0, 0);
  if (!S.user) return;
  $('#main').onclick = null;
  run(async () => { await loadProducts(); ({ store: renderStore, inv: renderInv, stats: renderStats })[S.view](); });
}

/* ---------- Storefront ---------- */
function renderStore() {
  $('#main').innerHTML = `
  <header class="top"><div><h1>Shop</h1><p>Select parts to build a customer order, or scan a barcode to add one.</p></div>
    <div class="tools"><input id="scan" class="inp search" type="text" placeholder="Scan barcode, then Enter" autocomplete="off" aria-label="Scan or type a barcode">
      <input id="q" class="inp search" type="search" placeholder="Search name, brand or barcode" value="${esc(S.q)}" aria-label="Search products"></div></header>
  <div class="split">
    <section><div class="chips" id="chips"></div><div class="grid" id="grid"></div></section>
    <aside class="card cart" id="cart" aria-label="Current order"></aside>
  </div>
  <button class="cartbar" id="cbar"></button><div class="scrim" id="scrim"></div>`;
  $('#q').oninput = e => { S.q = e.target.value; renderGrid(); };
  $('#q').onkeydown = e => {   // typing or scanning an exact barcode into the search box and pressing Enter adds that item
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim();
    if (v && S.products.some(p => p.barcode && p.barcode.toLowerCase() === v.toLowerCase())) { e.preventDefault(); e.target.value = ''; S.q = ''; renderGrid(); run(() => scan(v)); }
  };
  $('#scan').onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); const v = e.target.value; e.target.value = ''; run(() => scan(v));
  };
  if (matchMedia('(pointer: fine)').matches) $('#scan').focus();   // ready for a USB scanner (skipped on touch screens: no pop-up keyboard)
  $('#chips').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { S.filter = b.dataset.c; renderChips(); renderGrid(); } };
  $('#grid').onclick = e => {
    const a = e.target.closest('[data-add]');
    if (a) { addCart(+a.dataset.add, 1); return; }
    const c = e.target.closest('[data-open]'); if (c) detail(+c.dataset.open);
  };
  $('#grid').onkeydown = e => { if (e.key === 'Enter' && e.target.dataset.open) detail(+e.target.dataset.open); };
  $('#cbar').onclick = () => cartOpen(true);
  $('#scrim').onclick = () => cartOpen(false);
  $('#cart').onclick = cartClick;
  renderChips(); renderGrid(); renderCart();
}
function cartOpen(o) { $('#cart').classList.toggle('open', o); $('#scrim').classList.toggle('on', o); }
function renderChips() {
  const cats = ['All', ...new Set([...CATS, ...S.products.map(p => p.category)])];
  $('#chips').innerHTML = cats.map(c => `<button class="chip ${c === S.filter ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
}
function renderGrid() {
  const q = S.q.trim().toLowerCase();
  const list = S.products.filter(p => (S.filter === 'All' || p.category === S.filter) && (p.name + ' ' + p.brand + ' ' + p.barcode).toLowerCase().includes(q));
  $('#grid').innerHTML = list.length ? list.map(p => `
    <article class="card pcard" tabindex="0" data-open="${p.id}" aria-label="${esc(p.name)}">
      <div class="media">${media(p)}${badge(p)}</div>
      <div class="pbody"><div class="brand">${esc(p.brand || p.category)}</div><div class="pname">${esc(p.name)}</div>
        <div class="prow"><span class="price">${money(p.price)}</span>
          <button class="btn btn-p btn-sm" data-add="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>Add</button></div></div>
    </article>`).join('') : `<div class="card empty" style="grid-column:1/-1">No products match your search. Try another category or keyword.</div>`;
}
function specsHtml(text) {
  const rows = (text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i), l.slice(i + 1).trim()] : ['', l]; });
  return rows.length ? `<dl class="specs">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '';
}
function detail(id) {
  const p = find(id); if (!p) return;
  openModal(`<div class="sheet detail" role="dialog" aria-label="${esc(p.name)}">
    <div class="media" style="position:relative">${media(p)}</div>
    <div class="dinfo" style="position:relative"><button class="x" id="xc" aria-label="Close">&times;</button>
      <div class="brand">${esc(p.brand ? p.brand + ' · ' : '')}${esc(p.category)}</div><h2>${esc(p.name)}</h2>
      <div style="display:flex;align-items:center;gap:12px;margin-top:12px"><span class="price" style="font-size:28px">${money(p.price)}</span>${badge(p)}<span class="lsub">${p.stock} available</span></div>
      <p style="margin-top:14px;color:#475569;font-size:14px;line-height:1.65">${esc(p.description || 'No description has been added yet.')}</p>
      ${specsHtml(p.specs)}
      <button class="btn btn-p btn-block" style="margin-top:22px" id="da" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Out of stock' : 'Add to order'}</button>
    </div></div>`);
  $('#xc').onclick = closeModal;
  $('#da').onclick = () => { addCart(p.id, 1); closeModal(); };
}
function addCart(id, d, silent) {
  const p = find(id); if (!p) return false;
  const n = (S.cart[id] || 0) + d;
  if (n <= 0) delete S.cart[id];
  else if (n > p.stock) { toast(`Only ${p.stock} in stock.`, true); return false; }
  else { S.cart[id] = n; if (d > 0 && !silent) toast('Added to order'); }
  renderCart();
  return true;
}

/* ---------- Barcode scanning ---------- */
let audio;
function beep(good) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square'; o.frequency.value = good ? 1250 : 280; g.gain.value = 0.04;
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (good ? 0.07 : 0.25));
  } catch (e) {}
}
async function scan(raw) {
  const code = String(raw || '').trim(); if (!code) return;
  let p = S.products.find(x => x.barcode && x.barcode.toLowerCase() === code.toLowerCase());
  if (!p) {   // not in the loaded list: maybe added a moment ago, so ask the server before giving up
    try { p = (await api('barcode&code=' + encodeURIComponent(code))).product; }
    catch (e) { beep(false); toast(e.message, true); return; }
    S.products.push(p); renderGrid();
  }
  if (p.stock <= 0) { beep(false); toast(`“${p.name}” is out of stock.`, true); return; }
  if (addCart(p.id, 1, true)) { beep(true); toast(`${p.name} · ${S.cart[p.id]} in order`); } else beep(false);
}
// A USB scanner types the code very fast and ends with Enter. This catches it even when no field has focus.
let sbuf = '', slast = 0;
document.addEventListener('keydown', e => {
  if (!S.active || S.view !== 'store' || !S.user || $('#modal').firstChild || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = R.activeElement && R.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const now = Date.now();
  if (e.key === 'Enter') { const c = sbuf; sbuf = ''; if (c.length >= 4) { e.preventDefault(); run(() => scan(c)); } return; }
  if (e.key.length === 1) { if (now - slast > 100) sbuf = ''; sbuf += e.key; slast = now; }   // slower than a scanner = a person typing, ignore
});
function totals() {
  let sub = 0; for (const id in S.cart) sub += Math.round(find(id).price * S.cart[id] * 100) / 100;
  sub = Math.round(sub * 100) / 100; const tax = Math.round(sub * S.tax * 100) / 100;
  return { sub, tax, total: Math.round((sub + tax) * 100) / 100 };
}
function renderCart() {
  const el = $('#cart'); if (!el) return;
  const ids = Object.keys(S.cart), t = totals(), count = ids.reduce((a, i) => a + S.cart[i], 0);
  $('#cbar').innerHTML = `<span>View order (${count})</span><span>${money(t.total)}</span>`;
  $('#cbar').classList.toggle('hide', !count);
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>Current order</h2>
    <div style="display:flex;gap:8px">${S.lastSaleId ? '<button class="btn btn-s btn-sm" data-last="1">Last receipt</button>' : ''}${ids.length ? '<button class="btn btn-s btn-sm" data-clr="1">Clear</button>' : ''}<button class="btn btn-s btn-sm only-m" data-close="1">Close</button></div></div>
  <div class="lines">${ids.length ? ids.map(id => { const p = find(id); return `
    <div class="line"><div class="thumb">${media(p)}</div>
      <div><div class="lname">${esc(p.name)}</div><div class="lsub">${money(p.price)} each</div>
        <div class="step"><button data-d="-1" data-id="${id}" aria-label="Decrease quantity">&minus;</button><span>${S.cart[id]}</span><button data-d="1" data-id="${id}" aria-label="Increase quantity" ${S.cart[id] >= p.stock ? 'disabled' : ''}>+</button></div></div>
      <div style="text-align:right"><b>${money(p.price * S.cart[id])}</b><br><button class="rm" data-rm="${id}">Remove</button></div></div>`; }).join('')
    : '<div class="empty">Your order is empty.<br>Add products from the catalog.</div>'}</div>
  <div class="sum"><div><span>Subtotal</span><span>${money(t.sub)}</span></div><div><span>VAT (${Math.round(S.tax * 100)}%)</span><span>${money(t.tax)}</span></div>
    <div class="tot"><span>Total</span><span>${money(t.total)}</span></div></div>
  <button class="btn btn-p btn-block" style="margin-top:14px" data-pay="1" ${ids.length ? '' : 'disabled'}>Complete purchase</button>`;
}
function cartClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.d) addCart(+b.dataset.id, +b.dataset.d);
  else if (b.dataset.rm) { delete S.cart[b.dataset.rm]; renderCart(); }
  else if (b.dataset.clr) { S.cart = {}; renderCart(); }
  else if (b.dataset.close) cartOpen(false);
  else if (b.dataset.last) run(() => reprint(S.lastSaleId));
  else if (b.dataset.pay) checkout(b);
}
async function checkout(btn) {
  const items = Object.entries(S.cart).map(([id, qty]) => ({ id: +id, qty }));
  if (!items.length) return;
  btn.disabled = true; btn.textContent = 'Processing…';
  try {
    const { sale } = await post('checkout', { items });
    S.cart = {}; S.lastSaleId = sale.id; cartOpen(false); await loadProducts(); renderGrid(); renderCart(); receipt(sale);
  } catch (e) {
    toast(e.message, true);
    try { await loadProducts(); renderGrid(); } catch (_) {}
    renderCart();
  }
}
function receiptHtml(s, paper) {
  const c = S.cfg, row = (l, r, cls) => `<div class="rr${cls ? ' ' + cls : ''}"><span>${l}</span><span>${r}</span></div>`;
  return `<div class="rcp p${paper}">
    <div class="rh"><b>${esc(c.store_name || 'TurboParts')}</b>${c.store_address ? `<div class="pl">${esc(c.store_address)}</div>` : ''}${c.store_phone ? `<div>${esc(c.store_phone)}</div>` : ''}</div>
    <div class="rx"></div>
    ${row('Receipt #' + s.id, '')}${row(esc(ftime(s.created_at)), '')}${s.cashier ? row('Cashier: ' + esc(s.cashier), '') : ''}
    <div class="rx"></div>
    ${s.items.map(i => `<div class="ri"><div class="rn">${esc(i.name)}</div>${row(`${i.qty} x ${money(i.unit_price)}`, money(i.qty * i.unit_price))}</div>`).join('')}
    <div class="rx"></div>
    ${row('Subtotal', money(s.subtotal))}${row(`VAT (${Math.round(S.tax * 100)}%)`, money(s.tax))}
    ${row('TOTAL', money(s.total), 'rt')}
    <div class="rx"></div>
    <div class="rf pl">${esc(c.receipt_footer || '')}</div>
  </div>`;
}
function printReceipt(s) {
  $('#printarea').innerHTML = receiptHtml(s, S.paper);
  window.print();   // blocks until the dialog closes in most browsers; afterprint (below) clears the hidden copy
}
window.addEventListener('afterprint', () => { const el = $('#printarea'); if (el) el.innerHTML = ''; });
async function reprint(id) { const { sale } = await api('receipt&id=' + id); receipt(sale, true); }
function receipt(s, again) {
  openModal(`<div class="sheet rc" role="dialog" aria-label="Receipt">
    ${again ? '' : '<div class="ok">&#10003;</div>'}<h2 style="text-align:center;font-size:22px;font-weight:800">${again ? 'Receipt #' + s.id : 'Payment received'}</h2>
    <div class="seg" role="group" aria-label="Paper width"><button data-w="58">58 mm</button><button data-w="80">80 mm</button></div>
    <div class="paperwrap"><div id="rpv"></div></div>
    <label class="chk"><input type="checkbox" id="rap" ${S.autoPrint ? 'checked' : ''}> Print automatically after each sale</label>
    <p class="lsub" style="margin-top:8px">In the print dialog, choose your receipt printer and its 58 or 80 mm roll size, and set Margins to None.</p>
    <div class="acts"><button class="btn btn-s" id="rpr">Print receipt</button><button class="btn btn-p" id="rc">Done</button></div></div>`);
  const paint = () => {
    $('#rpv').innerHTML = receiptHtml(s, S.paper);
    R.querySelectorAll('.seg button').forEach(b => { b.classList.toggle('on', b.dataset.w === S.paper); b.setAttribute('aria-pressed', b.dataset.w === S.paper); });
  };
  paint();
  R.querySelector('.seg').onclick = e => { const b = e.target.closest('[data-w]'); if (b) { S.paper = b.dataset.w; pref.set('paper', S.paper); paint(); } };
  $('#rap').onchange = e => { S.autoPrint = e.target.checked; pref.set('auto', S.autoPrint ? '1' : '0'); };
  $('#rpr').onclick = () => printReceipt(s);
  $('#rc').onclick = closeModal;
  if (!again && S.autoPrint) setTimeout(() => printReceipt(s), 250);
}

/* ---------- Inventory ---------- */
function renderInv() {
  $('#main').innerHTML = `
  <header class="top"><div><h1>Inventory</h1><p>${S.products.length} products · low stock is ${S.low} units or fewer</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><input id="iq" class="inp search" type="search" placeholder="Search inventory or barcode" value="${esc(S.invq)}" aria-label="Search inventory"><button class="btn btn-p" id="add">Add product</button></div></header>
  <div class="card tw"><table><thead><tr><th>Product</th><th>Category</th><th class="r">Price</th><th class="r">Cost</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
  $('#add').onclick = () => formModal();
  $('#iq').oninput = e => { S.invq = e.target.value; invRows(); };
  $('#rows').onclick = e => run(async () => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.s) {
      const { product } = await post('stock', { id: +b.dataset.id, delta: +b.dataset.s });
      S.products[S.products.findIndex(p => p.id === product.id)] = product; reconcile(); invRows();
    } else if (b.dataset.e) formModal(find(b.dataset.e));
    else if (b.dataset.x) {
      const p = find(b.dataset.x);
      if (confirm(`Delete “${p.name}”? Past sales stay in the ledger.`)) {
        await post('product_delete', { id: p.id }); await loadProducts(); invRows(); toast('Product deleted');
      }
    }
  });
  invRows();
}
function invRows() {
  const q = S.invq.trim().toLowerCase();
  const list = S.products.filter(p => (p.name + ' ' + p.brand + ' ' + p.category + ' ' + p.barcode).toLowerCase().includes(q));
  $('#rows').innerHTML = list.length ? list.map(p => `<tr>
    <td><div class="pi"><div class="thumb">${media(p)}</div><div><b>${esc(p.name)}</b><div class="lsub">${esc(p.brand)}${p.barcode ? (p.brand ? ' · ' : '') + esc(p.barcode) : ''}</div></div></div></td>
    <td>${esc(p.category)}</td><td class="r"><b>${money(p.price)}</b></td><td class="r">${money(p.cost)}</td>
    <td><div class="step" style="margin:0"><button data-s="-1" data-id="${p.id}" aria-label="Decrease stock" ${p.stock <= 0 ? 'disabled' : ''}>&minus;</button><span>${p.stock}</span><button data-s="1" data-id="${p.id}" aria-label="Increase stock">+</button></div>
      <button class="btn btn-s btn-sm" style="margin-left:6px" data-s="10" data-id="${p.id}">+10</button></td>
    <td>${badge(p)}</td>
    <td class="r" style="white-space:nowrap"><button class="btn btn-s btn-sm" data-e="${p.id}">Edit</button> <button class="btn btn-d btn-sm" data-x="${p.id}">Delete</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="empty">No products found.</td></tr>';
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); c.toBlob(b => b ? resolve(b) : reject(new Error('Could not process the image.')), 'image/jpeg', 0.85);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')); };
    im.src = url;
  });
}
function formModal(p) {
  const edit = !!p;
  p = p || { name: '', brand: '', barcode: '', category: CATS[0], price: '', cost: '', stock: 10, description: '', specs: '', image: null };
  let blob = null, preview = p.image, removed = false;
  openModal(`<form class="sheet fm" id="pf" role="dialog" aria-label="${edit ? 'Edit' : 'Add'} product" novalidate>
    <h2>${edit ? 'Edit product' : 'Add new product'}</h2>
    <div class="fg"><div><div class="pv" id="pv"></div>
      <label class="btn btn-s btn-sm" style="width:100%;margin-top:10px;cursor:pointer">Upload photo<input id="ff" type="file" accept="image/*" hidden></label>
      <button type="button" class="btn btn-s btn-sm hide" id="rmv" style="width:100%;margin-top:8px">Remove photo</button>
      <p class="lsub" style="margin-top:8px">Customers see this photo in the store. JPG, PNG or WebP.</p></div>
    <div style="display:grid;gap:12px">
      <label class="f">Item name<input class="inp" id="fn" value="${esc(p.name)}" placeholder="e.g. Radiator Coolant 5L" maxlength="160"></label>
      <div class="fg2"><label class="f">Brand<input class="inp" id="fb" value="${esc(p.brand)}" maxlength="80"></label>
        <label class="f">Category<select class="inp" id="fc">${[...new Set([...CATS, p.category])].map(c => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="f">Unit price ($)<input class="inp" id="fp" type="number" min="0" step="0.01" value="${p.price}"></label>
        <label class="f">Unit cost ($, optional)<input class="inp" id="fk" type="number" min="0" step="0.01" value="${edit ? p.cost : ''}"></label>
        <label class="f" style="grid-column:1/-1">Barcode (optional)<div style="display:flex;gap:8px;margin-top:6px"><input class="inp" id="fbc" style="margin:0" value="${esc(p.barcode || '')}" maxlength="64" autocomplete="off" placeholder="Scan the product, or type / generate one"><button type="button" class="btn btn-s" id="gen">Generate</button></div></label>
        <label class="f" style="grid-column:1/-1">${edit ? 'Stock quantity' : 'Initial stock quantity'}<input class="inp" id="fs" type="number" min="0" step="1" value="${p.stock}"></label></div>
      <label class="f">Description shown to customers<textarea class="inp" id="fd" rows="3" placeholder="What is it, and who is it for?">${esc(p.description)}</textarea></label>
      <label class="f">Details, one per line as “Label: value”<textarea class="inp" id="fx" rows="3" placeholder="Viscosity: 5W-30&#10;Volume: 4 L">${esc(p.specs)}</textarea></label>
      <p class="err hide" id="err"></p></div></div>
    <div class="acts"><button type="button" class="btn btn-s" id="no">Cancel</button><button type="submit" class="btn btn-p" id="ok">${edit ? 'Save changes' : 'Save product'}</button></div></form>`);
  const paint = () => {
    $('#pv').innerHTML = preview ? `<img src="${esc(preview)}" alt="Product photo preview" style="width:100%;height:100%;object-fit:cover">`
      : `<div class="ph" style="--h:${hue($('#fc').value)}"><b>No photo</b><span>${esc($('#fc').value)}</span></div>`;
    $('#rmv').classList.toggle('hide', !preview);
  };
  paint();
  $('#fc').onchange = paint; $('#no').onclick = closeModal;
  $('#fbc').onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };   // a scanner ends with Enter: do not submit the form half filled
  $('#gen').onclick = () => {   // store-use EAN-13 (prefix 2); the server rejects it if the number is already taken
    let d = '2'; for (let i = 0; i < 11; i++) d += Math.floor(Math.random() * 10);
    let sum = 0; for (let i = 0; i < 12; i++) sum += +d[i] * (i % 2 ? 3 : 1);
    $('#fbc').value = d + ((10 - sum % 10) % 10);
  };
  $('#ff').onchange = e => run(async () => {
    const f = e.target.files[0]; if (!f) return;
    blob = await resizeImage(f); removed = false;
    preview = URL.createObjectURL(blob); paint();
  });
  $('#rmv').onclick = () => { blob = null; preview = null; removed = true; paint(); };
  $('#pf').onsubmit = ev => {
    ev.preventDefault();
    const name = $('#fn').value.trim(), price = parseFloat($('#fp').value), stock = $('#fs').value.trim();
    const showErr = m => { const e = $('#err'); e.textContent = m; e.classList.remove('hide'); };
    if (!name) return showErr('Enter an item name.');
    if (isNaN(price) || price < 0) return showErr('Enter a valid unit price.');
    if (!/^\d+$/.test(stock)) return showErr('Stock must be a whole number of 0 or more.');
    const fd = new FormData();
    if (edit) fd.append('id', p.id);
    fd.append('name', name); fd.append('brand', $('#fb').value.trim()); fd.append('category', $('#fc').value);
    fd.append('barcode', $('#fbc').value.trim()); fd.append('price', price); fd.append('cost', $('#fk').value); fd.append('stock', stock);
    fd.append('description', $('#fd').value); fd.append('specs', $('#fx').value);
    if (blob) fd.append('image', blob, 'photo.jpg');
    if (removed && !blob) fd.append('remove_image', '1');
    $('#ok').disabled = true; $('#ok').textContent = 'Saving…';
    api('product_save', { method: 'POST', body: fd }).then(async () => {
      closeModal(); await loadProducts(); renderInv(); toast(edit ? 'Product updated' : 'Product added. Customers can see it in the store.');
    }).catch(e => { showErr(e.message); $('#ok').disabled = false; $('#ok').textContent = edit ? 'Save changes' : 'Save product'; });
  };
  $('#fn').focus();
}

/* ---------- Sales & revenue ---------- */
async function renderStats() {
  const [st, lg] = await Promise.all([api('stats'), api('ledger')]);
  const k = st.kpi, max = Math.max(1, ...st.daily.map(d => d.total));
  const kpi = (l, v, c, sub) => `<div class="card kpi" style="--c:${c}"><p>${l}</p><b>${v}</b><small>${sub}</small></div>`;
  $('#main').innerHTML = `
  <header class="top"><div><h1>Sales &amp; Revenue</h1><p>Live totals from every completed purchase.</p></div></header>
  <div class="kpis">
    ${kpi('Total revenue', money(k.revenue), 'var(--cyan)', `${k.orders} orders, VAT included`)}
    ${kpi('Items sold', k.sold, 'var(--red)', 'units across all orders')}
    ${kpi('Items in inventory', k.inventory, 'var(--green)', `${k.products} products`)}
    ${kpi('Low stock alerts', k.low, k.low ? 'var(--amber)' : 'var(--green)', k.low ? 'need restocking' : 'everything is stocked')}</div>
  <div class="two">
    <section class="card pad"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><h3>Revenue, last 7 days</h3><span class="lsub">Today’s profit <b style="color:var(--green);font-size:15px">${money(st.today_profit)}</b></span></div>
      <div class="bars">${st.daily.map(d => `<div class="bc"><em>${d.total ? '$' + Math.round(d.total) : ''}</em><div class="bar" style="height:${d.total / max * 80}%"></div></div>`).join('')}</div>
      <div class="days">${st.daily.map(d => `<span>${esc(d.label)}</span>`).join('')}</div></section>
    <section class="card pad"><h3>Restock soon</h3>${st.low_items.length ? `<ul class="rl">${st.low_items.map(i => `<li><span>${esc(i.name)}</span><b>${i.stock} left</b></li>`).join('')}</ul>` : '<p class="lsub" style="margin-top:10px">Nothing is running low.</p>'}</section></div>
  <section class="card pad mt"><h3>Recent transactions</h3><ul class="rl" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${st.recent.map(r => `<li><span style="min-width:0"><b>#${r.id}</b> <span class="lsub">${fdate(r.created_at)}</span><div class="s">${esc(r.summary)}</div></span><span style="display:flex;align-items:center;gap:10px"><b style="color:var(--cyan)">${money(r.total)}</b><button class="btn btn-s btn-sm" data-rc="${r.id}">Receipt</button></span></li>`).join('')}</ul></section>
  <section class="card mt"><div class="pad" style="padding-bottom:8px"><h3>Transaction ledger</h3></div><div class="tw"><table><thead><tr><th>Date &amp; time</th><th>Order</th><th>Cashier</th><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Line total</th><th>Status</th></tr></thead>
    <tbody>${lg.rows.map(r => `<tr><td style="white-space:nowrap">${fdate(r.created_at)}</td><td>#${r.order_id}</td><td>${esc(r.cashier || '')}</td><td>${esc(r.name)}</td><td class="r">${r.qty}</td><td class="r">${money(r.unit_price)}</td><td class="r"><b>${money(r.qty * r.unit_price)}</b></td><td><span class="badge b-in">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="lsub" style="padding:12px 20px 16px">Line totals are before VAT. Order totals above include ${Math.round(S.tax * 100)}% VAT.</p></section>`;
  $('#main').onclick = e => { const b = e.target.closest('[data-rc]'); if (b) run(() => reprint(+b.dataset.rc)); };
}

/* ---------- Sign in, roles, password ---------- */
function showLogin(msg) {
  closeModal(); R.querySelector('.app').classList.add('hide'); $('#printarea').innerHTML = '';
  $('#gate').innerHTML = `<div class="gate"><form class="card login" id="lf" novalidate>
    <div class="logo" style="padding:0"><i></i><div>TurboParts<small>Store &amp; POS</small></div></div>
    <div><h1>Sign in</h1><p class="lsub" style="margin-top:2px">Use the account your store owner gave you.</p></div>
    <label class="f">Username<input class="inp" id="lu" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
    <label class="f">Password<input class="inp" id="lp" type="password" autocomplete="current-password"></label>
    <p class="err ${msg ? '' : 'hide'}" id="le" role="alert" style="margin:0">${esc(msg || '')}</p>
    <button class="btn btn-p btn-block" id="lb" type="submit">Sign in</button>
    <p class="backlink"><a class="lnk" href="#home">&larr; Back to website</a></p></form></div>`;
  $('#lu').focus();
  $('#lf').onsubmit = async ev => {
    ev.preventDefault();
    const err = t => { const e = $('#le'); e.textContent = t; e.classList.remove('hide'); };
    const u = $('#lu').value.trim(), pw = $('#lp').value;
    if (!u || !pw) return err('Enter your username and password.');
    $('#lb').disabled = true; $('#lb').textContent = 'Signing in…';
    try { enter(await post('login', { username: u, password: pw }, true)); }
    catch (e) { err(e.message); $('#lb').disabled = false; $('#lb').textContent = 'Sign in'; $('#lp').value = ''; $('#lp').focus(); }
  };
}
function signedOut() { S.user = null; S.csrf = ''; S.cart = {}; S.products = []; S.lastSaleId = 0; showLogin(); }
function enter(d) {
  S.user = d.user; S.csrf = d.csrf; applyConfig(d.config);
  $('#gate').innerHTML = ''; R.querySelector('.app').classList.remove('hide');
  const views = VIEWS[S.user.role] || ['store'], h = location.hash.split('/')[1] || '';
  S.view = views.includes(h) ? h : 'store';
  $('#nav').innerHTML = views.map(v => `<button data-v="${v}">${LABEL[v]}</button>`).join('');
  $('#foot').innerHTML = `<div class="who"><b>${esc(S.user.name)}</b><small>${S.user.role === 'owner' ? 'Owner' : 'Cashier'}</small></div>
    <div class="fb"><button class="lnk" id="pw">Password</button><button class="lnk" id="out">Sign out</button></div>
    <div class="fb"><a class="lnk" href="#home">&larr; Back to website</a></div>`;
  $('#pw').onclick = () => passwordModal(false);
  $('#out').onclick = () => run(async () => { await post('logout', {}); location.hash = 'parts'; signedOut(); });
  if (S.user.must_change) passwordModal(true, render); else render();
}
function passwordModal(force, done) {
  openModal(`<form class="sheet fm" id="pwf" style="max-width:420px" role="dialog" aria-label="Change password" novalidate>
    <h2>${force ? 'Choose a new password' : 'Change password'}</h2>
    ${force ? '<p class="lsub" style="margin:-8px 0 14px">You signed in with a temporary password. Set your own to continue.</p>' : ''}
    <div style="display:grid;gap:12px">
      <label class="f">${force ? 'Temporary password' : 'Current password'}<input class="inp" id="pc" type="password" autocomplete="current-password"></label>
      <label class="f">New password (at least 8 characters)<input class="inp" id="pn" type="password" autocomplete="new-password"></label>
      <label class="f">Repeat new password<input class="inp" id="pr" type="password" autocomplete="new-password"></label>
      <p class="err hide" id="pe" style="margin:0" role="alert"></p></div>
    <div class="acts">${force ? '' : '<button type="button" class="btn btn-s" id="pcx">Cancel</button>'}<button type="submit" class="btn btn-p" id="pok">Save password</button></div></form>`, force);
  if (!force) $('#pcx').onclick = closeModal;
  $('#pc').focus();
  $('#pwf').onsubmit = async ev => {
    ev.preventDefault();
    const err = t => { const e = $('#pe'); e.textContent = t; e.classList.remove('hide'); };
    const cur = $('#pc').value, nw = $('#pn').value;
    if (!cur) return err('Enter your current password.');
    if (nw.length < 8) return err('Use at least 8 characters for the new password.');
    if (nw !== $('#pr').value) return err('The two new passwords do not match.');
    $('#pok').disabled = true;
    try { await post('password_change', { current: cur, next: nw }); S.user.must_change = false; closeModal(); toast('Password updated'); if (done) done(); }
    catch (e) { err(e.message); $('#pok').disabled = false; }
  };
}
async function boot() {
  try {
    const d = await api('me', { quiet: true });
    if (d.user) enter(d); else { applyConfig(d.config); showLogin(); }
  } catch (e) { showLogin(e.message); }
}
// ---------- Router: one index.html, two views (#parts... = store, anything else = website) ----------
let started = false, siteTitle = document.title, pageStyle = null;
function sync() {
  const on = /^#parts(\/|$)/.test(location.hash);
  if (on === !!S.active) {
    if (on && S.user) { const v = location.hash.split('/')[1], ok = (VIEWS[S.user.role] || ['store']).includes(v); if (ok && v !== S.view) { S.view = v; render(); } }
    return;
  }
  S.active = on;
  document.body.classList.toggle('inparts', on);
  if (on) {
    document.title = 'TurboParts – Store & POS';
    pageStyle = document.createElement('style'); pageStyle.textContent = '@page{margin:0}'; document.head.appendChild(pageStyle);
    if (!started) { started = true; boot(); }
    window.scrollTo(0, 0);
  } else {
    document.title = siteTitle;
    if (pageStyle) { pageStyle.remove(); pageStyle = null; }
    const t = document.getElementById(location.hash.slice(1));
    if (t) t.scrollIntoView(); else window.scrollTo(0, 0);
  }
}
window.addEventListener('hashchange', sync);
sync();
})();