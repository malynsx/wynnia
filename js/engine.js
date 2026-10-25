/* Build engine: skill point solving, stat totals, defences, health, mana and damage estimates.
   Values come from the Wynncraft Wiki (skill point curve, powders, attack speeds, mana). The exact in-game
   damage formula isn't published, so damage numbers are labelled estimates. */
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

  W.computeBuild = (pieces, opts, eng) => {
    const mode = opts.mode || 'max', lvl = opts.level || 106;
    const scale = (n) => eng.spScale[Math.max(0, Math.min(150, Math.round(n)))] || 0;   // percent
    const sp = W.solveSkillPoints(pieces.filter(p => p.item.g !== 'tome'), mode);
    const extra = SK.map(s => (opts.extra && opts.extra[s]) || 0);
    const tomeBonus = SK.map(s => pieces.filter(p => p.item.g === 'tome').reduce((a, p) => a + W.idValue(p, SK_ID[s], mode), 0));
    const assigned = sp.need.map((n, i) => n + extra[i]);
    const finalSP = SK.map((_, i) => assigned[i] + sp.bonus[i] + tomeBonus[i]);
    const spTotal = assigned.reduce((a, b) => a + b, 0), spAvail = W.spAvailable(lvl);

    /* identifications summed over every piece */
    const ids = {};
    pieces.forEach(p => Object.keys(p.item.i || {}).forEach(k => { ids[k] = (ids[k] || 0) + W.idValue(p, k, mode); }));
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

    /* weapon damage after powders (estimate) */
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
      const idx = Math.max(0, Math.min(order.length - 1, order.indexOf(w.item.as || 'normal') + id('rawAttackSpeed')));
      speedKey = order[idx];
      const hits = eng.attackSpeed[speedKey];
      const elements = ['neutral', ...ELEM];
      const present = elements.filter(e => base[e][1] > 0);
      const skillBonus = (e) => e === 'neutral' ? 0 : scale(finalSP[SK.indexOf(Object.keys(SK_ELEM).find(s => SK_ELEM[s] === e))]);
      const pctFor = (e, kind) => id('damage') + id(kind + 'Damage') + (e === 'neutral' ? id('neutralDamage') + id('neutral' + cap(kind) + 'Damage')
        : id(e + 'Damage') + id(e + cap(kind) + 'Damage') + id('elementalDamage') + id('elemental' + cap(kind) + 'Damage')) + skillBonus(e) + scale(finalSP[0]) * (e === 'neutral' ? 1 : 0);
      const rawFor = (e, kind) => (e === 'neutral' ? 0 : id('raw' + cap(e) + 'Damage') + id('raw' + cap(e) + cap(kind) + 'Damage'));
      const rawShared = (kind) => id('rawDamage') + id('raw' + cap(kind) + 'Damage') + id('rawNeutralDamage') + id('rawNeutral' + cap(kind) + 'Damage');
      const rawElemShared = (kind) => id('rawElementalDamage') + id('rawElemental' + cap(kind) + 'Damage');
      const critChance = Math.min(100, scale(finalSP[1])) / 100, critMult = 2 + id('criticalDamageBonus') / 100;
      /* damage for a map of element -> [min, max] base values */
      const damage = (baseMap, kind) => {
        const per = {}; let lo = 0, hi = 0;
        const elems = Object.keys(baseMap).filter(e => baseMap[e][1] > 0);
        const avgOf = (e) => (baseMap[e][0] + baseMap[e][1]) / 2;
        const all = elems.reduce((a, e) => a + avgOf(e), 0) || 1, elemOnly = elems.filter(e => e !== 'neutral').reduce((a, e) => a + avgOf(e), 0) || 1;
        elems.forEach(e => {
          const raw = rawShared(kind) * avgOf(e) / all + rawFor(e, kind) + (e !== 'neutral' ? rawElemShared(kind) * avgOf(e) / elemOnly : 0);
          const m = Math.max(0, 1 + pctFor(e, kind) / 100);
          const a = Math.max(0, (baseMap[e][0] + raw) * m), b = Math.max(0, (baseMap[e][1] + raw) * m);
          per[e] = [a, b]; lo += a; hi += b;
        });
        const avg = (lo + hi) / 2;
        return { per, lo, hi, avg, expected: avg * ((1 - critChance) + critChance * critMult) };
      };
      const hit = damage(base, 'mainAttack');
      const baseAvg = present.reduce((a, e) => a + (base[e][0] + base[e][1]) / 2, 0);
      melee = { ...hit, hits, speed: speedKey, dps: hit.expected * hits, critChance, baseDps: baseAvg * hits };
      /* Spells deal a % of the weapon's base DPS. parts: { neutral: %, fire: %, ... } from the ability text.
         The neutral part follows the weapon's own element split; elemental parts go to that element. */
      melee.spell = (parts) => {
        const map = {};
        Object.entries(parts).forEach(([e, pct]) => {
          const f = pct / 100 * hits;
          if (e === 'neutral') present.forEach(x => { map[x] = map[x] || [0, 0]; map[x][0] += base[x][0] * f; map[x][1] += base[x][1] * f; });
          else { map[e] = map[e] || [0, 0]; map[e][0] += baseAvg * f * 0.9; map[e][1] += baseAvg * f * 1.1; }
        });
        return damage(map, 'spell');
      };
    }
    const intCost = scale(finalSP[2]) * 0.5 / 80.8;
    const spellCost = (n, baseCost) => {
      let c = baseCost + id('raw' + ['1st', '2nd', '3rd', '4th'][n - 1] + 'SpellCost');
      c = c * (1 - intCost);
      const pct = id(['1st', '2nd', '3rd', '4th'][n - 1] + 'SpellCost');
      if (pct) c = pct < 0 ? Math.min(c - 1, c * (1 + pct / 100)) : Math.max(c + 1, c * (1 + pct / 100));
      return Math.max(1, Math.round(c));
    };
    return { level: lvl, sp, extra, assigned, finalSP, spTotal, spAvail, ids, hp, ehp, ehpAgi, defPct, agiPct, elemDef, mana, melee, base, spellCost, intCost,
      lifeSteal: id('lifeSteal'), manaSteal: id('manaSteal'), manaRegen: id('manaRegen'), hpRegen: id('healthRegenRaw'), walk: id('walkSpeed') };
  };
})(window.W);
