/* Professions: XP to target level, grinding spots, and which materials you can gather. */
(function (W) {
  const { el } = W;
  const PROFS = ['woodcutting', 'mining', 'fishing', 'farming', 'alchemism', 'armouring', 'cooking', 'jeweling', 'scribing', 'tailoring', 'weaponsmithing', 'woodworking'];
  const GATHER = ['woodcutting', 'mining', 'fishing', 'farming'];
  const st = { prof: 'woodcutting', cur: 1, pct: 0, target: 10, per: 0, secs: 4, gLevel: 1 };

  /* Olinus10's 2026 leveling guides: video id and the timestamp (seconds) of each level bracket. */
  const VIDEOS = {
    woodcutting: ['cEUPXr1n8os', { 1: 6, 10: 15, 20: 26, 30: 42, 40: 51, 50: 60, 60: 71, 70: 82, 80: 93, 90: 102, 100: 112, 105: 121, 110: 131, 115: 141 }],
    farming: ['PayEVNh_m-g', { 1: 6, 10: 17, 20: 24, 30: 32, 40: 40, 50: 49, 60: 58, 70: 67, 80: 78, 90: 88, 100: 97, 105: 108, 110: 120, 115: 135 }],
    mining: ['eMfgSZicuvw', { 1: 6, 10: 16, 20: 24, 30: 35, 40: 46, 50: 57, 60: 65, 70: 75, 80: 85, 90: 103, 100: 126, 105: 135, 110: 144, 115: 155 }],
    fishing: ['UWIQMIYsBGQ', { 1: 5, 10: 15, 20: 25, 30: 36, 40: 46, 50: 56, 60: 67, 70: 78, 80: 91, 90: 99, 100: 125, 105: 136, 110: 148, 115: 157 }],
  };

  const profPicker = (list, val, on) => el('div', { class: 'profpick' }, list.map(p =>
    el('button', { class: 'prof' + (p === val ? ' on' : ''), title: W.cap(p), onclick: () => on(p) }, W.art.wiki(p), el('span', {}, W.cap(p)))));

  W.pages['professions/xp'] = function (root) {
    W.withData(root, ['profxp', 'materials', 'recipes'], (xp, mats, recipes) => {
      const maxLvl = xp.length + 1;
      const toNext = (l) => xp[l - 1] || 0;
      const cum = (l) => xp.slice(0, l - 1).reduce((a, b) => a + b, 0);   // total XP from level 1 to level l
      const have = () => cum(st.cur) + Math.round(toNext(st.cur) * st.pct / 100);
      const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, calc()), el('div', {}, ahead(), chart())));

      function calc() {
        st.cur = Math.min(Math.max(1, st.cur), maxLvl); st.target = Math.min(Math.max(st.cur + 1, st.target), maxLvl);
        const need = Math.max(0, cum(st.target) - have());
        const actions = st.per > 0 ? Math.ceil(need / st.per) : null;
        const verb = GATHER.includes(st.prof) ? 'gather' : 'craft';
        return W.win('XP calculator',
          profPicker(PROFS, st.prof, (p) => { st.prof = p; draw(); }),
          el('div', { class: 'fields3' },
            el('label', {}, 'Current level', W.numIn(st.cur, (v) => { st.cur = v; draw(); }, 1, maxLvl)),
            el('label', {}, 'Progress %', W.numIn(st.pct, (v) => { st.pct = Math.min(99.99, Math.max(0, v)); draw(); }, 0, 99.99, 0.01)),
            el('label', {}, 'Target level', W.numIn(st.target, (v) => { st.target = v; draw(); }, 2, maxLvl))),
          el('div', { class: 'cap left' }, 'Optional: how long it takes'),
          el('div', { class: 'fields3' },
            el('label', {}, `XP per ${verb}`, W.numIn(st.per || '', (v) => { st.per = Math.max(0, v); draw(); }, 0, 1e9)),
            el('label', {}, 'Seconds each', W.numIn(st.secs, (v) => { st.secs = Math.max(0, v); draw(); }, 0, 3600, 0.5))),
          el('div', { class: 'bigstats' },
            el('div', {}, el('b', {}, need.toLocaleString()), el('span', {}, 'XP needed')),
            el('div', {}, el('b', {}, actions != null ? actions.toLocaleString() : '—'), el('span', {}, `${verb}s`)),
            el('div', {}, el('b', {}, actions != null && st.secs ? W.fmtDur(actions * st.secs / 60) : '—'), el('span', {}, 'of play'))),
          el('p', { class: 'hint' }, `Every profession uses the same XP chart (wiki, levels 1–${maxLvl}). Find your XP per ${verb} in the chat message the game shows after each one.`));
      }

      /* What unlocks between now and a bit past the target: materials for gathering, recipe tiers for crafting. */
      function ahead() {
        const until = Math.min(maxLvl, Math.max(st.target, st.cur + 10));
        let rows;
        if (GATHER.includes(st.prof)) {
          const seen = new Set();
          rows = mats.filter(m => m.p === st.prof && m.l > st.cur && m.l <= until)
            .filter(m => { const k = m.l + m.n.split(' ')[0]; if (seen.has(k)) return false; seen.add(k); return true; })
            .map(m => [m.l, m.n.split(' ')[0] + ' (' + mats.filter(x => x.p === st.prof && x.l === m.l).map(x => x.n.split(' ').slice(1).join(' ')).join(', ') + ')', m.ic ? W.art.item(m.ic) : W.art.wiki(st.prof)]);
        } else {
          const tiers = [...new Set(recipes.filter(r => r.s === st.prof && r.l[0] > st.cur && r.l[0] <= until).map(r => r.l[0]))].sort((a, b) => a - b);
          rows = tiers.map(l => [l, 'New recipe tier: ' + [...new Set(recipes.filter(r => r.s === st.prof && r.l[0] === l).map(r => W.cap(r.t)))].join(', '), W.art.wiki(st.prof)]);
        }
        return W.win(`Coming up for ${W.cap(st.prof)}`,
          rows.length ? el('div', { class: 'ahead' }, rows.map(([l, label, icon]) => el('div', { class: 'arow' },
            el('div', { class: 'aico' }, icon),
            el('div', {}, el('b', {}, label), el('small', {}, `Level ${l} · ${Math.max(0, cum(l) - have()).toLocaleString()} XP away`)))))
            : el('p', { class: 'empty' }, 'Nothing new unlocks in this range.'));
      }

      function chart() {
        const NS = 'http://www.w3.org/2000/svg', w = 520, h = 200, svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${w} ${h + 30}`); svg.setAttribute('class', 'hist');
        const add = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; svg.append(n); return n; };
        const total = cum(maxLvl), X = (l) => 44 + (l - 1) / (maxLvl - 1) * (w - 76), Y = (v) => h - v / total * (h - 16);
        [0.25, 0.5, 0.75, 1].forEach(f => { add('line', { x1: 44, x2: w - 12, y1: Y(total * f), y2: Y(total * f), class: 'r-grid' }); add('text', { x: 4, y: Y(total * f) + 4, class: 'h-ax' }, Math.round(total * f / 1e6) + 'M'); });
        add('rect', { x: X(st.cur), y: 0, width: Math.max(2, X(st.target) - X(st.cur)), height: h, fill: 'rgba(247,210,94,.2)' });
        const pts = []; for (let l = 1; l <= maxLvl; l++) pts.push(X(l) + ',' + Y(cum(l)));
        add('polyline', { points: pts.join(' '), class: 'l-line' });
        [1, 50, 100, maxLvl].forEach(l => add('text', { x: X(l), y: h + 20, class: 'h-ax', 'text-anchor': 'middle' }, 'Lv ' + l));
        const share = (cum(st.target) - have()) / total * 100;
        return W.win('Total XP curve', svg,
          el('p', { class: 'hint', style: { marginTop: 0 } }, `Cumulative XP from level 1. Your range (shaded) is ${share < 0.1 ? 'under 0.1' : W.num(share, 1)}% of the XP to max level — most of the grind is in the last 20 levels.`));
      }
      draw();
    });
  };

  W.pages['professions/spots'] = function (root) {
    W.withData(root, ['spots', 'materials'], (spots, mats) => {
      const draw = () => {
        if (!GATHER.includes(st.prof)) st.prof = 'woodcutting';
        const list = spots[st.prof] || [], [vid, stamps] = VIDEOS[st.prof];
        const pref = { woodcutting: 'Plank', mining: 'Ingot', farming: 'Grains', fishing: 'Meat' }[st.prof];
        const icon = (res) => { const own = mats.filter(x => x.p === st.prof && x.n.toLowerCase().startsWith(res + ' ') && x.ic); const m = own.find(x => x.n.endsWith(pref)) || own[0]; return m ? W.art.item(m.ic) : W.art.wiki(st.prof); };
        const best = list.filter(m => m.l <= st.gLevel).pop();
        root.replaceChildren(el('div', {},
          W.win('Grinding spots',
            profPicker(GATHER, st.prof, (p) => { st.prof = p; draw(); }),
            el('div', { class: 'fields3' }, el('label', {}, `Your ${W.cap(st.prof)} level`, W.numIn(st.gLevel, (v) => { st.gLevel = Math.max(1, v); draw(); }, 1, 132))),
            best ? el('p', { class: 'hint' }, 'Best for you right now: ', el('b', {}, W.cap(best.r)), ` (level ${best.l}). Highlighted below.`) : null,
            el('p', { class: 'hint' }, 'Spots are the densest clusters of nodes in Wynntils’ map data, named after the area they sit in. The level on each banner is the nearest town’s level. Each material also links to the moment in ',
              el('a', { href: 'https://www.youtube.com/@Olinus10', target: '_blank', rel: 'noopener' }, 'Olinus10'), '’s 2026 leveling guide where that spot is shown.')),
          el('div', { class: 'spotlist' }, list.map(m => el('div', { class: 'spot' + (m === best ? ' now' : '') + (m.l > st.gLevel ? ' later' : '') },
            el('div', { class: 'shead2' },
              el('div', { class: 'sico' }, icon(m.r)),
              el('div', {}, el('h3', {}, W.cap(m.r)), el('small', {}, `Level ${m.l} · ${m.total} nodes in the world`)),
              stamps[m.l] != null ? el('a', { class: 'yt', href: `https://www.youtube.com/watch?v=${vid}&t=${stamps[m.l]}s`, target: '_blank', rel: 'noopener' }, 'Watch Olinus10’s spot') : null),
            el('div', { class: 'spotrows' }, m.spots.map(s => el('div', { class: 'spotrow' },
              el('div', { class: 'areabanner' },
                s.lvl ? el('div', { class: 'abl' }, 'Lv. ' + s.lvl) : null,
                el('div', { class: 'abn' }, s.area || s.near)),
              el('div', { class: 'spotmeta' },
                el('code', {}, `${s.x}, ${s.y}, ${s.z}`),
                el('small', {}, `${s.n} nodes within 48 blocks${s.area && s.area !== s.near ? ' · near ' + s.near : ''}`)),
              el('button', { class: 'mini', onclick: (e) => W.copyText(`${s.x} ${s.y} ${s.z}`, e.target) }, 'Copy')))))))));
      };
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
          el('div', { class: 'fields3' }, el('label', {}, `Your ${W.cap(st.prof)} level`, W.numIn(st.gLevel, (v) => { st.gLevel = Math.max(1, v); draw(); }, 1, 132))),
          next ? el('p', { class: 'hint' }, `Next unlock: ${next.n} at level ${next.l} (${next.l - st.gLevel} level${next.l - st.gLevel > 1 ? 's' : ''} to go).`) : el('p', { class: 'hint' }, 'You can gather everything for this profession.'),
          el('div', { class: 'matgrid' }, list.map(m => el('div', { class: 'mat' + (m.l <= st.gLevel ? '' : ' locked') },
            W.slot(m.ic ? W.art.item(m.ic) : W.art.wiki(st.prof)), el('div', {}, el('b', {}, m.n), el('small', {}, 'Level ' + m.l))))),
          el('p', { class: 'hint' }, 'Materials you can’t gather yet are faded. See Grinding Spots for where to find each one.')));
      };
      draw();
    });
  };
})(window.W);
