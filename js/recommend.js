/* Recommended build: pick a class and archetype (or load a player's character), then search the item list
   for the strongest gear, powders, tomes, skill points and ability tree that character can actually use,
   scored with the same engine as the Loadout Builder at realistic (not perfect) rolls. */
(function (W) {
  const { el } = W;
  const ARMOUR = [['h', 'helmet'], ['c', 'chestplate'], ['l', 'leggings'], ['b', 'boots'], ['r1', 'ring'], ['r2', 'ring'], ['br', 'bracelet'], ['n', 'necklace']];
  const SLOT_NAME = { w: 'Weapon', h: 'Helmet', c: 'Chestplate', l: 'Leggings', b: 'Boots', r1: 'Ring', r2: 'Ring', br: 'Bracelet', n: 'Necklace' };
  const CLASS_WEAPON = { archer: 'bow', warrior: 'spear', mage: 'wand', assassin: 'dagger', shaman: 'relik' };
  const CLASSES = Object.keys(CLASS_WEAPON);
  const SK_API = { strength: 'strength', dexterity: 'dexterity', intelligence: 'intelligence', defence: 'defense', agility: 'agility' };
  const GOALS = [['spell', 'Spell damage'], ['melee', 'Main attack'], ['hybrid', 'Hybrid'], ['support', 'Support'], ['tank', 'Tank']];
  /* how each archetype is usually played; the elements come from the archetype's own abilities */
  const STYLE = { Boltslinger: 'spell', Sharpshooter: 'spell', Trapper: 'spell', Fallen: 'melee', 'Battle Monk': 'spell', Paladin: 'tank',
    'Light Bender': 'support', Riftwalker: 'spell', Arcanist: 'spell', Shadestepper: 'melee', Trickster: 'spell', Acrobat: 'melee',
    Summoner: 'melee', Ritualist: 'spell', Acolyte: 'support' };
  const GLYPH = { '✤': 'earth', '✦': 'thunder', '❉': 'water', '✹': 'fire', '❋': 'air' };
  const RS = { name: '', data: null, char: '', cls: 'archer', lvl: 106, arch: null, goal: 'spell', elems: ['thunder', 'air'], roll: 0.75,
    mythics: true, ban: [], lock: {}, err: null, busy: false, progress: 0, result: null, T: null, mine: null, token: 0 };
  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  /* elements an archetype's abilities deal damage in, most used first */
  function archElements(T, key) {
    const n = {};
    Object.values(T.abilities).filter(a => a._arch === key).forEach(a => { for (const ch of W.mcHtml(a.description).textContent) if (GLYPH[ch]) n[GLYPH[ch]] = (n[GLYPH[ch]] || 0) + 1; });
    const top = Object.entries(n).sort((a, b) => b[1] - a[1]);
    if (!top.length) return ['earth', 'thunder'];
    return top.filter(([, c], i) => i < 2 || (i === 2 && c >= top[1][1] * 0.8)).map(([e]) => e);
  }
  /* spells of the class with their base costs, for mana efficiency */
  const classSpells = (T) => Object.values(T.abilities).map(W.parseSpell).filter(s => s.slot && s.cost);
  const spellSplit = (spells) => {
    const sum = {}; let n = 0;
    spells.filter(sp => Object.keys(sp.parts).length).forEach(sp => { const t = Object.values(sp.parts).reduce((a, b) => a + b, 0); n++; Object.entries(sp.parts).forEach(([e, v]) => { sum[e] = (sum[e] || 0) + v / t * 100 / 1; }); });
    return n ? Object.fromEntries(Object.entries(sum).map(([e, v]) => [e, v / n])) : { neutral: 100 };
  };

  function makeScorer(ctx) {
    const { lvl, goal, eng, spells } = ctx;
    return (pieces, extra) => {
      const res = W.computeBuild(pieces, { mode: ctx.roll, level: lvl, extra }, eng);
      if (res.spTotal > res.spAvail) return { s: -1, res };
      if (!res.melee) return { s: res.ehp * 1e-6, res };
      const spell = res.melee.spell(ctx.spellParts).expected, melee = res.melee.dps;
      /* stay true to the archetype: damage should land in its elements, and its skills shouldn't be pushed below zero */
      const per = Object.entries(res.melee.per), tot = per.reduce((a, [, [lo, hi]]) => a + lo + hi, 0) || 1;
      const cover = per.reduce((a, [e, [lo, hi]]) => a + (ctx.elems.includes(e) ? 1 : e === 'neutral' ? 0.4 : 0) * (lo + hi), 0) / tot;
      const focus = (0.55 + 0.45 * cover) * ctx.elems.reduce((a, e) => a * (res.finalSP[W.SK.indexOf(Object.keys(W.SK_ELEM).find(k => W.SK_ELEM[k] === e))] < 0 ? 0.6 : 1), 1);
      /* spells that cost less hit more often: reward Intelligence and spell cost reductions a little */
      const costs = spells.length ? spells.reduce((a, sp) => a + res.spellCost(sp.slot, sp.cost) / sp.cost, 0) / spells.length : 1;
      const spellEff = spell * Math.pow(1 / Math.max(0.3, costs), 0.5);
      const ehp = Math.max(1, res.ehpAgi);
      const s = focus * (goal === 'spell' ? spellEff * Math.pow(ehp, 0.35)
        : goal === 'melee' ? melee * Math.pow(ehp, 0.35)
        : goal === 'hybrid' ? Math.sqrt(spellEff * melee) * Math.pow(ehp, 0.35)
        : goal === 'support' ? Math.sqrt(spellEff) * Math.pow(ehp, 0.8) * (1 + (res.ids.healingEfficiency || 0) / 100 + (res.ids.manaRegen || 0) / 30)
        : Math.pow(Math.sqrt(spell * melee), 0.25) * ehp);
      return { s, res };
    };
  }

  async function optimise(ctx, onProgress, alive) {
    const { lvl, cls, items, tomes, eng, elems } = ctx;
    const score = makeScorer(ctx);
    const piece = (it, p) => ({ item: it, r: null, p: p || null });
    const allowed = (it) => it.l <= lvl && !RS.ban.includes(it.n) && (RS.mythics || it.r !== 'mythic')
      && W.SK.every(s => !(it.q && it.q[s]) || elems.includes(W.SK_ELEM[s]));
    const lockedItem = (k) => RS.lock[k] && items.find(i => i.n === RS.lock[k]);
    const step = async (p) => { onProgress(p); await yieldUI(); if (!alive()) throw new Error('stale'); };

    /* weapons judged alone, with powders of the best chosen element */
    const wPow = (it, e) => it.ps ? Array.from({ length: it.ps }, () => [e, 6]) : null;
    const weapons = (lockedItem('w') ? [lockedItem('w')] : items.filter(it => it.t === CLASS_WEAPON[cls] && allowed(it)))
      .map(it => ({ it, s: Math.max(...elems.map(e => score([piece(it, wPow(it, e))]).s)) })).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.it);
    if (!weapons.length) throw new Error('No weapon fits that level and those elements. Try adding an element.');
    await step(8);

    /* shortlist per armour type, judged next to the best weapon */
    const short = {};
    const types = [...new Set(ARMOUR.map(a => a[1]))];
    for (const [i, t] of types.entries()) {
      short[t] = items.filter(it => it.t === t && allowed(it))
        .map(it => ({ it, s: score([piece(weapons[0]), piece(it)]).s })).sort((a, b) => b.s - a.s).slice(0, 12).map(x => x.it);
      await step(8 + (i + 1) / types.length * 17);
    }
    ARMOUR.forEach(([k]) => { const l = lockedItem(k); if (l) short[k + '!'] = [l]; });
    const cands = (k, t) => short[k + '!'] || (t ? short[t] : weapons);

    /* greedy fill, then swap pieces while anything improves */
    const build = { w: weapons[0] };
    const evalB = (b) => score(Object.values(b).filter(Boolean).map(it => piece(it))).s;
    for (const [k, t] of ARMOUR) {
      let best = evalB(build), pick = null;
      for (const it of cands(k, t)) { const s = evalB({ ...build, [k]: it }); if (s > best) { best = s; pick = it; } }
      if (pick) build[k] = pick;
      await step(25 + ARMOUR.findIndex(a => a[0] === k) * 2);
    }
    const slots = [['w', null], ...ARMOUR];
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (const [si, [k, t]] of slots.entries()) {
        let best = evalB(build);
        for (const it of cands(k, t)) {
          if (build[k] === it) continue;
          const s = evalB({ ...build, [k]: it });
          if (s > best + 1e-9) { best = s; build[k] = it; improved = true; }
        }
        if (t && !short[k + '!']) { const s = evalB({ ...build, [k]: null }); if (s > best + 1e-9) { delete build[k]; improved = true; } }
        await step(41 + (pass * slots.length + si + 1) / (3 * slots.length) * 30);
      }
      if (!improved) break;
    }

    /* powders: weapon slots in the best element, armour slots in whatever helps most (ties cover the weakest defence) */
    const pw = {};
    const withPw = () => Object.entries(build).filter(([, it]) => it).map(([k, it]) => piece(it, pw[k]));
    if (build.w && build.w.ps) {
      /* all of one element, or two elements alternating */
      const opts = elems.flatMap((e, i) => [wPow(build.w, e), ...elems.slice(i + 1).map(f => Array.from({ length: build.w.ps }, (_, j) => [j % 2 ? f : e, 6]))]);
      pw.w = opts.map(o => { pw.w = o; return { o, s: score(withPw()).s }; }).sort((a, b) => b.s - a.s)[0].o;
    }
    for (const [k] of ARMOUR) {
      const it = build[k]; if (!it || !it.ps) continue;
      const res0 = score(withPw()).res;
      const order = W.ELEMS.slice().sort((a, b) => res0.elemDef[a] - res0.elemDef[b]);
      let best = score(withPw()).s, pick = null;
      for (const e of order) { pw[k] = Array.from({ length: it.ps }, () => [e, 6]); const s = score(withPw()).s; if (s > best + 1e-9) { best = s; pick = pw[k]; } }
      pw[k] = pick || Array.from({ length: it.ps }, () => [order[0], 6]);
    }
    await step(78);

    /* tomes: best one per unlocked slot */
    const tm = {};
    const withAll = () => withPw().concat(Object.values(tm).map(it => piece(it)));
    for (const [i, [type, need]] of eng.tomeSlots.entries()) {
      if (lvl < need) continue;
      let best = score(withAll()).s, pick = null;
      for (const it of tomes.filter(x => x.t === type && x.l <= lvl)) { tm['t' + i] = it; const s = score(withAll()).s; if (s > best + 1e-9) { best = s; pick = it; } }
      if (pick) tm['t' + i] = pick; else delete tm['t' + i];
    }
    await step(86);

    /* spare skill points, five at a time, wherever they help most */
    const extra = {};
    for (let guard = 0; guard < 60; guard++) {
      const now = score(withAll(), extra);
      const left = now.res.spAvail - now.res.spTotal; if (left <= 0) break;
      const n = Math.min(5, left);
      let best = now.s, pick = null;
      for (const s of W.SK) {
        if ((now.res.assigned[W.SK.indexOf(s)] || 0) + n > 100) continue;
        const t = score(withAll(), { ...extra, [s]: (extra[s] || 0) + n }).s;
        if (t > best + 1e-9) { best = t; pick = s; }
      }
      if (!pick) break;
      extra[pick] = (extra[pick] || 0) + n;
    }
    await step(92);

    /* runner-ups: the best other choice for each slot, and how much weaker it is */
    const final = score(withAll(), extra);
    const alts = {};
    for (const [k, t] of slots) {
      if (short[k + '!']) continue;
      alts[k] = cands(k, t).filter(it => it !== build[k]).map(it => {
        const b2 = { ...build, [k]: it };
        const ps = Object.entries(b2).filter(([, x]) => x).map(([kk, x]) => piece(x, kk === k ? null : pw[kk])).concat(Object.values(tm).map(x => piece(x)));
        return { it, d: score(ps, extra).s / final.s };
      }).filter(a => a.d > 0).sort((a, b) => b.d - a.d).slice(0, 2);
    }
    await step(100);
    return { build, pw, tm, extra, alts, ...final };
  }

  /* An ability tree for the archetype: spells first, then the archetype's abilities, cheapest reachable first. */
  function suggestTree(T, archKey, lvl) {
    const max = W.abilityPoints(lvl, 0);
    let sel = new Set();
    const prio = (id) => { const a = T.abilities[id]; const sp = W.parseSpell(a); return (sp.slot ? 5 : 0) + (a._arch === archKey ? 3 : a._arch ? -4 : 1) - a._cost * 0.3; };
    for (let guard = 0; guard < 200; guard++) {
      const S = W.treeState(T, sel, lvl);
      const opts = T.ids.filter(id => !sel.has(id) && S.canTake(id, sel, S.used, max).ok).sort((a, b) => prio(b) - prio(a));
      if (!opts.length) break;
      /* a spell or archetype node counts even several steps away: take the best next node */
      sel = new Set([...sel, opts[0]]);
    }
    return [...sel];
  }

  W.pages['items/recommend'] = function (root, q) {
    if (q && q.get('u') && (!RS.data || RS.data.username.toLowerCase() !== q.get('u').toLowerCase())) { RS.name = q.get('u'); RS.data = null; RS.result = null; RS.wantChar = q.get('c'); }
    W.withData(root, ['items', 'tomes', 'engine', 'itemids', 'idkeys'], (items, tomes, eng, itemIds, idKeys) => {
      const ctxIds = { ids: itemIds, keyNum: Object.fromEntries(Object.entries(idKeys).map(([n, k]) => [k, +n])) };
      const char = () => RS.data && RS.data.characters && RS.data.characters[RS.char];
      const cname = (c) => { const k = W.cap(String(c.reskin || c.type).toLowerCase()); return c.nickname && c.nickname !== k ? `${c.nickname} · ${k}` : k; };
      const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', { class: 'stack' }, form(), result(), compareWin()), el('div', { class: 'stack' }, side())));

      /* loads the class tree and picks its first archetype; runs the search unless the caller will */
      async function setClass(cls, andRun) {
        RS.cls = cls; RS.T = null; draw();
        try {
          const T = await W.loadTree(cls);
          if (RS.cls !== cls) return;
          RS.T = T;
          setArch(T.archetypes[0].key, !andRun);
        } catch (e) { RS.err = 'Couldn’t load the ability tree: ' + e.message; draw(); }
      }
      function setArch(key, noRun) {
        RS.arch = key;
        const a = RS.T.archetypes.find(x => x.key === key);
        RS.goal = STYLE[a.name] || 'spell';
        RS.elems = archElements(RS.T, key);
        if (noRun) draw(); else run();
      }

      async function loadPlayer() {
        if (!RS.name) return;
        RS.busy = true; RS.err = null; RS.result = null; draw();
        try {
          const d = await W.api(`player/${encodeURIComponent(RS.name)}?fullResult`);
          if (d.multiple) throw new Error('That name matches several players. Use the exact name.');
          RS.data = d;
          const chars = Object.entries(d.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0));
          RS.char = RS.wantChar && d.characters[RS.wantChar] ? RS.wantChar : (chars.length ? chars[0][0] : '');
          if (!RS.char) throw new Error('This player has no characters the API can see.');
        } catch (e) { RS.err = e.message; RS.data = null; RS.busy = false; draw(); return; }
        RS.busy = false;
        pickChar(RS.char);
      }
      async function pickChar(id) {
        RS.char = id; const c = char();
        RS.lvl = c.level || 1; RS.mine = null;
        await setClass(String(c.type).toLowerCase(), false);
        if (!RS.T) return;
        /* the archetype they actually play, from their own tree */
        try {
          const m = await W.api(`player/${RS.data.uuid}/characters/${id}/abilities`);
          const ids = Object.values(m || {}).flat().filter(n => n.type === 'ability').map(n => n.meta && n.meta.id).filter(id2 => RS.T.abilities[id2]);
          RS.mine = ids;
          const count = {}; ids.forEach(i => { const a = RS.T.abilities[i]._arch; if (a) count[a] = (count[a] || 0) + 1; });
          const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
          if (top) setArch(top[0], true);
        } catch (e) { /* tree private: keep the default archetype */ }
        run();
      }

      async function run() {
        if (!RS.T) return;
        const token = ++RS.token;
        RS.busy = true; RS.err = null; RS.result = null; RS.progress = 0; draw();
        const bar = () => root.querySelector('.rsbar i');
        try {
          const ctx = { lvl: RS.lvl, cls: RS.cls, items, tomes, eng, elems: RS.elems, goal: RS.goal, roll: RS.roll, spells: classSpells(RS.T) };
          ctx.spellParts = spellSplit(ctx.spells);
          const r = await optimise(ctx, (p) => { RS.progress = p; const b = bar(); if (b) b.style.width = p + '%'; }, () => token === RS.token);
          r.tree = RS.mine && RS.mine.length ? RS.mine : suggestTree(RS.T, RS.arch, RS.lvl);
          r.treeFrom = RS.mine && RS.mine.length ? 'mine' : 'suggested';
          RS.result = r;
        } catch (e) { if (e.message === 'stale') return; RS.err = e.message; }
        RS.busy = false; draw();
      }

      function form() {
        const inp = el('input', { type: 'text', value: RS.name, placeholder: 'Username (optional)', maxlength: 16, oninput: (e) => { RS.name = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') loadPlayer(); } });
        const chars = RS.data ? Object.entries(RS.data.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0)) : [];
        const T = RS.T;
        return W.win('Recommended build',
          el('p', { class: 'hint', style: { marginTop: 0 } }, 'Load a character, or pick a class and archetype yourself. The search tries every item that fits and keeps the best combination, then adds powders, tomes, skill points and an ability tree.'),
          el('div', { class: 'search' }, inp, el('button', { onclick: loadPlayer }, 'Load player'),
            RS.data ? el('button', { class: 'mini', onclick: () => { RS.data = null; RS.name = ''; RS.mine = null; draw(); } }, 'Forget') : null),
          chars.length ? el('div', { class: 'fields3', style: { marginTop: '12px' } },
            el('label', {}, 'Character', W.sel(chars.map(([id, c]) => [id, `${cname(c)} · Lv. ${c.level}`]), RS.char, pickChar))) : null,
          el('div', { class: 'fields3', style: { marginTop: '12px' } },
            el('label', {}, 'Class', W.sel(CLASSES.map(c => [c, W.cap(c)]), RS.cls, (v) => { RS.mine = null; RS.lock = {}; setClass(v, true); })),
            el('label', {}, 'Level', W.numIn(RS.lvl, (v) => { RS.lvl = Math.max(1, Math.min(120, v)); run(); }, 1, 120)),
            el('label', {}, 'Assume rolls', W.sel([['0.7', '70%'], ['0.75', '75%'], ['0.8', '80%'], ['1', 'Perfect']], String(RS.roll), (v) => { RS.roll = +v; run(); }))),
          T ? el('div', {}, el('div', { class: 'cap left' }, 'Archetype'),
            el('div', { class: 'archpick' }, T.archetypes.map(a => el('button', { class: 'archbtn' + (RS.arch === a.key ? ' on' : ''), onclick: () => setArch(a.key) },
              el('img', { src: `img/atree/${a.file}.png`, alt: '' }), el('span', {}, a.name), el('small', {}, W.cap(STYLE[a.name] || 'spell')))))) : el('p', { class: 'empty' }, 'Loading archetypes…'),
          el('div', { class: 'fields3', style: { marginTop: '12px' } },
            el('label', {}, 'Build for', W.sel(GOALS, RS.goal, (v) => { RS.goal = v; run(); })),
            el('label', { class: 'check', style: { alignSelf: 'end' } }, el('input', { type: 'checkbox', checked: RS.mythics, onchange: (e) => { RS.mythics = e.target.checked; run(); } }), 'Allow mythics')),
          el('div', { class: 'cap left' }, 'Elements'),
          el('div', { class: 'btns', style: { marginTop: 0 } }, W.ELEMS.map(e => el('button', { class: 'mini pwbtn eltog' + (RS.elems.includes(e) ? ' on' : ''), 'aria-pressed': RS.elems.includes(e), disabled: RS.elems.length === 1 && RS.elems[0] === e, title: RS.elems.length === 1 && RS.elems[0] === e ? 'Keep at least one element' : '', onclick: () => {
            if (RS.elems.includes(e)) { if (RS.elems.length === 1) return; RS.elems = RS.elems.filter(x => x !== e); } else RS.elems = RS.elems.concat(e);
            run();
          } }, el('img', { src: `img/ui/powder-${e}.webp`, alt: '' }), W.cap(e)))),
          el('p', { class: 'hint' }, 'Items that need skill points in other elements are left out. Keep at least one element.'),
          RS.ban.length || Object.keys(RS.lock).length ? el('div', { class: 'hint' },
            Object.keys(RS.lock).length ? el('div', {}, 'Kept: ', Object.values(RS.lock).join(', '), ' ', el('button', { class: 'mini', onclick: () => { RS.lock = {}; run(); } }, 'Unlock all')) : null,
            RS.ban.length ? el('div', {}, 'Left out: ', RS.ban.join(', '), ' ', el('button', { class: 'mini', onclick: () => { RS.ban = []; run(); } }, 'Allow again')) : null) : null,
          RS.err ? el('div', { class: 'warn', style: { marginTop: '12px' } }, RS.err) : null,
          RS.busy ? el('div', { class: 'rsbusy' }, el('span', {}, RS.T ? 'Trying gear combinations…' : 'Asking the Wynncraft API…'), el('div', { class: 'rbar rsbar' }, el('i', { style: { width: RS.progress + '%' } }))) : null);
      }

      function result() {
        const r = RS.result;
        if (!r) return null;
        const res = r.res, b = r.build, c = char();
        const s = Object.fromEntries(Object.entries(b).filter(([, it]) => it).map(([k, it]) => [k, [it.n, null, r.pw[k] || null]]));
        Object.entries(r.tm).forEach(([k, it]) => { s[k] = [it.n, null, null]; });
        const lb = { lvl: RS.lvl, mode: RS.roll === 1 ? 'max' : RS.roll, x: r.extra, s, t: r.tree };
        const code = W.encodeBuild(lb, { ...ctxIds, treeIds: RS.T.ids });
        const href = `#items/loadout?b=${code}` + (c && r.treeFrom === 'mine' ? `&u=${encodeURIComponent(RS.data.username)}&c=${encodeURIComponent(RS.char)}` : '');
        const has = c ? W.SK.map(sk => (c.skillPoints || {})[SK_API[sk]] || 0) : null;
        const arch = RS.T.archetypes.find(a => a.key === RS.arch);
        const pwIcons = (p) => p ? el('span', { class: 'pws' }, p.map(([e, t]) => el('img', { src: `img/ui/powder-${e}.webp`, title: `${W.cap(e)} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][t - 1]}`, alt: '' }))) : null;
        const row = (k) => {
          const it = b[k], alt = r.alts[k] || [];
          return el('div', { class: 'recrow' }, W.slot(W.art.item(it ? it.ic : null)),
            el('div', { class: 'recmain' }, el('small', {}, SLOT_NAME[k]),
              it ? W.tip(el('b', { style: { color: W.tierColor(it.r) } }, it.n), () => W.itemCard(it)) : el('b', {}, 'Nothing better than empty'),
              it ? el('small', {}, `Lv. ${it.l}`, pwIcons(r.pw[k])) : null,
              alt.length ? el('small', { class: 'alts' }, 'Or: ', alt.map((a, i) => [i ? ', ' : '', W.tip(el('span', { style: { color: W.tierColor(a.it.r) } }, a.it.n), () => W.itemCard(a.it)), ` (${a.d >= 1 ? '+' : ''}${Math.round((a.d - 1) * 100)}%)`])) : null),
            it ? el('div', { class: 'recbtns' },
              el('button', { class: 'mini' + (RS.lock[k] ? ' on' : ''), title: 'Keep this item and build around it', onclick: () => { if (RS.lock[k]) delete RS.lock[k]; else RS.lock[k] = it.n; run(); } }, RS.lock[k] ? 'Kept' : 'Keep'),
              el('button', { class: 'mini danger', title: 'Leave this item out', onclick: () => { RS.ban.push(it.n); delete RS.lock[k]; run(); } }, 'Not this')) : null);
        };
        const tomesOn = Object.entries(r.tm);
        return el('div', { class: 'stack' },
          W.win(`${c ? cname(c) : W.cap(RS.cls)} · ${arch ? arch.name : ''} · Lv. ${RS.lvl}`,
            el('div', { class: 'bigstats', style: { marginTop: 0 } },
              el('div', {}, el('b', {}, W.short(res.hp)), el('span', {}, 'Health')),
              el('div', {}, el('b', {}, W.short(res.ehpAgi)), el('span', {}, 'Effective HP')),
              res.melee ? el('div', {}, el('b', {}, W.short(RS.goal === 'melee' ? res.melee.dps : res.melee.spell(spellSplit(classSpells(RS.T))).expected)), el('span', {}, RS.goal === 'melee' ? 'Main attack DPS' : 'Per 100% spell')) : null),
            el('div', { class: 'reclist' }, ['w', ...ARMOUR.map(a => a[0])].map(row)),
            tomesOn.length ? el('div', {}, el('div', { class: 'cap left' }, `Tomes (${tomesOn.length})`),
              el('div', { class: 'tomechips' }, tomesOn.map(([, it]) => W.tip(el('span', { class: 'tchip' }, W.art.item(it.ic), it.n), () => W.itemCard(it))))) : null,
            el('div', { class: 'cap left' }, 'Skill points'),
            el('div', { class: 'sptable' },
              el('div', { class: 'sprow rec sphead' }, ['', 'Assign', 'Total', c ? 'Now' : ''].map(h => el('span', {}, h))),
              W.SK.map((sk, i) => el('div', { class: 'sprow rec' },
                el('b', { class: 'elname', style: { color: W.ELEM[W.SK_ELEM[sk]] } }, W.cap(sk)),
                el('span', {}, res.assigned[i]),
                el('b', {}, res.finalSP[i]),
                has ? el('small', { class: has[i] >= res.assigned[i] ? 'up' : 'down' }, `has ${has[i]}`) : el('span', {})))),
            el('p', { class: 'hint' }, `All ${res.spAvail} skill points used, at ${Math.round(RS.roll * 100)}% rolls. Ability tree: ${r.treeFrom === 'mine' ? 'this character’s own' : `a suggested ${arch ? arch.name : ''} tree (${r.tree.length} abilities)`}.`),
            el('div', { class: 'btns' }, el('a', { class: 'btnlink', href }, 'Open in Loadout Builder'), el('button', { onclick: run }, 'Search again'))));
      }

      /* your saved Loadout Builder build next to the recommendation */
      function compareWin() {
        const r = RS.result; if (!r) return null;
        let mine = null;
        try { mine = JSON.parse(localStorage.getItem('wt.loadout2')); } catch (e) { /* storage blocked */ }
        const byName = (n) => items.find(i => i.n === n) || tomes.find(i => i.n === n);
        const minePieces = mine && mine.s ? Object.entries(mine.s).map(([k, v]) => v && byName(v[0]) ? { k, item: byName(v[0]), r: v[1], p: v[2] } : null).filter(Boolean) : [];
        if (!minePieces.length) return W.win('Compare with your loadout', el('p', { class: 'empty' }, 'Put your current gear in the ', el('a', { href: '#items/loadout' }, 'Loadout Builder'), ' (or paste it from Wynntils there) and it shows up here next to the recommendation.'));
        const a = W.computeBuild(minePieces, { mode: mine.mode || 'max', level: mine.lvl || RS.lvl, extra: mine.x || {} }, eng), b = r.res;
        const spl = spellSplit(classSpells(RS.T));
        const stats = [
          ['Health', a.hp, b.hp], ['Effective HP', a.ehpAgi, b.ehpAgi],
          ['Main attack DPS', a.melee && a.melee.dps, b.melee && b.melee.dps],
          ['Per 100% spell', a.melee && a.melee.spell(spl).expected, b.melee && b.melee.spell(spl).expected],
          ['Max mana', a.mana, b.mana], ['Mana regen', a.manaRegen, b.manaRegen], ['Mana steal', a.manaSteal, b.manaSteal],
          ['Life steal', a.lifeSteal, b.lifeSteal], ['Walk speed', a.walk, b.walk],
          ['Skill points used', a.spTotal, b.spTotal, true],
        ];
        const wCls = (minePieces.find(p => p.k === 'w') || {}).item;
        const clash = wCls && wCls.t !== CLASS_WEAPON[RS.cls];
        const slotName = (k) => SLOT_NAME[k] || (k[0] === 't' ? 'Tome' : k);
        const itemCell = (it) => it ? W.tip(el('b', { style: { color: W.tierColor(it.r) } }, it.n), () => W.itemCard(it)) : el('span', { class: 'hint' }, 'Empty');
        return W.win('Your loadout vs recommended',
          a.spTotal > a.spAvail ? el('div', { class: 'warn' }, `Your loadout needs ${a.spTotal} skill points but level ${mine.lvl || RS.lvl} only gives ${a.spAvail}, so it can’t be fully worn.`) : null,
          clash ? el('div', { class: 'warn' }, `Your loadout uses a ${wCls.t}, so it’s for a different class than this ${W.cap(RS.cls)} recommendation.`) : null,
          el('div', { class: 'lvcmp' },
            el('div', { class: 'lvrow lvhead' }, el('span', {}), el('span', {}, 'Yours'), el('span', {}, 'Recommended'), el('span', {}, 'Change')),
            stats.map(([label, x, y, lowerBetter]) => {
              const d = x && y != null ? (y - x) / Math.abs(x) * 100 : null;
              const good = d == null || Math.abs(d) < 0.5 ? '' : (d > 0) !== !!lowerBetter ? 'up' : 'down';
              return el('div', { class: 'lvrow' }, el('span', {}, label), el('b', {}, x == null ? '—' : W.short(Math.round(x))), el('b', {}, y == null ? '—' : W.short(Math.round(y))),
                el('small', { class: good }, d == null ? '—' : (d > 0 ? '+' : '') + Math.round(d) + '%'));
            })),
          el('div', { class: 'cap left' }, 'Slot by slot'),
          el('div', { class: 'lvcmp' }, ['w', ...ARMOUR.map(x => x[0])].map(k => {
            const yours = (minePieces.find(p => p.k === k) || {}).item, rec = r.build[k];
            return el('div', { class: 'lvrow slots' + (yours && rec && yours.n === rec.n ? ' same' : '') }, el('span', {}, slotName(k)), itemCell(yours), itemCell(rec),
              el('small', {}, yours && rec && yours.n === rec.n ? 'Same' : rec ? 'Swap' : '—'));
          })),
          el('p', { class: 'hint' }, `Yours uses ${typeof mine.mode === 'number' ? Math.round(mine.mode * 100) + '%' : mine.mode === 'avg' ? 'average' : mine.mode === 'min' ? 'worst' : 'best'} rolls for anything without exact rolls; the recommendation uses ${Math.round(RS.roll * 100)}%. Both include their tomes and powders.`));
      }

      function side() {
        const T = RS.T, arch = T && T.archetypes.find(a => a.key === RS.arch);
        return [
          arch ? W.win(arch.name, el('div', { class: 'archinfo' }, el('img', { src: `img/atree/${arch.file}.png`, alt: '' }), el('p', {}, W.mcHtml(T.tree.archetypes[arch.key].description))),
            el('p', { class: 'hint' }, `Damage elements in its abilities: ${archElements(T, arch.key).map(W.cap).join(', ')}. Usually played as ${(GOALS.find(g => g[0] === (STYLE[arch.name] || 'spell')) || [0, 'spell'])[1].toLowerCase()}.`)) : null,
          W.win('How it picks',
            el('p', {}, 'Every item the character can wear (level, class, and skill requirements only in the chosen elements) is scored with the Loadout Builder’s engine at the roll quality you pick. The best dozen per slot are combined and swapped until nothing improves, rejecting anything that needs more skill points than the level gives.'),
            el('p', {}, 'Then it powders the weapon in the strongest element (or a mix), powders armour where it helps, fills every tome slot the level unlocks, spreads the spare skill points where they add the most, and picks an ability tree: the character’s own if it’s public, otherwise one built around the archetype.'),
            el('p', { class: 'hint' }, 'Use Keep to build around an item you already have, and Not this to leave one out. Damage numbers are estimates.')),
        ].filter(Boolean);
      }

      if (RS.name && !RS.data && !RS.busy) loadPlayer();
      else if (!RS.T) setClass(RS.cls, true);
      else draw();
    });
  };
})(window.W);
