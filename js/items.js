/* Items: search every gear item and compare a few side by side. */
(function (W) {
  const { el } = W;
  const TYPES = [
    ['', 'Any type'], ['helmet', 'Helmet'], ['chestplate', 'Chestplate'], ['leggings', 'Leggings'], ['boots', 'Boots'],
    ['ring', 'Ring'], ['bracelet', 'Bracelet'], ['necklace', 'Necklace'],
    ['bow', 'Bow (Archer)'], ['spear', 'Spear (Warrior)'], ['wand', 'Wand (Mage)'], ['dagger', 'Dagger (Assassin)'], ['relik', 'Relik (Shaman)'],
  ];
  const CLASSES = [['', 'Any class'], ['archer', 'Archer'], ['warrior', 'Warrior'], ['mage', 'Mage'], ['assassin', 'Assassin'], ['shaman', 'Shaman']];
  const WEAPON_CLASS = { bow: 'archer', spear: 'warrior', wand: 'mage', dagger: 'assassin', relik: 'shaman' };
  const f = { q: '', type: '', tier: '', cls: '', min: 1, max: 130, id: '', sort: 'level', shown: 48 };

  const CMP_KEY = 'wt.compare';
  W.compareList = () => { try { return JSON.parse(localStorage.getItem(CMP_KEY)) || []; } catch (e) { return []; } };
  const setCompare = (l) => { try { localStorage.setItem(CMP_KEY, JSON.stringify(l.slice(-4))); } catch (e) { /* storage blocked */ } };
  const idMax = (v) => Array.isArray(v) ? v[1] : v;

  W.pages['items/search'] = function (root) {
    W.withData(root, ['items'], (items) => {
      const allIds = [...new Set(items.flatMap(it => Object.keys(it.i || {})))]
        .map(k => [k, W.idInfo(k).name + (W.idInfo(k).unit === '%' ? ' %' : '')]).sort((a, b) => a[1].localeCompare(b[1]));
      let res = [];
      const out = el('div', {});
      const run = () => {
        const q = f.q.trim().toLowerCase();
        res = items.filter(it => (!q || it.n.toLowerCase().includes(q))
          && (!f.type || it.t === f.type) && (!f.tier || it.r === f.tier)
          && (!f.cls || it.c === f.cls || WEAPON_CLASS[it.t] === f.cls || (!it.c && !WEAPON_CLASS[it.t]))
          && it.l >= f.min && it.l <= f.max && (!f.id || (it.i && it.i[f.id] != null)));
        if (f.sort === 'name') res.sort((a, b) => a.n.localeCompare(b.n));
        else if (f.sort === 'id' && f.id) res.sort((a, b) => (W.idInfo(f.id).inverse ? idMax(a.i[f.id]) - idMax(b.i[f.id]) : idMax(b.i[f.id]) - idMax(a.i[f.id])));
        else if (f.sort === 'dps') res.sort((a, b) => (b.dps || 0) - (a.dps || 0));
        else res.sort((a, b) => b.l - a.l || a.n.localeCompare(b.n));
        show();
      };
      const show = () => {
        const cmp = W.compareList();
        out.replaceChildren(
          el('div', { class: 'resbar' }, el('span', {}, `${res.length.toLocaleString()} items`), cmp.length ? el('a', { href: '#items/compare' }, `Compare (${cmp.length})`) : null),
          el('div', { class: 'igrid' }, res.slice(0, f.shown).map(it => W.itemCard(it, {
            actions: el('div', { class: 'iact' }, el('button', { class: 'mini', onclick: (e) => {
              const l = W.compareList().filter(n => n !== it.n); l.push(it.n); setCompare(l); e.target.textContent = 'Added'; show();
            } }, cmp.includes(it.n) ? 'In compare' : 'Compare')),
          }))),
          res.length > f.shown ? el('div', { class: 'more' }, el('button', { onclick: () => { f.shown += 48; show(); } }, 'Show more')) : null);
      };
      const txt = el('input', { type: 'text', value: f.q, placeholder: 'Item name', oninput: (e) => { f.q = e.target.value; f.shown = 48; run(); } });
      const set = (k) => (v) => { f[k] = v; f.shown = 48; if (k === 'id' && v) f.sort = 'id'; run(); if (k === 'id') filters.replaceWith(filters = form()); };
      const form = () => el('div', { class: 'filters' },
        el('label', { class: 'grow' }, 'Search', txt),
        el('label', {}, 'Type', W.sel(TYPES, f.type, set('type'))),
        el('label', {}, 'Rarity', W.sel([['', 'Any rarity'], ...Object.entries(W.TIERS).filter(([k]) => k !== 'set').map(([k, v]) => [k, v[0]])], f.tier, set('tier'))),
        el('label', {}, 'Class', W.sel(CLASSES, f.cls, set('cls'))),
        el('label', {}, 'Level', el('div', { class: 'range2' }, W.numIn(f.min, set('min'), 1, 130), el('span', {}, 'to'), W.numIn(f.max, set('max'), 1, 130))),
        el('label', {}, 'Has identification', W.sel([['', 'Any'], ...allIds], f.id, set('id'))),
        el('label', {}, 'Sort by', W.sel([['level', 'Level (high first)'], ['name', 'Name'], ['dps', 'Average DPS'], ...(f.id ? [['id', 'Chosen identification']] : [])], f.sort, set('sort'))));
      let filters = form();
      root.replaceChildren(W.win('Item search', filters), out);
      run();
    });
  };

  W.pages['items/compare'] = function (root) {
    W.withData(root, ['items'], (items) => {
      const draw = () => {
        const names = W.compareList(), list = names.map(n => items.find(i => i.n === n)).filter(Boolean);
        if (!list.length) {
          root.replaceChildren(W.win('Compare items', el('p', { class: 'empty' }, 'Nothing to compare yet. Press “Compare” on items in ', el('a', { href: '#items/search' }, 'Search'), ' (up to four).')));
          return;
        }
        const keys = [...new Set(list.flatMap(i => Object.keys(i.i || {})))];
        const bases = [...new Set(list.flatMap(i => Object.keys(i.b || {})))];
        const best = (key, inv) => { const vals = list.map(i => i.i && i.i[key] != null ? idMax(i.i[key]) : null).filter(v => v != null); return vals.length > 1 ? (inv ? Math.min(...vals) : Math.max(...vals)) : null; };
        const cell = (v, key, b) => v == null ? el('td', { class: 'na' }, '—') :
          el('td', { class: (b != null && idMax(v) === b ? 'top ' : '') + (W.idGood(key, v) ? 'pos' : 'neg') }, W.fmtId(key, v));
        root.replaceChildren(
          el('div', { class: 'cmpcards', style: { '--n': list.length } }, list.map(it => W.itemCard(it, { compact: true, actions: el('div', { class: 'iact' },
            el('button', { class: 'mini', onclick: () => { setCompare(W.compareList().filter(n => n !== it.n)); draw(); } }, 'Remove')) }))),
          W.win('Side by side',
            el('div', { class: 'tscroll' }, el('table', { class: 'tbl cmp' },
              el('thead', {}, el('tr', {}, el('th', {}, ''), list.map(it => el('th', { style: { color: W.tierColor(it.r) } }, it.n)))),
              el('tbody', {},
                el('tr', {}, el('td', {}, 'Level'), list.map(it => el('td', {}, it.l))),
                bases.map(k => el('tr', {}, el('td', {}, W.BASE_NAMES[k] || W.words(k)), list.map(it => el('td', {}, it.b && it.b[k] != null ? (Array.isArray(it.b[k]) ? it.b[k].join('–') : it.b[k]) : '—')))),
                list.some(i => i.dps) ? el('tr', {}, el('td', {}, 'Average DPS'), list.map(it => el('td', {}, it.dps || '—'))) : null,
                keys.map(k => { const inv = W.idInfo(k).inverse, b = best(k, inv); return el('tr', {}, el('td', {}, W.idInfo(k).name), list.map(it => cell(it.i && it.i[k], k, b))); })))),
            el('p', { class: 'hint' }, 'The best maximum roll in each row is outlined. Spell costs count lower as better.')));
      };
      draw();
    });
  };
})(window.W);
