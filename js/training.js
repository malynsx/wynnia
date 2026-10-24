(function (W) {
  const { el } = W;
  const cfg = { src: null, gain: 1.1, perMin: 8 };

  W.pages.training = function (root) {
    const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, planner()), el('div', {}, pickups(), notes())));
    function planner() {
      const S = W.state;
      if (!cfg.src || !W.mountById(cfg.src)) cfg.src = S.mounts[0]?.id || null;
      const m = W.mountById(cfg.src);
      if (!m) return W.win('Training Planner', el('p', { class: 'empty' }, 'Add a mount in the Stable first.'));
      let tp = 0;
      const rows = W.STATS.map(s => {
        const [c, l] = m.s[s.k], need = Math.max(0, Math.ceil((l - c) / cfg.gain - 1e-9));
        tp += need;
        return el('tr', {}, el('td', { class: 'sname' }, W.art.stat(s.k), W.statName(s, m.type)), el('td', {}, `${c} → ${l}`), el('td', {}, need), el('td', {}, need * 2));
      });
      return W.win('Training Planner',
        el('div', { class: 'form' },
          el('label', {}, 'Mount', W.sel(S.mounts.map(x => [x.id, x.name]), cfg.src, (v) => { cfg.src = v; draw(); })),
          el('label', {}, 'Levels per pickup', W.sel([[1, '1.0  (no Training)'], [1.1, '1.1  (with Training)'], [1.2, '1.2']], cfg.gain, (v) => { cfg.gain = +v; draw(); })),
          el('label', {}, 'Pickups per minute', W.numIn(cfg.perMin, (v) => { cfg.perMin = Math.max(1, v); draw(); }, 1, 60, 1))),
        el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['Stat', 'Level → limit', 'Pickups', 'Energy'].map(h => el('th', {}, h)))), el('tbody', {}, rows)),
        el('div', { class: 'kv wide' },
          el('div', {}, el('span', {}, 'Total pickups'), el('b', {}, tp)),
          el('div', {}, el('span', {}, 'Energy to spend'), el('b', {}, tp * 2)),
          el('div', {}, el('span', {}, 'Ride time'), el('b', {}, W.fmtDur(tp / cfg.perMin)))),
        el('p', { class: 'hint' }, 'A stat can’t go past its limit, so pickups for a capped stat are wasted. Raise limits by feeding first. Pickups per minute depends on how well you steer through the spawn pool — measure your own.'));
    }
    function pickups() {
      return W.win('Powerups', el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'Pickup'), el('th', {}, 'Effect'))),
        el('tbody', {}, W.POWERUPS.map(([n, e, k]) => { const st = W.STATS.find(s => s.k === k); return el('tr', {}, el('td', { class: 'sname' }, (k ? W.art.stat(k) : W.art.ui(n.includes('boot') ? 'speed-boost' : 'energy-boost')), n), el('td', {}, e)); }))));
    }
    function notes() {
      return W.win('Training notes', el('ul', { class: 'rules' },
        el('li', {}, 'Collecting a powerup costs ', el('b', {}, '2 Energy'), '. At 0 Energy you slow down and stat pickups stop levelling.'),
        el('li', {}, 'Powerups come from a hidden weighted pool; a pickup you skip becomes more likely next time, so ignoring types lowers the odds of the one you want.'),
        el('li', {}, 'Speed has diminishing returns: one guide measured about +2.0 blocks/s from level 1→2 but only +0.2 from 13→14.'),
        el('li', {}, 'Train on flat ground: Detlas for Horse and Adasaur, the ocean for Wyverns.')));
    }
    draw();
  };
})(window.W);
