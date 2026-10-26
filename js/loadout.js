/* Loadout Builder: equipment, tomes, powders, exact rolls, skill points, defence, damage, spells and the
   ability tree, with short share links. Uses js/engine.js for the maths and js/atree.js for the tree. */
(function (W) {
  const { el } = W;
  const EQUIP = [['h', 'Helmet', ['helmet']], ['c', 'Chestplate', ['chestplate']], ['l', 'Leggings', ['leggings']], ['b', 'Boots', ['boots']],
    ['r1', 'Ring', ['ring']], ['r2', 'Ring', ['ring']], ['br', 'Bracelet', ['bracelet']], ['n', 'Necklace', ['necklace']], ['w', 'Weapon', ['bow', 'spear', 'wand', 'dagger', 'relik']]];
  const TOME_NAMES = { armour_tome: 'Armour tome', weapon_tome: 'Weapon tome', marathon_tome: 'Marathon tome', expertise_tome: 'Expertise tome', mysticism_tome: 'Mysticism tome', lootrun_tome: 'Lootrun tome', guild_tome: 'Guild tome' };
  const WEAPON_CLASS = { bow: 'archer', spear: 'warrior', wand: 'mage', dagger: 'assassin', relik: 'shaman' };
  const CLASS_WEAPON = { archer: 'bow', warrior: 'spear', mage: 'wand', assassin: 'dagger', shaman: 'relik' };
  const ELEM_COL = { earth: '#00aa00', thunder: '#ffff55', water: '#55ffff', fire: '#ff5555', air: '#ffffff', neutral: '#ffaa00' };
  const KEY = 'wt.loadout2';
  const fmt = (n) => Math.abs(n) >= 10000 ? W.short(n) : Math.round(n).toLocaleString('en-US');
  const blank = () => ({ lvl: 106, mode: 'max', s: {}, x: {}, t: [], loan: 4 });
  let LB = (() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY)); if (v) return Object.assign(blank(), v);
      const old = JSON.parse(localStorage.getItem('wt.loadout')); if (old && old.s) return Object.assign(blank(), { s: old.s });
    } catch (e) { /* storage blocked */ }
    return blank();
  })();
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(LB)); } catch (e) { /* storage blocked */ } };

  /* Spells from ability text: cost, damage % of DPS and its element split, and which spell slot (1st–4th) it is. */
  const GLYPH_EL = { '✣': 'neutral', '✤': 'earth', '✦': 'thunder', '❉': 'water', '✹': 'fire', '❋': 'air' };
  W.parseSpell = (a) => {
    const txt = W.mcHtml(a.description).textContent.replace(/\s+/g, ' ');
    const cost = /Mana Cost:\s*(\d+)/.exec(txt);
    const total = /Total Damage:\s*([\d.]+)%\s*\(of your DPS([^)]*)\)/.exec(txt);
    const parts = {};
    for (const m of txt.matchAll(/\(([✣✤✦❉✹❋])\s*\w+:\s*([\d.]+)%\)/g)) parts[GLYPH_EL[m[1]]] = (parts[GLYPH_EL[m[1]]] || 0) + +m[2];
    const m = /Click Combo:\s*(LEFT|RIGHT|L|R)-(LEFT|RIGHT|L|R)-(LEFT|RIGHT|L|R)/.exec(txt);
    const combo = m && m.slice(1).map(x => x[0]);
    let slot = null;
    if (combo) {
      let c = combo.join('');
      if (c[0] === 'L') c = c.replace(/[LR]/g, x => (x === 'L' ? 'R' : 'L'));
      slot = { RLR: 1, RRR: 2, RLL: 3, RRL: 4 }[c] || null;
    }
    /* how many times one cast hits: "a stream of 8 arrows", "a flurry of 8 hits", or "every 0.4s" over its duration */
    const count = /(?:stream|flurry|volley|barrage|burst) of (\d+) (\w+)/i.exec(txt);
    const every = /every ([\d.]+)s/i.exec(txt), dur = /Duration:\s*([\d.]+)s/.exec(txt);
    const hits = count ? +count[1] : every && dur ? Math.round(+dur[1] / +every[1]) : 1;
    const unit = count ? count[2].toLowerCase() : every && dur ? `ticks over ${dur[1]}s` : '';
    return { name: W.treePlain(a.name), cost: cost ? +cost[1] : null, total: total ? +total[1] : null, per: total ? total[2].replace(/^,\s*/, '').trim() : '', parts, slot, combo: combo ? combo.join('-') : '', hits, unit,
      perStream: count ? +count[1] : null };
  };

  /* A spell with the unlocked tree upgrades that change it applied: signed damage changes ("-20% per arrow"),
     mana cost changes, and extra streams / arrows per stream / hits. Upgrades count when they need the spell
     or name it; damage lines marked "for X" or "per Y" only apply to the matching spell. Conditional counts
     ("Hitting 1 flint arrow will make your next Arrow Storm shoot +1 arrow per stream. (Max 40)") use stacks[name]. */
  W.treeSpell = (sp, spellId, T, selected, stacks = {}) => {
    const parts = Object.assign({}, sp.parts);
    let streams = 1, perStream = sp.perStream, extraHits = 0, costAdj = 0;
    const applied = [], cond = [];
    const units = (sp.per.match(/per (\w+)/) || [])[1] || '';
    selected.forEach(id => {
      const a = T.abilities[id];
      if (!a || id === spellId || W.parseSpell(a).slot) return;
      const txt = W.mcHtml(a.description).textContent.replace(/\s+/g, ' ');
      const req = [].concat((a.requirements || {}).NODE || []);
      if (!req.includes(spellId) && !txt.includes(sp.name)) return;
      let used = false;
      txt.split('◆').forEach(line => {
        const d = /Total Damage:\s*([+-][\d.]+)%\s*\(([^)]*)\)/.exec(line);
        if (d) {
          const q = d[2], forX = /for ([^,]+)$/.exec(q), perY = /per ([\w/]+)/.exec(q);
          if (forX && forX[1].trim() !== sp.name) return;
          if (perY && !perY[1].split('/').some(u => units.startsWith(u.replace(/s$/, '')))) return;
          let listed = 0;
          for (const m of line.matchAll(/\(([✣✤✦❉✹❋])\s*\w+:\s*([+-]?[\d.]+)%\)/g)) { const e = GLYPH_EL[m[1]]; parts[e] = (parts[e] || 0) + +m[2]; listed++; }
          /* the listed parts are what applies to this spell; a Total that differs covers other spells too
             (Nimble String: "-20%" but "(✣ Damage: -10%)" per arrow, the rest is Phantom Ray). Only a bare Total counts as neutral. */
          if (!listed) parts.neutral = (parts.neutral || 0) + +d[1];
          used = true;
        }
        const c = /Mana Cost:\s*([+-]\d+)/.exec(line);
        if (c) { costAdj += +c[1]; used = true; }
      });
      const st = /\+(\d+) (?:extra |additional )?streams?/i.exec(txt), ps = /\+(\d+) (?:extra |additional )?arrows? per stream/i.exec(txt), h = /\+(\d+) (?:extra |additional )?hits?\b/i.exec(txt);
      const max = /\(Max (\d+)\)/.exec(txt);
      if (max) {
        /* conditional: counts as many times as you say it stacked, up to its max */
        const name = W.treePlain(a.name), n = Math.max(0, Math.min(+max[1], stacks[name] || 0));
        if (ps && perStream) { cond.push({ name, max: +max[1], n, what: `+${ps[1]} per stream each` }); perStream += n * +ps[1]; if (n) used = true; }
        else if (h) { cond.push({ name, max: +max[1], n, what: `+${h[1]} hit${h[1] === '1' ? '' : 's'} each` }); extraHits += n * +h[1]; if (n) used = true; }
      } else {
        if (st) { streams += +st[1]; used = true; }
        if (ps && perStream) { perStream += +ps[1]; used = true; }
        if (h) { extraHits += +h[1]; used = true; }
      }
      if (used) applied.push(W.treePlain(a.name));
    });
    Object.keys(parts).forEach(e => { if (parts[e] <= 0) delete parts[e]; });
    const total = Object.values(parts).reduce((x, y) => x + y, 0);
    const hits = perStream ? streams * perStream + extraHits : sp.hits + extraHits;
    const unit = perStream ? (streams > 1 ? `arrows (${streams} streams × ${perStream})` : sp.unit) : sp.unit || (extraHits ? 'hits' : '');
    return Object.assign({}, sp, { parts, total: sp.total != null ? total : null, cost: sp.cost != null ? Math.max(1, sp.cost + costAdj) : null, hits, unit, applied, cond });
  };

  /* Damage from unlocked ability tree nodes that aren't spells: the element masteries ("❋ Air Damage: +3-4",
     "❋ Air Damage: +15%"). Returns { add: { air: [3, 4] }, pct: { air: 15 } } for W.computeBuild. */
  const ELEM_WORD = { earth: 'earth', thunder: 'thunder', water: 'water', fire: 'fire', air: 'air' };
  W.treeBonuses = (T, selected) => {
    const out = { add: {}, pct: {} };
    if (!T) return out;
    (selected || []).forEach(id => {
      const a = T.abilities[id]; if (!a) return;
      const txt = W.mcHtml(a.description).textContent.replace(/\s+/g, ' ');
      if (/Click Combo/.test(txt)) return;
      for (const m of txt.matchAll(/[✤✦❉✹❋]\s*(Earth|Thunder|Water|Fire|Air) Damage:\s*\+(\d+)-(\d+)(?![\d%])/g)) {
        const e = ELEM_WORD[m[1].toLowerCase()], v = out.add[e] || [0, 0]; out.add[e] = [v[0] + +m[2], v[1] + +m[3]];
      }
      for (const m of txt.matchAll(/[✤✦❉✹❋]\s*(Earth|Thunder|Water|Fire|Air) Damage:\s*\+([\d.]+)%/g)) {
        const e = ELEM_WORD[m[1].toLowerCase()]; out.pct[e] = (out.pct[e] || 0) + +m[2];
      }
    });
    return out;
  };

  W.pages['items/loadout'] = function (root, q) {
    let picking = null, sel = 'w', pq = '', onlyUsable = true, owner = null, ownerErr = null, T = null;
    W.withData(root, ['items', 'tomes', 'idkeys', 'itemids', 'engine', 'ingredients', 'recipes'], (items, tomes, idKeys, itemIds, eng, ings, recipes) => {
      const ingByName = Object.fromEntries(ings.map(g => [g.n, g]));
      const byName = Object.fromEntries(items.concat(tomes).map(i => [i.n, i]));
      const ctx = { ids: itemIds, names: Object.fromEntries(Object.entries(itemIds).map(([n, i]) => [i, n])), keyName: idKeys, keyNum: Object.fromEntries(Object.entries(idKeys).map(([n, k]) => [k, +n])) };

      /* links: new short codes, old JSON links still open */
      if (q && q.get('b')) {
        const b = q.get('b');
        try {
          if (b.startsWith('ey')) { const o = JSON.parse(decodeURIComponent(escape(atob(b.replace(/-/g, '+').replace(/_/g, '/'))))); LB = Object.assign(blank(), { s: o.s || {} }); }
          else { const d = W.decodeBuild(b, ctx); LB = Object.assign(blank(), { lvl: d.lvl, mode: d.mode, s: d.s, x: d.x, t: [], tIdx: d.tIdx }); }
          if (q.get('n')) LB.name = q.get('n').slice(0, 60);
          if (q.get('cr')) LB.c = W.unpackCrafts(q.get('cr'));
          /* opened from the library: keep its tags and notes, and update that entry when saved */
          const lib = q.get('lib') && W.builds.get(q.get('lib'));
          if (lib) Object.assign(LB, { lib: lib.id, tags: lib.tags || [], notes: lib.notes || '' });
          store();
          history.replaceState(null, '', '#items/loadout');   // later edits shouldn't be undone by a reload
        } catch (e) { ownerErr = 'That build link is broken: ' + e.message; }
      }
      if (q && q.get('u')) { LB.u = q.get('u'); LB.ch = q.get('c') || null; LB.fromChar = true; store(); history.replaceState(null, '', '#items/loadout'); }

      /* crafted gear (LB.c[slot]) is built from its recipe and ingredients; everything else comes from the item list */
      const crafted = (k) => { const d = LB.c && LB.c[k]; const it = d && W.craftItem(d, recipes, ingByName, eng); return it ? { key: k, item: it, r: null, p: d.p || null } : null; };
      const piece = (k) => crafted(k) || (LB.s[k] && byName[LB.s[k][0]] ? { key: k, item: byName[LB.s[k][0]], r: LB.s[k][1], p: LB.s[k][2] } : null);
      const pieces = () => W.BUILD_SLOTS.map(piece).filter(Boolean);
      const cls = () => { const w = piece('w'); return w ? WEAPON_CLASS[w.item.t] : (owner && owner.char ? String(owner.char.type).toLowerCase() : LB.cls || null); };
      const compute = () => W.computeBuild(pieces(), { mode: LB.mode, level: LB.lvl, extra: LB.x, tree: W.treeBonuses(T && T.cls === cls() ? T : null, LB.t) }, eng);

      const ensureTree = () => {
        const c = cls(); if (!c) { T = null; return; }
        if (T && T.cls === c) return;
        W.loadTree(c).then(t => {
          T = Object.assign({ cls: c }, t);
          if (LB.tIdx) { LB.t = LB.tIdx.map(i => T.ids[i]).filter(Boolean); delete LB.tIdx; store(); }
          LB.t = LB.t.filter(id => T.abilities[id]);
          draw();
        }).catch(() => {});
      };

      if (LB.u && !owner) {
        W.api(`player/${encodeURIComponent(LB.u)}?fullResult`).then(d => {
          const chars = Object.entries(d.characters || {});
          const pick = chars.find(([id]) => id === LB.ch) || chars.sort((a, b) => (b[1].level || 0) - (a[1].level || 0))[0];
          owner = { name: d.username, uuid: d.uuid, id: pick && pick[0], char: pick && pick[1] };
          if (LB.fromChar && owner.char) {
            LB.lvl = owner.char.level || LB.lvl; LB.cls = String(owner.char.type).toLowerCase();
            W.api(`player/${d.uuid}/characters/${owner.id}/abilities`).then(m => {
              LB.t = Object.values(m || {}).flat().filter(n => n.type === 'ability').map(n => n.meta && n.meta.id).filter(Boolean); store(); draw();
            }).catch(() => {});
            LB.fromChar = false; store();
          }
          draw();
        }).catch(e => { ownerErr = e.message; draw(); });
      }

      const code = () => W.encodeBuild(LB, { ...ctx, treeIds: T && T.cls === cls() ? T.ids : null });
      const shareLink = () => W.buildLink({ code: code(), name: LB.name, cr: LB.c }, true);
      /* the archetype with the most unlocked abilities */
      const archetype = () => {
        if (!T || T.cls !== cls()) return null;
        const n = {}; LB.t.forEach(id => { const a = T.abilities[id]; if (a && a._arch) n[a._arch] = (n[a._arch] || 0) + 1; });
        const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0], a = top && T.archetypes.find(x => x.key === top[0]);
        return a ? a.name : null;
      };
      /* the numbers the library and chat embeds show */
      const snapshot = () => {
        const sum = summary(), r = sum && sum.res, w = piece('w');
        const best = sum && sum.best && r.melee ? r.melee.spell(Object.keys(sum.best.parts).length ? sum.best.parts : { neutral: sum.best.total }).expected * sum.best.hits : null;
        const per = r && r.melee ? Object.entries(r.melee.per).map(([e, [a, b]]) => [e, (a + b) / 2]) : [], tot = per.reduce((a, x) => a + x[1], 0) || 1;
        return { cls: cls(), arch: archetype(), lvl: LB.lvl, weapon: w ? w.item.n : null, ic: w ? w.item.ic : null, rar: w ? w.item.r : null,
          elems: per.filter(([e, v]) => e !== 'neutral' && v / tot >= 0.15).sort((a, b) => b[1] - a[1]).map(x => x[0]),
          gear: pieces().filter(p => p.key !== 'w' && p.item.g !== 'tome').map(p => p.item.n),
          hp: r ? Math.round(r.hp) : null, ehp: r ? Math.round(r.ehpAgi) : null, dps: r && r.melee ? Math.round(r.melee.dps) : null,
          spell: sum && sum.best ? sum.best.name : null, spellDmg: best != null ? Math.round(best) : null };
      };
      const saveToLibrary = (btn) => {
        const e = W.builds.save({ id: LB.lib && W.builds.get(LB.lib) ? LB.lib : undefined, name: LB.name || '', tags: LB.tags || [], notes: LB.notes || '', code: code(), cr: LB.c && Object.keys(LB.c).length ? LB.c : undefined, snap: snapshot() });
        LB.lib = e.id; store();
        btn.textContent = 'Saved'; setTimeout(() => draw(), 900);
      };

      /* ---------- left column ---------- */
      function buildWin() {
        const link = shareLink(), box = el('input', { type: 'text', readonly: true, value: link });
        return W.win('Build',
          LB.u ? el('p', { class: 'hint', style: { marginTop: 0 } }, owner && owner.char ? `Built for ${owner.name}’s ${owner.char.nickname || W.cap(String(owner.char.reskin || owner.char.type).toLowerCase())} (Lv. ${owner.char.level}). ` : ownerErr ? ownerErr + ' ' : `Loading ${LB.u}… `,
            el('a', { href: '#items/loadout', onclick: () => { delete LB.u; delete LB.ch; owner = null; store(); } }, 'Build without a character')) : (ownerErr ? el('div', { class: 'warn' }, ownerErr) : null),
          el('div', { class: 'fields3' },
            el('label', {}, 'Combat level', W.numIn(LB.lvl, (v) => { LB.lvl = Math.max(1, Math.min(120, v)); store(); draw(); }, 1, 120)),
            el('label', {}, 'Unknown rolls use', W.sel(W.ROLL_MODES, String(LB.mode), (v) => { LB.mode = isNaN(+v) ? v : +v; store(); draw(); })),
            el('label', {}, 'Rank AP loan', W.sel([[0, 'None'], [2, 'VIP+ (+2)'], [4, 'HERO+ (+4)']], LB.loan, (v) => { LB.loan = +v; store(); draw(); }))),
          !piece('w') ? el('div', { class: 'fields3' }, el('label', {}, 'Class', W.sel([['', 'Pick a weapon or class'], ['archer', 'Archer'], ['warrior', 'Warrior'], ['mage', 'Mage'], ['assassin', 'Assassin'], ['shaman', 'Shaman']], LB.cls || '', (v) => { LB.cls = v || null; store(); draw(); }))) : null,
          el('div', { class: 'cap left' }, 'Name and library'),
          el('div', { class: 'libsave' },
            el('input', { type: 'text', value: LB.name || '', maxlength: 60, placeholder: 'Build name, e.g. Boltslinger raid build', 'aria-label': 'Build name',
              onchange: (e) => { LB.name = e.target.value.trim(); store(); box.value = shareLink(); } }),
            el('input', { type: 'text', value: (LB.tags || []).join(', '), maxlength: 120, placeholder: 'Your tags: raid, budget, lootrun…', 'aria-label': 'Tags',
              onchange: (e) => { LB.tags = [...new Set(e.target.value.split(',').map(t => t.trim()).filter(Boolean))].slice(0, 8); store(); } }),
            el('button', { onclick: (e) => saveToLibrary(e.target) }, LB.lib && W.builds.get(LB.lib) ? 'Update in library' : 'Save to library')),
          el('p', { class: 'hint' }, 'Class, archetype and main elements are tagged for you. ', el('a', { href: '#items/builds' }, 'Open your build library'), '.'),
          el('div', { class: 'cap left' }, 'Share this build'),
          el('div', { class: 'search' }, box, el('button', { onclick: (e) => W.copyShort(shareLink(), e.target, box) }, 'Copy link')),
          el('p', { class: 'hint' }, 'Copy link makes a short link that keeps every item, exact roll, powder, tome, skill point and ability.'),
          buildValue(),
          el('div', { class: 'btns' }, el('a', { class: 'btnlink', href: '#items/recommend' + (LB.u ? '?u=' + encodeURIComponent(LB.u) : '') }, 'Recommended build'),
            el('button', { class: 'danger', onclick: () => { if (confirm('Clear the whole build?')) { LB = blank(); owner = null; T = null; store(); draw(); } } }, 'Clear build')));
      }

      /* what the gear would cost on the trade market, looked up only when asked */
      let valueAsked = false;
      function buildValue() {
        const names = pieces().filter(p => p.item.g !== 'tome').map(p => p.item.n);   // tomes can't be traded
        const box = el('div', { class: 'pricetag' });
        if (!names.length) return box;
        const show = () => {
          valueAsked = true;
          box.replaceChildren(el('span', { class: 'hint' }, 'Checking the trade market…'));
          Promise.all(names.map(n => W.marketPrice(n))).then(ps => {
            const known = ps.filter(p => p > 0), total = known.reduce((a, b) => a + b, 0);
            box.replaceChildren(el('div', { class: 'ptop' }, el('span', {}, 'Build value'), W.emeraldTag(total)),
              el('small', {}, known.length === names.length ? 'Trade market averages for every piece of gear (tomes can’t be traded).' : `${names.length - known.length} of ${names.length} pieces haven’t sold recently and aren’t counted. Tomes can’t be traded.`));
          });
        };
        if (valueAsked) show(); else box.append(el('button', { class: 'mini', onclick: show }, 'Market value of this build'));
        return box;
      }

      /* item picker + exact roll viewer + powders */
      function itemPanel() {
        const k = sel, g = piece(k);
        if (!k) return null;
        const isTome = k[0] === 't';
        const types = isTome ? [eng.tomeSlots[+k.slice(1)][0]] : EQUIP.find(e => e[0] === k)[2];
        if (picking || !g) {
          const qq = pq.trim().toLowerCase(), c = cls();
          const list = (isTome ? tomes : items).filter(i => types.includes(i.t) && (!qq || i.n.toLowerCase().includes(qq)) && (!onlyUsable || i.l <= LB.lvl)
            && (k !== 'w' || !c || WEAPON_CLASS[i.t] === c || !LB.cls && !owner)).sort((a, b) => b.l - a.l || a.n.localeCompare(b.n)).slice(0, 80);
          const inp = el('input', { type: 'text', value: pq, placeholder: 'Search…', oninput: (e) => { pq = e.target.value; const box = root.querySelector('.gpick'); box.replaceWith(itemPanel()); const i = root.querySelector('.gpick input'); i.focus(); i.setSelectionRange(pq.length, pq.length); } });
          return el('div', { class: 'gpick' },
            el('div', { class: 'search' }, inp, g ? el('button', { onclick: () => { picking = false; draw(); } }, 'Cancel') : null),
            el('label', { class: 'check', style: { margin: '8px 0' } }, el('input', { type: 'checkbox', checked: onlyUsable, onchange: (e) => { onlyUsable = e.target.checked; draw(); } }), `Only items up to level ${LB.lvl}`),
            !isTome ? el('button', { class: 'mini craftbtn', onclick: () => startCraft(k, types) }, 'Craft one instead') : null,
            el('div', { class: 'pick' }, list.map(i => W.tip(el('button', { class: 'pickrow', onclick: () => { LB.s[k] = [i.n, null, null]; if (LB.c) delete LB.c[k]; picking = false; store(); draw(); } },
              el('span', { class: 'pico' }, W.art.item(i.ic)), el('span', { style: { color: W.tierColor(i.r), fontWeight: 700 } }, i.n), el('small', {}, 'Lv. ' + i.l)), () => W.itemCard(i)))));
        }
        if (g.item.crafted) return craftPanel(k, g);
        const it = g.item, rows = Object.entries(it.i || {});
        const setRoll = (key, v) => { const r = Object.assign({}, LB.s[k][1] || {}); r[key] = v; LB.s[k][1] = r; store(); draw(); };
        return el('div', { class: 'ipanel' },
          el('div', { class: 'ihead' }, el('div', { class: 'iicon' }, W.art.item(it.ic)),
            el('div', { class: 'ititle' }, el('div', { class: 'iname', style: { color: W.tierColor(it.r) } }, it.n), el('div', { class: 'isub' }, `${(W.TIERS[it.r] || ['Item'])[0]} ${W.cap(it.t.replace('_', ' '))} · Lv. ${it.l}`)),
            el('button', { class: 'mini', onclick: () => { picking = true; pq = ''; draw(); } }, 'Change'),
            el('button', { class: 'mini danger', onclick: () => { delete LB.s[k]; store(); draw(); } }, 'Remove')),
          rows.length ? rollTable(it, g.r, setRoll, () => { LB.s[k][1] = null; store(); draw(); }) : el('p', { class: 'hint' }, 'This item has no identifications to roll.'),
          !isTome && it.ps ? powderEditor(k, it, g.p || [], (v) => { LB.s[k][2] = v; }) : null);
      }

      /* ---------- crafted gear ---------- */
      let craftSlot = 0, craftQ = '';
      function startCraft(k, types) {
        const t = k === 'w' ? CLASS_WEAPON[cls()] || 'spear' : types[0];
        const rs = W.craftRecipes(recipes, t);
        const fits = rs.map((r, i) => [r, i]).filter(([r]) => r.l[0] <= LB.lvl).map(([, i]) => i);
        LB.c = LB.c || {}; LB.c[k] = { t, l: fits.length ? fits[fits.length - 1] : 0, m: [3, 3], g: Array(6).fill(null), as: 'normal' };
        delete LB.s[k]; picking = false; craftSlot = 0; craftQ = ''; store(); draw();
      }
      function craftPanel(k, g) {
        const def = LB.c[k], it = g.item, r = it.recipe, rs = W.craftRecipes(recipes, def.t);
        const set = (patch) => { Object.assign(def, patch); store(); draw(); };
        const slots = def.g.map(n => n && ingByName[n]);
        const qq = craftQ.trim().toLowerCase();
        const usable = ings.filter(x => x.sk.includes(r.s) && x.l <= r.l[1] && (!qq || x.n.toLowerCase().includes(qq) || Object.keys(x.i || {}).some(key => W.idInfo(key).name.toLowerCase().includes(qq))))
          .sort((a, b) => b.l - a.l).slice(0, 60);
        const search = el('input', { type: 'text', class: 'cingsearch', value: craftQ, placeholder: 'Ingredient name or bonus…', oninput: (e) => { craftQ = e.target.value; const box = root.querySelector('.ipanel.craft'); box.replaceWith(craftPanel(k, piece(k))); const i = root.querySelector('.ipanel.craft .cingsearch'); i.focus(); i.setSelectionRange(craftQ.length, craftQ.length); } });
        const b = it.b || {}, base = b.baseHealth ? `${b.baseHealth[0]}–${b.baseHealth[1]} health` : b.baseDamage ? `${b.baseDamage[0]}–${b.baseDamage[1]} damage · ${W.words(it.as)} attack speed` : 'No base stats';
        return el('div', { class: 'ipanel craft' },
          el('div', { class: 'ihead' }, el('div', { class: 'iicon' }, W.art.item(it.ic)),
            el('div', { class: 'ititle' }, el('div', { class: 'iname', style: { color: W.tierColor('crafted') } }, it.n), el('div', { class: 'isub' }, `${W.cap(r.s)} · Lv. ${r.l[0]}–${r.l[1]} · ${base}`)),
            el('button', { class: 'mini', onclick: () => { picking = true; pq = ''; draw(); } }, 'Change'),
            el('button', { class: 'mini danger', onclick: () => { delete LB.c[k]; store(); draw(); } }, 'Remove')),
          el('div', { class: 'cfields' },
            k === 'w' ? el('label', {}, 'Weapon', W.sel(['spear', 'dagger', 'bow', 'wand', 'relik'].map(t => [t, W.cap(t)]), def.t, (v) => set({ t: v, l: Math.min(def.l, W.craftRecipes(recipes, v).length - 1) }))) : null,
            el('label', {}, 'Level', W.sel(rs.map((x, i) => [i, `${x.l[0]}–${x.l[1]}`]), def.l, (v) => set({ l: +v }))),
            r.m.map((m, i) => el('label', {}, m[1], W.sel([[1, 'Tier 1'], [2, 'Tier 2'], [3, 'Tier 3']], def.m[i], (v) => { const mm = def.m.slice(); mm[i] = +v; set({ m: mm }); }))),
            it.g === 'weapon' ? el('label', {}, 'Attack speed', W.sel(W.CRAFT_SPEEDS, def.as, (v) => set({ as: v }))) : null),
          el('div', { class: 'ctable small' }, slots.map((x, i) => {
            const s = W.slot(x ? W.art.ing(x.ic) : el('span', { class: 'plus' }, '+'), { big: true, sel: i === craftSlot, onclick: () => { craftSlot = i; draw(); }, tip: x ? x.n : 'Empty: pick an ingredient below' });
            if (x) s.append(el('span', { class: 'eff ' + (it.eff[i] > 100 ? 'up' : it.eff[i] < 100 ? 'down' : '') }, it.eff[i] + '%'));
            return s;
          })),
          el('div', { class: 'btns', style: { marginTop: '8px' } },
            el('button', { class: 'mini', disabled: !def.g[craftSlot], onclick: () => { def.g[craftSlot] = null; store(); draw(); } }, 'Empty this slot'),
            el('button', { class: 'mini', onclick: () => { def.g = Array(6).fill(null); store(); draw(); } }, 'Clear all')),
          el('div', { class: 'search', style: { marginTop: '10px' } }, search),
          el('div', { class: 'pick cingpick' }, usable.map(x => el('button', { class: 'pickrow', onclick: () => { def.g[craftSlot] = x.n; const next = def.g.findIndex(n => !n); craftSlot = next < 0 ? craftSlot : next; store(); draw(); } },
            el('span', { class: 'pico' }, W.art.ing(x.ic)), el('span', { style: { color: W.ING_STARS[x.tr], fontWeight: 700 } }, x.n), el('small', {}, 'Lv. ' + x.l)))),
          Object.keys(it.q).length ? el('div', { class: 'cap left' }, 'Skill requirements') : null,
          Object.keys(it.q).length ? el('div', { class: 'kv' }, Object.entries(it.q).map(([s2, v]) => el('div', {}, el('span', {}, W.cap(s2)), el('b', {}, v)))) : null,
          Object.keys(it.i).length ? el('div', { class: 'cap left' }, 'Identifications') : null,
          Object.keys(it.i).length ? el('div', { class: 'idlist' }, Object.entries(it.i).map(([key, v]) => el('div', { class: 'il' }, el('span', { class: W.idGood(key, v) ? 'pos' : 'neg' }, W.fmtId(key, v)), el('span', { class: 'idn' }, W.idInfo(key).name)))) : null,
          it.ps ? powderEditor(k, it, def.p || [], (v) => { def.p = v; }) : null,
          el('p', { class: 'hint' }, 'Crafted gear uses the recipe, material tiers and ingredient placement like the crafting table. Identifications use the Unknown rolls setting.'));
      }

      function rollTable(it, rolls, setRoll, reset) {
        const quality = W.rollQuality(it, rolls || W.defaultRolls(it, LB.mode));
        /* some items (often untradable or quest ones) always roll the same values */
        const fixed = Object.values(it.i).every(v => !Array.isArray(v) || v[0] === v[1]);
        return el('div', { class: 'rolls' },
          el('div', { class: 'rollhead' }, el('b', {}, fixed ? 'Fixed identifications' : rolls ? 'Exact rolls' : `Rolls (${W.rollModeName(LB.mode)} until set)`),
            fixed ? null : el('span', { class: 'qual big', style: { '--q': quality } }, quality + '%'), rolls && !fixed ? el('button', { class: 'mini', onclick: reset }, 'Reset') : null),
          fixed ? el('p', { class: 'hint', style: { margin: '0 0 6px' } }, `${it.n} doesn’t roll: every copy has exactly these values, so the roll setting doesn’t change it.`) : null,
          Object.entries(it.i).map(([key, v]) => {
            const info = W.idInfo(key), range = Array.isArray(v) ? v : [v, v];
            const cur = rolls && rolls[key] != null ? rolls[key] : W.idValue({ item: it, r: null }, key, LB.mode);
            const fixed = range[0] === range[1];
            const pct = fixed ? 100 : Math.round((cur - range[0]) / (range[1] - range[0]) * 100);
            const stars = W.rollStars(range, cur);
            return el('div', { class: 'rollrow' },
              el('span', { class: 'rname' }, info.name),
              fixed ? el('b', { class: W.idGood(key, cur) ? 'pos' : 'neg' }, W.fmtId(key, cur))
                : el('input', { type: 'number', value: cur, step: 1, onchange: (e) => { const lo = Math.min(...range), hi = Math.max(...range); setRoll(key, Math.max(lo, Math.min(hi, Math.round(+e.target.value)))); } }),
              el('span', { class: 'rrange' }, fixed ? 'fixed' : `${range[0]}${info.unit} to ${range[1]}${info.unit}`),
              el('div', { class: 'rbar' }, el('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } })),
              el('span', { class: 'rstars' }, stars ? '★'.repeat(stars) : ''));
          }),
          el('p', { class: 'hint' }, 'Percent is how close each roll is to its best value. Stars are the in-game roll stars (★ 101%+, ★★ 125%+, ★★★ 130% of the base value). Type a number to set a roll yourself.'));
      }

      function powderEditor(k, it, pw, setPw) {
        const add = (e, t) => { if (pw.length >= it.ps) return; setPw(pw.concat([[e, t]])); store(); draw(); };
        let tier = 6;
        const tierSel = W.sel([1, 2, 3, 4, 5, 6, 7].map(t => [t, 'Tier ' + ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][t - 1]]), tier, (v) => { tier = +v; });
        return el('div', { class: 'powders' },
          el('div', { class: 'cap left' }, `Powders · ${pw.length}/${it.ps} slots`),
          el('div', { class: 'pwrow' }, Array.from({ length: it.ps }, (_, i) => pw[i]
            ? el('button', { class: 'pw', title: 'Remove', onclick: () => { setPw(pw.filter((_, j) => j !== i)); store(); draw(); } }, el('img', { src: `img/ui/powder-${pw[i][0]}.webp`, alt: '' }), el('span', {}, ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][pw[i][1] - 1]))
            : el('span', { class: 'pw empty' }))),
          pw.length < it.ps ? el('div', { class: 'pwadd' }, tierSel, ['earth', 'thunder', 'water', 'fire', 'air'].map(e =>
            el('button', { class: 'mini pwbtn', title: 'Add ' + e, onclick: () => add(e, +tierSel.value) }, el('img', { src: `img/ui/powder-${e}.webp`, alt: '' }), W.cap(e)))) : null);
      }

      /* Wynntils item strings -> gear slots or mastery tome slots. Tomes fill the first slot of their kind that is free
         (or not yet filled by this paste), in the game's slot order. Returns one result row per item. */
      function importItems(text) {
        const res = WynntilsDecode.decodeGearText(text, idKeys), usedTome = new Set();
        const rows = res.map(r => {
          if (!r.ok) return el('div', { class: 'warn' }, r.error);
          const it = byName[r.gear.name] || byName[r.gear.name.replace(/[^\x20-\x7e]/g, '').trim()];
          if (!it) return el('div', { class: 'warn' }, `“${r.gear.name}” isn’t in the item list yet.`);
          let slot;
          if (it.g === 'tome') {
            const fits = eng.tomeSlots.map(([type], i) => [type, 't' + i]).filter(([type, k]) => type === it.t && !usedTome.has(k));
            slot = (fits.find(([, k]) => !LB.s[k]) || fits[0] || [])[1];
            if (!slot) return el('div', { class: 'warn' }, `No free ${TOME_NAMES[it.t] || 'tome'} slot for ${it.n}.`);
            usedTome.add(slot);
            LB.s[slot] = [it.n, r.gear.ids, null];
          } else {
            slot = it.t === 'ring' ? (!LB.s.r1 || LB.s.r1[0] === it.n ? 'r1' : 'r2') : (EQUIP.find(s => s[2].includes(it.t)) || [])[0];
            if (!slot) return el('div', { class: 'warn' }, `${it.n} can’t go in a gear slot.`);
            LB.s[slot] = [it.n, r.gear.ids, r.gear.powders.length ? r.gear.powders : null];
            if (LB.c) delete LB.c[slot];
          }
          store();
          return el('div', { class: 'impRow' }, W.slot(W.art.item(it.ic)), el('div', {}, el('b', { style: { color: W.tierColor(it.r) } }, it.n), el('small', {}, `Added with ${Object.keys(r.gear.ids).length} exact rolls${r.gear.powders.length ? ' and ' + r.gear.powders.length + ' powders' : ''}.`)));
        });
        return { rows, any: res.some(r => r.ok) };
      }
      /* read Wynntils strings straight from the clipboard (the browser asks for permission the first time) */
      const pasteClipboard = (btn, out) => {
        const t = btn.textContent;
        if (!navigator.clipboard || !navigator.clipboard.readText) { btn.textContent = 'Clipboard not available here'; setTimeout(() => { btn.textContent = t; }, 2000); return; }
        navigator.clipboard.readText().then(text => {
          const { rows, any } = importItems(text);
          if (out) out.replaceChildren(...(rows.length ? rows : [el('div', { class: 'warn' }, 'No Wynntils item strings on the clipboard.')]));
          btn.textContent = !rows.length ? 'Nothing to import' : any ? 'Imported' : 'Couldn’t import';
          setTimeout(() => { btn.textContent = t; if (any) draw(); }, 900);
        }).catch(() => { btn.textContent = 'Clipboard blocked'; setTimeout(() => { btn.textContent = t; }, 2000); });
      };

      function pasteWin() {
        const ta = el('textarea', { rows: 3, placeholder: 'Paste Wynntils item strings here (gear or mastery tomes, one or several)…' });
        const out = el('div', { class: 'imp' });
        ta.addEventListener('input', () => {
          const { rows, any } = importItems(ta.value);
          out.replaceChildren(...rows);
          if (any) setTimeout(draw, 900);
        });
        return W.win('Paste from Wynntils', el('p', { class: 'hint', style: { marginTop: 0 } }, 'Share each piece you wear, and your mastery tomes, with Wynntils in-game and paste the strings here. Exact rolls and powders come along.'),
          ta, el('div', { class: 'btns', style: { marginTop: '8px' } }, el('button', { class: 'mini', onclick: (e) => pasteClipboard(e.target, out) }, 'Paste from clipboard')), out);
      }

      /* ---------- right column ---------- */
      function summary() {
        const res = compute(), ps = pieces();
        if (!ps.length) return null;
        const has = owner && owner.char && owner.char.skillPoints ? W.SK.map(s => owner.char.skillPoints[s === 'defence' ? 'defense' : s] || 0) : null;
        const scale = (n) => eng.spScale[Math.max(0, Math.min(150, Math.round(n)))] || 0;
        const effect = ['% damage (earth)', '% crit chance (thunder)', '% mana / water', '% less damage taken (fire)', '% dodge chance (air)'];
        const effVal = (i) => i === 3 ? scale(res.finalSP[i]) * 0.867 : i === 4 ? scale(res.finalSP[i]) * 0.951 : scale(res.finalSP[i]);
        const over = res.spTotal > res.spAvail;
        /* skill points: set each one freely (0-100, like in game), with steppers, "max" and requirement warnings */
        const left = res.spAvail - res.spTotal;
        const setPoints = (i, v) => { const s = W.SK[i]; v = Math.max(0, Math.min(100, Math.round(v))); LB.x[s] = v - res.sp.need[i]; if (!LB.x[s]) delete LB.x[s]; store(); draw(); };
        const spWin = W.win('Skill points',
          el('div', { class: 'spbar' },
            el('div', { class: 'spleft' + (over ? ' bad' : left === 0 ? ' full' : '') }, el('b', {}, over ? `${-left} over` : left), el('span', {}, over ? 'too many points' : 'points left')),
            el('div', { class: 'spmeter' }, el('i', { style: { width: Math.min(100, res.spTotal / Math.max(1, res.spAvail) * 100) + '%' } })),
            el('small', {}, `${res.spTotal} / ${res.spAvail} at level ${LB.lvl}`),
            el('button', { class: 'mini', onclick: () => { LB.x = {}; store(); draw(); } }, 'Reset to minimum')),
          el('div', { class: 'sptable free' },
            el('div', { class: 'sprow sphead' }, ['', 'Points', 'Needs', 'Gear', 'Total', 'Effect'].map(h => el('span', {}, h))),
            W.SK.map((s, i) => el('div', { class: 'sprow' + (res.short[i] ? ' short' : '') },
              el('b', { class: 'elname', style: { color: W.ELEM[W.SK_ELEM[s]] } }, W.cap(s)),
              el('div', { class: 'spedit' },
                el('button', { class: 'mini', 'aria-label': 'Less ' + s, onclick: (e) => setPoints(i, res.assigned[i] - (e.shiftKey ? 5 : 1)) }, '−'),
                W.numIn(res.assigned[i], (v) => setPoints(i, v), 0, 100),
                el('button', { class: 'mini', 'aria-label': 'More ' + s, onclick: (e) => setPoints(i, res.assigned[i] + (e.shiftKey ? 5 : 1)) }, '+'),
                el('button', { class: 'mini', title: 'Put every point that is left into ' + W.cap(s), disabled: left <= 0 || res.assigned[i] >= 100, onclick: () => setPoints(i, res.assigned[i] + left) }, 'Max')),
              el('span', { class: 'spneed' }, res.sp.need[i] || '—', has ? el('small', { class: has[i] >= res.assigned[i] ? 'up' : 'down' }, `has ${has[i]}`) : null),
              el('span', {}, (res.sp.bonus[i] > 0 ? '+' : '') + res.sp.bonus[i]),
              el('b', {}, res.finalSP[i]),
              el('small', {}, W.num(effVal(i), 1) + effect[i])))),
          res.short.some(x => x) ? el('div', { class: 'warn' }, 'Below what your gear needs: ' + W.SK.filter((_, i) => res.short[i]).map((s, i2) => `${W.cap(s)} (${res.short[W.SK.indexOf(s)]} short)`).join(', ') + '. Those items won’t work until you add the points back.') : null,
          over ? el('div', { class: 'warn' }, `That’s ${-left} more than level ${LB.lvl} gives, so the build can’t be worn yet.`) : null,
          el('p', { class: 'hint' }, 'Type any amount from 0 to 100, or use − / + (Shift for 5 at a time). Max puts all your spare points into one skill. Needs is the least your gear asks for.'));

        const defWin = W.win('Health and defence',
          el('div', { class: 'bigstats' },
            el('div', {}, el('b', {}, fmt(res.hp)), el('span', {}, 'Health')),
            el('div', {}, el('b', {}, fmt(res.ehp)), el('span', {}, 'Effective HP')),
            el('div', {}, el('b', {}, fmt(res.ehpAgi)), el('span', {}, 'EHP with dodge'))),
          el('div', { class: 'kv', style: { marginTop: '12px' } },
            W.ELEMS.map(e => el('div', {}, el('span', { class: 'elname', style: { color: W.ELEM[e] } }, W.cap(e) + ' defence'), el('b', { class: res.elemDef[e] < 0 ? 'down' : '' }, res.elemDef[e]))),
            el('div', {}, el('span', {}, 'Damage reduction (Defence)'), el('b', {}, W.num(res.defPct, 1) + '%')),
            el('div', {}, el('span', {}, 'Dodge chance (Agility)'), el('b', {}, W.num(res.agiPct, 1) + '%')),
            el('div', {}, el('span', {}, 'Health regen'), el('b', {}, res.hpRegen + ' /4s')),
            el('div', {}, el('span', {}, 'Life steal'), el('b', {}, res.lifeSteal + ' /3s'))));

        const spells = T && T.cls === cls() ? Object.entries(T.abilities).filter(([, a]) => /node(Archer|Warrior|Mage|Assassin|Shaman)/.test(JSON.stringify(a.icon))).map(([id, a]) => { const base = { id, ...W.parseSpell(a), on: LB.t.includes(id) }; return base.on ? W.treeSpell(base, id, T, LB.t, LB.stacks || {}) : base; }) : [];
        const dmgWin = res.melee ? W.win('Damage (estimate)',
          el('div', { class: 'bigstats' },
            el('div', {}, el('b', {}, fmt(res.melee.dps)), el('span', {}, 'Main attack DPS')),
            el('div', {}, el('b', {}, fmt(res.melee.avg)), el('span', {}, 'Per hit (avg)')),
            el('div', {}, el('b', {}, W.num(res.melee.critChance * 100, 1) + '%'), el('span', {}, 'Crit chance'))),
          el('div', { class: 'kv', style: { marginTop: '12px' } },
            el('div', {}, el('span', {}, 'Attack speed'), el('b', {}, `${W.words(res.melee.speed)} · ${res.melee.hits} hits/s`)),
            el('div', {}, el('span', {}, 'Hit range'), el('b', {}, `${fmt(res.melee.lo)} – ${fmt(res.melee.hi)}`)),
            el('div', {}, el('span', {}, 'Weapon base DPS'), el('b', {}, fmt(res.melee.baseDps)))),
          el('div', { class: 'elbars' }, Object.entries(res.melee.per).map(([e, [a, b]]) => el('div', { class: 'brow2' }, el('span', { class: 'elname', style: { color: ELEM_COL[e] } }, W.cap(e)),
            el('div', { class: 'cbar' }, el('i', { style: { width: ((a + b) / 2) / res.melee.avg * 100 + '%', background: ELEM_COL[e] } }), el('b', { style: ['air', 'thunder', 'water'].includes(e) && (a + b) / 2 / res.melee.avg > 0.3 ? { color: '#17202a', textShadow: 'none' } : null }, `${fmt(a)}–${fmt(b)}`))))),
          spells.length ? el('div', { class: 'cap left' }, 'Spells') : null,
          spells.sort((x, y) => (x.slot || 9) - (y.slot || 9)).map(sp => {
            const cost = sp.cost != null && sp.slot ? res.spellCost(sp.slot, sp.cost) : sp.cost;
            const hit = sp.total ? res.melee.spell(Object.keys(sp.parts).length ? sp.parts : { neutral: sp.total }) : null;
            return el('div', { class: 'spell' + (sp.on ? '' : ' off') },
              el('div', {}, el('b', {}, sp.name), el('small', {}, `${sp.combo}${sp.on ? '' : ' · not unlocked'}`),
                sp.applied && sp.applied.length ? el('small', { class: 'spup' }, 'With ' + sp.applied.join(', ')) : null,
                /* conditional tree bonuses (Feedback Loop): say how many stacks you usually have */
                (sp.cond || []).map(c => el('label', { class: 'spstack', title: `${c.name}: ${c.what}, up to ${c.max}` }, c.name,
                  W.numIn(c.n, (v) => { LB.stacks = Object.assign({}, LB.stacks, { [c.name]: Math.max(0, Math.min(c.max, v)) }); store(); draw(); }, 0, c.max), el('small', {}, `/ ${c.max} stacks`)))),
              el('div', { class: 'sv' }, el('b', {}, cost != null ? cost : '—'), el('small', {}, 'mana')),
              el('div', { class: 'sv' }, el('b', {}, !hit ? '—' : sp.hits > 1 ? fmt(hit.expected) : ''), el('small', {}, !hit ? 'no damage' : sp.hits > 1 ? (sp.per || 'per hit') : 'single hit')),
              el('div', { class: 'sv total' }, el('b', {}, hit ? fmt(hit.expected * sp.hits) : '—'), el('small', {}, !hit ? '' : sp.hits > 1 ? `per cast · ${sp.hits} ${sp.unit}` : 'per cast')));
          }),
          el('p', { class: 'hint' }, 'Worked out the way WynnBuilder models the game. Unlocked tree upgrades that change a spell’s damage, mana cost or arrow/hit count are included (listed under each spell), and element masteries add their damage. Bonuses that stack in a fight (like Feedback Loop) count the stacks you set. “Per cast” assumes every arrow or hit lands on one target; crits are averaged in.')) :
          W.win('Damage', el('p', { class: 'empty' }, 'Add a weapon to see damage.'));

        /* Mana sustain: natural regen (wiki: 5 mana/s, editable) + Mana Regen per 5s, plus Mana Steal per 3s while your attacks land */
        const natural = LB.regen != null ? LB.regen : 5;
        const idle = natural + res.manaRegen / 5, fighting = idle + Math.max(0, res.manaSteal) / 3;
        const dmgSpells = spells.filter(sp => sp.cost && sp.total && sp.slot).map(sp => {
          const cost = res.spellCost(sp.slot, sp.cost);
          const hit = res.melee ? res.melee.spell(Object.keys(sp.parts).length ? sp.parts : { neutral: sp.total }).expected * sp.hits : 0;
          return { ...sp, cost, perMana: hit / cost, idle: idle * 60 / cost, fight: fighting * 60 / cost, dry: cost > fighting ? res.mana / (cost - fighting) : Infinity };
        }).sort((x, y) => y.perMana - x.perMana);
        const manaWin = W.win('Mana and sustain',
          el('div', { class: 'bigstats', style: { marginTop: 0 } },
            el('div', {}, el('b', {}, res.mana), el('span', {}, 'Max mana')),
            el('div', {}, el('b', {}, W.num(idle, 1)), el('span', {}, 'Mana / s idle')),
            el('div', {}, el('b', {}, W.num(fighting, 1)), el('span', {}, 'Mana / s fighting'))),
          el('div', { class: 'kv', style: { marginTop: '12px' } },
            el('div', {}, el('span', {}, 'Mana regen'), el('b', {}, res.manaRegen + ' /5s')),
            el('div', {}, el('span', {}, 'Mana steal'), el('b', {}, res.manaSteal + ' /3s')),
            el('div', {}, el('span', {}, 'Spell cost from Intelligence'), el('b', {}, '−' + W.num(res.intCost * 100, 1) + '%')),
            el('div', {}, el('span', {}, 'Natural regen (mana/s)'), W.numIn(natural, (v) => { LB.regen = Math.max(0, v); store(); draw(); }, 0, 50)),
            el('div', {}, el('span', {}, 'Walk speed'), el('b', {}, (res.walk > 0 ? '+' : '') + res.walk + '%'))),
          dmgSpells.length ? el('div', { class: 'cap left' }, 'Spell spam') : null,
          dmgSpells.length ? el('div', { class: 'sustain' },
            el('div', { class: 'surow suhead' }, ['Spell', 'Mana', 'Casts/min', 'Runs dry'].map(h => el('span', {}, h))),
            dmgSpells.map((sp, i) => el('div', { class: 'surow' + (i === 0 ? ' best' : '') },
              el('span', {}, el('b', {}, sp.name), i === 0 ? el('small', {}, 'most damage per mana') : null),
              el('span', {}, sp.cost),
              el('span', {}, `${W.num(sp.fight, 0)}`, el('small', {}, ` (${W.num(sp.idle, 0)} idle)`)),
              el('span', { class: isFinite(sp.dry) ? '' : 'up' }, isFinite(sp.dry) ? W.num(sp.dry, 0) + 's' : 'Never')))) : null,
          el('p', { class: 'hint' }, 'Casts per minute you can keep up forever. “Runs dry” is how long a full mana bar lasts casting that spell once a second while your attacks land. Natural regen is the wiki’s 5 mana/s; change it if the game differs.'));

        const idWin = W.win('Identifications', el('div', { class: 'idlist' }, Object.entries(res.ids).filter(([, v]) => v).sort((a, b) => W.idInfo(a[0]).name.localeCompare(W.idInfo(b[0]).name)).map(([k, v]) =>
          el('div', { class: 'il' }, el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v)), el('span', { class: 'idn' }, W.idInfo(k).name)))));
        /* item sets being worn, and what their bonus adds (already counted in every number on this page) */
        const majorName = (m) => m.toLowerCase().split('_').map(W.cap).join(' ');
        const setWin = res.sets.length ? W.win('Set bonuses', el('div', { class: 'setlist' }, res.sets.map(s => el('div', { class: 'setrow' + (Object.keys(s.bonus).length || s.major.length ? '' : ' none') },
          el('div', { class: 'sethead' }, el('b', {}, s.name + ' Set'), el('span', { class: 'setcount' }, `${s.count}/${s.of} pieces`)),
          Object.keys(s.bonus).length || s.major.length
            ? el('div', { class: 'idlist' }, Object.entries(s.bonus).map(([k, v]) => el('div', { class: 'il' }, el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v)), el('span', { class: 'idn' }, W.idInfo(k).name))),
              s.major.map(m => el('div', { class: 'il' }, el('span', { class: 'pos' }, 'Major ID'), el('span', { class: 'idn' }, majorName(m)))))
            : el('small', { class: 'hint' }, `No bonus yet: the first one comes at ${s.next} pieces.`),
          s.next && (Object.keys(s.bonus).length || s.major.length) ? el('small', { class: 'hint' }, `A bigger bonus comes at ${s.next} pieces.`) : null,
          el('small', { class: 'setparts' }, 'Pieces: ' + s.parts.join(', '))))),
          el('p', { class: 'hint' }, 'Set bonuses are included in health, defence, damage, mana and skill points. Their skill points aren’t used to meet the gear’s requirements here, so the points this page asks for are enough without the set.')) : null;
        return { res, spWin, defWin, dmgWin, manaWin, idWin, setWin, fighting, best: dmgSpells[0] };
      }

      /* ---------- upgrade finder ---------- */
      /* Try every item that fits each slot, keep the swaps that are wearable (skill points still add up) and raise the
         chosen number most, then look up their trade market prices to show what each gain costs. */
      const UP = { goal: 'dps', busy: false, res: null, done: 0, total: 0, sort: 'gain', budget: '', key: '' };
      function upgradesWin() {
        const sum = summary();
        if (!sum || !piece('w')) return W.win('Upgrades', el('p', { class: 'empty' }, 'Put a weapon and some gear on first.'));
        const bp = sum.best ? (Object.keys(sum.best.parts).length ? sum.best.parts : { neutral: sum.best.total }) : null;
        if (!UP.picked) UP.goal = bp ? 'spell' : 'dps';   // spell builds care about their spell, until you choose
        const GOALS = {
          dps: ['Main attack DPS', (r) => r.melee ? r.melee.dps : 0],
          spell: [sum.best ? `${sum.best.name} damage` : 'Best spell damage', (r) => r.melee && bp ? r.melee.spell(bp).expected * sum.best.hits : 0],
          ehp: ['Effective HP', (r) => r.ehpAgi],
          both: ['Damage and EHP together', (r) => (r.melee ? r.melee.dps : 0) * r.ehpAgi],
        };
        const metric = GOALS[UP.goal][1], cur = metric(sum.res);
        const stateKey = UP.goal + '|' + JSON.stringify(LB.s) + '|' + JSON.stringify(LB.c || {}) + LB.lvl + LB.mode;
        if (UP.key !== stateKey && !UP.busy) UP.res = null;

        const run = () => {
          UP.busy = true; UP.res = null; UP.key = stateKey; UP.done = 0;
          const base = pieces(), c = cls(), treeB = W.treeBonuses(T && T.cls === c ? T : null, LB.t);
          const jobs = [];
          EQUIP.forEach(([k, , types]) => {
            const now = piece(k);
            items.filter(i => types.includes(i.t) && i.l <= LB.lvl && (!now || i.n !== now.item.n) && (k !== 'w' || !c || WEAPON_CLASS[i.t] === c))
              .forEach(i => jobs.push([k, i, now]));
          });
          UP.total = jobs.length;
          const found = [];
          const step = () => {
            if (!root.isConnected || UP.key !== stateKey) { UP.busy = false; return; }
            const end = Math.min(jobs.length, UP.done + 60);
            for (; UP.done < end; UP.done++) {
              const [k, i, now] = jobs[UP.done];
              const p = { key: k, item: i, r: null, p: now && now.p && i.ps ? now.p.slice(0, i.ps) : null };
              const r = W.computeBuild(base.filter(x => x.key !== k).concat(p), { mode: LB.mode, level: LB.lvl, extra: LB.x, tree: treeB }, eng);
              if (r.short.some(x => x) || r.spTotal > r.spAvail) continue;   // couldn't wear it
              const v = metric(r);
              if (v > cur * 1.005) found.push({ k, i, gain: v / (cur || 1) - 1 });
            }
            const bar = root.querySelector('.upbar i'); if (bar) bar.style.width = (UP.done / UP.total * 100) + '%';
            if (UP.done < jobs.length) return setTimeout(step, 0);
            /* best few per slot; the same ring for both ring slots counts once */
            const seen = new Set(), perSlot = {};
            UP.res = found.sort((a, b) => b.gain - a.gain).filter(f => {
              const id = (f.k[0] === 'r' ? 'r' : f.k) + f.i.n; if (seen.has(id)) return false; seen.add(id);
              perSlot[f.k] = (perSlot[f.k] || 0) + 1; return perSlot[f.k] <= 3;
            }).slice(0, 18);
            UP.busy = false; draw();
          };
          draw(); setTimeout(step, 0);
        };

        const slotName = (k) => (EQUIP.find(e => e[0] === k) || [0, k])[1];
        let body;
        if (UP.busy) body = el('div', {}, el('p', { class: 'empty busy' }, `Trying ${UP.total.toLocaleString()} items…`), el('div', { class: 'upbar' }, el('i', { style: { width: (UP.done / Math.max(1, UP.total) * 100) + '%' } })));
        else if (!UP.res) body = el('p', { class: 'hint' }, 'Finds single-item swaps that raise your chosen number while every piece can still be worn, then checks their price on the trade market.');
        else if (!UP.res.length) body = el('p', { class: 'empty' }, 'No single item beats your current gear on that. Try another goal.');
        else {
          const budget = W.parseEmeralds && W.parseEmeralds(UP.budget);
          const list = el('div', { class: 'uplist' });
          const rows = UP.res.map(f => {
            const price = el('span', { class: 'upprice' }, '…');
            const row = el('div', { class: 'uprow' },
              el('span', { class: 'islot', style: { '--rc': W.tierColor(f.i.r) } }, W.art.item(f.i.ic)),
              el('div', { class: 'upname' }, W.tip(el('b', { style: { color: f.i.r === 'mythic' ? '#cf5ce8' : W.tierColor(f.i.r) } }, f.i.n), () => W.itemCard(f.i)),
                el('small', {}, `${slotName(f.k)}${piece(f.k) ? ' · instead of ' + piece(f.k).item.n : ''}`)),
              el('b', { class: 'upgain' }, '+' + W.num(f.gain * 100, 1) + '%'),
              price,
              el('button', { class: 'mini', onclick: () => { LB.s[f.k] = [f.i.n, null, f.k === 'w' || f.i.ps ? ((piece(f.k) || {}).p || []).slice(0, f.i.ps || 0) : null]; if (LB.c) delete LB.c[f.k]; store(); draw(); } }, 'Use'));
            row._f = f;
            W.marketPrice(f.i.n).then(p => {
              f.price = p; price.replaceChildren(p ? W.emeraldTag(p, 'span') : el('small', {}, 'no recent sales'));
              if (budget && (!p || p > budget)) row.classList.add('over');
              if (UP.sort === 'value') order();
            });
            return row;
          });
          const order = () => list.replaceChildren(...rows.slice().sort((a, b) => UP.sort === 'value'
            ? ((b._f.price ? b._f.gain / b._f.price : -1) - (a._f.price ? a._f.gain / a._f.price : -1)) : b._f.gain - a._f.gain));
          order();
          body = el('div', {}, list, el('p', { class: 'hint' }, 'Gains use the same roll setting as the rest of the page. Prices are trade market averages; items with no recent sales may be untradable or rare.'));
        }
        return W.win('Upgrades',
          el('div', { class: 'uptools' },
            el('label', {}, 'Improve', W.sel(Object.entries(GOALS).map(([k, [n]]) => [k, n]), UP.goal, (v) => { UP.goal = v; UP.picked = true; UP.res = null; draw(); })),
            el('label', {}, 'Budget', el('input', { type: 'text', value: UP.budget, placeholder: 'any, or e.g. 5 stx', onchange: (e) => { UP.budget = e.target.value; draw(); } })),
            el('label', {}, 'Sort', W.sel([['gain', 'Biggest gain'], ['value', 'Most gain per emerald']], UP.sort, (v) => { UP.sort = v; draw(); })),
            el('button', { onclick: run, disabled: UP.busy }, UP.res ? 'Search again' : 'Find upgrades')),
          body);
      }

      function treeWin() {
        const c = cls();
        if (!c) return W.win('Ability tree', el('p', { class: 'empty' }, 'Pick a weapon (or a class) to plan the ability tree.'));
        return W.win(`Ability tree · ${W.cap(c)}`, W.atree({ cls: c, level: LB.lvl, selected: LB.t, editable: true, loan: LB.loan,
          onChange: (ids) => { LB.t = ids; store(); const k = root.querySelector('.lo-kpi'); if (k) k.replaceWith(kpis(summary())); const b = root.querySelector('.lo-build'); if (b) b.replaceWith(Object.assign(buildWin(), { className: 'win lo-build' })); } }));
      }

      /* ---------- inventory layout ---------- */
      let tab = 'stats';
      /* empty slots show a faded silhouette of what goes there, like the game's empty inventory slots */
      const GHOST = { h: 'helmet.pale_iron', c: 'chestplate.pale_iron', l: 'leggings.pale_iron', b: 'boots.pale_iron', r1: 'ring.basicIron', r2: 'ring.basicIron',
        br: 'bracelet.basicIron', n: 'necklace.basicIron', w: 'bow.basicWood', armour_tome: 'tome.armour', weapon_tome: 'tome.weapon', marathon_tome: 'tome.movement',
        expertise_tome: 'tome.utility', mysticism_tome: 'tome.mana', lootrun_tome: 'tome.lootrun', guild_tome: 'tome.guild' };
      const TAB_LIST = [['stats', 'Stats'], ['damage', 'Damage'], ['mana', 'Mana'], ['sp', 'Skill points'], ['tree', 'Ability tree'], ['upgrades', 'Upgrades']];

      /* one square slot: rarity-coloured frame, the item, powder pips, roll quality when exact */
      function invSlot(k, label, big) {
        const g = piece(k);
        const q = g && g.r ? W.rollQuality(g.item, g.r) : null;
        const node = el('button', { class: 'islot' + (big ? ' big' : '') + (sel === k ? ' on' : '') + (g ? '' : ' empty'), style: g ? { '--rc': W.tierColor(g.item.r) } : null,
          'aria-label': g ? `${label}: ${g.item.n}` : `${label}: empty`, onclick: () => { sel = k; picking = !g; pq = ''; draw(); } },
          g ? W.art.item(g.item.ic) : el('img', { class: 'ighost', src: `img/items/${k === 'w' ? (CLASS_WEAPON[cls()] || 'bow') + '.basicWood' : GHOST[k] || GHOST[eng.tomeSlots[+k.slice(1)] && eng.tomeSlots[+k.slice(1)][0]] || 'tome.utility'}.webp`, alt: '' }),
          g && g.p && g.p.length ? el('span', { class: 'ipips' }, g.p.map(([e]) => el('i', { class: 'pe-' + e }))) : null,
          q != null ? el('span', { class: 'iq' }, q + '%') : null);
        return W.tip(node, () => g ? W.itemCard(g.item) : el('div', {}, el('b', {}, label), el('div', { class: 'tt-sub' }, 'Empty: click to pick an item')));
      }

      function inventory() {
        const who = owner && owner.char ? `${owner.name} · ${owner.char.nickname || W.cap(String(owner.char.reskin || owner.char.type).toLowerCase())}` : 'Custom build';
        const w = piece('w');
        const body = owner && owner.uuid ? `https://mc-heads.net/body/${owner.uuid}/250` : 'https://mc-heads.net/body/MHF_Steve/250';
        const tomesOn = eng.tomeSlots.filter((_, i) => LB.s['t' + i]).length;
        return el('section', { class: 'inv' },
          el('div', { class: 'invhead' }, el('b', {}, who), el('span', {}, `Lv. ${LB.lvl}${cls() ? ' · ' + W.cap(cls()) : ''}`)),
          el('div', { class: 'invdoll' },
            el('div', { class: 'invcol' }, EQUIP.slice(0, 4).map(([k, label]) => invSlot(k, label))),
            el('div', { class: 'invbody' }, el('img', { src: body, alt: '' })),
            el('div', { class: 'invcol' }, EQUIP.slice(4, 8).map(([k, label]) => invSlot(k, label)))),
          el('div', { class: 'invweap' }, invSlot('w', 'Weapon', true),
            w ? el('div', {}, el('b', { style: { color: w.item.r === 'mythic' ? '#cf5ce8' : W.tierColor(w.item.r) } }, w.item.n),
              el('small', {}, [w.item.dps ? Math.round(w.item.dps) + ' DPS' : null, w.item.as ? W.words(w.item.as) : null, w.item.ps ? `${(w.p || []).length}/${w.item.ps} powders` : null].filter(Boolean).join(' · ')))
              : el('div', {}, el('b', {}, 'No weapon'), el('small', {}, 'Pick one to set the class'))),
          el('div', { class: 'invlab' }, `Mastery tomes · ${tomesOn}/14`,
            el('span', { class: 'tomebtns' },
              el('button', { class: 'mini', title: 'Import mastery tomes from Wynntils strings on your clipboard', onclick: (e) => pasteClipboard(e.target, null) }, 'Paste tomes'),
              tomesOn ? el('button', { class: 'mini danger', title: 'Take every mastery tome out', onclick: () => { eng.tomeSlots.forEach((_, i) => { delete LB.s['t' + i]; }); store(); draw(); } }, 'Reset') : null)),
          el('div', { class: 'invhot' }, eng.tomeSlots.map(([type, lvl], i) => invSlot('t' + i, `${TOME_NAMES[type]} · Lv. ${lvl}`))));
      }

      function editor() {
        if (!sel) return W.win('Selected slot', el('p', { class: 'empty' }, 'Click a slot to pick an item, set exact rolls and add powders.'));
        const label = sel[0] === 't' ? `${TOME_NAMES[eng.tomeSlots[+sel.slice(1)][0]]} · Lv. ${eng.tomeSlots[+sel.slice(1)][1]}` : (EQUIP.find(e => e[0] === sel) || [0, 'Slot'])[1];
        return W.win(label, itemPanel());
      }

      function kpis(sum) {
        const r = sum && sum.res;
        const tile = (v, label, cl) => el('div', { class: cl || '' }, el('b', {}, v), el('span', {}, label));
        const best = sum && sum.best && r.melee ? r.melee.spell(Object.keys(sum.best.parts).length ? sum.best.parts : { neutral: sum.best.total }).expected * sum.best.hits : null;
        return el('div', { class: 'kpi lo-kpi' },
          tile(r ? fmt(r.hp) : '—', 'Health'), tile(r ? fmt(r.ehpAgi) : '—', 'EHP with dodge'),
          tile(r && r.melee ? fmt(r.melee.dps) : '—', 'Main attack DPS'),
          tile(best != null ? fmt(best) : '—', sum && sum.best ? sum.best.name : 'Best spell'),
          tile(sum ? W.num(sum.fighting, 1) : '—', 'Mana / s'),
          tile(r ? `${r.spTotal}/${r.spAvail}` : '—', 'Skill points', r && r.spTotal > r.spAvail ? 'bad' : ''));
      }

      function side() {
        const sum = summary();
        const body = tab === 'tree' ? treeWin() : tab === 'upgrades' ? upgradesWin()
          : !sum ? W.win('Nothing to show yet', el('p', { class: 'empty' }, 'Add some gear to see the numbers.'))
          : tab === 'damage' ? sum.dmgWin : tab === 'mana' ? sum.manaWin : tab === 'sp' ? sum.spWin
          : el('div', { class: 'stack' }, sum.setWin, sum.defWin, sum.idWin);
        return el('div', { class: 'stack lo-side' },
          kpis(sum),
          el('div', { class: 'lotabs', role: 'tablist' }, TAB_LIST.map(([k, label]) => el('button', { class: 'lotab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k,
            onclick: () => { tab = k; draw(); } }, label))),
          body);
      }

      const draw = () => {
        ensureTree();
        const b = buildWin(); b.classList.add('lo-build');
        const y = scrollY;
        root.replaceChildren(el('div', { class: 'lo-inv' },
          el('div', { class: 'stack' }, inventory(), editor(), pasteWin()),
          el('div', { class: 'stack' }, side(), b)));
        scrollTo(0, y);   // redraws keep your place
      };
      draw();
    });
  };

  /* Roll helpers shared with other pages */
  W.ROLL_MODES = [['max', 'Best roll'], ['0.8', '80% roll'], ['0.75', '75% roll'], ['0.7', '70% roll'], ['avg', 'Average roll'], ['min', 'Worst roll']];
  W.rollModeName = (m) => typeof m === 'number' ? Math.round(m * 100) + '% roll' : ({ max: 'best', avg: 'average', min: 'worst' })[m] || 'best';
  W.defaultRolls = (it, mode) => Object.fromEntries(Object.keys(it.i || {}).map(k => [k, W.idValue({ item: it, r: null }, k, mode)]));
  W.rollQuality = (it, rolls) => {
    const parts = Object.entries(it.i || {}).filter(([, v]) => Array.isArray(v) && v[0] !== v[1]).map(([k, v]) => {
      const cur = rolls && rolls[k] != null ? rolls[k] : v[1];
      return (cur - v[0]) / (v[1] - v[0]);
    });
    return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100) : 100;
  };
  W.rollStars = (range, cur) => {
    if (!(range[1] > 0) || range[1] <= range[0]) return 0;
    const base = range[1] / 1.3, ratio = cur / base;
    return ratio >= 1.3 - 1e-9 ? 3 : ratio >= 1.25 ? 2 : ratio >= 1.01 ? 1 : 0;
  };
})(window.W);
