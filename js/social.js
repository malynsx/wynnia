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
  const RAIDS = { grootslang: 'Nest of the Grootslangs', colossus: 'The Canyon Colossus', orphion: 'Orphion’s Nexus of Light', nameless: 'The Nameless Anomaly', fruma: 'The Wartorn Palace' };
  const MODES = { hunted: 'Hunted', craftsman: 'Craftsman', ironman: 'Ironman', ultimateIronman: 'Ultimate Ironman', hardcore: 'Hardcore', huic: 'Hardcore Ultimate Ironman Craftsman', huich: 'Hardcore Ultimate Ironman Craftsman Hunted', hic: 'Hardcore Ironman Craftsman', hich: 'Hardcore Ironman Craftsman Hunted' };
  /* type id -> [group, label] */
  function describe(t) {
    let m;
    if ((m = /^guildSeason(\d+)$/.exec(t))) return ['Guild seasons', 'Season ' + m[1]];
    if ((m = /^(\w+?)Sr(Players|Guilds|GPlayers)$/.exec(t)) && RAIDS[m[1]]) return ['Raid speedruns', `${RAIDS[m[1]]} · ${({ Players: 'players', Guilds: 'guilds', GPlayers: 'guild players' })[m[2]]}`];
    if ((m = /^(\w+?)Completion$/.exec(t)) && RAIDS[m[1]]) return ['Raids', RAIDS[m[1]] + ' completions'];
    if (t === 'warsCompletion') return ['Guilds', 'Wars won'];
    if (/^guild/.test(t)) return ['Guilds', W.words(t.replace(/^guild/, '')).trim() || 'Level'];
    if ((m = /^(\w+?)Content$/.exec(t)) && MODES[m[1]]) return ['Gamemodes', MODES[m[1]] + ' content'];
    if (t === 'hardcoreLegacyLevel') return ['Gamemodes', 'Hardcore (legacy) level'];
    if ((m = /^(woodcutting|mining|fishing|farming|alchemism|armouring|cooking|jeweling|scribing|tailoring|weaponsmithing|woodworking)Level$/.exec(t))) return ['Professions', W.cap(m[1])];
    const names = { professionsGlobalLevel: 'All professions (account)', professionsSoloLevel: 'All professions (one character)', combatGlobalLevel: 'Combat level (account)', combatSoloLevel: 'Combat level (one character)',
      totalGlobalLevel: 'Total level (account)', totalSoloLevel: 'Total level (one character)', playerContent: 'Content completion (character)', globalPlayerContent: 'Content completion (account)' };
    return ['General', names[t] || W.words(t)];
  }
  const LBS = { type: 'combatGlobalLevel', types: null, rows: null, err: null };
  W.pages['players/leaderboards'] = function (root) {
    const draw = () => root.replaceChildren(el('div', { class: 'stack' }, head(), table()));
    async function load() {
      LBS.rows = null; LBS.err = null; draw();
      try {
        if (!LBS.types) { const t = await W.api('leaderboards/types'); LBS.types = Array.isArray(t) ? t : Object.values(t).flat(); if (!LBS.types.includes(LBS.type)) LBS.type = LBS.types[0]; }
        const d = await W.api(`leaderboards/${LBS.type}?resultLimit=100`);
        LBS.rows = Object.entries(d).map(([rank, v]) => ({ pos: +rank, ...v })).sort((a, b) => a.pos - b.pos);
      } catch (e) { LBS.err = e.message; }
      draw();
    }
    function head() {
      let picker = null;
      if (LBS.types) {
        const groups = {};
        LBS.types.forEach(t => { const [g, label] = describe(t); (groups[g] = groups[g] || []).push([t, label]); });
        const order = ['General', 'Professions', 'Raids', 'Raid speedruns', 'Gamemodes', 'Guilds', 'Guild seasons'];
        picker = el('select', { onchange: (e) => { LBS.type = e.target.value; load(); } },
          order.filter(g => groups[g]).map(g => el('optgroup', { label: g }, (g === 'Guild seasons' ? groups[g].sort((a, b) => +b[1].split(' ')[1] - +a[1].split(' ')[1]) : groups[g])
            .map(([t, label]) => el('option', { value: t, selected: t === LBS.type }, label)))));
      }
      return W.win('Leaderboards',
        picker ? el('div', { class: 'form row' }, el('label', {}, 'Leaderboard', picker)) : null,
        el('p', { class: 'hint' }, 'The official Wynncraft leaderboards, top 100. Click a name to open their page.'));
    }
    function table() {
      if (LBS.err) return W.win('Top 100', el('div', { class: 'warn' }, LBS.err));
      if (!LBS.rows) return W.win('Top 100', el('p', { class: 'empty' }, 'Loading…'));
      const guild = LBS.rows.length && LBS.rows[0].prefix != null;
      const [, title] = describe(LBS.type);
      const fmt = (v) => v == null ? '—' : typeof v === 'number' ? v.toLocaleString() : v;
      const meta = guild ? [] : [...new Set(LBS.rows.flatMap(r => Object.keys(r.metadata || {})))].filter(k => LBS.rows.some(r => typeof (r.metadata || {})[k] === 'number')).slice(0, 3);
      const cols = guild ? ['#', 'Guild', 'Score', 'Level', 'Territories', 'Wars'] : ['#', 'Player', 'Score', ...meta.map(k => k === 'playtime' ? 'Playtime (h)' : k === 'xp' ? 'XP' : W.words(k))];
      const showScore = LBS.rows.some(r => r.score != null);
      return W.win(title + ' · top 100', el('div', { class: 'tscroll' }, el('table', { class: 'tbl lbt' },
        el('thead', {}, el('tr', {}, cols.filter(c => c !== 'Score' || showScore).map(h => el('th', {}, h)))),
        el('tbody', {}, LBS.rows.map(r => el('tr', {},
          el('td', {}, el('b', {}, r.pos)),
          el('td', {}, el('a', { class: 'lbname', href: guild ? '#guilds/lookup?g=' + encodeURIComponent(r.name) : '#players/lookup?u=' + encodeURIComponent(r.name) },
            guild ? W.banner(r.banner) : (r.uuid ? W.head(r.uuid, 28) : null), el('span', {}, r.name), guild && r.prefix ? el('span', { class: 'tag small' }, r.prefix) : W.rankBadge(r.rankBadge, r.supportRank))),
          showScore ? el('td', {}, el('b', {}, fmt(r.score))) : null,
          ...(guild ? [r.level, r.territories, r.wars].map(v => el('td', {}, fmt(v))) : meta.map(k => el('td', {}, fmt((r.metadata || {})[k]))))))))));
    }
    draw(); load();
  };
})(window.W);
