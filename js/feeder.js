(function (W) {
  const { el } = W;

  W.modelControls = (onChange) => {
    const S = W.state.settings;
    const f = (label, key, step, tipText) => {
      const i = W.numIn(S[key], (v) => { S[key] = v; W.save(); onChange(); }, 0, 60, step);
      return el('label', {}, label, i);
    };
    return el('div', { class: 'model' },
      f('Bonus per stat', 'bonus', 0.5), f('Spread (σ)', 'sd', 0.5), f('Level spread', 'curSd', 0.1),
      el('a', { href: '#ledger', class: 'link' }, 'calibrate from real breeds →'));
  };

  W.simulate = (a, b, n = 4000) => {
    const pots = new Array(n);
    for (let i = 0; i < n; i++) pots[i] = W.potential(W.breed(a, b));
    pots.sort((x, y) => x - y);
    return pots;
  };

  W.histogram = (vals, marks = [], w = 560, h = 150) => {
    const NS = 'http://www.w3.org/2000/svg';
    const mv = marks.map(m => m[0]), lo = Math.floor(Math.min(vals[0], ...mv)), hi = Math.ceil(Math.max(vals[vals.length - 1], ...mv)), bins = Math.min(40, Math.max(8, hi - lo + 1));
    const bw = (hi - lo + 1) / bins, cnt = new Array(bins).fill(0);
    vals.forEach(v => cnt[Math.min(bins - 1, Math.floor((v - lo) / bw))]++);
    const mx = Math.max(...cnt);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h + 22}`); svg.setAttribute('class', 'hist');
    const add = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; svg.append(n); return n; };
    const x = (v) => (v - lo) / (hi - lo + 1) * w;
    cnt.forEach((c, i) => add('rect', { x: i * w / bins + 1, y: h - c / mx * h, width: w / bins - 2, height: c / mx * h, class: 'h-bar' }));
    marks.forEach(([v, label, cls]) => {
      if (v < lo || v > hi + 1) return;
      add('line', { x1: x(v), x2: x(v), y1: 0, y2: h, class: 'h-mark ' + cls });
      add('text', { x: Math.min(w - 4, Math.max(4, x(v) + 3)), y: 12, class: 'h-lbl ' + cls }, label);
    });
    add('text', { x: 0, y: h + 16, class: 'h-ax' }, lo); add('text', { x: w, y: h + 16, class: 'h-ax', 'text-anchor': 'end' }, hi);
    return svg;
  };

  W.pages.feeder = function (root) {
    const S = W.state, F = S.feeder;
    let sample = null;
    const draw = () => {
      const a = W.mountById(F.a), b = W.mountById(F.b);
      root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, top(a, b), result(a, b)), el('div', {}, inv(a, b), W.win('How breeding works', rules()))));
    };
    function top(a, b) {
      const arrow = el('div', { class: 'arrow' }, '➜');
      const res = sample ? W.mountSlot(sample, { big: true }) : W.slot(el('span', { class: 'plus' }, '?'), { big: true, tip: 'Press “Roll one outcome”' });
      return W.win('Feeder — Breeding',
        el('div', { class: 'feeder' },
          el('div', {}, el('div', { class: 'cap' }, 'Parent A'), W.mountSlot(a, { big: true, onclick: () => { F.a = null; sample = null; draw(); } })),
          el('div', {}, el('div', { class: 'cap' }, 'Parent B'), W.mountSlot(b, { big: true, onclick: () => { F.b = null; sample = null; draw(); } })),
          arrow,
          el('div', {}, el('div', { class: 'cap' }, 'Offspring'), res)),
        el('p', { class: 'hint' }, 'Pick mounts from the inventory on the right. Click a parent slot to clear it. In-game, place the second saddle to the right of the first.'),
        W.modelControls(() => { sample = null; draw(); }));
    }
    function inv(a, b) {
      return W.win('Your Mounts', W.inventory((m) => {
        if (F.a === m.id) F.a = null; else if (F.b === m.id) F.b = null;
        else if (!F.a) F.a = m.id; else F.b = m.id;
        sample = null; draw();
      }, [F.a, F.b], 18));
    }
    function result(a, b) {
      if (!a || !b) return W.win('Prediction', el('p', { class: 'empty' }, 'Choose two mounts to see the predicted offspring.'));
      const set = S.settings, pots = W.simulate(a, b), n = pots.length;
      const mean = pots.reduce((x, y) => x + y, 0) / n, pct = (p) => pots[Math.min(n - 1, Math.floor(p * n))];
      const pa = W.potential(a), pb = W.potential(b), best = Math.max(pa, pb);
      const beat = pots.filter(p => p > best).length / n, beatMean = pots.filter(p => p > (pa + pb) / 2).length / n;
      const warns = [];
      if (!W.canBreed(a)) warns.push(`Parent A’s average limit is ${W.num(W.avgLim(a), 2)} — it needs 20.00 (unrounded) to breed.`);
      if (Math.abs(W.sumLim(a) - W.sumLim(b)) / 8 > 4) warns.push('The parents’ limits differ a lot. The wiki warns the foal can end up worse than the stronger parent.');
      if (W.STATKEYS.some(k => a.s[k][1] < a.s[k][2] || b.s[k][1] < b.s[k][2])) warns.push('A parent has limit below its max. Only limits are inherited, so feed them to max first.');
      const rows = W.STATS.map(s => {
        const k = s.k, avg = (a.s[k][1] + b.s[k][1]) / 2;
        return el('tr', {}, el('td', { class: 'sname', style: { color: s.color } }, W.statName(s, a.type)), el('td', {}, a.s[k][1]), el('td', {}, b.s[k][1]), el('td', {}, W.num(avg)),
          el('td', {}, el('b', {}, W.num(avg + set.bonus)), ` ± ${W.num(set.sd)}`), el('td', {}, Math.max(a.s[k][0], b.s[k][0])));
      });
      return W.win('Prediction',
        ...warns.map(w => el('div', { class: 'warn' }, '⚠ ' + w)),
        el('div', { class: 'kv wide' },
          el('div', {}, el('span', {}, 'Expected Potential'), el('b', {}, W.num(mean, 0))),
          el('div', {}, el('span', {}, 'Likely range (80%)'), el('b', {}, `${pct(.1)} – ${pct(.9)}`)),
          el('div', {}, el('span', {}, 'Beats better parent'), el('b', {}, W.num(beat * 100, 0) + '%')),
          el('div', {}, el('span', {}, 'Beats parent average'), el('b', {}, W.num(beatMean * 100, 0) + '%')),
          el('div', {}, el('span', {}, 'Breeding time'), el('b', {}, W.BREED_HOURS + 'h')),
          el('div', {}, el('span', {}, 'Ready at'), el('b', {}, new Date(Date.now() + W.BREED_HOURS * 3600e3).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))),
        W.histogram(pots, [[pa, 'A', 'ma'], [pb, 'B', 'mb'], [mean, 'avg', 'mm']]),
        el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['Stat', 'A limit', 'B limit', 'Mean', 'Foal limit/max', 'Foal level'].map(h => el('th', {}, h)))), el('tbody', {}, rows)),
        el('div', { class: 'btns' },
          el('button', { onclick: () => { sample = W.breed(a, b); sample.name = `${a.name} × ${b.name}`; draw(); } }, 'Roll one outcome'),
          sample && el('button', { onclick: () => { S.mounts.push(sample); S.selected = sample.id; W.save(); sample = null; W.go('stable'); } }, 'Add outcome to stable')));
    }
    function rules() {
      return el('ul', { class: 'rules' },
        el('li', {}, el('b', {}, 'Requirement: '), 'Parent A needs an average limit of at least 20 (not rounded).'),
        el('li', {}, el('b', {}, 'Takes '), '6 hours and consumes both parents.'),
        el('li', {}, el('b', {}, 'Limit & Max '), 'come from the average of the parents’ ', el('i', {}, 'limits'), ' plus a hidden bonus and some variance. Parent max values are ignored.'),
        el('li', {}, el('b', {}, 'Level '), 'follows the higher parent’s current level.'),
        el('li', {}, el('b', {}, 'Colours '), 'are a random mix of both parents’.'),
        el('li', { class: 'unk' }, 'The bonus and variance are not documented. The values above are adjustable estimates — log real results in the Ledger to fit them.'));
    }
    draw();
  };
})(window.W);
