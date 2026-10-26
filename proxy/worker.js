/* Wynnia API relay (Cloudflare Worker).
   The Wynncraft API does not send CORS headers, so browsers block it on other sites.
   This worker forwards player, guild, ability-tree and leaderboard requests only, adds CORS for
   the Wynnia site, and caches each answer for two minutes to stay well under Wynncraft's rate limit.
   /market/price/{item} asks Wynnventory for trade market prices with the key stored as the worker secret
   WYNNVENTORY_KEY (never sent to browsers); answers are cached for ten minutes. /market/history/{item}?start_date=&end_date=
   (YYYY-MM-DD) gives its daily price history, cached for an hour.
   POST /s stores a Wynnia share link (loadout, stable, showcase) in the KV namespace bound as LINKS and
   answers with a short id; GET /s/{id} gives the link back. Ids come from a hash of the link, so the same
   build always gets the same id. A link may carry a small preview (title, description, image, colour),
   stored beside it as m:{id}; GET /b/{id} then answers with a page Discord and other chat apps turn into
   an embed, and sends people on to the link itself. */
const ALLOWED = ['https://malynsx.github.io', 'http://localhost:8765', 'http://localhost:8766'];
const PATHS = /^\/v3\/(player|guild|ability|leaderboards|map)(\/[^/]+){0,4}$/;
const MARKET = /^\/market\/(price|history)\/([^/]{1,80})$/;
const SHORT = /^\/s\/([A-Za-z0-9]{4,12})$/;
const EMBED = /^\/b\/([A-Za-z0-9]{4,12})$/;
const SITE = 'https://malynsx.github.io/wynnia/';
/* preview images may only come from the site itself or Minecraft head renders */
const IMG_OK = /^https:\/\/(malynsx\.github\.io\/wynnia\/img\/|mc-heads\.net\/)[A-Za-z0-9_\-./]{1,200}$/;
const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* tidy a preview from the site: short plain text, a known image host, a hex colour */
function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, n) : '';
  const out = { t: text(m.t, 120), d: text(m.d, 400) };
  if (typeof m.i === 'string' && IMG_OK.test(m.i)) out.i = m.i;
  if (typeof m.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.c)) out.c = m.c;
  return out.t ? out : null;
}

function embedPage(id, meta) {
  const go = SITE + '#s/' + id, t = meta ? meta.t : 'Wynnia', d = meta ? meta.d : 'Wynncraft tools';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(t)}</title>
<meta property="og:site_name" content="Wynnia"><meta property="og:type" content="website">
<meta property="og:title" content="${escHtml(t)}"><meta property="og:description" content="${escHtml(d)}">
<meta property="og:url" content="${escHtml(go)}"><meta property="og:image" content="${escHtml((meta && meta.i) || SITE + 'brand/wynnia-ring-256.png')}">
<meta name="twitter:card" content="summary"><meta name="theme-color" content="${(meta && meta.c) || '#ffd65a'}">
<meta http-equiv="refresh" content="0;url=${escHtml(go)}"></head>
<body style="background:#1f1c1a;color:#fff;font-family:sans-serif"><a href="${escHtml(go)}" style="color:#ffd65a">Open ${escHtml(t)} on Wynnia</a></body></html>`;
}
/* only Wynnia pages that carry shared data can be shortened */
const SHAREABLE = /^#(items\/loadout|mounts\/stable|mounts\/want|players\/lookup|world\/map|crafting\/ingredients)\?[A-Za-z0-9_\-=&%.~+,:;]{1,6000}$/;
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

async function shortId(text, len) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let n = 0n; for (const b of bytes.slice(0, 12)) n = (n << 8n) | BigInt(b);
  let id = ''; for (let i = 0; i < len; i++) { id += B62[Number(n % 62n)]; n /= 62n; }
  return id;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);

    /* short share links */
    if (url.pathname === '/s' || SHORT.test(url.pathname)) {
      if (!env.LINKS) return Response.json({ error: 'no-kv' }, { status: 503, headers: cors });
      if (request.method === 'POST' && url.pathname === '/s') {
        /* plain text is just the link; JSON is { link, meta } with a preview for embeds */
        const raw = (await request.text()).trim();
        let link = raw, meta = null;
        if ((request.headers.get('Content-Type') || '').includes('application/json')) {
          try { const j = JSON.parse(raw); link = String(j.link || '').trim(); meta = cleanMeta(j.meta); } catch (e) { link = ''; }
        }
        if (link.length > 6100 || !SHAREABLE.test(link)) return Response.json({ error: 'not-shareable' }, { status: 400, headers: cors });
        for (const len of [7, 10]) {
          const id = await shortId(link, len), have = await env.LINKS.get(id);
          if (have != null && have !== link) continue;
          if (have == null) await env.LINKS.put(id, link);
          if (meta && (await env.LINKS.get('m:' + id)) == null) await env.LINKS.put('m:' + id, JSON.stringify(meta));   // first preview stays, so nobody can re-title someone else's link
          return Response.json({ id, embed: !!meta || (await env.LINKS.get('m:' + id)) != null }, { headers: cors });
        }
        return Response.json({ error: 'collision' }, { status: 500, headers: cors });
      }
      if (request.method === 'GET') {
        const link = await env.LINKS.get(SHORT.exec(url.pathname)[1]);
        if (!link) return Response.json({ error: 'not-found' }, { status: 404, headers: cors });
        return Response.json({ link }, { headers: { ...cors, 'Cache-Control': 'public, max-age=86400' } });
      }
    }
    /* embed page for a short link that has a preview */
    const embed = EMBED.exec(url.pathname);
    if (embed && request.method === 'GET') {
      if (!env.LINKS) return Response.redirect(SITE, 302);
      const id = embed[1];
      if (!(await env.LINKS.get(id))) return Response.redirect(SITE, 302);
      let meta = null; try { meta = JSON.parse(await env.LINKS.get('m:' + id)); } catch (e) { /* no preview */ }
      return new Response(embedPage(id, meta), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const market = MARKET.exec(url.pathname);
    if (market && !env.WYNNVENTORY_KEY) return Response.json({ error: 'no-key' }, { status: 503, headers: cors });
    if (!market && !PATHS.test(url.pathname)) return new Response('Not found', { status: 404, headers: cors });
    const dates = new URLSearchParams();
    if (market && market[1] === 'history') ['start_date', 'end_date'].forEach(k => { const v = url.searchParams.get(k); if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) dates.set(k, v); });
    const target = market ? `https://wynnventory.com/api/v2/market/items/${market[2]}/${market[1]}` + (dates.toString() ? '?' + dates : '') : 'https://api.wynncraft.com' + url.pathname + url.search;
    const headers = { 'User-Agent': 'Wynnia relay (github.com/malynsx/wynnia)' };
    if (market) headers.Authorization = 'Api-Key ' + env.WYNNVENTORY_KEY;

    const cache = caches.default;
    const key = new Request(target);
    let res = await cache.match(key);
    if (!res) {
      const upstream = await fetch(target, { headers });
      res = new Response(upstream.body, upstream);
      if ([200, 300, 404].includes(upstream.status)) {
        res.headers.set('Cache-Control', 'public, max-age=' + (market ? (market[1] === 'history' ? 3600 : 600) : 120));
        ctx.waitUntil(cache.put(key, res.clone()));
      }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
