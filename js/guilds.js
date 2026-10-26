/* Guilds: live lookup through the Wynncraft API, and a territory snapshot. */
(function (W) {
  const { el } = W;
  const RANKS = W.GUILD_RANKS;
  const GL = { name: '', data: null, err: null, busy: false, filter: '', onlineOnly: false, sort: 'rank', lead: 'xp' };
  const RAIDS = ['Nest of the Grootslangs', "Orphion's Nexus of Light", 'The Canyon Colossus', 'The Nameless Anomaly', 'The Wartorn Palace'];
  const RAID_KEY = { grootslang: RAIDS[0], orphion: RAIDS[1], colossus: RAIDS[2], nameless: RAIDS[3], fruma: RAIDS[4] };
  const raidIcon = (n) => 'img/guide/' + (n.replace(/[^A-Za-z']/g, '') + 'Icon').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';

  /* A raiding guild has done more guild raids than wars, or holds no territory; anything else that wars is a war guild. */
  W.guildType = (d) => {
    if (!d || (!d.raids && !d.wars && !d.territories)) return null;
    return (d.raids || 0) > (d.wars || 0) || !d.territories ? 'raid' : 'war';
  };
  const TYPE = {
    raid: ['Raiding guild', (d) => `${(d.raids || 0).toLocaleString()} guild raids against ${(d.wars || 0).toLocaleString()} wars${d.territories ? '' : ', and no territory held'}.`],
    war: ['War guild', (d) => `${(d.wars || 0).toLocaleString()} wars against ${(d.raids || 0).toLocaleString()} guild raids, holding ${d.territories} ${d.territories === 1 ? 'territory' : 'territories'}.`],
  };
  W.guildTypeTag = (d) => { const t = W.guildType(d); return t ? el('span', { class: 'gtype ' + t, title: TYPE[t][1](d) }, el('img', { src: t === 'raid' ? raidIcon(RAIDS[2]) : 'img/wiki/guild-banner-tier-3.webp', alt: '' }), TYPE[t][0]) : null; };

  /* leaderboard keys from the API, in words */
  const rankName = (k) => { let m;
    if ((m = /^guildSeason(\d+)$/.exec(k))) return 'Season ' + m[1];
    if (k === 'guildTotalRaids') return 'All-time guild raids';
    if ((m = /^(\w+?)SrGuilds$/.exec(k))) return (RAID_KEY[m[1]] || W.cap(m[1])) + ' board';
    return W.cap(k.replace(/([A-Z])/g, ' $1').toLowerCase()); };

  /* guild season dates, fetched once */
  let seasonsP = null, SEASONS = null;
  const loadSeasons = () => seasonsP || (seasonsP = W.api('guild/seasons').then(d => { SEASONS = d; }).catch(() => { SEASONS = {}; }));
  const latestSeason = () => {
    const k = SEASONS && Object.keys(SEASONS).sort((a, b) => b - a)[0];
    return k ? { n: +k, end: Date.parse(SEASONS[k].endDate) } : null;
  };
  const svg = (markup) => { const d = el('div'); d.innerHTML = markup; return d.firstChild; };

  W.pages['guilds/lookup'] = function (root, q) {
    if (q && q.get('g') && (!GL.data || GL.data.name !== q.get('g')) && !GL.busy) { GL.name = q.get('g'); setTimeout(go, 0); }
    const draw = () => root.replaceChildren(el('div', { class: 'stack' }, form(), info(), overview(), extras(), members()));
    async function go() {
      if (!GL.name) return;
      GL.busy = true; GL.err = null; draw();
      try {
        /* Short names are usually tags; try the likelier lookup first and fall back to the other. */
        const n = encodeURIComponent(GL.name), tries = GL.name.length <= 4 ? [`guild/prefix/${n}`, `guild/${n}`] : [`guild/${n}`, `guild/prefix/${n}`];
        let d = null, err = null;
        for (const t of tries) { try { d = await W.api(t); break; } catch (e) { err = e; } }
        if (!d) throw err;
        if (d.multiple) throw new Error('That name matches several guilds. Use the full name.');
        GL.data = d;
        history.replaceState(null, '', '#guilds/lookup?g=' + encodeURIComponent(d.name));
        loadSeasons().then(() => { if (GL.data === d) draw(); });
      } catch (e) { GL.err = e.message; GL.data = null; }
      GL.busy = false; draw();
    }
    const everyone = (d) => RANKS.flatMap(r => Object.entries(d.members && d.members[r] || {}).map(([name, m]) => ({ name: m.username || name, rank: r, ...m,
      raids: m.globalData && m.globalData.currentGuildRaids ? m.globalData.currentGuildRaids.total : null,
      wars: m.globalData ? m.globalData.wars : null })));

    function form() {
      const inp = el('input', { type: 'text', value: GL.name, placeholder: 'Guild name or tag', maxlength: 40, oninput: (e) => { GL.name = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') go(); } });
      return W.win('Guild lookup', el('div', { class: 'search' }, inp, el('button', { onclick: go }, 'Look up')),
        el('p', { class: 'hint' }, 'Type the full guild name, or its tag (for example ', el('b', {}, 'ESI'), ' or ', el('b', {}, 'Imp'), ').'));
    }
    function info() {
      if (GL.busy) return W.win('Guild', el('p', { class: 'empty' }, 'Asking the Wynncraft API…'));
      if (GL.err) return W.win('Guild', el('div', { class: 'warn' }, GL.err));
      const d = GL.data; if (!d) return null;
      const all = everyone(d);
      const tile = (label, value) => el('div', {}, el('b', {}, value == null ? '—' : value), el('span', {}, label));
      return el('section', { class: 'herocard guild' },
        el('div', { class: 'herobanner' }, W.banner(d.banner)),
        el('div', { class: 'heroinfo' },
          el('div', { class: 'heroname' }, el('h2', {}, d.name), el('span', { class: 'tag' }, d.prefix), W.guildTypeTag(d)),
          el('div', { class: 'herometa' },
            el('span', { class: 'online' }, `${d.online ?? all.filter(m => m.online).length} online`),
            d.created ? el('span', {}, 'Founded ' + new Date(d.created).toLocaleDateString()) : null,
            d.banner && d.banner.tier ? el('span', {}, `Banner tier ${d.banner.tier}`) : null,
            d.territories ? el('a', { href: '#world/map?m=territories&l=terr,routes,hq,tnames&g=' + encodeURIComponent(d.name) }, 'See territories on the map') : null),
          el('div', { class: 'glevel' }, el('b', {}, 'Level ' + (d.level ?? '?')),
            el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: (d.xpPercent || 0) + '%', '--c': 'var(--gold)' } })), el('span', {}, (d.xpPercent ?? 0) + '%')),
          el('div', { class: 'herotiles' },
            tile('Members', d.members ? d.members.total ?? all.length : null),
            tile('Territories', d.territories),
            tile('Wars', d.wars != null ? d.wars.toLocaleString() : null),
            tile('Guild raids', d.raids != null ? d.raids.toLocaleString() : null),
            tile('Total XP given', W.short(all.reduce((a, m) => a + (m.contributed || 0), 0))))));
    }

    /* seasons, leaderboard places, raid split and activity */
    function overview() {
      const d = GL.data; if (!d || GL.busy) return null;
      const all = everyone(d), now = Date.now();
      const list = d.seasonRanks ? Object.entries(d.seasonRanks).map(([s, v]) => ({ s: +s, ...v })).sort((a, b) => a.s - b.s) : [];
      const cur = latestSeason();
      const maxR = Math.max(1, ...list.map(x => x.rating || 0)), maxT = Math.max(1, ...list.map(x => x.finalTerritories || 0));
      const W_ = Math.max(list.length * 26, 260), H = 150;
      const chart = list.length ? el('div', { class: 'schart' }, svg(`<svg viewBox="0 0 ${W_} ${H + 22}" preserveAspectRatio="none" role="img" aria-label="Season rating and territories by season">` +
        list.map((x, i) => { const h = (x.rating || 0) / maxR * H, th = (x.finalTerritories || 0) / maxT * H, X = i * 26;
          return `<rect x="${X + 3}" y="${H - h}" width="20" height="${h}" rx="2" class="sr${cur && x.s === cur.n ? ' now' : ''}"><title>Season ${x.s}: ${(x.rating || 0).toLocaleString()} rating, ${x.finalTerritories || 0} territories at the end</title></rect>` +
            `<circle cx="${X + 13}" cy="${H - th}" r="3.5" class="st"><title>${x.finalTerritories || 0} territories</title></circle>` +
            (i % Math.ceil(list.length / 12) === 0 ? `<text x="${X + 13}" y="${H + 16}" text-anchor="middle">${x.s}</text>` : ''); }).join('') +
        `<polyline class="stl" fill="none" points="${list.map((x, i) => `${i * 26 + 13},${H - (x.finalTerritories || 0) / maxT * H}`).join(' ')}"/></svg>`)) : null;

      const best = Object.entries(d.ranking || {}).sort((a, b) => a[1] - b[1]).slice(0, 8);
      const raidSum = {}; all.forEach(m => { const l = m.globalData && m.globalData.currentGuildRaids && m.globalData.currentGuildRaids.list; if (l) Object.entries(l).forEach(([r, n]) => { raidSum[r] = (raidSum[r] || 0) + n; }); });
      const raidRows = Object.entries(raidSum).filter(([, n]) => n).sort((a, b) => b[1] - a[1]), raidMax = raidRows.length ? raidRows[0][1] : 1;
      const seen = (days) => all.filter(m => m.lastJoin && now - new Date(m.lastJoin) < days * 864e5).length;
      const online = all.filter(m => m.online);
      return el('div', { class: 'cols' },
        W.win('Seasons',
          cur ? el('p', { class: 'hint', style: { marginTop: 0 } }, cur.end > now ? `Season ${cur.n} is on and ends in ${W.fmtDur((cur.end - now) / 6e4)} (${new Date(cur.end).toLocaleDateString()}).` : `Season ${cur.n} has ended.`) : null,
          chart || el('p', { class: 'empty' }, 'This guild hasn’t taken part in a season yet.'),
          chart ? el('div', { class: 'slegend' }, el('span', {}, el('i', { class: 'lg sr' }), 'Season rating'), el('span', {}, el('i', { class: 'lg st' }), 'Territories at the end')) : null,
          best.length ? el('div', { class: 'cap left' }, 'Best leaderboard places') : null,
          best.length ? el('div', { class: 'rankchips' }, best.map(([k, p]) => el('span', { class: 'rankchip' + (p <= 3 ? ' top' : '') }, el('b', {}, '#' + p), rankName(k)))) : null),
        el('div', { class: 'stack' },
          W.win('Activity',
            el('div', { class: 'bigstats', style: { marginTop: 0 } },
              el('div', {}, el('b', {}, online.length), el('span', {}, 'Online now')),
              el('div', {}, el('b', {}, seen(1)), el('span', {}, 'On today')),
              el('div', {}, el('b', {}, seen(7)), el('span', {}, 'This week'))),
            el('p', { class: 'hint' }, `${all.length - seen(30)} of ${all.length} members haven’t played in 30 days.`),
            online.length ? el('div', { class: 'onlinelist' }, online.map(m => el('a', { href: '#players/lookup?u=' + encodeURIComponent(m.name) }, m.uuid ? W.head(m.uuid, 24) : null, m.name, el('small', {}, m.server || '')))) : null),
          raidRows.length ? W.win('Guild raids by raid', el('div', { class: 'blist' }, raidRows.map(([r, n]) => el('div', { class: 'brow2 raidrow' },
            el('span', {}, el('img', { src: raidIcon(r), alt: '' }), r),
            el('div', { class: 'cbar' }, el('i', { class: 'gold', style: { width: n / raidMax * 100 + '%' } }), el('b', {}, n.toLocaleString()))))),
            el('p', { class: 'hint' }, 'Added up from the current members’ guild raids, so people who left aren’t counted.')) : null));
    }
    function extras() {
      const d = GL.data; if (!d || !d.members || GL.busy) return null;
      const all = everyone(d);
      const LEADS = { xp: ['XP given', (m) => m.contributed || 0, (v) => W.short(v) + ' XP'], raids: ['Guild raids', (m) => m.raids || 0, (v) => v.toLocaleString() + ' raids'], wars: ['Wars', (m) => m.wars || 0, (v) => v.toLocaleString() + ' wars'] };
      const [, val, show] = LEADS[GL.lead];
      const top = [...all].sort((a, b) => val(b) - val(a)).slice(0, 10), max = (top[0] && val(top[0])) || 1;
      const fresh = all.filter(m => m.joined).sort((a, b) => new Date(b.joined) - new Date(a.joined)).slice(0, 8);
      return el('div', { class: 'cols' },
        W.win('Top members',
          el('div', { class: 'wseg' }, Object.entries(LEADS).map(([k, [label]]) => el('button', { class: GL.lead === k ? 'on' : '', onclick: () => { GL.lead = k; draw(); } }, label))),
          el('div', { class: 'blist', style: { marginTop: '12px' } }, top.map((m, i) => el('div', { class: 'brow2 contrib' },
            el('a', { href: '#players/lookup?u=' + encodeURIComponent(m.name) }, `${i + 1}. ${m.name}`),
            el('div', { class: 'cbar' }, el('i', { class: 'gold', style: { width: val(m) / max * 100 + '%' } }), el('b', {}, show(val(m))))))),
          GL.lead === 'wars' ? el('p', { class: 'hint' }, 'Wars count every war the player has fought, in any guild.') : null),
        W.win('Newest members', el('div', { class: 'ahead' }, fresh.map(m => el('a', { class: 'arow', href: '#players/lookup?u=' + encodeURIComponent(m.name), style: { color: '#fff', textDecoration: 'none' } },
          m.uuid ? W.head(m.uuid, 40) : null, el('div', {}, el('b', {}, m.name), el('small', {}, `${W.cap(m.rank)} · joined ${W.ago(m.joined)}`)))))));
    }
    function members() {
      const d = GL.data; if (!d || !d.members || GL.busy) return null;
      const SORTS = { rank: 'Rank', contributed: 'XP given', raids: 'Guild raids', wars: 'Wars', seen: 'Last seen', joined: 'Joined' };
      const by = { contributed: (a, b) => (b.contributed || 0) - (a.contributed || 0), raids: (a, b) => (b.raids || 0) - (a.raids || 0), wars: (a, b) => (b.wars || 0) - (a.wars || 0),
        seen: (a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || new Date(b.lastJoin || 0) - new Date(a.lastJoin || 0), joined: (a, b) => new Date(b.joined || 0) - new Date(a.joined || 0) };
      const card = (m) => el('a', { class: 'member' + (m.online ? ' on' : ''), href: '#players/lookup?u=' + encodeURIComponent(m.name) },
        m.uuid ? W.head(m.uuid, 56) : el('span', { class: 'head' }),
        el('div', { class: 'minfo' },
          el('b', {}, m.name, GL.sort !== 'rank' ? el('span', { class: 'mstars' }, W.rankStars(m.rank)) : null),
          W.tip(el('small', {}, W.short(m.contributed || 0) + ' XP given'), (m.contributed || 0).toLocaleString() + ' XP'),
          el('small', {}, [m.raids != null ? m.raids + ' raids' : null, m.wars != null ? m.wars + ' wars' : null].filter(Boolean).join(' · ')),
          el('small', {}, m.online ? 'Online now' : m.lastJoin ? 'Seen ' + W.ago(m.lastJoin) : m.joined ? 'Joined ' + W.ago(m.joined) : '')),
        el('span', { class: 'pill ' + (m.online ? 'yes' : 'no') }, m.online ? (m.server || 'Online') : 'Offline'));
      const build = () => {
        const f = GL.filter.toLowerCase();
        const list = everyone(d).filter(m => (!f || m.name.toLowerCase().includes(f)) && (!GL.onlineOnly || m.online));
        if (GL.sort !== 'rank') return list.length ? [el('div', { class: 'memgrid' }, list.sort(by[GL.sort]).map(card))] : [];
        return RANKS.map(r => {
          const rl = list.filter(m => m.rank === r).sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || (b.contributed || 0) - (a.contributed || 0));
          if (!rl.length) return null;
          return el('div', { class: 'ranksec' },
            el('div', { class: 'rankhead' }, el('span', { class: 'stars' }, W.rankStars(r) || '·'), W.cap(r) + (r === 'owner' ? '' : 's'), el('small', {}, rl.length)),
            el('div', { class: 'memgrid' }, rl.map(card)));
        }).filter(Boolean);
      };
      return W.win('Members',
        el('div', { class: 'memtools' },
          el('input', { type: 'text', placeholder: 'Find a member', value: GL.filter, oninput: (e) => { GL.filter = e.target.value; const m = root.querySelector('.memwrap'); if (m) m.replaceWith(wrap()); } }),
          el('label', {}, 'Sort by ', W.sel(Object.entries(SORTS), GL.sort, (v) => { GL.sort = v; draw(); })),
          el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: GL.onlineOnly, onchange: (e) => { GL.onlineOnly = e.target.checked; draw(); } }), 'Online only')),
        wrap());
      function wrap() { const sections = build(); return el('div', { class: 'memwrap' }, sections.length ? sections : el('p', { class: 'empty' }, 'No members match.')); }
    }
    draw();
  };

  const TF = { q: '' };
  W.pages['guilds/territories'] = function (root) {
    W.withData(root, ['territories', 'meta'], (terr, meta) => {
      const byGuild = {};
      terr.forEach(t => { if (!t.g) return; (byGuild[t.g] = byGuild[t.g] || { name: t.g, prefix: t.p, color: t.c, list: [], hq: null }).list.push(t); if (t.hq) byGuild[t.g].hq = t.n; });
      const guilds = Object.values(byGuild).sort((a, b) => b.list.length - a.list.length);
      const out = el('div', {});
      const draw = () => {
        const q = TF.q.trim().toLowerCase();
        const shown = guilds.filter(gd => !q || gd.name.toLowerCase().includes(q) || (gd.prefix || '').toLowerCase() === q || gd.list.some(t => t.n.toLowerCase().includes(q)));
        out.replaceChildren(W.win(`${guilds.length} guilds hold ${terr.filter(t => t.g).length} of ${terr.length} territories`,
          el('div', { class: 'tscroll' }, el('table', { class: 'tbl' },
            el('thead', {}, el('tr', {}, ['#', 'Guild', 'Territories', 'Headquarters'].map(h => el('th', {}, h)))),
            el('tbody', {}, shown.map(gd => el('tr', {},
              el('td', {}, guilds.indexOf(gd) + 1),
              el('td', {}, el('span', { class: 'sw', style: { background: gd.color || '#888' } }), el('a', { href: '#guilds/lookup?g=' + encodeURIComponent(gd.name) }, gd.name), ` [${gd.prefix || '?'}]`),
              el('td', {}, W.tip(el('b', {}, gd.list.length), () => el('div', {}, el('div', { class: 'tt-name' }, gd.name), gd.list.slice(0, 30).map(t => el('div', { class: 'tt-g' }, t.n)), gd.list.length > 30 ? el('div', { class: 'tt-g' }, `…${gd.list.length - 30} more`) : null))),
              el('td', {}, gd.hq || '—')))))),
          el('p', { class: 'hint' }, `Snapshot from ${meta.built}. Territories change hands all the time, so check in-game before a war.`)));
      };
      root.replaceChildren(W.win('Territories', el('div', { class: 'search' }, el('input', { type: 'text', placeholder: 'Filter by guild, tag or territory', value: TF.q, oninput: (e) => { TF.q = e.target.value; draw(); } }))), out);
      draw();
    });
  };
})(window.W);
