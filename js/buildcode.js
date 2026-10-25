/* Compact build codes for share links: bytes -> base64url, usually 40–90 characters.
   Items are stored by the stable numbers in data/itemids.json, identifications by Wynntils' numeric
   stat keys, powders as one byte each and the ability tree as a bitset. */
(function (W) {
  const VERSION = 1;
  W.BUILD_SLOTS = ['h', 'c', 'l', 'b', 'r1', 'r2', 'br', 'n', 'w', ...Array.from({ length: 14 }, (_, i) => 't' + i)];
  const ELEMS = ['earth', 'thunder', 'water', 'fire', 'air'];
  const MODES = ['max', 'avg', 'min'];

  const zz = (n) => (n << 1) ^ (n >> 31);
  const unzz = (n) => (n >>> 1) ^ -(n & 1);
  function writer() {
    const b = [];
    return {
      b,
      byte(v) { b.push(v & 255); },
      uint(v) { v = Math.max(0, Math.floor(v)); do { let x = v & 127; v = Math.floor(v / 128); if (v) x |= 128; b.push(x); } while (v); },
      int(v) { this.uint(zz(v | 0)); },
    };
  }
  function reader(b) {
    let i = 0;
    return {
      has: () => i < b.length,
      byte() { if (i >= b.length) throw new Error('Build code is cut off.'); return b[i++]; },
      uint() { let v = 0, m = 1, x; do { x = this.byte(); v += (x & 127) * m; m *= 128; } while (x & 128); return v; },
      int() { return unzz(this.uint()); },
    };
  }
  const toB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64 = (s) => Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

  /* build: { lvl, mode, s: { slot: [name, rolls|null, powders|null] }, x: { strength: n … }, t: [ability ids] }
     ctx: { ids: name -> number, keyNum: id key -> number, treeIds: sorted ability ids of the class (optional) } */
  W.encodeBuild = (build, ctx) => {
    const w = writer();
    w.byte(VERSION);
    w.uint(build.lvl || 106);
    w.byte(typeof build.mode === 'number' ? 100 + Math.round(build.mode * 100) : Math.max(0, MODES.indexOf(build.mode || 'max')));   // 100+ = a roll percentage
    W.SK.forEach(s => w.int((build.x && build.x[s]) || 0));
    const present = W.BUILD_SLOTS.map(k => build.s[k] && ctx.ids[build.s[k][0]] ? 1 : 0);
    for (let i = 0; i < present.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) if (present[i + j]) v |= 1 << j; w.byte(v); }
    W.BUILD_SLOTS.forEach((k, i) => {
      if (!present[i]) return;
      const [name, rolls, powders] = build.s[k];
      w.uint(ctx.ids[name]);
      const r = Object.entries(rolls || {}).filter(([key]) => ctx.keyNum[key] != null);
      w.uint(r.length); r.forEach(([key, v]) => { w.uint(ctx.keyNum[key]); w.int(v); });
      const p = (powders || []).filter(([e]) => ELEMS.includes(e));
      w.uint(p.length); p.forEach(([e, t]) => w.byte(ELEMS.indexOf(e) * 8 + t));
    });
    const tree = ctx.treeIds ? (build.t || []).map(id => ctx.treeIds.indexOf(id)).filter(i => i >= 0) : [];
    w.uint(tree.length ? ctx.treeIds.length : 0);
    if (tree.length) {
      const bits = new Array(Math.ceil(ctx.treeIds.length / 8)).fill(0);
      tree.forEach(i => { bits[i >> 3] |= 1 << (i & 7); });
      bits.forEach(v => w.byte(v));
    }
    return toB64(w.b);
  };

  /* Returns the build, with the tree as indices (resolved later once the class tree has loaded). */
  W.decodeBuild = (code, ctx) => {
    const r = reader(fromB64(code));
    if (r.byte() !== VERSION) throw new Error('Unknown build code version.');
    const lvl = r.uint(), m = r.byte();
    const build = { lvl, mode: m >= 100 ? (m - 100) / 100 : MODES[m] || 'max', x: {}, s: {}, tIdx: [] };
    W.SK.forEach(s => { const v = r.int(); if (v) build.x[s] = v; });
    const present = [];
    for (let i = 0; i < W.BUILD_SLOTS.length; i += 8) { const v = r.byte(); for (let j = 0; j < 8; j++) present.push((v >> j) & 1); }
    W.BUILD_SLOTS.forEach((k, i) => {
      if (!present[i]) return;
      const name = ctx.names[r.uint()];
      const rolls = {}; const nr = r.uint();
      for (let j = 0; j < nr; j++) { const key = ctx.keyName[r.uint()]; const v = r.int(); if (key) rolls[key] = v; }
      const pw = []; const np = r.uint();
      for (let j = 0; j < np; j++) { const v = r.byte(); pw.push([ELEMS[v >> 3], v & 7]); }
      if (name) build.s[k] = [name, nr ? rolls : null, np ? pw : null];
    });
    const n = r.has() ? r.uint() : 0;
    for (let i = 0; i < Math.ceil(n / 8); i++) { const v = r.byte(); for (let j = 0; j < 8; j++) if ((v >> j) & 1) build.tIdx.push(i * 8 + j); }
    return build;
  };
})(window.W);
