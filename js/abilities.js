/* Ability tree of one character: the class's full map from the API, with the character's unlocked nodes lit up. */
(function (W) {
  const { el } = W;
  const NODE_COLOURS = { white: '#e8e8e8', yellow: '#f7d25e', purple: '#c58cff', red: '#ff7b6b', blue: '#6fb6ff', green: '#7fe08f' };
  const text = (html) => {
    if (Array.isArray(html)) return html.map(text).join('\n');
    return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.replace(/\s+\n/g, '\n').trim();
  };
  const nodeColour = (icon) => {
    const n = String((icon && icon.value && icon.value.name) || icon || '').toLowerCase();
    const k = Object.keys(NODE_COLOURS).find(c => n.includes('node' + c));
    return k ? NODE_COLOURS[k] : '#55ffff';   // class-coloured nodes are the spells
  };

  W.abilityTree = (playerUuid, charId, cls) => {
    const box = el('div', {}, el('p', { class: 'empty' }, 'Loading the ability tree…'));
    const win = W.win('Ability tree', box);
    Promise.all([
      W.api(`player/${playerUuid}/characters/${charId}/abilities`),
      W.api(`ability/tree/${cls}`),
      W.api(`ability/map/${cls}`),
    ]).then(([mine, tree, map]) => {
      const on = new Set();
      Object.values(mine || {}).flat().forEach(n => on.add(`${n.meta && n.meta.page}:${n.coordinates.x}:${n.coordinates.y}`));
      const abilities = {};
      Object.values(tree.pages || {}).forEach(p => Object.entries(p).forEach(([id, a]) => { abilities[id] = a; }));
      const unlocked = Object.values(mine || {}).flat().filter(n => n.type === 'ability').map(n => n.meta && n.meta.id).filter(Boolean);
      const points = unlocked.reduce((s, id) => s + ((abilities[id] && abilities[id].requirements && abilities[id].requirements.ABILITY_POINTS) || 0), 0);
      const archetypes = Object.entries(tree.archetypes || {}).map(([k, a]) => {
        const name = text(a.name);
        const n = unlocked.filter(id => abilities[id] && text(abilities[id].description).includes(name + ' Archetype')).length;
        return [name, n];
      });
      const pages = Object.keys(map).sort((a, b) => +a - +b);
      let page = pages[0];
      const grid = el('div', {});
      const drawPage = () => {
        const nodes = map[page] || [];
        const ys = nodes.map(n => n.coordinates.y), y0 = Math.min(...ys);
        const rows = Math.max(...ys) - y0 + 1;
        grid.replaceChildren(
          el('div', { class: 'tabsmall' }, pages.map(p => el('button', { class: 'mini' + (p === page ? ' on' : ''), onclick: () => { page = p; drawPage(); } }, 'Page ' + p))),
          el('div', { class: 'atree', style: { gridTemplateRows: `repeat(${rows}, 44px)` } }, nodes.map(n => {
            const lit = on.has(`${page}:${n.coordinates.x}:${n.coordinates.y}`);
            const pos = { gridColumn: n.coordinates.x, gridRow: n.coordinates.y - y0 + 1 };
            if (n.type === 'connector') {
              const dirs = String(n.meta && n.meta.icon || '').replace('connector_', '').split('_');
              return el('div', { class: 'acon' + (lit ? ' lit' : ''), style: pos }, dirs.map(d => el('i', { class: 'd-' + d })));
            }
            const a = abilities[n.meta && n.meta.id] || {};
            return W.tip(el('div', { class: 'anode' + (lit ? ' lit' : ''), style: { ...pos, '--nc': nodeColour(n.meta && n.meta.icon) } }),
              () => el('div', {}, el('div', { class: 'tt-name' }, text(a.name) || n.meta.id), el('div', { class: 'tt-sub' }, lit ? 'Unlocked' : 'Not taken'),
                el('div', { class: 'tt-g', style: { whiteSpace: 'pre-line', maxWidth: '320px' } }, text(a.description))));
          })));
      };
      drawPage();
      box.replaceChildren(
        el('div', { class: 'kv wide' },
          el('div', {}, el('span', {}, 'Abilities unlocked'), el('b', {}, unlocked.length)),
          el('div', {}, el('span', {}, 'Ability points used'), el('b', {}, points)),
          archetypes.map(([n, c]) => el('div', {}, el('span', {}, n), el('b', {}, c)))),
        grid,
        el('p', { class: 'hint' }, 'Bright nodes are unlocked. Hover any node for its description.'));
    }).catch(e => {
      box.replaceChildren(el('p', { class: 'empty' }, /403/.test(e.message) || /restricted|forbidden/i.test(e.message)
        ? 'This player keeps their ability tree private.' : 'Couldn’t load the ability tree: ' + e.message));
    });
    return win;
  };
})(window.W);
