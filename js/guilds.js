/* Guilds: live lookup through the Wynncraft API, and a territory snapshot. */
(function (W) {
  const { el } = W;
  const RANKS = ['owner', 'chief', 'strategist', 'captain', 'recruiter', 'recruit'];
  const GL = { name: '', data: null, err: null, busy: false };

  W.pages['guilds/lookup'] = function (root, q) {
    if (q && q.get('g') && !GL.data && !GL.busy) { GL.name = q.get('g'); setTimeout(go, 0); }
    const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, form(), members()), el('div', {}, info())));
    async function go() {
      if (!GL.name) return;
      GL.busy = true; GL.err = null; draw();
      try {
        const byPrefix = GL.name.length <= 4 && GL.name === GL.name.toUpperCase();
        let d = await W.api(byPrefix ? `guild/prefix/${encodeURIComponent(GL.name)}` : `guild/${encodeURIComponent(GL.name)}`);
        if (d.multiple) throw new Error('That name matches several guilds. Use the full name.');
        GL.data = d;
      } catch (e) { GL.err = e.message; GL.data = null; }
      GL.busy = false; draw();
    }
    function form() {
      const inp = el('input', { type: 'text', value: GL.name, placeholder: 'Guild name or TAG', maxlength: 40, oninput: (e) => { GL.name = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') go(); } });
      return W.win('Guild lookup', el('div', { class: 'search' }, inp, el('button', { onclick: go }, 'Look up')),
        el('p', { class: 'hint' }, 'Type the full guild name, or its tag in capitals (for example ', el('b', {}, 'WYGL'), ').'));
    }
    function info() {
      if (GL.busy) return W.win('Guild', el('p', { class: 'empty' }, 'Asking the Wynncraft API…'));
      if (GL.err) return W.win('Guild', el('div', { class: 'warn' }, GL.err));
      const d = GL.data; if (!d) return W.win('Guild', el('p', { class: 'empty' }, 'Look up a guild to see its members and stats.'));
      const all = RANKS.flatMap(r => Object.values(d.members && d.members[r] || {}));
      return W.win(`${d.name} [${d.prefix}]`,
        el('div', { class: 'kv' },
          el('div', {}, el('span', {}, 'Level'), el('b', {}, `${d.level ?? '—'}${d.xpPercent != null ? ` (${d.xpPercent}%)` : ''}`)),
          el('div', {}, el('span', {}, 'Members'), el('b', {}, d.members ? d.members.total ?? all.length : '—')),
          el('div', {}, el('span', {}, 'Online now'), el('b', {}, d.online ?? all.filter(m => m.online).length)),
          el('div', {}, el('span', {}, 'Territories'), el('b', {}, d.territories ?? '—')),
          el('div', {}, el('span', {}, 'Wars'), el('b', {}, d.wars ?? '—')),
          el('div', {}, el('span', {}, 'Founded'), el('b', {}, d.created ? new Date(d.created).toLocaleDateString() : '—'))));
    }
    function members() {
      const d = GL.data; if (!d || !d.members) return null;
      const rows = RANKS.flatMap(r => Object.entries(d.members[r] || {}).map(([name, m]) => ({ rank: r, name: m.username || name, ...m })));
      rows.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) || (b.contributed || 0) - (a.contributed || 0));
      return W.win('Members', el('div', { class: 'tscroll' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['Player', 'Rank', 'Contributed XP', 'Status'].map(h => el('th', {}, h)))),
        el('tbody', {}, rows.map(m => el('tr', {},
          el('td', {}, el('a', { href: '#players/lookup?u=' + encodeURIComponent(m.name) }, m.name)),
          el('td', {}, W.cap(m.rank)), el('td', {}, m.contributed != null ? Number(m.contributed).toLocaleString() : '—'),
          el('td', {}, el('span', { class: 'pill ' + (m.online ? 'yes' : 'no') }, m.online ? (m.server || 'Online') : 'Offline'))))))));
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
