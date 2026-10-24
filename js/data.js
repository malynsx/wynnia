/* Static game data. Sources: Wynncraft Wiki (Mounts / Horses) and community guides.
   Anything marked ASSUMED is not confirmed by the wiki. */
window.W = window.W || {};
(function (W) {
  W.STATS = [
    { k: 'speed',     name: 'Speed',        color: '#ffe455', note: 'Maximum speed.' },
    { k: 'accel',     name: 'Acceleration', color: '#ffaa00', note: 'How quickly the mount reaches top speed.' },
    { k: 'jump',      name: 'Jump Height',  alt: 'Altitude', color: '#55ffff', note: 'Jump height. Maximum flying height on Wyverns (Altitude).' },
    { k: 'energy',    name: 'Energy',       color: '#55ff55', note: 'Maximum Energy. At 0 Energy you slow down and stat powerups stop levelling.' },
    { k: 'handling',  name: 'Handling',     color: '#6f9bff', note: 'Turn response, speed lost in turns and step-up height.' },
    { k: 'toughness', name: 'Toughness',    color: '#c4c4c4', note: 'Lowers the chance of being dismounted when damaged.' },
    { k: 'boost',     name: 'Boost',        color: '#ff7bff', note: 'Strengthens boost powerups.' },
    { k: 'training',  name: 'Training',     color: '#ff6b5e', note: 'Increases the levels gained from stat powerups.' },
  ];
  W.STATKEYS = W.STATS.map(s => s.k);
  W.statName = (s, type) => (type === 'wyvern' && s.alt) ? s.alt : s.name;

  W.TYPES = {
    horse:   { name: 'Horse',   items: 'Saddle · Whistle', home: 'Ternaves Ranch, Wynn',     level: 9,   quest: 'Stable Story',     where: 'Ternaves  [856, 70, 1640]',   trait: 'Highest top speed, good handling, slow acceleration.', training: 'Detlas — it is flat.' },
    wyvern:  { name: 'Wyvern',  items: 'Reins · Flute',    home: 'Bantisu Quarters, Gavel',  level: 84,  quest: 'The Canyon Guides', where: 'Bantisu Air Temple  [498, 107, -4740]', trait: 'Flies up to a maximum height. Slower speed and acceleration.', training: 'The ocean — flat, no monsters.' },
    adasaur: { name: 'Adasaur', items: 'Harness · Ocarina', home: 'Aldwell Sanctuary, Fruma', level: 115, quest: 'Burning Bonds',     where: 'Aldwell  [-1230, 59, -729]',  trait: 'Quick acceleration and high step height, poor handling.', training: 'Detlas — it is flat.' },
  };

  /* Crowd-sourced spawn rates from WynnToolZ, as listed on the wiki Horses page. */
  W.BODY_COLORS = [
    ['Bay', 34.9, '#7a4326'], ['Gray', 17.4, '#8a8a8a'], ['Black', 16.4, '#25232a'], ['Silver', 7.2, '#bcc0c8'],
    ['Cherry', 6.6, '#8a2f28'], ['Chestnut', 6, '#a8592b'], ['Beige', 4.2, '#d9c498'], ['Tan', 3.7, '#bb9660'],
    ['Gold', 2, '#dbac2c'], ['White', 1.6, '#f4f2ec'],
  ];
  W.MANE_COLORS = [
    ['Argent', 20.9, '#d9dce1'], ['Night', 17.9, '#181a26'], ['Dawn', 16.5, '#eab9a0'], ['Reddish', 12.4, '#ad472d'],
    ['Fawn', 9, '#c9a47b'], ['Dusk', 8.4, '#5f4d73'], ['Pale', 7.2, '#e8dec9'], ['Ash', 3.3, '#9c9c97'],
    ['Sable', 2.4, '#30251d'], ['Rich', 2.1, '#5b2b15'],
  ];
  W.colorHex = (name) => {
    const f = W.BODY_COLORS.concat(W.MANE_COLORS).find(c => c[0] === name);
    return f ? f[2] : '#888';
  };

  /* Feeding. */
  W.POINT_ANCHORS = [[1,12],[10,15],[20,17.5],[30,20],[40,22],[50,25.5],[60,28],[70,30.5],[80,32.5],[90,35.5],[100,38],[105,39],[110,41],[115,41.5]];
  W.matPoints = (lvl) => {
    const a = W.POINT_ANCHORS;
    if (lvl <= a[0][0]) return a[0][1];
    for (let i = 1; i < a.length; i++) {
      if (lvl <= a[i][0]) {
        const [x0, y0] = a[i - 1], [x1, y1] = a[i];
        return Math.round(y0 + (y1 - y0) * (lvl - x0) / (x1 - x0));
      }
    }
    return Math.round(a[a.length - 1][1]);
  };

  /* Stats listed in the order the material tooltip lists them: first gets the most. */
  W.MATS = [
    { k: 'ingot',  name: 'Ingot',  stats: ['toughness', 'energy'] },
    { k: 'gem',    name: 'Gem',    stats: ['training', 'speed', 'energy'] },
    { k: 'plank',  name: 'Plank',  stats: ['accel', 'toughness', 'speed'] },
    { k: 'paper',  name: 'Paper',  stats: ['jump', 'boost'] },
    { k: 'string', name: 'String', stats: ['boost', 'handling', 'accel'] },
    { k: 'grain',  name: 'Grains', stats: ['speed', 'jump'] },
    { k: 'oil',    name: 'Oil',    stats: ['handling', 'training', 'jump'] },
    { k: 'meat',   name: 'Meat',   stats: ['energy', 'accel'] },
  ];
  /* 2 stats -> 2:1, 3 stats -> 3:2:1  (matches Level 1 Oak Plank 6/4/2 and Oak Paper 8/4). */
  W.splitMat = (cat, lvl) => {
    const total = W.matPoints(lvl);
    const w = cat.stats.length === 2 ? [2, 1] : [3, 2, 1];
    const sum = w.reduce((a, b) => a + b, 0);
    const raw = w.map(x => total * x / sum);
    const out = raw.map(Math.floor);
    let rest = total - out.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest-- > 0) out[i]++; });
    const res = {};
    cat.stats.forEach((s, i) => res[s] = out[i]);
    return res;
  };

  /* Minutes per material, keyed by the mount's average limit (rounded up). 11 is not documented: ASSUMED. */
  W.FEED_TIMES = { 10: 1, 11: 2, 12: 5, 13: 15, 14: 30, 15: 60, 16: 120, 17: 180, 18: 240, 19: 300, 20: 360 };
  W.feedMinutes = (avgLimitCeil) => avgLimitCeil >= 20 ? 360 : (avgLimitCeil < 10 ? 1 : W.FEED_TIMES[avgLimitCeil]);

  W.BREED_MIN_AVG = 20;
  W.BREED_HOURS = 6;

  W.RANKS = [
    { min: 0,   name: 'Common',    color: '#ffffff' },
    { min: 300, name: 'Unique',    color: '#ffff55' },
    { min: 400, name: 'Rare',      color: '#ff55ff' },
    { min: 520, name: 'Legendary', color: '#55ffff' },
    { min: 700, name: 'Fabled',    color: '#ff5555' },
    { min: 950, name: 'Mythic',    color: '#b05cff' },
  ];
  W.rank = (pot) => { let r = W.RANKS[0]; for (const x of W.RANKS) if (pot >= x.min) r = x; return r; };

  W.POWERUPS = [
    ['Yellow arrow', 'Speed level', 'speed'], ['Two blue arrows', 'Acceleration level', 'accel'],
    ['White staircase', 'Jump / Altitude level', 'jump'], ['Green thunder', 'Energy level', 'energy'],
    ['Orange saddle', 'Handling level', 'handling'], ['Grey armor', 'Toughness level', 'toughness'],
    ['Purple plus', 'Boost level', 'boost'], ['Orange weight', 'Training level', 'training'],
    ['Blue boot', 'Temporary speed boost (rare)', null], ['Green battery', 'Restores some Energy (rare)', null],
  ];
})(window.W);
