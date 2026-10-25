/* Pair Finder: rank every breedable pair in the stable by the foal's expected Potential. */
(function (W) {
  const { el } = W;
  const cfg = { type: 'all', readyOnly: true };

  const expected = (a, b, S) => W.STATKEYS.reduce((t, k) => t + Math.max(1, Math.round((a.s[k][1] + b.s[k][1]) / 2 + S.bonus)), 0);

  W.pages['mounts/pairs'] = function (root) {
    const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, list()), el('div', {}, help())));

    function list() {
      const S = W.state.settings, ms = W.state.mounts.filter(m => cfg.type === 'all' || m.type === cfg.type);
      const pairs = [];
      for (let i = 0; i < ms.length; i++) for (let j = 0; j < ms.length; j++) {
        if (i === j || ms[i].type !== ms[j].type) continue;
        const a = ms[i], b = ms[j];
        if (cfg.readyOnly && !W.canBreed(a)) continue;
        if (j < i && W.canBreed(ms[j])) continue;   // A/B and B/A give the same foal; keep one
        const pot = expected(a, b, S), best = Math.max(W.potential(a), W.potential(b));
        pairs.push({ a, b, pot, gain: pot - best });
      }
      pairs.sort((x, y) => y.pot - x.pot);
      const types = [['all', 'All types'], ...Object.entries(W.TYPES).map(([k, t]) => [k, t.name])];
      return W.win('Best pairs in your stable',
        el('div', { class: 'form row' },
          el('label', {}, 'Mount type', W.sel(types, cfg.type, (v) => { cfg.type = v; draw(); })),
          el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: cfg.readyOnly, onchange: (e) => { cfg.readyOnly = e.target.checked; draw(); } }), 'Only pairs where the first mount can breed now')),
        pairs.length ? el('div', { class: 'pairlist' }, pairs.slice(0, 25).map((p, i) => el('div', { class: 'pair' },
          el('span', { class: 'rankno' }, '#' + (i + 1)),
          W.mountSlot(p.a), el('span', { class: 'plus-op' }, '+'), W.mountSlot(p.b),
          el('div', { class: 'pinfo' },
            el('b', {}, `${p.a.name} + ${p.b.name}`),
            el('small', {}, `Expected foal Potential ${p.pot}`, el('span', { class: p.gain >= 0 ? 'up' : 'down' }, ` (${p.gain >= 0 ? '+' : ''}${p.gain} vs. better parent)`))),
          el('button', { onclick: () => { W.state.feeder.a = p.a.id; W.state.feeder.b = p.b.id; W.go('mounts/feeder'); } }, 'Open in Feeder'))))
          : el('p', { class: 'empty' }, ms.length < 2 ? 'You need at least two mounts of the same type in your stable.' : 'No pair qualifies. Untick the filter to see pairs that still need feeding.'));
    }
    function help() {
      return W.win('How pairs are scored', el('ul', { class: 'rules' },
        el('li', {}, 'Each stat of the foal is predicted as the average of both parents’ ', el('b', {}, 'limits'), ' plus your breeding bonus (now ', W.state.settings.bonus, ' per stat).'),
        el('li', {}, 'The first mount (left slot in-game) needs an average limit of 20 or more.'),
        el('li', {}, 'A negative number means the foal is expected to be weaker than the better parent, usually because the limits are far apart.'),
        el('li', { class: 'unk' }, 'The bonus is an estimate. Log real breeds in the Ledger to make the ranking more accurate.')));
    }
    draw();
  };
})(window.W);
