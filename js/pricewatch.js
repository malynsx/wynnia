/* Items > Prices: an item's trade market price with its daily history (Wynnventory, through the relay), and a
   watchlist with price targets. Watched items are checked when the site opens; a hit shows a small alert. */
(function (W) {
  const { el } = W;
  const KEY = 'wynnia.watch', SEEN = 'wynnia.watch.seen';
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  W.watchlist = () => read(KEY, []);

  /* "2.5 stx", "40 LE", "500 eb", "1stx 20le" or a plain number of emeralds */
  const UNIT = { stx: 262144, st: 262144, s: 262144, le: 4096, eb: 64, e: 1 };
  W.parseEmeralds = (t) => {
    t = String(t || '').toLowerCase().replace(/,/g, '').trim(); if (!t) return null;
    if (/^\d+(\.\d+)?$/.test(t)) return Math.round(+t);
    let sum = 0, any = false;
    for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(stx|st|s|le|eb|e)\b/g)) { sum += +m[1] * UNIT[m[2]]; any = true; }
    return any ? Math.round(sum) : null;
  };

  /* Daily history from Wynnventory: whatever list of dated price rows the answer holds, oldest first. */
  const histCache = {};
  const PRICE_KEYS = ['average_mid_80_percent_price', 'p50_price', 'average_price'];
  W.priceHistory = (name, days = 30) => {
    const end = new Date(), start = new Date(Date.now() - days * 864e5), d = (x) => x.toISOString().slice(0, 10);
    const key = name + '|' + days;
    return histCache[key] || (histCache[key] = fetch(`${W.API_RELAY}/market/history/${encodeURIComponent(name)}?start_date=${d(start)}&end_date=${d(end)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'relay' : r.status === 503 ? 'nokey' : 'http ' + r.status)))
      .then(j => {
        const arr = Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data : (j && (j.history || (j.data && j.data.history))) || [];
        return arr.map(row => {
          const dk = Object.keys(row).find(k => /date|day|time/i.test(k));
          const p = PRICE_KEYS.map(k => row[k]).find(v => v > 0);
          return { t: dk ? Date.parse(row[dk]) : NaN, p, lo: row.lowest_price || null, hi: row.highest_price || null, n: row.total_count || row.count || null };
        }).filter(r => isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
      }).catch(e => { delete histCache[key]; throw e; }));
  };

  /* price line chart: daily price, with the day's lowest/highest as a band */
  function chart(rows) {
    if (rows.length < 2) return el('p', { class: 'empty' }, 'Not enough sales in this period to draw a chart.');
    const Wd = 600, H = 180, pad = 4;
    const ys = rows.flatMap(r => [r.p, r.lo || r.p, Math.min(r.hi || r.p, r.p * 3)]);
    const min = Math.min(...ys), max = Math.max(...ys), t0 = rows[0].t, t1 = rows[rows.length - 1].t;
    const X = (t) => pad + (t - t0) / Math.max(1, t1 - t0) * (Wd - pad * 2), Y = (v) => H - pad - (v - min) / Math.max(1, max - min) * (H - pad * 2);
    const band = rows.filter(r => r.lo && r.hi);
    const svg = `<svg viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none" role="img" aria-label="Price over time">` +
      (band.length > 1 ? `<polygon class="pband" points="${band.map(r => `${X(r.t)},${Y(Math.min(r.hi, r.p * 3))}`).join(' ')} ${band.slice().reverse().map(r => `${X(r.t)},${Y(r.lo)}`).join(' ')}"/>` : '') +
      `<polyline class="pline" fill="none" points="${rows.map(r => `${X(r.t)},${Y(r.p)}`).join(' ')}"/>` +
      rows.map(r => `<circle class="pdot" cx="${X(r.t)}" cy="${Y(r.p)}" r="3"><title>${new Date(r.t).toLocaleDateString()}: ${W.emeralds(r.p)}</title></circle>`).join('') + '</svg>';
    const box = el('div', { class: 'pchart' }); box.innerHTML = svg;
    return el('div', {}, box, el('div', { class: 'paxis' }, el('span', {}, new Date(t0).toLocaleDateString()), el('span', {}, `${W.emeralds(min)} – ${W.emeralds(max)}`), el('span', {}, new Date(t1).toLocaleDateString())));
  }

  const PF = { item: '', days: 30 };
  W.pages['items/prices'] = function (root, q) {
    if (q && q.get('i')) PF.item = q.get('i');
    W.withData(root, ['items'], (items) => {
      const byName = Object.fromEntries(items.map(i => [i.n, i]));
      const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', { class: 'stack' }, finder(), detail()), el('div', { class: 'stack' }, watchWin())));

      function finder() {
        const box = W.itemPicker(items, { value: PF.item, placeholder: 'Item name, e.g. Freedom', onPick: (i) => pick(i.n) });
        return W.win('Trade market prices', el('div', { class: 'search' }, box, el('button', { onclick: () => box.pick() }, 'Show')),
          el('p', { class: 'hint' }, 'Prices from Wynnventory, which records trade market listings. Daily history shows how an item’s price moved.'));
      }
      function pick(n) {
        const hit = byName[n] ? n : (items.find(x => x.n.toLowerCase() === String(n).trim().toLowerCase()) || {}).n;
        PF.item = hit || ''; history.replaceState(null, '', '#items/prices' + (hit ? '?i=' + encodeURIComponent(hit) : '')); draw();
      }

      function detail() {
        const it = byName[PF.item]; if (!it) return null;
        const now = el('div', { class: 'pnow' }, el('p', { class: 'empty' }, 'Checking the trade market…'));
        const hist = el('div', {}, el('p', { class: 'empty' }, 'Loading price history…'));
        W.marketInfo(it.n).then(j => {
          const d = j && j.data;
          W.marketPrice(it.n).then(p => {
            now.replaceChildren(p ? el('div', { class: 'bigstats', style: { marginTop: 0 } },
              el('div', {}, W.emeraldTag(p), el('span', {}, 'Typical price')),
              el('div', {}, d && d.lowest_price ? W.emeraldTag(d.lowest_price) : el('b', {}, '—'), el('span', {}, 'Cheapest listing')),
              el('div', {}, el('b', {}, d && d.total_count != null ? d.total_count : '—'), el('span', {}, 'Listings'))) : el('p', { class: 'empty' }, 'Not seen on the trade market lately.'));
          });
        });
        W.priceHistory(it.n, PF.days).then(rows => {
          const cur = rows.length ? rows[rows.length - 1].p : null, low = rows.length ? Math.min(...rows.map(r => r.p)) : null, first = rows.length ? rows[0].p : null;
          hist.replaceChildren(chart(rows),
            rows.length > 1 ? el('div', { class: 'kv', style: { marginTop: '10px' } },
              el('div', {}, el('span', {}, `Change over ${PF.days} days`), el('b', { class: cur >= first ? 'up' : 'down' }, `${cur >= first ? '+' : ''}${Math.round((cur / first - 1) * 100)}%`)),
              el('div', {}, el('span', {}, `Lowest in ${PF.days} days`), W.emeraldTag(low)),
              cur <= low * 1.05 ? el('div', {}, el('span', {}, 'Right now'), el('b', { class: 'up' }, 'About as cheap as it’s been')) : null) : null);
        }).catch(e => hist.replaceChildren(el('p', { class: 'warn' }, e.message === 'relay' ? 'Price history needs the updated Wynnia relay (proxy/worker.js).' : e.message === 'nokey' ? 'Market prices are switched off on the relay.' : 'Couldn’t load the price history.')));
        const watched = W.watchlist().find(w => w.n === it.n);
        const target = el('input', { type: 'text', placeholder: 'e.g. 2 stx or 40 LE', value: watched && watched.below ? W.emeralds(watched.below) : '' });
        return W.win(it.n,
          el('div', { class: 'pitemhead' }, el('span', { class: 'islot', style: { '--rc': W.tierColor(it.r) } }, W.art.item(it.ic)), el('div', {}, el('b', { style: { color: it.r === 'mythic' ? '#cf5ce8' : W.tierColor(it.r) } }, it.n), el('small', {}, `${W.cap(it.r)} ${it.t} · Lv. ${it.l}`))),
          now,
          el('div', { class: 'pdays' }, [7, 30, 90].map(n => el('button', { class: 'mini' + (PF.days === n ? ' on' : ''), onclick: () => { PF.days = n; draw(); } }, n + ' days'))),
          hist,
          el('div', { class: 'cap left' }, 'Alert me'),
          el('div', { class: 'search' }, el('label', { class: 'plabel' }, 'When it’s below'), target,
            el('button', { onclick: () => { const v = W.parseEmeralds(target.value); if (!v) { target.setCustomValidity('Type an amount like 2 stx, 40 LE or 500 EB.'); target.reportValidity(); return; } setWatch(it.n, v); } }, watched ? 'Update' : 'Watch')),
          el('p', { class: 'hint' }, 'Wynnia checks your watched items each time you open the site and shows an alert when one drops below your price.'));
      }

      function setWatch(n, below) { const l = W.watchlist().filter(w => w.n !== n); l.unshift({ n, below }); write(KEY, l.slice(0, 30)); draw(); }
      function watchWin() {
        const l = W.watchlist();
        const body = el('div', { class: 'watchlist' }, l.length ? l.map(w => {
          const it = byName[w.n], cur = el('span', { class: 'wcur' }, '…');
          W.marketPrice(w.n).then(p => { cur.replaceChildren(p ? W.emeraldTag(p, 'span') : '—'); if (p && p <= w.below) cur.closest('.wrow').classList.add('hit'); });
          return el('div', { class: 'wrow' },
            el('button', { class: 'wlname', onclick: () => pick(w.n) }, it ? W.art.item(it.ic) : null, w.n),
            el('div', { class: 'wvals' }, cur, el('small', {}, 'target ', W.emeralds(w.below))),
            el('button', { class: 'mini danger', title: 'Stop watching', onclick: () => { write(KEY, W.watchlist().filter(x => x.n !== w.n)); draw(); } }, '×'));
        }) : el('p', { class: 'empty' }, 'Nothing watched yet. Look up an item and set a price to be alerted.'));
        return W.win('Watchlist', body, l.length ? el('p', { class: 'hint' }, 'Green means it’s at or below your price right now.') : null);
      }
      draw();
    });
  };

  /* on opening the site: check watched items (once a day each) and pop an alert for any that hit their price */
  W.checkPriceAlerts = () => {
    const l = W.watchlist(); if (!l.length) return;
    const seen = read(SEEN, {}), today = new Date().toISOString().slice(0, 10);
    l.slice(0, 12).forEach(w => {
      if (seen[w.n] === today) return;
      W.marketPrice(w.n).then(p => {
        if (!p || p > w.below) return;
        seen[w.n] = today; write(SEEN, seen);
        const toast = el('a', { class: 'ptoast', href: '#items/prices?i=' + encodeURIComponent(w.n) },
          el('img', { src: 'img/wiki/emeraldicon.webp', alt: '' }), el('div', {}, el('b', {}, `${w.n} is ${W.emeralds(p)}`), el('small', {}, `Below your ${W.emeralds(w.below)} alert. Click to see it.`)),
          el('button', { class: 'mini', 'aria-label': 'Dismiss', onclick: (e) => { e.preventDefault(); toast.remove(); } }, '×'));
        let box = document.querySelector('.ptoasts'); if (!box) { box = el('div', { class: 'ptoasts' }); document.body.append(box); }
        box.append(toast); setTimeout(() => toast.remove(), 20000);
      });
    });
  };
})(window.W);
