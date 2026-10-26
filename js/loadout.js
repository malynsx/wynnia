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
     or name it; damage lines marked "for X" or "per Y" only apply to the matching spell. */
  W.treeSpell = (sp, spellId, T, selected) => {
    const parts = Object.assign({}, sp.parts);
    let streams = 1, perStream = sp.perStream, extraHits = 0, costAdj = 0;
    const applied = [];
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
          let sum = 0;
          for (const m of line.matchAll(/\(([✣✤✦❉✹❋])\s*\w+:\s*([+-]?[\d.]+)%\)/g)) { const e = GLYPH_EL[m[1]]; parts[e] = (parts[e] || 0) + +m[2]; sum += +m[2]; }
          if (Math.abs(sum - +d[1]) > 0.01) parts.neutral = (parts.neutral || 0) + (+d[1] - sum);   // the listed parts don't always add up to the total
          used = true;
        }
        const c = /Mana Cost:\s*([+-]\d+)/.exec(line);
        if (c) { costAdj += +c[1]; used = true; }
      });
      /* counts, unless conditional ("Hitting 1 flint arrow ... (Max 40)") */
      if (!/\(Max \d+\)/.test(txt)) {
        const st = /\+(\d+) (?:extra |additional )?streams?/i.exec(txt), ps = /\+(\d+) (?:extra |additional )?arrows? per stream/i.exec(txt), h = /\+(\d+) (?:extra |additional )?hits?\b/i.exec(txt);
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
    return Object.assign({}, sp, { parts, total: sp.total != null ? total : null, cost: sp.cost != null ? Math.max(1, sp.cost + costAdj) : null, hits, unit, applied });
  };

  W.pages['items/loadout'] = function (root, q) {
    let picking = null, sel = 'w', pq = '', onlyUsable = true, owner = null, ownerErr = null, T = null;
    W.withData(root, ['items', 'tomes', 'idkeys', 'itemids', 'engine'], (items, tomes, idKeys, itemIds, eng) => {
      const byName = Object.fromEntries(items.concat(tomes).map(i => [i.n, i]));
      const ctx = { ids: itemIds, names: Object.fromEntries(Object.entries(itemIds).map(([n, i]) => [i, n])), keyName: idKeys, keyNum: Object.fromEntries(Object.entries(idKeys).map(([n, k]) => [k, +n])) };

      /* links: new short codes, old JSON links still open */
      if (q && q.get('b')) {
        const b = q.get('b');
        try {
          if (b.startsWith('ey')) { const o = JSON.parse(decodeURIComponent(escape(atob(b.replace(/-/g, '+').replace(/_/g, '/'))))); LB = Object.assign(blank(), { s: o.s || {} }); }
          else { const d = W.decodeBuild(b, ctx); LB = Object.assign(blank(), { lvl: d.lvl, mode: d.mode, s: d.s, x: d.x, t: [], tIdx: d.tIdx }); }
          if (q.get('n')) LB.name = q.get('n').slice(0, 60);
          /* opened from the library: keep its tags and notes, and update that entry when saved */
          const lib = q.get('lib') && W.builds.get(q.get('lib'));
          if (lib) Object.assign(LB, { lib: lib.id, tags: lib.tags || [], notes: lib.notes || '' });
          store();
          history.replaceState(null, '', '#items/loadout');   // later edits shouldn't be undone by a reload
        } catch (e) { ownerErr = 'That build link is broken: ' + e.message; }
      }
      if (q && q.get('u')) { LB.u = q.get('u'); LB.ch = q.get('c') || null; LB.fromChar = true; store(); history.replaceState(null, '', '#items/loadout'); }

      const piece = (k) => LB.s[k] && byName[LB.s[k][0]] ? { key: k, item: byName[LB.s[k][0]], r: LB.s[k][1], p: LB.s[k][2] } : null;
      const pieces = () => W.BUILD_SLOTS.map(piece).filter(Boolean);
      const cls = () => { const w = piece('w'); return w ? WEAPON_CLASS[w.item.t] : (owner && owner.char ? String(owner.char.type).toLowerCase() : LB.cls || null); };
      const compute = () => W.computeBuild(pieces(), { mode: LB.mode, level: LB.lvl, extra: LB.x }, eng);

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
      const shareLink = () => W.buildLink({ code: code(), name: LB.name }, true);
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
        const e = W.builds.save({ id: LB.lib && W.builds.get(LB.lib) ? LB.lib : undefined, name: LB.name || '', tags: LB.tags || [], notes: LB.notes || '', code: code(), snap: snapshot() });
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
            el('div', { class: 'pick' }, list.map(i => W.tip(el('button', { class: 'pickrow', onclick: () => { LB.s[k] = [i.n, null, null]; picking = false; store(); draw(); } },
              el('span', { class: 'pico' }, W.art.item(i.ic)), el('span', { style: { color: W.tierColor(i.r), fontWeight: 700 } }, i.n), el('small', {}, 'Lv. ' + i.l)), () => W.itemCard(i)))));
        }
        const it = g.item, rows = Object.entries(it.i || {});
        const setRoll = (key, v) => { const r = Object.assign({}, LB.s[k][1] || {}); r[key] = v; LB.s[k][1] = r; store(); draw(); };
        return el('div', { class: 'ipanel' },
          el('div', { class: 'ihead' }, el('div', { class: 'iicon' }, W.art.item(it.ic)),
            el('div', { class: 'ititle' }, el('div', { class: 'iname', style: { color: W.tierColor(it.r) } }, it.n), el('div', { class: 'isub' }, `${(W.TIERS[it.r] || ['Item'])[0]} ${W.cap(it.t.replace('_', ' '))} · Lv. ${it.l}`)),
            el('button', { class: 'mini', onclick: () => { picking = true; pq = ''; draw(); } }, 'Change'),
            el('button', { class: 'mini danger', onclick: () => { delete LB.s[k]; store(); draw(); } }, 'Remove')),
          rows.length ? rollTable(it, g.r, setRoll, () => { LB.s[k][1] = null; store(); draw(); }) : el('p', { class: 'hint' }, 'This item has no identifications to roll.'),
          !isTome && it.ps ? powderEditor(k, it, g.p || []) : null);
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

      function powderEditor(k, it, pw) {
        const add = (e, t) => { if (pw.length >= it.ps) return; LB.s[k][2] = pw.concat([[e, t]]); store(); draw(); };
        let tier = 6;
        const tierSel = W.sel([1, 2, 3, 4, 5, 6, 7].map(t => [t, 'Tier ' + ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][t - 1]]), tier, (v) => { tier = +v; });
        return el('div', { class: 'powders' },
          el('div', { class: 'cap left' }, `Powders · ${pw.length}/${it.ps} slots`),
          el('div', { class: 'pwrow' }, Array.from({ length: it.ps }, (_, i) => pw[i]
            ? el('button', { class: 'pw', title: 'Remove', onclick: () => { LB.s[k][2] = pw.filter((_, j) => j !== i); store(); draw(); } }, el('img', { src: `img/ui/powder-${pw[i][0]}.webp`, alt: '' }), el('span', {}, ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][pw[i][1] - 1]))
            : el('span', { class: 'pw empty' }))),
          pw.length < it.ps ? el('div', { class: 'pwadd' }, tierSel, ['earth', 'thunder', 'water', 'fire', 'air'].map(e =>
            el('button', { class: 'mini pwbtn', title: 'Add ' + e, onclick: () => add(e, +tierSel.value) }, el('img', { src: `img/ui/powder-${e}.webp`, alt: '' }), W.cap(e)))) : null);
      }

      function pasteWin() {
        const ta = el('textarea', { rows: 3, placeholder: 'Paste Wynntils item strings here (one or several)…' });
        const out = el('div', { class: 'imp' });
        ta.addEventListener('input', () => {
          const res = WynntilsDecode.decodeGearText(ta.value, idKeys);
          out.replaceChildren(...res.map(r => {
            if (!r.ok) return el('div', { class: 'warn' }, r.error);
            const it = byName[r.gear.name];
            if (!it) return el('div', { class: 'warn' }, `“${r.gear.name}” isn’t in the item list yet.`);
            const slot = it.t === 'ring' ? (!LB.s.r1 || LB.s.r1[0] === it.n ? 'r1' : 'r2') : (EQUIP.find(s => s[2].includes(it.t)) || [])[0];
            if (!slot) return el('div', { class: 'warn' }, `${it.n} can’t go in a gear slot.`);
            LB.s[slot] = [it.n, r.gear.ids, r.gear.powders.length ? r.gear.powders : null]; store();
            return el('div', { class: 'impRow' }, W.slot(W.art.item(it.ic)), el('div', {}, el('b', { style: { color: W.tierColor(it.r) } }, it.n), el('small', {}, `Added with ${Object.keys(r.gear.ids).length} exact rolls${r.gear.powders.length ? ' and ' + r.gear.powders.length + ' powders' : ''}.`)));
          }));
          if (res.some(r => r.ok)) setTimeout(draw, 900);
        });
        return W.win('Paste from Wynntils', el('p', { class: 'hint', style: { marginTop: 0 } }, 'Share each piece you wear with Wynntils in-game and paste the strings here. Exact rolls and powders come along.'), ta, out);
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

        const spells = T && T.cls === cls() ? Object.entries(T.abilities).filter(([, a]) => /node(Archer|Warrior|Mage|Assassin|Shaman)/.test(JSON.stringify(a.icon))).map(([id, a]) => { const base = { id, ...W.parseSpell(a), on: LB.t.includes(id) }; return base.on ? W.treeSpell(base, id, T, LB.t) : base; }) : [];
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
                sp.applied && sp.applied.length ? el('small', { class: 'spup' }, 'With ' + sp.applied.join(', ')) : null),
              el('div', { class: 'sv' }, el('b', {}, cost != null ? cost : '—'), el('small', {}, 'mana')),
              el('div', { class: 'sv' }, el('b', {}, !hit ? '—' : sp.hits > 1 ? fmt(hit.expected) : ''), el('small', {}, !hit ? 'no damage' : sp.hits > 1 ? (sp.per || 'per hit') : 'single hit')),
              el('div', { class: 'sv total' }, el('b', {}, hit ? fmt(hit.expected * sp.hits) : '—'), el('small', {}, !hit ? '' : sp.hits > 1 ? `per cast · ${sp.hits} ${sp.unit}` : 'per cast')));
          }),
          el('p', { class: 'hint' }, 'Estimates. Unlocked tree upgrades that change a spell’s damage, mana cost or arrow/hit count are included (listed under each spell); other effects aren’t. “Per cast” assumes every arrow or hit lands on one target. Crits are averaged in.')) :
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
        return { res, spWin, defWin, dmgWin, manaWin, idWin, fighting, best: dmgSpells[0] };
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
      const TAB_LIST = [['stats', 'Stats'], ['damage', 'Damage'], ['mana', 'Mana'], ['sp', 'Skill points'], ['tree', 'Ability tree']];

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
          el('div', { class: 'invlab' }, `Mastery tomes · ${tomesOn}/14`),
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
        const body = tab === 'tree' ? treeWin()
          : !sum ? W.win('Nothing to show yet', el('p', { class: 'empty' }, 'Add some gear to see the numbers.'))
          : tab === 'damage' ? sum.dmgWin : tab === 'mana' ? sum.manaWin : tab === 'sp' ? sum.spWin
          : el('div', { class: 'stack' }, sum.defWin, sum.idWin);
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
