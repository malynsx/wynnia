/* Wynnia Discord bot (Cloudflare Worker, Discord "interactions endpoint": no server to keep running).

   Discord sends each slash command here as an HTTP request. The worker checks Discord's signature, answers
   "thinking…" at once, then fills the answer in (game data from the Wynnia site, live data from the Wynncraft API,
   prices through the Wynnia relay).

   Settings (Cloudflare > the worker > Settings > Variables and Secrets):
     DISCORD_PUBLIC_KEY  text    General Information > Public Key, in the Discord developer portal
     DISCORD_APP_ID      text    General Information > Application ID
     DISCORD_TOKEN       secret  Bot > Reset Token
     REGISTER_KEY        secret  any password you make up; opening /register?key=<it> (re)creates the slash commands
   and a service binding (Settings > Bindings > Service binding) named RELAY to the relay worker: Cloudflare won't let
   one worker fetch another on the same workers.dev address, so short links and prices go through that binding.

   Routes: POST /interactions (set as the Interactions Endpoint URL), GET /register?key=… */
const SITE = 'https://malynsx.github.io/wynnia/';
const RELAY = 'https://api-wynntools.connormaltren.workers.dev';
const WYNN = 'https://api.wynncraft.com/v3/';
const UA = { 'User-Agent': 'Wynnia Discord bot (github.com/malynsx/wynnia)' };
const GOLD = 0xffd65a;
const STORE_RANK = { vip: 'VIP', vipplus: 'VIP+', hero: 'HERO', heroplus: 'HERO+', champion: 'CHAMPION' };
const TIER = { normal: 0xffffff, unique: 0xffff55, rare: 0xff55ff, legendary: 0x55ffff, fabled: 0xff5555, mythic: 0xaa00aa, set: 0x55ff55, crafted: 0x00aaaa };

/* ---------- slash commands ---------- */
const COMMANDS = [
  { name: 'item', description: 'An item’s stats and trade market price', options: [{ type: 3, name: 'name', description: 'Item name', required: true, autocomplete: true }] },
  { name: 'price', description: 'Trade market price of an item', options: [{ type: 3, name: 'item', description: 'Item name', required: true, autocomplete: true }] },
  { name: 'player', description: 'A player’s characters, guild and status', options: [{ type: 3, name: 'name', description: 'Username', required: true }] },
  { name: 'guild', description: 'A guild: raiding or war guild, members, territories, season', options: [{ type: 3, name: 'name', description: 'Guild name or tag', required: true }] },
  { name: 'build', description: 'Show a Wynnia build link: gear, level and a link to open it', options: [{ type: 3, name: 'link', description: 'A Wynnia build link (malynsx.github.io/wynnia/#s/…)', required: true }] },
  { name: 'lootpool', description: 'This week’s mythics in each lootrun camp and raid', options: [{ type: 3, name: 'where', description: 'Only this camp or raid', required: false, autocomplete: true }] },
  { name: 'events', description: 'World events starting in the next 15 minutes', options: [{ type: 4, name: 'level', description: 'Only events near this level', required: false, min_value: 1, max_value: 132 }] },
  { name: 'wynnia', description: 'Links to the Wynnia tools' },
];

/* ---------- helpers ---------- */
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const hex = (s) => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1).toLowerCase();
const num = (n) => Math.round(n || 0).toLocaleString('en-US');
const short = (n) => { const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : num(n); };
const ts = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;   // Discord shows these in each reader's own time
const UNITS = [['stx', 262144], ['LE', 4096], ['EB', 64], ['E', 1]];
const emeralds = (n) => { n = Math.round(n || 0); if (!n) return '0 E'; const out = []; for (const [u, v] of UNITS) { const k = Math.floor(n / v); if (k) { out.push(k + ' ' + u); n -= k * v; } if (out.length === 2) break; } return out.join(' '); };

/* fetch JSON, kept in Cloudflare's cache for `ttl` seconds */
async function getJSON(url, ttl, ctx) {
  const cache = caches.default, key = new Request(url);
  let res = await cache.match(key);
  if (!res) {
    /* the relay is reached through the RELAY service binding when there is one (see the note at the top) */
    const viaBinding = url.startsWith(RELAY) && ctx.env && ctx.env.RELAY;
    const up = await (viaBinding ? ctx.env.RELAY.fetch(new Request(url, { headers: UA })) : fetch(url, { headers: UA }));
    if (!up.ok) { const e = new Error(up.status === 404 ? 'not found' : 'HTTP ' + up.status); e.status = up.status; throw e; }
    res = new Response(up.body, up);
    res.headers.set('Cache-Control', 'public, max-age=' + ttl);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res.json();
}
/* the site's item list stays in memory between commands */
let ITEMS = null;
const items = async (ctx) => ITEMS || (ITEMS = await getJSON(SITE + 'data/items.json', 3600, ctx));
const findItem = (list, q) => { q = String(q || '').trim().toLowerCase(); return list.find(i => i.n.toLowerCase() === q) || list.find(i => i.n.toLowerCase().startsWith(q)) || list.find(i => i.n.toLowerCase().includes(q)); };
const itemIcon = (i) => i && i.ic ? SITE + 'img/items/' + encodeURIComponent(i.ic) : SITE + 'brand/wynnia-ring-128.png';

/* identification names, roughly as the game writes them */
const ID_NAMES = { rawHealth: 'Health', healthRegenRaw: 'Health Regen', healthRegen: 'Health Regen %', manaRegen: 'Mana Regen', manaSteal: 'Mana Steal', lifeSteal: 'Life Steal', walkSpeed: 'Walk Speed', spellDamage: 'Spell Damage', rawSpellDamage: 'Spell Damage', mainAttackDamage: 'Main Attack Damage', rawMainAttackDamage: 'Main Attack Damage', rawAttackSpeed: 'Attack Speed', rawStrength: 'Strength', rawDexterity: 'Dexterity', rawIntelligence: 'Intelligence', rawDefence: 'Defence', rawAgility: 'Agility', criticalDamageBonus: 'Critical Damage' };
const PER = { manaRegen: '/5s', manaSteal: '/3s', lifeSteal: '/3s', healthRegenRaw: '/4s', poison: '/3s' };
const RAW_FLAT = new Set(['rawHealth', 'healthRegenRaw', 'manaRegen', 'manaSteal', 'lifeSteal', 'rawAttackSpeed', 'rawStrength', 'rawDexterity', 'rawIntelligence', 'rawDefence', 'rawAgility', 'poison', 'rawMaxMana']);
const idName = (k) => ID_NAMES[k] || k.replace(/^raw/, '').replace(/([A-Z0-9])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
const idVal = (k, v) => { const unit = PER[k] || (k.startsWith('raw') || RAW_FLAT.has(k) || k.endsWith('Raw') ? '' : '%'); const f = (n) => (n > 0 ? '+' : '') + n + unit; return Array.isArray(v) ? (v[0] === v[1] ? f(v[0]) : `${f(v[0])} to ${f(v[1])}`) : f(v); };

/* { p, low, n } when it has sold lately, null when it hasn't, { err } when the relay couldn't be asked */
async function price(name, ctx) {
  try {
    const j = await getJSON(`${RELAY}/market/price/${encodeURIComponent(name)}`, 600, ctx), d = j && j.data;
    if (!d) return null;
    const p = ['average_mid_80_percent_price', 'p50_price', 'average_price', 'lowest_price'].map(k => d[k]).find(v => v > 0);
    return p ? { p, low: d.lowest_price, n: d.total_count } : null;
  } catch (e) {
    if (e.status === 404) return null;   // Wynnventory has no record of it
    return { err: !(ctx.env && ctx.env.RELAY) ? 'Couldn’t ask for prices: the bot has no RELAY service binding.'
      : e.status === 503 ? 'Prices are switched off on the relay (no Wynnventory key).' : `Couldn’t reach the price service (${e.message}).` };
  }
}

/* ---------- commands ---------- */
const H = {
  async item(o, ctx) {
    const it = findItem(await items(ctx), o.name);
    if (!it) return { content: `No item called “${o.name}”.` };
    const req = Object.entries(it.q || {}).filter(([, v]) => v).map(([k, v]) => `${cap(k)} ${v}`).join(' · ');
    const base = it.b || {}, bits = [];
    if (base.baseHealth) bits.push(`Health ${Array.isArray(base.baseHealth) ? base.baseHealth.join('–') : base.baseHealth}`);
    const dmg = Object.entries(base).filter(([k]) => /^base\w*Damage$/.test(k)).map(([k, v]) => `${k.replace(/^base|Damage$/g, '') || 'Neutral'} ${Array.isArray(v) ? v.join('–') : v}`);
    if (dmg.length) bits.push('Damage: ' + dmg.join(', '));
    if (it.as) bits.push(`${cap(it.as.replace(/([A-Z])/g, ' $1'))} attack speed`);
    const ids = Object.entries(it.i || {}).slice(0, 18).map(([k, v]) => `\`${idVal(k, v)}\` ${idName(k)}`).join('\n');
    const pr = await price(it.n, ctx);
    const fields = [];
    if (bits.length) fields.push({ name: 'Base', value: bits.join('\n'), inline: false });
    if (ids) fields.push({ name: 'Identifications', value: ids.slice(0, 1024), inline: false });
    if (it.m && it.m.length) fields.push({ name: 'Major ID', value: it.m.map(m => typeof m === 'string' ? m : m.n || JSON.stringify(m)).join(', ').slice(0, 1024) });
    fields.push({ name: 'Trade market', value: pr && pr.err ? pr.err : pr ? `${emeralds(pr.p)} typical · ${emeralds(pr.low)} cheapest · ${pr.n} listings` : 'Not seen lately', inline: false });
    return { embeds: [{ title: it.n, url: `${SITE}#items/search?q=${encodeURIComponent(it.n)}`, color: TIER[it.r] || GOLD,
      description: `${cap(it.r)} ${cap(it.t)} · Lv. ${it.l}${req ? '\nRequires ' + req : ''}`, thumbnail: { url: itemIcon(it) }, fields, footer: { text: 'Wynnia · stats from Wynntils, prices from Wynnventory' } }] };
  },

  async price(o, ctx) {
    const it = findItem(await items(ctx), o.item);
    if (!it) return { content: `No item called “${o.item}”.` };
    const pr = await price(it.n, ctx);
    return { embeds: [{ title: `${it.n} on the trade market`, url: `${SITE}#items/prices?i=${encodeURIComponent(it.n)}`, color: TIER[it.r] || GOLD, thumbnail: { url: itemIcon(it) },
      description: pr && pr.err ? pr.err : pr ? `**${emeralds(pr.p)}** typical price\n${emeralds(pr.low)} cheapest listing\n${pr.n} listings` : 'Not seen on the trade market lately.',
      footer: { text: 'Prices from Wynnventory · open the link for history and alerts' } }] };
  },

  async player(o, ctx) {
    let d;
    try { d = await getJSON(`${WYNN}player/${encodeURIComponent(o.name)}?fullResult`, 120, ctx); } catch (e) { return { content: e.status === 404 ? `No player called “${o.name}”.` : 'The Wynncraft API didn’t answer. Try again in a moment.' }; }
    if (d.multiple || !d.username) return { content: 'That name matches several players. Use the exact username.' };
    const chars = Object.values(d.characters || {}).sort((a, b) => (b.level || 0) - (a.level || 0)).slice(0, 6);
    const g = d.guild;
    return { embeds: [{ title: d.username, url: `${SITE}#players/lookup?u=${encodeURIComponent(d.username)}`, color: GOLD, thumbnail: { url: `https://mc-heads.net/avatar/${d.uuid}/128` },
      description: [d.online ? `Online on **${d.server}**` : d.lastJoin ? `Last seen ${ts(Date.parse(d.lastJoin))}` : null, g ? `${cap(g.rank)} of **${g.name}** [${g.prefix}]` : null, d.rank && d.rank !== 'Player' ? d.rank : (d.supportRank ? STORE_RANK[d.supportRank] || cap(d.supportRank) : null),
        `${Math.round(d.playtime || 0)} hours played`].filter(Boolean).join('\n'),
      fields: chars.length ? [{ name: 'Characters', value: chars.map(c => `**${cap(c.reskin || c.type)}** Lv. ${c.level}${c.nickname ? ` · ${c.nickname}` : ''} · total ${c.totalLevel || '—'}`).join('\n') }] : [],
      footer: { text: 'Wynnia · Next Steps on the site plans what to do next' } }] };
  },

  async guild(o, ctx) {
    const n = encodeURIComponent(o.name.trim()), tries = o.name.trim().length <= 4 ? [`guild/prefix/${n}`, `guild/${n}`] : [`guild/${n}`, `guild/prefix/${n}`];
    let d = null;
    for (const t of tries) { try { d = await getJSON(WYNN + t, 120, ctx); if (d && d.name) break; } catch (e) { d = null; } }
    if (!d || !d.name) return { content: `No guild called “${o.name}”.` };
    const type = !d.raids && !d.wars && !d.territories ? null : (d.raids || 0) > (d.wars || 0) || !d.territories ? 'Raiding guild' : 'War guild';
    const seasons = Object.entries(d.seasonRanks || {}).sort((a, b) => b[0] - a[0]);
    return { embeds: [{ title: `${d.name} [${d.prefix}]`, url: `${SITE}#guilds/lookup?g=${encodeURIComponent(d.name)}`, color: type === 'War guild' ? 0xff8a7a : type ? 0xc58cff : GOLD,
      description: [type ? `**${type}**` : null, `Level ${d.level} · ${d.online ?? 0} online · ${d.members ? d.members.total : '—'} members`, d.created ? `Founded ${ts(Date.parse(d.created), 'D')}` : null].filter(Boolean).join('\n'),
      fields: [
        { name: 'Territories', value: num(d.territories), inline: true }, { name: 'Wars', value: num(d.wars), inline: true }, { name: 'Guild raids', value: num(d.raids), inline: true },
        seasons[0] ? { name: `Season ${seasons[0][0]}`, value: `${num(seasons[0][1].rating)} rating`, inline: true } : null,
      ].filter(Boolean), footer: { text: 'Wynnia · raiding guild = more raids than wars, or no territory' } }] };
  },

  async build(o, ctx) {
    const m = /#s\/([A-Za-z0-9]{4,12})/.exec(o.link) || /\/b\/([A-Za-z0-9]{4,12})/.exec(o.link);
    let hash = /#(items\/loadout\?\S+)/.exec(o.link);
    hash = hash ? '#' + hash[1] : null;
    if (!hash && m) {
      try { hash = (await getJSON(`${RELAY}/s/${m[1]}`, 86400, ctx)).link; }
      catch (e) { return { content: e.status === 404 ? 'That short link doesn’t exist.' : ctx.env && ctx.env.RELAY ? 'Couldn’t reach the Wynnia relay. Try again in a moment.' : 'Couldn’t open the short link: the bot needs a RELAY service binding to the relay worker (see the note at the top of bot.js).' }; }
    }
    if (!hash || !/^#items\/loadout\?/.test(hash)) return { content: 'That isn’t a Wynnia build link.' };
    const q = new URLSearchParams(hash.split('?')[1]);
    const [list, ids, keys] = await Promise.all([items(ctx), getJSON(SITE + 'data/itemids.json', 3600, ctx), getJSON(SITE + 'data/idkeys.json', 3600, ctx)]);
    let b;
    try { b = decodeBuild(q.get('b') || '', { names: Object.fromEntries(Object.entries(ids).map(([n, i]) => [i, n])), keyName: keys }); } catch (e) { return { content: 'That build link is broken: ' + e.message }; }
    const byName = Object.fromEntries(list.map(i => [i.n, i]));
    const SLOT = { w: 'Weapon', h: 'Helmet', c: 'Chestplate', l: 'Leggings', b: 'Boots', r1: 'Ring', r2: 'Ring', br: 'Bracelet', n: 'Necklace' };
    const gear = Object.keys(SLOT).filter(k => b.s[k]).map(k => `**${SLOT[k]}:** ${b.s[k][0]}${b.s[k][2] ? ' ' + '◆'.repeat(b.s[k][2].length) : ''}`);
    const crafted = q.get('cr') ? ' (some gear is crafted: open the link to see it)' : '';
    const weapon = b.s.w && byName[b.s.w[0]];
    const tomes = Object.keys(b.s).filter(k => k[0] === 't').length;
    const url = m ? `${SITE}#s/${m[1]}` : SITE + hash;
    return { embeds: [{ title: q.get('n') || 'Wynnia build', url, color: weapon ? TIER[weapon.r] || GOLD : GOLD, thumbnail: { url: itemIcon(weapon) },
      description: `Level ${b.lvl}${tomes ? ` · ${tomes} mastery tomes` : ''}${crafted}\n\n${gear.join('\n') || 'No gear'}`,
      footer: { text: 'Open the link for damage, defence, skill points and the ability tree' } }] };
  },

  async lootpool(o, ctx) {
    let pools;
    try { pools = await getJSON(WYNN + 'map/loot-pools', 600, ctx); } catch (e) { return { content: 'The Wynncraft API didn’t answer. Try again in a moment.' }; }
    const want = (o.where || '').toLowerCase();
    const shown = pools.filter(p => !want || p.name.toLowerCase().includes(want)).slice(0, 12);
    if (!shown.length) return { content: `No camp or raid called “${o.where}”.` };
    const reset = nextPoolReset();
    return { embeds: [{ title: 'This week’s loot pools', url: `${SITE}#world/events`, color: TIER.mythic,
      description: `Pools change ${ts(reset)} (Friday 19:00 UTC).`,
      fields: shown.map(p => {
        const myth = p.rewards.filter(r => r.type === 'ITEM' && r.tier === 'MYTHIC').sort((a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0));
        return { name: p.name + (p.type === 'RAID' ? ' (raid)' : ''), value: (myth.map(r => r.shiny ? `**${r.name} (Shiny)**` : r.name).join(', ') || 'No mythics this week').slice(0, 1024), inline: false };
      }), footer: { text: 'Wynnia · reset time from Wynnpool; Wynncraft doesn’t publish one' } }] };
  },

  async events(o, ctx) {
    let ev;
    try { ev = await getJSON(WYNN + 'map/world-events', 60, ctx); } catch (e) { return { content: 'The Wynncraft API didn’t answer. Try again in a moment.' }; }
    const now = Date.now(), near = (e) => !o.level || Math.abs(e.level - o.level) <= 10;
    const soon = ev.filter(e => e.schedule && Date.parse(e.schedule) > now - 60000 && near(e)).sort((a, b) => Date.parse(a.schedule) - Date.parse(b.schedule)).slice(0, 15);
    return { embeds: [{ title: 'World events starting soon', url: `${SITE}#world/events`, color: 0x4fb3a9,
      description: soon.length ? soon.map(e => { const l = e.location && e.location[0] && e.location[0].event; return `**${e.name}** · Lv. ${e.level} · ${cap(e.difficulty)} · ${ts(Date.parse(e.schedule))}${l ? ` · ${l.x}, ${l.z}` : ''}`; }).join('\n')
        : 'Nothing starts in the next 15 minutes' + (o.level ? ' around that level.' : '.'),
      footer: { text: 'Wynncraft only lists events starting in the next 15 minutes' } }] };
  },

  async wynnia() { return panel('home'); },
};

/* ---------- the /wynnia panel ---------- */
/* One message you can click through: the home card, then a page per site section (its rank colour, its picture,
   a line about each tool and a button to open it). The menu and Home button edit the same message. */
const SECTIONS = [
  { k: 'items', name: 'Items', color: 0x6f8fb8, pic: 'img/wiki/3d-items.webp', blurb: 'Every item, your builds and what they cost.', pages: [
    ['loadout', 'Loadout Builder', 'Gear, exact rolls, powders, tomes, skill points and the ability tree, with damage worked out like the game.'],
    ['builds', 'Build Library', 'Save builds with tags and share them as short links.'],
    ['recommend', 'Recommended Build', 'The best gear for a class and archetype, or for your own character.'],
    ['prices', 'Prices', 'Trade market prices, price history and alerts when an item gets cheap.'],
    ['search', 'Search', 'Filter every item by type, level, class and identification.'],
    ['compare', 'Compare', 'Put items side by side.']] },
  { k: 'players', name: 'Players', color: 0xd16fa6, pic: 'img/wiki/3d-players.webp', blurb: 'Look anyone up and plan what to do next.', pages: [
    ['plan', 'Next Steps', 'A to-do list for your character: quests, raids, caves, professions and gear.'],
    ['lookup', 'Lookup', 'Characters, professions, badges, stats and their mounts.'],
    ['compare', 'Compare', 'Two players side by side.'],
    ['leaderboards', 'Leaderboards', 'The top 100 in every category.'],
    ['quests', 'Quest Checklist', 'What you’ve done and what’s left, by province.'],
    ['watchlist', 'Watchlist', 'Friends you follow, and who’s online.']] },
  { k: 'guilds', name: 'Guilds', color: 0xc9a75e, pic: 'img/wiki/3d-guilds.webp', blurb: 'Raiding guilds, war guilds and who holds what.', pages: [
    ['lookup', 'Lookup', 'Raiding or war guild, seasons, activity, raids by raid and every member.'],
    ['territories', 'Territories', 'Which guild holds every territory.']] },
  { k: 'world', name: 'World', color: 0x4fae9f, pic: 'img/guide/thecanyoncolossusicon.png', blurb: 'The map, live events and guides.', pages: [
    ['map', 'Map', 'World, guild territories and gathering nodes, with routes and share links.'],
    ['events', 'Events', 'World events starting soon, this week’s loot pools and season timers.'],
    ['raids', 'Raids', 'Every raid: requirements, rooms, bosses and rewards.'],
    ['lootruns', 'Lootruns', 'Camps, beacons, challenges, curses and rewards.'],
    ['caves', 'Caves', 'Every cave by level and difficulty.']] },
  { k: 'crafting', name: 'Crafting', color: 0x9c7cc4, pic: 'img/wiki/3d-crafting.webp', blurb: 'Plan crafts before you spend the ingredients.', pages: [
    ['combiner', 'Ingredient Combiner', 'Lay out ingredients and see what the craft rolls.'],
    ['finder', 'Ingredient Finder', 'The best ingredients for the bonuses you want.'],
    ['ingredients', 'Ingredients', 'Search every ingredient by bonus, profession and stars.']] },
  { k: 'professions', name: 'Professions', color: 0xd9894a, pic: 'img/wiki/3d-professions.webp', blurb: 'Level professions faster.', pages: [
    ['xp', 'XP Calculator', 'How much it takes to reach your next level.'],
    ['spots', 'Grinding Spots', 'Where to gather at every level.'],
    ['materials', 'Material Calculator', 'Materials, crafting XP and the level a batch of crafts gets you to.'],
    ['gathering', 'Gathering', 'What you can gather at your level, and what comes next.']] },
  { k: 'mounts', name: 'Mounts', color: 0x87b85b, pic: 'img/ui/flute.webp', blurb: 'Breed, feed and train better mounts.', pages: [
    ['stable', 'Stable', 'Paste mounts from Wynntils and keep them in one place.'],
    ['pairs', 'Pair Finder', 'Which two mounts make the best foal.'],
    ['feeder', 'Feeder', 'Pick two parents and see the predicted foal.'],
    ['lineage', 'Lineage', 'How many generations and how much feeding a goal takes.'],
    ['training', 'Training', 'A training plan for a mount, and what each powerup does.'],
    ['market', 'Market', 'Listings by price per Potential, against breeding one yourself.']] },
];
function panel(key) {
  const sec = SECTIONS.find(s => s.k === key);
  const menu = { type: 1, components: [{ type: 3, custom_id: 'wy:sec', placeholder: 'Browse a section…', options: [
    { label: 'Home', value: 'home', description: 'Everything Wynnia does', default: !sec },
    ...SECTIONS.map(s => ({ label: s.name, value: s.k, description: s.blurb.slice(0, 100), default: sec === s }))] }] };
  const link = (label, url) => ({ type: 2, style: 5, label, url });
  if (!sec) {
    return { embeds: [{ author: { name: 'Wynnia', url: SITE, icon_url: SITE + 'brand/wynnia-ring-64.png' }, title: 'Tools for Wynncraft', url: SITE, color: GOLD,
      thumbnail: { url: SITE + 'brand/wynnia-ring-256.png' },
      description: 'Builds, prices, players, guilds and the world map, all free and in your browser.\n​',
      fields: [
        ...SECTIONS.map(s => ({ name: s.name, value: `${s.blurb}\n${s.pages.slice(0, 3).map(p => `[${p[1]}](${SITE}#${s.k}/${p[0]})`).join(' · ')}`, inline: true })),
        { name: 'This week', value: `Loot pools change ${ts(nextPoolReset())}`, inline: true },
        { name: 'In Discord', value: '`/item` `/price` `/player` `/guild` `/build` `/lootpool` `/events`', inline: false },
      ], footer: { text: 'Pick a section below to see every tool in it', icon_url: SITE + 'brand/wynnia-ring-32.png' } }],
      components: [menu, { type: 1, components: [link('Open Wynnia', SITE), link('Loadout Builder', SITE + '#items/loadout'), link('Next Steps', SITE + '#players/plan'), link('Prices', SITE + '#items/prices'), link('Map', SITE + '#world/map')] }] };
  }
  const rows = [];
  for (let i = 0; i < sec.pages.length && rows.length < 2; i += 5) rows.push({ type: 1, components: sec.pages.slice(i, i + 5).map(p => link(p[1], `${SITE}#${sec.k}/${p[0]}`)) });
  rows.push({ type: 1, components: [{ type: 2, style: 2, label: 'Back to Home', custom_id: 'wy:home' }, link('Open Wynnia', SITE)] });
  return { embeds: [{ author: { name: 'Wynnia', url: SITE, icon_url: SITE + 'brand/wynnia-ring-64.png' }, title: sec.name, url: `${SITE}#${sec.k}`, color: sec.color,
    thumbnail: { url: SITE + sec.pic }, description: sec.blurb + '\n​',
    fields: sec.pages.map(p => ({ name: p[1], value: `${p[2]}\n[Open](${SITE}#${sec.k}/${p[0]})`, inline: true })),
    footer: { text: 'Wynnia · ' + sec.name, icon_url: SITE + 'brand/wynnia-ring-32.png' } }], components: [menu, ...rows] };
}

/* autocomplete for item names and loot pool names */
async function autocomplete(i, ctx) {
  const opt = (i.data.options || []).find(o => o.focused) || {}, q = String(opt.value || '').toLowerCase();
  if (i.data.name === 'lootpool') {
    let pools = []; try { pools = await getJSON(WYNN + 'map/loot-pools', 600, ctx); } catch (e) { /* no suggestions */ }
    return pools.filter(p => p.name.toLowerCase().includes(q)).slice(0, 25).map(p => ({ name: p.name, value: p.name }));
  }
  const list = await items(ctx);
  if (q.length < 1) return [];
  return list.filter(x => x.n.toLowerCase().includes(q)).sort((a, b) => a.n.toLowerCase().indexOf(q) - b.n.toLowerCase().indexOf(q) || a.n.length - b.n.length)
    .slice(0, 25).map(x => ({ name: `${x.n} (${cap(x.r)} ${x.t}, Lv. ${x.l})`.slice(0, 100), value: x.n }));
}

function nextPoolReset(now = Date.now()) {
  const d = new Date(now); d.setUTCHours(19, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d.getTime();
}

/* the same build code the site uses (js/buildcode.js), read only */
const SLOTS = ['h', 'c', 'l', 'b', 'r1', 'r2', 'br', 'n', 'w', ...Array.from({ length: 14 }, (_, i) => 't' + i)];
const SKILLS = ['strength', 'dexterity', 'intelligence', 'defence', 'agility'], ELEMS = ['earth', 'thunder', 'water', 'fire', 'air'];
function decodeBuild(code, ctx) {
  const bytes = Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  let i = 0;
  const byte = () => { if (i >= bytes.length) throw new Error('the build code is cut off'); return bytes[i++]; };
  const uint = () => { let v = 0, m = 1, x; do { x = byte(); v += (x & 127) * m; m *= 128; } while (x & 128); return v; };
  const int = () => { const n = uint(); return (n >>> 1) ^ -(n & 1); };
  if (byte() !== 1) throw new Error('unknown build code version');
  const b = { lvl: uint(), s: {} };
  byte(); SKILLS.forEach(() => int());
  const present = [];
  for (let k = 0; k < SLOTS.length; k += 8) { const v = byte(); for (let j = 0; j < 8; j++) present.push((v >> j) & 1); }
  SLOTS.forEach((k, n) => {
    if (!present[n]) return;
    const name = ctx.names[uint()];
    const nr = uint(); for (let j = 0; j < nr; j++) { uint(); int(); }
    const np = uint(), pw = []; for (let j = 0; j < np; j++) { const v = byte(); pw.push([ELEMS[v >> 3], v & 7]); }
    if (name) b.s[k] = [name, null, np ? pw : null];
  });
  return b;
}

/* ---------- Discord plumbing ---------- */
async function verify(request, body, env) {
  const sig = request.headers.get('X-Signature-Ed25519'), time = request.headers.get('X-Signature-Timestamp');
  if (!sig || !time || !env.DISCORD_PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(time + body));
  } catch (e) { return false; }
}

async function runCommand(i, env, ctx) {
  const o = Object.fromEntries((i.data.options || []).map(x => [x.name, x.value]));
  let msg;
  const c = { waitUntil: (p) => ctx.waitUntil(p), env };   // handlers reach the relay binding through c.env
  try { msg = H[i.data.name] ? await H[i.data.name](o, c) : { content: 'Unknown command.' }; }
  catch (e) { msg = { content: 'Something went wrong: ' + e.message }; }
  await fetch(`https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}/messages/@original`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ allowed_mentions: { parse: [] } }, msg)),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* create or update the slash commands (open once after deploying, and after adding commands) */
    if (url.pathname === '/register') {
      if (!env.REGISTER_KEY || url.searchParams.get('key') !== env.REGISTER_KEY) return new Response('Wrong or missing key.', { status: 403 });
      if (!env.DISCORD_APP_ID || !env.DISCORD_TOKEN) return new Response('Set DISCORD_APP_ID and DISCORD_TOKEN first.', { status: 500 });
      const r = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APP_ID}/commands`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bot ' + env.DISCORD_TOKEN }, body: JSON.stringify(COMMANDS),
      });
      const t = await r.text();
      return new Response(r.ok ? `Registered ${COMMANDS.length} commands: ${COMMANDS.map(c => '/' + c.name).join(', ')}. They can take a minute to show up in Discord.` : `Discord said ${r.status}: ${t}`, { status: r.ok ? 200 : 500 });
    }

    /* a quick check of the bot's settings and its connection to the relay: /status?key=<REGISTER_KEY> */
    if (url.pathname === '/status') {
      if (!env.REGISTER_KEY || url.searchParams.get('key') !== env.REGISTER_KEY) return new Response('Wrong or missing key.', { status: 403 });
      const lines = [];
      ['DISCORD_PUBLIC_KEY', 'DISCORD_APP_ID', 'DISCORD_TOKEN'].forEach(k => lines.push(`${env[k] ? 'OK     ' : 'MISSING'} ${k}`));
      lines.push(`${env.RELAY ? 'OK     ' : 'MISSING'} RELAY service binding${env.RELAY ? '' : ' (Settings > Bindings > Add > Service binding, variable name RELAY, service = the relay worker)'}`);
      const probe = async (label, path) => {
        try {
          const req = new Request(RELAY + path, { headers: UA });
          const r = await (env.RELAY ? env.RELAY.fetch(req) : fetch(req));
          const t = (await r.text()).slice(0, 160).replace(/\s+/g, ' ');
          lines.push(`${r.ok ? 'OK     ' : 'FAILED '} ${label}: HTTP ${r.status} ${t}`);
        } catch (e) { lines.push(`FAILED  ${label}: ${e.message}`); }
      };
      await probe('relay: Wynncraft API', '/v3/guild/prefix/ESI');
      await probe('relay: price of Freedom', '/market/price/Freedom');
      await probe('relay: a short link', '/s/fcDmDsg');
      return new Response('Wynnia bot status\n\n' + lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    if (url.pathname !== '/interactions' || request.method !== 'POST') return new Response('Wynnia Discord bot. Nothing to see here.', { status: 404 });
    const body = await request.text();
    if (!(await verify(request, body, env))) return new Response('Bad signature', { status: 401 });
    const i = JSON.parse(body);
    if (i.type === 1) return json({ type: 1 });                                         // Discord checking the endpoint
    if (i.type === 4) return json({ type: 8, data: { choices: await autocomplete(i, ctx).catch(() => []) } });
    if (i.type === 2 && i.data.name === 'wynnia') return json({ type: 4, data: panel('home') });   // instant, nothing to fetch
    if (i.type === 2) { ctx.waitUntil(runCommand(i, env, ctx)); return json({ type: 5 }); }   // "Wynnia is thinking…", then the answer
    if (i.type === 3) {                                                                   // the /wynnia menu and Home button: edit that message
      const id = i.data.custom_id;
      if (id === 'wy:sec') return json({ type: 7, data: panel((i.data.values || [])[0]) });
      if (id === 'wy:home') return json({ type: 7, data: panel('home') });
    }
    return json({ error: 'unknown interaction' }, 400);
  },
};
