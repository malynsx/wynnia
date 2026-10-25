/* Watchlist (friends online) and official leaderboards, both through the API relay. */
(function (W) {
  const { el } = W;
  const KEY = 'wt.watch';
  const loadList = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const saveList = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* storage blocked */ } };

  W.pages['players/watchlist'] = function (root) {
    let names = loadList();
    const draw = () => root.replaceChildren(el('div', { class: 'stack' }, form(), grid()));
    /* One request for everyone: the API's list of online players (name -> server). */
    let online = null, err = null, at = null;
    async function refresh() {
      try {
        const d = await W.api('player');
        online = {}; Object.entries(d.players || d).forEach(([n, srv]) => { if (typeof srv === 'string') online[n.toLowerCase()] = srv; });
        err = null; at = Date.now();
      } catch (e) { err = e.message; }
      draw();
    }
    function form() {
      const inp = el('input', { type: 'text', placeholder: 'Add a username', maxlength: 16, onkeydown: (e) => { if (e.key === 'Enter') add(); } });
      const add = () => {
        const v = inp.value.trim(); if (!v || names.some(n => n.toLowerCase() === v.toLowerCase())) return;
        names.push(v); saveList(names); draw();
      };
      return W.win('Watchlist', el('div', { class: 'search' }, inp, el('button', { onclick: add }, 'Add'), el('button', { onclick: refresh }, 'Refresh')),
        el('p', { class: 'hint' }, 'Keep an eye on your friends. The list is saved in this browser and refreshes every two minutes while the page is open.'));
    }
    function grid() {
      if (!names.length) return W.win('Friends', el('div', { class: 'empty' }, 'Add a few usernames to start.'));
      const srv = (n) => online && online[n.toLowerCase()];
      const rows = names.slice().sort((a, b) => (srv(b) ? 1 : 0) - (srv(a) ? 1 : 0) || a.localeCompare(b));
      return W.win(`Friends · ${rows.filter(srv).length} online`,
        err ? el('div', { class: 'warn' }, err) : null,
        el('div', { class: 'memgrid' }, rows.map(n => el('div', { class: 'member' + (srv(n) ? ' on' : '') },
          el('img', { class: 'head', src: `https://mc-heads.net/avatar/${encodeURIComponent(n)}/56`, alt: '', width: 56, height: 56 }),
          el('a', { class: 'minfo', href: '#players/lookup?u=' + encodeURIComponent(n), style: { color: '#fff', textDecoration: 'none' } },
            el('b', {}, n), el('small', {}, !online ? 'Checking…' : srv(n) ? `Online on ${srv(n)}` : 'Offline')),
          el('button', { class: 'mini', title: 'Remove', onclick: () => { names = names.filter(x => x !== n); saveList(names); draw(); } }, 'Remove')))),
        at ? el('p', { class: 'hint' }, 'Checked ' + new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '. Click a friend for their full profile.') : null);
    }
    draw(); refresh();
    const t = setInterval(refresh, 120000);
    W.onLeave(() => clearInterval(t));
  };

  /* Leaderboards */
  const LBS = { type: 'combatGlobalLevel', types: null, rows: null, err: null };
  const pretty = (t) => W.words(String(t)).replace(/Global/, '').replace(/ Level$/, ' level').trim();
  W.pages['players/leaderboards'] = function (root) {
    const draw = () => root.replaceChildren(el('div', { class: 'stack' }, head(), table()));
    async function load() {
      LBS.rows = null; LBS.err = null; draw();
      try {
        if (!LBS.types) { const t = await W.api('leaderboards/types'); LBS.types = Array.isArray(t) ? t : Object.values(t).flat(); if (!LBS.types.includes(LBS.type)) LBS.type = LBS.types[0]; }
        const d = await W.api(`leaderboards/${LBS.type}?resultLimit=100`);
        LBS.rows = Object.entries(d).map(([rank, v]) => ({ rank: +rank, ...v })).sort((a, b) => a.rank - b.rank);
      } catch (e) { LBS.err = e.message; }
      draw();
    }
    function head() {
      return W.win('Leaderboards',
        LBS.types ? el('div', { class: 'form row' }, el('label', {}, 'Leaderboard', W.sel(LBS.types.map(t => [t, pretty(t)]), LBS.type, (v) => { LBS.type = v; load(); }))) : null,
        el('p', { class: 'hint' }, 'The official Wynncraft leaderboards, top 100. Click a name to open their profile.'));
    }
    function table() {
      if (LBS.err) return W.win('Top 100', el('div', { class: 'warn' }, LBS.err));
      if (!LBS.rows) return W.win('Top 100', el('p', { class: 'empty' }, 'Loading…'));
      const guild = /guild/i.test(LBS.type);
      const extra = [...new Set(LBS.rows.flatMap(r => Object.keys(r.metadata || {})))].filter(k => LBS.rows.some(r => typeof (r.metadata || {})[k] === 'number')).slice(0, 2);
      return W.win('Top 100', el('div', { class: 'tscroll' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['#', guild ? 'Guild' : 'Player', 'Score', ...extra.map(W.words)].map(h => el('th', {}, h)))),
        el('tbody', {}, LBS.rows.map(r => el('tr', {},
          el('td', {}, r.rank),
          el('td', {}, el('a', { class: 'lbname', href: guild ? '#guilds/lookup?g=' + encodeURIComponent(r.name) : '#players/lookup?u=' + encodeURIComponent(r.name) },
            !guild && r.uuid ? W.head(r.uuid, 28) : null, r.name, r.prefix ? ` [${r.prefix}]` : '')),
          el('td', {}, el('b', {}, r.score != null ? Number(r.score).toLocaleString() : '—')),
          ...extra.map(k => el('td', {}, (r.metadata || {})[k] != null ? Number(r.metadata[k]).toLocaleString() : '—'))))))));
    }
    draw(); load();
  };
})(window.W);
