/* Decoder for Wynntils item strings (the "copy to clipboard" text of a shared / inspected mount).
   Format read from the open-source Wynntils mod (EncodedByteBuffer + the Mount*DataTransformers, encoding versions 1-3):
   private-use code points -> bytes -> blocks of [id, data...] ending with id 255. */
(function (root) {
  const COLOR_NAMES = {
    1: 'Cherry', 2: 'Bay', 3: 'Chestnut', 4: 'Gold', 5: 'Tan', 6: 'Beige', 7: 'Black', 8: 'Gray', 9: 'Silver', 10: 'White',
    11: 'Sable', 12: 'Rich', 13: 'Reddish', 14: 'Dawn', 15: 'Dusk', 16: 'Fawn', 17: 'Night', 18: 'Ash', 19: 'Argent', 20: 'Pale',
    21: 'Azure', 22: 'Cerulean', 23: 'Bronze', 24: 'Ebony', 25: 'Fledge', 26: 'Golden', 27: 'Hollow', 28: 'Infernal', 29: 'Jade', 30: 'Mystic',
    31: 'Cinder', 32: 'Horn', 33: 'Kander', 34: 'Onyx', 35: 'Quartz', 36: 'Sapphire', 37: 'Rose', 38: 'Shell', 39: 'Ivory', 40: 'Tusk',
    41: 'Crimson', 42: 'Dust', 43: 'Amber', 44: 'Emerald', 45: 'Cobalt', 46: 'Plum', 47: 'Albino', 48: 'Blood', 49: 'Tawny', 50: 'Moss',
    51: 'Royal', 52: 'Misty', 53: 'Maroon', 54: 'Raven', 55: 'Sage', 56: 'Bleach',
  };
  const STAT_IDS = ['speed', 'accel', 'jump', 'jump', 'energy', 'handling', 'toughness', 'boost', 'training']; // id 3 = altitude (a wyvern's jump)
  const TYPE_IDS = ['horse', 'wyvern', 'adasaur'];

  function toBytes(str) {
    const out = [];
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x100000) {
        if ((cp & 0xFF) === 0xEE) { out.push((cp - (0x100000 + 0xEE)) >> 8); continue; }   // padding: one trailing byte
        out.push(255, 254 + ((cp - 0x100000) & 0xFF));
      } else if (cp >= 0xF0000) {
        const v = cp - 0xF0000; out.push(v >> 8, v & 0xFF);
      }
    }
    return out;
  }
  function reader(bytes) {
    let i = 0;
    return {
      has: () => i < bytes.length,
      byte() { if (i >= bytes.length) throw new Error('Ran out of data'); return bytes[i++]; },
      varint() {                                   // 7-bit groups, little endian, zig-zag
        let v = 0n, shift = 0n, b;
        do { b = this.byte(); v |= BigInt(b & 0x7F) << shift; shift += 7n; } while (b & 0x80);
        return Number((v >> 1n) ^ -(v & 1n));
      },
    };
  }
  function decodeOne(data) {
    const r = reader(toBytes(data));
    if (r.byte() !== 0) throw new Error('Not a Wynntils item string.');
    const version = r.byte();
    if (version > 2) throw new Error('Unknown encoding version ' + version);
    const m = { stats: {}, maxStats: {}, estimated: false };
    let itemType = null, ended = false;
    while (r.has()) {
      const id = r.byte();
      if (id === 255) { ended = true; break; }
      if (id === 1) itemType = r.byte();
      else if (id === 16) { m.type = TYPE_IDS[r.byte()]; if (!m.type) throw new Error('Unknown mount type'); }
      else if (id === 17) m.potential = r.varint();
      else if (id === 18) { m.c1 = COLOR_NAMES[r.byte()] || null; m.c2 = COLOR_NAMES[r.byte()] || null; }
      else if (id === 19) m.energy = [r.varint(), r.varint()];
      else if (id === 20) { const n = r.byte(); for (let k = 0; k < n; k++) { const s = STAT_IDS[r.byte()]; m.stats[s] = [r.varint(), r.varint()]; } }
      else if (id === 21) { m.estimated = r.byte() !== 0; const n = r.byte(); for (let k = 0; k < n; k++) { const s = STAT_IDS[r.byte()]; m.maxStats[s] = r.varint(); } }
      else throw new Error('Unsupported data block ' + id);
    }
    if (!ended) throw new Error('Item data is incomplete.');
    if (itemType !== 5) throw new Error('This is not a mount (it is another kind of item).');
    if (!m.type || !m.stats.speed) throw new Error('Mount data is missing.');
    return m;
  }

  /* Every encoded item found in the text: [{ ok, mount } | { ok: false, error }]. */
  function decodeText(text) {
    const re = /([\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]+)(?: "([^"]+)")?/gu, res = [];
    let m;
    while ((m = re.exec(text))) {
      try { const d = decodeOne(m[1]); d.name = m[2] || null; res.push({ ok: true, mount: d }); }
      catch (e) { res.push({ ok: false, error: e.message }); }
    }
    return res;
  }
  /* App format: s[stat] = [level, limit, max]. Wynntils' stat is (level, limit) and a separate max. */
  function toAppMount(d) {
    const s = {};
    for (const k of Object.keys(d.stats)) s[k] = [d.stats[k][0], d.stats[k][1], d.maxStats[k] ?? d.stats[k][1]];
    return { type: d.type, name: d.name || d.type[0].toUpperCase() + d.type.slice(1), c1: d.c1, c2: d.c2, s, estimated: d.estimated, potential: d.potential };
  }
  /* Gear items (Wynntils ItemTransformingVersion 3): name, identifications with their exact values, powders, rerolls, shiny.
     idKeys maps Wynntils' numeric stat ids to API identification names (data/idkeys.json). */
  const ELEMENTS = ['earth', 'thunder', 'water', 'fire', 'air'];
  function decodeGearOne(data, idKeys) {
    const r = reader(toBytes(data));
    if (r.byte() !== 0) throw new Error('Not a Wynntils item string.');
    const version = r.byte();
    if (version < 2) throw new Error('This item was shared with an older Wynntils. Update the mod and share it again.');
    if (version > 2) throw new Error('Unknown encoding version ' + version);
    const g = { ids: {}, powders: [], rerolls: 0, shiny: null };
    let itemType = null, ended = false;
    while (r.has()) {
      const id = r.byte();
      if (id === 255) { ended = true; break; }
      if (id === 1) itemType = r.byte();
      else if (id === 2) { let s = '', b; while ((b = r.byte()) !== 0) s += String.fromCharCode(b); g.name = s; }
      else if (id === 3) {
        const count = r.byte(), extended = r.byte() === 1, pre = extended ? r.byte() : 0;
        for (let i = 0; i < pre + count; i++) {
          const key = idKeys[r.byte()] || null;
          if (extended) { r.varint(); if (i < pre) continue; }
          const value = r.varint(), flags = r.byte();
          if (flags & 4) r.byte();
          if (key) g.ids[key] = value;
        }
      }
      else if (id === 4) {
        const slots = r.byte(), n = r.byte(), bytes = [];
        for (let i = 0; i < Math.ceil(n * 5 / 8); i++) bytes.push(r.byte());
        const bits = bytes.flatMap(b => [7, 6, 5, 4, 3, 2, 1, 0].map(j => (b >> j) & 1));
        for (let i = 0; i < Math.min(n, slots); i++) {
          let v = 0; for (let j = 0; j < 5; j++) if (bits[i * 5 + (4 - j)]) v |= 1 << j;
          if (!v) continue;
          let el = Math.floor(v / 6), tier = v % 6; if (tier === 0) { el -= 1; tier = 6; }
          g.powders.push([ELEMENTS[el] || '?', tier]);
        }
        g.slots = slots;
      }
      else if (id === 5) g.rerolls = r.byte();
      else if (id === 6) { const statId = r.byte(), rerolls = r.byte(), value = r.varint(); g.shiny = { statId, rerolls, value }; }
      else if (id === 7) throw new Error('Crafted gear isn’t supported yet.');
      else throw new Error('Unsupported data block ' + id);
    }
    if (!ended) throw new Error('Item data is incomplete.');
    if (itemType !== 0) throw new Error('This is not a gear item.');
    if (!g.name) throw new Error('Item name is missing.');
    return g;
  }
  function decodeGearText(text, idKeys) {
    const re = /([\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]+)(?: "([^"]+)")?/gu, res = [];
    let m;
    while ((m = re.exec(text))) {
      try { res.push({ ok: true, gear: decodeGearOne(m[1], idKeys) }); }
      catch (e) { res.push({ ok: false, error: e.message }); }
    }
    return res;
  }

  root.WynntilsDecode = { decodeText, toAppMount, decodeGearText };
  if (typeof module !== 'undefined') module.exports = root.WynntilsDecode;
})(typeof window !== 'undefined' ? window : globalThis);
