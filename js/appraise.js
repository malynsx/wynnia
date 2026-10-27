/* Items > Roll Appraiser: paste a Wynntils item string and see how good its rolls are (each identification against
   its range, in-game stars, an overall %), what it sells for, and a plain keep / sell / reroll call. */
(function (W) {
  const { el } = W;
  const AP = { text: '' };
  const VERDICT = [
    [90, 'Top roll', 'Keep it, or list it above the typical price: rolls this good are rare.'],
    [75, 'Good roll', 'Worth using. Sells around the typical price.'],
    [50, 'Average roll', 'Fine to use. Reroll it if the IDs you care about came out low.'],
    [0, 'Low roll', 'Reroll it, or sell it near the cheapest price.'],
  ];

  W.pages['items/appraise'] = function (root) {
    W.withData(root, ['items', 'idkeys'], (items, idKeys) => {
      const byName = Object.fromEntries(items.map(i => [i.n, i]));
      const out = el('div', { class: 'stack' });
      const ta = el('textarea', { rows: 3, placeholder: 'Paste Wynntils item strings here (one or several)…', oninput: (e) => { AP.text = e.target.value; show(); } }, AP.text);
      const paste = el('button', { class: 'mini', onclick: () => {
        if (!navigator.clipboard || !navigator.clipboard.readText) return;
        navigator.clipboard.readText().then(t => { ta.value = AP.text = t; show(); }).catch(() => { paste.textContent = 'Clipboard blocked'; });
      } }, 'Paste from clipboard');
      root.replaceChildren(el('div', { class: 'stack' },
        W.win('Roll appraiser', el('p', { class: 'hint', style: { marginTop: 0 } }, 'In game, share an item with Wynntils (or copy it), then paste it here. You get every roll against its range, the overall roll, its market price and whether to keep, sell or reroll it.'),
          ta, el('div', { class: 'btns', style: { marginTop: '8px' } }, paste)),
        out));
      show();

      function show() {
        const res = AP.text.trim() ? WynntilsDecode.decodeGearText(AP.text, idKeys) : [];
        if (!res.length) { out.replaceChildren(AP.text.trim() ? W.win('Nothing found', el('p', { class: 'empty' }, 'That doesn’t contain a Wynntils item string.')) : ''); return; }
        out.replaceChildren(...res.map(r => {
          if (!r.ok) return W.win('Couldn’t read that', el('div', { class: 'warn' }, r.error));
          const it = byName[r.gear.name];
          if (!it) return W.win(r.gear.name, el('div', { class: 'warn' }, 'That item isn’t in the item list yet.'));
          return card(it, r.gear);
        }));
      }

      function card(it, g) {
        const rows = Object.entries(it.i || {}).filter(([, v]) => Array.isArray(v) && v[0] !== v[1]);
        const fixed = !rows.length;
        const quality = fixed ? null : W.rollQuality(it, g.ids);
        const verdict = quality == null ? null : VERDICT.find(([min]) => quality >= min);
        const priceBox = el('div', { class: 'bigstats', style: { marginTop: 0 } }, el('div', {}, el('b', {}, '…'), el('span', {}, 'Typical price')), el('div', {}, el('b', {}, '…'), el('span', {}, 'Cheapest')), el('div', {}, el('b', {}, '…'), el('span', {}, 'Listings')));
        W.marketInfo(it.n).then(j => {
          const d = j && j.data;
          W.marketPrice(it.n).then(p => priceBox.replaceChildren(
            el('div', {}, p ? W.emeraldTag(p) : el('b', {}, '—'), el('span', {}, 'Typical price')),
            el('div', {}, d && d.lowest_price ? W.emeraldTag(d.lowest_price) : el('b', {}, '—'), el('span', {}, 'Cheapest')),
            el('div', {}, el('b', {}, d && d.total_count != null ? d.total_count : '—'), el('span', {}, 'Listings'))));
        });
        const ranked = rows.map(([k, v]) => {
          const cur = g.ids[k] != null ? g.ids[k] : null, lo = Math.min(...v), hi = Math.max(...v);
          const pct = cur == null ? null : Math.round((cur - v[0]) / (v[1] - v[0]) * 100);
          return { k, v, cur, pct, stars: cur == null ? 0 : W.rollStars(v, cur), lo, hi };
        });
        const known = ranked.filter(x => x.pct != null).sort((a, b) => b.pct - a.pct);
        const put = el('button', { onclick: () => { const slot = W.loadoutPut(it, g.ids, g.powders); put.textContent = slot ? 'Added to your build' : 'Can’t go in a gear slot'; if (slot) setTimeout(() => { location.hash = '#items/loadout'; }, 600); } }, 'Use in Loadout Builder');
        return el('section', { class: 'apcard', style: { '--rc': it.r === 'mythic' ? '#cf5ce8' : W.tierColor(it.r) } },
          el('div', { class: 'aphead' },
            el('span', { class: 'islot' }, W.art.item(it.ic)),
            el('div', {}, el('h3', {}, it.n), el('small', {}, `${W.cap(it.r)} ${it.t} · Lv. ${it.l}${g.rerolls ? ` · rerolled ${g.rerolls}×` : ''}${g.powders && g.powders.length ? ` · ${g.powders.length} powders` : ''}`)),
            quality != null ? el('div', { class: 'apq', style: { '--q': quality } }, el('b', {}, quality + '%'), el('span', {}, 'overall roll')) : null),
          verdict ? el('div', { class: 'apverdict q' + verdict[0] }, el('b', {}, verdict[1]), el('span', {}, verdict[2])) : el('div', { class: 'apverdict' }, el('b', {}, 'Doesn’t roll'), el('span', {}, 'Every copy of this item has the same values.')),
          known.length ? el('div', { class: 'aprolls' }, known.map(x => el('div', { class: 'aprow' },
            el('span', { class: 'apname' }, W.idInfo(x.k).name),
            el('b', { class: W.idGood(x.k, x.cur) ? 'pos' : 'neg' }, W.fmtId(x.k, x.cur)),
            el('div', { class: 'rbar' }, el('i', { style: { width: Math.max(0, Math.min(100, x.pct)) + '%' } })),
            el('span', { class: 'appct' }, x.pct + '%'),
            el('span', { class: 'rstars' }, x.stars ? '★'.repeat(x.stars) : ''),
            el('small', {}, `${W.fmtId(x.k, x.lo)} to ${W.fmtId(x.k, x.hi)}`)))) : null,
          known.length > 2 ? el('p', { class: 'hint' }, `Best: ${W.idInfo(known[0].k).name} (${known[0].pct}%). Weakest: ${W.idInfo(known[known.length - 1].k).name} (${known[known.length - 1].pct}%).`) : null,
          priceBox,
          el('div', { class: 'btns' }, put, el('a', { class: 'btnlink', href: '#items/prices?i=' + encodeURIComponent(it.n) }, 'Price history')));
      }
    });
  };
})(window.W);
