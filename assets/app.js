/*
 * Vini & Delizie · logica delle pagine ordini.
 * La stessa logica serve entrambe le pagine: la modalità si legge da <body data-mode="consumer|pro">.
 */
(() => {
  'use strict';

  const PRO = document.body.dataset.mode === 'pro';
  const MODE = PRO ? 'pro' : 'consumer';
  const API_URL = ((window.VD_CONFIG || {}).API_URL || '').trim();
  const CODE_KEY = 'vd-pro-code';
  const MAX = 99;
  const CASE_SIZE = 6; // usato solo dall’anteprima: in produzione lo decide il foglio

  /* ---------- dati di esempio, usati finché API_URL è vuoto ---------- */
  const DEMO_PRODUCTS = [
    { id: 'V01', category: 'Vini', name: 'Rosso Toscano IGT', producer: 'Produttore di esempio', description: 'Sangiovese in prevalenza, fresco, da tutti i giorni.', unit: 'bottiglia', price: 12, proPrice: 8 },
    { id: 'V02', category: 'Vini', name: 'Vermentino di Toscana', producer: 'Produttore di esempio', description: 'Bianco sapido, da costa.', unit: 'bottiglia', price: 11, proPrice: 7.8 },
    { id: 'V03', category: 'Vini', name: 'Chianti Classico DOCG', producer: 'Produttore di esempio', description: '', unit: 'bottiglia', price: 18, proPrice: 12 },
    { id: 'D01', category: 'Delizie', name: 'Olio extravergine di oliva', producer: 'Frantoio di esempio', description: 'Raccolta di quest’anno.', unit: '0,75 l', price: 16, proPrice: 12 },
    { id: 'D02', category: 'Delizie', name: 'Pecorino stagionato', producer: 'Caseificio di esempio', description: 'Pezzo da circa 300 g.', unit: 'pezzo', price: 9.5, proPrice: 7 }
  ];
  const DEMO_PAY_INFO = {
    paypal: 'Anteprima: qui compariranno le istruzioni per PayPal scritte nel foglio.',
    bonifico: 'Anteprima: qui compariranno IBAN e causale scritti nel foglio.',
    contanti: 'Anteprima: qui comparirà come funziona il pagamento in contanti.'
  };
  function demoData() {
    return {
      ok: true,
      settings: {
        open: true,
        deadline: 'domenica 29 novembre',
        pickup: 'Anteprima: qui comparirà l’informazione sul ritiro scritta nel foglio.',
        closedMessage: '',
        proNote: PRO ? 'Anteprima: qui comparirà la nota sui prezzi, per esempio IVA esclusa.' : '',
        payments: [
          { id: 'paypal', label: 'PayPal' },
          { id: 'bonifico', label: 'Bonifico' },
          { id: 'contanti', label: 'Contanti al ritiro' }
        ]
      },
      products: DEMO_PRODUCTS.map((p) => {
        const base = { id: p.id, category: p.category, name: p.name, producer: p.producer, description: p.description, unit: p.unit };
        if (!PRO) return { ...base, price: p.price };
        return { ...base, price: p.proPrice, caseSize: CASE_SIZE, casePrice: round(p.proPrice * CASE_SIZE) };
      })
    };
  }

  /* ---------- stato e riferimenti ---------- */
  const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const $ = (s) => document.querySelector(s);
  const ui = {
    status: $('#status'), notice: $('#notice'), catalog: $('#catalog'), form: $('#order-form'),
    shop: $('#shop'), done: $('#done'), bar: $('#bar'), count: $('#count'), total: $('#total'), send: $('#send'),
    payments: $('#payments'), paymentsList: $('#payments-list'), proNote: $('#pro-note'),
    gate: $('#gate'), gateForm: $('#gate-form'), gateInput: $('#gate-code')
  };
  const state = { products: [], settings: {}, qty: new Map() };
  const store = {
    get() { try { return localStorage.getItem(CODE_KEY) || ''; } catch (_) { return ''; } },
    set(v) { try { if (v) localStorage.setItem(CODE_KEY, v); else localStorage.removeItem(CODE_KEY); } catch (_) { /* niente */ } }
  };
  let accessCode = PRO ? store.get() : '';

  function round(n) { return Math.round(n * 100) / 100; }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }

  function showNotice(message, kind = 'info') {
    ui.notice.textContent = message;
    ui.notice.className = 'notice' + (kind === 'error' ? ' error' : '');
    ui.notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    ui.notice.hidden = false;
  }
  function clearNotice() { ui.notice.hidden = true; }

  /* ---------- caricamento ---------- */
  async function load() {
    clearNotice();
    try {
      let data;
      if (!API_URL) {
        data = demoData();
        showNotice('Anteprima: la pagina non è ancora collegata al foglio Google, quindi gli ordini non vengono inviati.');
      } else {
        const url = new URL(API_URL);
        url.searchParams.set('mode', MODE);
        if (PRO && accessCode) url.searchParams.set('code', accessCode);
        const res = await fetch(url);
        data = await res.json();
        if (data.needCode) { showGate(data.error); return; }
        if (!data.ok) throw new Error(data.error || 'listino non disponibile');
      }
      if (ui.gate) ui.gate.hidden = true;
      ui.shop.hidden = false;
      ui.bar.hidden = false;
      state.products = Array.isArray(data.products) ? data.products : [];
      state.settings = data.settings || {};
      render();
    } catch (err) {
      console.error(err);
      ui.status.textContent = 'Listino non disponibile';
      ui.status.className = 'status closed';
      showNotice('Il listino non si è caricato. Ricarica la pagina tra qualche minuto; se il problema resta, scrivi a chi organizza il gruppo.', 'error');
    }
  }

  function showGate(error) {
    ui.shop.hidden = true;
    ui.bar.hidden = true;
    ui.gate.hidden = false;
    ui.status.textContent = 'Area riservata';
    ui.status.className = 'status';
    if (error) { store.set(''); accessCode = ''; showNotice(error, 'error'); }
    ui.gateInput.focus();
  }

  if (ui.gateForm) {
    ui.gateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      accessCode = ui.gateInput.value.trim();
      store.set(accessCode);
      load();
    });
  }

  /* ---------- listino ---------- */
  function render() {
    const s = state.settings;
    ui.status.textContent = s.open ? (s.deadline ? `Ordini aperti fino a ${s.deadline}` : 'Ordini aperti') : 'Ordini chiusi';
    ui.status.className = 'status' + (s.open ? '' : ' closed');
    if (!s.open) showNotice(s.closedMessage || 'Gli ordini sono chiusi. Puoi consultare il listino; riapriremo a breve.');
    if (ui.proNote) { ui.proNote.textContent = s.proNote || ''; ui.proNote.hidden = !s.proNote; }
    renderPayments(s.payments || []);

    ui.catalog.textContent = '';
    if (!state.products.length) {
      ui.catalog.append(el('p', { class: 'empty', text: 'Il listino è vuoto: i prodotti compariranno qui appena vengono pubblicati.' }));
    }
    const groups = new Map();
    for (const p of state.products) {
      const cat = p.category || 'Altri prodotti';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }
    for (const [cat, items] of groups) {
      const list = el('ul', { class: 'items' });
      for (const p of items) list.append(renderItem(p, !s.open));
      ui.catalog.append(el('section', { class: 'category' }, el('h2', { text: cat }), list));
    }
    updateTotals();
  }

  function renderPayments(methods) {
    const chosen = (ui.form.querySelector('input[name="payment"]:checked') || {}).value;
    ui.paymentsList.textContent = '';
    ui.payments.hidden = !methods.length;
    methods.forEach((m) => {
      const input = el('input', { type: 'radio', name: 'payment', value: m.id, required: '' });
      if (m.id === chosen || methods.length === 1) input.checked = true;
      ui.paymentsList.append(el('label', { class: 'choice' }, input, el('span', { text: m.label })));
    });
  }

  function renderItem(p, locked) {
    const unit = p.unit || 'pezzo';
    const meta = (p.producer || p.description)
      ? el('p', { class: 'item-meta' },
          p.producer ? el('span', { class: 'producer', text: p.producer }) : null,
          p.producer && p.description ? '. ' : null,
          p.description || null)
      : null;
    const caseLine = PRO
      ? el('p', { class: 'item-case', text: `${eur.format(p.price)} a ${unit}` })
      : null;
    const li = el('li', { class: 'item' },
      el('div', { class: 'item-main' },
        el('div', { class: 'item-line' },
          el('span', { class: 'item-name', text: p.name }),
          el('span', { class: 'leader', 'aria-hidden': 'true' }),
          PRO
            ? el('span', { class: 'item-price' }, eur.format(p.casePrice), el('small', { text: ` / cartone da ${p.caseSize}` }))
            : el('span', { class: 'item-price' }, eur.format(p.price), el('small', { text: ` / ${unit}` }))),
        meta,
        caseLine));

    const refresh = () => li.classList.toggle('on', ['unit', 'case'].some((f) => state.qty.get(`${p.id}|${f}`) > 0));

    function stepper(format, label) {
      const key = `${p.id}|${format}`;
      const out = el('output');
      const minus = el('button', { type: 'button', 'aria-label': `Togli uno: ${p.name}, ${label}` }, '−');
      const plus = el('button', { type: 'button', 'aria-label': `Aggiungi uno: ${p.name}, ${label}` }, '+');
      const box = el('div', { class: 'qty', role: 'group', 'aria-label': `Quantità: ${p.name}, ${label}` }, minus, out, plus);
      const set = (q) => {
        q = Math.max(0, Math.min(MAX, q));
        if (q) state.qty.set(key, q); else state.qty.delete(key);
        out.textContent = q;
        box.classList.toggle('on', q > 0);
        minus.disabled = locked || q === 0;
        plus.disabled = locked || q >= MAX;
        refresh();
        updateTotals();
      };
      minus.addEventListener('click', () => set((state.qty.get(key) || 0) - 1));
      plus.addEventListener('click', () => set((state.qty.get(key) || 0) + 1));
      set(state.qty.get(key) || 0);
      return box;
    }

    li.append(PRO ? stepper('case', `cartoni da ${p.caseSize}`) : stepper('unit', unit));
    return li;
  }

  /* ---------- carrello ---------- */
  function cartLines() {
    const lines = [];
    for (const p of state.products) {
      for (const format of [PRO ? 'case' : 'unit']) {
        const q = state.qty.get(`${p.id}|${format}`) || 0;
        if (!q) continue;
        const isCase = format === 'case';
        const price = isCase ? p.casePrice : p.price;
        lines.push({ p, format, q, price, pieces: q * (isCase ? p.caseSize : 1) });
      }
    }
    return lines;
  }

  function updateTotals() {
    const lines = cartLines();
    const pieces = lines.reduce((n, l) => n + l.pieces, 0);
    const total = lines.reduce((t, l) => t + l.price * l.q, 0);
    const cartons = lines.reduce((n, l) => n + (l.format === 'case' ? l.q : 0), 0);
    ui.count.textContent = !pieces ? 'Nessun prodotto'
      : PRO ? `${cartons} ${cartons === 1 ? 'cartone' : 'cartoni'}, ${pieces} pezzi`
      : `${pieces} ${pieces === 1 ? 'pezzo' : 'pezzi'}`;
    ui.total.textContent = eur.format(total);
    ui.send.disabled = !state.settings.open || pieces === 0;
  }

  /* ---------- invio ---------- */
  ui.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lines = cartLines();
    if (!lines.length) { showNotice('Aggiungi almeno un prodotto prima di inviare l’ordine.', 'error'); return; }

    const fields = {};
    for (const [k, v] of new FormData(ui.form).entries()) fields[k] = typeof v === 'string' ? v.trim() : v;
    delete fields.consent;
    const payload = {
      ...fields,
      mode: MODE,
      code: PRO ? accessCode : '',
      items: lines.map((l) => ({ id: l.p.id, format: l.format, qty: l.q }))
    };

    if (!API_URL) {
      const method = (state.settings.payments || []).find((m) => m.id === payload.payment);
      showDone({
        orderId: 'ANTEPRIMA',
        total: lines.reduce((t, l) => t + l.price * l.q, 0),
        paymentLabel: method ? method.label : '',
        paymentInfo: DEMO_PAY_INFO[payload.payment] || ''
      }, lines, payload.email);
      return;
    }

    ui.send.disabled = true;
    ui.send.textContent = 'Invio in corso…';
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita il preflight CORS con Apps Script
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) { const err = new Error(data.error); err.user = true; throw err; }
      showDone(data, lines, payload.email);
    } catch (err) {
      console.error(err);
      showNotice(err.user ? err.message : 'L’ordine non è partito. Controlla la connessione e premi di nuovo «Invia ordine».', 'error');
    } finally {
      ui.send.textContent = 'Invia ordine';
      updateTotals();
    }
  });

  function showDone(res, lines, email) {
    $('#done-code').textContent = res.orderId;
    const recap = $('#done-lines');
    recap.textContent = '';
    for (const l of lines) {
      recap.append(el('li', {},
        el('span', { text: l.format === 'case'
          ? `${l.p.name}: ${l.q} ${l.q === 1 ? 'cartone' : 'cartoni'} da ${l.p.caseSize}`
          : `${l.q} × ${l.p.name}` }),
        el('span', { text: eur.format(l.price * l.q) })));
    }
    recap.append(el('li', { class: 'sum' }, el('span', { text: 'Totale' }), el('span', { text: eur.format(res.total) })));

    const pay = $('#done-pay');
    pay.hidden = !res.paymentLabel;
    $('#done-pay-label').textContent = res.paymentLabel ? `Hai scelto: ${res.paymentLabel}.` : '';
    $('#done-pay-info').textContent = res.paymentInfo || '';
    $('#done-pay-info').hidden = !res.paymentInfo;

    const pickup = res.pickup || state.settings.pickup;
    $('#done-pickup').textContent = pickup || '';
    $('#done-pickup').hidden = !pickup;
    $('#done-mail').hidden = !email || res.orderId === 'ANTEPRIMA';

    clearNotice();
    ui.shop.hidden = true;
    ui.bar.hidden = true;
    ui.done.hidden = false;
    window.scrollTo(0, 0);
    $('#done h2').focus();
  }

  $('#again').addEventListener('click', () => {
    state.qty.clear();
    ui.form.reset();
    ui.done.hidden = true;
    ui.shop.hidden = false;
    ui.bar.hidden = false;
    render();
    window.scrollTo(0, 0);
  });

  load();
})();
