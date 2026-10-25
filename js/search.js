/* Quick search in the header: pages, items, ingredients, guilds, and a player lookup. */
(function (W) {
  const { el } = W;
  let items = null, ings = null, guilds = null;
  const load = () => {
    if (items) return;
    items = []; ings = []; guilds = [];
    W.data('items').then(d => { items = d; }).catch(() => {});
    W.data('ingredients').then(d => { ings = d; }).catch(() => {});
    W.data('territories').then(d => { guilds = [...new Set(d.map(t => t.g).filter(Boolean))]; }).catch(() => {});
  };

  W.initSearch = () => {
    const box = document.getElementById('qs');
    const input = el('input', { type: 'search', placeholder: 'Search items, players, guilds…', 'aria-label': 'Search', autocomplete: 'off' });
    const list = el('div', { class: 'qsresults', hidden: true });
    box.replaceChildren(input, list);
    let results = [], active = 0;

    const go = (r) => { if (!r) return; location.hash = r.href; input.value = ''; list.hidden = true; input.blur(); };
    const render = () => {
      list.replaceChildren(...results.map((r, i) => el('a', { class: 'qsr' + (i === active ? ' on' : ''), href: '#' + r.href, onclick: (e) => { e.preventDefault(); go(r); } },
        el('span', { class: 'qsi' }, r.icon || ''), el('span', {}, el('b', {}, r.label), el('small', {}, r.kind)))));
      list.hidden = !results.length;
    };
    const search = () => {
      const q = input.value.trim(), ql = q.toLowerCase();
      results = []; active = 0;
      if (q.length < 2) { render(); return; }
      W.SECTIONS.forEach(s => s.pages.forEach(([k, label]) => {
        if (label.toLowerCase().includes(ql) || (s.name.toLowerCase().includes(ql) && k === s.pages[0][0])) results.push({ href: `${s.k}/${k}`, label, kind: s.name, icon: s.icon() });
      }));
      results = results.slice(0, 3);
      if (/^[A-Za-z0-9_]{3,16}$/.test(q)) results.push({ href: 'players/lookup?u=' + encodeURIComponent(q), label: `Look up player “${q}”`, kind: 'Player', icon: W.art.wiki('warrior') });
      (items || []).filter(i => i.n.toLowerCase().includes(ql)).sort((a, b) => a.n.toLowerCase().indexOf(ql) - b.n.toLowerCase().indexOf(ql)).slice(0, 5)
        .forEach(i => results.push({ href: 'items/search?q=' + encodeURIComponent(i.n), label: i.n, kind: `${(W.TIERS[i.r] || ['Item'])[0]} ${W.cap(i.t)} · Lv. ${i.l}`, icon: W.art.item(i.ic) }));
      (ings || []).filter(g => g.n.toLowerCase().includes(ql)).slice(0, 3)
        .forEach(g => results.push({ href: 'crafting/ingredients?q=' + encodeURIComponent(g.n), label: g.n, kind: `Ingredient · Lv. ${g.l}`, icon: W.art.ing(g.ic) }));
      (guilds || []).filter(g => g.toLowerCase().includes(ql)).slice(0, 3)
        .forEach(g => results.push({ href: 'guilds/lookup?g=' + encodeURIComponent(g), label: g, kind: 'Guild', icon: W.art.wiki('guild-banner-tier-3') }));
      render();
    };
    input.addEventListener('focus', load);
    input.addEventListener('input', search);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') go(results[active]);
      else if (e.key === 'Escape') { list.hidden = true; input.blur(); }
    });
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) list.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); input.focus(); } });
  };
})(window.W);
