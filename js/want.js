/* "Wanted" poster: describe the mount you are after, get a chat-ready line and a shareable link. */
(function (W) {
  const { el } = W;
  const SHORT = { speed: 'Spd', accel: 'Acc', jump: 'Jmp', energy: 'Nrg', handling: 'Hdl', toughness: 'Tgh', boost: 'Bst', training: 'Trn' };
  const LIMIT = 250;     // Minecraft chat caps messages near 256 characters
  const N = { type: 'any', pot: 0, mins: W.STATKEYS.map(() => 0), c1: '', c2: '', ign: '', note: '' };

  function fromQuery(q) {
    if (!q || ![...q.keys()].length) return;
    if (q.get('t')) N.type = q.get('t');
    N.pot = +q.get('p') || 0;
    if (q.get('s')) N.mins = q.get('s').split(',').map(x => +x || 0).concat(Array(8).fill(0)).slice(0, 8);
    N.c1 = q.get('c1') || ''; N.c2 = q.get('c2') || '';
    N.ign = q.get('i') || ''; N.note = q.get('n') || '';
  }
  function link() {
    const q = new URLSearchParams();
    if (N.type !== 'any') q.set('t', N.type);
    if (N.pot) q.set('p', N.pot);
    if (N.mins.some(Boolean)) q.set('s', N.mins.join(','));
    if (N.c1) q.set('c1', N.c1);
    if (N.c2) q.set('c2', N.c2);
    if (N.ign) q.set('i', N.ign);
    if (N.note) q.set('n', N.note);
    return location.href.split('#')[0] + '#mounts/want?' + q.toString();
  }
  function chatLines() {
    const type = N.type === 'any' ? 'mount' : W.TYPES[N.type].name;
    const wantsAlt = N.type === 'wyvern';
    const head = `LF ${type}${N.pot ? ` ${N.pot}+ pot` : ''}`;
    const stats = W.STATKEYS.map((k, i) => N.mins[i] ? `${wantsAlt && k === 'jump' ? 'Alt' : SHORT[k]} ${N.mins[i]}+` : '').filter(Boolean).join(' ');
    const col = (N.c1 || N.c2) ? [N.c1 || 'any', N.c2 || 'any'].join('/') : '';
    const parts = [head, stats, col, N.note, N.ign && `IGN ${N.ign}`].filter(Boolean);
    const lines = []; let cur = '';
    for (const p of parts) {
      const next = cur ? cur + ' | ' + p : p;
      if (next.length > LIMIT && cur) { lines.push(cur); cur = p; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  const copy = (text, btn) => {
    try { navigator.clipboard.writeText(text); } catch (e) { /* manual copy */ }
    if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1200); }
  };

  W.pages.want = function (root, q) {
    fromQuery(q);
    let src = '';
    const draw = (full = true) => {
      if (full) root.replaceChildren(el('div', { class: 'cols' }, form(), el('div', {}, poster(), output())));
      else { root.querySelector('.poster-wrap').replaceWith(poster()); root.querySelector('.out-wrap').replaceWith(output()); }
    };
    const upd = (fn) => (v) => { fn(v); draw(false); };

    function form() {
      const types = [['any', 'Any mount'], ...Object.entries(W.TYPES).map(([k, t]) => [k, t.name])];
      const C = N.type !== 'any' ? W.COLORS[N.type] : null;
      const colorSel = (key, list) => W.sel([['', 'Any'], ...list.map(c => [c[0], c[0]])], N[key], (v) => { N[key] = v; draw(false); });
      return W.win('What are you after?',
        el('div', { class: 'form' },
          el('label', {}, 'Copy targets from one of your mounts',
            W.sel([['', '— choose —'], ...W.state.mounts.map(m => [m.id, `${m.name} (${W.potential(m)})`])], src, (v) => {
              src = v; const m = W.mountById(v); if (!m) return;
              N.type = m.type; N.pot = W.potential(m); N.mins = W.STATKEYS.map(k => m.s[k][2]); draw();
            })),
          el('label', {}, 'Mount type', W.sel(types, N.type, (v) => { N.type = v; N.c1 = N.c2 = ''; draw(); })),
          el('label', {}, 'Minimum Potential', W.numIn(N.pot || '', upd(v => { N.pot = Math.max(0, v); }), 0, 5000)),
          C && el('div', { class: 'two' }, el('label', {}, C.labels[0], colorSel('c1', C.body)), el('label', {}, C.labels[1], colorSel('c2', C.second)))),
        el('div', { class: 'cap left' }, 'Minimum max per stat (leave blank for don’t care)'),
        el('div', { class: 'wstats' }, W.STATS.map((s, i) => el('label', { class: 'wst' }, el('span', { class: 'sname' }, W.art.stat(s.k), W.statName(s, N.type === 'wyvern' ? 'wyvern' : 'horse')),
          W.numIn(N.mins[i] || '', upd(v => { N.mins[i] = Math.max(0, v); }), 0, 5000)))),
        el('div', { class: 'form', style: { marginTop: '16px' } },
          el('label', {}, 'Your in-game name', el('input', { type: 'text', value: N.ign, maxlength: 16, oninput: (e) => { N.ign = e.target.value.trim(); draw(false); } })),
          el('label', {}, 'Note (price, deadline…)', el('input', { type: 'text', value: N.note, maxlength: 80, placeholder: 'e.g. paying 20 EB', oninput: (e) => { N.note = e.target.value.trim(); draw(false); } }))));
    }

    function poster() {
      const t = N.type === 'any' ? 'horse' : N.type, C = W.COLORS[t];
      const m = W.newMount(t, { c1: N.c1 || C.body[0][0], c2: N.c2 || C.second[0][0] });
      const rk = W.rank(N.pot || 0), rows = W.STATS.map((s, i) => N.mins[i] ? [s, N.mins[i]] : null).filter(Boolean);
      return el('div', { class: 'poster-wrap' }, el('div', { class: 'poster' },
        el('div', { class: 'ptag' }, 'Wanted'),
        el('div', { class: 'phero' }, W.slot(W.art.mount(t, m.c1, m.c2), { big: true }),
          el('div', {}, el('h3', {}, N.type === 'any' ? 'Any mount' : W.TYPES[N.type].name),
            el('small', {}, (N.c1 || N.c2) ? `${N.c1 || 'Any'} / ${N.c2 || 'Any'}` : 'Any colours'),
            N.pot ? el('div', { class: 'ppot' }, `${N.pot}+ Potential`) : el('div', { class: 'ppot' }, 'Any Potential'))),
        rows.length ? el('div', { class: 'pstats' }, rows.map(([s, v]) => el('div', { class: 'crow', style: { '--c': s.color } }, el('span', { class: 'sname' }, W.art.stat(s.k), W.statName(s, N.type)), el('b', {}, v + '+')))) : el('p', { class: 'hint' }, 'No stat minimums set.'),
        N.note && el('div', { class: 'pnote' }, N.note),
        N.ign && el('div', { class: 'pign' }, 'Contact: ', el('b', {}, N.ign))));
    }

    function output() {
      const lines = chatLines();
      return el('div', { class: 'out-wrap' }, W.win('Send it',
        el('div', { class: 'cap left', style: { marginTop: 0 } }, lines.length > 1 ? `Chat messages (${lines.length}, each under ${LIMIT} characters)` : 'Chat message'),
        ...lines.map(l => { const row = el('div', { class: 'chatline' }, el('code', {}, l), el('button', { class: 'mini', onclick: () => copy(l, row.lastChild) }, 'Copy')); return row; }),
        el('div', { class: 'cap left' }, 'Shareable page'),
        el('div', { class: 'chatline' }, el('code', {}, link()), el('button', { class: 'mini', onclick: (e) => copy(link(), e.target) }, 'Copy')),
        el('p', { class: 'hint' }, 'Paste the chat message in guild chat. The link opens this same poster with every number filled in, handy for Discord.')));
    }
    draw();
  };
})(window.W);
