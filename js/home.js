(function (W) {
  const { el } = W;
  const CARDS = [
    ['mounts', 'Mounts', 'flute', 'ui', 'Stable, breeding predictions, lineage plans, feeding and training.', 'c-mounts'],
    ['items', 'Items', 'weaponsmithing', 'wiki', 'Search every item by stats and compare them side by side.', 'c-items'],
    ['crafting', 'Crafting', 'alchemism', 'wiki', 'Lay out ingredients and see what the craft will roll.', 'c-craft'],
    ['professions', 'Professions', 'mining', 'wiki', 'XP needed to your next level and what you can gather.', 'c-prof'],
    ['players', 'Players', 'warrior', 'wiki', 'Look up a player, compare two, and track quests.', 'c-players'],
    ['guilds', 'Guilds', 'guild-banner-tier-3', 'wiki', 'Guild members, ranks and who holds which territory.', 'c-guilds'],
  ];
  W.pages['home/home'] = function (root) {
    root.replaceChildren(
      el('div', { class: 'hero' }, CARDS.map(([k, name, icon, kind, text, cls]) =>
        el('a', { class: 'hcard ' + cls, href: '#' + k },
          el('div', { class: 'htitle' }, name),
          el('div', { class: 'hart' }, W.art[kind](icon)),
          el('p', {}, text)))),
      el('div', { class: 'cols' },
        W.win('Quick start', el('ul', { class: 'rules' },
          el('li', {}, el('b', {}, 'Breeding a mount? '), 'Paste it from Wynntils in ', el('a', { href: '#mounts/stable' }, 'Mounts › Stable'), ', then try pairs in ', el('a', { href: '#mounts/pairs' }, 'Pair Finder'), '.'),
          el('li', {}, el('b', {}, 'Building gear? '), el('a', { href: '#items/search' }, 'Items › Search'), ' filters every item by type, level, class and identification.'),
          el('li', {}, el('b', {}, 'Crafting? '), el('a', { href: '#crafting/combiner' }, 'Ingredient Combiner'), ' shows effectiveness from ingredient placement.'),
          el('li', {}, el('b', {}, 'Levelling a profession? '), el('a', { href: '#professions/xp' }, 'XP Calculator'), ' counts the XP and gathers you still need.'))),
        W.win('About the data', el('p', {}, 'Items, ingredients and materials come from the data Wynntils publishes for its mod and are refreshed by a weekly job. Player and guild pages ask the official Wynncraft API live. Everything you enter here stays in your own browser.'),
          el('p', { class: 'hint', id: 'built' }, ''))));
    W.data('meta').then(m => { const b = root.querySelector('#built'); if (b) b.textContent = 'Game data last updated ' + m.built + '.'; }).catch(() => {});
  };
})(window.W);
