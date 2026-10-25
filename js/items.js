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
            action: el('button', { class: 'mini' + (cmp.includes(it.n) ? ' on' : ''), title: 'Add to compare', onclick: () => {
              const l = W.compareList().filter(n => n !== it.n); if (!cmp.includes(it.n)) l.push(it.n); setCompare(l); show();
            } }, cmp.includes(it.n) ? 'Comparing' : 'Compare'),
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

  let diffOnly = false;
  W.pages['items/compare'] = function (root) {
    W.withData(root, ['items'], (items) => {
      const draw = () => {
        const names = W.compareList(), list = names.map(n => items.find(i => i.n === n)).filter(Boolean);
        if (!list.length) {
          root.replaceChildren(W.win('Compare items', el('p', { class: 'empty' }, 'Nothing to compare yet. Press “Compare” on items in ', el('a', { href: '#items/search' }, 'Item Search'), ' (up to four).')));
          return;
        }
        const n = list.length;
        const num = (v) => v == null ? null : Array.isArray(v) ? v[1] : v;
        const show = (v) => Array.isArray(v) ? (v[0] === v[1] ? v[0] : `${v[0]}–${v[1]}`) : v;
        /* One row: label, then a cell per item. better(a,b) > 0 when a beats b; the best cell gets marked. */
        const row = (label, vals, fmt, better, cls) => {
          const nums = vals.map(num), present = nums.filter(x => x != null);
          if (diffOnly && present.length === n && present.every(x => x === present[0])) return null;
          const top = present.length > 1 && better ? present.reduce((a, b) => (better(b, a) > 0 ? b : a)) : null;
          const tied = top != null && present.every(x => x === top);
          const span = present.length ? Math.max(...present.map(Math.abs)) || 1 : 1;
          return el('div', { class: 'crow2' }, el('div', { class: 'clabel' }, label), vals.map((v, i) => v == null
            ? el('div', { class: 'cval na' }, '—')
            : el('div', { class: 'cval' + (top != null && !tied && nums[i] === top ? ' best' : '') + (cls ? ' ' + cls(v) : '') },
              el('span', {}, fmt(v)), better ? el('i', { class: 'cbar2', style: { width: Math.abs(nums[i]) / span * 100 + '%' } }) : null)));
        };
        const section = (title, rows) => { rows = rows.filter(Boolean); return rows.length ? [el('div', { class: 'csec' }, title), ...rows] : []; };
        const hi = (a, b) => a - b, lo = (a, b) => b - a;
        const baseKeys = [...new Set(list.flatMap(i => Object.keys(i.b || {})))];
        const idKeys = [...new Set(list.flatMap(i => Object.keys(i.i || {})))].sort((a, b) => W.idInfo(a).name.localeCompare(W.idInfo(b).name));
        const skills = ['strength', 'dexterity', 'intelligence', 'defence', 'agility'].filter(s => list.some(i => i.q && i.q[s]));
        root.replaceChildren(W.win('Compare items',
          el('label', { class: 'check', style: { marginBottom: '14px' } }, el('input', { type: 'checkbox', checked: diffOnly, onchange: (e) => { diffOnly = e.target.checked; draw(); } }), 'Only show rows that differ'),
          el('div', { class: 'tscroll' }, el('div', { class: 'cgrid', style: { '--n': n } },
            el('div', { class: 'crow2 chead' }, el('div', { class: 'clabel' }), list.map(it => el('div', { class: 'citem' },
              el('div', { class: 'iicon' }, W.art.item(it.ic)),
              el('div', { class: 'iname', style: { color: W.tierColor(it.r) } }, it.n),
              el('div', { class: 'isub' }, `${(W.TIERS[it.r] || ['Item'])[0]} ${W.cap(it.t)}`),
              el('button', { class: 'mini', onclick: () => { setCompare(W.compareList().filter(x => x !== it.n)); draw(); } }, 'Remove')))),
            ...section('General', [
              row('Level', list.map(i => i.l), show, null),
              list.some(i => i.dps) ? row('Average DPS', list.map(i => i.dps), show, hi) : null,
              list.some(i => i.as) ? row('Attack speed', list.map(i => i.as ? W.words(i.as) : null), (v) => v, null) : null,
              list.some(i => i.ps) ? row('Powder slots', list.map(i => i.ps || 0), show, hi) : null,
              list.some(i => i.c) ? row('Class', list.map(i => i.c ? W.cap(i.c) : null), (v) => v, null) : null,
            ]),
            ...section('Base stats', baseKeys.map(k => row(W.BASE_NAMES[k] || W.words(k), list.map(i => i.b && i.b[k]), show, /Defence/.test(k) || /ealth/.test(k) || /Damage/.test(k) ? hi : null))),
            ...section('Skill requirements', skills.map(s => row(W.cap(s), list.map(i => (i.q && i.q[s]) || null), show, lo))),
            ...section('Identifications', idKeys.map(k => row(W.idInfo(k).name, list.map(i => i.i && i.i[k]), (v) => W.fmtId(k, v), W.idInfo(k).inverse ? lo : hi, (v) => (W.idGood(k, v) ? 'pos' : 'neg')))),
            list.some(i => i.m) ? el('div', { class: 'crow2' }, el('div', { class: 'clabel' }, 'Major ID'), list.map(i => el('div', { class: 'cval' }, i.m ? i.m.join(', ') : '—'))) : null)),
          el('p', { class: 'hint' }, 'The best value in each row is marked in gold. Identifications compare their maximum roll; spell costs and skill requirements count lower as better.')));
      };
      draw();
    });
  };
})(window.W);
