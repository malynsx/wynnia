(function (W) {
  /* ---------- DOM helpers ---------- */
  W.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [a, b] of Object.entries(v)) a.startsWith('--') ? e.style.setProperty(a, b) : (e.style[a] = b); }
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(c));
    }
    return e;
  };
  const el = W.el;
  W.fmtDur = (min) => {
    min = Math.round(min);
    if (min < 1) return '0m';
    const d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
    return [d && d + 'd', h && h + 'h', m && !d && m + 'm'].filter(Boolean).join(' ') || '0m';
  };
  W.num = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: d });

  /* ---------- Tooltip ---------- */
  const tip = el('div', { class: 'tooltip', hidden: true });
  document.addEventListener('DOMContentLoaded', () => document.body.append(tip));
  W.tip = (node, content) => {
    node.dataset.hastip = '';
    node.addEventListener('mousemove', (e) => {
      const c = typeof content === 'function' ? content() : content;
      if (!c) { tip.hidden = true; return; }
      tip.replaceChildren(c.nodeType ? c : el('div', { html: c }));
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + 16, y = e.clientY - 12;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 16;
      if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
      tip.style.left = Math.max(8, x) + 'px';
      tip.style.top = Math.max(8, y) + 'px';
    });
    node.addEventListener('mouseleave', () => { tip.hidden = true; });
    node.addEventListener('click', () => { tip.hidden = true; });
    return node;
  };

  /* Every plain title="" on the site shows as the site's own tooltip, instantly, instead of the browser's. */
  const hint = el('div', { class: 'tooltip hinttip', hidden: true });
  document.addEventListener('DOMContentLoaded', () => document.body.append(hint));
  let hintFor = null;
  const placeHint = (e) => {
    const r = hint.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 18;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 10;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 12;
    hint.style.left = Math.max(8, x) + 'px'; hint.style.top = Math.max(8, y) + 'px';
  };
  /* a tooltip whose element vanished (page change, redraw) never gets mouseleave, so hide it here */
  const dropTips = () => { tip.hidden = true; hint.hidden = true; hintFor = null; };
  window.addEventListener('hashchange', dropTips);
  document.addEventListener('mouseover', (e) => {
    if (!(e.target.closest && e.target.closest('[data-hastip]'))) tip.hidden = true;
    const t = e.target.closest && e.target.closest('[title], [data-tip]');
    if (t && t.hasAttribute('title')) { if (t.title) t.dataset.tip = t.title; t.removeAttribute('title'); }
    if (!t || !t.dataset.tip) { hint.hidden = true; hintFor = null; return; }
    hintFor = t; hint.textContent = t.dataset.tip; hint.hidden = false; placeHint(e);
  });
  document.addEventListener('mousemove', (e) => { if (hintFor && !hint.hidden) placeHint(e); });
  document.addEventListener('mousedown', () => { hint.hidden = true; hintFor = null; });
  window.addEventListener('scroll', () => { hint.hidden = true; }, true);

  /* ---------- State ---------- */
  const KEY = 'stableLedger.v1';
  W.defaultSettings = () => ({ bonus: 5, sd: 2, curSd: 0.5, slots: 3 });
  W.newMount = (type = 'horse', over = {}) => {
    const s = {};
    W.STATKEYS.forEach(k => s[k] = [1, 10, 30]);
    return Object.assign({
      id: 'm' + Math.random().toString(36).slice(2, 9), name: 'New ' + W.TYPES[type].name,
      type, c1: W.COLORS[type].body[0][0], c2: W.COLORS[type].second[0][0], s,
    }, over);
  };
  W.demoMounts = () => {
    const mk = (name, type, c1, c2, lim, max, cur) => {
      const m = W.newMount(type, { name, c1, c2 });
      W.STATKEYS.forEach((k, i) => m.s[k] = [cur[i], lim[i], max[i]]);
      return m;
    };
    return [
      mk('Biscuit', 'horse', 'Chestnut', 'Argent', [34,32,30,34,30,28,30,30], [34,32,30,34,30,28,30,30], [24,12,10,18,9,6,5,8]),
      mk('Ember', 'horse', 'Black', 'Reddish', [36,30,32,32,30,30,28,30], [36,30,32,32,30,30,28,30], [26,10,9,14,6,6,5,5]),
      mk('Skyrunner', 'wyvern', 'Cerulean', 'Ivory', [20,20,26,22,20,20,22,20], [30,30,36,32,30,30,32,30], [10,10,26,12,8,8,10,5]),
    ];
  };
  W.state = { mounts: [], settings: W.defaultSettings(), ledger: [], feeder: { a: null, b: null }, selected: null };
  W.load = () => {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.mounts)) {
        Object.assign(W.state, { mounts: d.mounts, ledger: d.ledger || [], settings: Object.assign(W.defaultSettings(), d.settings) });
        return;
      }
    } catch (e) { /* fall through */ }
    W.state.mounts = W.demoMounts();
  };
  W.save = () => {
    try {
      const { mounts, ledger, settings } = W.state;
      localStorage.setItem(KEY, JSON.stringify({ mounts, ledger, settings }));
    } catch (e) { /* storage blocked */ }
  };
  W.mountById = (id) => W.state.mounts.find(m => m.id === id) || null;

  /* ---------- Mount maths ---------- */
  W.potential = (m) => W.STATKEYS.reduce((a, k) => a + m.s[k][2], 0);
  W.sumLim = (m) => W.STATKEYS.reduce((a, k) => a + m.s[k][1], 0);
  W.avgLim = (m) => W.sumLim(m) / 8;
  W.clampMount = (m) => {
    W.STATKEYS.forEach(k => {
      let [c, l, x] = m.s[k].map(v => Math.max(1, Math.round(+v) || 1));
      x = Math.max(x, 1); l = Math.min(l, x); c = Math.min(c, l);
      m.s[k] = [c, l, x];
    });
    return m;
  };
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  W.gauss = gauss;

  /* The breeding model. Wiki: limits/max = average of parent LIMITS + unknown bonus + variance;
     current level = higher parent's current + variance; parents' max values are ignored. */
  W.breed = (a, b, S = W.state.settings) => {
    const c = W.newMount(a.type, { name: 'Foal', c1: Math.random() < .5 ? a.c1 : b.c1, c2: Math.random() < .5 ? a.c2 : b.c2 });
    W.STATKEYS.forEach(k => {
      const avg = (a.s[k][1] + b.s[k][1]) / 2;
      const max = Math.max(1, Math.round(avg + S.bonus + gauss() * S.sd));
      const lim = Math.min(max, Math.round(avg));
      const cur = Math.max(1, Math.min(lim, Math.round(Math.max(a.s[k][0], b.s[k][0]) + gauss() * S.curSd)));
      c.s[k] = [cur, lim, max];
    });
    return c;
  };
  W.canBreed = (a) => W.avgLim(a) >= W.BREED_MIN_AVG;

  /* Greedy feed planner. stats: {key:[lim,max]}. Returns steps. */
  W.planFeed = (stats, o) => {
    const lim = {}, max = {};
    W.STATKEYS.forEach(k => { lim[k] = stats[k][0]; max[k] = stats[k][1]; });
    const only = o.only || W.STATKEYS, cats = W.MATS.filter(c => !o.cats || o.cats.includes(c.k));
    const steps = []; let total = 0;
    for (let i = 0; i < 500; i++) {
      const avg = W.STATKEYS.reduce((a, k) => a + lim[k], 0) / 8;
      if (o.targetAvg && avg >= o.targetAvg) break;
      let best = null;
      for (const c of cats) {
        const sp = W.splitMat(c, o.level); let gain = 0;
        for (const [k, p] of Object.entries(sp)) if (only.includes(k)) gain += Math.max(0, Math.min(p, max[k] - lim[k]));
        if (gain > 0 && (!best || gain > best.gain)) best = { c, sp, gain };
      }
      if (!best) break;
      const mins = W.feedMinutes(Math.ceil(avg));
      for (const [k, p] of Object.entries(best.sp)) lim[k] = Math.min(max[k], lim[k] + p);
      total += mins;
      steps.push({ cat: best.c, split: best.sp, gain: best.gain, mins, avgAfter: W.STATKEYS.reduce((a, k) => a + lim[k], 0) / 8, limAfter: { ...lim } });
    }
    const done = o.targetAvg ? W.STATKEYS.reduce((a, k) => a + lim[k], 0) / 8 >= o.targetAvg : only.every(k => lim[k] >= max[k]);
    return { steps, minutes: total, done, lim };
  };

  /* ---------- Shared widgets ---------- */
  W.mountTip = (m) => {
    const r = W.rank(W.potential(m));
    const d = el('div', {});
    d.append(el('div', { class: 'tt-name', style: { color: r.color } }, m.name),
      el('div', { class: 'tt-sub' }, `${m.c1} / ${m.c2} ${W.TYPES[m.type].name}`));
    W.STATS.forEach(s => d.append(el('div', {}, el('span', { style: { color: s.color } }, W.statName(s, m.type) + ': '),
      el('span', { class: 'tt-w' }, `${m.s[s.k][0]}`), el('span', { class: 'tt-g' }, ` / ${m.s[s.k][1]} / ${m.s[s.k][2]}`))));
    d.append(el('div', { class: 'tt-gap' }),
      el('div', {}, el('span', { class: 'tt-g' }, 'Potential: '), el('span', { class: 'tt-w' }, W.potential(m)), el('span', { style: { color: r.color } }, ` [${r.name}]`)),
      el('div', {}, el('span', { class: 'tt-g' }, 'Average Limit: '), el('span', { class: 'tt-w' }, W.num(W.avgLim(m), 2))),
      el('div', { style: { color: W.canBreed(m) ? '#55ff55' : '#ff5555' } }, W.canBreed(m) ? 'Ready to breed' : 'Needs average limit 20 to breed'));
    return d;
  };
  W.slot = (child, opts = {}) => {
    const s = el('div', { class: 'slot' + (opts.sel ? ' sel' : '') + (opts.big ? ' big' : '') + (opts.onclick ? ' act' : ''), onclick: opts.onclick }, child);
    if (opts.count != null) s.append(el('span', { class: 'count' }, opts.count));
    if (opts.tip) W.tip(s, opts.tip);
    return s;
  };
  W.mountSlot = (m, opts = {}) => {
    if (!m) return W.slot(null, opts);
    const s = W.slot(W.art.mount(m.type, m.c1, m.c2), Object.assign({ count: W.potential(m), tip: () => W.mountTip(m) }, opts));
    s.style.setProperty('--glow', W.rank(W.potential(m)).color);
    s.classList.add('glow');
    return s;
  };
  W.win = (title, ...body) => el('section', { class: 'win' }, el('h2', {}, title), ...body);
  W.sel = (opts, val, on) => el('select', { onchange: (e) => on(e.target.value) },
    opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return el('option', { value: v, selected: String(v) === String(val) }, t); }));
  W.numIn = (val, on, min = 0, max = 9999, step = 1) =>
    el('input', { type: 'number', value: val, min, max, step, onchange: (e) => on(+e.target.value) });

  /* Radar of cur / limit / max across the 8 stats. */
  W.radar = (m, size = 230, scale) => {
    const NS = 'http://www.w3.org/2000/svg', c = size / 2, R = size * 0.34;
    const sc = scale || Math.max(40, ...W.STATKEYS.map(k => m.s[k][2]));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('class', 'radar');
    const pt = (i, v) => { const a = -Math.PI / 2 + i * Math.PI / 4; return [c + Math.cos(a) * R * v / sc, c + Math.sin(a) * R * v / sc]; };
    const add = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt) n.textContent = txt; svg.append(n); return n; };
    [0.25, 0.5, 0.75, 1].forEach(f => add('polygon', { points: W.STATKEYS.map((_, i) => pt(i, sc * f).join(',')).join(' '), class: 'r-grid' }));
    W.STATKEYS.forEach((k, i) => {
      const [x, y] = pt(i, sc); add('line', { x1: c, y1: c, x2: x, y2: y, class: 'r-grid' });
      const [lx, ly] = pt(i, sc * 1.2); const st = W.STATS[i];
      add('text', { x: lx, y: ly + 3, 'text-anchor': 'middle', class: 'r-lbl', fill: st.color }, W.statName(st, m.type).slice(0, 5));
    });
    const poly = (idx, cls) => add('polygon', { points: W.STATKEYS.map((k, i) => pt(i, m.s[k][idx]).join(',')).join(' '), class: cls });
    poly(2, 'r-max'); poly(1, 'r-lim'); poly(0, 'r-cur');
    return svg;
  };
})(window.W);
