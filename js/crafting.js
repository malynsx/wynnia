/* Crafting: ingredient combiner (placement effectiveness), Ingredient Finder (rank by several bonuses) and the
   ingredient browser (search by bonus, profession, stars, level and effects; filters live in the URL). */
(function (W) {
  const { el } = W;
  const PROFS = [
    ['armouring', 'Armouring'], ['tailoring', 'Tailoring'], ['weaponsmithing', 'Weaponsmithing'], ['woodworking', 'Woodworking'],
    ['jeweling', 'Jeweling'], ['alchemism', 'Alchemism'], ['cooking', 'Cooking'], ['scribing', 'Scribing'],
  ];
  const CONSUMABLE = new Set(['alchemism', 'cooking', 'scribing']);
  const POS = ['left', 'right', 'above', 'under', 'touching', 'notTouching'];
  const POS_NAME = { left: 'to the left', right: 'to the right', above: 'above', under: 'under', touching: 'touching', notTouching: 'not touching' };
  const IO_NAME = { durabilityModifier: 'Durability', strengthRequirement: 'Strength req.', dexterityRequirement: 'Dexterity req.', intelligenceRequirement: 'Intelligence req.', defenceRequirement: 'Defence req.', agilityRequirement: 'Agility req.', charges: 'Charges', duration: 'Duration' };

  const ingTitle = (g) => el('span', { class: 'ingname' }, el('span', { style: { color: W.ING_STARS[g.tr] } }, g.n), el('span', { class: 'stars' }, '✫'.repeat(g.tr)));

  /* Effectiveness of every slot. Slots are 2 wide, 3 tall: index = row * 2 + col. */
  W.craftEffect = (slots) => {
    const eff = slots.map(g => g ? 100 : 0);
    slots.forEach((src, j) => {
      if (!src || !src.pm) return;
      const pj = { r: Math.floor(j / 2), c: j % 2 };
      slots.forEach((dst, i) => {
        if (!dst || i === j) return;
        const pi = { r: Math.floor(i / 2), c: i % 2 }, touching = Math.abs(pi.r - pj.r) + Math.abs(pi.c - pj.c) === 1;
        const m = src.pm;
        if (m.left && pi.r === pj.r && pi.c < pj.c) eff[i] += m.left;
        if (m.right && pi.r === pj.r && pi.c > pj.c) eff[i] += m.right;
        if (m.above && pi.c === pj.c && pi.r < pj.r) eff[i] += m.above;
        if (m.under && pi.c === pj.c && pi.r > pj.r) eff[i] += m.under;
        if (m.touching && touching) eff[i] += m.touching;
        if (m.notTouching && !touching) eff[i] += m.notTouching;
      });
    });
    return eff;
  };

  const st = { prof: 'armouring', type: 'helmet', lvl: 0, slots: Array(6).fill(null), active: 0, q: '' };

  /* ---------- shared ingredient helpers ---------- */
  const best = (k, v) => Array.isArray(v) ? (W.idInfo(k).inverse ? Math.min(...v) : Math.max(...v)) : v;
  const good = (k, v) => W.idGood(k, v);
  /* text search: every word has to match the name, a bonus name or a profession ("mana steal cooking") */
  const textMatch = (g, q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = [g.n, ...Object.keys(g.i || {}).map(k => W.idInfo(k).name), ...g.sk].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  };
  /* one bonus filter: the ingredient has the bonus in its good direction, at least `min` on its best roll */
  const passes = (g, f) => {
    const v = g.i && g.i[f.k];
    if (v == null || !good(f.k, v)) return false;
    return f.min == null || f.min === '' || Math.abs(best(f.k, v)) >= Math.abs(+f.min);
  };
  const boostSum = (g) => Object.values(g.pm || {}).reduce((a, b) => a + Math.max(0, b), 0);
  const idLabel = (k) => W.idInfo(k).name + (W.idInfo(k).unit === '%' ? ' %' : W.idInfo(k).unit ? ' ' + W.idInfo(k).unit : '');

  /* 3x3 picture of an ingredient's position effects: it sits in the middle, the cells around show what it does to them */
  function effectGrid(pm) {
    const cells = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) { cells.push(el('i', { class: 'me' })); continue; }
      const d = Math.abs(dx) + Math.abs(dy);
      let v = 0;
      if (pm.left && !dy && dx < 0) v += pm.left;
      if (pm.right && !dy && dx > 0) v += pm.right;
      if (pm.above && !dx && dy < 0) v += pm.above;
      if (pm.under && !dx && dy > 0) v += pm.under;
      if (pm.touching && d === 1) v += pm.touching;
      if (pm.notTouching && d > 1) v += pm.notTouching;
      cells.push(el('i', { class: v > 0 ? 'up' : v < 0 ? 'down' : '', style: v ? { '--a': Math.min(1, Math.abs(v) / 40) } : null }, v ? (v > 0 ? '+' : '') + v : ''));
    }
    return el('div', { class: 'effgrid', title: 'Effectiveness it gives to ingredients around it (it sits in the middle)' }, cells);
  }

  /* in-game style ingredient card; `hit` = bonus keys to highlight */
  function ingCard(g, opts = {}) {
    const col = W.ING_STARS[g.tr];
    const extra = Object.entries({ ...(g.io || {}), ...(g.co || {}) });
    return el('div', { class: 'icard ingcard', style: { '--rc': col } },
      el('div', { class: 'ihead' },
        el('div', { class: 'iframe', style: { backgroundImage: 'url(https://cdn.wynncraft.com/nextgen/items/v2/emblem/square.png)' } }, el('div', { class: 'iicon' }, W.art.ing(g.ic))),
        el('div', { class: 'ititle' }, el('div', { class: 'iname', style: { color: col } }, g.n),
          el('div', { class: 'itags' }, el('span', { class: 'itier' }, g.tr ? '✫'.repeat(g.tr) : 'NO STARS'), el('span', { class: 'itype' }, 'LV. ' + g.l),
            el('span', { class: 'ingprofs' }, g.sk.map(p => el('img', { src: `img/wiki/${p}.webp`, alt: W.cap(p), title: W.cap(p) })))))),
      g.i ? el('div', { class: 'iblock' }, Object.entries(g.i).map(([k, v]) => el('div', { class: 'il' + (opts.hit && opts.hit.includes(k) ? ' hit' : '') },
        el('span', { class: 'idn' }, W.idInfo(k).name), el('span', { class: good(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v))))) : el('p', { class: 'hint', style: { margin: 0 } }, 'No bonuses.'),
      g.pm ? el('div', { class: 'ingeff' }, effectGrid(g.pm), el('div', {}, el('b', {}, 'Position effects'),
        Object.entries(g.pm).map(([k, v]) => el('div', { class: v > 0 ? 'pos' : 'neg' }, `${v > 0 ? '+' : ''}${v}% `, el('span', {}, POS_NAME[k]))))) : null,
      extra.length ? el('div', { class: 'ingmods' }, extra.map(([k, v]) => el('span', { class: (k === 'durabilityModifier' || k === 'charges' || k === 'duration' ? v > 0 : v < 0) ? 'up' : 'down' },
        `${IO_NAME[k] || W.words(k)} ${k === 'durabilityModifier' ? (v > 0 ? '+' : '') + v / 1000 : (v > 0 ? '+' : '') + v}`))) : null,
      opts.actions || null);
  }

  /* put an ingredient on the crafting table (switching profession if this one can't use it) and open it */
  W.addToTable = (g) => {
    if (!g.sk.includes(st.prof)) { st.prof = g.sk[0]; st.slots = Array(6).fill(null); }
    const free = st.slots.findIndex(x => !x);
    st.slots[free < 0 ? st.active : free] = g.n;
    location.hash = '#crafting/combiner';
  };

  W.pages['crafting/combiner'] = function (root) {
    W.withData(root, ['ingredients', 'recipes'], (ings, recipes) => {
      const byName = Object.fromEntries(ings.map(g => [g.n, g]));
      const draw = () => root.replaceChildren(el('div', { class: 'cols' }, el('div', {}, bench(), result()), el('div', {}, picker())));

      function bench() {
        const types = [...new Set(recipes.filter(r => r.s === st.prof).map(r => r.t))];
        if (!types.includes(st.type)) st.type = types[0];
        const brackets = recipes.filter(r => r.s === st.prof && r.t === st.type);
        if (!brackets[st.lvl]) st.lvl = 0;
        const slots = st.slots.map(n => n && byName[n]);
        const eff = W.craftEffect(slots);
        return W.win('Crafting table',
          el('div', { class: 'form row' },
            el('label', {}, 'Profession', W.sel(PROFS, st.prof, (v) => { st.prof = v; st.slots = st.slots.map(n => n && byName[n].sk.includes(v) ? n : null); draw(); })),
            el('label', {}, 'Item', W.sel(types.map(t => [t, W.cap(t)]), st.type, (v) => { st.type = v; draw(); })),
            el('label', {}, 'Level', W.sel(brackets.map((r, i) => [i, `${r.l[0]}–${r.l[1]}`]), st.lvl, (v) => { st.lvl = +v; draw(); }))),
          el('div', { class: 'ctable' }, slots.map((g, i) => {
            const s = W.slot(g ? W.art.ing(g.ic) : el('span', { class: 'plus' }, '+'), {
              big: true, sel: i === st.active, onclick: () => { st.active = i; draw(); },
              tip: g ? () => ingTip(g) : 'Empty slot: pick an ingredient on the right',
            });
            if (g) s.append(el('span', { class: 'eff ' + (eff[i] > 100 ? 'up' : eff[i] < 100 ? 'down' : '') }, eff[i] + '%'));
            return s;
          })),
          el('div', { class: 'btns' },
            el('button', { onclick: () => { if (st.slots[st.active]) { st.slots[st.active] = null; draw(); } } }, 'Remove from slot'),
            el('button', { onclick: () => { st.slots = Array(6).fill(null); st.active = 0; draw(); } }, 'Clear table')),
          el('p', { class: 'hint' }, 'Click a slot, then click an ingredient. The percentage on each slot is its effectiveness after the other ingredients’ position effects.'));
      }

      function result() {
        const slots = st.slots.map(n => n && byName[n]), eff = W.craftEffect(slots);
        const r = recipes.filter(x => x.s === st.prof && x.t === st.type)[st.lvl];
        const ids = {}, io = {}, co = {};
        slots.forEach((g, i) => {
          if (!g) return;
          Object.entries(g.i || {}).forEach(([k, v]) => {
            const [a, b] = Array.isArray(v) ? v : [v, v], s = ids[k] || [0, 0];
            ids[k] = [s[0] + Math.round(a * eff[i] / 100), s[1] + Math.round(b * eff[i] / 100)];
          });
          Object.entries(g.io || {}).forEach(([k, v]) => { io[k] = (io[k] || 0) + v; });
          Object.entries(g.co || {}).forEach(([k, v]) => { co[k] = (co[k] || 0) + v; });
        });
        const filled = slots.filter(Boolean).length;
        const base = [];
        if (r) {
          if (r.d) { const m = (io.durabilityModifier || 0) / 1000; base.push(['Durability', `${Math.max(1, Math.round(r.d[0] / 1000 + m))}–${Math.max(1, Math.round(r.d[1] / 1000 + m))}`]); }
          if (r.du) { const m = co.duration || 0; base.push(['Duration', `${Math.max(10, r.du[0] + m)}–${Math.max(10, r.du[1] + m)} s`]); }
          if (CONSUMABLE.has(st.prof)) base.push(['Charges', String(Math.max(1, (r.bd ? r.bd[0] : 3) + (co.charges || 0)))]);
          if (r.h) base.push([CONSUMABLE.has(st.prof) ? 'Heal / damage' : (['helmet', 'chestplate', 'leggings', 'boots'].includes(st.type) ? 'Health' : 'Damage'), `${r.h[0]}–${r.h[1]}`]);
          base.push(['Crafting XP', String(r.xp)]);
        }
        const reqs = Object.entries(io).filter(([k]) => k !== 'durabilityModifier');
        return W.win('Result',
          !filled ? el('p', { class: 'empty' }, 'Add ingredients to see the result.') : null,
          base.length ? el('div', { class: 'kv' }, base.map(([k, v]) => el('div', {}, el('span', {}, k), el('b', {}, v)))) : null,
          reqs.length ? el('div', { class: 'cap left' }, 'Skill requirement changes') : null,
          reqs.length ? el('div', { class: 'kv' }, reqs.map(([k, v]) => el('div', {}, el('span', {}, IO_NAME[k] || W.words(k)), el('b', {}, (v > 0 ? '+' : '') + v)))) : null,
          Object.keys(ids).length ? el('div', { class: 'cap left' }, 'Identifications') : null,
          Object.keys(ids).length ? el('div', { class: 'idlist' }, Object.entries(ids).map(([k, v]) =>
            el('div', { class: 'il' }, el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v)), el('span', { class: 'idn' }, W.idInfo(k).name)))) : null,
          el('p', { class: 'hint' }, 'Base values come from the recipe before any material tier bonus. Rolled values can differ by 1 from the game because of rounding.'));
      }

      function picker() {
        const input = el('input', { type: 'text', value: st.q, placeholder: 'Name or bonus, e.g. “health regen”', oninput: (e) => { st.q = e.target.value; const box = root.querySelector('.pick'); box.replaceWith(pickList()); } });
        const pickList = () => {
          const qq = st.q.trim().toLowerCase();
          const l = ings.filter(g => g.sk.includes(st.prof) && textMatch(g, qq)).sort((a, b) => b.l - a.l).slice(0, 80);
          return el('div', { class: 'pick' }, l.map(g => W.tip(el('button', { class: 'pickrow', onclick: () => {
            st.slots[st.active] = g.n; const next = st.slots.findIndex(x => !x); st.active = next < 0 ? st.active : next; draw();
          } }, el('span', { class: 'pico' }, W.art.ing(g.ic)), ingTitle(g), el('small', {}, 'Lv. ' + g.l)), () => ingTip(g))));
        };
        return W.win(`Ingredients for ${W.cap(st.prof)}`, input, pickList());
      }
      draw();
    });
  };

  function ingTip(g) {
    return el('div', {},
      el('div', { class: 'tt-name', style: { color: W.ING_STARS[g.tr] } }, g.n + ' ' + '✫'.repeat(g.tr)),
      el('div', { class: 'tt-sub' }, `Lv. ${g.l} · ${g.sk.map(W.cap).join(', ')}`),
      ...Object.entries(g.i || {}).map(([k, v]) => el('div', {}, el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v)), ' ', el('span', { class: 'tt-g' }, W.idInfo(k).name))),
      g.pm ? el('div', { class: 'tt-gap' }) : null,
      ...Object.entries(g.pm || {}).map(([k, v]) => el('div', {}, el('span', { class: v > 0 ? 'pos' : 'neg' }, (v > 0 ? '+' : '') + v + '%'), el('span', { class: 'tt-g' }, ` effectiveness for ingredients ${POS_NAME[k]}`))),
      (g.io || g.co) ? el('div', { class: 'tt-gap' }) : null,
      ...Object.entries({ ...(g.io || {}), ...(g.co || {}) }).map(([k, v]) => el('div', { class: 'tt-g' }, `${IO_NAME[k] || W.words(k)}: ${k === 'durabilityModifier' ? (v / 1000 > 0 ? '+' : '') + v / 1000 : (v > 0 ? '+' : '') + v}`)));
  }

  /* Ingredient Finder: rank ingredients by up to four bonuses at once, each with a weight, plus the strongest boosters. */
  const ff = { prof: 'armouring', lvl: 130, want: [['rawHealth', 2]], noNeg: false };
  W.pages['crafting/finder'] = function (root) {
    W.withData(root, ['ingredients'], (ings) => {
      const draw = () => {
        const pool = ings.filter(g => g.sk.includes(ff.prof) && g.l <= ff.lvl);
        const ids = [...new Set(pool.flatMap(g => Object.keys(g.i || {})))].map(k => [k, idLabel(k)]).sort((a, b) => a[1].localeCompare(b[1]));
        ff.want = ff.want.filter(([k]) => ids.some(x => x[0] === k));
        if (!ff.want.length && ids.length) ff.want = [[(ids.find(x => x[0] === 'rawHealth') || ids[0])[0], 2]];
        /* score: each wanted bonus as a share of the best value any ingredient in the pool has, times its weight */
        const top = Object.fromEntries(ff.want.map(([k]) => [k, Math.max(1e-9, ...pool.filter(g => g.i && g.i[k] != null && good(k, g.i[k])).map(g => Math.abs(best(k, g.i[k]))))]));
        const ranked = pool.map(g => {
          let s = 0, hits = 0;
          ff.want.forEach(([k, w]) => { const v = g.i && g.i[k]; if (v != null && good(k, v)) { s += w * Math.abs(best(k, v)) / top[k]; hits++; } });
          const bad = Object.entries(g.i || {}).some(([k, v]) => !good(k, v));
          return { g, s, hits, bad };
        }).filter(x => x.s > 0 && (!ff.noNeg || !x.bad)).sort((a, b) => b.s - a.s).slice(0, 24);
        const boost = pool.filter(g => g.pm).map(g => ({ g, sum: boostSum(g) })).filter(x => x.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 8);
        const wantKeys = ff.want.map(w => w[0]);
        root.replaceChildren(el('div', { class: 'stack' },
          W.win('Ingredient Finder',
            el('p', { class: 'hint', style: { marginTop: 0 } }, 'Pick the bonuses you want and how much each matters. Ingredients are ranked by how close they get to the best source of each one.'),
            el('div', { class: 'cap left' }, 'Profession'),
            profChips([ff.prof], (p) => { ff.prof = p; draw(); }, true),
            el('div', { class: 'fields3', style: { marginTop: '12px' } },
              el('label', {}, 'Max ingredient level', W.numIn(ff.lvl, (v) => { ff.lvl = Math.max(1, v); draw(); }, 1, 130)),
              el('label', { class: 'check', style: { alignSelf: 'end' } }, el('input', { type: 'checkbox', checked: ff.noNeg, onchange: (e) => { ff.noNeg = e.target.checked; draw(); } }), 'No negative bonuses')),
            el('div', { class: 'cap left' }, 'I want'),
            el('div', { class: 'wantlist' }, ff.want.map(([k, w], i) => el('div', { class: 'wantrow' },
              W.sel(ids, k, (v) => { ff.want[i][0] = v; draw(); }),
              el('div', { class: 'wweight', role: 'group', 'aria-label': 'How much it matters' }, [[1, 'Nice'], [2, 'Want'], [3, 'Must']].map(([n, label]) =>
                el('button', { class: 'mini' + (w === n ? ' on' : ''), onclick: () => { ff.want[i][1] = n; draw(); } }, label))),
              ff.want.length > 1 ? el('button', { class: 'mini danger', title: 'Remove', onclick: () => { ff.want.splice(i, 1); draw(); } }, 'Remove') : null)),
              ff.want.length < 4 ? el('button', { class: 'mini', onclick: () => { const next = ids.find(x => !wantKeys.includes(x[0])); if (next) { ff.want.push([next[0], 2]); draw(); } } }, '+ Add a bonus') : null)),
          W.win(`Best matches · ${ranked.length}`,
            ranked.length ? el('div', { class: 'igrid ranked' }, ranked.map(({ g, s }, i) => ingCard(g, { hit: wantKeys,
              actions: el('div', { class: 'ingact' }, el('span', { class: 'rank' }, `#${i + 1} · score ${W.num(s, 2)}`), el('button', { class: 'mini', onclick: () => W.addToTable(g) }, 'Add to crafting table')) })))
              : el('p', { class: 'empty' }, 'Nothing in this profession gives those bonuses.')),
          W.win('Effectiveness boosters',
            el('p', { class: 'hint', style: { marginTop: 0 } }, 'These raise the ingredients around them. Put your best match where the green cells are.'),
            el('div', { class: 'igrid ranked' }, boost.map(({ g }) => ingCard(g, { actions: el('div', { class: 'ingact' }, el('button', { class: 'mini', onclick: () => W.addToTable(g) }, 'Add to crafting table')) }))))));
      };
      draw();
    });
  };

  /* profession toggles with their icons; `single` = exactly one selected */
  function profChips(selected, on, single) {
    return el('div', { class: 'profchips' }, PROFS.map(([k, label]) => el('button', { class: 'pchip' + (selected.includes(k) ? ' on' : ''), 'aria-pressed': selected.includes(k), title: label, onclick: () => on(k) },
      el('img', { src: `img/wiki/${k}.webp`, alt: '' }), el('span', {}, label))));
  }

  /* ---------- Ingredient browser ---------- */
  const bf = { q: '', profs: [], stars: [], min: 1, max: 130, filters: [], sort: 'level', noNeg: false, boost: false, mods: '', shown: 48 };
  const SORTS = [['level', 'Level (high first)'], ['levelUp', 'Level (low first)'], ['name', 'Name'], ['stars', 'Stars'], ['bonus', 'Chosen bonuses'], ['boost', 'Effectiveness boost'], ['durability', 'Durability'], ['duration', 'Duration'], ['charges', 'Charges']];
  /* the filters live in the URL, so a search can be shared or bookmarked */
  const toQuery = () => {
    const p = new URLSearchParams();
    if (bf.q) p.set('q', bf.q);
    if (bf.profs.length) p.set('p', bf.profs.join(','));
    if (bf.stars.length) p.set('s', bf.stars.join(','));
    if (bf.min > 1 || bf.max < 130) p.set('lv', `${bf.min}-${bf.max}`);
    if (bf.filters.length) p.set('b', bf.filters.map(f => f.k + (f.min ? ':' + f.min : '')).join(','));
    if (bf.sort !== 'level') p.set('sort', bf.sort);
    if (bf.noNeg) p.set('nn', '1');
    if (bf.boost) p.set('pm', '1');
    if (bf.mods) p.set('m', bf.mods);
    return p.toString();
  };
  const fromQuery = (q) => {
    if (!q || ![...q.keys()].length) return;
    Object.assign(bf, { q: q.get('q') || '', profs: (q.get('p') || '').split(',').filter(Boolean), stars: (q.get('s') || '').split(',').filter(Boolean).map(Number),
      filters: (q.get('b') || '').split(',').filter(Boolean).map(x => { const [k, m] = x.split(':'); return { k, min: m || '' }; }),
      sort: q.get('sort') || (q.get('b') ? 'bonus' : 'level'), noNeg: q.get('nn') === '1', boost: q.get('pm') === '1', mods: q.get('m') || '', shown: 48 });
    const lv = (q.get('lv') || '1-130').split('-').map(Number); bf.min = lv[0] || 1; bf.max = lv[1] || 130;
  };

  W.pages['crafting/ingredients'] = function (root, q) {
    fromQuery(q);
    W.withData(root, ['ingredients'], (ings) => {
      const counts = {};
      ings.forEach(g => Object.entries(g.i || {}).forEach(([k, v]) => { if (good(k, v)) counts[k] = (counts[k] || 0) + 1; }));
      const allIds = Object.keys(counts).map(k => [k, idLabel(k)]).sort((a, b) => a[1].localeCompare(b[1]));
      const popular = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
      const out = el('div', {});
      let typing = null;

      const results = () => {
        let res = ings.filter(g => textMatch(g, bf.q) && (!bf.profs.length || bf.profs.some(p => g.sk.includes(p))) && (!bf.stars.length || bf.stars.includes(g.tr))
          && g.l >= bf.min && g.l <= bf.max && bf.filters.every(f => passes(g, f))
          && (!bf.noNeg || Object.entries(g.i || {}).every(([k, v]) => good(k, v)))
          && (!bf.boost || boostSum(g) > 0)
          && (!bf.mods || (bf.mods === 'noreq' ? !Object.entries(g.io || {}).some(([k, v]) => k !== 'durabilityModifier' && v > 0) : { ...(g.io || {}), ...(g.co || {}) }[bf.mods] != null)));
        const top = Object.fromEntries(bf.filters.map(f => [f.k, Math.max(1e-9, ...res.map(g => Math.abs(best(f.k, g.i[f.k]))))]));
        const score = (g) => bf.filters.reduce((a, f) => a + Math.abs(best(f.k, g.i[f.k])) / top[f.k], 0);
        const mod = (g, k) => ((g.io || {})[k] ?? (g.co || {})[k] ?? -Infinity);
        const by = {
          level: (a, b) => b.l - a.l || a.n.localeCompare(b.n), levelUp: (a, b) => a.l - b.l || a.n.localeCompare(b.n), name: (a, b) => a.n.localeCompare(b.n),
          stars: (a, b) => b.tr - a.tr || b.l - a.l, bonus: (a, b) => score(b) - score(a) || b.l - a.l, boost: (a, b) => boostSum(b) - boostSum(a),
          durability: (a, b) => mod(b, 'durabilityModifier') - mod(a, 'durabilityModifier'), duration: (a, b) => mod(b, 'duration') - mod(a, 'duration'), charges: (a, b) => mod(b, 'charges') - mod(a, 'charges'),
        };
        return res.sort(by[bf.sort === 'bonus' && !bf.filters.length ? 'level' : bf.sort] || by.level);
      };

      const update = () => {
        history.replaceState(null, '', '#crafting/ingredients' + (toQuery() ? '?' + toQuery() : ''));
        const res = results(), hit = bf.filters.map(f => f.k);
        const chips = [
          ...bf.filters.map((f, i) => ['bonus', `${idLabel(f.k)}${f.min ? ' ≥ ' + f.min : ''}`, () => { bf.filters.splice(i, 1); }]),
          ...bf.profs.map(p => ['prof', W.cap(p), () => { bf.profs = bf.profs.filter(x => x !== p); }]),
          ...bf.stars.map(s => ['stars', `${s} star${s === 1 ? '' : 's'}`, () => { bf.stars = bf.stars.filter(x => x !== s); }]),
          bf.min > 1 || bf.max < 130 ? ['lv', `Lv. ${bf.min}–${bf.max}`, () => { bf.min = 1; bf.max = 130; }] : null,
          bf.noNeg ? ['nn', 'No negatives', () => { bf.noNeg = false; }] : null,
          bf.boost ? ['pm', 'Boosts others', () => { bf.boost = false; }] : null,
          bf.q ? ['q', `“${bf.q}”`, () => { bf.q = ''; }] : null,
        ].filter(Boolean);
        out.replaceChildren(
          el('div', { class: 'resbar' }, el('span', {}, `${res.length.toLocaleString()} ingredient${res.length === 1 ? '' : 's'}`),
            chips.length ? el('div', { class: 'fchips' }, chips.map(([, label, off]) => el('button', { class: 'fchip', title: 'Remove this filter', onclick: () => { off(); bf.shown = 48; drawAll(); } }, label, el('b', {}, '×'))),
              el('button', { class: 'mini', onclick: () => { Object.assign(bf, { q: '', profs: [], stars: [], min: 1, max: 130, filters: [], noNeg: false, boost: false, mods: '', shown: 48 }); drawAll(); } }, 'Reset all')) : null),
          res.length ? el('div', { class: 'igrid ranked' }, res.slice(0, bf.shown).map(g => ingCard(g, { hit,
            actions: el('div', { class: 'ingact' }, el('button', { class: 'mini', onclick: () => W.addToTable(g) }, 'Add to crafting table'), W.priceTag(g.n, false)) })))
            : el('p', { class: 'empty' }, 'No ingredient matches all of that. Try removing a filter.'),
          res.length > bf.shown ? el('div', { class: 'more' }, el('button', { onclick: () => { bf.shown += 48; update(); } }, `Show more (${res.length - bf.shown} left)`)) : '');
      };

      function filtersWin() {
        const search = el('input', { type: 'text', value: bf.q, placeholder: 'Name, bonus or profession, e.g. “mana steal cooking”', oninput: (e) => { bf.q = e.target.value; bf.shown = 48; clearTimeout(typing); typing = setTimeout(update, 200); } });
        const addSel = W.sel([['', '+ Add a bonus…'], ...allIds.filter(([k]) => !bf.filters.some(f => f.k === k)).map(([k, n]) => [k, `${n} (${counts[k]})`])], '', (v) => { if (v) { bf.filters.push({ k: v, min: '' }); bf.sort = 'bonus'; bf.shown = 48; drawAll(); } });
        return W.win('Ingredients',
          el('div', { class: 'search' }, search),
          el('div', { class: 'cap left' }, 'Bonuses'),
          el('div', { class: 'bonusrows' },
            bf.filters.map((f, i) => el('div', { class: 'bonusrow' },
              el('b', {}, idLabel(f.k)),
              el('label', {}, 'at least', el('input', { type: 'number', value: f.min, placeholder: 'any', oninput: (e) => { f.min = e.target.value; bf.shown = 48; clearTimeout(typing); typing = setTimeout(update, 250); } }), el('span', {}, W.idInfo(f.k).unit || '')),
              el('button', { class: 'mini danger', onclick: () => { bf.filters.splice(i, 1); drawAll(); } }, 'Remove'))),
            addSel),
          el('div', { class: 'quickb' }, el('small', {}, 'Popular:'), popular.filter(k => !bf.filters.some(f => f.k === k)).slice(0, 8).map(k =>
            el('button', { class: 'mini', onclick: () => { bf.filters.push({ k, min: '' }); bf.sort = 'bonus'; bf.shown = 48; drawAll(); } }, idLabel(k)))),
          el('div', { class: 'cap left' }, 'Profession'),
          profChips(bf.profs, (p) => { bf.profs = bf.profs.includes(p) ? bf.profs.filter(x => x !== p) : bf.profs.concat(p); bf.shown = 48; drawAll(); }),
          el('div', { class: 'filters ingfilters', style: { marginTop: '16px' } },
            el('label', {}, 'Stars', el('div', { class: 'starchips' }, [0, 1, 2, 3].map(s => el('button', { class: 'mini' + (bf.stars.includes(s) ? ' on' : ''), style: { '--sc': W.ING_STARS[s] },
              onclick: () => { bf.stars = bf.stars.includes(s) ? bf.stars.filter(x => x !== s) : bf.stars.concat(s); bf.shown = 48; drawAll(); } }, s ? '✫'.repeat(s) : '0')))),
            el('label', {}, 'Level', el('div', { class: 'range2' }, W.numIn(bf.min, (v) => { bf.min = v; bf.shown = 48; update(); }, 1, 130), el('span', {}, 'to'), W.numIn(bf.max, (v) => { bf.max = v; bf.shown = 48; update(); }, 1, 130))),
            el('label', {}, 'Changes', W.sel([['', 'Anything'], ['noreq', 'No higher skill requirements'], ['durabilityModifier', 'Changes durability'], ['duration', 'Changes duration'], ['charges', 'Changes charges']], bf.mods, (v) => { bf.mods = v; bf.shown = 48; update(); })),
            el('label', {}, 'Sort by', W.sel(SORTS, bf.sort, (v) => { bf.sort = v; update(); }))),
          el('div', { class: 'checkrow' },
            el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: bf.noNeg, onchange: (e) => { bf.noNeg = e.target.checked; bf.shown = 48; drawAll(); } }), 'No negative bonuses'),
            el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: bf.boost, onchange: (e) => { bf.boost = e.target.checked; bf.shown = 48; drawAll(); } }), 'Boosts other ingredients'),
            el('button', { class: 'mini', onclick: (e) => W.copyText(location.href, e.target) }, 'Copy link to this search')));
      }
      const drawAll = () => { root.replaceChildren(el('div', { class: 'stack' }, filtersWin(), out)); update(); };
      drawAll();
    });
  };
})(window.W);
