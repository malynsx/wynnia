/* Build engine: skill point solving, stat totals, defences, health, mana and damage estimates.
   Values come from the Wynncraft Wiki (skill point curve, powders, attack speeds, mana). Wynncraft doesn't publish
   its damage formula; damage follows WynnBuilder's model of it (see the note in computeBuild). */
(function (W) {
  const SK = ['strength', 'dexterity', 'intelligence', 'defence', 'agility'];
  const SK_ID = { strength: 'rawStrength', dexterity: 'rawDexterity', intelligence: 'rawIntelligence', defence: 'rawDefence', agility: 'rawAgility' };
  const ELEM = ['earth', 'thunder', 'water', 'fire', 'air'];
  const SK_ELEM = { strength: 'earth', dexterity: 'thunder', intelligence: 'water', defence: 'fire', agility: 'air' };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const WEAPONS = ['bow', 'spear', 'wand', 'dagger', 'relik'];
  W.SK = SK; W.ELEMS = ELEM; W.SK_ELEM = SK_ELEM;

  /* Value of one identification on one equipped piece: exact roll if known, otherwise by roll mode. */
  /* mode: 'max' | 'avg' | 'min', or a number 0–1 for how far along the range from worst to best (0.75 = a 75% roll) */
  const pick = (v, mode) => !Array.isArray(v) ? v : typeof mode === 'number' ? Math.round(v[0] + (v[1] - v[0]) * mode)
    : mode === 'min' ? v[0] : mode === 'avg' ? Math.round((v[0] + v[1]) / 2) : v[1];
  W.idValue = (piece, key, mode) => {
    if (piece.r && piece.r[key] != null) return piece.r[key];
    const v = piece.item.i && piece.item.i[key];
    if (v == null) return 0;
    return pick(v, mode);   // [worst, best]: the data's "max" is always the best roll, also for negative IDs like spell cost
  };

  /* Skill points: try every order of the pieces that give skill points and keep the cheapest. */
  W.solveSkillPoints = (pieces, mode) => {
    const req = pieces.map(p => SK.map(s => (p.item.q && p.item.q[s]) || 0));
    const bonus = pieces.map(p => SK.map(s => W.idValue(p, SK_ID[s], mode)));
    /* the weapon goes on last: its skill points only count while it's held, so they never help (or hurt) the armour */
    const weapon = pieces.findIndex(p => WEAPONS.includes(p.item.t));
    const givers = pieces.map((_, i) => i).filter(i => i !== weapon && bonus[i].some(b => b > 0));
    const rest = pieces.map((_, i) => i).filter(i => i !== weapon && !givers.includes(i)).sort((a, b) => Math.min(...bonus[a]) - Math.min(...bonus[b])).reverse();
    const cost = (order) => {
      const need = [0, 0, 0, 0, 0], have = [0, 0, 0, 0, 0];
      for (const i of order) {
        for (let s = 0; s < 5; s++) if (req[i][s]) need[s] = Math.max(need[s], req[i][s] - have[s]);
        for (let s = 0; s < 5; s++) have[s] += bonus[i][s];
      }
      /* after all the armour is on, every piece must still meet its requirements */
      for (const i of order) for (let s = 0; s < 5; s++) if (req[i][s]) need[s] = Math.max(need[s], req[i][s] - have[s]);
      if (weapon >= 0) for (let s = 0; s < 5; s++) if (req[weapon][s]) need[s] = Math.max(need[s], req[weapon][s] - have[s]);
      return need.map(n => Math.max(0, n));
    };
    let best = null;
    const perm = (arr, l) => {
      if (l === arr.length) { const n = cost(arr.concat(rest)); const t = n.reduce((a, b) => a + b, 0); if (!best || t < best.total) best = { need: n, total: t }; return; }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    };
    if (givers.length <= 7) perm(givers.slice(), 0); else { const n = cost(givers.concat(rest)); best = { need: n, total: n.reduce((a, b) => a + b, 0) }; }
    const totalBonus = SK.map((_, s) => pieces.reduce((a, p, i) => a + bonus[i][s], 0));
    return { need: best ? best.need : [0, 0, 0, 0, 0], total: best ? best.total : 0, bonus: totalBonus };
  };

  W.spAvailable = (lvl) => Math.max(0, Math.min(200, (lvl - 1) * 2));

  /* Item sets worn: every equipped piece counts (two of the same ring count twice). A set gives the bonus listed for
     that many pieces, or for the most pieces it lists below that. Returns [{ name, count, of, bonus, major }]. */
  W.setBonuses = (pieces, eng) => {
    const sets = (eng && eng.sets) || {};
    if (!eng.setOf) Object.defineProperty(eng, 'setOf', { value: Object.fromEntries(Object.entries(sets).flatMap(([n, s]) => s.p.map(p => [p, n]))) });
    const count = {};
    pieces.forEach(p => { const s = p.item.g !== 'tome' && eng.setOf[p.item.n]; if (s) count[s] = (count[s] || 0) + 1; });
    return Object.entries(count).map(([name, n]) => {
      const s = sets[name], key = Object.keys(s.b).map(Number).filter(k => k <= n).sort((a, b) => b - a)[0];
      const top = Math.max(...Object.keys(s.b).map(Number));
      return { name, count: n, of: Math.max(top, s.p.length), parts: s.p, bonus: key ? s.b[key] : {}, major: key ? (s.m || {})[key] || [] : [], next: Object.keys(s.b).map(Number).filter(k => k > n).sort((a, b) => a - b)[0] || null };
    }).sort((a, b) => b.count - a.count);
  };

  W.computeBuild = (pieces, opts, eng) => {
    const mode = opts.mode || 'max', lvl = opts.level || 106;
    const scale = (n) => eng.spScale[Math.max(0, Math.min(150, Math.round(n)))] || 0;   // percent
    const sp = W.solveSkillPoints(pieces.filter(p => p.item.g !== 'tome'), mode);
    const extra = SK.map(s => (opts.extra && opts.extra[s]) || 0);
    const tomeBonus = SK.map(s => pieces.filter(p => p.item.g === 'tome').reduce((a, p) => a + W.idValue(p, SK_ID[s], mode), 0));
    /* set bonuses act like one more item's identifications; their skill points add to the total but aren't used to
       meet gear requirements, so the points you're asked to assign never depend on finishing a set */
    const sets = W.setBonuses(pieces, eng);
    const setSP = SK.map(s => sets.reduce((a, x) => a + (x.bonus[SK_ID[s]] || 0), 0));
    sp.bonus = sp.bonus.map((b, i) => b + setSP[i]);
    /* extra can be negative: you may set a skill below what your gear asks for (then that gear can't be worn) */
    const assigned = sp.need.map((n, i) => Math.max(0, n + extra[i]));
    const short = sp.need.map((n, i) => Math.max(0, n - assigned[i]));
    const finalSP = SK.map((_, i) => assigned[i] + sp.bonus[i] + tomeBonus[i]);
    const spTotal = assigned.reduce((a, b) => a + b, 0), spAvail = W.spAvailable(lvl);

    /* identifications summed over every piece, plus set bonuses */
    const ids = {};
    pieces.forEach(p => Object.keys(p.item.i || {}).forEach(k => { ids[k] = (ids[k] || 0) + W.idValue(p, k, mode); }));
    sets.forEach(x => Object.entries(x.bonus).forEach(([k, v]) => { ids[k] = (ids[k] || 0) + v; }));
    const id = (k) => ids[k] || 0;

    /* base stats and powders */
    let hp = 5 * lvl + 5;
    const elemDef = { earth: 0, thunder: 0, water: 0, fire: 0, air: 0 };
    pieces.forEach(p => {
      const b = p.item.b || {};
      if (b.baseHealth != null) hp += Array.isArray(b.baseHealth) ? b.baseHealth[1] : b.baseHealth;
      ELEM.forEach(e => { const v = b['base' + cap(e) + 'Defence']; if (v != null) elemDef[e] += Array.isArray(v) ? v[1] : v; });
      if (p.item.g !== 'weapon') (p.p || []).forEach(([el, tier]) => {
        const pw = eng.powders[el] && eng.powders[el][tier]; if (!pw) return;
        hp += pw.hp || 0; Object.entries(pw.def).forEach(([e, v]) => { elemDef[e] += v; });
      });
    });
    hp += id('rawHealth');
    ELEM.forEach(e => { const pct = id(e + 'Defence') + id('elementalDefence'); elemDef[e] = Math.round(elemDef[e] * (1 + Math.sign(elemDef[e] || 1) * pct / 100)); });
    hp = Math.max(5, hp);
    const defPct = scale(finalSP[3]) * 0.867, agiPct = scale(finalSP[4]) * 0.951;
    const ehp = hp / (1 - defPct / 100);
    const ehpAgi = hp / ((1 - defPct / 100) * (1 - agiPct / 100 * 0.9));
    const mana = Math.min(eng.manaCap, Math.round(eng.baseMana * (1 + scale(finalSP[2]) / 100) + id('rawMaxMana')));

    /* weapon damage after powders */
    const w = pieces.find(p => p.item.g === 'weapon');
    let melee = null, base = null, speedKey = null;
    if (w) {
      const b = w.item.b || {};
      base = { neutral: [0, 0] };
      ELEM.forEach(e => { base[e] = [0, 0]; });
      const take = (v) => Array.isArray(v) ? v.slice() : [v, v];
      if (b.baseDamage) base.neutral = take(b.baseDamage);
      ELEM.forEach(e => { if (b['base' + cap(e) + 'Damage']) base[e] = take(b['base' + cap(e) + 'Damage']); });
      const n0 = base.neutral.slice();
      (w.p || []).forEach(([el, tier]) => {
        const pw = eng.powders[el] && eng.powders[el][tier]; if (!pw) return;
        const share = Math.min(pw.conv / 100, base.neutral[1] ? base.neutral[1] / Math.max(1, n0[1]) : 0);
        const moved = [n0[0] * share, n0[1] * share];
        base.neutral = [base.neutral[0] - moved[0], base.neutral[1] - moved[1]];
        base[el] = [base[el][0] + moved[0] + pw.min, base[el][1] + moved[1] + pw.max];
      });
      const order = eng.attackOrder;
      const weaponSpeed = order.includes(w.item.as) ? w.item.as : 'normal';
      const idx = Math.max(0, Math.min(order.length - 1, order.indexOf(weaponSpeed) + id('rawAttackSpeed')));
      speedKey = order[idx];
      const hits = eng.attackSpeed[speedKey];
      const elements = ['neutral', ...ELEM];
      const present = elements.filter(e => base[e][1] > 0);

      /* Damage, the way WynnBuilder models the game (wynnbuilder.github.io, damage_calc.js):
         1. a spell's conversions: its neutral % scales every element of the weapon, each elemental % adds that share of
            the weapon's total damage to that element; spells (not main attacks) also scale by the weapon's attack speed
         2. flat elemental damage from the ability tree (Air Mastery: +3-4) is added to elements that are present
         3. % boosts add up: skill points (Strength for earth, Dexterity thunder, Intelligence water, Defence x0.867 fire,
            Agility x0.951 air), % damage, % spell/main attack damage, the element's own %, and elemental % for elements
         4. raw damage is added after that, split by each element's share and scaled by the spell's total %
         5. Strength then multiplies everything, and a crit adds 100% + Critical Damage Bonus on top */
      const tree = opts.tree || { add: {}, pct: {} };
      const pctSP = (i) => scale(finalSP[i]) / 100;
      const skillBoost = { neutral: 0, earth: pctSP(0), thunder: pctSP(1), water: pctSP(2), fire: pctSP(3) * 0.867, air: pctSP(4) * 0.951 };
      const strBoost = 1 + pctSP(0);
      const critChance = Math.min(1, pctSP(1)), critMult = 1 + id('criticalDamageBonus') / 100;
      const wMin = elements.reduce((a, e) => a + base[e][0], 0), wMax = elements.reduce((a, e) => a + base[e][1], 0);
      /* conv: { neutral: %, fire: %, ... }; kind: 'spell' | 'mainAttack' */
      const damage = (conv, kind, useSpeed) => {
        const K = cap(kind), d = {}, here = {};
        const nConv = (conv.neutral || 0) / 100;
        elements.forEach(e => { d[e] = [base[e][0] * nConv, base[e][1] * nConv]; here[e] = nConv > 0 && base[e][1] > 0; });
        ELEM.forEach(e => { const c = (conv[e] || 0) / 100; if (c > 0) { d[e][0] += c * wMin; d[e][1] += c * wMax; here[e] = true; } });
        const totalConv = elements.reduce((a, e) => a + Math.max(0, conv[e] || 0), 0) / 100;
        if (useSpeed) elements.forEach(e => { d[e][0] *= eng.attackSpeed[weaponSpeed]; d[e][1] *= eng.attackSpeed[weaponSpeed]; });
        ELEM.forEach(e => { if (here[e] && tree.add[e]) { d[e][0] += tree.add[e][0]; d[e][1] += tree.add[e][1]; } });
        const pre = {}; elements.forEach(e => { pre[e] = d[e].slice(); });
        const sum = (es, k) => es.reduce((a, e) => a + pre[e][k], 0);
        const tot = [sum(elements, 0), sum(elements, 1)], totE = [sum(ELEM, 0), sum(ELEM, 1)];
        const flat = id(kind + 'Damage') + id('damage');
        elements.forEach(e => {
          let m = 1 + skillBoost[e] + flat / 100 + (id(e + K + 'Damage') + id(e + 'Damage') + (tree.pct[e] || 0)) / 100;
          if (e !== 'neutral') m += (id('elemental' + K + 'Damage') + id('elementalDamage')) / 100;
          d[e][0] *= m; d[e][1] *= m;
        });
        const propRaw = id('raw' + K + 'Damage') + id('rawDamage'), rainbowRaw = id('rawElemental' + K + 'Damage') + id('rawElementalDamage');
        elements.forEach(e => {
          let lo = 0, hi = 0;
          if (here[e]) { const own = id('raw' + cap(e) + K + 'Damage') + id('raw' + cap(e) + 'Damage'); lo += own; hi += own; }
          if (tot[1] > 0) { lo += (tot[0] ? pre[e][0] / tot[0] : pre[e][1] / tot[1]) * propRaw; hi += pre[e][1] / tot[1] * propRaw; }
          if (e !== 'neutral' && totE[1] > 0) { lo += (totE[0] ? pre[e][0] / totE[0] : pre[e][1] / totE[1]) * rainbowRaw; hi += pre[e][1] / totE[1] * rainbowRaw; }
          d[e][0] += lo * totalConv; d[e][1] += hi * totalConv;
        });
        const per = {}; let lo = 0, hi = 0;
        elements.forEach(e => {
          const a = Math.max(0, d[e][0]) * strBoost, c = Math.max(0, d[e][1]) * strBoost;
          if (c > 0) per[e] = [a, c];
          lo += a; hi += c;
        });
        const avg = (lo + hi) / 2;
        return { per, lo, hi, avg, expected: avg * (1 - critChance) + avg * (strBoost + critMult) / strBoost * critChance };
      };
      const hit = damage({ neutral: 100 }, 'mainAttack', false);
      const baseAvg = present.reduce((a, e) => a + (base[e][0] + base[e][1]) / 2, 0);
      melee = { ...hit, hits, speed: speedKey, dps: hit.expected * hits, critChance, baseDps: baseAvg * hits };
      /* a spell part: { neutral: %, fire: %, ... } from the ability text */
      melee.spell = (parts) => damage(parts, 'spell', true);
    }
    const intCost = scale(finalSP[2]) * 0.5 / 80.8;
    const spellCost = (n, baseCost) => {
      let c = baseCost + id('raw' + ['1st', '2nd', '3rd', '4th'][n - 1] + 'SpellCost');
      c = c * (1 - intCost);
      const pct = id(['1st', '2nd', '3rd', '4th'][n - 1] + 'SpellCost');
      if (pct) c = pct < 0 ? Math.min(c - 1, c * (1 + pct / 100)) : Math.max(c + 1, c * (1 + pct / 100));
      return Math.max(1, Math.round(c));
    };
    return { level: lvl, sp, sets, setSP, extra, assigned, short, finalSP, spTotal, spAvail, ids, hp, ehp, ehpAgi, defPct, agiPct, elemDef, mana, melee, base, spellCost, intCost,
      lifeSteal: id('lifeSteal'), manaSteal: id('manaSteal'), manaRegen: id('manaRegen'), hpRegen: id('healthRegenRaw'), walk: id('walkSpeed') };
  };
})(window.W);
