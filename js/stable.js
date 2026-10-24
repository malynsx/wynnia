(function (W) {
  const { el } = W;
  W.pages = W.pages || {};

  /* A grid of the player's mounts, used on several pages as the "inventory". */
  W.inventory = (onPick, selectedIds = [], minSlots = 27) => {
    const n = Math.max(minSlots, Math.ceil(W.state.mounts.length / 9) * 9);
    const g = el('div', { class: 'grid' });
    for (let i = 0; i < n; i++) {
      const m = W.state.mounts[i];
      g.append(m ? W.mountSlot(m, { sel: selectedIds.includes(m.id), onclick: () => onPick(m) }) : W.slot(null));
    }
    return g;
  };

  W.pages.stable = function (root) {
    const S = W.state;
    const draw = () => {
      if (S.selected && !W.mountById(S.selected)) S.selected = null;
      const m = W.mountById(S.selected);
      root.replaceChildren(el('div', { class: 'cols' }, left(m), right(m)));
    };
    const commit = () => { W.save(); draw(); };

    function left(m) {
      const n = Math.max(27, Math.ceil((S.mounts.length + 1) / 9) * 9);
      const g = el('div', { class: 'grid' });
      for (let i = 0; i <= n - 1; i++) {
        const mm = S.mounts[i];
        if (mm) g.append(W.mountSlot(mm, { sel: mm.id === S.selected, onclick: () => { S.selected = mm.id; draw(); } }));
        else if (i === S.mounts.length) g.append(W.slot(el('span', { class: 'plus' }, '+'), { tip: 'Add a new mount', onclick: () => { const x = W.newMount(); S.mounts.push(x); S.selected = x.id; commit(); } }));
        else g.append(W.slot(null));
      }
      const pots = S.mounts.map(W.potential);
      const sum = (f) => S.mounts.length ? f() : '—';
      const best = (k) => { const b = [...S.mounts].sort((a, c) => c.s[k][2] - a.s[k][2])[0]; return b ? `${b.name} (${b.s[k][2]})` : '—'; };
      const ready = S.mounts.filter(W.canBreed).length;
      const stats = el('div', { class: 'kv' },
        kv('Mounts', S.mounts.length), kv('Breed-ready', ready), kv('Best potential', pots.length ? Math.max(...pots) : '—'),
        kv('Mean potential', sum(() => W.num(pots.reduce((a, b) => a + b, 0) / pots.length, 0))),
        kv('Top Speed max', best('speed')), kv('Top Energy max', best('energy')));
      const io = el('textarea', { rows: 3, placeholder: 'Paste exported stable JSON here to import…' });
      return el('div', {},
        W.win('Enclosure — Saddle Slots', g, el('p', { class: 'hint' }, 'Click a saddle to edit it. The number is the mount’s Potential. Everything is saved in this browser only.')),
        W.win('Stable Summary', stats),
        W.win('Backup & Share',
          el('div', { class: 'btns' },
            el('button', { onclick: () => { io.value = JSON.stringify({ mounts: S.mounts }); io.select(); } }, 'Export'),
            el('button', { onclick: () => {
              try { const d = JSON.parse(io.value); if (!Array.isArray(d.mounts)) throw 0; d.mounts.forEach(x => W.clampMount(x)); S.mounts = S.mounts.concat(d.mounts.map(x => ({ ...x, id: 'm' + Math.random().toString(36).slice(2, 9) }))); commit(); }
              catch (e) { io.value = '⚠ That is not valid stable JSON.'; }
            } }, 'Import (adds)'),
            el('button', { class: 'danger', onclick: () => { if (confirm('Delete every mount?')) { S.mounts = []; S.selected = null; commit(); } } }, 'Clear all')),
          io));
    }
    const kv = (k, v) => el('div', {}, el('span', {}, k), el('b', {}, v));

    function right(m) {
      if (!m) return W.win('Mount', el('p', { class: 'empty' }, 'Select a saddle on the left, or click the + slot to add one.'));
      const r = W.rank(W.potential(m));
      const rows = W.STATS.map(s => {
        const [c, l, x] = m.s[s.k];
        const set = (i) => (v) => { m.s[s.k][i] = v; W.clampMount(m); commit(); };
        return el('div', { class: 'srow', style: { '--c': s.color } },
          el('span', { class: 'sname' }, W.art.stat(s.k), W.statName(s, m.type)),
          el('div', { class: 'bar' }, el('i', { class: 'bmax', style: { width: Math.min(100, x / 0.6) + '%' } }), el('i', { class: 'blim', style: { width: Math.min(100, l / 0.6) + '%' } }),
            el('i', { class: 'bcur', style: { width: Math.min(100, c / 0.6) + '%', background: s.color } })),
          W.numIn(c, set(0), 1, 999), W.numIn(l, set(1), 1, 999), W.numIn(x, set(2), 1, 999));
      });
      const head = el('div', { class: 'srow shead' }, el('span'), el('span'), el('span', {}, 'Level'), el('span', {}, 'Limit'), el('span', {}, 'Max'));
      const set = (k) => (v) => { m[k] = v; commit(); };
      return el('div', {},
        W.win('Mount',
          el('div', { class: 'mhead' },
            W.mountSlot(m, { big: true }),
            el('div', { class: 'fields' },
              el('input', { type: 'text', value: m.name, maxlength: 24, onchange: (e) => { m.name = e.target.value || 'Unnamed'; commit(); } }),
              el('div', { class: 'two' },
                W.sel(Object.entries(W.TYPES).map(([k, v]) => [k, v.name]), m.type, (v) => { m.type = v; m.c1 = W.COLORS[v].body[0][0]; m.c2 = W.COLORS[v].second[0][0]; commit(); }),
                W.sel(W.COLORS[m.type].body.map(c => c[0]), m.c1, set('c1')),
                W.sel(W.COLORS[m.type].second.map(c => c[0]), m.c2, set('c2'))))),
          head, ...rows,
          el('div', { class: 'legend' }, el('i', { class: 'k1' }), 'Level', el('i', { class: 'k2' }), 'Limit', el('i', { class: 'k3' }), 'Max'),
          el('div', { class: 'btns' },
            el('button', { onclick: () => { const c = JSON.parse(JSON.stringify(m)); c.id = 'm' + Math.random().toString(36).slice(2, 9); c.name += ' II'; S.mounts.push(c); S.selected = c.id; commit(); } }, 'Duplicate'),
            el('button', { onclick: () => { S.feeder.a = m.id; W.go('feeder'); } }, 'To Feeder as A'),
            el('button', { onclick: () => { S.feeder.b = m.id; W.go('feeder'); } }, 'To Feeder as B'),
            el('button', { class: 'danger', onclick: () => { S.mounts = S.mounts.filter(x => x !== m); S.selected = null; commit(); } }, 'Delete'))),
        W.win('Readout',
          el('div', { class: 'readout' },
            W.radar(m),
            el('div', { class: 'kv' },
              el('div', {}, el('span', {}, 'Potential'), el('b', { style: { color: r.color } }, W.potential(m))),
              kv('Rank*', el('span', { style: { color: r.color } }, r.name)),
              kv('Average limit', W.num(W.avgLim(m), 2)),
              kv('Feed time / material', W.fmtDur(W.feedMinutes(Math.ceil(W.avgLim(m))))),
              kv('Breeding', W.canBreed(m) ? '✔ ready' : `needs +${W.num((20 - W.avgLim(m)) * 8, 0)} limit points`),
              kv('Limit room left', W.STATKEYS.reduce((a, k) => a + m.s[k][2] - m.s[k][1], 0) + ' pts'),
              kv('Levels to train', W.STATKEYS.reduce((a, k) => a + m.s[k][1] - m.s[k][0], 0) + ' pickups'))),
          el('p', { class: 'hint' }, '*Ranks are this site’s own scale for fun; the game only shows Potential.')));
    }
    draw();
  };
})(window.W);
