(function (W) {
  const { el } = W;
  const mountIcon = () => W.art.ui('flute');
  W.SECTIONS = [
    { k: 'home', name: 'Home', icon: () => W.art.wiki('emeraldicon'), pages: [['home', 'Home'], ['api', 'API']] },
    { k: 'mounts', name: 'Mounts', icon: mountIcon, pages: [
      ['stable', 'Stable'], ['feeder', 'Feeder'], ['pairs', 'Pair Finder'], ['lineage', 'Lineage'], ['cookbook', 'Cookbook'],
      ['training', 'Training'], ['timers', 'Timers'], ['market', 'Market'], ['want', 'Wanted'], ['ledger', 'Ledger'], ['almanac', 'Almanac']] },
    { k: 'items', name: 'Items', icon: () => W.art.wiki('weaponsmithing'), pages: [['search', 'Search'], ['compare', 'Compare'], ['loadout', 'Loadout Builder'], ['recommend', 'Recommended Build']] },
    { k: 'crafting', name: 'Crafting', icon: () => W.art.wiki('alchemism'), pages: [['combiner', 'Ingredient Combiner'], ['finder', 'Ingredient Finder'], ['ingredients', 'Ingredients']] },
    { k: 'professions', name: 'Professions', icon: () => W.art.wiki('mining'), pages: [['xp', 'XP Calculator'], ['spots', 'Grinding Spots'], ['materials', 'Material Calculator'], ['gathering', 'Gathering']] },
    { k: 'players', name: 'Players', icon: () => W.art.wiki('warrior'), pages: [['lookup', 'Lookup'], ['compare', 'Compare'], ['watchlist', 'Watchlist'], ['leaderboards', 'Leaderboards'], ['quests', 'Quest Checklist']] },
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

  /* each section wears a Wynncraft rank colour: VIP, VIP+, HERO, HERO+, CHAMPION (plus stone and amber) */
  const SEC_COLOR = { home: 'var(--r-stone)', mounts: 'var(--r-vip)', items: 'var(--r-vipp)', crafting: 'var(--r-hero)', professions: 'var(--r-amber)', players: 'var(--r-herop)', guilds: 'var(--r-champ)' };
  let last = null;   // where we were, so the new page can slide in from the side of the tab you clicked
  function route() {
    cleanup.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); cleanup = [];
    /* short share links (#s/abc1234) resolve through the relay, then open the real page */
    const short = /^#s\/([A-Za-z0-9]{4,12})$/.exec(location.hash);
    if (short) {
      document.getElementById('main').replaceChildren(el('div', { class: 'page' }, W.win('Opening link', el('p', { class: 'empty' }, 'Looking up that short link…'))));
      W.resolveShort(short[1]).then(h => { history.replaceState(null, '', h); route(); })
        .catch(e => document.getElementById('main').replaceChildren(el('div', { class: 'page' }, W.win('Link not found', el('div', { class: 'warn' }, e.message)))));
      return;
    }
    const { sec, pk, q } = parse();
    const si = W.SECTIONS.indexOf(sec), pi = sec.pages.findIndex(p => p[0] === pk);
    const dir = !last ? '' : si !== last.si ? (si > last.si ? 'r' : 'l') : pi !== last.pi ? (pi > last.pi ? 'r' : 'l') : '';
    const newSec = !last || si !== last.si, newPage = newSec || pi !== last.pi;
    last = { si, pi };
    document.getElementById('tabs').replaceChildren(...W.SECTIONS.map(s =>
      el('a', { href: '#' + s.k, class: 'tab' + (s === sec ? ' on' + (newSec ? ' pop' : '') : ''), style: { '--tc': SEC_COLOR[s.k] } }, s.icon(), el('span', {}, s.name))));
    document.body.dataset.sec = sec.k;   // panels, sub-tabs and main buttons take this section's rank colour
    const sub = document.getElementById('subtabs');
    sub.replaceChildren(...(sec.pages.length > 1 ? sec.pages.map(([k, label]) =>
      el('a', { href: `#${sec.k}/${k}`, class: 'sub' + (k === pk ? ' on' + (newPage ? ' pop' : '') : '') }, label)) : []));
    sub.hidden = sec.pages.length < 2;
    /* Each visit gets a fresh container, so a slow page that finishes loading after you've moved on draws into nothing. */
    const main = document.getElementById('main'), page = el('div', { class: 'page' + (newPage ? ' enter' + (dir ? ' from-' + dir : '') : '') });
    main.replaceChildren(page);
    const fn = W.pages[`${sec.k}/${pk}`] || W.pages[pk];
    fn(page, q);
    const label = sec.pages.find(p => p[0] === pk)[1];
    document.title = sec.k === 'home' ? 'Wynnia' : `${label} · ${sec.name} · Wynnia`;
    window.scrollTo(0, 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    W.load(); W.art.favicon(); W.themes.init(); W.initSearch();
    window.addEventListener('hashchange', route);
    route();
  });
})(window.W);
