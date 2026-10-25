/* Guilds: live lookup through the Wynncraft API, and a territory snapshot. */
(function (W) {
  const { el } = W;
  const RANKS = W.GUILD_RANKS;
  const GL = { name: '', data: null, err: null, busy: false, filter: '', onlineOnly: false };

  W.pages['guilds/lookup'] = function (root, q) {
    if (q && q.get('g') && (!GL.data || GL.data.name !== q.get('g')) && !GL.busy) { GL.name = q.get('g'); setTimeout(go, 0); }
    const draw = () => root.replaceChildren(el('div', { class: 'stack' }, form(), info(), members()));
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
      } catch (e) { GL.err = e.message; GL.data = null; }
      GL.busy = false; draw();
    }
    function form() {
      const inp = el('input', { type: 'text', value: GL.name, placeholder: 'Guild name or tag', maxlength: 40, oninput: (e) => { GL.name = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') go(); } });
      return W.win('Guild lookup', el('div', { class: 'search' }, inp, el('button', { onclick: go }, 'Look up')),
        el('p', { class: 'hint' }, 'Type the full guild name, or its tag (for example ', el('b', {}, 'WYGL'), ').'));
    }
    function info() {
      if (GL.busy) return W.win('Guild', el('p', { class: 'empty' }, 'Asking the Wynncraft API…'));
      if (GL.err) return W.win('Guild', el('div', { class: 'warn' }, GL.err));
      const d = GL.data; if (!d) return null;
      const all = RANKS.flatMap(r => Object.values(d.members && d.members[r] || {}));
      const seasons = d.seasonRanks ? Object.entries(d.seasonRanks).sort((a, b) => +b[0] - +a[0]) : [];
      const tile = (label, value) => el('div', {}, el('b', {}, value == null ? '—' : value), el('span', {}, label));
      return el('section', { class: 'herocard guild' },
        el('div', { class: 'herobanner' }, W.banner(d.banner)),
        el('div', { class: 'heroinfo' },
          el('div', { class: 'heroname' }, el('h2', {}, d.name), el('span', { class: 'tag' }, d.prefix)),
          el('div', { class: 'herometa' },
            el('span', { class: 'online' }, `${d.online ?? all.filter(m => m.online).length} online`),
            d.created ? el('span', {}, 'Founded ' + new Date(d.created).toLocaleDateString()) : null,
            d.banner && d.banner.tier ? el('span', {}, `Banner tier ${d.banner.tier}`) : null),
          el('div', { class: 'glevel' }, el('b', {}, 'Level ' + (d.level ?? '?')),
            el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: (d.xpPercent || 0) + '%', '--c': 'var(--gold)' } })), el('span', {}, (d.xpPercent ?? 0) + '%')),
          el('div', { class: 'herotiles' },
            tile('Members', d.members ? d.members.total ?? all.length : null),
            tile('Territories', d.territories),
            tile('Wars', d.wars != null ? d.wars.toLocaleString() : null),
            tile('Total XP given', W.short(all.reduce((a, m) => a + (m.contributed || 0), 0))),
            seasons[0] ? tile(`Season ${seasons[0][0]} rating`, seasons[0][1].rating != null ? seasons[0][1].rating.toLocaleString() : null) : null)));
    }
    function members() {
      const d = GL.data; if (!d || !d.members || GL.busy) return null;
      const build = () => { const f = GL.filter.toLowerCase(); return RANKS.map(r => {
        const list = Object.entries(d.members[r] || {}).map(([name, m]) => ({ name: m.username || name, ...m }))
          .filter(m => (!f || m.name.toLowerCase().includes(f)) && (!GL.onlineOnly || m.online))
          .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || (b.contributed || 0) - (a.contributed || 0));
        if (!list.length) return null;
        return el('div', { class: 'ranksec' },
          el('div', { class: 'rankhead' }, el('span', { class: 'stars' }, W.rankStars(r) || '·'), W.cap(r) + (r === 'owner' ? '' : 's'), el('small', {}, list.length)),
          el('div', { class: 'memgrid' }, list.map(m => el('a', { class: 'member' + (m.online ? ' on' : ''), href: '#players/lookup?u=' + encodeURIComponent(m.name) },
            m.uuid ? W.head(m.uuid, 56) : el('span', { class: 'head' }),
            el('div', { class: 'minfo' },
              el('b', {}, m.name),
              W.tip(el('small', {}, W.short(m.contributed || 0) + ' XP given'), (m.contributed || 0).toLocaleString() + ' XP'),
              el('small', {}, m.joined ? 'Joined ' + W.ago(m.joined) : '')),
            el('span', { class: 'pill ' + (m.online ? 'yes' : 'no') }, m.online ? (m.server || 'Online') : 'Offline')))));
      }).filter(Boolean); };
      return W.win('Members',
        el('div', { class: 'memtools' },
          el('input', { type: 'text', placeholder: 'Find a member', value: GL.filter, oninput: (e) => { GL.filter = e.target.value; const m = root.querySelector('.memwrap'); if (m) m.replaceWith(wrap()); } }),
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
