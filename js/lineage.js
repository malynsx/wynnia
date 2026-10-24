(function (W) {
  const { el } = W;
  const cfg = { n: 8, level: 100, slots: 3 };

  /* Per-stat model with every stat equal: m = per-stat max, potential = 8m. Mounts are refilled to limit = max before breeding. */
  function simulate(n, S) {
    const b = S.bonus, rounds = [];
    let nodes = Array(n).fill(30);
    while (nodes.length > 1) {
      const next = [];
      for (let i = 0; i + 1 < nodes.length; i += 2) next.push((nodes[i] + nodes[i + 1]) / 2 + b);
      if (nodes.length % 2) next.push(nodes.at(-1));
      rounds.push({ breeds: Math.floor(nodes.length / 2), out: next, in: nodes });
      nodes = next;
    }
    let chain = 30; for (let i = 1; i < n; i++) chain = (chain + 30) / 2 + b;
    // Chain where each new mount is bred in as a fresh 30.
    return { rounds, balanced: nodes[0], chain };
  }

  W.pages.lineage = function (root) {
    const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, controls(), table()), el('div', {}, tree(), notes())));
    const S = W.state.settings;

    function controls() {
      return W.win('Lineage Planner',
        el('div', { class: 'form' },
          el('label', {}, 'Base mounts', W.sel([2, 3, 4, 6, 8, 12, 16, 32, 64].map(x => [x, x]), cfg.n, (v) => { cfg.n = +v; draw(); })),
          el('label', {}, `Feed material level: ${cfg.level}`, el('input', { type: 'range', min: 1, max: 115, value: cfg.level, oninput: (e) => { cfg.level = +e.target.value; e.target.previousSibling.textContent = `Feed material level: ${cfg.level}`; }, onchange: draw })),
          el('label', {}, 'Feeders you can run at once', W.numIn(cfg.slots, (v) => { cfg.slots = Math.max(1, v); draw(); }, 1, 20))),
        W.modelControls(draw),
        el('p', { class: 'hint' }, 'Assumes base mounts are fully fed (limit = max = 30 on every stat) and each foal is fed back up to its new max before the next breed.'));
    }

    function table() {
      const r = simulate(cfg.n, S);
      const pts = W.matPoints(cfg.level);
      // base prep: one fresh mount from limit 10 to 30 on every stat
      const stats = {}; W.STATKEYS.forEach(k => stats[k] = [10, 30]);
      const prep = W.planFeed(stats, { level: cfg.level, targetAvg: 0 });
      let wall = Math.ceil(cfg.n / cfg.slots) * prep.minutes, mats = prep.steps.length * cfg.n, feederMin = prep.minutes * cfg.n;
      const rows = r.rounds.map((rd, i) => {
        const avgIn = rd.in.reduce((a, b) => a + b, 0) / rd.in.length;
        const out = rd.out.reduce((a, b) => a + b, 0) / rd.out.length;
        const refill = Math.max(0, Math.ceil(S.bonus * 8 / pts)) * 360;
        const perPair = W.BREED_HOURS * 60 + (S.bonus > 0 ? Math.max(1, Math.ceil(S.bonus * 8 / pts)) * 360 : 0);
        wall += Math.ceil(rd.breeds / cfg.slots) * perPair;
        mats += rd.breeds * (S.bonus > 0 ? Math.max(1, Math.ceil(S.bonus * 8 / pts)) : 0);
        feederMin += rd.breeds * perPair;
        return el('tr', {}, el('td', {}, i + 1), el('td', {}, rd.in.length), el('td', {}, rd.breeds), el('td', {}, W.num(avgIn * 8, 0)), el('td', {}, W.num(out * 8, 0)), el('td', {}, '+' + W.num((out - avgIn) * 8, 0)));
      });
      const bal = r.balanced * 8, chn = r.chain * 8;
      const bar = (label, v, cls) => el('div', { class: 'cmp' }, el('span', {}, label), el('div', { class: 'cbar' }, el('i', { class: cls, style: { width: Math.min(100, v / Math.max(bal, chn, 1) * 100) + '%' } }), el('b', {}, W.num(v, 0))));
      return W.win('Result',
        el('div', { class: 'kv wide' },
          el('div', {}, el('span', {}, 'Final Potential'), el('b', { style: { color: W.rank(bal).color } }, W.num(bal, 0))),
          el('div', {}, el('span', {}, 'Rounds of breeding'), el('b', {}, r.rounds.length)),
          el('div', {}, el('span', {}, 'Materials needed'), el('b', {}, W.num(mats, 0))),
          el('div', {}, el('span', {}, `Rough wall-clock (${cfg.slots} feeders)`), el('b', {}, W.fmtDur(wall)))),
        el('div', { class: 'cap left' }, 'Pairing in groups vs chaining (guide’s advice)'),
        bar('Balanced tree', bal, 'good'), bar('Chain: foal × new mount, repeat', chn, 'bad'),
        el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['Round', 'Mounts in', 'Breeds', 'Avg potential in', 'Avg potential out', 'Gain'].map(h => el('th', {}, h)))), el('tbody', {}, rows)),
        el('p', { class: 'hint' }, `Each fresh mount needs ${prep.steps.length} level ${cfg.level} materials (${W.fmtDur(prep.minutes)} of feeding) to reach limit 30 on every stat. Refills after each breed assume a material per ${pts} points. Wall-clock is a rough upper-bound sketch; materials are also gathered in real life, which this doesn’t count.`));
    }

    function tree() {
      const n = Math.min(cfg.n, 16), NS = 'http://www.w3.org/2000/svg';
      const levels = []; let c = n; while (c >= 1) { levels.push(c); if (c === 1) break; c = Math.ceil(c / 2); }
      const w = 560, h = 40 + levels.length * 56, svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('class', 'tree');
      const add = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); return e; };
      const pos = (l, i) => [(i + .5) * w / levels[l], h - 30 - l * 56];
      levels.forEach((cnt, l) => { for (let i = 0; i < cnt; i++) {
        const [x, y] = pos(l, i);
        if (l + 1 < levels.length) { const [px, py] = pos(l + 1, Math.floor(i / 2)); add('line', { x1: x, y1: y, x2: px, y2: py, class: 't-line' }); }
        add('rect', { x: x - 9, y: y - 9, width: 18, height: 18, class: 't-node l' + Math.min(l, 4) });
      } });
      return W.win(`Tree shape${cfg.n > 16 ? ' (first 16 shown)' : ''}`, svg);
    }

    function notes() {
      return W.win('Why the shape matters', el('ul', { class: 'rules' },
        el('li', {}, 'A foal’s limits are the ', el('i', {}, 'average'), ' of its parents’. Breeding a strong foal with a weak new mount drags it back down.'),
        el('li', {}, 'Pair equals with equals: ', el('b', {}, '(1+2) and (3+4)'), ', then those two together — never ((1+2)+3)+4.'),
        el('li', {}, 'Every round only adds the bonus once, so reaching high Potential takes many rounds — that is why guides suggest 8 mounts into 1.'),
        el('li', { class: 'unk' }, 'Because the bonus is unconfirmed, treat these totals as relative comparisons until you calibrate it in the Ledger.')));
    }
    draw();
  };
})(window.W);
