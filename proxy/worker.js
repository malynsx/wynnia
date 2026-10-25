/* Wynntools API relay (Cloudflare Worker).
   The Wynncraft API does not send CORS headers, so browsers block it on other sites.
   This worker forwards player, guild, ability-tree and leaderboard requests only, adds CORS for
   the Wynntools site, and caches each answer for two minutes to stay well under Wynncraft's rate limit.
   /market/price/{item} asks Wynnventory for trade market prices with the key stored as the worker secret
   WYNNVENTORY_KEY (never sent to browsers); answers are cached for ten minutes.
   POST /s stores a Wynntools share link (loadout, stable, showcase) in the KV namespace bound as LINKS and
   answers with a short id; GET /s/{id} gives the link back. Ids come from a hash of the link, so the same
   build always gets the same id. */
const ALLOWED = ['https://malynsx.github.io', 'http://localhost:8765', 'http://localhost:8766'];
const PATHS = /^\/v3\/(player|guild|ability|leaderboards)(\/[^/]+){0,4}$/;
const MARKET = /^\/market\/price\/([^/]{1,80})$/;
const SHORT = /^\/s\/([A-Za-z0-9]{4,12})$/;
/* only Wynntools pages that carry shared data can be shortened */
const SHAREABLE = /^#(items\/loadout|mounts\/stable|mounts\/want|players\/lookup)\?[A-Za-z0-9_\-=&%.~+]{1,6000}$/;
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
        const link = (await request.text()).trim();
        if (link.length > 6100 || !SHAREABLE.test(link)) return Response.json({ error: 'not-shareable' }, { status: 400, headers: cors });
        for (const len of [7, 10]) {
          const id = await shortId(link, len), have = await env.LINKS.get(id);
          if (have === link) return Response.json({ id }, { headers: cors });
          if (have == null) { await env.LINKS.put(id, link); return Response.json({ id }, { headers: cors }); }
        }
        return Response.json({ error: 'collision' }, { status: 500, headers: cors });
      }
      if (request.method === 'GET') {
        const link = await env.LINKS.get(SHORT.exec(url.pathname)[1]);
        if (!link) return Response.json({ error: 'not-found' }, { status: 404, headers: cors });
        return Response.json({ link }, { headers: { ...cors, 'Cache-Control': 'public, max-age=86400' } });
      }
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const market = MARKET.exec(url.pathname);
    if (market && !env.WYNNVENTORY_KEY) return Response.json({ error: 'no-key' }, { status: 503, headers: cors });
    if (!market && !PATHS.test(url.pathname)) return new Response('Not found', { status: 404, headers: cors });
    const target = market ? `https://wynnventory.com/api/v2/market/items/${market[1]}/price` : 'https://api.wynncraft.com' + url.pathname + url.search;
    const headers = { 'User-Agent': 'Wynntools relay (github.com/malynsx/wynntools)' };
    if (market) headers.Authorization = 'Api-Key ' + env.WYNNVENTORY_KEY;

    const cache = caches.default;
    const key = new Request(target);
    let res = await cache.match(key);
    if (!res) {
      const upstream = await fetch(target, { headers });
      res = new Response(upstream.body, upstream);
      if ([200, 300, 404].includes(upstream.status)) {
        res.headers.set('Cache-Control', 'public, max-age=' + (market ? 600 : 120));
        ctx.waitUntil(cache.put(key, res.clone()));
      }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
