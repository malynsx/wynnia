/* Market: compare mount listings by price per Potential, and estimate the cost of breeding one yourself. */
(function (W) {
  const { el } = W;
  const KEY = 'wt.market';
  const st = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } })() ||
    { rows: [{ name: 'Listing 1', pot: 600, price: 128 }, { name: 'Listing 2', pot: 900, price: 320 }], base: 24, mat: 2, n: 8, level: 100 };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked */ } };

  W.pages['mounts/market'] = function (root) {
    const draw = () => { save(); root.replaceChildren(el('div', { class: 'cols' }, el('div', {}, listings()), el('div', {}, diy()))); };

    function listings() {
      const rows = st.rows.map((r, i) => ({ ...r, i, per: r.price / Math.max(1, r.pot) * 100 }));
      const best = Math.min(...rows.map(r => r.per));
      return W.win('Compare listings',
        el('div', { class: 'tscroll' }, el('table', { class: 'tbl edit' },
          el('thead', {}, el('tr', {}, ['Listing', 'Potential', 'Price (EB)', 'Per 100 Potential', ''].map(h => el('th', {}, h)))),
          el('tbody', {}, rows.map(r => el('tr', { class: r.per === best ? 'best' : '' },
            el('td', {}, el('input', { type: 'text', value: r.name, onchange: (e) => { st.rows[r.i].name = e.target.value; draw(); } })),
            el('td', {}, W.numIn(r.pot, (v) => { st.rows[r.i].pot = v; draw(); }, 0, 99999)),
            el('td', {}, W.numIn(r.price, (v) => { st.rows[r.i].price = v; draw(); }, 0, 999999, 0.5)),
            el('td', {}, el('b', {}, W.fmtEm(r.per))),
            el('td', {}, el('button', { class: 'mini', onclick: () => { st.rows.splice(r.i, 1); draw(); } }, 'Remove'))))))),
        el('div', { class: 'btns' }, el('button', { onclick: () => { st.rows.push({ name: 'Listing ' + (st.rows.length + 1), pot: 500, price: 100 }); draw(); } }, 'Add listing')),
        el('p', { class: 'hint' }, 'The cheapest price per 100 Potential is highlighted. 64 EB = 1 LE.'));
    }

    function diy() {
      const S = W.state.settings, sim = W.lineageSim(st.n, S), pts = W.matPoints(st.level);
      const pot = sim.balanced * 8;
      const breeds = sim.rounds.reduce((a, r) => a + r.breeds, 0);
      const stats = {}; W.STATKEYS.forEach(k => { stats[k] = [10, 30]; });
      const prepMats = W.planFeed(stats, { level: st.level }).steps.length;
      const refill = S.bonus > 0 ? Math.max(1, Math.ceil(S.bonus * 8 / pts)) : 0;
      const mats = prepMats * st.n + refill * breeds;
      const cost = st.n * st.base + mats * st.mat;
      return W.win('Breed it yourself',
        el('div', { class: 'form' },
          el('div', { class: 'two' },
            el('label', {}, 'Base mount price (EB)', W.numIn(st.base, (v) => { st.base = v; draw(); }, 0, 99999, 0.5)),
            el('label', {}, 'Material price (EB each)', W.numIn(st.mat, (v) => { st.mat = v; draw(); }, 0, 9999, 0.1))),
          el('div', { class: 'two' },
            el('label', {}, 'Base mounts', W.sel([2, 4, 8, 16, 32].map(x => [x, x]), st.n, (v) => { st.n = +v; draw(); })),
            el('label', {}, 'Material level', W.numIn(st.level, (v) => { st.level = Math.min(115, Math.max(1, v)); draw(); }, 1, 115)))),
        el('div', { class: 'kv wide', style: { marginTop: '16px' } },
          el('div', {}, el('span', {}, 'Expected Potential'), el('b', {}, W.num(pot, 0))),
          el('div', {}, el('span', {}, 'Materials'), el('b', {}, mats)),
          el('div', {}, el('span', {}, 'Total cost'), el('b', {}, W.fmtEm(cost))),
          el('div', {}, el('span', {}, 'Per 100 Potential'), el('b', {}, W.fmtEm(cost / pot * 100)))),
        el('p', { class: 'hint' }, 'Uses the Lineage model: pair mounts in rounds, refill limits after each breed. The breeding bonus is your Ledger estimate, so treat this as a rough guide.'));
    }
    draw();
  };
})(window.W);
