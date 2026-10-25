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
    favicon() {
      const l = document.createElement('link');
      l.rel = 'icon'; l.href = 'img/wynntools-logo.png';
      document.head.append(l);
    },
  };
})(window.W);
