/* Recommended build: load a player's character, then search the item list for the strongest gear that
   character can actually wear (level and skill points), scored with the same engine as the Loadout Builder. */
(function (W) {
  const { el } = W;
  const ARMOUR = [['h', 'helmet'], ['c', 'chestplate'], ['l', 'leggings'], ['b', 'boots'], ['r1', 'ring'], ['r2', 'ring'], ['br', 'bracelet'], ['n', 'necklace']];
  const CLASS_WEAPON = { archer: 'bow', warrior: 'spear', mage: 'wand', assassin: 'dagger', shaman: 'relik' };
  const SK_API = { strength: 'strength', dexterity: 'dexterity', intelligence: 'intelligence', defence: 'defense', agility: 'agility' };
  const GOALS = [['spell', 'Spell damage'], ['melee', 'Main attack'], ['hybrid', 'Hybrid'], ['tank', 'Tank']];
  const RS = { name: '', data: null, char: '', err: null, busy: false, goal: 'spell', elems: null, result: null, progress: 0 };
  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  /* One number for how good a build is for the chosen goal. Builds that need more skill points than the level gives score nothing. */
  function score(pieces, lvl, goal, eng) {
    const res = W.computeBuild(pieces, { mode: 'max', level: lvl }, eng);
    if (res.spTotal > res.spAvail) return { s: -1, res };
    if (!res.melee) return { s: res.ehp * 1e-6, res };
    const spell = res.melee.spell({ neutral: 100 }).expected, melee = res.melee.dps;
    const dmg = goal === 'spell' ? spell : goal === 'melee' ? melee : Math.sqrt(spell * melee);
    const s = goal === 'tank' ? res.ehp * Math.pow(Math.max(1, Math.sqrt(spell * melee)), 0.25) : dmg * Math.pow(Math.max(1, res.ehp), 0.35);
    return { s, res };
  }

  async function optimise(c, items, eng, goal, elems, onProgress) {
    const lvl = c.level || 1, cls = String(c.type).toLowerCase();
    const allowed = (it) => it.l <= lvl && W.SK.every(s => !(it.q && it.q[s]) || elems.includes(W.SK_ELEM[s]));
    const piece = (it) => ({ item: it, r: null, p: null });
    const weapons = items.filter(it => it.t === CLASS_WEAPON[cls] && allowed(it))
      .map(it => ({ it, s: score([piece(it)], lvl, goal, eng).s })).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.it);
    if (!weapons.length) throw new Error('No weapons fit that level and those elements.');
    onProgress(10); await yieldUI();

    /* shortlist per armour type, judged next to the best weapon */
    const short = {};
    const types = [...new Set(ARMOUR.map(a => a[1]))];
    for (const [i, t] of types.entries()) {
      short[t] = items.filter(it => it.t === t && allowed(it))
        .map(it => ({ it, s: score([piece(weapons[0]), piece(it)], lvl, goal, eng).s })).sort((a, b) => b.s - a.s).slice(0, 10).map(x => x.it);
      onProgress(10 + (i + 1) / types.length * 20); await yieldUI();
    }

    /* greedy fill, then swap pieces while anything improves */
    const build = { w: weapons[0] };
    const evalB = (b) => score(Object.values(b).filter(Boolean).map(piece), lvl, goal, eng).s;
    for (const [k, t] of ARMOUR) {
      let best = evalB(build), pick = null;
      for (const it of short[t]) { const s = evalB({ ...build, [k]: it }); if (s > best) { best = s; pick = it; } }
      if (pick) build[k] = pick;
      await yieldUI();
    }
    onProgress(45);
    const slots = [['w', null], ...ARMOUR];
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (const [si, [k, t]] of slots.entries()) {
        let best = evalB(build);
        for (const it of (t ? short[t] : weapons)) {
          if (build[k] === it) continue;
          const s = evalB({ ...build, [k]: it });
          if (s > best + 1e-9) { best = s; build[k] = it; improved = true; }
        }
        if (t) { const s = evalB({ ...build, [k]: null }); if (s > best + 1e-9) { delete build[k]; improved = true; } }
        onProgress(45 + (pass * slots.length + si + 1) / (3 * slots.length) * 55); await yieldUI();
      }
      if (!improved) break;
    }
    onProgress(100);
    const pieces = Object.values(build).filter(Boolean).map(piece);
    return { build, ...score(pieces, lvl, goal, eng) };
  }

  W.pages['items/recommend'] = function (root, q) {
    if (q && q.get('u') && (!RS.data || RS.data.username !== q.get('u'))) { RS.name = q.get('u'); RS.data = null; RS.result = null; }
    W.withData(root, ['items', 'engine', 'itemids', 'idkeys'], (items, eng, itemIds, idKeys) => {
      const ctx = { ids: itemIds, keyNum: Object.fromEntries(Object.entries(idKeys).map(([n, k]) => [k, +n])) };
      const char = () => RS.data && RS.data.characters && RS.data.characters[RS.char];
      const cname = (c) => { const k = W.cap(String(c.reskin || c.type).toLowerCase()); return c.nickname && c.nickname !== k ? `${c.nickname} · ${k}` : k; };
      const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', { class: 'stack' }, form(), result()), el('div', { class: 'stack' }, notes())));

      const defaultElems = (c) => {
        const sp = c.skillPoints || {}, vals = W.SK.map(s => sp[SK_API[s]] || 0), top = Math.max(...vals);
        const picked = W.SK.filter((s, i) => top > 0 && vals[i] >= top * 0.35).map(s => W.SK_ELEM[s]).slice(0, 3);
        return picked.length ? picked : ['earth', 'thunder'];
      };
      async function load() {
        RS.busy = true; RS.err = null; RS.result = null; draw();
        try {
          const d = await W.api(`player/${encodeURIComponent(RS.name)}?fullResult`);
          if (d.multiple) throw new Error('That name matches several players. Use the exact name.');
          RS.data = d;
          const chars = Object.entries(d.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0));
          RS.char = q && q.get('c') && d.characters[q.get('c')] ? q.get('c') : (chars.length ? chars[0][0] : '');
          if (!RS.char) throw new Error('This player has no characters the API can see.');
          RS.elems = defaultElems(char());
        } catch (e) { RS.err = e.message; RS.data = null; }
        RS.busy = false; draw();
        if (RS.data) run();
      }
      async function run() {
        const c = char(); if (!c) return;
        RS.busy = true; RS.err = null; RS.result = null; RS.progress = 0; draw();
        const bar = root.querySelector('.rsbar i');
        try {
          RS.result = await optimise(c, items, eng, RS.goal, RS.elems, (p) => { RS.progress = p; if (bar) bar.style.width = p + '%'; });
        } catch (e) { RS.err = e.message; }
        RS.busy = false; draw();
      }

      function form() {
        const inp = el('input', { type: 'text', value: RS.name, placeholder: 'Username', maxlength: 16, oninput: (e) => { RS.name = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') load(); } });
        const chars = RS.data ? Object.entries(RS.data.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0)) : [];
        return W.win('Recommended build',
          el('p', { class: 'hint', style: { marginTop: 0 } }, 'Enter a username. Wynntools picks the strongest gear the character can wear at its level, using the elements it already puts skill points into.'),
          el('div', { class: 'search' }, inp, el('button', { onclick: load, disabled: RS.busy }, 'Load')),
          RS.err ? el('div', { class: 'warn', style: { marginTop: '12px' } }, RS.err) : null,
          chars.length ? el('div', { class: 'fields3', style: { marginTop: '14px' } },
            el('label', {}, 'Character', W.sel(chars.map(([id, c]) => [id, `${cname(c)} · Lv. ${c.level}`]), RS.char, (v) => { RS.char = v; RS.elems = defaultElems(char()); run(); })),
            el('label', {}, 'Build for', W.sel(GOALS, RS.goal, (v) => { RS.goal = v; run(); }))) : null,
          chars.length ? el('div', {}, el('div', { class: 'cap left' }, 'Elements'),
            el('div', { class: 'btns', style: { marginTop: 0 } }, W.ELEMS.map(e => el('button', { class: 'mini pwbtn' + (RS.elems.includes(e) ? ' on' : ''), onclick: () => {
              RS.elems = RS.elems.includes(e) ? RS.elems.filter(x => x !== e) : RS.elems.concat(e);
              if (!RS.elems.length) RS.elems = [e];
              run();
            } }, el('img', { src: `img/ui/powder-${e}.webp`, alt: '' }), W.cap(e))))) : null,
          RS.busy ? el('div', { class: 'rsbusy' }, el('span', {}, RS.data ? 'Trying gear combinations…' : 'Asking the Wynncraft API…'), el('div', { class: 'rbar rsbar' }, el('i', { style: { width: RS.progress + '%' } }))) : null);
      }

      function result() {
        const r = RS.result, c = char();
        if (!r || !c) return null;
        const res = r.res, b = r.build;
        const lb = { lvl: c.level, mode: 'max', x: {}, s: Object.fromEntries(Object.entries(b).map(([k, it]) => [k, [it.n, null, null]])), t: [] };
        const href = `#items/loadout?b=${W.encodeBuild(lb, ctx)}&u=${encodeURIComponent(RS.data.username)}&c=${encodeURIComponent(RS.char)}`;
        const has = W.SK.map(s => (c.skillPoints || {})[SK_API[s]] || 0);
        return el('div', { class: 'stack' },
          W.win(`${cname(c)} · Lv. ${c.level}`,
            el('div', { class: 'bigstats', style: { marginTop: 0 } },
              el('div', {}, el('b', {}, W.short(res.hp)), el('span', {}, 'Health')),
              el('div', {}, el('b', {}, W.short(res.ehp)), el('span', {}, 'Effective HP')),
              res.melee ? el('div', {}, el('b', {}, W.short(RS.goal === 'melee' ? res.melee.dps : res.melee.spell({ neutral: 100 }).expected)), el('span', {}, RS.goal === 'melee' ? 'Main attack DPS' : 'Damage per 100% spell')) : null),
            el('div', { class: 'reclist' }, [['w', 'Weapon'], ...ARMOUR.map(([k, t]) => [k, W.cap(t)])].map(([k, label]) => {
              const it = b[k];
              return el('div', { class: 'recrow' }, W.slot(W.art.item(it ? it.ic : null)),
                el('div', {}, el('small', {}, label), it ? W.tip(el('b', { style: { color: W.tierColor(it.r) } }, it.n), () => W.itemCard(it)) : el('b', {}, 'Nothing better than empty'), it ? el('small', {}, ` · Lv. ${it.l}`) : null));
            })),
            el('div', { class: 'cap left' }, 'Skill points to assign'),
            el('div', { class: 'sptable' }, W.SK.map((s, i) => el('div', { class: 'sprow rec' },
              el('b', { class: 'elname', style: { color: W.ELEM[W.SK_ELEM[s]] } }, W.cap(s)),
              el('span', {}, res.sp.need[i]),
              el('small', { class: has[i] >= res.sp.need[i] ? 'up' : 'down' }, `has ${has[i]}`)))),
            el('p', { class: 'hint' }, `${res.spTotal} of ${res.spAvail} skill points needed, assuming best rolls. Put the other ${res.spAvail - res.spTotal} wherever you like in the Loadout Builder.`),
            el('div', { class: 'btns' }, el('a', { class: 'btnlink', href }, 'Open in Loadout Builder'), el('button', { onclick: run }, 'Search again'))));
      }

      function notes() {
        return W.win('How it picks',
          el('p', {}, 'Every item the character can wear (level, class, and only skill point requirements in the chosen elements) gets scored with the Loadout Builder’s engine. The best few per slot are then combined and swapped around until nothing improves, rejecting anything that needs more skill points than the level gives.'),
          el('p', {}, 'Spell builds score damage per spell, main attack builds score DPS, hybrid uses both, tank weights effective HP. All of them also reward health so you don’t get glass cannons.'),
          el('p', { class: 'hint' }, 'It assumes perfect rolls and leaves tomes, powders and the ability tree to you: open the result in the Loadout Builder to finish it, with the character’s own tree already loaded. Damage numbers are estimates.'));
      }

      if (RS.name && !RS.data && !RS.busy) load(); else draw();
    });
  };
})(window.W);
