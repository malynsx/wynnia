/* Players > Next Steps: a plan for one character from their own Wynncraft API data. Quests they can do now, raids
   they've unlocked (or what's missing), caves around their level, the next gathering resource and crafting level for
   each profession, and links to a recommended build. */
(function (W) {
  const { el } = W;
  const PS = { name: '', data: null, char: '', err: null, busy: false };
  const qkey = (n) => String(n).toLowerCase().replace(/^realm of light [ivx]+ - /, '').replace(/[^a-z0-9]/g, '');
  const clsName = (c) => { const t = String(c.reskin || c.type || ''); return t.charAt(0) + t.slice(1).toLowerCase(); };
  const GATHER = ['mining', 'woodcutting', 'farming', 'fishing'];
  const CRAFT_TYPES = { armouring: ['helmet', 'chestplate'], tailoring: ['leggings', 'boots'], weaponsmithing: ['spear', 'dagger'], woodworking: ['bow', 'wand', 'relik'],
    jeweling: ['ring', 'bracelet', 'necklace'], alchemism: ['potion'], cooking: ['food'], scribing: ['scroll'] };
  const raidIcon = (n) => 'img/guide/' + (n.replace(/[^A-Za-z']/g, '') + 'Icon').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';

  W.pages['players/plan'] = function (root, q) {
    if (q && q.get('u') && (!PS.data || PS.data.username.toLowerCase() !== q.get('u').toLowerCase()) && !PS.busy) { PS.name = q.get('u'); PS.want = q.get('c'); setTimeout(go, 0); }
    let draw = () => {};   // set once the data files are in; go() may finish before that
    W.withData(root, ['quests', 'guides', 'world', 'nodes', 'recipes'], (quests, guides, world, nodes, recipes) => {
      draw = () => { if (root.isConnected) root.replaceChildren(el('div', { class: 'stack' }, form(), plan())); };
      draw();

      function form() {
        const inp = el('input', { type: 'text', value: PS.name, placeholder: 'Username', maxlength: 16, oninput: (e) => { PS.name = e.target.value.trim(); }, onkeydown: (e) => { if (e.key === 'Enter') go(); } });
        const chars = PS.data ? Object.entries(PS.data.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0)) : [];
        return W.win('Next steps',
          el('div', { class: 'search' }, inp, el('button', { onclick: go }, 'Make a plan')),
          el('p', { class: 'hint' }, 'Reads a character from the Wynncraft API and lists what to do next: quests, raids, caves, professions and gear.'),
          PS.busy ? el('p', { class: 'empty' }, 'Asking the Wynncraft API…') : null,
          PS.err ? el('div', { class: 'warn' }, PS.err) : null,
          chars.length > 1 ? el('div', { class: 'form row' }, el('label', {}, 'Character', W.sel(chars.map(([id, c]) => [id, `${c.nickname ? c.nickname + " · " : ""}${clsName(c)} Lv. ${c.level}`]), PS.char, (v) => { PS.char = v; draw(); }))) : null);
      }

      function plan() {
        const c = PS.data && PS.data.characters && PS.data.characters[PS.char];
        if (!c) return null;
        const lvl = c.level || 1, u = PS.data.username;
        const doneQ = new Set((c.quests || []).map(qkey));
        const openQ = quests.filter(x => !doneQ.has(qkey(x.n)) && x.l <= lvl).sort((a, b) => b.l - a.l);
        const nextQ = quests.filter(x => !doneQ.has(qkey(x.n)) && x.l > lvl).sort((a, b) => a.l - b.l)[0];
        const raidDone = (c.raids && c.raids.list) || {};
        const raids = guides.raids.map(r => {
          const needQuest = r.quest && !doneQ.has(qkey(r.quest));
          return { r, runs: raidDone[r.n] || 0, state: lvl < r.lvl ? 'level' : needQuest ? 'quest' : 'open' };
        });
        const caves = world.caves.filter(x => x.lvl != null && x.x != null && x.lvl <= lvl + 3).sort((a, b) => Math.abs(a.lvl - lvl) - Math.abs(b.lvl - lvl)).slice(0, 6);
        const prof = c.professions || {};
        const gather = GATHER.map(p => {
          const pl = (prof[p] || {}).level || 1, res = Object.entries(nodes[p] || {}).map(([r, d]) => ({ r, l: d.l })).sort((a, b) => a.l - b.l);
          const best = res.filter(x => x.l <= pl).pop(), next = res.find(x => x.l > pl);
          return { p, pl, best, next };
        });
        const craft = Object.entries(CRAFT_TYPES).map(([p, types]) => {
          const pl = (prof[p] || {}).level || 1;
          const brackets = [...new Set(recipes.filter(r => r.s === p && types.includes(r.t)).map(r => r.l[0]))].sort((a, b) => a - b);
          return { p, pl, next: brackets.find(b => b > pl) };
        });

        /* the short list at the top */
        const todo = [];
        const firstRaid = raids.find(x => x.state === 'open' && !x.runs);
        if (firstRaid) todo.push(['raid', `Try ${firstRaid.r.n}`, `Unlocked and not done yet on this character.`, '#world/raids']);
        const soonRaid = raids.find(x => x.state !== 'open');
        if (soonRaid) {
          const gate = soonRaid.state === 'quest' && quests.find(x => qkey(x.n) === qkey(soonRaid.r.quest));
          todo.push(['raid', soonRaid.state === 'level' ? `${soonRaid.r.n} at level ${soonRaid.r.lvl}` : `Finish ${soonRaid.r.quest}`,
            soonRaid.state === 'level' ? `${soonRaid.r.lvl - lvl} levels to go.` : gate && gate.l > lvl ? `Opens ${soonRaid.r.n}. The quest unlocks at level ${gate.l}.` : `Needed to enter ${soonRaid.r.n}.`, '#world/raids']);
        }
        openQ.slice(0, 2).forEach(x => todo.push(['quest', x.n, `Level ${x.l} quest${x.len ? ' · ' + x.len : ''}${x.p ? ' · ' + x.p : ''}`, 'https://wynncraft.wiki.gg/wiki/' + encodeURIComponent(x.n.replace(/ /g, '_'))]));
        const g = gather.filter(x => x.next).sort((a, b) => (a.next.l - a.pl) - (b.next.l - b.pl))[0];
        if (g) todo.push(['prof', `${W.cap(g.next.r)} at ${W.cap(g.p)} ${g.next.l}`, `${g.next.l - g.pl} ${W.cap(g.p)} levels away.`, '#world/map?m=professions']);
        todo.push(['gear', 'Check your gear', 'Get a recommended build for this character’s archetype.', `#items/recommend?u=${encodeURIComponent(u)}&c=${encodeURIComponent(PS.char)}`]);
        const ICON = { raid: raidIcon(guides.raids[0].n), quest: 'img/wiki/questbook.webp', prof: 'img/wiki/mining.webp', gear: 'img/wiki/weaponsmithing.webp' };

        return el('div', { class: 'stack' },
          el('section', { class: 'plancard' },
            el('img', { class: 'planhead', src: `https://mc-heads.net/avatar/${PS.data.uuid}/80`, alt: '', width: 80, height: 80 }),
            el('div', {},
              el('h2', {}, c.nickname || u, el('small', {}, `${clsName(c)} · Level ${lvl}`)),
              el('div', { class: 'glevel' }, el('b', {}, `Lv. ${lvl}`), el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: (c.xpPercent || 0) + '%', '--c': 'var(--gold)' } })), el('span', {}, (c.xpPercent || 0) + '% to ' + (lvl + 1))),
              el('div', { class: 'herometa' }, el('span', {}, `${(c.quests || []).length} quests done`), el('span', {}, `Total level ${c.totalLevel || '—'}`), el('span', {}, `${Math.round(c.playtime || 0)} h played`)))),
          W.win('Do next', el('div', { class: 'todolist' }, todo.map(([kind, title, sub, href]) => el('a', { class: 'todo', href, target: href.startsWith('http') ? '_blank' : null, rel: href.startsWith('http') ? 'noopener' : null },
            el('img', { src: ICON[kind], alt: '' }), el('div', {}, el('b', {}, title), el('small', {}, sub)))))),
          el('div', { class: 'cols' },
            el('div', { class: 'stack' },
              W.win(`Quests you can do · ${openQ.length}`,
                openQ.length ? el('div', { class: 'planlist' }, openQ.slice(0, 10).map(x => el('a', { class: 'planrow', href: 'https://wynncraft.wiki.gg/wiki/' + encodeURIComponent(x.n.replace(/ /g, '_')), target: '_blank', rel: 'noopener' },
                  el('span', { class: 'plv' }, x.l), el('b', {}, x.n), el('small', {}, [x.len, x.p].filter(Boolean).join(' · '))))) : el('p', { class: 'empty' }, 'Every quest up to this level is done.'),
                nextQ ? el('p', { class: 'hint' }, `Next one unlocks at level ${nextQ.l}: ${nextQ.n}.`) : null,
                el('a', { class: 'btnlink mini', href: `#players/quests?u=${encodeURIComponent(u)}&c=${encodeURIComponent(PS.char)}` }, 'Full quest checklist')),
              W.win('Caves around your level', el('div', { class: 'planlist' }, caves.map(x => el('a', { class: 'planrow', href: `#world/map?m=world&p=${x.x}_${x.z}_${encodeURIComponent(x.n)}&v=${x.x},${x.z},0.5` },
                el('span', { class: 'plv' }, x.lvl), el('b', {}, x.n), el('small', {}, `${W.cap(x.diff || '')} · ${W.cap(x.len || '')}`)))),
                el('p', { class: 'hint' }, 'The API counts caves but doesn’t say which, so these are the closest to your level. Click one to see it on the map.'))),
            el('div', { class: 'stack' },
              W.win('Raids', el('div', { class: 'planlist' }, raids.map(x => el('div', { class: 'planrow raid ' + x.state },
                el('img', { src: raidIcon(x.r.n), alt: '' }), el('b', {}, x.r.n),
                el('small', {}, x.state === 'open' ? (x.runs ? `Done ${x.runs}×` : 'Unlocked, not done yet') : x.state === 'level' ? `Level ${x.r.lvl} (${x.r.lvl - lvl} to go)` : `Needs the quest ${x.r.quest}`))))),
              W.win('Professions',
                el('div', { class: 'cap left', style: { marginTop: 0 } }, 'Gathering'),
                el('div', { class: 'planlist' }, gather.map(x => el('div', { class: 'planrow' }, el('span', { class: 'plv' }, x.pl), el('b', {}, W.cap(x.p)),
                  el('small', {}, [x.best ? `Best now: ${W.cap(x.best.r)}` : null, x.next ? `${W.cap(x.next.r)} at ${x.next.l}` : 'Every resource unlocked'].filter(Boolean).join(' · '))))),
                el('div', { class: 'cap left' }, 'Crafting'),
                el('div', { class: 'planlist' }, craft.map(x => el('div', { class: 'planrow' }, el('span', { class: 'plv' }, x.pl), el('b', {}, W.cap(x.p)),
                  el('small', {}, x.next ? `Next recipes at level ${x.next}` : 'Every recipe unlocked')))),
                el('a', { class: 'btnlink mini', href: '#professions/xp' }, 'Profession XP planner')),
              W.win('Gear', el('div', { class: 'btns', style: { marginTop: 0 } },
                el('a', { class: 'btnlink', href: `#items/recommend?u=${encodeURIComponent(u)}&c=${encodeURIComponent(PS.char)}` }, 'Recommended build'),
                el('a', { class: 'btnlink', href: `#items/loadout?u=${encodeURIComponent(u)}&c=${encodeURIComponent(PS.char)}` }, 'Open in Loadout Builder'))))));
      }
    });

    async function go() {
      if (!PS.name) return;
      PS.busy = true; PS.err = null; draw();
      try {
        const d = await W.api(`player/${encodeURIComponent(PS.name)}?fullResult`);
        if (d.multiple) throw new Error('That name matches several players. Use the exact name.');
        PS.data = d;
        const chars = Object.entries(d.characters || {}).sort((a, b) => (b[1].level || 0) - (a[1].level || 0));
        PS.char = PS.want && d.characters[PS.want] ? PS.want : d.activeCharacter && d.characters[d.activeCharacter] ? d.activeCharacter : (chars[0] || [''])[0];
        if (!chars.length) throw new Error('That player’s characters are private or they have none.');
        history.replaceState(null, '', `#players/plan?u=${encodeURIComponent(d.username)}`);
      } catch (e) { PS.err = e.message; PS.data = null; }
      PS.busy = false; draw();
    }
  };
})(window.W);
