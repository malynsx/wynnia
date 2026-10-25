/* Ability tree board using the game's own node and connector textures (from the Wynncraft Wiki).
   Read-only (a character's tree) or editable (loadout builder) with the in-game unlock rules. */
(function (W) {
  const { el } = W;
  const cache = {};
  W.loadTree = (cls) => cache[cls] || (cache[cls] = Promise.all([W.api(`ability/tree/${cls}`), W.api(`ability/map/${cls}`)]).then(([tree, map]) => {
    const abilities = {};
    Object.values(tree.pages || {}).forEach(p => Object.entries(p).forEach(([id, a]) => { abilities[id] = a; }));
    const plain = (h) => new DOMParser().parseFromString([].concat(h || '').join(' '), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
    const archetypes = Object.entries(tree.archetypes || {}).map(([key, a]) => {
      const name = plain(a.name);
      return { key, name, file: 'arch_' + name.replace(/ (\w)/g, (m, c) => c.toUpperCase()).replace(/^\w/, c => c.toLowerCase()) };
    });
    /* which archetype an ability counts toward: its description names it */
    Object.entries(abilities).forEach(([id, a]) => {
      const text = plain(a.description);
      const hit = archetypes.find(x => text.includes(x.name + ' Archetype'));
      a._arch = hit ? hit.key : null;
      a._cost = (a.requirements && a.requirements.ABILITY_POINTS) || 0;
    });
    const ids = Object.keys(abilities).sort();
    const root = Object.entries(abilities).filter(([, a]) => a.page === 1).sort((x, y) => x[1].coordinates.y - y[1].coordinates.y)[0][0];
    return { tree, map, abilities, archetypes, ids, root };
  }));

  /* Ability points by combat level (wiki), plus the rank loan. */
  const AP = [[1, 1], [2, 2], [4, 3], [6, 4], [8, 5], [10, 6], [12, 7], [13, 8], [15, 9], [17, 10], [18, 11], [20, 12], [22, 13], [23, 14], [24, 15], [26, 16], [28, 17], [30, 18], [32, 19], [34, 20],
    [37, 21], [39, 22], [41, 23], [44, 24], [46, 25], [48, 26], [50, 27], [52, 28], [54, 29], [56, 30], [58, 31], [60, 32], [62, 33], [64, 34], [67, 35], [70, 36], [73, 37], [76, 38], [80, 39], [84, 40],
    [88, 41], [92, 42], [96, 43], [100, 44], [104, 45], [107, 46], [110, 47], [113, 48], [116, 49], [120, 50]];
  W.abilityPoints = (lvl, loan = 0) => (AP.filter(([l]) => l <= lvl).pop() || [0, 0])[1] + loan;

  /* Rules: reachable from an unlocked ability (or the root), node/archetype/level requirements met, not locked. */
  W.treeState = (T, selected, lvl) => {
    const sel = new Set([...selected].filter(id => T.abilities[id]));
    const archCount = (key) => [...sel].filter(id => T.abilities[id]._arch === key).length;
    const reachable = (id, set) => id === T.root || [...set].some(s => (T.abilities[s].links || []).includes(id));
    const blockedBy = (id, set) => [...set].find(s => (T.abilities[s].locks || []).includes(id) || (T.abilities[id].locks || []).includes(s));
    const canTake = (id, set, pts, max) => {
      const a = T.abilities[id], r = a.requirements || {};
      if (set.has(id)) return { ok: false };
      if (!reachable(id, set)) return { ok: false, why: 'Not connected to your unlocked abilities yet' };
      const lock = blockedBy(id, set); if (lock) return { ok: false, why: 'Locked by ' + W.treePlain(T.abilities[lock].name) };
      if (r.NODE && ![].concat(r.NODE).every(n => set.has(n))) return { ok: false, why: 'Needs ' + [].concat(r.NODE).map(n => T.abilities[n] ? W.treePlain(T.abilities[n].name) : n).join(', ') };
      if (r.ARCHETYPE && [...set].filter(x => T.abilities[x]._arch === r.ARCHETYPE.name).length < r.ARCHETYPE.amount) {
        const ar = T.archetypes.find(x => x.key === r.ARCHETYPE.name);
        return { ok: false, why: `Needs ${r.ARCHETYPE.amount} ${ar ? ar.name : r.ARCHETYPE.name} abilities` };
      }
      if (r.COMBAT_LEVEL && lvl < r.COMBAT_LEVEL) return { ok: false, why: 'Needs combat level ' + r.COMBAT_LEVEL };
      if (pts + a._cost > max) return { ok: false, why: 'Not enough ability points' };
      return { ok: true };
    };
    const used = [...sel].reduce((a, id) => a + T.abilities[id]._cost, 0);
    return { sel, used, archCount, canTake };
  };
  /* Remove an ability and everything that no longer connects back to the root. */
  W.treePrune = (T, set) => {
    const keep = new Set(), queue = set.has(T.root) ? [T.root] : [];
    while (queue.length) {
      const id = queue.shift(); if (keep.has(id)) continue; keep.add(id);
      (T.abilities[id].links || []).forEach(l => { if (set.has(l) && !keep.has(l)) queue.push(l); });
    }
    return keep;
  };
  W.treePlain = (h) => new DOMParser().parseFromString([].concat(h || '').join(' '), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();

  const nodeImg = (icon, on) => {
    const name = String((icon && icon.value && icon.value.name) || '').replace('abilityTree.', '');
    const file = /^ultimate/.test(name) ? 'U' + name.slice(1) : 'N' + name.slice(1);
    return `img/atree/${file}${on ? '_active' : ''}.png`;
  };

  W.atree = (opts) => {
    const box = el('div', { class: 'atreewrap' }, el('p', { class: 'empty' }, 'Loading the ability tree…'));
    W.loadTree(opts.cls).then(T => {
      let selected = new Set(opts.selected || []);
      const draw = () => {
        const max = W.abilityPoints(opts.level || 106, opts.loan || 0);
        const S = W.treeState(T, selected, opts.level || 106);
        selected = S.sel;
        const rows = Math.max(...Object.values(T.map).flat().map(n => n.coordinates.y));
        const nodes = Object.values(T.map).flat();
        const board = el('div', { class: 'atboard', style: { gridTemplateRows: `repeat(${rows}, 42px)` } },
          Array.from({ length: Math.ceil(rows / 6) }, (_, i) => el('div', { class: 'atpage', style: { gridRow: `${i * 6 + 1} / span ${Math.min(6, rows - i * 6)}` } }, el('span', {}, 'Page ' + (i + 1)))),
          nodes.map(n => {
            const pos = { gridColumn: n.coordinates.x, gridRow: n.coordinates.y };
            if (n.type === 'connector') {
              const fam = (n.family || []).filter(f => selected.has(f)).length;
              const name = String(n.meta && n.meta.icon || '').replace('connector_', 'Connector_');
              return el('div', { class: 'atcon' + (fam >= 2 ? ' on' : ''), style: pos }, el('img', { src: `img/atree/${name}.png`, alt: '' }));
            }
            const id = n.meta && n.meta.id, a = T.abilities[id] || {}, on = selected.has(id);
            const chk = on ? { ok: false } : S.canTake(id, selected, S.used, max);
            const node = el(opts.editable ? 'button' : 'div', { class: 'atnode' + (on ? ' on' : '') + (chk.ok ? ' can' : ''), style: pos,
              onclick: opts.editable ? () => {
                if (on) { const next = new Set(selected); next.delete(id); selected = W.treePrune(T, next); }
                else if (chk.ok) selected = new Set([...selected, id]);
                else return;
                draw(); opts.onChange && opts.onChange([...selected]);
              } : null },
              el('img', { src: nodeImg(n.meta && n.meta.icon, on), alt: '' }));
            return W.tip(node, () => el('div', { class: 'abtip' },
              el('div', { class: 'tt-name' }, a.name ? W.mcHtml(a.name) : id),
              el('div', { class: 'tt-sub' }, on ? 'Unlocked' : chk.ok ? `Click to unlock (${a._cost} AP)` : (chk.why || 'Not taken')),
              W.mcHtml(a.description)));
          }));
        box.replaceChildren(
          el('div', { class: 'athead' },
            el('div', { class: 'apbar' }, el('b', {}, `${S.used} / ${max}`), el('span', {}, 'ability points')),
            T.archetypes.map(x => el('div', { class: 'archbox' }, el('img', { src: `img/atree/${x.file}.png`, alt: '' }), el('div', {}, el('b', {}, S.archCount(x.key)), el('span', {}, x.name)))),
            opts.editable ? el('div', { class: 'btns', style: { margin: 0 } },
              el('button', { class: 'mini', onclick: () => { selected = new Set(); draw(); opts.onChange && opts.onChange([]); } }, 'Reset tree')) : null),
          el('div', { class: 'atscroll' }, board),
          el('p', { class: 'hint' }, opts.editable ? 'Click a glowing node to unlock it; click an unlocked node to remove it (and anything that depended on it). Hover for descriptions.' : 'Lit nodes are unlocked. Hover any node for its description.'));
      };
      draw();
    }).catch(e => box.replaceChildren(el('p', { class: 'empty' }, /403|forbid|restrict/i.test(e.message) ? 'This player keeps their ability tree private.' : 'Couldn’t load the ability tree: ' + e.message)));
    return box;
  };

  /* Character page: the player's unlocked abilities on the full board. */
  W.abilityTree = (playerUuid, charId, cls, level) => {
    const win = W.win('Ability tree', el('p', { class: 'empty' }, 'Loading the ability tree…'));
    W.api(`player/${playerUuid}/characters/${charId}/abilities`).then(mine => {
      const ids = Object.values(mine || {}).flat().filter(n => n.type === 'ability').map(n => n.meta && n.meta.id).filter(Boolean);
      win.replaceChildren(win.firstChild, W.atree({ cls, level: level || 106, selected: ids, loan: 4 }));
    }).catch(e => win.replaceChildren(win.firstChild, el('p', { class: 'empty' }, /403|forbid|restrict/i.test(e.message) ? 'This player keeps their ability tree private.' : 'Couldn’t load the ability tree: ' + e.message)));
    return win;
  };
})(window.W);
