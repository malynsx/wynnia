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
    return { name: W.treePlain(a.name), cost: cost ? +cost[1] : null, total: total ? +total[1] : null, per: total ? total[2].replace(/^,\s*/, '').trim() : '', parts, slot, combo: combo ? combo.join('-') : '' };
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

      const shareLink = () => location.href.split('#')[0] + '#items/loadout?b=' + W.encodeBuild(LB, { ...ctx, treeIds: T && T.cls === cls() ? T.ids : null });

      /* ---------- left column ---------- */
      function buildWin() {
        const link = shareLink(), box = el('input', { type: 'text', readonly: true, value: link });
        return W.win('Build',
          LB.u ? el('p', { class: 'hint', style: { marginTop: 0 } }, owner && owner.char ? `Built for ${owner.name}’s ${owner.char.nickname || W.cap(String(owner.char.reskin || owner.char.type).toLowerCase())} (Lv. ${owner.char.level}). ` : ownerErr ? ownerErr + ' ' : `Loading ${LB.u}… `,
            el('a', { href: '#items/loadout', onclick: () => { delete LB.u; delete LB.ch; owner = null; store(); } }, 'Build without a character')) : (ownerErr ? el('div', { class: 'warn' }, ownerErr) : null),
          el('div', { class: 'fields3' },
            el('label', {}, 'Combat level', W.numIn(LB.lvl, (v) => { LB.lvl = Math.max(1, Math.min(120, v)); store(); draw(); }, 1, 120)),
            el('label', {}, 'Unknown rolls use', W.sel([['max', 'Best roll'], ['avg', 'Average roll'], ['min', 'Worst roll']], LB.mode, (v) => { LB.mode = v; store(); draw(); })),
            el('label', {}, 'Rank AP loan', W.sel([[0, 'None'], [2, 'VIP+ (+2)'], [4, 'HERO+ (+4)']], LB.loan, (v) => { LB.loan = +v; store(); draw(); }))),
          !piece('w') ? el('div', { class: 'fields3' }, el('label', {}, 'Class', W.sel([['', 'Pick a weapon or class'], ['archer', 'Archer'], ['warrior', 'Warrior'], ['mage', 'Mage'], ['assassin', 'Assassin'], ['shaman', 'Shaman']], LB.cls || '', (v) => { LB.cls = v || null; store(); draw(); }))) : null,
          el('div', { class: 'cap left' }, 'Share this build'),
          el('div', { class: 'search' }, box, el('button', { onclick: (e) => { box.select(); W.copyText(link, e.target); } }, 'Copy link')),
          el('p', { class: 'hint' }, `${link.split('?b=')[1].length} characters. The link keeps every item, exact roll, powder, tome, skill point and ability.`),
          el('div', { class: 'btns' }, el('a', { class: 'btnlink', href: '#items/recommend' + (LB.u ? '?u=' + encodeURIComponent(LB.u) : '') }, 'Recommended build'),
            el('button', { class: 'danger', onclick: () => { if (confirm('Clear the whole build?')) { LB = blank(); owner = null; store(); draw(); } } }, 'Clear build')));
      }

      function slotButton(k, label, small) {
        const g = piece(k);
        const q = g && g.r ? W.rollQuality(g.item, g.r) : null;
        return el('button', { class: 'gslot' + (small ? ' small' : '') + (sel === k ? ' on' : '') + (g ? '' : ' empty'), onclick: () => { sel = k; picking = !g; pq = ''; draw(); } },
          el('div', { class: 'gicon' }, g ? W.art.item(g.item.ic) : W.art.item(null)),
          el('div', { class: 'gtext' }, el('small', {}, label), g ? el('b', { style: { color: W.tierColor(g.item.r) } }, g.item.n) : el('b', {}, 'Empty'),
            g ? el('small', {}, `Lv. ${g.item.l}`, q != null ? el('span', { class: 'qual', style: { '--q': q } }, ` · ${q}%`) : '',
              g.p && g.p.length ? el('span', { class: 'pws' }, g.p.map(([e, t]) => el('img', { src: `img/ui/powder-${e}.webp`, title: `${W.cap(e)} ${t}`, alt: '' }))) : '') : null));
      }

      function equipWin() {
        return W.win('Equipment', el('div', { class: 'doll' }, EQUIP.map(([k, label]) => slotButton(k, label))), itemPanel());
      }
      function tomesWin() {
        const filled = eng.tomeSlots.filter((_, i) => LB.s['t' + i]).length;
        return el('details', { class: 'win tomes', open: filled > 0 || (sel && sel[0] === 't') },
          el('summary', {}, el('h2', {}, `Mastery tomes · ${filled}/14`)),
          el('div', { class: 'tomegrid' }, eng.tomeSlots.map(([type, lvl], i) => slotButton('t' + i, `${TOME_NAMES[type]} · Lv. ${lvl}`, true))),
          sel && sel[0] === 't' ? itemPanel() : null);
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
        return el('div', { class: 'rolls' },
          el('div', { class: 'rollhead' }, el('b', {}, rolls ? 'Exact rolls' : `Rolls (${({ max: 'best', avg: 'average', min: 'worst' })[LB.mode]} until set)`),
            el('span', { class: 'qual big', style: { '--q': quality } }, quality + '%'), rolls ? el('button', { class: 'mini', onclick: reset }, 'Reset') : null),
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
        if (!ps.length) return W.win('Build summary', el('p', { class: 'empty' }, 'Add some gear to see the numbers.'));
        const has = owner && owner.char && owner.char.skillPoints ? W.SK.map(s => owner.char.skillPoints[s === 'defence' ? 'defense' : s] || 0) : null;
        const scale = (n) => eng.spScale[Math.max(0, Math.min(150, Math.round(n)))] || 0;
        const effect = ['% damage (earth)', '% crit chance (thunder)', '% mana / water', '% less damage taken (fire)', '% dodge chance (air)'];
        const effVal = (i) => i === 3 ? scale(res.finalSP[i]) * 0.867 : i === 4 ? scale(res.finalSP[i]) * 0.951 : scale(res.finalSP[i]);
        const over = res.spTotal > res.spAvail;
        const spWin = W.win('Skill points',
          el('div', { class: 'sptable' },
            el('div', { class: 'sprow sphead' }, ['', 'Assign', 'Extra', 'Gear', 'Total', 'Effect'].map(h => el('span', {}, h))),
            W.SK.map((s, i) => el('div', { class: 'sprow' },
              el('b', { class: 'elname', style: { color: W.ELEM[W.SK_ELEM[s]] } }, W.cap(s)),
              el('span', {}, res.sp.need[i], has ? el('small', { class: has[i] >= res.sp.need[i] ? 'up' : 'down' }, ` (has ${has[i]})`) : null),
              W.numIn(LB.x[s] || 0, (v) => { LB.x[s] = Math.max(0, Math.min(100, v)); store(); draw(); }, 0, 100),
              el('span', {}, (res.sp.bonus[i] > 0 ? '+' : '') + res.sp.bonus[i]),
              el('b', {}, res.finalSP[i]),
              el('small', {}, W.num(effVal(i), 1) + effect[i])))),
          el('div', { class: over ? 'warn' : 'hint' }, `${res.spTotal} of ${res.spAvail} skill points used at level ${LB.lvl}.` + (over ? ' That’s more than you have: the build can’t be worn yet.' : ` ${res.spAvail - res.spTotal} left to put in Extra.`)));

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

        const spells = T && T.cls === cls() ? Object.entries(T.abilities).filter(([, a]) => /node(Archer|Warrior|Mage|Assassin|Shaman)/.test(JSON.stringify(a.icon))).map(([id, a]) => ({ id, ...W.parseSpell(a), on: LB.t.includes(id) })) : [];
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
            el('div', { class: 'cbar' }, el('i', { style: { width: ((a + b) / 2) / res.melee.avg * 100 + '%', background: ELEM_COL[e] } }), el('b', {}, `${fmt(a)}–${fmt(b)}`))))),
          spells.length ? el('div', { class: 'cap left' }, 'Spells') : null,
          spells.sort((x, y) => (x.slot || 9) - (y.slot || 9)).map(sp => {
            const cost = sp.cost != null && sp.slot ? res.spellCost(sp.slot, sp.cost) : sp.cost;
            const hit = sp.total ? res.melee.spell(Object.keys(sp.parts).length ? sp.parts : { neutral: sp.total }) : null;
            return el('div', { class: 'spell' + (sp.on ? '' : ' off') },
              el('div', {}, el('b', {}, sp.name), el('small', {}, `${sp.combo}${sp.on ? '' : ' · not unlocked'}`)),
              el('div', { class: 'sv' }, el('b', {}, cost != null ? cost : '—'), el('small', {}, 'mana')),
              el('div', { class: 'sv' }, el('b', {}, hit ? fmt(hit.expected) : '—'), el('small', {}, hit ? (sp.per ? sp.per : 'damage') : 'no damage')));
          }),
          el('p', { class: 'hint' }, 'Estimates from base spell values: tree upgrades that change spells aren’t applied, and the game rounds some steps differently.')) :
          W.win('Damage', el('p', { class: 'empty' }, 'Add a weapon to see damage.'));

        const manaWin = W.win('Mana', el('div', { class: 'kv' },
          el('div', {}, el('span', {}, 'Max mana'), el('b', {}, res.mana)),
          el('div', {}, el('span', {}, 'Mana regen'), el('b', {}, res.manaRegen + ' /5s')),
          el('div', {}, el('span', {}, 'Mana steal'), el('b', {}, res.manaSteal + ' /3s')),
          el('div', {}, el('span', {}, 'Spell cost from Intelligence'), el('b', {}, '−' + W.num(res.intCost * 100, 1) + '%')),
          el('div', {}, el('span', {}, 'Walk speed'), el('b', {}, (res.walk > 0 ? '+' : '') + res.walk + '%'))));

        const idWin = W.win('Identifications', el('div', { class: 'idlist' }, Object.entries(res.ids).filter(([, v]) => v).sort((a, b) => W.idInfo(a[0]).name.localeCompare(W.idInfo(b[0]).name)).map(([k, v]) =>
          el('div', { class: 'il' }, el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v)), el('span', { class: 'idn' }, W.idInfo(k).name)))));
        return el('div', { class: 'stack' }, spWin, defWin, dmgWin, manaWin, idWin);
      }

      function treeWin() {
        const c = cls();
        if (!c) return W.win('Ability tree', el('p', { class: 'empty' }, 'Pick a weapon (or a class) to plan the ability tree.'));
        return W.win(`Ability tree · ${W.cap(c)}`, W.atree({ cls: c, level: LB.lvl, selected: LB.t, editable: true, loan: LB.loan,
          onChange: (ids) => { LB.t = ids; store(); const r = root.querySelector('.lo-right'); if (r) r.replaceChildren(summary()); const b = root.querySelector('.lo-build'); if (b) b.replaceWith(Object.assign(buildWin(), { className: 'win lo-build' })); } }));
      }

      const draw = () => {
        ensureTree();
        const b = buildWin(); b.classList.add('lo-build');
        root.replaceChildren(el('div', { class: 'stack' },
          el('div', { class: 'cols wide-l' }, el('div', { class: 'stack' }, b, equipWin(), tomesWin(), pasteWin()), el('div', { class: 'lo-right' }, summary())),
          treeWin()));
      };
      draw();
    });
  };

  /* Roll helpers shared with other pages */
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
