/* Players: compare two players, and a quest checklist per character. Uses the live Wynncraft API. */
(function (W) {
  const { el } = W;
  /* The API names some quests differently from the wiki ("Realm of Light II - Taproot" vs "Taproot"). */
  const qkey = (n) => String(n).toLowerCase().replace(/^realm of light [ivx]+ - /, '').replace(/[^a-z0-9]/g, '');
  const g = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const cls = (c) => { const t = String(c.reskin || c.type || ''); return t.charAt(0) + t.slice(1).toLowerCase(); };
  const avatar = (uuid, size = 64) => el('img', { class: 'avatar', src: `https://mc-heads.net/avatar/${uuid}/${size}`, alt: '', width: size, height: size });

  W.pages['players/lookup'] = (root, q) => W.pages.player(root, q);

  const CMP = { a: '', b: '', da: null, db: null, err: null, busy: false };
  W.pages['players/compare'] = function (root) {
    const ROWS = [
      ['Playtime (hours)', 'playtime'], ['Total level', 'globalData.totalLevel'], ['Completed quests', 'globalData.completedQuests'],
      ['Mobs killed', 'globalData.killedMobs'], ['Chests found', 'globalData.chestsFound'], ['Wars', 'globalData.wars'],
      ['Dungeons', 'globalData.dungeons.total'], ['Raids', 'globalData.raids.total'], ['PvP kills', 'globalData.pvp.kills'],
    ];
    const draw = () => root.replaceChildren(el('div', {}, form(), result()));
    async function go() {
      CMP.busy = true; CMP.err = null; draw();
      try {
        const [a, b] = await Promise.all([W.api(`player/${encodeURIComponent(CMP.a)}?fullResult`), W.api(`player/${encodeURIComponent(CMP.b)}?fullResult`)]);
        if (a.multiple || b.multiple) throw new Error('One of the names matches several players. Use the exact name.');
        CMP.da = a; CMP.db = b;
      } catch (e) { CMP.err = e.message; CMP.da = CMP.db = null; }
      CMP.busy = false; draw();
    }
    function form() {
      const inp = (k) => el('input', { type: 'text', value: CMP[k], placeholder: 'Username', maxlength: 16, oninput: (e) => { CMP[k] = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') go(); } });
      return W.win('Compare two players', el('div', { class: 'search' }, inp('a'), el('span', { class: 'vs' }, 'vs'), inp('b'), el('button', { onclick: go }, 'Compare')));
    }
    function result() {
      if (CMP.busy) return W.win('Result', el('p', { class: 'empty' }, 'Asking the Wynncraft API…'));
      if (CMP.err) return W.win('Result', el('div', { class: 'warn' }, CMP.err));
      if (!CMP.da) return null;
      const A = CMP.da, B = CMP.db;
      const best = (c) => Object.values(c.characters || {}).reduce((m, x) => Math.max(m, x.level || 0), 0);
      const row = (label, va, vb) => {
        const na = +va || 0, nb = +vb || 0;
        return el('tr', {}, el('td', { class: na > nb ? 'top' : '' }, va == null ? '—' : Number(va).toLocaleString()),
          el('td', { class: 'mid' }, label), el('td', { class: nb > na ? 'top' : '' }, vb == null ? '—' : Number(vb).toLocaleString()));
      };
      return W.win('Head to head',
        el('div', { class: 'vshead' },
          el('div', {}, avatar(A.uuid, 80), el('h3', {}, A.username), el('small', {}, A.online ? 'Online · ' + A.server : 'Offline')),
          el('div', {}, avatar(B.uuid, 80), el('h3', {}, B.username), el('small', {}, B.online ? 'Online · ' + B.server : 'Offline'))),
        el('table', { class: 'tbl vstable' }, el('tbody', {},
          ROWS.map(([label, path]) => row(label, g(A, path), g(B, path))),
          row('Characters', Object.keys(A.characters || {}).length, Object.keys(B.characters || {}).length),
          row('Highest character level', best(A), best(B)))),
        el('p', { class: 'hint' }, 'The larger number in each row is outlined. Some stats are hidden if a player has made them private.'));
    }
    draw();
  };

  const QS = { name: '', data: null, err: null, busy: false, char: '', missingOnly: true, fit: false, province: '' };
  W.pages['players/quests'] = function (root, q) {
    const want = q && q.get('c');
    if (q && q.get('u') && (!QS.data || QS.data.username !== q.get('u'))) QS.name = q.get('u');
    W.withData(root, ['quests'], (quests) => {
      const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, form(), list()), el('div', {}, summary())));
      async function go() {
        QS.busy = true; QS.err = null; draw();
        try {
          const d = await W.api(`player/${encodeURIComponent(QS.name)}?fullResult`);
          if (d.multiple) throw new Error('That name matches several players. Use the exact name.');
          QS.data = d;
          const chars = Object.entries(d.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0));
          QS.char = want && d.characters[want] ? want : (chars.length ? chars[0][0] : '');
        } catch (e) { QS.err = e.message; QS.data = null; }
        QS.busy = false; draw();
      }
      const char = () => QS.data && QS.data.characters && QS.data.characters[QS.char];
      function form() {
        const inp = el('input', { type: 'text', value: QS.name, placeholder: 'Username', maxlength: 16, oninput: (e) => { QS.name = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') go(); } });
        const chars = QS.data ? Object.entries(QS.data.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0)) : [];
        const provinces = [...new Set(quests.map(x => x.p).filter(Boolean))].sort();
        return W.win('Quest checklist',
          el('div', { class: 'search' }, inp, el('button', { onclick: go }, 'Load')),
          QS.busy ? el('p', { class: 'empty' }, 'Asking the Wynncraft API…') : null,
          QS.err ? el('div', { class: 'warn', style: { marginTop: '12px' } }, QS.err) : null,
          chars.length ? el('div', { class: 'form row', style: { marginTop: '14px' } },
            el('label', {}, 'Character', W.sel(chars.map(([id, c]) => [id, `${c.nickname || cls(c)} · Lv. ${c.level}`]), QS.char, (v) => { QS.char = v; draw(); })),
            el('label', {}, 'Province', W.sel([['', 'All'], ...provinces.map(p => [p, p])], QS.province, (v) => { QS.province = v; draw(); })),
            el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: QS.missingOnly, onchange: (e) => { QS.missingOnly = e.target.checked; draw(); } }), 'Only unfinished'),
            el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: QS.fit, onchange: (e) => { QS.fit = e.target.checked; draw(); } }), 'Only at my level')) : null);
      }
      function list() {
        const c = char(); if (!c) return null;
        const doneKeys = new Set((c.quests || []).map(qkey)), done = { has: (n) => doneKeys.has(qkey(n)) };
        const rows = quests.filter(x => (!QS.missingOnly || !done.has(x.n)) && (!QS.fit || x.l <= (c.level || 0)) && (!QS.province || x.p === QS.province));
        return W.win(`${rows.length} quest${rows.length === 1 ? '' : 's'}`, el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, ['Quest', 'Level', 'Length', 'Province', ''].map(h => el('th', {}, h)))),
          el('tbody', {}, rows.map(x => el('tr', { class: done.has(x.n) ? 'done' : '' },
            el('td', {}, el('a', { href: 'https://wynncraft.wiki.gg/wiki/' + encodeURIComponent(x.n.replace(/ /g, '_')), target: '_blank', rel: 'noopener' }, x.n)),
            el('td', {}, x.l), el('td', {}, x.len || '—'), el('td', {}, x.p || '—'),
            el('td', {}, el('span', { class: 'pill ' + (done.has(x.n) ? 'yes' : 'no') }, done.has(x.n) ? 'Done' : 'To do')))))));
      }
      function summary() {
        const c = char();
        if (!c) return W.win('Progress', el('p', { class: 'empty' }, 'Enter a username to load their characters. Quest data comes from the wiki’s quest list.'));
        const doneKeys = new Set((c.quests || []).map(qkey)), done = { has: (n) => doneKeys.has(qkey(n)) }, total = quests.length, have = quests.filter(x => done.has(x.n)).length;
        const avail = quests.filter(x => !done.has(x.n) && x.l <= (c.level || 0));
        return W.win('Progress',
          el('div', { class: 'phead' }, avatar(QS.data.uuid), el('div', {}, el('h3', {}, QS.data.username), el('small', {}, `${cls(c)} · Level ${c.level}`))),
          el('div', { class: 'cbar' }, el('i', { class: 'good', style: { width: have / total * 100 + '%' } }), el('b', {}, `${have} / ${total} quests`)),
          el('div', { class: 'kv', style: { marginTop: '14px' } },
            el('div', {}, el('span', {}, 'Unfinished at your level'), el('b', {}, avail.length)),
            el('div', {}, el('span', {}, 'Lowest unfinished'), el('b', {}, avail[0] ? `${avail[0].n} (${avail[0].l})` : '—'))),
          el('p', { class: 'hint' }, 'Mini-quests and discoveries are not counted.'));
      }
      draw();
      if (q && q.get('u') && (!QS.data || QS.data.username !== q.get('u'))) go();
    });
  };
})(window.W);
