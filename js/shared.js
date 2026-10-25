/* Things every section uses: themes, lazy data files, item tiers and identification names, emerald maths. */
(function (W) {
  const { el } = W;
  W.pages = W.pages || {};

  /* ---------- Themes (named after Wynn's provinces) ---------- */
  W.themes = {
    list: [
      ['wynn', 'Wynn', '#86a9bf'], ['gavel', 'Gavel', '#d9b98a'], ['corkus', 'Corkus', '#8fb5ae'],
      ['fruma', 'Fruma', '#dbe7ef'], ['expanse', 'Silent Expanse', '#3a2f4d'],
    ],
    get() { try { return localStorage.getItem('wt.theme') || 'wynn'; } catch (e) { return 'wynn'; } },
    set(t) {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem('wt.theme', t); } catch (e) { /* storage blocked */ }
      document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    },
    init() {
      const box = document.getElementById('themes');
      box.replaceChildren(...W.themes.list.map(([k, name, c]) =>
        el('button', { class: 'swatch', 'data-t': k, title: name + ' theme', 'aria-label': name + ' theme', style: { background: c }, onclick: () => W.themes.set(k) })));
      W.themes.set(W.themes.get());
    },
  };

  /* ---------- Data files (data/*.json, built by tools/build_data.py) ---------- */
  const cache = {};
  W.data = (name) => cache[name] || (cache[name] = fetch(`data/${name}.json`).then(r => {
    if (!r.ok) throw new Error('Could not load ' + name);
    return r.json();
  }));
  /* Render a "loading" panel, then the real content once every file has arrived. */
  W.withData = (root, names, render) => {
    root.replaceChildren(W.win('Loading', el('p', { class: 'empty' }, 'Loading game data…')));
    Promise.all(names.map(W.data)).then(d => render(...d)).catch(e =>
      root.replaceChildren(W.win('Something went wrong', el('div', { class: 'warn' }, e.message))));
  };

  /* ---------- Wynncraft API ---------- */
  /* Browsers can't call api.wynncraft.com directly from another site (it sends no CORS headers),
     so live lookups go through the Wynntools relay in proxy/worker.js. Put its address here once deployed. */
  W.API_RELAY = 'https://api-wynntools.connormaltren.workers.dev';
  W.api = async (path) => {
    if (!W.API_RELAY) throw new Error('Live player and guild lookups aren’t switched on yet: the Wynncraft API only answers other websites through the Wynntools relay, which hasn’t been set up.');
    let r;
    try { r = await fetch(W.API_RELAY.replace(/\/$/, '') + '/v3/' + path); }
    catch (e) { throw new Error('Could not reach the lookup service. Check your connection and try again.'); }
    const raw = await r.text();
    let j; try { j = JSON.parse(raw); } catch (e) { j = null; }
    if (r.status === 404 && j === null) throw new Error('The lookup relay doesn’t allow this request yet. Update the Cloudflare worker with the latest proxy/worker.js.');
    j = j || {};
    if (r.status === 404) throw new Error('Nothing was found with that name.');
    if (r.status === 429) throw new Error('The Wynncraft API is busy right now (rate limit). Try again in a minute.');
    if (r.status === 300) return { multiple: j };
    if (!r.ok) throw new Error(j.Error || j.message || `The Wynncraft API answered with error ${r.status}.`);
    return j;
  };

  /* ---------- Items ---------- */
  W.TIERS = {
    normal: ['Normal', '#ffffff'], unique: ['Unique', '#ffff55'], rare: ['Rare', '#ff55ff'], legendary: ['Legendary', '#55ffff'],
    fabled: ['Fabled', '#ff5555'], mythic: ['Mythic', '#aa00aa'], set: ['Set', '#55ff55'],
  };
  W.tierColor = (t) => (W.TIERS[t] || W.TIERS.normal)[1];
  W.ING_STARS = ['#aaaaaa', '#ffff55', '#ff55ff', '#55ffff'];

  const NAMES = {
    rawStrength: 'Strength', rawDexterity: 'Dexterity', rawIntelligence: 'Intelligence', rawDefence: 'Defence', rawAgility: 'Agility',
    walkSpeed: 'Walk Speed', healthRegenRaw: 'Health Regen', healthRegen: 'Health Regen', rawHealth: 'Health', manaRegen: 'Mana Regen',
    manaSteal: 'Mana Steal', lifeSteal: 'Life Steal', combatExperience: 'Combat XP Bonus', lootBonus: 'Loot Bonus', xpBonus: 'XP Bonus',
    gatherXpBonus: 'Gather XP Bonus', gatherSpeed: 'Gather Speed', lootQuality: 'Loot Quality', rawMaxMana: 'Max Mana',
    rawAttackSpeed: 'Attack Speed', mainAttackRange: 'Main Attack Range', jumpHeight: 'Jump Height', exploding: 'Exploding',
    reflection: 'Reflection', thorns: 'Thorns', poison: 'Poison', stealing: 'Stealing', knockback: 'Knockback', sprint: 'Sprint',
    sprintRegen: 'Sprint Regen', slowEnemy: 'Slow Enemy', weakenEnemy: 'Weaken Enemy', healingEfficiency: 'Healing Efficiency',
    criticalDamageBonus: 'Critical Damage Bonus', damage: 'Damage', rawDamage: 'Damage', elementalDamage: 'Elemental Damage',
    elementalDefence: 'Elemental Defence',
  };
  const PER = { manaRegen: '/5s', manaSteal: '/3s', lifeSteal: '/3s', poison: '/3s' };
  const FLAT = new Set(['manaRegen', 'manaSteal', 'lifeSteal', 'poison', 'jumpHeight', 'healthRegenRaw', 'rawAttackSpeed']);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const words = (s) => cap(s.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/(\d)(st|nd|rd|th) /, '$1$2 '));
  /* Identification key -> { name, unit } where unit is '%', '' or '/3s' etc. Spell costs are "good" when negative. */
  W.idInfo = (key) => {
    let k = key, raw = false;
    if (k.startsWith('raw')) { raw = true; k = k.charAt(3).toLowerCase() + k.slice(4); }
    if (k.endsWith('Raw')) { raw = true; k = k.slice(0, -3); }
    let name = NAMES[key] || NAMES[k] || words(k);
    name = name.replace(/^(\d)(st|nd|rd|th) Spell Cost$/, '$1$2 Spell Cost');
    const unit = PER[key] || (raw || FLAT.has(key) ? '' : '%');
    return { name, unit, inverse: /SpellCost$/i.test(key) };
  };
  W.fmtId = (key, v) => {
    const { unit } = W.idInfo(key), s = (n) => (n > 0 ? '+' : '') + n + unit;
    return Array.isArray(v) ? (v[0] === v[1] ? s(v[0]) : `${s(v[0])} to ${s(v[1])}`) : s(v);
  };
  W.idGood = (key, v) => { const n = Array.isArray(v) ? v[1] : v; return W.idInfo(key).inverse ? n < 0 : n > 0; };

  W.BASE_NAMES = {
    health: 'Health', baseHealth: 'Health', earthDefence: 'Earth Defence', thunderDefence: 'Thunder Defence', waterDefence: 'Water Defence',
    fireDefence: 'Fire Defence', airDefence: 'Air Defence', baseEarthDefence: 'Earth Defence', baseThunderDefence: 'Thunder Defence',
    baseWaterDefence: 'Water Defence', baseFireDefence: 'Fire Defence', baseAirDefence: 'Air Defence',
    baseDamage: 'Neutral Damage', baseEarthDamage: 'Earth Damage', baseThunderDamage: 'Thunder Damage', baseWaterDamage: 'Water Damage',
    baseFireDamage: 'Fire Damage', baseAirDamage: 'Air Damage',
  };
  W.ELEM = { earth: '#00aa00', thunder: '#ffff55', water: '#55ffff', fire: '#ff5555', air: '#ffffff', neutral: '#ffaa00' };
  W.baseColor = (k) => { const m = /(earth|thunder|water|fire|air)/i.exec(k); return m ? W.ELEM[m[1].toLowerCase()] : (/health/i.test(k) ? '#ff5555' : '#ffaa00'); };

  /* Wynncraft-style item tooltip. */
  W.itemCard = (it, opts = {}) => {
    const lines = [];
    const order = (k) => ['ealth', 'Damage', 'earth', 'thunder', 'water', 'fire', 'air'].findIndex(w => k.toLowerCase().includes(w.toLowerCase())) * 2 + (/Defence/.test(k) ? 1 : 0);
    if (it.b) Object.entries(it.b).sort((a, b) => order(a[0]) - order(b[0])).forEach(([k, v]) => lines.push(el('div', { class: 'il' },
      el('span', { style: { color: W.baseColor(k) } }, W.BASE_NAMES[k] || words(k)), el('span', {}, Array.isArray(v) ? (v[0] === v[1] ? v[0] : `${v[0]}–${v[1]}`) : v))));
    const req = [];
    if (it.c) req.push(cap(it.c));
    req.push('Lv. ' + it.l);
    if (it.q) Object.entries(it.q).forEach(([k, v]) => req.push(`${cap(k).slice(0, 3)} ${v}`));
    const ids = it.i ? Object.entries(it.i).map(([k, v]) => el('div', { class: 'il' },
      el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v)), el('span', { class: 'idn' }, W.idInfo(k).name))) : [];
    return el('div', { class: 'icard' + (opts.compact ? ' compact' : '') },
      el('div', { class: 'ihead' }, el('div', { class: 'iicon' }, W.art.item(it.ic)),
        el('div', { class: 'ititle' }, el('div', { class: 'iname', style: { color: W.tierColor(it.r) } }, it.n),
          el('div', { class: 'isub' }, `${(W.TIERS[it.r] || ['Item'])[0]} ${cap(it.t)}${it.as ? ' · ' + words(it.as) + ' attack' : ''}`)),
        opts.action || null),
      lines.length ? el('div', { class: 'iblock' }, lines) : null,
      el('div', { class: 'ireq' }, req.join(' · ')),
      ids.length ? el('div', { class: 'iblock' }, ids) : null,
      it.m ? el('div', { class: 'imajor' }, 'Major ID: ', it.m.join(', ')) : null,
      el('div', { class: 'ifoot' }, [it.ps ? `${it.ps} powder slot${it.ps > 1 ? 's' : ''}` : null, it.dps ? `${it.dps} avg DPS` : null, it.rs ? cap(it.rs) : null].filter(Boolean).join(' · ')),
      opts.actions || null);
  };

  /* ---------- Emeralds: 64 E = 1 EB, 64 EB = 1 LE, 64 LE = 1 STX ---------- */
  W.fmtEm = (eb) => {
    if (!isFinite(eb)) return '—';
    const le = Math.floor(eb / 64), rest = eb - le * 64;
    if (le >= 64) return `${W.num(eb / 4096, 2)} stx`;
    return le ? `${le} LE ${rest ? W.num(rest, 1) + ' EB' : ''}`.trim() : `${W.num(eb, 1)} EB`;
  };

  /* ---------- Numbers and dates ---------- */
  W.short = (n) => {
    n = Number(n) || 0;
    const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']].find(([v]) => Math.abs(n) >= v);
    return u ? W.num(n / u[0], n / u[0] >= 100 ? 0 : 1) + u[1] : String(n);
  };
  W.ago = (iso) => {
    if (!iso) return null;
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 60) return Math.round(s / 86400) + ' days ago';
    return new Date(iso).toLocaleDateString();
  };

  /* ---------- Wynncraft visuals ---------- */
  W.rankBadge = (path, title) => path ? el('img', { class: 'rankbadge', src: 'https://cdn.wynncraft.com/' + path.replace(/^\//, ''), alt: title || '', title: title || '' }) : null;
  /* Wynntools staff tag, drawn like Wynncraft's pixel rank badges. Keyed by UUID so a name change keeps it. */
  W.STAFF = { '2974ac90-091f-442c-abc1-086564f57ce0': 'Admin' };
  /* 5px pixel letters, outlined like the HERO+ lettering */
  const GLYPH = { A: ['.##.', '#..#', '####', '#..#', '#..#'], D: ['###.', '#..#', '#..#', '#..#', '###.'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '###'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'] };
  const staffSvg = (label) => {
    const letters = label.toUpperCase().split('').map(c => GLYPH[c]).filter(Boolean);
    const textW = letters.reduce((a, g) => a + g[0].length + 1, -1);
    const w = 16 + textW + 6, H = 15;
    const px = (x, y, ww, hh, f) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${f}"/>`;
    let out = px(2, 0, w - 4, H, '#2a0808') + px(0, 2, w, H - 4, '#2a0808') + px(1, 1, w - 2, H - 2, '#2a0808')
      + px(2, 2, w - 4, H - 4, '#c62f2f') + px(2, 2, w - 4, 3, '#ec5a4c') + px(2, H - 4, w - 4, 2, '#8e1d1d')
      /* gold hex gem on the left, like the logo */
      + px(5, 4, 4, 7, '#f7d25e') + px(4, 5, 6, 5, '#f7d25e') + px(6, 5, 2, 2, '#fff6c2') + px(5, 9, 4, 1, '#d9ad2c') + px(4, 9, 1, 1, '#d9ad2c');
    const on = [];
    let x0 = 15;
    letters.forEach(g => { g.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') on.push([x0 + x, 5 + y]); })); x0 += g[0].length + 1; });
    const key = new Set(on.map(([x, y]) => x + ',' + y));
    const ring = new Set();
    on.forEach(([x, y]) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!key.has((x + dx) + ',' + (y + dy))) ring.add((x + dx) + ',' + (y + dy)); });
    ring.forEach(k => { const [x, y] = k.split(',').map(Number); out += px(x, y, 1, 1, '#2a0808'); });
    on.forEach(([x, y]) => { out += px(x, y, 1, 1, y >= 8 ? '#f7d25e' : '#fff6c2'); });
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${H}" width="${w * 2}" height="${H * 2}" shape-rendering="crispEdges">${out}</svg>`);
  };
  W.staffBadge = (uuid) => W.STAFF[uuid] ? el('img', { class: 'rankbadge staffbadge', src: staffSvg(W.STAFF[uuid]), alt: W.STAFF[uuid], title: `Wynntools ${W.STAFF[uuid].toLowerCase()}: made this site` }) : null;
  W.GUILD_RANKS = ['owner', 'chief', 'strategist', 'captain', 'recruiter', 'recruit'];
  W.rankStars = (rank) => { const n = 5 - W.GUILD_RANKS.indexOf(String(rank).toLowerCase()); return n > 0 && n <= 5 ? '★'.repeat(n) : ''; };
  W.CLASS_ART = { archer: 'archer', hunter: 'archer', warrior: 'warrior', knight: 'warrior', mage: 'mage', darkwizard: 'mage', assassin: 'assassin', ninja: 'assassin', shaman: 'shaman', skyseer: 'shaman' };
  W.head = (uuid, size = 64) => el('img', { class: 'head', src: `https://mc-heads.net/avatar/${uuid}/${size}`, alt: '', width: size, height: size, loading: 'lazy' });

  /* Guild banner drawn from Minecraft's own pattern textures (img/banner, front face 20x40). */
  const DYES = { WHITE: '#f9fffe', ORANGE: '#f9801d', MAGENTA: '#c74ebd', LIGHT_BLUE: '#3ab3da', YELLOW: '#fed83d', LIME: '#80c71f', PINK: '#f38baa', GRAY: '#474f52',
    LIGHT_GRAY: '#9d9d97', SILVER: '#9d9d97', CYAN: '#169c9c', PURPLE: '#8932b8', BLUE: '#3c44aa', BROWN: '#835432', GREEN: '#5e7c16', RED: '#b02e26', BLACK: '#1d1d21' };
  const PATTERN_FILE = { STRIPE_SMALL: 'small_stripes', CIRCLE_MIDDLE: 'circle', RHOMBUS_MIDDLE: 'rhombus', DIAGONAL_LEFT_MIRROR: 'diagonal_up_left', DIAGONAL_RIGHT_MIRROR: 'diagonal_up_right',
    HALF_VERTICAL_MIRROR: 'half_vertical_right', HALF_HORIZONTAL_MIRROR: 'half_horizontal_bottom' };
  const texCache = {};
  const tex = (name) => texCache[name] || (texCache[name] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `img/banner/${name}.png`; }));
  W.banner = (b) => {
    const c = el('canvas', { class: 'banner', width: 20, height: 40 });
    if (!b) return c;
    const g = c.getContext('2d');
    const layer = async (file, colour) => {
      const img = await tex(file), o = document.createElement('canvas'); o.width = 20; o.height = 40;
      const x = o.getContext('2d');
      x.drawImage(img, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = DYES[colour] || '#888'; x.fillRect(0, 0, 20, 40);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
      g.drawImage(o, 0, 0);
    };
    (async () => {
      try {
        await layer('base', b.base || 'WHITE');
        for (const l of b.layers || []) await layer(PATTERN_FILE[l.pattern] || String(l.pattern).toLowerCase(), l.colour);
      } catch (e) { /* missing texture: keep what is drawn */ }
    })();
    return c;
  };

  /* Wynncraft's tooltip HTML -> safe DOM: keeps only text colour, turns its private-use icon glyphs into
     the element symbols, and applies Minecraft § colour codes. Nothing else from the source is kept. */
  const GLYPHS = { '': '❋', '': '✤', '': '✹', '': '✦', '': '❉', '': '✣' };
  const MC = { 0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa', 8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff' };
  W.mcHtml = (html) => {
    const src = new DOMParser().parseFromString([].concat(html || '').join('<br>'), 'text/html').body;
    const out = document.createElement('div');
    const text = (s, parent) => {
      s = s.replace(/[-]/g, (c) => GLYPHS[c] || '◆');
      let cur = parent;
      s.split(/(§[0-9a-fk-or])/i).forEach(part => {
        const m = /^§([0-9a-fk-or])$/i.exec(part);
        if (!m) { if (part) cur.append(part); return; }
        const code = m[1].toLowerCase();
        if (MC[code]) { cur = document.createElement('span'); cur.style.color = MC[code]; parent.append(cur); }
        else if (code === 'r') cur = parent;
      });
    };
    const walk = (node, parent) => node.childNodes.forEach(n => {
      if (n.nodeType === 3) return text(n.textContent, parent);
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { parent.append(document.createElement('br')); return; }
      const span = document.createElement('span');
      const colour = n.style && n.style.color;
      if (colour) span.style.color = colour;
      parent.append(span); walk(n, span);
    });
    walk(src, out);
    return out;
  };

  W.cap = cap; W.words = words;
  W.copyText = (text, btn) => {
    try { navigator.clipboard.writeText(text).catch(() => {}); } catch (e) { /* manual copy */ }
    if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1200); }
  };
})(window.W);
