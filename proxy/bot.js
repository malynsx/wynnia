/* Wynnia Discord bot (Cloudflare Worker, Discord "interactions endpoint": no server to keep running).

   Discord sends each slash command here as an HTTP request. The worker checks Discord's signature, answers
   "thinking…" at once, then fills the answer in (game data from the Wynnia site, live data from the Wynncraft API,
   prices through the Wynnia relay).

   Settings (Cloudflare > the worker > Settings > Variables and Secrets):
     DISCORD_PUBLIC_KEY  text    General Information > Public Key, in the Discord developer portal
     DISCORD_APP_ID      text    General Information > Application ID
     DISCORD_TOKEN       secret  Bot > Reset Token
     REGISTER_KEY        secret  any password you make up; opening /register?key=<it> (re)creates the slash commands
     ACCOUNTS            KV      (Bindings > KV namespace) where /link remembers whose username is whose
     DISCORD_CLIENT_SECRET secret OAuth2 > Client Secret, for "Log in with Discord" on the site
   and a service binding (Settings > Bindings > Service binding) named RELAY to the relay worker: Cloudflare won't let
   one worker fetch another on the same workers.dev address, so short links and prices go through that binding.
   For the site's login, add <this worker>/auth/callback under OAuth2 > Redirects in the Discord developer portal.

   Routes: POST /interactions (set as the Interactions Endpoint URL), GET /register?key=… (also uploads the bot's emoji),
   GET /auth/login and /auth/callback (Discord login for the site), /api/me, /api/link, /api/save (signed in),
   GET /api/linked?uuid=… (public: is this Wynncraft account linked to a Discord account). */
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
  { name: 'player', description: 'A player’s characters, guild and status', options: [{ type: 3, name: 'name', description: 'Username (leave empty for your linked account)', required: false }] },
  { name: 'me', description: 'Your own profile (link your account first with /link)' },
  { name: 'link', description: 'Link your Discord account to your Wynncraft username', options: [{ type: 3, name: 'name', description: 'Your Wynncraft username', required: true }] },
  { name: 'unlink', description: 'Remove the link between your Discord account and your Wynncraft username' },
  { name: 'compare', description: 'Two players side by side (leave one out to compare yourself)', options: [{ type: 3, name: 'player', description: 'Username', required: true }, { type: 3, name: 'other', description: 'Second username (leave empty to use your linked account)', required: false }] },
  { name: 'guild', description: 'A guild: raiding or war guild, members, territories, season', options: [{ type: 3, name: 'name', description: 'Guild name or tag', required: true }] },
  { name: 'build', description: 'Show a Wynnia build link: gear, level and a link to open it', options: [{ type: 3, name: 'link', description: 'A Wynnia build link (malynsx.github.io/wynnia/#s/…)', required: true }] },
  { name: 'lootpool', description: 'This week’s mythics in each lootrun camp and raid', options: [{ type: 3, name: 'where', description: 'Only this camp or raid', required: false, autocomplete: true }] },
  { name: 'events', description: 'World events starting in the next 15 minutes', options: [{ type: 4, name: 'level', description: 'Only events near this level', required: false, min_value: 1, max_value: 132 }] },
];

/* ---------- helpers ---------- */
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

/* a link is stored both ways: acct:<discord id> → the Wynncraft account, wynn:<uuid> → the Discord id (for the site's badge) */
async function setLink(env, uid, d) {
  await clearLink(env, uid);
  await env.ACCOUNTS.put('acct:' + uid, JSON.stringify({ name: d.username, uuid: d.uuid, at: Date.now() }));
  if (d.uuid) await env.ACCOUNTS.put('wynn:' + d.uuid, uid);
}
async function clearLink(env, uid) {
  const had = await env.ACCOUNTS.get('acct:' + uid);
  if (had) {
    const u = JSON.parse(had).uuid;
    if (u && await env.ACCOUNTS.get('wynn:' + u) === uid) await env.ACCOUNTS.delete('wynn:' + u);
    await env.ACCOUNTS.delete('acct:' + uid);
  }
  return had;
}

/* ---------- the site's "Log in with Discord" and saved data ----------
   Login is Discord OAuth (scope "identify": the username and avatar only). The worker swaps the code for the user's
   id, makes a random session token kept 30 days in ACCOUNTS (sess:<token>), and sends it back to the site in the URL
   fragment, which never reaches a server. The site sends it as "Authorization: Bearer <token>". */
const SESSION_DAYS = 30, SAVE_LIMIT = 400 * 1024;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS', 'Access-Control-Max-Age': '86400' };
const cjson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors) });
const randomId = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const backTo = (hash) => SITE + (/^#[\w/?=&%.+-]*$/.test(hash || '') ? hash : '#home/account');

async function siteApi(request, env, url, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env.ACCOUNTS) return cjson({ error: 'Accounts aren’t set up yet (the bot needs the ACCOUNTS KV namespace).' }, 503);
  const p = url.pathname;

  if (p === '/auth/login') {
    if (!env.DISCORD_APP_ID || !env.DISCORD_CLIENT_SECRET) return new Response('Discord login isn’t set up yet (DISCORD_CLIENT_SECRET is missing).', { status: 503 });
    const state = randomId(16);
    await env.ACCOUNTS.put('state:' + state, url.searchParams.get('back') || '', { expirationTtl: 600 });
    const q = new URLSearchParams({ client_id: env.DISCORD_APP_ID, response_type: 'code', scope: 'identify', redirect_uri: url.origin + '/auth/callback', state, prompt: 'none' });
    return Response.redirect('https://discord.com/oauth2/authorize?' + q, 302);
  }
  if (p === '/auth/callback') {
    const state = url.searchParams.get('state') || '', code = url.searchParams.get('code');
    const back = await env.ACCOUNTS.get('state:' + state);
    if (back == null) return new Response('That login link expired. Go back to Wynnia and try again.', { status: 400 });
    await env.ACCOUNTS.delete('state:' + state);
    if (!code) return Response.redirect(backTo(back), 302);   // they pressed Cancel on Discord's page
    const tok = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.DISCORD_APP_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: url.origin + '/auth/callback' }) });
    if (!tok.ok) return new Response('Discord didn’t accept the login (' + tok.status + '). Go back to Wynnia and try again.', { status: 502 });
    const { access_token } = await tok.json();
    const me = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: 'Bearer ' + access_token } });
    if (!me.ok) return new Response('Couldn’t read your Discord account. Try again.', { status: 502 });
    const u = await me.json();
    const session = randomId(32);
    await env.ACCOUNTS.put('sess:' + session, JSON.stringify({ uid: u.id, name: u.global_name || u.username, username: u.username, avatar: u.avatar }), { expirationTtl: SESSION_DAYS * 86400 });
    const h = backTo(back);
    return Response.redirect(h.replace(/#.*$/, '') + '#auth=' + session + '&back=' + encodeURIComponent(h.slice(h.indexOf('#'))), 302);
  }

  /* public: does this Wynncraft account have a Discord account linked (yes/no only, never who) */
  if (p === '/api/linked') {
    const uuid = (url.searchParams.get('uuid') || '').toLowerCase();
    if (!/^[0-9a-f-]{32,36}$/.test(uuid)) return cjson({ error: 'Give ?uuid=' }, 400);
    return cjson({ linked: !!(await env.ACCOUNTS.get('wynn:' + uuid)) });
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const raw = /^[0-9a-f]{64}$/.test(token) && await env.ACCOUNTS.get('sess:' + token);
  if (!raw) return cjson({ error: 'Not logged in.' }, 401);
  const s = JSON.parse(raw);

  if (p === '/auth/logout') { await env.ACCOUNTS.delete('sess:' + token); return cjson({ ok: true }); }
  if (p === '/api/me') {
    const l = await env.ACCOUNTS.get('acct:' + s.uid);
    return cjson({ id: s.uid, name: s.name, username: s.username, avatar: s.avatar ? `https://cdn.discordapp.com/avatars/${s.uid}/${s.avatar}.png?size=128` : null, linked: l ? JSON.parse(l) : null });
  }
  if (p === '/api/link') {
    if (request.method === 'DELETE') { await clearLink(env, s.uid); return cjson({ linked: null }); }
    if (request.method !== 'POST') return cjson({ error: 'POST or DELETE' }, 405);
    const name = String(((await request.json().catch(() => ({}))).name) || '').trim();
    if (!/^\w{1,16}$/.test(name)) return cjson({ error: 'That isn’t a Minecraft username.' }, 400);
    let d;
    try { d = await getJSON(`${WYNN}player/${encodeURIComponent(name)}`, 120, { env, waitUntil: (x) => ctx.waitUntil(x) }); } catch (e) { return cjson({ error: e.status === 404 ? `No player called “${name}”.` : 'The Wynncraft API didn’t answer. Try again in a moment.' }, e.status === 404 ? 404 : 502); }
    if (d.multiple || !d.username) return cjson({ error: 'That name matches several players. Use the exact username.' }, 400);
    await setLink(env, s.uid, d);
    return cjson({ linked: { name: d.username, uuid: d.uuid } });
  }
  if (p === '/api/save') {
    if (request.method === 'GET') { const v = await env.ACCOUNTS.get('save:' + s.uid); return cjson(v ? JSON.parse(v) : { at: 0, data: null }); }
    if (request.method !== 'PUT') return cjson({ error: 'GET or PUT' }, 405);
    const body = await request.text();
    if (body.length > SAVE_LIMIT) return cjson({ error: 'That’s more than 400 KB of saved data.' }, 413);
    let data; try { data = JSON.parse(body).data; } catch (e) { return cjson({ error: 'Not JSON.' }, 400); }
    if (!data || typeof data !== 'object') return cjson({ error: 'Nothing to save.' }, 400);
    const at = Date.now();
    await env.ACCOUNTS.put('save:' + s.uid, JSON.stringify({ at, data }));
    return cjson({ at });
  }
  return cjson({ error: 'Not found.' }, 404);
}
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
      : e.status === 503 ? 'Prices are switched off on the relay.' : `Couldn’t reach the price service (${e.message}).` };
  }
}

/* ---------- embed styling ---------- */
/* Every answer is an embed with the Wynnia author line, a colour, a "See more on Wynnia." footer and link buttons to
   the matching page. Inline icons are the bot's own emoji: real Wynncraft icons from brand/emoji, uploaded when
   /register is opened. Until they're uploaded the text simply goes without them. */
const RING = (n) => SITE + `brand/wynnia-ring-${n}.png`;
const A = { r: '\u001b[0m', gray: '\u001b[0;30m', red: '\u001b[0;31m', green: '\u001b[0;32m', yellow: '\u001b[0;33m', blue: '\u001b[0;34m', pink: '\u001b[0;35m', cyan: '\u001b[0;36m', white: '\u001b[0;37m', bold: '\u001b[1;37m' };
const ELEM_ORDER = ['neutral', 'earth', 'thunder', 'water', 'fire', 'air'];
const SKILL_ELEM = { strength: 'earth', dexterity: 'thunder', intelligence: 'water', defence: 'fire', agility: 'air' };
const ansi = (lines) => '```ansi\n' + lines.join('\n') + '\n```';
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
const lpad = (s, n) => ' '.repeat(Math.max(0, n - String(s).length)) + String(s);
const RANK_COL = { vip: 0x87b85b, vipplus: 0x6f8fb8, hero: 0x9c7cc4, heroplus: 0xd16fa6, champion: 0xc9a75e };
const CLASS_OF = { bow: 'Archer', spear: 'Warrior', wand: 'Mage', dagger: 'Assassin', relik: 'Shaman' };
const link = (label, url) => ({ type: 2, style: 5, label, url });
const buttons = (...b) => [{ type: 1, components: b.filter(Boolean).slice(0, 5) }];
const embed = (e) => Object.assign({ author: { name: 'Wynnia', url: SITE, icon_url: RING(64) } }, e, { footer: { text: 'See more on Wynnia.', icon_url: RING(32) } });
/* short answers (not found, errors, confirmations) get the same look as everything else */
const notice = (title, text, color = 0x4f545c) => ({ embeds: [embed({ title, description: text, color })] });
const API_DOWN = () => notice('The Wynncraft API didn’t answer', 'Try again in a moment.', 0xd9534f);
const tierCol = (r) => r === 'mythic' ? 0xb44bd6 : TIER[r] || GOLD;
const good = (k, v) => { const n = Array.isArray(v) ? v[1] : v; return /SpellCost/.test(k) ? n < 0 : n > 0; };
const bar = (pct, n = 12) => { const f = Math.max(0, Math.min(n, Math.round(pct / 100 * n))); return '█'.repeat(f) + '░'.repeat(n - f); };
const blank = { name: '​', value: '​', inline: true };
const grid = (fields) => { const f = fields.filter(Boolean); while (f.length % 3) f.push(blank); return f; };   // keeps inline fields in even rows of three
const stat = (name, icon, value) => ({ name, value: `${ic(icon)}**${value}**`, inline: true });
const head = (uuid, n = 128) => `https://mc-heads.net/avatar/${uuid}/${n}`;
const itemThumb = (i) => i && i.ic ? SITE + 'img/items128/' + encodeURIComponent(i.ic.replace(/\.webp$/, '.png')) : RING(128);
const range = (v) => Array.isArray(v) ? (v[0] === v[1] ? v[0] : `${v[0]}–${v[1]}`) : v;
let MAJORS = null;
const majors = async (ctx) => MAJORS || (MAJORS = await getJSON(SITE + 'data/majorids.json', 86400, ctx).catch(() => ({})));
const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/[-]/g, '').replace(/\s+/g, ' ').trim();
const spark = (vals) => { const lo = Math.min(...vals), hi = Math.max(...vals); return vals.map(v => '▁▂▃▄▅▆▇█'[hi > lo ? Math.round((v - lo) / (hi - lo) * 7) : 3]).join(''); };
const priceFields = (pr) => pr && pr.err ? [{ name: 'Trade market', value: pr.err }]
  : pr ? [{ name: 'Typical price', value: `${ic('emerald')}**${emeralds(pr.p)}**`, inline: true }, { name: 'Cheapest', value: `${ic('emerald')}${emeralds(pr.low)}`, inline: true }, { name: 'Listings', value: `**${pr.n ?? '—'}**`, inline: true }]
  : [{ name: 'Trade market', value: 'Not seen on the trade market lately.' }];

/* the bot's emoji, by name: "<:fire:123…>" (refreshed every 10 minutes) */
const EMOJI_NAMES = ['wynnia', 'earth', 'thunder', 'water', 'fire', 'air', 'warrior', 'archer', 'mage', 'assassin', 'shaman',
  'helmet', 'chestplate', 'leggings', 'boots', 'ring', 'necklace', 'bracelet', 'bow', 'spear', 'wand', 'dagger', 'relik', 'tome',
  'playtime', 'level', 'quests', 'mobs', 'chests', 'dungeons', 'raids', 'wars', 'pvp', 'guildtome', 'lootrun',
  'emerald', 'guild', 'questbook', 'mythic', 'beacon', 'camp', 'notg', 'nol', 'tcc', 'tna', 'twp', 'online', 'offline'];
let EMO = {}, emoAt = 0;
async function loadEmoji(env) {
  if (Date.now() - emoAt < 600000 || !env.DISCORD_APP_ID || !env.DISCORD_TOKEN) return;
  emoAt = Date.now();
  try {
    const r = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APP_ID}/emojis`, { headers: { Authorization: 'Bot ' + env.DISCORD_TOKEN } });
    const j = r.ok ? await r.json() : {};
    EMO = Object.fromEntries((j.items || []).map(e => [e.name, `<:${e.name}:${e.id}>`]));
  } catch (e) { /* no icons this time */ }
}
const ic = (n) => EMO[n] ? EMO[n] + ' ' : '';
const CLASS_ICON = { warrior: 'warrior', knight: 'warrior', archer: 'archer', hunter: 'archer', mage: 'mage', darkwizard: 'mage', assassin: 'assassin', ninja: 'assassin', shaman: 'shaman', skyseer: 'shaman' };
const classIcon = (c) => ic(CLASS_ICON[String(c || '').toLowerCase()] || '');
const RAID_ICON = (name) => /grootslang/i.test(name) ? 'notg' : /orphion|light/i.test(name) ? 'nol' : /colossus/i.test(name) ? 'tcc' : /nameless/i.test(name) ? 'tna' : /palace/i.test(name) ? 'twp' : 'camp';

/* upload any of brand/emoji/*.png the application doesn't have yet (a few per visit: Workers allow 50 requests each) */
async function syncEmoji(env) {
  const auth = { Authorization: 'Bot ' + env.DISCORD_TOKEN };
  const r = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APP_ID}/emojis`, { headers: auth });
  if (!r.ok) return `Couldn’t list the bot’s emoji (${r.status}).`;
  const have = new Set(((await r.json()).items || []).map(e => e.name));
  const missing = EMOJI_NAMES.filter(n => !have.has(n));
  let added = 0, problem = '';
  for (const name of missing.slice(0, 20)) {
    const img = await fetch(SITE + `brand/emoji/${name}.png`);
    if (!img.ok) { problem = `brand/emoji/${name}.png isn’t on the site yet.`; break; }
    const bytes = new Uint8Array(await img.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const up = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APP_ID}/emojis`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ name, image: 'data:image/png;base64,' + btoa(bin) }) });
    if (!up.ok) { problem = `Discord refused the ${name} emoji (${up.status}: ${(await up.text()).slice(0, 120)}).`; break; }
    added++;
  }
  emoAt = 0;
  const left = missing.length - added;
  return `Emoji: ${have.size + added} of ${EMOJI_NAMES.length} uploaded.` + (problem ? ' ' + problem : '') + (left ? ` Open this page again to upload the other ${left}.` : '');
}

/* a player from the API, or a ready-made "not found" / "API down" answer */
async function fetchPlayer(name, ctx) {
  try {
    const d = await getJSON(`${WYNN}player/${encodeURIComponent(String(name).trim())}?fullResult`, 120, ctx);
    if (d.multiple || !d.username) return { err: notice('Several players match', `More than one player is called **${name}**. Use the exact username.`) };
    return { d };
  } catch (e) { return { err: e.status === 404 ? notice('Player not found', `No Wynncraft player is called **${name}**.`) : API_DOWN() }; }
}
const linkedName = async (ctx, uid) => { const l = ctx.env.ACCOUNTS && await ctx.env.ACCOUNTS.get('acct:' + uid); return l ? JSON.parse(l).name : null; };
const NOT_LINKED = () => notice('No account linked', 'Link yours first with `/link name:<your username>`, or on Wynnia under Home › Account.\nOr name a player: `/player name:<username>`.');
const rankName = (d) => d.rank && d.rank !== 'Player' ? d.rank : d.supportRank ? STORE_RANK[d.supportRank] || cap(d.supportRank) : null;
const className = (c) => cap(c.reskin || c.type);

/* ---------- commands ---------- */
const H = {
  async item(o, ctx) {
    const it = findItem(await items(ctx), o.name);
    if (!it) return notice('Item not found', `No item is called **${o.name}**. Pick one from the suggestions as you type.`);
    const [pr, mj] = await Promise.all([price(it.n, ctx), it.m && it.m.length ? majors(ctx) : null]);
    const b = it.b || {}, fields = [];
    const reqs = Object.entries(it.q || {}).filter(([, v]) => v).map(([k, v]) => `${ic(SKILL_ELEM[k])}**${v}** ${cap(k).slice(0, 3)}`);
    const page = `${SITE}#items/search?q=${encodeURIComponent(it.n)}`;
    /* weapons: damage per element; armour: health and defences */
    const dmg = Object.entries(b).filter(([k]) => /^base\w*Damage$/.test(k)).map(([k, v]) => [(k.replace(/^base|Damage$/g, '') || 'Neutral').toLowerCase(), v])
      .sort((x, y) => ELEM_ORDER.indexOf(x[0]) - ELEM_ORDER.indexOf(y[0]));
    if (dmg.length) {
      fields.push({ name: 'Damage', value: dmg.map(([e, v]) => `${ic(e) || cap(e) + ' '}**${range(v)}**`).join('\n'), inline: true });
      fields.push({ name: 'Attack speed', value: `**${cap(String(it.as || '').replace(/([A-Z])/g, ' $1'))}**${it.dps ? `\n${Math.round(it.dps).toLocaleString('en-US')} DPS` : ''}`, inline: true });
      fields.push({ name: 'Powder slots', value: it.ps ? `**${it.ps}**  ${'◇'.repeat(it.ps)}` : 'None', inline: true });
    } else {
      const defs = Object.entries(b).filter(([k]) => /^base\w+Defence$/.test(k)).map(([k, v]) => [k.replace(/^base|Defence$/g, '').toLowerCase(), v])
        .sort((x, y) => ELEM_ORDER.indexOf(x[0]) - ELEM_ORDER.indexOf(y[0]));
      fields.push({ name: 'Health', value: b.baseHealth ? `**${range(b.baseHealth)}**` : '—', inline: true });
      fields.push({ name: 'Defences', value: defs.length ? defs.map(([e, v]) => `${ic(e) || cap(e) + ' '}**${v > 0 ? '+' : ''}${range(v)}**`).join('\n') : 'None', inline: true });
      fields.push({ name: 'Powder slots', value: it.ps ? `**${it.ps}**  ${'◇'.repeat(it.ps)}` : 'None', inline: true });
    }
    const ids = Object.entries(it.i || {});
    if (ids.length) {
      const vals = ids.map(([k, v]) => idVal(k, v)), w = Math.min(20, Math.max(...vals.map(v => v.length)));
      fields.push({ name: 'Identifications', value: ansi(ids.slice(0, 20).map(([k, v], n) => `${good(k, v) ? A.green : A.red}${lpad(vals[n], w)}${A.r}  ${idName(k)}`)).slice(0, 1024) });
    }
    (it.m || []).forEach(m => { const n = typeof m === 'string' ? m : m.n; fields.push({ name: 'Major ID · ' + n, value: '> ' + (plain(mj && mj[n]) || '—').slice(0, 1000) }); });
    fields.push(...priceFields(pr));
    return { embeds: [embed({ title: it.n, url: page, color: tierCol(it.r), thumbnail: { url: itemThumb(it) },
      description: [`${ic(it.t)}**${cap(it.r)} ${cap(it.t)}** · Level ${it.l}${CLASS_OF[it.t] ? ' · ' + CLASS_OF[it.t] : ''}`, reqs.length ? `-# Requires  ${reqs.join('  ·  ')}` : null].filter(Boolean).join('\n'), fields })],
      components: buttons(link('Open in Item Search', page), link('Price history', `${SITE}#items/prices?i=${encodeURIComponent(it.n)}`), link('Loadout Builder', `${SITE}#items/loadout`)) };
  },

  async price(o, ctx) {
    const it = findItem(await items(ctx), o.item);
    if (!it) return notice('Item not found', `No item is called **${o.item}**. Pick one from the suggestions as you type.`);
    const [pr, hist] = await Promise.all([price(it.n, ctx), getJSON(`${RELAY}/market/history/${encodeURIComponent(it.n)}`, 3600, ctx).catch(() => null)]);
    const rows = ((hist && (Array.isArray(hist) ? hist : hist.data)) || []).filter(r => r && r.timestamp)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).map(r => ['average_mid_80_percent_price', 'p50_price', 'average_price'].map(k => r[k]).find(v => v > 0)).filter(Boolean).slice(-14);
    let trend = null;
    if (rows.length >= 3) {
      const ch = (rows[rows.length - 1] - rows[0]) / rows[0] * 100;
      trend = { name: `Last ${rows.length} days`, value: `\`${spark(rows)}\`  ${Math.abs(ch) < 1 ? 'about the same' : `**${ch > 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(0)}%**`}\n-# from ${emeralds(rows[0])} to ${emeralds(rows[rows.length - 1])}` };
    }
    return { embeds: [embed({ title: it.n, url: `${SITE}#items/prices?i=${encodeURIComponent(it.n)}`, color: tierCol(it.r), thumbnail: { url: itemThumb(it) },
      description: `${ic(it.t)}**${cap(it.r)} ${cap(it.t)}** · Level ${it.l}\n-# Trade market prices from Wynnventory`, fields: [...priceFields(pr), trend].filter(Boolean) })],
      components: buttons(link('Price history and alerts', `${SITE}#items/prices?i=${encodeURIComponent(it.n)}`), link('Item details', `${SITE}#items/search?q=${encodeURIComponent(it.n)}`)) };
  },

  /* account linking: your Discord account remembers one Wynncraft username (in the ACCOUNTS KV namespace) */
  async link(o, ctx) {
    if (!ctx.env.ACCOUNTS) return notice('Linking isn’t set up yet', 'The bot needs a KV namespace bound as ACCOUNTS.', 0xd9534f);
    const { d, err } = await fetchPlayer(o.name, ctx);
    if (err) return err;
    await setLink(ctx.env, o.__uid, d);
    return { embeds: [embed({ title: `Linked to ${d.username}`, color: 0x55c46a, thumbnail: { url: head(d.uuid) },
      description: `${ic('online')}Your Discord account is now linked to **${d.username}**.\n\n**What this does**\n• \`/me\` shows your profile\n• \`/player\` and \`/compare\` use you when you leave a name out\n• Your Wynnia profile gets the Discord badge\n\n-# Use \`/unlink\` to remove it.` })],
      components: buttons(link('Your Wynnia profile', `${SITE}#players/lookup?u=${encodeURIComponent(d.username)}`)) };
  },
  async unlink(o, ctx) {
    if (!ctx.env.ACCOUNTS) return notice('Linking isn’t set up yet', 'The bot needs a KV namespace bound as ACCOUNTS.', 0xd9534f);
    const had = await clearLink(ctx.env, o.__uid);
    return had ? notice(`Unlinked from ${JSON.parse(had).name}`, `${ic('offline')}Your Discord account isn’t linked to a Wynncraft username any more.`)
      : notice('Nothing to unlink', 'Your Discord account isn’t linked to anyone.');
  },
  async me(o, ctx) { return H.player(o, ctx); },

  async player(o, ctx) {
    const name = o.name || await linkedName(ctx, o.__uid);
    if (!name) return NOT_LINKED();
    const { d, err } = await fetchPlayer(name, ctx);
    if (err) return err;
    const gd = d.globalData || {}, g = d.guild, rank = rankName(d), page = `${SITE}#players/lookup?u=${encodeURIComponent(d.username)}`;
    const chars = Object.values(d.characters || {}).sort((a, b) => (b.level || 0) - (a.level || 0));
    const desc = [
      d.online ? `${ic('online')}**Online** on ${d.server}` : `${ic('offline')}Last seen ${d.lastJoin ? ts(Date.parse(d.lastJoin)) : 'a while ago'}`,
      g ? `${ic('guild')}${cap(g.rank)} of **[${g.name}](${SITE}#guilds/lookup?g=${encodeURIComponent(g.name)})** [${g.prefix}]` : null,
      `-# ${[rank, d.firstJoin ? 'Joined ' + ts(Date.parse(d.firstJoin), 'D') : null].filter(Boolean).join(' · ')}`,
    ].filter(Boolean).join('\n');
    const fields = grid([
      stat('Playtime', 'playtime', num(d.playtime) + ' h'), stat('Total level', 'level', num(gd.totalLevel)), stat('Quests', 'quests', num(gd.completedQuests)),
      stat('Dungeons', 'dungeons', num(gd.dungeons && gd.dungeons.total)), stat('Raids', 'raids', num(gd.raids && gd.raids.total)), stat('Wars', 'wars', num(gd.wars)),
      stat('Mobs killed', 'mobs', short(gd.mobsKilled || 0)), stat('Chests', 'chests', short(gd.chestsFound || 0)), stat('PvP kills', 'pvp', num(gd.pvp && gd.pvp.kills)),
    ]);
    if (chars.length) fields.push({ name: `Characters · ${chars.length}`, value: chars.slice(0, 6).map(c =>
      `${classIcon(c.reskin || c.type)}**${c.nickname || className(c)}**  Lv. ${c.level ?? '?'}${c.nickname ? ` · ${className(c)}` : ''}${(c.gamemode || []).length ? ` · *${c.gamemode.map(cap).join(', ')}*` : ''}`).join('\n')
      + (chars.length > 6 ? `\n-# and ${chars.length - 6} more` : '') });
    return { embeds: [embed({ title: d.username, url: page, color: RANK_COL[d.supportRank] || GOLD, thumbnail: { url: `https://mc-heads.net/body/${d.uuid}/160` }, description: desc, fields })],
      components: buttons(link('Full profile', page), link('Next Steps', `${SITE}#players/plan?u=${encodeURIComponent(d.username)}`), link('Quest checklist', `${SITE}#players/quests?u=${encodeURIComponent(d.username)}`)) };
  },

  /* two players side by side: a column of stats, one column each, the higher number in bold */
  async compare(o, ctx) {
    let a = o.player, b = o.other;
    if (!b) { b = a; a = await linkedName(ctx, o.__uid); if (!a) return notice('Compare with whom?', 'Give two names: `/compare player:<name> other:<name>`.\nOr link your account with `/link` to compare yourself with someone.'); }
    const [x, y] = await Promise.all([fetchPlayer(a, ctx), fetchPlayer(b, ctx)]);
    if (x.err) return x.err; if (y.err) return y.err;
    const p = x.d, q = y.d;
    const top = (d) => Math.max(0, ...Object.values(d.characters || {}).map(c => c.level || 0));
    const G = (d) => d.globalData || {};
    const ROWS = [
      ['playtime', 'Playtime', (d) => d.playtime || 0, (v) => num(v) + ' h'],
      ['level', 'Total level', (d) => G(d).totalLevel || 0],
      ['archer', 'Top level', top, (v) => 'Lv. ' + v],
      ['quests', 'Quests', (d) => G(d).completedQuests || 0],
      ['questbook', 'Completion', (d) => G(d).contentCompletion || 0],
      ['dungeons', 'Dungeons', (d) => (G(d).dungeons || {}).total || 0],
      ['raids', 'Raids', (d) => (G(d).raids || {}).total || 0],
      ['wars', 'Wars', (d) => G(d).wars || 0],
      ['mobs', 'Mobs killed', (d) => G(d).mobsKilled || 0, short],
      ['chests', 'Chests', (d) => G(d).chestsFound || 0, short],
      ['pvp', 'PvP kills', (d) => (G(d).pvp || {}).kills || 0],
      ['warrior', 'Characters', (d) => Object.keys(d.characters || {}).length],
    ];
    let wa = 0, wb = 0;
    const colA = [], colB = [], labels = [];
    ROWS.forEach(([icon, label, get, fmt = num]) => {
      const va = get(p), vb = get(q);
      if (va > vb) wa++; else if (vb > va) wb++;
      labels.push(`${ic(icon)}${label}`);
      colA.push(va > vb ? `**${fmt(va)}** ▲` : fmt(va));
      colB.push(vb > va ? `**${fmt(vb)}** ▲` : fmt(vb));
    });
    const lead = wa === wb ? `**Even**: ${wa} each` : `**${wa > wb ? p.username : q.username}** leads in ${Math.max(wa, wb)} of ${ROWS.length}`;
    const guildLine = (d) => d.guild ? `[${d.guild.prefix}]` : 'no guild';
    return { embeds: [embed({ author: { name: `${p.username} vs ${q.username}`, icon_url: head(p.uuid, 64), url: `${SITE}#players/compare?a=${encodeURIComponent(p.username)}&b=${encodeURIComponent(q.username)}` },
      title: `${p.username}  vs  ${q.username}`, url: `${SITE}#players/compare?a=${encodeURIComponent(p.username)}&b=${encodeURIComponent(q.username)}`,
      color: RANK_COL[(wa >= wb ? p : q).supportRank] || GOLD, thumbnail: { url: head(q.uuid) },
      description: `${lead}\n-# ${p.username}: ${rankName(p) || 'Player'}, ${guildLine(p)} · ${q.username}: ${rankName(q) || 'Player'}, ${guildLine(q)}`,
      fields: [{ name: '​', value: labels.join('\n'), inline: true }, { name: p.username, value: colA.join('\n'), inline: true }, { name: q.username, value: colB.join('\n'), inline: true }] })],
      components: buttons(link(`${p.username}’s profile`, `${SITE}#players/lookup?u=${encodeURIComponent(p.username)}`), link(`${q.username}’s profile`, `${SITE}#players/lookup?u=${encodeURIComponent(q.username)}`),
        link('Compare on Wynnia', `${SITE}#players/compare?a=${encodeURIComponent(p.username)}&b=${encodeURIComponent(q.username)}`)) };
  },

  async guild(o, ctx) {
    const n = encodeURIComponent(o.name.trim()), tries = o.name.trim().length <= 4 ? [`guild/prefix/${n}`, `guild/${n}`] : [`guild/${n}`, `guild/prefix/${n}`];
    let d = null, down = false;
    for (const t of tries) { try { d = await getJSON(WYNN + t, 120, ctx); if (d && d.name) break; } catch (e) { d = null; if (e.status !== 404) down = true; } }
    if (!d || !d.name) return down ? API_DOWN() : notice('Guild not found', `No guild is called **${o.name}**. Try its full name or its tag.`);
    const type = !d.raids && !d.wars && !d.territories ? null : (d.raids || 0) > (d.wars || 0) || !d.territories ? 'raid' : 'war';
    const season = Object.entries(d.seasonRanks || {}).sort((a, b) => b[0] - a[0])[0];
    const members = Object.entries(d.members || {}).filter(([r]) => r !== 'total').flatMap(([r, ms]) => Object.entries(ms).map(([nm, m]) => Object.assign({ rank: r, name: m.username || nm }, m)));
    const online = members.filter(m => m.online);
    const owner = members.find(m => m.rank === 'owner');
    const topXP = members.filter(m => m.contributed).sort((a, b) => b.contributed - a.contributed).slice(0, 5);
    const page = `${SITE}#guilds/lookup?g=${encodeURIComponent(d.name)}`;
    const fields = grid([
      stat('Members', 'guildtome', `${d.members ? d.members.total : members.length}`), stat('Online', 'online', d.online ?? online.length), stat('Territories', 'guild', num(d.territories)),
      stat('Wars', 'wars', num(d.wars)), stat('Guild raids', 'raids', num(d.raids)), season ? stat(`Season ${season[0]}`, 'level', short(season[1].rating) + ' SR') : stat('Founded', 'questbook', d.created ? new Date(d.created).getUTCFullYear() : '—'),
    ]);
    if (topXP.length) fields.push({ name: 'Top contributors', value: topXP.map((m, i) => `\`${i + 1}\` **${m.name}** · ${short(m.contributed)} XP`).join('\n') });
    if (online.length) fields.push({ name: `Online now · ${online.length}`, value: online.slice(0, 10).map(m => `${ic('online')}**${m.name}** ${m.server || ''}`).join('\n') + (online.length > 10 ? `\n-# and ${online.length - 10} more` : '') });
    return { embeds: [embed({ title: `${d.name} [${d.prefix}]`, url: page, color: type === 'war' ? 0xff8a7a : type ? 0xc58cff : GOLD,
      thumbnail: { url: SITE + 'brand/emoji/guild.png' },
      description: [`${ic(type === 'war' ? 'wars' : type ? 'raids' : 'guild')}**${type === 'war' ? 'War guild' : type ? 'Raiding guild' : 'Guild'}**${owner ? ` · owned by ${owner.name}` : ''}`,
        `**Level ${d.level}**  \`${bar(d.xpPercent || 0)}\`  ${d.xpPercent || 0}%`,
        d.created ? `-# Founded ${ts(Date.parse(d.created), 'D')}` : null].filter(Boolean).join('\n'), fields })],
      components: buttons(link('Guild page', page), d.territories ? link('Territories on the map', `${SITE}#world/map?m=territories&l=terr,routes,hq,tnames&g=${encodeURIComponent(d.name)}`) : null) };
  },

  async build(o, ctx) {
    const m = /#s\/([A-Za-z0-9]{4,12})/.exec(o.link) || /\/b\/([A-Za-z0-9]{4,12})/.exec(o.link);
    let hash = /#(items\/loadout\?\S+)/.exec(o.link);
    hash = hash ? '#' + hash[1] : null;
    if (!hash && m) {
      try { hash = (await getJSON(`${RELAY}/s/${m[1]}`, 86400, ctx)).link; }
      catch (e) { return e.status === 404 ? notice('Link not found', 'That short link doesn’t exist.') : notice('Couldn’t open the link', ctx.env && ctx.env.RELAY ? 'Couldn’t reach the Wynnia relay. Try again in a moment.' : 'The bot needs a RELAY service binding to the relay worker (see the note at the top of bot.js).', 0xd9534f); }
    }
    if (!hash || !/^#items\/loadout\?/.test(hash)) return notice('Not a build link', 'Paste a Wynnia build link: in the Loadout Builder, press **Copy link**.');
    const q = new URLSearchParams(hash.split('?')[1]);
    const [list, ids, keys] = await Promise.all([items(ctx), getJSON(SITE + 'data/itemids.json', 3600, ctx), getJSON(SITE + 'data/idkeys.json', 3600, ctx)]);
    let b;
    try { b = decodeBuild(q.get('b') || '', { names: Object.fromEntries(Object.entries(ids).map(([nm, i]) => [i, nm])), keyName: keys }); } catch (e) { return notice('That build link is broken', e.message, 0xd9534f); }
    const byName = Object.fromEntries(list.map(i => [i.n, i]));
    let crafted = [];
    try { crafted = q.get('cr') ? Object.keys(JSON.parse(atob(q.get('cr').replace(/-/g, '+').replace(/_/g, '/')))) : []; } catch (e) { /* unreadable: show the rest */ }
    const weapon = b.s.w && byName[b.s.w[0]];
    const SLOT = [['w', 'Weapon', weapon ? weapon.t : 'spear'], ['h', 'Helmet', 'helmet'], ['c', 'Chestplate', 'chestplate'], ['l', 'Leggings', 'leggings'], ['b', 'Boots', 'boots'],
      ['n', 'Necklace', 'necklace'], ['r1', 'Ring', 'ring'], ['r2', 'Ring', 'ring'], ['br', 'Bracelet', 'bracelet']];
    const piece = (k, icon) => {
      if (crafted.includes(k)) return `${ic(icon)}**Crafted**`;
      const s = b.s[k]; if (!s) return `${ic(icon)}*empty*`;
      const it = byName[s[0]];
      const pw = s[2] ? s[2].map(([e]) => ic(e) || e[0].toUpperCase()).join('') : '';
      return `${ic(icon)}**${s[0]}**\n-# ${it ? cap(it.r) : ''}${pw ? '  ' + pw : ''}`;
    };
    const tomes = Object.keys(b.s).filter(k => k[0] === 't').length;
    const url = m ? `${SITE}#s/${m[1]}` : SITE + hash;
    const cls = weapon ? CLASS_OF[weapon.t] : null;
    return { embeds: [embed({ title: q.get('n') || (cls ? `${cls} build` : 'Build'), url, color: weapon ? tierCol(weapon.r) : GOLD, thumbnail: { url: itemThumb(weapon) },
      description: [`${cls ? classIcon(cls) : ''}**${cls || 'Any class'}** · Level ${b.lvl}${tomes ? ` · ${ic('tome')}${tomes} mastery tomes` : ''}`, weapon ? `-# Built around ${weapon.n}` : null].filter(Boolean).join('\n'),
      fields: SLOT.map(([k, label, icon]) => ({ name: label, value: piece(k, icon), inline: true })) })],
      components: buttons(link('Open build', url), link('Build Library', `${SITE}#items/builds`)) };
  },

  async lootpool(o, ctx) {
    let pools;
    try { pools = await getJSON(WYNN + 'map/loot-pools', 600, ctx); } catch (e) { return API_DOWN(); }
    const want = (o.where || '').toLowerCase();
    const shown = pools.filter(p => !want || p.name.toLowerCase().includes(want)).slice(0, 12);
    if (!shown.length) return notice('Nothing found', `No lootrun camp or raid is called **${o.where}**.`);
    return { embeds: [embed({ title: 'This week’s loot pools', url: `${SITE}#world/events`, color: 0xb44bd6, thumbnail: { url: SITE + 'brand/emoji/mythic.png' },
      description: `${ic('mythic')}Mythics in each lootrun camp, and the mythic aspects in each raid.\n-# ✦ marks a shiny. Pools change ${ts(nextPoolReset())}, every Friday at 19:00 UTC.`,
      fields: grid(shown.map(p => {
        const name = p.name.replace(/^The /, '');
        if (p.type === 'RAID') {   // raids drop mythic aspects ("Paladin's Embodiment of …") and mythic tomes rather than mythic items
          const asp = p.rewards.filter(r => r.type === 'ASPECT' && r.tier === 'MYTHIC').map(r => r.name.replace(/'s Embodiment.*$/, ''));
          const tomes = p.rewards.filter(r => r.type === 'TOME' && r.tier === 'MYTHIC').length;
          return { name: `${ic(RAID_ICON(p.name))}${name}`, value: [asp.length ? asp.map(a => `**${a}**`).join('\n') : null, tomes ? `-# and ${tomes} mythic tomes` : null].filter(Boolean).join('\n') || '*No mythics*', inline: true };
        }
        const myth = p.rewards.filter(r => r.type === 'ITEM' && r.tier === 'MYTHIC').sort((a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0));
        return { name: `${ic('camp')}${name}`, value: (myth.map(r => r.shiny ? `✦ **${r.name}**` : r.name).join('\n') || '*No mythics*').slice(0, 1024), inline: true };
      })) })],
      components: buttons(link('Events and loot pools', `${SITE}#world/events`), link('Lootrun guide', `${SITE}#world/lootruns`)) };
  },

  async events(o, ctx) {
    let ev;
    try { ev = await getJSON(WYNN + 'map/world-events', 60, ctx); } catch (e) { return API_DOWN(); }
    const now = Date.now(), near = (e) => !o.level || Math.abs(e.level - o.level) <= 10;
    const soon = ev.filter(e => e.schedule && Date.parse(e.schedule) > now - 60000 && near(e)).sort((a, b) => Date.parse(a.schedule) - Date.parse(b.schedule)).slice(0, 12);
    return { embeds: [embed({ title: 'World events starting soon', url: `${SITE}#world/events`, color: 0x4fae9f, thumbnail: { url: SITE + 'brand/emoji/beacon.png' },
      description: soon.length ? soon.map(e => { const l = e.location && e.location[0] && e.location[0].event; return `**${e.name}** · Lv. ${e.level} · ${cap(e.difficulty)}\n-# Starts ${ts(Date.parse(e.schedule))}${l ? ` at ${l.x}, ${l.z}${e.location.length > 1 ? ` (and ${e.location.length - 1} other spot${e.location.length > 2 ? 's' : ''})` : ''}` : ''}`; }).join('\n')
        : `Nothing starts in the next 15 minutes${o.level ? ' around level ' + o.level : ''}.` })],
      components: buttons(link('Events page', `${SITE}#world/events`), link('Map', `${SITE}#world/map`)) };
  },
};

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
  o.__uid = (i.member && i.member.user && i.member.user.id) || (i.user && i.user.id);   // who ran it (servers send member, DMs send user)
  let msg;
  const c = { waitUntil: (p) => ctx.waitUntil(p), env };   // handlers reach the relay binding through c.env
  await loadEmoji(env);
  try { msg = H[i.data.name] ? await H[i.data.name](o, c) : notice('Unknown command', 'Try `/register` again.'); }
  catch (e) { msg = notice('Something went wrong', e.message, 0xd9534f); }
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
      if (!r.ok) return new Response(`Discord said ${r.status}: ${t}`, { status: 500 });
      const emo = await syncEmoji(env).catch(e => 'Emoji: ' + e.message);
      return new Response(`Registered ${COMMANDS.length} commands: ${COMMANDS.map(c => '/' + c.name).join(', ')}. They can take a minute to show up in Discord.\n${emo}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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

    if (/^\/(auth|api)\//.test(url.pathname)) return siteApi(request, env, url, ctx);

    if (url.pathname !== '/interactions' || request.method !== 'POST') return new Response('Wynnia Discord bot. Nothing to see here.', { status: 404 });
    const body = await request.text();
    if (!(await verify(request, body, env))) return new Response('Bad signature', { status: 401 });
    const i = JSON.parse(body);
    if (i.type === 1) return json({ type: 1 });                                         // Discord checking the endpoint
    if (i.type === 4) return json({ type: 8, data: { choices: await autocomplete(i, ctx).catch(() => []) } });
    if (i.type === 2) {   // "Wynnia is thinking…", then the answer; linking answers only to the person who ran it
      ctx.waitUntil(runCommand(i, env, ctx));
      return json({ type: 5, data: ['link', 'unlink'].includes(i.data.name) ? { flags: 64 } : undefined });
    }
    return json({ error: 'unknown interaction' }, 400);
  },
};
