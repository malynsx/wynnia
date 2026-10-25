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
    const draw = () => root.replaceChildren(el('div', { class: 'cols' }, el('div', {}, lookup(), profile()), el('div', {}, showcase())));

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
        el('p', { class: 'hint' }, 'Reads the public Wynncraft API. It lists which mounts each of a player’s characters can use. The API does not publish the mounts themselves, so use the showcase on the right for those.'));
    }

    function profile() {
      if (P.loading) return W.win('Profile', el('p', { class: 'empty' }, 'Asking the Wynncraft API…'));
      if (P.err) return W.win('Profile', el('div', { class: 'warn' }, P.err));
      if (P.choices) return W.win('Several players match', el('div', { class: 'choices' }, Object.entries(P.choices).map(([id, v]) =>
        el('button', { onclick: () => find(P.name, id) }, (v && (v.storedName || v.username)) || id))));
      const d = P.data;
      if (!d) return null;
      const chars = Object.entries(d.characters || {}).map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => (b.level || 0) - (a.level || 0));
      const rows = chars.map(c => {
        const quests = c.quests || [];
        return el('tr', {}, el('td', {}, el('b', {}, c.nickname || cls(c)), el('small', {}, c.nickname ? cls(c) : (c.gamemode && c.gamemode.length ? c.gamemode.join(', ') : ''))),
          el('td', {}, c.level ?? '—'),
          ...REQS.map(([k, lvl, quest]) => {
            const okL = (c.level || 0) >= lvl, okQ = quests.includes(quest), ok = okL && okQ;
            const why = ok ? 'Unlocked' : [!okL && `needs combat level ${lvl}`, !okQ && `needs quest “${quest}”`].filter(Boolean).join(', ');
            return el('td', {}, W.tip(el('span', { class: 'pill ' + (ok ? 'yes' : 'no') }, ok ? 'Yes' : 'No'), why));
          }));
      });
      const best = chars.reduce((a, c) => Math.max(a, c.level || 0), 0);
      return W.win('Profile',
        el('div', { class: 'phead' },
          el('img', { class: 'avatar', src: `https://mc-heads.net/avatar/${d.uuid}/64`, alt: '', width: 64, height: 64 }),
          el('div', {}, el('h3', {}, d.username), el('small', {}, [d.supportRank && d.supportRank.toUpperCase(), d.online ? `Online · ${d.server}` : 'Offline'].filter(Boolean).join(' · ')))),
        el('div', { class: 'kv' },
          kv('Playtime', d.playtime != null ? W.num(d.playtime, 0) + ' h' : '—'),
          kv('Guild', d.guild ? `${d.guild.name} (${d.guild.rank || ''})` : 'None'),
          kv('First joined', d.firstJoin ? new Date(d.firstJoin).toLocaleDateString() : '—'),
          kv('Highest character', best || '—')),
        el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['Character', 'Level', 'Horse', 'Wyvern', 'Adasaur'].map(h => el('th', {}, h)))), el('tbody', {}, rows)),
        el('p', { class: 'hint' }, 'A mount is usable once the character has the combat level and has finished its quest: Stable Story (9), The Canyon Guides (84), Burning Bonds (115).'));
    }
    const cls = (c) => { const t = String(c.reskin || c.type || ''); return t.charAt(0) + t.slice(1).toLowerCase(); };
    const kv = (k, v) => el('div', {}, el('span', {}, k), el('b', {}, v));

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
          el('button', { onclick: () => { P.text = ta.value; out.value = link(); out.select(); try { navigator.clipboard.writeText(out.value); } catch (e) { /* manual copy */ } } }, 'Make link'),
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
