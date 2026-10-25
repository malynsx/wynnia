/* Net worth calculator for the player page. The Wynncraft API doesn't publish inventories or banks, so the
   player lists what they own (or pastes Wynntils item strings) and trade market prices come from Wynnventory
   through the Wynntools relay. Prices can always be typed in by hand. */
(function (W) {
  const { el } = W;
  const KEY = 'wt.networth';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage blocked */ } };
  const prices = {};   // item name -> Promise<number|null>, shared across the session
  let noKey = false;

  /* Emeralds: 64 E = 1 EB, 64 EB = 1 LE, 64 LE = 1 stack */
  const UNITS = [['stx', 262144], ['LE', 4096], ['EB', 64], ['E', 1]];
  W.emeralds = (n) => {
    n = Math.round(n || 0); if (!n) return '0 E';
    const out = [];
    for (const [u, v] of UNITS) { const k = Math.floor(n / v); if (k) { out.push(k + ' ' + u); n -= k * v; } if (out.length === 2) break; }
    return out.join(' ');
  };

  /* Wynnventory's price answer: prefer an average, then a lowest listing, then any price number. */
  function readPrice(j) {
    const d = j && j.data;
    if (d) for (const k of ['average_mid_80_percent_price', 'p50_price', 'average_price', 'lowest_price']) if (d[k] > 0) return Math.round(d[k]);   // mid-80% average skips troll listings
    const found = [];
    const walk = (o, path) => {
      if (o == null) return;
      if (typeof o === 'number') { found.push([path.toLowerCase(), o]); return; }
      if (typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path + '.' + k);
    };
    walk(j, '');
    const pick = (re) => { const f = found.find(([p, v]) => re.test(p) && v > 0); return f ? f[1] : null; };
    return pick(/average|avg|mean|median|mid/) ?? pick(/lowest|min|cheapest/) ?? pick(/price/);
  }
  W.marketPrice = (name) => prices[name] || (prices[name] = fetch(`${W.API_RELAY}/market/price/${encodeURIComponent(name)}`)
    .then(async r => {
      if (r.status === 503) { noKey = true; return null; }
      if (!r.ok) return null;
      return readPrice(await r.json());
    }).catch(() => null));

  W.netWorth = (player) => {
    const who = (player && player.username || '').toLowerCase();
    const all = load(), st = all[who] || (all[who] = { rows: [], cash: 0 });
    const box = W.win('Net worth');
    let names = null;
    Promise.all(['items', 'ingredients', 'materials', 'tomes'].map(n => W.data(n).catch(() => []))).then(lists => { names = [...new Set(lists.flat().map(i => i.n).filter(Boolean))]; draw(); });

    const persist = () => { all[who] = st; save(all); };
    const value = (r) => (r.manual != null ? r.manual : r.price || 0) * (r.qty || 1);

    function draw() {
      const total = st.rows.reduce((a, r) => a + value(r), 0) + (st.cash || 0);
      const listId = 'nw-names';
      const nameIn = el('input', { type: 'text', placeholder: 'Item name', list: listId });
      const qtyIn = el('input', { type: 'number', value: 1, min: 1 });
      const add = () => {
        const n = nameIn.value.trim(); if (!n) return;
        const r = { n, qty: Math.max(1, +qtyIn.value || 1) }; st.rows.push(r); persist(); fetchPrice(r); draw();
      };
      const paste = el('textarea', { rows: 2, placeholder: 'Or paste Wynntils item strings for gear you own…' });
      paste.addEventListener('input', () => {
        if (!window.WynntilsDecode) return;
        W.data('idkeys').then(idKeys => {
          const res = WynntilsDecode.decodeGearText(paste.value, idKeys).filter(r => r.ok);
          res.forEach(r => { const row = { n: r.gear.name, qty: 1 }; st.rows.push(row); fetchPrice(row); });
          if (res.length) { persist(); draw(); }
        });
      });
      const cashIn = UNITS.map(([u, v]) => el('label', {}, u, W.numIn(Math.floor(((st.cash || 0) % (u === 'stx' ? Infinity : v * 64)) / v), () => {
        st.cash = [...box.querySelectorAll('.nwcash input')].reduce((a, inp, i) => a + (+inp.value || 0) * UNITS[i][1], 0); persist(); draw();
      }, 0, 99999)));

      box.replaceChildren(...[box.firstChild,
        el('div', { class: 'nwhead' },
          el('div', { class: 'nwtotal' }, el('b', {}, W.emeralds(total)), el('span', {}, `${total.toLocaleString('en-US')} emeralds`)),
          el('p', { class: 'hint' }, 'Wynncraft doesn’t share inventories or banks with outside sites, so list what this player owns. Prices are trade market averages from Wynnventory (the middle 80% of listings); type over any price to set your own.')),
        noKey ? el('div', { class: 'warn' }, 'Live prices aren’t switched on yet: the Wynntools relay needs a Wynnventory API key. Until then, type prices in yourself.') : null,
        el('div', { class: 'cap left' }, 'Liquid emeralds'),
        el('div', { class: 'fields4 nwcash' }, cashIn),
        el('div', { class: 'cap left' }, 'Items'),
        el('datalist', { id: listId }, (names || []).map(n => el('option', { value: n }))),
        el('div', { class: 'nwadd' }, nameIn, qtyIn, el('button', { onclick: add }, 'Add')),
        paste,
        st.rows.length ? el('div', { class: 'nwrows' }, st.rows.map((r, i) => el('div', { class: 'nwrow' },
          el('b', {}, r.n),
          W.numIn(r.qty || 1, (v) => { r.qty = Math.max(1, v); persist(); draw(); }, 1, 99999),
          el('label', { class: 'nwprice' }, el('input', { type: 'number', min: 0, value: r.manual != null ? r.manual : (r.price || ''), placeholder: r.loading ? '…' : 'price',
            onchange: (e) => { r.manual = e.target.value === '' ? null : Math.max(0, +e.target.value); persist(); draw(); } }), el('small', {}, r.manual != null ? 'your price' : r.price ? 'market' : r.loading ? 'looking up' : 'no price')),
          el('span', { class: 'nwval' }, W.emeralds(value(r))),
          el('button', { class: 'mini danger', title: 'Remove', onclick: () => { st.rows.splice(i, 1); persist(); draw(); } }, 'Remove')))) : el('p', { class: 'empty' }, 'Nothing listed yet.'),
        st.rows.length ? el('div', { class: 'btns' }, el('button', { class: 'mini', onclick: () => { st.rows.forEach(r => { delete prices[r.n]; fetchPrice(r); }); draw(); } }, 'Refresh prices'),
          el('button', { class: 'mini danger', onclick: () => { if (confirm('Clear the list?')) { st.rows = []; st.cash = 0; persist(); draw(); } } }, 'Clear')) : null].filter(Boolean));
    }
    function fetchPrice(r) {
      r.loading = true;
      W.marketPrice(r.n).then(p => { r.loading = false; r.price = p; persist(); if (box.isConnected) draw(); });
    }
    st.rows.filter(r => r.price == null).forEach(fetchPrice);
    draw();
    return box;
  };
})(window.W);
