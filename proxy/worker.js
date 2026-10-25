/* Wynntools API relay (Cloudflare Worker).
   The Wynncraft API does not send CORS headers, so browsers block it on other sites.
   This worker forwards player, guild, ability-tree and leaderboard requests only, adds CORS for
   the Wynntools site, and caches each answer for two minutes to stay well under Wynncraft's rate limit. */
const ALLOWED = ['https://malynsx.github.io', 'http://localhost:8765', 'http://localhost:8766'];
const PATHS = /^\/v3\/(player|guild|ability|leaderboards)(\/[^/]+){0,4}$/;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!PATHS.test(url.pathname)) return new Response('Not found', { status: 404, headers: cors });
    const target = 'https://api.wynncraft.com' + url.pathname + url.search;

    const cache = caches.default;
    const key = new Request(target);
    let res = await cache.match(key);
    if (!res) {
      const upstream = await fetch(target, { headers: { 'User-Agent': 'Wynntools relay (github.com/malynsx/wynntools)' } });
      res = new Response(upstream.body, upstream);
      if ([200, 300, 404].includes(upstream.status)) {
        res.headers.set('Cache-Control', 'public, max-age=120');
        ctx.waitUntil(cache.put(key, res.clone()));
      }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
