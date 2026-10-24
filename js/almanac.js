(function (W) {
  const { el } = W;
  const NS = 'http://www.w3.org/2000/svg';

  function lineChart(points, w = 520, h = 170, xl = '', yl = '') {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h + 30}`); svg.setAttribute('class', 'hist');
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys), y0 = Math.min(...ys) - 2;
    const X = v => 30 + (v - x0) / (x1 - x0) * (w - 40), Y = v => h - (v - y0) / (y1 - y0) * (h - 14);
    const add = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; svg.append(n); return n; };
    add('polyline', { points: points.map(p => X(p[0]) + ',' + Y(p[1])).join(' '), class: 'l-line' });
    points.forEach(p => add('rect', { x: X(p[0]) - 3, y: Y(p[1]) - 3, width: 6, height: 6, class: 'l-dot' }));
    add('text', { x: 30, y: h + 20, class: 'h-ax' }, x0 + ' ' + xl); add('text', { x: w - 10, y: h + 20, class: 'h-ax', 'text-anchor': 'end' }, x1);
    add('text', { x: 30, y: 12, class: 'h-ax' }, y1 + ' ' + yl);
    return svg;
  }

  W.pages.almanac = function (root) {
    const types = Object.entries(W.TYPES).map(([k, t]) => W.win(t.name,
      el('div', { class: 'tcard' }, W.slot(W.art.mount(k, W.COLORS[k].body[0][0], W.COLORS[k].second[0][0]), { big: true }),
        el('div', {}, el('p', {}, t.trait), el('div', { class: 'kv' },
          kvr('Requires', `Combat Lv ${t.level} · ${t.quest}`), kvr('Enclosure', t.home), kvr('Buy / items', `24 Emerald Blocks · ${t.items}`), kvr('Find', t.where), kvr('Train on', t.training))))));

    const maxT = 360;
    const feed = W.win('Feeding Time per Material',
      el('div', { class: 'bars' }, Object.entries(W.FEED_TIMES).map(([a, t]) => el('div', { class: 'brow' },
        el('span', {}, a == 20 ? '20+' : a), el('div', { class: 'cbar' }, el('i', { class: 'good', style: { width: Math.max(2, Math.sqrt(t / maxT) * 100) + '%' } }), el('b', {}, W.fmtDur(t) + (a == 11 ? ' (est.)' : '')))))),
      el('p', { class: 'hint' }, 'Keyed to the mount’s average limit rounded up. Bar length is square-rooted so short times stay visible. The wiki does not list 11.'));

    const pts = W.win('Material Points by Level', lineChart([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 105, 110, 115].map(l => [l, W.matPoints(l)]), 520, 150, 'lvl', 'pts'),
      el('p', { class: 'hint' }, 'Total limit points a single material gives. Some wiki entries are given as “x or y”; this uses the midpoint rounded.'));

    const colorBars = (arr) => el('div', { class: 'bars' }, arr.map(c => el('div', { class: 'brow' },
      el('span', {}, c[0]), el('div', { class: 'cbar' }, el('i', { class: 'gold', style: { width: c[1] / 35 * 100 + '%' } }), el('b', {}, c[1] + '%')))));
    const colors = W.win('Colours', el('div', { id: 'colbox' }));
    let ct = 'horse';
    const drawColors = () => {
      const C = W.COLORS[ct], combos = [];
      C.body.forEach(b => C.second.forEach(m => combos.push([b[0], m[0], b[1] * m[1] / 100])));
      combos.sort((a, b) => a[2] - b[2]);
      colors.querySelector('#colbox').replaceChildren(
        el('div', { class: 'toggles' }, Object.keys(W.COLORS).map(k => el('button', { class: 'tog' + (k === ct ? ' on' : ''), onclick: () => { ct = k; drawColors(); } }, W.TYPES[k].name))),
        el('div', { class: 'cols2' }, el('div', {}, el('div', { class: 'cap left' }, C.labels[0]), colorBars(C.body)), el('div', {}, el('div', { class: 'cap left' }, C.labels[1]), colorBars(C.second))),
        el('div', { class: 'cap left' }, 'Ten rarest looks (if the two rolls are independent)'),
        el('div', { class: 'rare' }, combos.slice(0, 10).map(c => el('div', { class: 'rr' }, W.slot(W.art.mount(ct, c[0], c[1])), el('div', {}, el('b', {}, `${c[0]} · ${c[1]}`), el('small', {}, '1 in ' + W.num(100 / c[2], 0)))))),
        el('p', { class: 'hint' }, 'Spawn rates are crowd-sourced (WynnToolZ) as listed on the wiki. Foals get a random mix of the parents’ colours.'));
    };

    const stats = W.win('The Eight Stats', el('div', { class: 'statlist' }, W.STATS.map(s => el('div', {}, el('b', {}, W.art.stat(s.k), el('span', {}, s.name + (s.alt ? ` (${s.alt} on Wyverns)` : ''))), el('span', {}, s.note)))),
      el('div', { class: 'kv' }, kvr('Level', 'Raised by powerups while riding, up to the limit.'), kvr('Limit', 'Raised by feeding materials, up to the max.'), kvr('Max', 'Hard cap. Only breeding raises it.'), kvr('Potential', 'Sum of the eight max values. A new mount is 240.')));

    const src = W.win('Sources & Honesty', el('ul', { class: 'rules' },
      el('li', {}, el('a', { href: 'https://wynncraft.wiki.gg/wiki/Mounts', target: '_blank', rel: 'noopener' }, 'Wynncraft Wiki — Mounts'), ' and ', el('a', { href: 'https://wynncraft.wiki.gg/wiki/Horses', target: '_blank', rel: 'noopener' }, 'Horses'), ' (both marked incomplete).'),
      el('li', {}, 'Community guide on the Wynncraft forums for averaging and tree-building advice.'),
      el('li', { class: 'unk' }, 'Unknown / estimated: the breeding bonus, the variance, and the 11-average feed time. These are adjustable and can be fitted in the Ledger.'),
      el('li', {}, 'Fan-made, not affiliated with Wynncraft or Mojang. Mount renders and icons are from the Wynncraft Wiki and belong to their respective owners.')));

    root.replaceChildren(el('div', { class: 'cols' }, el('div', {}, ...types, stats), el('div', {}, feed, pts, colors, src))); drawColors();
    function kvr(k, v) { return el('div', {}, el('span', {}, k), el('b', {}, v)); }
  };
})(window.W);
