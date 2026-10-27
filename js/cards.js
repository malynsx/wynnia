/* Shareable cards: a 1200x630 picture of a build or a player profile in the site's style, copied to the clipboard
   (or downloaded where copying images isn't allowed). spec: { accent, title, subtitle, art, artLabel, tiles: [[label, value]],
   gear: [{ ic, color, name }], lines: [[left, right]] } */
(function (W) {
  const { el } = W;
  const load = (src) => new Promise((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const round = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const fit = (c, text, max) => { let t = String(text); while (t.length > 1 && c.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; };

  W.cardImage = async (spec) => {
    await Promise.all(['700 56px Ubuntu', '500 22px Ubuntu', '700 14px Ubuntu'].map(f => document.fonts && document.fonts.load(f).catch(() => {})));
    const Wd = 1200, H = 630, cv = document.createElement('canvas'); cv.width = Wd; cv.height = H;
    const c = cv.getContext('2d'), accent = spec.accent || '#ffd65a';
    /* background: charcoal with a soft glow of the accent colour */
    c.fillStyle = '#1f1c1a'; c.fillRect(0, 0, Wd, H);
    const g = c.createRadialGradient(Wd * 0.8, -60, 40, Wd * 0.8, -60, 700); g.addColorStop(0, accent + '40'); g.addColorStop(1, '#1f1c1a00');
    c.fillStyle = g; c.fillRect(0, 0, Wd, H);
    c.fillStyle = accent; c.fillRect(0, 0, Wd, 8);
    /* logo */
    const [ring, art, ...gear] = await Promise.all([load('brand/wynnia-ring-128.png'), spec.art ? load(spec.art) : null, ...(spec.gear || []).map(x => x.ic ? load('img/items/' + x.ic) : null)]);
    if (ring) c.drawImage(ring, 40, 34, 52, 52);
    c.fillStyle = '#fff'; c.font = '700 30px Ubuntu, sans-serif'; c.textBaseline = 'alphabetic'; c.fillText('Wynnia', 104, 66);
    c.fillStyle = '#a39c90'; c.font = '700 12px Ubuntu, sans-serif'; c.fillText('TOOLS FOR WYNNCRAFT', 106, 84);
    c.textAlign = 'right'; c.font = '500 18px Ubuntu, sans-serif'; c.fillText('malynsx.github.io/wynnia', Wd - 40, 70); c.textAlign = 'left';
    /* picture panel on the left */
    round(c, 40, 120, 330, 470, 14); c.fillStyle = '#2b2233'; c.fill(); c.lineWidth = 3; c.strokeStyle = accent + 'aa'; c.stroke();
    if (art) {
      c.imageSmoothingEnabled = false;
      const s = Math.min(290 / art.width, 400 / art.height), w = art.width * s, h = art.height * s;
      c.drawImage(art, 40 + (330 - w) / 2, 120 + (440 - h) / 2, w, h);
      c.imageSmoothingEnabled = true;
    }
    if (spec.artLabel) { c.fillStyle = '#fff'; c.font = '700 20px Ubuntu, sans-serif'; c.textAlign = 'center'; c.fillText(fit(c, spec.artLabel, 300), 205, 572); c.textAlign = 'left'; }
    /* title and subtitle */
    const X = 410, RW = Wd - X - 40;
    c.fillStyle = '#fff'; c.font = '700 54px Ubuntu, sans-serif'; c.fillText(fit(c, spec.title || '', RW), X, 172);
    c.fillStyle = accent; c.font = '500 24px Ubuntu, sans-serif'; c.fillText(fit(c, spec.subtitle || '', RW), X, 212);
    /* stat tiles, three a row */
    let y = 244;
    const tiles = (spec.tiles || []).slice(0, 6), tw = (RW - 24) / 3;
    tiles.forEach(([label, value], i) => {
      const tx = X + (i % 3) * (tw + 12), ty = y + Math.floor(i / 3) * 104;
      round(c, tx, ty, tw, 92, 10); c.fillStyle = '#2b2733'; c.fill(); c.strokeStyle = '#3d3833'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#ffd65a'; c.font = '700 34px Ubuntu, sans-serif'; c.fillText(fit(c, value, tw - 28), tx + 14, ty + 48);
      c.fillStyle = '#a39c90'; c.font = '700 13px Ubuntu, sans-serif'; c.fillText(fit(c, String(label).toUpperCase(), tw - 28), tx + 14, ty + 76);
    });
    y += Math.ceil(tiles.length / 3) * 104 + 8;
    /* gear row (builds) */
    if (spec.gear && spec.gear.length) {
      const n = spec.gear.length, sz = Math.min(64, (RW - (n - 1) * 10) / n);
      spec.gear.forEach((x, i) => {
        const gx = X + i * (sz + 10);
        round(c, gx, y, sz, sz, 8); c.fillStyle = '#120c1c'; c.fill(); c.strokeStyle = x.color || '#4a3d66'; c.lineWidth = 3; c.stroke();
        if (gear[i]) { c.imageSmoothingEnabled = false; c.drawImage(gear[i], gx + 8, y + 8, sz - 16, sz - 16); c.imageSmoothingEnabled = true; }
      });
      y += sz + 18;
    }
    /* extra lines (characters, guild…) */
    (spec.lines || []).slice(0, Math.max(0, Math.floor((590 - y) / 34))).forEach(([l, r]) => {
      c.fillStyle = '#fff'; c.font = '700 22px Ubuntu, sans-serif'; c.fillText(fit(c, l, RW * 0.6), X, y + 22);
      c.fillStyle = '#a39c90'; c.font = '500 20px Ubuntu, sans-serif'; c.textAlign = 'right'; c.fillText(fit(c, r, RW * 0.38), X + RW, y + 22); c.textAlign = 'left';
      y += 34;
    });
    return new Promise((ok) => cv.toBlob(ok, 'image/png'));
  };

  /* "Copy card" button: copies the picture, or downloads it when the browser won't copy images */
  W.cardButton = (getSpec, fileName) => el('button', { class: 'mini', title: 'Copy a picture of this to paste in Discord or anywhere', onclick: async (e) => {
    const btn = e.currentTarget, t = btn.textContent; btn.textContent = 'Drawing…'; btn.disabled = true;
    try {
      const blob = await W.cardImage(getSpec());
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        btn.textContent = 'Copied';
      } catch (err) {
        const a = el('a', { href: URL.createObjectURL(blob), download: (fileName || 'wynnia-card') + '.png' });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        btn.textContent = 'Downloaded';
      }
    } catch (err) { btn.textContent = 'Couldn’t draw it'; }
    setTimeout(() => { btn.textContent = t; btn.disabled = false; }, 1600);
  } }, 'Copy card');
})(window.W);
