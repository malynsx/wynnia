(function (W) {
  const { el } = W;
  const cfg = { src: 'fresh', level: 60, cats: W.MATS.map(m => m.k), only: W.STATKEYS.slice(), target: 'max', avg: 20 };

  W.pages.cookbook = function (root) {
    const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, controls(), plan()), el('div', {}, reference())));
    const mount = () => cfg.src === 'fresh' ? W.newMount('horse', { name: 'Fresh mount' }) : (W.mountById(cfg.src) || W.newMount());

    function controls() {
      const m = mount();
      const high = Math.max(...W.STATKEYS.map(k => m.s[k][0]));
      const toggles = (list, key, label, icon) => el('div', { class: 'toggles' }, list.map(o => {
        const on = cfg[key].includes(o.k);
        return el('button', { class: 'tog' + (on ? ' on' : ''), onclick: () => { cfg[key] = on ? cfg[key].filter(x => x !== o.k) : cfg[key].concat(o.k); draw(); } },
          icon && icon(o), label(o));
      }));
      return W.win('Feed Planner',
        el('div', { class: 'form' },
          el('label', {}, 'Mount', W.sel([['fresh', 'Fresh mount (1 / 10 / 30)'], ...W.state.mounts.map(x => [x.id, x.name])], cfg.src, (v) => { cfg.src = v; draw(); })),
          el('label', {}, `Material level: ${cfg.level}`, el('input', { type: 'range', min: 1, max: 115, value: cfg.level, oninput: (e) => { cfg.level = +e.target.value; e.target.previousSibling.textContent = `Material level: ${cfg.level}`; }, onchange: draw })),
          el('label', {}, 'Goal', W.sel([['max', 'Fill every chosen limit to its max'], ['avg', 'Reach a target average limit']], cfg.target, (v) => { cfg.target = v; draw(); })),
          cfg.target === 'avg' && el('label', {}, 'Target average limit', W.numIn(cfg.avg, (v) => { cfg.avg = v; draw(); }, 10, 120, 0.5))),
        high < cfg.level ? el('div', { class: 'warn' }, `⚠ A material can’t be fed if its level is above the mount’s highest stat (${high}). Train it first or lower the level.`) : null,
        el('div', { class: 'cap left' }, 'Materials you have'),
        toggles(W.MATS, 'cats', o => o.name, o => W.art.mat(o.k)),
        el('div', { class: 'cap left' }, 'Stats to improve'),
        toggles(W.STATS, 'only', o => W.statName(o, m.type)));
    }

    function plan() {
      const m = mount(), stats = {};
      W.STATKEYS.forEach(k => stats[k] = [m.s[k][1], m.s[k][2]]);
      if (!cfg.cats.length || !cfg.only.length) return W.win('Plan', el('p', { class: 'empty' }, 'Select at least one material and one stat.'));
      const r = W.planFeed(stats, { level: cfg.level, cats: cfg.cats, only: cfg.only, targetAvg: cfg.target === 'avg' ? cfg.avg : 0 });
      if (!r.steps.length) return W.win('Plan', el('p', { class: 'empty' }, 'Nothing to feed — the goal is already met or no material helps.'));
      const counts = {}; r.steps.forEach(s => counts[s.cat.k] = (counts[s.cat.k] || 0) + 1);
      const shop = el('div', { class: 'grid small' }, Object.entries(counts).map(([k, c]) =>
        W.slot(W.art.mat(k), { count: c, tip: `${c} × level ${cfg.level} ${W.MATS.find(x => x.k === k).name}` })));
      const rows = r.steps.map((s, i) => el('tr', {},
        el('td', {}, i + 1), el('td', {}, el('span', { class: 'ico' }, W.art.mat(s.cat.k)), s.cat.name),
        el('td', {}, Object.entries(s.split).map(([k, p]) => { const st = W.STATS.find(x => x.k === k); return el('span', { class: 'chip', style: { color: st.color } }, `+${p} ${W.statName(st, m.type).slice(0, 4)}`); })),
        el('td', {}, W.num(s.avgAfter, 2)), el('td', {}, W.fmtDur(s.mins))));
      const wasted = r.steps.reduce((a, s) => a + W.matPoints(cfg.level) - s.gain, 0);
      return W.win('Plan',
        el('div', { class: 'kv wide' },
          el('div', {}, el('span', {}, 'Materials'), el('b', {}, r.steps.length)),
          el('div', {}, el('span', {}, 'Total feed time'), el('b', {}, W.fmtDur(r.minutes))),
          el('div', {}, el('span', {}, 'Final avg limit'), el('b', {}, W.num(r.steps.at(-1).avgAfter, 2))),
          el('div', {}, el('span', {}, 'Points wasted'), el('b', {}, wasted))),
        !r.done && el('div', { class: 'warn' }, '⚠ The goal can’t be fully reached with these materials — some stats have no source left.'),
        el('div', { class: 'cap left' }, 'Shopping list'), shop,
        el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['#', 'Material', 'Points', 'Avg limit after', 'Time'].map(h => el('th', {}, h)))), el('tbody', {}, rows)),
        el('p', { class: 'hint' }, 'Greedy plan: each step picks the material that wastes the fewest points. Time per material depends on the average limit when it starts being eaten. Real games may differ slightly in rounding.'));
    }

    function reference() {
      const rows = W.MATS.map(c => {
        const sp = W.splitMat(c, cfg.level);
        return el('div', { class: 'matrow' }, W.slot(W.art.mat(c.k)), el('div', {}, el('b', {}, c.name),
          el('div', {}, Object.entries(sp).map(([k, p]) => { const st = W.STATS.find(x => x.k === k); return el('span', { class: 'chip', style: { color: st.color } }, `+${p} ${st.name}`); }))));
      });
      return W.win(`Level ${cfg.level} materials — ${W.matPoints(cfg.level)} pts each`, el('div', { class: 'matlist' }, rows),
        el('p', { class: 'hint' }, 'Points go to the first-listed stat the most (3:2:1 or 2:1). Overflow past a stat’s max is lost. The wiki sees no difference between ✫ tiers.'));
    }
    draw();
  };
})(window.W);
