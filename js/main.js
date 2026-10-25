(function (W) {
  const { el } = W;
  const mountIcon = () => W.art.ui('flute');
  W.SECTIONS = [
    { k: 'home', name: 'Home', icon: () => W.art.wiki('emeraldicon'), pages: [['home', 'Home']] },
    { k: 'mounts', name: 'Mounts', icon: mountIcon, pages: [
      ['stable', 'Stable'], ['feeder', 'Feeder'], ['pairs', 'Pair Finder'], ['lineage', 'Lineage'], ['cookbook', 'Cookbook'],
      ['training', 'Training'], ['timers', 'Timers'], ['market', 'Market'], ['want', 'Wanted'], ['ledger', 'Ledger'], ['almanac', 'Almanac']] },
    { k: 'items', name: 'Items', icon: () => W.art.wiki('weaponsmithing'), pages: [['search', 'Search'], ['compare', 'Compare']] },
    { k: 'crafting', name: 'Crafting', icon: () => W.art.wiki('alchemism'), pages: [['combiner', 'Ingredient Combiner'], ['ingredients', 'Ingredients']] },
    { k: 'professions', name: 'Professions', icon: () => W.art.wiki('mining'), pages: [['xp', 'XP Calculator'], ['spots', 'Grinding Spots'], ['gathering', 'Gathering']] },
    { k: 'players', name: 'Players', icon: () => W.art.wiki('warrior'), pages: [['lookup', 'Lookup'], ['compare', 'Compare'], ['quests', 'Quest Checklist']] },
    { k: 'guilds', name: 'Guilds', icon: () => W.art.wiki('guild-banner-tier-3'), pages: [['lookup', 'Lookup'], ['territories', 'Territories']] },
  ];
  /* Old Paddock links (#stable, #want?…, #player?…) keep working. */
  const LEGACY = { player: 'players/lookup' };
  W.SECTIONS[1].pages.forEach(([p]) => { LEGACY[p] = 'mounts/' + p; });

  W.go = (path) => { location.hash = path.includes('/') ? path : (LEGACY[path] || 'mounts/' + path); };

  let cleanup = [];
  W.onLeave = (fn) => cleanup.push(fn);

  function parse() {
    let [path, q] = location.hash.slice(1).split('?');
    if (LEGACY[path]) path = LEGACY[path];
    let [sk, pk] = (path || 'home').split('/');
    const sec = W.SECTIONS.find(s => s.k === sk) || W.SECTIONS[0];
    if (!sec.pages.some(p => p[0] === pk)) pk = sec.pages[0][0];
    return { sec, pk, q: new URLSearchParams(q || '') };
  }

  function route() {
    cleanup.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); cleanup = [];
    const { sec, pk, q } = parse();
    document.getElementById('tabs').replaceChildren(...W.SECTIONS.map(s =>
      el('a', { href: '#' + s.k, class: 'tab' + (s === sec ? ' on' : '') }, s.icon(), el('span', {}, s.name))));
    const sub = document.getElementById('subtabs');
    sub.replaceChildren(...(sec.pages.length > 1 ? sec.pages.map(([k, label]) =>
      el('a', { href: `#${sec.k}/${k}`, class: 'sub' + (k === pk ? ' on' : '') }, label)) : []));
    sub.hidden = sec.pages.length < 2;
    const main = document.getElementById('main');
    main.replaceChildren();
    const fn = W.pages[`${sec.k}/${pk}`] || W.pages[pk];
    fn(main, q);
    const label = sec.pages.find(p => p[0] === pk)[1];
    document.title = sec.k === 'home' ? 'Wynntools' : `${label} · ${sec.name} · Wynntools`;
    window.scrollTo(0, 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    W.load(); W.art.favicon(); W.themes.init();
    window.addEventListener('hashchange', route);
    route();
  });
})(window.W);
