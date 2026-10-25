(function (W) {
  const { el } = W;
  const draft = { a: 0, b: 0, c: 0 };

  W.pages.ledger = function (root) {
    const S = W.state, L = S.ledger;
    const draw = () => root.replaceChildren(el('div', { class: 'cols' }, el('div', {}, form(), fit()), el('div', {}, table(), W.win('Why this exists', why()))));
    const delta = (e) => ((e.c - (e.a + e.b) / 2) / 8);   // per-stat bonus implied by one breed

    function form() {
      const field = (label, key, help) => el('label', {}, label, W.numIn(draft[key], (v) => { draft[key] = v; }, 0, 5000), el('small', {}, help));
      return W.win('Log a Breed',
        el('div', { class: 'form' },
          field('Parent A — sum of 8 limits', 'a', 'Add the eight Limit values (average × 8).'),
          field('Parent B — sum of 8 limits', 'b', 'Same for the second parent.'),
          field('Foal — Potential', 'c', 'The foal’s Potential right after breeding.')),
        el('div', { class: 'btns' },
          el('button', { onclick: () => { if (draft.a && draft.b && draft.c) { L.push({ ...draft }); W.save(); draw(); } } }, 'Add to ledger'),
          el('button', { onclick: () => { const a = W.mountById(S.feeder.a), b = W.mountById(S.feeder.b); if (a && b) { draft.a = W.sumLim(a); draft.b = W.sumLim(b); draw(); } } }, 'Fill parents from Feeder')),
        el('p', { class: 'hint' }, 'Use total limits, not max: the wiki says foals inherit from limits.'));
    }
    function fit() {
      const d = L.map(delta), n = d.length;
      if (!n) return W.win('Fitted Model', el('p', { class: 'empty' }, 'Log at least one breed to fit the bonus.'));
      const mean = d.reduce((a, b) => a + b, 0) / n;
      const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
      const perStatSd = sd == null ? null : sd * Math.sqrt(8);
      return W.win('Fitted Model',
        el('div', { class: 'kv wide' },
          el('div', {}, el('span', {}, 'Breeds logged'), el('b', {}, n)),
          el('div', {}, el('span', {}, 'Bonus per stat'), el('b', {}, W.num(mean, 2))),
          el('div', {}, el('span', {}, 'Bonus per breed (total)'), el('b', {}, W.num(mean * 8, 1))),
          el('div', {}, el('span', {}, 'Spread σ per stat'), el('b', {}, perStatSd == null ? 'need 2+' : W.num(perStatSd, 2)))),
        el('div', { class: 'btns' }, el('button', { onclick: () => { S.settings.bonus = Math.round(mean * 100) / 100; if (perStatSd != null) S.settings.sd = Math.round(perStatSd * 100) / 100; W.save(); draw(); } }, 'Use these in the planners')),
        el('p', { class: 'hint' }, `Currently in use: bonus ${S.settings.bonus}, σ ${S.settings.sd}. Per-stat spread assumes the eight stats vary independently; with few samples it is only a rough guide.`));
    }
    function table() {
      const rows = L.map((e, i) => el('tr', {}, el('td', {}, i + 1), el('td', {}, e.a), el('td', {}, e.b), el('td', {}, e.c), el('td', {}, (delta(e) >= 0 ? '+' : '') + W.num(delta(e), 2)),
        el('td', {}, el('button', { class: 'mini', onclick: () => { L.splice(i, 1); W.save(); draw(); } }, 'Remove'))));
      return W.win('Ledger', L.length ? el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['#', 'A limits', 'B limits', 'Foal pot.', 'Bonus/stat', ''].map(h => el('th', {}, h)))), el('tbody', {}, rows)) : el('p', { class: 'empty' }, 'No entries yet.'));
    }
    function why() {
      return el('p', {}, 'The wiki documents that foals average their parents’ limits plus an unspecified bonus and some randomness, but not the numbers. Every real breed you log tightens the estimate, and the Feeder and Lineage planners use whatever value you save here.');
    }
    draw();
  };
})(window.W);
