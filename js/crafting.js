/* Crafting: ingredient combiner (placement effectiveness) and an ingredient browser. */
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
        const input = el('input', { type: 'text', value: st.q, placeholder: 'Find an ingredient', oninput: (e) => { st.q = e.target.value; const box = root.querySelector('.pick'); box.replaceWith(pickList()); } });
        const pickList = () => {
          const qq = st.q.trim().toLowerCase();
          const l = ings.filter(g => g.sk.includes(st.prof) && (!qq || g.n.toLowerCase().includes(qq))).sort((a, b) => b.l - a.l).slice(0, 80);
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

  /* Ingredient Finder: best ingredients for one identification, plus the strongest effectiveness boosters. */
  const ff = { prof: 'armouring', id: '', lvl: 130 };
  W.pages['crafting/finder'] = function (root) {
    W.withData(root, ['ingredients'], (ings) => {
      const draw = () => {
        const pool = ings.filter(g => g.sk.includes(ff.prof) && g.l <= ff.lvl);
        const ids = [...new Set(pool.flatMap(g => Object.keys(g.i || {})))].map(k => [k, W.idInfo(k).name + (W.idInfo(k).unit === '%' ? ' %' : '')]).sort((a, b) => a[1].localeCompare(b[1]));
        if (!ff.id || !ids.some(x => x[0] === ff.id)) ff.id = (ids.find(x => x[0] === 'rawHealth') || ids[0] || [''])[0];
        const inv = W.idInfo(ff.id).inverse, top = (v) => Array.isArray(v) ? (inv ? Math.min(...v) : Math.max(...v)) : v;
        const best = pool.filter(g => g.i && g.i[ff.id] != null && (inv ? top(g.i[ff.id]) < 0 : top(g.i[ff.id]) > 0))
          .sort((a, b) => inv ? top(a.i[ff.id]) - top(b.i[ff.id]) : top(b.i[ff.id]) - top(a.i[ff.id])).slice(0, 15);
        const boost = pool.filter(g => g.pm).map(g => ({ g, sum: Object.values(g.pm).reduce((a, b) => a + Math.max(0, b), 0) }))
          .filter(x => x.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 10);
        const row = (g, extra) => el('div', { class: 'arow' }, el('div', { class: 'aico' }, W.art.ing(g.ic)),
          el('div', {}, el('b', { style: { color: W.ING_STARS[g.tr] } }, g.n, ' ', el('span', { class: 'stars' }, '✫'.repeat(g.tr))), el('small', {}, `Lv. ${g.l} · `, extra)));
        root.replaceChildren(el('div', { class: 'cols' },
          W.win('Ingredient Finder',
            el('div', { class: 'form row' },
              el('label', {}, 'Profession', W.sel([['armouring', 'Armouring'], ['tailoring', 'Tailoring'], ['weaponsmithing', 'Weaponsmithing'], ['woodworking', 'Woodworking'], ['jeweling', 'Jeweling'], ['alchemism', 'Alchemism'], ['cooking', 'Cooking'], ['scribing', 'Scribing']], ff.prof, (v) => { ff.prof = v; draw(); })),
              el('label', {}, 'I want more', W.sel(ids, ff.id, (v) => { ff.id = v; draw(); })),
              el('label', {}, 'Max ingredient level', W.numIn(ff.lvl, (v) => { ff.lvl = Math.max(1, v); draw(); }, 1, 130))),
            el('div', { class: 'cap left' }, `Best ${W.idInfo(ff.id).name} sources`),
            best.length ? el('div', { class: 'ahead' }, best.map(g => row(g, el('span', { class: 'pos' }, W.fmtId(ff.id, g.i[ff.id]))))) : el('p', { class: 'empty' }, 'No ingredient gives that.'),
            el('p', { class: 'hint' }, 'Ranked by best roll at 100% effectiveness. Put them next to a booster to push them higher.')),
          W.win('Effectiveness boosters',
            el('div', { class: 'ahead' }, boost.map(({ g }) => row(g, Object.entries(g.pm).map(([k, v]) => `${v > 0 ? '+' : ''}${v}% ${({ left: 'left', right: 'right', above: 'above', under: 'under', touching: 'touching', notTouching: 'not touching' })[k]}`).join(', ')))),
            el('p', { class: 'hint' }, 'These raise the ingredients around them. Try combinations in the Ingredient Combiner.'))));
      };
      draw();
    });
  };

  const bf = { q: '', prof: '', tier: '', min: 1, max: 130, id: '', shown: 60 };
  W.pages['crafting/ingredients'] = function (root, q) {
    if (q && q.get('q')) { bf.q = q.get('q'); bf.prof = ''; bf.tier = ''; bf.id = ''; bf.min = 1; bf.max = 130; }
    W.withData(root, ['ingredients'], (ings) => {
      const allIds = [...new Set(ings.flatMap(g => Object.keys(g.i || {})))].map(k => [k, W.idInfo(k).name + (W.idInfo(k).unit === '%' ? ' %' : '')]).sort((a, b) => a[1].localeCompare(b[1]));
      const out = el('div', {});
      const run = () => {
        const q = bf.q.trim().toLowerCase();
        const res = ings.filter(g => (!q || g.n.toLowerCase().includes(q)) && (!bf.prof || g.sk.includes(bf.prof)) && (bf.tier === '' || g.tr === +bf.tier)
          && g.l >= bf.min && g.l <= bf.max && (!bf.id || (g.i && g.i[bf.id] != null)));
        if (bf.id) res.sort((a, b) => { const x = a.i[bf.id], y = b.i[bf.id]; return (Array.isArray(y) ? y[1] : y) - (Array.isArray(x) ? x[1] : x); });
        else res.sort((a, b) => b.l - a.l || a.n.localeCompare(b.n));
        out.replaceChildren(el('div', { class: 'resbar' }, el('span', {}, `${res.length} ingredients`)),
          el('div', { class: 'igrid' }, res.slice(0, bf.shown).map(g => el('div', { class: 'icard' },
            el('div', { class: 'ihead' }, el('div', { class: 'iicon' }, W.art.ing(g.ic)),
              el('div', {}, el('div', { class: 'iname' }, ingTitle(g)), el('div', { class: 'isub' }, `Lv. ${g.l} · ${g.sk.map(W.cap).join(', ')}`))),
            g.i ? el('div', { class: 'iblock' }, Object.entries(g.i).map(([k, v]) => el('div', { class: 'il' }, el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v)), el('span', { class: 'idn' }, W.idInfo(k).name)))) : null,
            g.pm ? el('div', { class: 'iblock' }, Object.entries(g.pm).map(([k, v]) => el('div', { class: 'il' }, el('span', { class: v > 0 ? 'pos' : 'neg' }, (v > 0 ? '+' : '') + v + '%'), el('span', { class: 'idn' }, 'Ingredients ' + POS_NAME[k])))) : null,
            (g.io || g.co) ? el('div', { class: 'ifoot' }, Object.entries({ ...(g.io || {}), ...(g.co || {}) }).map(([k, v]) => `${IO_NAME[k] || W.words(k)} ${k === 'durabilityModifier' ? v / 1000 : v}`).join(' · ')) : null))),
          res.length > bf.shown ? el('div', { class: 'more' }, el('button', { onclick: () => { bf.shown += 60; run(); } }, 'Show more')) : null);
      };
      const set = (k) => (v) => { bf[k] = v; bf.shown = 60; run(); };
      root.replaceChildren(W.win('Ingredient browser', el('div', { class: 'filters' },
        el('label', { class: 'grow' }, 'Search', el('input', { type: 'text', value: bf.q, placeholder: 'Ingredient name', oninput: (e) => set('q')(e.target.value) })),
        el('label', {}, 'Profession', W.sel([['', 'Any'], ...PROFS], bf.prof, set('prof'))),
        el('label', {}, 'Stars', W.sel([['', 'Any'], ['0', '0 stars'], ['1', '1 star'], ['2', '2 stars'], ['3', '3 stars']], bf.tier, set('tier'))),
        el('label', {}, 'Level', el('div', { class: 'range2' }, W.numIn(bf.min, set('min'), 1, 130), el('span', {}, 'to'), W.numIn(bf.max, set('max'), 1, 130))),
        el('label', {}, 'Has identification', W.sel([['', 'Any'], ...allIds], bf.id, set('id'))))), out);
      run();
    });
  };
})(window.W);
