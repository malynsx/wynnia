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
        const hex = (r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; g.lineTo(32 + r * Math.cos(a), 32 + r * Math.sin(a)); } g.closePath(); };
        hex(31); g.fillStyle = '#17304a'; g.fill();
        hex(27); g.fillStyle = '#f7d25e'; g.fill();
        hex(21); g.fillStyle = '#24425f'; g.fill();
        g.save(); g.translate(32, 32); g.rotate(-0.14);
        const h = 34, w = h * im.width / im.height;
        g.drawImage(im, -w / 2, -h / 2 - 1, w, h); g.restore();
        l.href = c.toDataURL('image/png');
      };
      im.src = 'img/wynntools-logo.png';
    },
  };
})(window.W);
