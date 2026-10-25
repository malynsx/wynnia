/* Profile badges: small awards for what a player has done, worked out from the public Wynncraft API.
   Each badge is a pixel-art hex gem (drawn here, tinted by tier like Wynncraft's rarities) holding a
   Wynncraft icon, with its tier number in the corner. */
(function (W) {
  const { el } = W;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  /* gem colours per tier: [light, base, dark] (unique green, rare cyan, legendary-ish gold, fabled red, mythic purple) */
  const TIER = [
    { name: 'Tier I', c: ['#9cf59c', '#4cc24c', '#226e22'] },
    { name: 'Tier II', c: ['#9ff0ff', '#3bbfe0', '#1a6a85'] },
    { name: 'Tier III', c: ['#fff1a0', '#e8c02c', '#8a6a0c'] },
    { name: 'Tier IV', c: ['#ffaaa0', '#e0483a', '#7e1e16'] },
    { name: 'Tier V', c: ['#f0b0ff', '#b44be0', '#5a1a7a'] },
  ];
  const LOCKED = ['#9aa7b3', '#5d6b78', '#323c46'];

  /* Pointy-top hex on an 18x20 pixel grid: outline, lit upper rim, shaded lower rim, dark inner ring, face. */
  const gemCache = {};
  function gem([light, base, dark]) {
    const key = light + base + dark;
    if (gemCache[key]) return gemCache[key];
    const Wd = 18, Ht = 20, cx = 9, cy = 10;
    const inHex = (x, y, r) => { const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy); return dx <= r * 0.866 && dy <= r - dx / 1.732; };
    let rects = '';
    for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) {
      let col = null;
      if (!inHex(x, y, 10.2)) continue;
      if (!inHex(x, y, 9.1)) col = '#14213a';
      else if (!inHex(x, y, 7.2)) col = (y + 0.5 < cy - (x + 0.5 - cx) * 0.3) ? light : dark;
      else if (!inHex(x, y, 6.2)) col = dark;
      else col = (x + y < 13 && inHex(x, y, 6.2) && !inHex(x, y, 4.6)) ? light : base;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>`;
    }
    /* a two-pixel sparkle on the upper left of the face */
    rects += `<rect x="6" y="6" width="1" height="1" fill="#fff"/><rect x="5" y="7" width="1" height="1" fill="#fff" opacity=".7"/>`;
    return (gemCache[key] = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${Ht}" shape-rendering="crispEdges">${rects}</svg>`));
  }

  const years = (d) => d.firstJoin ? (Date.now() - new Date(d.firstJoin)) / (365.25 * 864e5) : 0;
  const chars = (d) => Object.values(d.characters || {});
  const maxProf = (d) => {
    let best = ['mining', 0];
    chars(d).forEach(c => Object.entries(c.professions || {}).forEach(([p, v]) => { if ((v.level || 0) > best[1]) best = [p, v.level]; }));
    return best;
  };
  const bestRank = (d) => Math.min(Infinity, ...Object.values(d.ranking || {}).filter(v => typeof v === 'number' && v > 0));

  /* id, name, what it's for, icon, value getter, tier thresholds (lower-is-better when `low`) and how to show the value */
  const BADGES = [
    { id: 'veteran', name: 'Old Timer', what: 'Years since first joining Wynncraft', icon: 'wiki/scribing', get: years, tiers: [1, 2, 3, 5, 8], fmt: (v) => W.num(v, 1) + ' years' },
    { id: 'playtime', name: 'Dedicated', what: 'Hours played', icon: 'ui/energy-boost', get: (d) => d.playtime || 0, tiers: [50, 250, 750, 2000, 5000], fmt: (v) => W.num(v, 0) + ' h' },
    { id: 'level', name: 'Seasoned', what: 'Total level across all characters', icon: 'ui/boost', get: (d) => (d.globalData || {}).totalLevel || 0, tiers: [100, 300, 700, 1500, 3000] },
    { id: 'combat', name: 'Battle Ready', what: 'Highest combat level on one character', iconFn: (d) => { const c = chars(d).sort((a, b) => (b.level || 0) - (a.level || 0))[0]; return 'wiki/' + (c ? (W.CLASS_ART[String(c.reskin || c.type).toLowerCase()] || 'warrior') : 'warrior'); },
      get: (d) => Math.max(0, ...chars(d).map(c => c.level || 0)), tiers: [25, 50, 80, 100, 106] },
    { id: 'quests', name: 'Storyteller', what: 'Quests completed', icon: 'wiki/questbook', get: (d) => (d.globalData || {}).completedQuests || 0, tiers: [25, 75, 150, 250, 400] },
    { id: 'completion', name: 'Completionist', what: 'Content completion points', icon: 'wiki/jeweling', get: (d) => (d.globalData || {}).contentCompletion || 0, tiers: [100, 400, 1000, 2000, 4000] },
    { id: 'mobs', name: 'Slayer', what: 'Mobs killed', icon: 'wiki/weaponsmithing', get: (d) => (d.globalData || {}).mobsKilled || 0, tiers: [10000, 50000, 200000, 1000000, 5000000] },
    { id: 'chests', name: 'Treasure Hunter', what: 'Loot chests opened', icon: 'wiki/3d-items', get: (d) => (d.globalData || {}).chestsFound || 0, tiers: [100, 500, 2000, 10000, 30000] },
    { id: 'dungeons', name: 'Dungeon Diver', what: 'Dungeons cleared', icon: 'ui/toughness', get: (d) => ((d.globalData || {}).dungeons || {}).total || 0, tiers: [10, 50, 200, 600, 2000] },
    { id: 'raids', name: 'Raider', what: 'Raids cleared', icon: 'wiki/armouring', get: (d) => ((d.globalData || {}).raids || {}).total || 0, tiers: [5, 25, 100, 400, 1500] },
    { id: 'wars', name: 'Warmonger', what: 'Guild wars fought', icon: 'wiki/guild-banner-tier-3', get: (d) => (d.globalData || {}).wars || 0, tiers: [1, 50, 300, 1500, 6000] },
    { id: 'pvp', name: 'Duelist', what: 'PvP kills', icon: 'wiki/assassin', get: (d) => (((d.globalData || {}).pvp) || {}).kills || 0, tiers: [10, 100, 500, 2500, 10000] },
    { id: 'prof', name: 'Artisan', what: 'Highest profession level', iconFn: (d) => 'wiki/' + maxProf(d)[0], get: (d) => maxProf(d)[1], tiers: [25, 50, 75, 100, 132], fmt: (v, d) => `${W.cap(maxProf(d)[0])} ${v}` },
    { id: 'chars', name: 'Many Faces', what: 'Characters on the account', icon: 'wiki/3d-players', get: (d) => chars(d).length, tiers: [2, 4, 7, 10, 14] },
    { id: 'rank', name: 'Leaderboard', what: 'Best spot on any Wynncraft leaderboard', icon: 'ui/speed', get: bestRank, tiers: [50000, 10000, 1000, 100, 10], low: true, fmt: (v) => isFinite(v) ? '#' + v.toLocaleString() : 'not ranked' },
    { id: 'guild', name: 'Guildmate', what: 'Rank in a guild', icon: 'wiki/3d-guilds', get: (d) => d.guild ? (['RECRUIT', 'RECRUITER', 'CAPTAIN', 'STRATEGIST', 'CHIEF', 'OWNER'].indexOf(d.guild.rank) + 1) : 0,
      tiers: [1, 2, 3, 5, 6], fmt: (v, d) => d.guild ? `${W.cap(String(d.guild.rank).toLowerCase())} of ${d.guild.name}` : 'no guild' },
  ];

  const tierOf = (b, v) => b.tiers.reduce((t, need, i) => (b.low ? v <= need : v >= need) ? i + 1 : t, 0);

  W.badges = (d) => {
    const list = BADGES.map(b => {
      const v = b.get(d), t = tierOf(b, v);
      return { b, v, t, icon: b.iconFn ? b.iconFn(d) : b.icon };
    }).sort((x, y) => y.t - x.t);
    const earned = list.filter(x => x.t > 0);
    const show = (v, b) => b.fmt ? b.fmt(v, d) : Math.round(v).toLocaleString();
    const badge = ({ b, v, t, icon }) => {
      const col = t ? TIER[t - 1].c : LOCKED;
      const next = b.tiers[t];
      const node = el('div', { class: 'badge' + (t ? ' t' + t : ' locked') },
        el('img', { class: 'bgem', src: gem(col), alt: '' }),
        el('img', { class: 'bicon', src: `img/${icon}.webp`, alt: '' }),
        t ? el('span', { class: 'btier' }, t) : null);
      return W.tip(node, () => el('div', { class: 'badgetip' },
        el('div', { class: 'tt-name', style: { color: t ? col[0] : '#aab4bf' } }, b.name),
        el('div', { class: 'tt-sub' }, t ? `${TIER[t - 1].name} of V` : 'Not earned yet'),
        el('div', {}, b.what + ': ', el('b', {}, show(v, b))),
        next != null ? el('div', { class: 'bnext' },
          el('small', {}, `Tier ${ROMAN[t]} at ${b.fmt && b.id !== 'prof' && b.id !== 'guild' ? b.fmt(next, d) : b.low ? '#' + next.toLocaleString() : next.toLocaleString()}`),
          el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: Math.max(2, Math.min(100, b.low ? (isFinite(v) ? next / v * 100 : 0) : v / next * 100)) + '%', '--c': 'var(--gold)' } })))
          : el('small', {}, 'Highest tier reached.')));
    };
    const box = W.win(`Badges · ${earned.length} of ${BADGES.length}`,
      el('div', { class: 'badgegrid' }, list.map(badge)),
      el('p', { class: 'hint' }, 'Earned from public Wynncraft stats. Hover a badge to see what it’s for and how far the next tier is. The gem colour shows the tier, from green (I) to purple (V).'));
    return box;
  };
})(window.W);
