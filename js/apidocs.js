/* Documentation for the static Wynnia API (api/v1, rebuilt weekly by tools/build_data.py). */
(function (W) {
  const { el } = W;
  const BASE = 'https://malynsx.github.io/wynnia/api/v1/';
  const ENDPOINTS = [
    ['index.json', 'Lists every endpoint and when the data was last rebuilt.'],
    ['items.json', 'Every gear item: name, type, rarity, level, class, skill requirements, base stats, identifications (fixed number or [min, max]), major IDs, powder slots, icon URL.'],
    ['item/{slug}.json', 'One item. The slug is the name in lower case with dashes, e.g. item/nirvana.json or item/a16-l31-handheld-mortar.json.'],
    ['ingredients.json', 'Every ingredient: stars, level, professions, identifications, item-only and consumable-only values, position modifiers, icon URL.'],
    ['ingredient/{slug}.json', 'One ingredient, same slug rule.'],
    ['materials.json', 'Gathering materials with their profession and level.'],
    ['recipes.json', 'Crafting recipes: profession, item type, level range, base durability, health or damage, duration, XP and materials.'],
    ['quests.json', 'Quest list from the wiki with level, length and province.'],
    ['spots.json', 'Densest gathering node clusters for every material, with area name and coordinates.'],
    ['olinus-spots.json', 'Olinus10’s recommended gathering spots per profession and level bracket.'],
    ['territories.json', 'Territory owners at the time of the last rebuild.'],
    ['profession-xp.json', 'XP needed for each profession level (index 0 = level 1 to 2).'],
    ['major-ids.json', 'Every major ID with its in-game description (HTML with Wynncraft colours).'],
  ];

  W.pages['home/api'] = function (root) {
    const out = el('pre', { class: 'apiout' }, 'Press “Try it” on any endpoint.');
    const tryIt = async (path) => {
      out.textContent = 'Loading ' + path + '…';
      try {
        const real = path.replace('{slug}', 'nirvana');
        const r = await fetch('api/v1/' + real);
        const j = await r.json();
        const txt = JSON.stringify(Array.isArray(j) ? j.slice(0, 2) : j, null, 2);
        out.textContent = (Array.isArray(j) ? `// ${j.length} entries, first 2 shown\n` : '') + txt.slice(0, 4000);
      } catch (e) { out.textContent = 'Failed: ' + e.message; }
    };
    root.replaceChildren(el('div', { class: 'cols wide-l' },
      el('div', {},
        W.win('Wynnia API',
          el('p', {}, 'Free, read-only JSON for your own tools, bots and sites. It’s plain files on GitHub Pages, so you can call it from a browser or a server with no key, and CORS is open.'),
          el('div', { class: 'cap left' }, 'Base URL'), el('code', { class: 'apibase' }, BASE),
          el('div', { class: 'apilist' }, ENDPOINTS.map(([p, d]) => el('div', { class: 'apirow' },
            el('div', {}, el('code', {}, p), el('p', {}, d)),
            el('button', { class: 'mini', onclick: () => tryIt(p) }, 'Try it'))))),
        W.win('Example', el('pre', { class: 'apiout' }, `const items = await fetch('${BASE}items.json').then(r => r.json());\nconst mythics = items.filter(i => i.rarity === 'mythic');\nconsole.log(mythics.length, 'mythics');`))),
      el('div', {},
        W.win('Response', out),
        W.win('Good to know', el('ul', { class: 'rules' },
          el('li', {}, 'Data is rebuilt every Monday from Wynntils’ published game data, the Wynncraft item guide and the wiki.'),
          el('li', {}, 'Identification values use the official API names (rawStrength, spellDamage, …). Ranges are [min, max].'),
          el('li', {}, 'Please cache responses on your side; the files only change weekly.'),
          el('li', {}, 'Live player and guild data isn’t mirrored here; use the official Wynncraft API for that.'))))));
  };
})(window.W);
