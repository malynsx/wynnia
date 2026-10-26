/* Trade market prices from Wynnventory (through the Wynnia relay) and emerald formatting. */
(function (W) {
  const { el } = W;
  const prices = {};   // item name -> Promise of the Wynnventory answer, shared across the session
  let noKey = false;

  /* Emeralds: 64 E = 1 EB, 64 EB = 1 LE, 64 LE = 1 stack */
  const UNITS = [['stx', 262144], ['LE', 4096], ['EB', 64], ['E', 1]];
  W.emeralds = (n) => {
    n = Math.round(n || 0); if (!n) return '0 E';
    const out = [];
    for (const [u, v] of UNITS) { const k = Math.floor(n / v); if (k) { out.push(k + ' ' + u); n -= k * v; } if (out.length === 2) break; }
    return out.join(' ');
  };

  /* Emerald amount with the emerald icon; hovering shows the exact count */
  W.emeraldTag = (n, tag = 'b') => el(tag, { class: 'emtag', title: `${Math.round(n || 0).toLocaleString('en-US')} emeralds` }, el('img', { src: 'img/wiki/emeraldicon.webp', alt: '' }), W.emeralds(n));

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
  /* Full Wynnventory answer for one item ({data} or null), fetched once per session. */
  W.marketInfo = (name) => prices[name] || (prices[name] = fetch(`${W.API_RELAY}/market/price/${encodeURIComponent(name)}`)
    .then(async r => {
      if (r.status === 503) { noKey = true; return null; }
      if (!r.ok) return null;
      return r.json();
    }).catch(() => null));
  W.marketPrice = (name) => W.marketInfo(name).then(j => j ? readPrice(j) : null);

  /* Price line for an item card: fetched only when asked (or when auto is set for a single looked-up item). */
  W.priceTag = (name, auto) => {
    const box = el('div', { class: 'pricetag' });
    const show = () => {
      box.replaceChildren(el('span', { class: 'hint' }, 'Checking the trade market…'));
      W.marketInfo(name).then(j => {
        const d = j && j.data, p = j && readPrice(j);
        if (!p) { box.replaceChildren(el('span', { class: 'hint' }, noKey ? 'Market prices are switched off on the relay.' : 'Not seen on the trade market lately.')); return; }
        box.replaceChildren(
          el('div', { class: 'ptop' }, el('span', {}, 'Market'), W.emeraldTag(p)),
          el('div', { class: 'pdetail' },
            d.lowest_price ? el('small', {}, 'Lowest ', W.emeraldTag(d.lowest_price, 'span')) : null,
            d.unidentified_count ? el('small', {}, 'Unidentified ', W.emeraldTag(d.unidentified_average_mid_80_percent_price || d.unidentified_average_price, 'span')) : null,
            d.total_count ? el('small', {}, `${d.total_count} listings`) : null));
      });
    };
    if (auto || prices[name]) show(); else box.append(el('button', { class: 'mini', onclick: show }, 'Market price'));
    return box;
  };
})(window.W);
