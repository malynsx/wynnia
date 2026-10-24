/* Image helpers. Mount renders and icons are from the Wynncraft Wiki (img/). */
(function (W) {
  const img = (src, alt = '') => {
    const i = document.createElement('img');
    i.src = src; i.alt = alt; i.className = 'sprite'; i.draggable = false;
    return i;
  };
  const slug = (s) => String(s).toLowerCase();
  W.art = {
    mountUrl: (type, c1, c2) => `img/mounts/${slug(type)}-${slug(c1)}-${slug(c2)}.webp`,
    mount: (type, c1, c2) => img(W.art.mountUrl(type, c1, c2), `${c1}-${c2} ${type}`),
    mat: (k) => img(`img/ui/mat-${k}.webp`, k),
    stat: (k) => img(`img/ui/${{ jump: 'jump-height', accel: 'acceleration' }[k] || k}.webp`, k),
    ui: (name) => img(`img/ui/${name}.webp`, name),
    favicon() {
      const l = document.createElement('link');
      l.rel = 'icon'; l.href = 'img/logo.svg';
      document.head.append(l);
    },
  };
})(window.W);
