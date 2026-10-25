/* Loadout builder: pick or paste (Wynntils) the 9 equipment pieces, see totals, skill point needs, and share a link. */
(function (W) {
  const { el } = W;
  const SLOTS = [
    ['h', 'Helmet', ['helmet']], ['c', 'Chestplate', ['chestplate']], ['l', 'Leggings', ['leggings']], ['b', 'Boots', ['boots']],
    ['r1', 'Ring', ['ring']], ['r2', 'Ring', ['ring']], ['br', 'Bracelet', ['bracelet']], ['n', 'Necklace', ['necklace']],
    ['w', 'Weapon', ['bow', 'spear', 'wand', 'dagger', 'relik']],
  ];
  const SKILLS = [['strength', 'rawStrength', 'Strength', 'earth'], ['dexterity', 'rawDexterity', 'Dexterity', 'thunder'],
    ['intelligence', 'rawIntelligence', 'Intelligence', 'water'], ['defence', 'rawDefence', 'Defence', 'fire'], ['agility', 'rawAgility', 'Agility', 'air']];
  const KEY = 'wt.loadout';
  const b64 = {
    enc: (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))),
  };
  /* A slot holds [name, exact rolls or null, powders or null]. */
  let LB = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || { s: {} }; } catch (e) { return { s: {} }; } })();
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(LB)); } catch (e) { /* storage blocked */ } };
  W.loadoutLink = (o) => location.href.split('#')[0] + '#items/loadout?b=' + b64.enc(o);

  W.pages['items/loadout'] = function (root, q) {
    if (q && q.get('b')) { try { LB = Object.assign({ s: {} }, b64.dec(q.get('b'))); store(); } catch (e) { /* bad link */ } }
    if (q && q.get('u')) { LB.u = q.get('u'); LB.ch = q.get('c') || null; store(); }
    let picking = null, pq = '', owner = null, ownerErr = null;
    W.withData(root, ['items', 'idkeys'], (items, idKeys) => {
      const byName = Object.fromEntries(items.map(i => [i.n, i]));
      const draw = () => root.replaceChildren(el('div', { class: 'cols wide-l' }, el('div', {}, gear(), paste(), share()), el('div', {}, summary())));
      const get = (k) => LB.s[k] && byName[LB.s[k][0]] ? { item: byName[LB.s[k][0]], roll: LB.s[k][1], pw: LB.s[k][2] } : null;

      if (LB.u && !owner) {
        W.api(`player/${encodeURIComponent(LB.u)}?fullResult`).then(d => {
          const chars = Object.entries(d.characters || {});
          const pick = chars.find(([id]) => id === LB.ch) || chars.sort((a, b) => (b[1].level || 0) - (a[1].level || 0))[0];
          owner = { name: d.username, id: pick && pick[0], char: pick && pick[1] }; draw();
        }).catch(e => { ownerErr = e.message; draw(); });
      }

      function gear() {
        return W.win('Equipment',
          LB.u ? el('p', { class: 'hint', style: { marginTop: 0 } }, owner ? `Building for ${owner.name}’s ${owner.char.nickname || W.cap(String(owner.char.reskin || owner.char.type).toLowerCase())} (Lv. ${owner.char.level}). ` : ownerErr ? `Couldn’t load ${LB.u}: ${ownerErr} ` : `Loading ${LB.u}… `,
            el('a', { href: '#items/loadout', onclick: () => { delete LB.u; delete LB.ch; owner = null; store(); } }, 'Build without a character')) : null,
          el('div', { class: 'doll' }, SLOTS.map(([k, label, types]) => {
            const g = get(k);
            return el('button', { class: 'gslot' + (picking === k ? ' on' : '') + (g ? '' : ' empty'), onclick: () => { picking = picking === k ? null : k; pq = ''; draw(); } },
              el('div', { class: 'gicon' }, g ? W.art.item(g.item.ic) : W.art.item(null)),
              el('div', { class: 'gtext' }, el('small', {}, label), g ? el('b', { style: { color: W.tierColor(g.item.r) } }, g.item.n) : el('b', {}, 'Empty'),
                g ? el('small', {}, `Lv. ${g.item.l}${g.roll ? ' · exact rolls' : ''}${g.pw && g.pw.length ? ' · ' + g.pw.length + ' powders' : ''}`) : null));
          })),
          picking ? picker() : el('p', { class: 'hint' }, 'Click a slot to choose an item, or paste your gear from Wynntils below.'),
          el('div', { class: 'btns' }, el('button', { class: 'danger', onclick: () => { LB.s = {}; store(); draw(); } }, 'Clear all')));
      }

      function picker() {
        const [, label, types] = SLOTS.find(s => s[0] === picking);
        const q = pq.trim().toLowerCase();
        const cls = owner && owner.char ? String(owner.char.type).toLowerCase() : null;
        const weaponFor = { archer: 'bow', warrior: 'spear', mage: 'wand', assassin: 'dagger', shaman: 'relik' };
        const list = items.filter(i => types.includes(i.t) && (!q || i.n.toLowerCase().includes(q)) && (picking !== 'w' || !cls || i.t === weaponFor[cls]))
          .sort((a, b) => b.l - a.l).slice(0, 60);
        const inp = el('input', { type: 'text', value: pq, placeholder: `Find a ${label.toLowerCase()}`, oninput: (e) => { pq = e.target.value; const box = root.querySelector('.gpick'); box.replaceWith(picker()); const i = root.querySelector('.gpick input'); i.focus(); i.setSelectionRange(pq.length, pq.length); } });
        return el('div', { class: 'gpick' },
          el('div', { class: 'search' }, inp, LB.s[picking] ? el('button', { class: 'danger', onclick: () => { delete LB.s[picking]; picking = null; store(); draw(); } }, 'Remove') : null),
          el('div', { class: 'pick' }, list.map(i => W.tip(el('button', { class: 'pickrow', onclick: () => { LB.s[picking] = [i.n, null, null]; picking = null; store(); draw(); } },
            el('span', { class: 'pico' }, W.art.item(i.ic)), el('span', { style: { color: W.tierColor(i.r), fontWeight: 700 } }, i.n), el('small', {}, 'Lv. ' + i.l)), () => W.itemCard(i)))));
      }

      function paste() {
        const ta = el('textarea', { rows: 3, placeholder: 'Paste Wynntils item strings here (one or several)…' });
        const out = el('div', { class: 'imp' });
        ta.addEventListener('input', () => {
          const res = WynntilsDecode.decodeGearText(ta.value, idKeys);
          out.replaceChildren(...res.map(r => {
            if (!r.ok) return el('div', { class: 'warn' }, r.error);
            const it = byName[r.gear.name];
            if (!it) return el('div', { class: 'warn' }, `“${r.gear.name}” isn’t in the item list yet.`);
            const slot = it.t === 'ring' ? (!LB.s.r1 || LB.s.r1[0] === it.n ? 'r1' : 'r2') : (SLOTS.find(s => s[2].includes(it.t)) || [])[0];
            LB.s[slot] = [it.n, r.gear.ids, r.gear.powders]; store();
            return el('div', { class: 'impRow' }, W.slot(W.art.item(it.ic)), el('div', {}, el('b', { style: { color: W.tierColor(it.r) } }, it.n), el('small', {}, `Added with ${Object.keys(r.gear.ids).length} exact rolls${r.gear.powders.length ? ' and ' + r.gear.powders.length + ' powders' : ''}.`)));
          }));
          if (res.some(r => r.ok)) setTimeout(draw, 900);
        });
        return W.win('Paste from Wynntils', el('p', { class: 'hint', style: { marginTop: 0 } }, 'In-game, share each piece you wear with Wynntils (it copies an item string) and paste them here. Exact rolls and powders are kept.'), ta, out);
      }

      function share() {
        const link = W.loadoutLink({ s: LB.s, ...(LB.u ? { u: LB.u, ch: LB.ch } : {}) });
        const box = el('input', { type: 'text', readonly: true, value: link });
        return W.win('Share this build',
          el('div', { class: 'search' }, box, el('button', { onclick: (e) => { box.select(); W.copyText(link, e.target); } }, 'Copy link')),
          el('p', { class: 'hint' }, 'The link contains every slot, exact rolls and powders, so anyone who opens it sees the same build.'));
      }

      function summary() {
        const eq = SLOTS.map(([k]) => get(k)).filter(Boolean);
        if (!eq.length) return W.win('Build summary', el('p', { class: 'empty' }, 'Add some gear to see totals.'));
        const val = (g, key) => { const v = g.roll && g.roll[key] != null ? g.roll[key] : g.item.i && g.item.i[key]; return v == null ? null : v; };
        const lo = (v) => Array.isArray(v) ? Math.min(v[0], v[1]) : v, hi = (v) => Array.isArray(v) ? Math.max(v[0], v[1]) : v;
        /* identifications */
        const ids = {};
        eq.forEach(g => Object.keys(g.item.i || {}).forEach(k => {
          const v = val(g, k); if (v == null) return;
          const s = ids[k] || [0, 0]; ids[k] = [s[0] + lo(v), s[1] + hi(v)];
        }));
        /* base stats */
        const base = {};
        eq.forEach(g => Object.entries(g.item.b || {}).forEach(([k, v]) => {
          if (/Damage/.test(k)) return;
          const s = base[k] || [0, 0]; base[k] = [s[0] + lo(v), s[1] + hi(v)];
        }));
        const health = (base.health || base.baseHealth || [0, 0]);
        const rawHp = ids.rawHealth || [0, 0];
        /* skill points: requirement minus the bonuses from every other piece (best equip order) */
        const sp = SKILLS.map(([s, bonusKey, label, elem]) => {
          const bonus = eq.map(g => lo(val(g, bonusKey) || 0));
          const total = bonus.reduce((a, b) => a + b, 0);
          const need = Math.max(0, ...eq.map((g, i) => ((g.item.q && g.item.q[s]) || 0) - (total - bonus[i])));
          const reqMax = Math.max(0, ...eq.map(g => (g.item.q && g.item.q[s]) || 0));
          const have = owner && owner.char && owner.char.skillPoints ? (owner.char.skillPoints[s === 'defence' ? 'defense' : s] || 0) : null;
          return { s, label, elem, need: reqMax ? need : 0, bonus: total, have };
        });
        const needTotal = sp.reduce((a, x) => a + x.need, 0);
        const lvl = Math.max(...eq.map(g => g.item.l));
        const w = get('w');
        const classReq = eq.map(g => g.item.c).find(Boolean);
        const majors = eq.flatMap(g => g.item.m || []);
        return el('div', { class: 'stack' },
          W.win('Build summary',
            el('div', { class: 'bigstats' },
              el('div', {}, el('b', {}, W.short(health[0] + rawHp[0]) + (rawHp[0] !== rawHp[1] ? '–' + W.short(health[1] + rawHp[1]) : '')), el('span', {}, 'Health')),
              el('div', {}, el('b', {}, 'Lv. ' + lvl), el('span', {}, 'Level needed')),
              el('div', {}, el('b', {}, needTotal), el('span', {}, 'Skill points needed'))),
            classReq ? el('p', { class: 'hint' }, 'Class: ', el('b', {}, W.cap(classReq)), '.') : null,
            el('div', { class: 'cap left' }, 'Skill points'),
            el('div', { class: 'skills' }, sp.map(x => el('div', { class: 'skill sp' },
              el('span', { style: { color: W.ELEM[x.elem] } }, x.label),
              el('div', {}, el('small', {}, `Assign ${x.need}`, x.bonus ? ` · gear gives ${x.bonus > 0 ? '+' : ''}${x.bonus}` : ''),
                x.have != null ? el('small', { class: x.have >= x.need ? 'up' : 'down' }, ` · has ${x.have}`) : null),
              el('b', { class: 'snum' }, x.need)))),
            el('p', { class: 'hint' }, 'Skill points assume the best equip order, so gear bonuses can cover other pieces’ requirements.' + (owner ? ' “has” is what this character has assigned right now.' : ''))),
          W.win('Defences and weapon',
            el('div', { class: 'kv' },
              ['earth', 'thunder', 'water', 'fire', 'air'].map(e => { const k = Object.keys(base).find(x => x.toLowerCase().includes(e) && /Defence/.test(x)); const v = k ? base[k] : [0, 0]; return el('div', {}, el('span', { style: { color: W.ELEM[e] } }, W.cap(e) + ' defence'), el('b', {}, v[0] === v[1] ? v[0] : `${v[0]}–${v[1]}`)); }),
              w ? el('div', {}, el('span', {}, 'Weapon'), el('b', {}, `${w.item.n} · ${w.item.as ? W.words(w.item.as) : ''} · ${w.item.dps || '?'} avg DPS`)) : null,
              majors.length ? el('div', {}, el('span', {}, 'Major IDs'), el('b', {}, majors.join(', '))) : null)),
          W.win('Identifications',
            el('div', { class: 'idlist' }, Object.entries(ids).filter(([, v]) => v[0] || v[1]).sort((a, b) => W.idInfo(a[0]).name.localeCompare(W.idInfo(b[0]).name)).map(([k, v]) =>
              el('div', { class: 'il' }, el('span', { class: W.idGood(k, v) ? 'pos' : 'neg' }, W.fmtId(k, v[0] === v[1] ? v[0] : v)), el('span', { class: 'idn' }, W.idInfo(k).name)))),
            el('p', { class: 'hint' }, 'Pieces pasted from Wynntils use their exact rolls; the rest show their full roll range.')));
      }
      draw();
    });
  };
})(window.W);
