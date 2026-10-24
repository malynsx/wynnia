(function (W) {
  const TABS = [
    ['stable', 'Stable', () => W.art.ui('saddleicon')],
    ['feeder', 'Feeder', () => W.art.mat('grain')],
    ['lineage', 'Lineage', () => W.art.mat('gem')],
    ['cookbook', 'Cookbook', () => W.art.mat('meat')],
    ['training', 'Training', () => W.art.stat('speed')],
    ['almanac', 'Almanac', () => W.art.mat('paper')],
    ['ledger', 'Ledger', () => W.art.mat('plank')],
  ];
  W.go = (name) => { location.hash = name; };
  function route() {
    const name = TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'stable';
    const nav = document.getElementById('tabs'), main = document.getElementById('main');
    nav.replaceChildren(...TABS.map(([k, label, icon]) => W.el('a', { href: '#' + k, class: 'tab' + (k === name ? ' on' : '') }, icon(), W.el('span', {}, label))));
    main.replaceChildren();
    W.pages[name](main);
    document.title = `${TABS.find(t => t[0] === name)[1]} · Paddock`;
  }
  document.addEventListener('DOMContentLoaded', () => {
    W.load(); W.art.favicon();
    window.addEventListener('hashchange', route);
    route();
  });
})(window.W);
