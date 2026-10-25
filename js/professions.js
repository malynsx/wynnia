/* Professions: XP to target level, and which materials you can gather. */
(function (W) {
  const { el } = W;
  const PROFS = ['woodcutting', 'mining', 'fishing', 'farming', 'alchemism', 'armouring', 'cooking', 'jeweling', 'scribing', 'tailoring', 'weaponsmithing', 'woodworking'];
  const GATHER = ['woodcutting', 'mining', 'fishing', 'farming'];
  const st = { prof: 'woodcutting', cur: 1, pct: 0, target: 10, per: 0, secs: 4, gLevel: 1 };

  const profPicker = (list, val, on) => el('div', { class: 'profpick' }, list.map(p =>
    el('button', { class: 'prof' + (p === val ? ' on' : ''), title: W.cap(p), onclick: () => on(p) }, W.art.wiki(p), el('span', {}, W.cap(p)))));

  W.pages['professions/xp'] = function (root) {
    W.withData(root, ['profxp'], (xp) => {
      const maxLvl = xp.length + 1;
      const toNext = (l) => xp[l - 1] || 0;
      const cum = (l) => xp.slice(0, l - 1).reduce((a, b) => a + b, 0);   // total XP to reach level l from level 1
      const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, calc()), el('div', {}, chart())));

      function calc() {
        st.cur = Math.min(Math.max(1, st.cur), maxLvl); st.target = Math.min(Math.max(st.cur + 1, st.target), maxLvl);
        const need = Math.max(0, cum(st.target) - cum(st.cur) - Math.round(toNext(st.cur) * st.pct / 100));
        const actions = st.per > 0 ? Math.ceil(need / st.per) : null;
        return W.win('XP calculator',
          profPicker(PROFS, st.prof, (p) => { st.prof = p; draw(); }),
          el('div', { class: 'form row' },
            el('label', {}, 'Current level', W.numIn(st.cur, (v) => { st.cur = v; draw(); }, 1, maxLvl)),
            el('label', {}, 'Progress into it (%)', W.numIn(st.pct, (v) => { st.pct = Math.min(99.99, Math.max(0, v)); draw(); }, 0, 99.99, 0.01)),
            el('label', {}, 'Target level', W.numIn(st.target, (v) => { st.target = v; draw(); }, 2, maxLvl))),
          el('div', { class: 'form row' },
            el('label', {}, `XP per ${GATHER.includes(st.prof) ? 'gather' : 'craft'} (optional)`, W.numIn(st.per || '', (v) => { st.per = Math.max(0, v); draw(); }, 0, 1e9)),
            el('label', {}, 'Seconds each', W.numIn(st.secs, (v) => { st.secs = Math.max(0, v); draw(); }, 0, 3600, 0.5))),
          el('div', { class: 'kv wide', style: { marginTop: '16px' } },
            el('div', {}, el('span', {}, 'XP needed'), el('b', {}, need.toLocaleString())),
            el('div', {}, el('span', {}, `XP for level ${st.cur} → ${st.cur + 1}`), el('b', {}, toNext(st.cur).toLocaleString())),
            el('div', {}, el('span', {}, GATHER.includes(st.prof) ? 'Gathers' : 'Crafts'), el('b', {}, actions != null ? actions.toLocaleString() : '—')),
            el('div', {}, el('span', {}, 'Time'), el('b', {}, actions != null && st.secs ? W.fmtDur(actions * st.secs / 60) : '—'))),
          el('p', { class: 'hint' }, `All professions share this XP chart (from the wiki, levels 1–${maxLvl}). Enter the XP one action gives you to count how many you still need.`));
      }

      function chart() {
        const NS = 'http://www.w3.org/2000/svg', w = 520, h = 240, svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${w} ${h + 30}`); svg.setAttribute('class', 'hist');
        const add = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; svg.append(n); return n; };
        const ys = xp.map(v => Math.log10(v)), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const X = (l) => 40 + (l - 1) / (xp.length - 1) * (w - 50), Y = (v) => h - (Math.log10(v) - y0) / (y1 - y0) * (h - 20);
        [100, 1e4, 1e6, 1e8].forEach(v => { if (Math.log10(v) >= y0 && Math.log10(v) <= y1) { add('line', { x1: 40, x2: w - 10, y1: Y(v), y2: Y(v), class: 'r-grid' }); add('text', { x: 4, y: Y(v) + 4, class: 'h-ax' }, v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : v); } });
        add('rect', { x: X(st.cur), y: 0, width: Math.max(2, X(st.target) - X(st.cur)), height: h, fill: 'rgba(247,210,94,.18)' });
        add('polyline', { points: xp.map((v, i) => X(i + 1) + ',' + Y(v)).join(' '), class: 'l-line' });
        add('text', { x: 40, y: h + 20, class: 'h-ax' }, 'Lv 1'); add('text', { x: w - 10, y: h + 20, class: 'h-ax', 'text-anchor': 'end' }, 'Lv ' + xp.length);
        const rows = [];
        for (let l = st.cur; l < st.target && rows.length < 12; l++) rows.push(el('tr', {}, el('td', {}, `${l} → ${l + 1}`), el('td', {}, toNext(l).toLocaleString())));
        return W.win('XP per level', svg, el('p', { class: 'hint', style: { marginTop: 0 } }, 'Log scale. Your range is shaded.'),
          el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'Level'), el('th', {}, 'XP'))), el('tbody', {}, rows)),
          st.target - st.cur > 12 ? el('p', { class: 'hint' }, `…and ${st.target - st.cur - 12} more levels.`) : null);
      }
      draw();
    });
  };

  W.pages['professions/gathering'] = function (root) {
    W.withData(root, ['materials'], (mats) => {
      const draw = () => {
        if (!GATHER.includes(st.prof)) st.prof = 'woodcutting';
        const list = mats.filter(m => m.p === st.prof).sort((a, b) => a.l - b.l);
        const next = list.find(m => m.l > st.gLevel);
        root.replaceChildren(W.win('What can I gather?',
          profPicker(GATHER, st.prof, (p) => { st.prof = p; draw(); }),
          el('div', { class: 'form row' }, el('label', {}, `Your ${W.cap(st.prof)} level`, W.numIn(st.gLevel, (v) => { st.gLevel = Math.max(1, v); draw(); }, 1, 132))),
          next ? el('p', { class: 'hint' }, `Next unlock: ${next.n} at level ${next.l} (${next.l - st.gLevel} level${next.l - st.gLevel > 1 ? 's' : ''} to go).`) : el('p', { class: 'hint' }, 'You can gather everything for this profession.'),
          el('div', { class: 'matgrid' }, list.map(m => el('div', { class: 'mat' + (m.l <= st.gLevel ? '' : ' locked') },
            W.slot(m.ic ? W.art.item(m.ic) : W.art.wiki(st.prof)), el('div', {}, el('b', {}, m.n), el('small', {}, 'Level ' + m.l))))),
          el('p', { class: 'hint' }, 'Materials you can’t gather yet are faded. Higher-level materials give more XP and are worth switching to as soon as you can.')));
      };
      draw();
    });
  };
})(window.W);
