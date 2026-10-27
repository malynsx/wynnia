/* Player page: profile + mount access from the public Wynncraft API, and a shareable showcase of mounts
   pasted from Wynntils (the API does not publish mounts themselves). */
(function (W) {
  const { el } = W;
  const REQS = [
    ['horse', 9, 'Stable Story'],
    ['wyvern', 84, 'The Canyon Guides'],
    ['adasaur', 115, 'Burning Bonds'],
  ];
  const b64 = {
    enc: (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))),
  };
  const P = { name: '', data: null, choices: null, err: null, loading: false, text: '' };

  function parseMounts(text) {
    return WynntilsDecode.decodeText(text).map(r => {
      if (!r.ok) return r;
      const d = WynntilsDecode.toAppMount(r.mount), C = W.COLORS[d.type];
      const m = W.newMount(d.type, { name: d.name, s: d.s });
      if (C.body.some(c => c[0] === d.c1)) m.c1 = d.c1;
      if (C.second.some(c => c[0] === d.c2)) m.c2 = d.c2;
      return { ok: true, mount: W.clampMount(m), estimated: d.estimated };
    });
  }

  W.pages.player = function (root, q) {
    let REF = null;
    Promise.all(['profxp', 'spots', 'quests'].map(W.data)).then(r => { REF = r; if (P.data) draw(); }).catch(() => {});
    if (q && q.get('c')) P.char = q.get('c');
    const draw = () => root.replaceChildren(el('div', { class: 'stack' }, lookup(), profile(), showcase()));

    if (q && q.get('u') && !P.name) P.name = q.get('u');
    if (q && q.get('d') && !P.text) { try { P.text = b64.dec(q.get('d')).t || ''; } catch (e) { /* bad link */ } }
    if (q && q.get('u') && !P.data && !P.loading && !P.err) setTimeout(() => find(P.name), 0);

    async function find(name, uuid) {
      name = (name || '').trim(); if (!name) return;
      P.loading = true; P.err = null; P.choices = null; draw();
      try {
        const j = await W.api('player/' + encodeURIComponent(uuid || name) + '?fullResult');
        if (j.multiple) { P.choices = j.multiple; P.data = null; }
        else { P.data = j; P.name = j.username; }
      } catch (e) {
        P.data = null;
        P.err = e.message;
      }
      P.loading = false; draw();
    }

    function lookup() {
      const inp = el('input', { type: 'text', value: P.name, placeholder: 'Minecraft username', maxlength: 32, onkeydown: (e) => { if (e.key === 'Enter') { P.name = inp.value; find(inp.value); } } });
      return W.win('Player Lookup',
        el('div', { class: 'search' }, inp, el('button', { onclick: () => { P.name = inp.value; find(inp.value); } }, 'Look up')),
        el('p', { class: 'hint' }, 'Live data from the Wynncraft API. Mounts themselves aren’t published, so paste them into the showcase below.'));
    }

    function profile() {
      if (P.loading) return W.win('Profile', el('p', { class: 'empty' }, 'Asking the Wynncraft API…'));
      if (P.err) return W.win('Profile', el('div', { class: 'warn' }, P.err));
      if (P.choices) return W.win('Several players match', el('div', { class: 'choices' }, Object.entries(P.choices).map(([id, v]) =>
        el('button', { onclick: () => find(P.name, id) }, (v && (v.storedName || v.username)) || id))));
      const d = P.data;
      if (!d) return null;
      const gd = d.globalData || {};
      const chars = Object.entries(d.characters || {}).map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => (b.level || 0) - (a.level || 0));
      /* Stable Story unlocks horses for the whole account (wiki: Horses). */
      const anyStable = chars.some(c => (c.quests || []).includes('Stable Story'));
      const tile = (label, value) => el('div', {}, el('b', {}, value == null ? '—' : value), el('span', {}, label));
      const status = d.online ? el('span', { class: 'online' }, `Online on ${d.server}`) : el('span', { class: 'offline' }, 'Last seen ' + (W.ago(d.lastJoin) || 'a while ago'));
      const hero = el('section', { class: 'herocard' },
        el('div', { class: 'heroportrait' }, el('img', { src: `https://mc-heads.net/body/${d.uuid}/220`, alt: '' })),
        el('div', { class: 'heroinfo' },
          el('div', { class: 'heroname' }, el('h2', {}, d.username), W.rankBadge(d.rankBadge, d.supportRank || d.rank)),
          el('div', { class: 'herometa' }, status,
            d.guild ? el('a', { class: 'guildchip', href: '#guilds/lookup?g=' + encodeURIComponent(d.guild.name) },
              el('span', { class: 'stars' }, W.rankStars(d.guild.rank)), `${W.cap(String(d.guild.rank || '').toLowerCase())} of ${d.guild.name} [${d.guild.prefix}]`) : null,
            d.firstJoin ? el('span', {}, 'Joined ' + new Date(d.firstJoin).toLocaleDateString()) : null,
            W.cardButton(() => {
              const STORE = { vip: ['VIP', '#87b85b'], vipplus: ['VIP+', '#6f8fb8'], hero: ['HERO', '#9c7cc4'], heroplus: ['HERO+', '#d16fa6'], champion: ['CHAMPION', '#c9a75e'] }, sr = STORE[d.supportRank];
              return { accent: sr ? sr[1] : '#ffd65a', title: d.username, art: `https://mc-heads.net/body/${d.uuid}/300`,
                subtitle: [sr ? sr[0] : null, d.guild ? `${W.cap(String(d.guild.rank || '').toLowerCase())} of ${d.guild.name}` : null].filter(Boolean).join(' · ') || 'Wynncraft player',
                tiles: [['Playtime', d.playtime != null ? W.num(d.playtime, 0) + ' h' : '—'], ['Total level', gd.totalLevel != null ? gd.totalLevel.toLocaleString() : '—'], ['Quests', gd.completedQuests ?? '—'],
                  ['Raids', gd.raids ? gd.raids.total : '—'], ['Dungeons', gd.dungeons ? gd.dungeons.total : '—'], ['Wars', gd.wars ?? '—']],
                lines: chars.slice(0, 3).map(c => [c.nickname || cls(c), `${c.nickname ? cls(c) + ' · ' : ''}Lv. ${c.level ?? '?'}`]) };
            }, d.username + '-wynnia')),
          el('div', { class: 'herotiles four' },
            tile('Playtime', d.playtime != null ? W.num(d.playtime, 0) + ' h' : null),
            tile('Total level', gd.totalLevel != null ? gd.totalLevel.toLocaleString() : null),
            tile('Quests', gd.completedQuests),
            tile('Mobs killed', gd.mobsKilled != null ? W.short(gd.mobsKilled) : null),
            tile('Dungeons', gd.dungeons && gd.dungeons.total),
            tile('Raids', gd.raids && gd.raids.total),
            tile('Wars', gd.wars),
            tile('Chests', gd.chestsFound != null ? W.short(gd.chestsFound) : null))));
      const cards = chars.map(c => {
        const quests = c.quests || [], art = W.CLASS_ART[String(c.reskin || c.type || '').toLowerCase()] || 'warrior';
        return el('button', { class: 'charcard' + (P.char === c.id ? ' sel' : ''), title: 'Show everything about this character', onclick: () => {
            P.char = P.char === c.id ? null : c.id;
            history.replaceState(null, '', `#players/lookup?u=${encodeURIComponent(d.username)}${P.char ? '&c=' + P.char : ''}`);
            draw();
            if (P.char) setTimeout(() => { const x = document.getElementById('chardetail'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
          } },
          el('div', { class: 'charart' }, W.art.wiki(art)),
          el('div', { class: 'charinfo' },
            el('div', { class: 'charname' }, c.nickname || cls(c)),
            el('small', {}, [c.nickname ? cls(c) : null, ...(c.gamemode || []).map(W.cap)].filter(Boolean).join(' · ') || (c.reskin ? W.cap(String(c.type).toLowerCase()) + ' reskin' : '')),
            el('div', { class: 'charlvl' }, el('b', {}, 'Lv. ' + (c.level ?? '?')), c.xpPercent != null ? el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: c.xpPercent + '%', '--c': 'var(--gold)' } })) : null),
            el('div', { class: 'charmounts' }, REQS.map(([k, lvl, quest]) => {
              const okL = (c.level || 0) >= lvl, okQ = quests.includes(quest) || (k === 'horse' && anyStable), ok = okL && okQ;
              const why = ok ? `Can ride a ${W.TYPES[k].name}` : `${W.TYPES[k].name}: ` + [!okL && `needs combat level ${lvl}`, !okQ && `needs the quest ${quest}`].filter(Boolean).join(' and ');
              return W.tip(el('span', { class: 'mnt' + (ok ? '' : ' locked') }, W.art.mount(k, W.COLORS[k].body[0][0], W.COLORS[k].second[0][0])), why);
            }))));
      });
      return el('div', { class: 'stack' }, hero, W.badges(d),
        W.win(`Characters (${chars.length})`, el('div', { class: 'chargrid' }, cards),
          el('p', { class: 'hint' }, 'Click a character for its full breakdown. The mount icons show which mounts it can ride; hover them for what is missing.')),
        P.char && chars.find(c => c.id === P.char) ? W.charDetail(chars.find(c => c.id === P.char), d, REF) : null);
    }
    const cls = (c) => { const t = String(c.reskin || c.type || ''); return t.charAt(0) + t.slice(1).toLowerCase(); };

    function showcase() {
      const ta = el('textarea', { rows: 4, placeholder: 'Paste Wynntils item strings here (one per mount)…' }, '');
      ta.value = P.text;
      const results = parseMounts(P.text);
      const good = results.filter(r => r.ok);
      const link = () => {
        const u = new URL(location.href.split('#')[0]);
        u.hash = 'players/lookup?' + new URLSearchParams({ ...(P.data ? { u: P.data.username } : P.name ? { u: P.name } : {}), d: b64.enc({ t: P.text }) });
        return u.toString();
      };
      const out = el('input', { type: 'text', readonly: true, value: '', placeholder: 'Press “Make link”' });
      return W.win('Mount Showcase',
        ta,
        el('div', { class: 'btns' },
          el('button', { onclick: () => { P.text = ta.value; draw(); } }, 'Show mounts'),
          el('button', { onclick: (e) => { P.text = ta.value; W.copyShort(link(), e.target, out); } }, 'Make link'),
          el('button', { class: 'danger', onclick: () => { P.text = ''; draw(); } }, 'Clear')),
        out,
        results.some(r => !r.ok) && el('div', { class: 'warn' }, results.filter(r => !r.ok).map(r => r.error).join(' ')),
        good.length ? el('div', { class: 'mcards' }, good.map(r => card(r.mount, r.estimated))) : el('p', { class: 'hint' }, 'Copy a mount with the Wynntils share option in-game and paste it above. The link bundles the pasted strings, so anyone can open the same showcase.'));
    }

    function card(m, est) {
      const r = W.rank(W.potential(m)), top = Math.max(...W.STATKEYS.map(k => m.s[k][2]));
      return el('div', { class: 'mcard' },
        el('div', { class: 'mhead' }, W.mountSlot(m, { big: true }),
          el('div', {}, el('h3', {}, m.name), el('small', {}, `${W.TYPES[m.type].name} · ${m.c1} / ${m.c2}`),
            el('div', { style: { color: r.color, fontWeight: 700 } }, `Potential ${W.potential(m)} · ${r.name}`),
            el('small', {}, `Average limit ${W.num(W.avgLim(m), 1)}${est ? ' · max estimated' : ''}`))),
        el('div', { class: 'cstats' }, W.STATS.map(s => el('div', { class: 'crow', style: { '--c': s.color } },
          el('span', { class: 'sname' }, W.art.stat(s.k), W.statName(s, m.type)),
          el('div', { class: 'bar' }, el('i', { class: 'blim', style: { width: m.s[s.k][1] / top * 100 + '%' } }), el('i', { class: 'bcur', style: { width: m.s[s.k][0] / top * 100 + '%' } })),
          el('b', {}, `${m.s[s.k][0]} / ${m.s[s.k][1]}`)))),
        el('div', { class: 'btns' }, el('button', { onclick: () => { const c = JSON.parse(JSON.stringify(m)); c.id = 'm' + Math.random().toString(36).slice(2, 9); W.state.mounts.push(c); W.save(); W.go('stable'); } }, 'Add to my stable')));
    }
    draw();
  };
})(window.W);
