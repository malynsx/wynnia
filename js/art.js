/* Image helpers. Mount renders, profession and class art come from the Wynncraft Wiki,
   item icons from the Wynncraft item guide, ingredient icons are the Minecraft items they appear as. */
(function (W) {
  const img = (src, alt = '') => {
    const i = document.createElement('img');
    i.src = src; i.alt = alt; i.className = 'sprite'; i.draggable = false; i.decoding = 'async';
    return i;
  };
  const slug = (s) => String(s).toLowerCase();
  W.art = {
    mountUrl: (type, c1, c2) => `img/mounts/${slug(type)}-${slug(c1)}-${slug(c2)}.webp`,
    mount: (type, c1, c2) => img(W.art.mountUrl(type, c1, c2), `${c1}-${c2} ${type}`),
    mat: (k) => img(`img/ui/mat-${k}.webp`, k),
    stat: (k) => img(`img/ui/${{ jump: 'jump-height', accel: 'acceleration' }[k] || k}.webp`, k),
    ui: (name) => img(`img/ui/${name}.webp`, name),
    wiki: (name) => img(`img/wiki/${name}.webp`, name),
    item: (file) => { const i = img(file ? `img/items/${file}` : 'img/wiki/weaponsmithing.webp'); if (!file) i.classList.add('dim'); i.loading = 'lazy'; return i; },
    ing: (file) => { const i = img(file ? `img/ing/${file}` : 'img/wiki/alchemism.webp'); i.classList.add('px'); if (!file) i.classList.add('dim'); i.loading = 'lazy'; return i; },
    /* Browser tab icon: the header emblem (axe in a gold hex) drawn at 64px so it reads on light and dark tab bars. */
    favicon() {
      const l = document.createElement('link');
      l.rel = 'icon'; l.href = 'img/wynntools-logo.png';
      document.head.append(l);
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d');
        /* the header's shield, scaled into 64x64 (its path is drawn on a 100x116 box) */
        const shield = (inset) => {
          const k = 64 / 116, x = (v) => 5 + (v + (v < 50 ? inset : v > 50 ? -inset : 0)) * k, y = (v) => 0.5 + v * k;
          g.beginPath(); g.moveTo(x(50), y(4 + inset)); g.lineTo(x(94), y(18 + inset)); g.lineTo(x(94), y(58));
          g.bezierCurveTo(x(94), y(86 - inset), x(74), y(102 - inset), x(50), y(112 - inset * 1.3));
          g.bezierCurveTo(x(26), y(102 - inset), x(6), y(86 - inset), x(6), y(58)); g.lineTo(x(6), y(18 + inset)); g.closePath();
        };
        shield(0); g.fillStyle = '#17304a'; g.fill();
        shield(7); g.fillStyle = '#f7d25e'; g.fill();
        shield(15); g.fillStyle = '#24425f'; g.fill();
        g.save(); g.translate(32, 32); g.rotate(-0.14);
        const h = 34, w = h * im.width / im.height;
        g.drawImage(im, -w / 2, -h / 2 - 1, w, h); g.restore();
        l.href = c.toDataURL('image/png');
      };
      im.src = 'img/wynntools-logo.png';
    },
  };
})(window.W);
