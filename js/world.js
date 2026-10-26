/* World: the interactive map (world / guild territories / profession nodes) and the raid, lootrun and cave guides.
   Map tiles, places, services, caves and nodes come from Wynntils' static data (tools/build_world.py), territories
   live from the Wynncraft API, guides from the Wynncraft Wiki. The map runs on Leaflet, loaded only on this page. */
(function (W) {
  const { el } = W;
  /* wiki images, copied into img/guide/ by tools/build_world.py (the wiki blocks showing them on other sites) */
  const WIKI_IMG = (f) => 'img/guide/' + f.toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';

  /* ---------- Leaflet, loaded on demand ---------- */
  let leaflet = null;
  W.loadLeaflet = () => leaflet || (leaflet = new Promise((ok, bad) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => ok(window.L); s.onerror = () => bad(new Error('Couldn’t load the map library.'));
    document.head.append(s);
  }));

  /* Minecraft x/z -> map lat/lng (north up) */
  const ll = (x, z) => [-z, x];

  const SERVICE_ICON = {
    'Alchemism Station': 'wiki/alchemism', 'Armouring Station': 'wiki/armouring', 'Cooking Station': 'wiki/cooking', 'Jeweling Station': 'wiki/jeweling',
    'Scribing Station': 'wiki/scribing', 'Tailoring Station': 'wiki/tailoring', 'Weaponsmithing Station': 'wiki/weaponsmithing', 'Woodworking Station': 'wiki/woodworking',
    'Emerald Merchant': 'wiki/emeraldicon', 'Liquid Merchant': 'wiki/emeraldicon', 'Trade Market': 'wiki/3d-items', 'Booth Shop': 'wiki/3d-items',
    'Item Identifier': 'items/tome.utility', 'Powder Master': 'ui/powder-fire', 'Potion Merchant': 'ui/mat-oil', 'Blacksmith': 'items/dagger.basicGold',
    'Tool Merchant': 'wiki/mining', 'Weapon Merchant': 'items/spear.basicGold', 'Armour Merchant': 'items/helmet.iron', 'Scroll Merchant': 'items/tome.lootrun',
    'Dungeon Scroll Merchant': 'wiki/questbook', 'Fast Travel': 'ui/speed', 'Seaskipper': 'ui/speed-boost', 'Housing Balloon': 'ui/jump-height', 'Party Finder': 'wiki/3d-players',
  };
  const SERVICE_GROUPS = [
    ['Crafting stations', ['Alchemism Station', 'Armouring Station', 'Cooking Station', 'Jeweling Station', 'Scribing Station', 'Tailoring Station', 'Weaponsmithing Station', 'Woodworking Station']],
    ['Merchants', ['Emerald Merchant', 'Liquid Merchant', 'Trade Market', 'Booth Shop', 'Potion Merchant', 'Scroll Merchant', 'Dungeon Scroll Merchant', 'Tool Merchant', 'Weapon Merchant', 'Armour Merchant']],
    ['Services', ['Item Identifier', 'Powder Master', 'Blacksmith', 'Party Finder']],
    ['Travel', ['Fast Travel', 'Seaskipper', 'Housing Balloon']],
  ];
  const PROF_COL = { mining: '#c9c2b4', woodcutting: '#87b85b', farming: '#e0c27a', fishing: '#6fb0dc' };
  const PROF_ICON = { mining: 'profession.ingotIron', woodcutting: 'profession.plankOak', farming: 'profession.grainWheat', fishing: 'profession.meatSalmon' };
  const DIFF_COL = { easy: '#87b85b', medium: '#e0c27a', hard: '#d9894a', extreme: '#d16fa6' };

  /* map state: kept between visits, and in the URL so a view can be shared */
  const MS = { mode: 'world', on: new Set(['prov', 'city', 'raids', 'camps', 'caves', 'Fast Travel', 'Trade Market']), sel: new Set(), pins: [], view: null,
    lvl: [1, 132], colorBy: 'guild', guild: '', tool: '', route: [], rres: '', rstops: 10, rspeed: 0, rgather: 4 };
  const DEFAULT_ON = { world: ['prov', 'city', 'raids', 'camps', 'caves', 'Fast Travel', 'Trade Market'], territories: ['terr', 'routes', 'hq'], professions: ['p:mining', 'p:woodcutting', 'p:farming', 'p:fishing'] };

  function fromQuery(q) {
    if (!q || !q.get('m')) return;
    MS.mode = q.get('m');
    MS.on = new Set((q.get('l') || DEFAULT_ON[MS.mode].join(',')).split(',').filter(Boolean));
    MS.sel = new Set((q.get('s') || '').split(',').filter(Boolean));
    MS.route = (q.get('r') || '').split(',').filter(Boolean);
    MS.pins = (q.get('p') || '').split(';').filter(Boolean).map(s => { const [x, z, ...n] = s.split('_'); return [+x, +z, decodeURIComponent(n.join('_')) || 'Pin']; });
    const v = (q.get('v') || '').split(',').map(Number); MS.view = v.length === 3 && v.every(isFinite) ? v : null;
    if (q.get('g')) MS.guild = q.get('g');
    if (q.get('c')) MS.colorBy = q.get('c');
    const lv = (q.get('lv') || '').split('-').map(Number); if (lv.length === 2 && lv.every(isFinite)) MS.lvl = lv;
  }

  W.pages['world/map'] = function (root, q) {
    fromQuery(q);
    W.withData(root, ['world', 'nodes', 'guides', 'territories'], (world, nodes, guides, terrStatic) => {
      const mapEl = el('div', { class: 'wmap' });
      const side = el('div', { class: 'wside' });
      const coords = el('div', { class: 'wcoords' }, 'x —, z —');
      root.replaceChildren(el('div', { class: 'mapwrap' }, side, el('div', { class: 'mapbox' }, mapEl, coords)));
      W.loadLeaflet().then(L => start(L)).catch(e => mapEl.replaceChildren(el('div', { class: 'warn', style: { margin: '20px' } }, e.message)));

      function start(L) {
        const map = L.map(mapEl, { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, zoomDelta: 0.5, preferCanvas: true, attributionControl: true });
        map.attributionControl.setPrefix(false).addAttribution('Map: <a href="https://wynntils.com" target="_blank" rel="noopener">Wynntils</a> · Wynncraft');
        world.tiles.forEach(t => L.imageOverlay(t.url, [ll(t.x1, t.z2 + 1), ll(t.x2 + 1, t.z1)], { interactive: false, className: 'wtile' }).addTo(map));
        if (MS.view) map.setView(ll(MS.view[0], MS.view[1]), MS.view[2]); else map.fitBounds([ll(-2500, -6700), ll(1700, -300)]);
        map.on('mousemove', (e) => { coords.textContent = `x ${Math.round(e.latlng.lng)}, z ${Math.round(-e.latlng.lat)}`; });

        /* every selectable thing: id -> { x, z, name, kind, sub } */
        const reg = new Map();
        const groups = {};
        const group = (k) => groups[k] || (groups[k] = L.layerGroup());
        const routeLayer = L.layerGroup().addTo(map), selLayer = L.layerGroup().addTo(map), pinLayer = L.layerGroup().addTo(map);
        const icon = (src, cls) => L.divIcon({ className: 'wicon ' + (cls || ''), html: `<img src="${src}" alt="">`, iconSize: [24, 24], iconAnchor: [12, 12] });
        const add = (key, id, item, layer) => {
          reg.set(id, item);
          layer.on('click', () => toggleSel(id));
          layer.bindTooltip(item.tip || item.name, { direction: 'top', offset: [0, -8], className: 'wtip' });
          group(key).addLayer(layer);
        };

        /* places */
        world.labels.forEach((p, i) => {
          const k = p.layer === 1 ? 'prov' : p.layer === 2 ? 'city' : 'area';
          add(k, 'p:' + i, { x: p.x, z: p.z, name: p.n, kind: 'Place', sub: p.lvl ? 'Lv. ' + p.lvl : '' },
            L.marker(ll(p.x, p.z), { icon: L.divIcon({ className: 'wlabel l' + p.layer, html: `<span>${W.esc(p.n)}${p.lvl ? `<small>Lv. ${p.lvl}</small>` : ''}</span>`, iconSize: null }) }));
        });
        /* services */
        Object.entries(world.services).forEach(([type, pts]) => pts.forEach(([x, z], i) =>
          add(type, `s:${type}:${i}`, { x, z, name: type, kind: 'Service' }, L.marker(ll(x, z), { icon: icon(`img/${SERVICE_ICON[type] || 'wiki/questbook'}.webp`, 'svc') }))));
        /* caves */
        world.caves.forEach((c, i) => {
          if (c.x == null) return;
          const tip = `<b>${W.esc(c.n)}</b><br>Lv. ${c.lvl} · ${W.cap(c.len || '')} · ${W.cap(c.diff || '')}`;
          add('caves', 'c:' + i, { x: c.x, z: c.z, name: c.n, kind: 'Cave', sub: `Lv. ${c.lvl} · ${c.diff}`, tip },
            L.marker(ll(c.x, c.z), { icon: L.divIcon({ className: 'wcave', html: `<i style="--c:${DIFF_COL[c.diff] || '#aaa'}"></i>`, iconSize: [14, 14] }) }));
        });
        /* raids and lootrun camps */
        guides.raids.forEach((r, i) => add('raids', 'r:' + i, { x: r.x, z: r.z, name: r.n, kind: 'Raid', sub: 'Lv. ' + r.lvl, tip: `<b>${W.esc(r.n)}</b><br>Raid · Lv. ${r.lvl}` },
          L.marker(ll(r.x, r.z), { icon: L.divIcon({ className: 'wbig', html: `<img src="${WIKI_IMG(r.n.replace(/[^A-Za-z']/g, '') + 'Icon.png')}" alt="" onerror="this.replaceWith(document.createTextNode('R'))">`, iconSize: [34, 34], iconAnchor: [17, 17] }) })));
        guides.lootrun.camps.forEach((c, i) => add('camps', 'l:' + i, { x: c.x, z: c.z, name: c.n, kind: 'Lootrun camp', tip: `<b>${W.esc(c.n)}</b><br>Lootrun camp` },
          L.marker(ll(c.x, c.z), { icon: L.divIcon({ className: 'wbig', html: `<img src="${WIKI_IMG('Inspect beacon rainbow.png')}" alt="" onerror="this.src='img/items/charm.light.webp'">`, iconSize: [30, 30], iconAnchor: [15, 15] }) })));
        /* gathering nodes, one layer per resource */
        Object.entries(nodes).forEach(([prof, res]) => Object.entries(res).forEach(([r, d]) => {
          for (let i = 0; i < d.p.length; i += 2) {
            const x = d.p[i], z = d.p[i + 1];
            add(`n:${prof}:${r}`, `n:${prof}:${r}:${i / 2}`, { x, z, name: `${W.cap(r)} (${W.cap(prof)})`, kind: 'Node', sub: 'Lv. ' + d.l, lvl: d.l, prof },
              L.circleMarker(ll(x, z), { radius: 3.5, weight: 1, color: '#0d0c0b', fillColor: PROF_COL[prof], fillOpacity: .95 }));
          }
        }));

        /* territories, live */
        let terr = null, terrErr = null;
        const colorOf = Object.fromEntries(terrStatic.filter(t => t.g && t.c).map(t => [t.g, t.c]));
        const hashCol = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360}, 55%, 55%)`; };
        const gColor = (g) => colorOf[g] || hashCol(g || '?');
        function loadTerritories() {
          if (terr || terrErr) return;
          W.api('guild/list/territory').then(d => { terr = d; buildTerritories(); render(); }).catch(e => { terrErr = e.message; drawSide(); });
        }
        function buildTerritories() {
          ['terr', 'routes', 'hq', 'tnames'].forEach(k => group(k).clearLayers());
          const now = Date.now(), seen = new Set();
          const centre = (t) => [(t.location.start[0] + t.location.end[0]) / 2, (t.location.start[1] + t.location.end[1]) / 2];
          const resCol = { EMERALD: '#87b85b', ORE: '#c9c2b4', WOOD: '#a0703c', FISH: '#6fb0dc', CROPS: '#e0c27a' };
          Object.entries(terr).forEach(([name, t]) => {
            const [x1, z1] = t.location.start, [x2, z2] = t.location.end, g = t.guild || {};
            const days = (now - new Date(t.acquired)) / 864e5;
            const main = (t.resources || []).filter(r => r.type !== 'EMERALD').sort((a, b) => b.baseGeneration - a.baseGeneration)[0];
            const fill = MS.colorBy === 'resource' ? resCol[main && main.type] || '#888' : MS.colorBy === 'age' ? `hsl(${Math.max(0, 120 - days * 8)}, 60%, 50%)` : gColor(g.name);
            const dim = MS.guild && g.name !== MS.guild;
            const tip = `<b>${W.esc(name)}</b><br>${g.name ? `${W.esc(g.name)} [${W.esc(g.prefix || '')}]` : 'Unclaimed'}<br>Held ${days < 1 ? Math.round(days * 24) + ' h' : Math.round(days) + ' days'}` +
              (t.resources ? '<br>' + t.resources.filter(r => r.baseGeneration).map(r => `${W.cap(r.type.toLowerCase())} ${r.baseGeneration.toLocaleString()}/h`).join(' · ') : '');
            add('terr', 't:' + name, { x: (x1 + x2) / 2, z: (z1 + z2) / 2, name, kind: 'Territory', sub: g.name || 'Unclaimed', tip },
              L.rectangle([ll(x1, z1), ll(x2, z2)], { color: '#0d0c0b', weight: 1, fillColor: fill, fillOpacity: dim ? .12 : .45, opacity: dim ? .45 : .9 }));
            const [cx, cz] = centre(t);
            if (t.hq) group('hq').addLayer(L.marker(ll(cx, cz), { interactive: false, icon: L.divIcon({ className: 'whq', html: `<b style="color:${gColor(g.name)}">★</b>`, iconSize: [18, 18] }) }));
            group('tnames').addLayer(L.marker(ll(cx, cz), { interactive: false, icon: L.divIcon({ className: 'wtname', html: `<span>${W.esc(g.prefix || '')}</span>`, iconSize: null }) }));
            (t.links || []).forEach(o => {
              const other = terr[o]; const key = [name, o].sort().join('|');
              if (!other || seen.has(key)) return; seen.add(key);
              group('routes').addLayer(L.polyline([ll(cx, cz), ll(...centre(other))], { color: '#f2ece2', weight: 1, opacity: .45, interactive: false }));
            });
          });
        }

        /* which layer keys each mode offers */
        const modeKeys = () => MS.mode === 'territories' ? ['terr', 'routes', 'hq', 'tnames']
          : MS.mode === 'professions' ? [...Object.keys(groups).filter(k => k.startsWith('n:')), ...SERVICE_GROUPS[0][1]]
          : ['prov', 'city', 'area', 'raids', 'camps', 'caves', ...SERVICE_GROUPS.flatMap(g => g[1])];
        const nodeOn = (k) => { const [, prof] = k.split(':'); return MS.on.has('p:' + prof) && !MS.on.has('x:' + k); };
        function render() {
          const keys = new Set(modeKeys());
          Object.entries(groups).forEach(([k, g]) => {
            let show = keys.has(k) && (k.startsWith('n:') ? nodeOn(k) : MS.on.has(k));
            if (show && !map.hasLayer(g)) g.addTo(map); else if (!show && map.hasLayer(g)) map.removeLayer(g);
          });
          if (MS.mode === 'professions') Object.entries(groups).forEach(([k, g]) => {
            if (!k.startsWith('n:') || !map.hasLayer(g)) return;
            const [, prof, r] = k.split(':'), l = nodes[prof][r].l;
            const inRange = l >= MS.lvl[0] && l <= MS.lvl[1];
            if (!inRange) map.removeLayer(g);
          });
          if (MS.mode === 'territories') loadTerritories();
          drawSel(); drawPins(); drawRoute(); drawSide();
        }

        /* gathering route: a loop through the stops, nearest-first and then untangled (2-opt), as the crow flies */
        const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
        function orderLoop(pts) {
          if (pts.length < 4) return pts;
          const left = pts.slice(1), out = [pts[0]];
          while (left.length) { const last = out[out.length - 1]; let bi = 0; left.forEach((p, i) => { if (dist(last, p) < dist(last, left[bi])) bi = i; }); out.push(left.splice(bi, 1)[0]); }
          const n = out.length;
          for (let pass = 0, better = true; better && pass < 60; pass++) {
            better = false;
            for (let i = 0; i < n - 2; i++) for (let j = i + 2; j < n - (i === 0 ? 1 : 0); j++) {
              const a = out[i], b = out[i + 1], c = out[j], d = out[(j + 1) % n];
              if (dist(a, c) + dist(b, d) < dist(a, b) + dist(c, d) - 0.01) { out.splice(i + 1, j - i, ...out.slice(i + 1, j + 1).reverse()); better = true; }
            }
          }
          return out;
        }
        const routePts = () => MS.route.map(id => reg.get(id) && Object.assign({ id }, reg.get(id))).filter(Boolean);
        const loopLength = (pts) => pts.length < 2 ? 0 : pts.reduce((a, p, i) => a + dist(p, pts[(i + 1) % pts.length]), 0);
        function planRoute(ids) {
          MS.route = orderLoop(ids.map(id => reg.get(id) && Object.assign({ id }, reg.get(id))).filter(Boolean)).map(p => p.id); drawRoute(); drawSide();
          if (innerWidth <= 900) mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });   // on phones the controls sit below the map
        }
        function drawRoute() {
          routeLayer.clearLayers();
          const pts = routePts(); if (pts.length < 2) return;
          routeLayer.addLayer(L.polyline([...pts, pts[0]].map(p => ll(p.x, p.z)), { color: '#0d0c0b', weight: 6, opacity: .55, interactive: false }));
          routeLayer.addLayer(L.polyline([...pts, pts[0]].map(p => ll(p.x, p.z)), { color: '#ffd65a', weight: 3, dashArray: '8 6', interactive: false }));
          pts.forEach((p, i) => routeLayer.addLayer(L.marker(ll(p.x, p.z), { interactive: false, icon: L.divIcon({ className: 'wstop', html: `<b>${i + 1}</b>`, iconSize: [20, 20], iconAnchor: [10, 24] }) })));
        }

        /* selection: gold rings, listed in the sidebar */
        function toggleSel(id) { if (MS.tool === 'pin') return; MS.sel.has(id) ? MS.sel.delete(id) : MS.sel.add(id); drawSel(); drawSide(); }
        function drawSel() {
          selLayer.clearLayers();
          MS.sel.forEach(id => { const it = reg.get(id); if (!it) return;
            selLayer.addLayer(L.circleMarker(ll(it.x, it.z), { radius: 13, color: '#ffd65a', weight: 3, fill: false, interactive: false }));
            selLayer.addLayer(L.circleMarker(ll(it.x, it.z), { radius: 17, color: '#0d0c0b', weight: 2, fill: false, opacity: .6, interactive: false })); });
        }
        function drawPins() {
          pinLayer.clearLayers();
          MS.pins.forEach(([x, z, n], i) => pinLayer.addLayer(L.marker(ll(x, z), { icon: L.divIcon({ className: 'wpin', html: `<i></i><span>${W.esc(n)}</span>`, iconSize: [16, 16], iconAnchor: [8, 16] }) })
            .bindTooltip(`${W.esc(n)}<br>x ${x}, z ${z}`, { className: 'wtip', direction: 'top' }).on('click', () => { MS.pins.splice(i, 1); drawPins(); drawSide(); })));
        }
        map.on('click', (e) => {
          if (MS.tool !== 'pin') return;
          MS.pins.push([Math.round(e.latlng.lng), Math.round(-e.latlng.lat), 'Pin ' + (MS.pins.length + 1)]);
          drawPins(); drawSide();
        });
        map.on('moveend', () => { const c = map.getCenter(); MS.view = [Math.round(c.lng), Math.round(-c.lat), Math.round(map.getZoom() * 4) / 4]; });

        /* ---------- sidebar ---------- */
        const toggle = (key, label, iconSrc, count, colour) => el('label', { class: 'wtog' + (MS.on.has(key) ? ' on' : '') },
          el('input', { type: 'checkbox', checked: MS.on.has(key), onchange: (e) => { e.target.checked ? MS.on.add(key) : MS.on.delete(key); render(); } }),
          iconSrc ? el('img', { src: iconSrc, alt: '' }) : colour ? el('i', { class: 'sw', style: { background: colour } }) : null,
          el('span', {}, label), count != null ? el('small', {}, count) : null);
        const groupBox = (title, keys) => el('details', { class: 'wgrp', open: true }, el('summary', {}, title,
          el('button', { class: 'mini', onclick: (e) => { e.preventDefault(); const all = keys.every(k => MS.on.has(k)); keys.forEach(k => all ? MS.on.delete(k) : MS.on.add(k)); render(); } }, 'All / none')),
          keys.map(k => toggle(k, k, `img/${SERVICE_ICON[k] || 'wiki/questbook'}.webp`, (world.services[k] || []).length)));

        function drawSide() {
          const shareUrl = () => {
            const p = new URLSearchParams({ m: MS.mode, l: [...MS.on].join(','), v: (MS.view || []).join(',') });
            if (MS.sel.size) p.set('s', [...MS.sel].join(','));
            if (MS.pins.length) p.set('p', MS.pins.map(([x, z, n]) => `${x}_${z}_${encodeURIComponent(n)}`).join(';'));
            if (MS.mode === 'territories') { p.set('c', MS.colorBy); if (MS.guild) p.set('g', MS.guild); }
            if (MS.mode === 'professions') p.set('lv', MS.lvl.join('-'));
            if (MS.route.length) p.set('r', MS.route.join(','));
            return location.href.split('#')[0] + '#world/map?' + p.toString();
          };
          const search = el('input', { type: 'search', placeholder: 'Find a place, cave, raid, service or territory…' });
          const results = el('div', { class: 'wresults' });
          search.addEventListener('input', () => {
            const qq = search.value.trim().toLowerCase();
            const hits = qq.length < 2 ? [] : [...reg].filter(([id, it]) => !id.startsWith('n:') && it.name.toLowerCase().includes(qq)).slice(0, 8);
            results.replaceChildren(...hits.map(([id, it]) => el('button', { class: 'wres', onclick: () => { map.flyTo(ll(it.x, it.z), Math.max(map.getZoom(), 0)); MS.sel.add(id); drawSel(); drawSide(); } },
              el('b', {}, it.name), el('small', {}, [it.kind, it.sub].filter(Boolean).join(' · ')))));
          });

          const modeTabs = el('div', { class: 'wmodes' }, [['world', 'World'], ['territories', 'Territories'], ['professions', 'Professions']].map(([k, label]) =>
            el('button', { class: MS.mode === k ? 'on' : '', onclick: () => { if (MS.mode === k) return; MS.mode = k; MS.on = new Set(DEFAULT_ON[k]); render(); } }, label)));

          let body;
          if (MS.mode === 'world') body = [
            el('div', { class: 'wgrp' }, el('div', { class: 'wgt' }, 'Places'),
              toggle('prov', 'Provinces', null, null, '#e0c27a'), toggle('city', 'Cities and towns', null, null, '#fff'), toggle('area', 'Areas', null, null, '#a39c90')),
            el('div', { class: 'wgrp' }, el('div', { class: 'wgt' }, 'Content'),
              toggle('raids', 'Raids', WIKI_IMG('CBRaidIcon.png'), guides.raids.length), toggle('camps', 'Lootrun camps', WIKI_IMG('Inspect beacon rainbow.png'), guides.lootrun.camps.length),
              toggle('caves', 'Caves', null, world.caves.length, '#d9894a')),
            ...SERVICE_GROUPS.map(([t, keys]) => groupBox(t, keys)),
          ];
          else if (MS.mode === 'territories') {
            const counts = {};
            if (terr) Object.values(terr).forEach(t => { const g = t.guild && t.guild.name; if (g) counts[g] = (counts[g] || 0) + 1; });
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            body = [
              terrErr ? el('div', { class: 'warn' }, 'Couldn’t load territories: ' + terrErr) : !terr ? el('p', { class: 'empty' }, 'Loading live territories…') : null,
              el('div', { class: 'wgrp' }, el('div', { class: 'wgt' }, 'Show'),
                toggle('terr', 'Territories', null, terr ? Object.keys(terr).length : null, '#9c7cc4'), toggle('routes', 'Trade routes', null, null, '#f2ece2'),
                toggle('hq', 'Guild HQs', null, null, '#ffd65a'), toggle('tnames', 'Guild tags', null, null, '#fff')),
              el('div', { class: 'wgrp' }, el('div', { class: 'wgt' }, 'Colour by'),
                el('div', { class: 'wseg' }, [['guild', 'Guild'], ['resource', 'Resource'], ['age', 'Time held']].map(([k, label]) =>
                  el('button', { class: MS.colorBy === k ? 'on' : '', onclick: () => { MS.colorBy = k; if (terr) buildTerritories(); render(); } }, label)))),
              top.length ? el('div', { class: 'wgrp' }, el('div', { class: 'wgt' }, `Guilds · ${top.length}`,
                MS.guild ? el('button', { class: 'mini', onclick: () => { MS.guild = ''; buildTerritories(); render(); } }, 'Show all') : null),
                el('div', { class: 'wguilds' }, top.map(([g, n]) => el('button', { class: 'wguild' + (MS.guild === g ? ' on' : ''), onclick: () => { MS.guild = MS.guild === g ? '' : g; buildTerritories(); render(); } },
                  el('i', { class: 'sw', style: { background: gColor(g) } }), el('span', {}, g), el('small', {}, n))))) : null,
            ];
          } else {
            body = [
              routeBox(),
              el('div', { class: 'wgrp' }, el('div', { class: 'wgt' }, 'Node level'),
                el('div', { class: 'range2' }, W.numIn(MS.lvl[0], (v) => { MS.lvl[0] = v; render(); }, 1, 132), el('span', {}, 'to'), W.numIn(MS.lvl[1], (v) => { MS.lvl[1] = v; render(); }, 1, 132))),
              ...Object.entries(nodes).map(([prof, res]) => el('details', { class: 'wgrp', open: true },
                el('summary', {}, el('label', { class: 'wtog inline' }, el('input', { type: 'checkbox', checked: MS.on.has('p:' + prof), onchange: (e) => { e.target.checked ? MS.on.add('p:' + prof) : MS.on.delete('p:' + prof); render(); } }),
                  el('img', { src: `img/items/${PROF_ICON[prof]}.webp`, alt: '' }), el('span', {}, W.cap(prof)))),
                Object.entries(res).sort((a, b) => a[1].l - b[1].l).map(([r, d]) => el('label', { class: 'wtog wres-row' + (MS.on.has('x:n:' + prof + ':' + r) ? '' : ' on') },
                  el('input', { type: 'checkbox', checked: !MS.on.has(`x:n:${prof}:${r}`), onchange: (e) => { const k = `x:n:${prof}:${r}`; e.target.checked ? MS.on.delete(k) : MS.on.add(k); render(); } }),
                  el('i', { class: 'sw', style: { background: PROF_COL[prof] } }), el('span', {}, W.cap(r)), el('small', {}, `Lv. ${d.l} · ${d.p.length / 2}`))))),
              groupBox('Crafting stations', SERVICE_GROUPS[0][1]),
            ];
          }

          const selected = [...MS.sel].map(id => [id, reg.get(id)]).filter(([, it]) => it);
          side.replaceChildren(
            modeTabs,
            el('div', { class: 'wsearch' }, search, results),
            el('div', { class: 'wtools' },
              el('button', { class: 'mini' + (MS.tool === 'pin' ? ' on' : ''), onclick: () => { MS.tool = MS.tool === 'pin' ? '' : 'pin'; mapEl.classList.toggle('pinning', MS.tool === 'pin'); drawSide(); } }, MS.tool === 'pin' ? 'Click the map to pin' : 'Drop pins'),
              el('button', { class: 'mini', onclick: (e) => W.copyShort(shareUrl(), e.target) }, 'Copy share link')),
            selected.length || MS.pins.length ? el('div', { class: 'wgrp wselbox' },
              el('div', { class: 'wgt' }, `Selected · ${selected.length + MS.pins.length}`, el('button', { class: 'mini', onclick: () => { MS.sel.clear(); MS.pins = []; drawSel(); drawPins(); drawSide(); } }, 'Clear')),
              selected.map(([id, it]) => el('div', { class: 'wsel' },
                el('button', { class: 'wselgo', onclick: () => map.flyTo(ll(it.x, it.z), Math.max(map.getZoom(), 0)) }, el('b', {}, it.name), el('small', {}, `${it.kind} · x ${Math.round(it.x)}, z ${Math.round(it.z)}`)),
                el('button', { class: 'mini', title: 'Copy coordinates', onclick: (e) => W.copyText(`${Math.round(it.x)} ${Math.round(it.z)}`, e.target) }, 'Copy'),
                el('button', { class: 'mini danger', title: 'Unselect', onclick: () => toggleSel(id) }, '×'))),
              MS.pins.map((p, i) => el('div', { class: 'wsel' },
                el('input', { type: 'text', value: p[2], 'aria-label': 'Pin name', onchange: (e) => { p[2] = e.target.value || 'Pin'; drawPins(); } }),
                el('button', { class: 'mini', onclick: (e) => W.copyText(`${p[0]} ${p[1]}`, e.target) }, 'Copy'),
                el('button', { class: 'mini danger', onclick: () => { MS.pins.splice(i, 1); drawPins(); drawSide(); } }, '×')))) : el('p', { class: 'hint wselhint' }, 'Click anything on the map to select it. Selected points and pins go into the share link.'),
            ...body.filter(Boolean));
        }
        function routeBox() {
          const opts = Object.entries(nodes).flatMap(([prof, res]) => Object.entries(res).sort((a, b) => a[1].l - b[1].l).map(([r, d]) => [`${prof}:${r}`, `${W.cap(r)} · ${W.cap(prof)} · Lv. ${d.l}`]));
          if (!MS.rres) MS.rres = opts[0][0];
          const nearest = () => {
            const [prof, r] = MS.rres.split(':'), d = nodes[prof][r], c = map.getCenter(), at = { x: c.lng, z: -c.lat };
            const ids = []; for (let i = 0; i < d.p.length; i += 2) ids.push([`n:${prof}:${r}:${i / 2}`, Math.hypot(d.p[i] - at.x, d.p[i + 1] - at.z)]);
            ids.sort((a, b) => a[1] - b[1]);
            MS.on.add('p:' + prof); MS.on.delete(`x:n:${prof}:${r}`);
            planRoute(ids.slice(0, MS.rstops).map(x => x[0]));
            render();
            const pts = routePts(); if (pts.length) map.fitBounds(pts.map(p => ll(p.x, p.z)), { padding: [40, 40], maxZoom: 1 });
          };
          const pts = routePts(), len = loopLength(pts);
          const speed = 5.612 * (1 + MS.rspeed / 100), lap = len / speed + pts.length * MS.rgather;
          return el('div', { class: 'wgrp wroute' }, el('div', { class: 'wgt' }, 'Gathering route', MS.route.length ? el('button', { class: 'mini', onclick: () => { MS.route = []; drawRoute(); drawSide(); } }, 'Clear') : null),
            el('label', { class: 'wfield' }, 'Resource', W.sel(opts, MS.rres, (v) => { MS.rres = v; })),
            el('div', { class: 'wfrow' },
              el('label', { class: 'wfield' }, 'Stops', W.numIn(MS.rstops, (v) => { MS.rstops = Math.max(3, Math.min(40, v)); }, 3, 40)),
              el('button', { class: 'mini', onclick: nearest, title: 'Take the nearest nodes of that resource to the middle of the map' }, 'Route nearest')),
            MS.sel.size >= 3 ? el('button', { class: 'mini', onclick: () => planRoute([...MS.sel]) }, `Route my ${MS.sel.size} selected points`) : null,
            pts.length >= 2 ? el('div', { class: 'wroutestats' },
              el('div', {}, el('b', {}, pts.length), el('span', {}, 'stops')),
              el('div', {}, el('b', {}, Math.round(len).toLocaleString()), el('span', {}, 'blocks a lap')),
              el('div', {}, el('b', {}, `${Math.floor(lap / 60)}m ${String(Math.round(lap % 60)).padStart(2, '0')}s`), el('span', {}, 'per lap'))) : null,
            pts.length >= 2 ? el('div', { class: 'wfrow' },
              el('label', { class: 'wfield' }, 'Walk speed %', W.numIn(MS.rspeed, (v) => { MS.rspeed = Math.max(-50, Math.min(200, v)); drawSide(); }, -50, 200)),
              el('label', { class: 'wfield' }, 'Seconds per node', W.numIn(MS.rgather, (v) => { MS.rgather = Math.max(0, Math.min(60, v)); drawSide(); }, 0, 60))) : null,
            el('p', { class: 'hint' }, pts.length >= 2 ? 'Straight lines at sprinting speed (5.6 blocks/s, plus your Walk Speed), so hills, water and walls add time. The route goes into the share link.'
              : 'Pick a resource, move the map to where you want to farm, and press Route nearest. Or select three or more points and route through those.'));
        }
        render();
        const startView = MS.view && MS.view.slice();
        setTimeout(() => { if (!map.getContainer().isConnected) return; map.invalidateSize(); if (startView) map.setView(ll(startView[0], startView[1]), startView[2], { animate: false }); }, 50);   // keep a shared view centred once the map knows its size
        W.onLeave && W.onLeave(() => map.remove());
      }
    });
  };

  /* ---------- guides ---------- */
  const mapLink = (id, x, z) => `#world/map?m=world&s=${encodeURIComponent(id)}&v=${x},${z},0.5`;
  const coordChip = (x, z, y) => el('button', { class: 'mini coord', title: 'Copy coordinates', onclick: (e) => W.copyText(`${x} ${y != null ? y + ' ' : ''}${z}`, e.target) }, `${x}, ${y != null ? y + ', ' : ''}${z}`);
  const mc = (s) => W.mcHtml(String(s || ''));

  W.pages['world/raids'] = function (root) {
    W.withData(root, ['guides'], (g) => {
      let gq = '';
      const gamb = el('div', { class: 'gambits' });
      const drawGambits = () => gamb.replaceChildren(...g.gambits.filter(x => !gq || (x.n + x.d).toLowerCase().includes(gq)).map(x => el('div', { class: 'gambit' }, el('b', {}, x.n), el('span', {}, mc(x.d)))));
      root.replaceChildren(el('div', { class: 'stack' },
        el('section', { class: 'gintro' }, el('img', { src: WIKI_IMG('CBRaidIcon.png'), alt: '' }), el('div', {},
          el('h2', {}, 'Raids'), el('p', {}, 'Four-player challenges: three challenge rooms with a buff choice after each, then a boss. Raids are the only source of Aspects and most Mysticism tomes. Past combat level 65 you need to join the Raid Syndicate at the Raid Chief in the Silverbull Company HQ.'))),
        ...g.raids.map((r, i) => el('section', { class: 'win raid' },
          el('div', { class: 'raidhead' },
            el('img', { class: 'raidicon', src: WIKI_IMG(r.n.replace(/[^A-Za-z']/g, '') + 'Icon.png'), alt: '', onerror: function () { this.remove(); } }),
            el('div', {}, el('h2', {}, r.n), el('p', { class: 'lore' }, r.lore)),
            el('div', { class: 'raidtags' }, el('span', { class: 'rt lvl' }, 'Lv. ' + r.lvl + '+'), el('span', { class: 'rt' }, r.len), el('span', { class: 'rt diff' }, r.diff))),
          el('div', { class: 'raidfacts' },
            fact('Quest', r.quest, 'Finish once per account'), fact('Cost', r.rune), fact('Boss', mc(r.boss)), fact('Where', r.where),
            el('div', { class: 'rfact' }, el('small', {}, 'Entrance'), el('div', {}, coordChip(r.x, r.z), ' ', el('a', { href: mapLink('r:' + i, r.x, r.z) }, 'Show on map'))),
            fact('Tomes', r.tomes.join(', '))),
          el('div', { class: 'rooms' }, r.rooms.map((room, n) => el('div', { class: 'room' }, el('div', { class: 'roomn' }, `Room ${n + 1}`),
            room.length > 1 ? el('small', { class: 'hint', style: { margin: 0 } }, 'One of:') : null,
            room.map(c => el('div', { class: 'chal' }, el('b', {}, c.n), c.d ? el('p', {}, mc(c.d)) : null)))),
            el('div', { class: 'room boss' }, el('div', { class: 'roomn' }, 'Boss'), el('b', {}, mc(r.boss)), r.boss_d ? el('p', {}, mc(r.boss_d)) : null)),
          r.buffs.length ? el('details', { class: 'buffs' }, el('summary', {}, `Power-ups · ${r.buffs.length}`),
            el('div', { class: 'bufftable' }, el('div', { class: 'brow head' }, ['Power-up', 'Tier I', 'Tier II', 'Tier III'].map(h => el('span', {}, h))),
              r.buffs.map(b => el('div', { class: 'brow' }, el('b', {}, mc(b.n)), ...b.t.map(x => el('span', {}, mc(x || '—'))))))) : null)),
        el('div', { class: 'cols' },
          W.win('Raid Division ranks', el('div', { class: 'ranklist' }, g.raidRanks.map((x, i) => el('div', { class: 'rankrow' }, el('i', {}, i + 1), el('b', {}, x.rank), el('small', {}, x.xp + ' XP'), el('span', {}, mc(x.perk)))))),
          W.win(`Silverbull Gambits · ${g.gambits.length}`, el('p', { class: 'hint', style: { marginTop: 0 } }, 'Optional handicaps for more reward pulls. Four are offered each day.'),
            el('input', { type: 'search', placeholder: 'Search gambits…', oninput: (e) => { gq = e.target.value.toLowerCase(); drawGambits(); } }), gamb)),
        el('p', { class: 'hint' }, 'From the Wynncraft Wiki (CC BY-SA). Refreshed weekly.')));
      drawGambits();
    });
  };
  function fact(label, value, note) {
    return el('div', { class: 'rfact' }, el('small', {}, label), el('div', {}, value || '—'), note ? el('em', {}, note) : null);
  }

  const CHALLENGE_IMG = { 'Spelunk': 'Spelunk', 'Slay Mobs': 'Slay', 'Slay Target': 'Target', 'Destroy': 'Destroy', 'Defend': 'Defend' };
  const BEACON_IMG = (n) => WIKI_IMG('Inspect beacon ' + n.replace(/§./g, '').replace(/ Beacon$/, '').toLowerCase() + '.png');
  W.pages['world/lootruns'] = function (root) {
    W.withData(root, ['guides'], (g) => {
      const lr = g.lootrun;
      const list = (rows, render) => el('div', { class: 'lrlist' }, rows.map(render));
      root.replaceChildren(el('div', { class: 'stack' },
        el('section', { class: 'gintro' }, el('img', { src: WIKI_IMG('LootrunUpdateIcon.png'), alt: '' }), el('div', {},
          el('h2', {}, 'Lootrunning'), el('p', {}, mc(lr.intro)), el('p', { class: 'hint' }, 'Sign up with the Lootrun Chief in the Silverbull Company HQ east of Cinfras, then start a run at any camp. Your gear is locked for the run.'))),
        W.win(`Camps · ${lr.camps.length}`, el('div', { class: 'camps' }, lr.camps.map((c, i) => el('div', { class: 'camp' },
          el('b', {}, c.n), el('div', {}, coordChip(c.x, c.z, c.y), ' ', el('a', { href: mapLink('l:' + i, c.x, c.z) }, 'Map')))))),
        W.win(`Beacons · ${lr.beacons.length}`, el('p', { class: 'hint', style: { marginTop: 0 } }, 'After each challenge you pick a beacon; its colour decides the reward. Numbers split by / are the Vibrant tiers.'),
          el('div', { class: 'beacons' }, lr.beacons.map(b => el('div', { class: 'beacon' },
            el('img', { src: BEACON_IMG(b.n), alt: '', onerror: function () { this.style.visibility = 'hidden'; } }),
            el('div', {}, el('b', {}, mc(b.n)), el('p', {}, mc(b.d)), el('small', {}, `Unlocks at ${b.rank}` + (b.max && !/N\/A/.test(b.max) ? ` · max ${b.max.replace(/§./g, '')}` : ''))))))),
        el('div', { class: 'cols' },
          W.win('Challenge types', list(lr.challenges, c => el('div', { class: 'lritem' }, el('img', { src: WIKI_IMG('LootrunChallenge' + (CHALLENGE_IMG[c.n] || c.n) + '.png'), alt: '', onerror: function () { this.remove(); } }),
            el('div', {}, el('b', {}, c.n), el('p', {}, mc(c.d) ), c.note && c.note !== '-' ? el('small', {}, mc(c.note)) : null)))),
          W.win('Curses', el('p', { class: 'hint', style: { marginTop: 0 } }, 'Purple and Dark Grey beacons curse every mob for the rest of the run. Each curse adds one of:'),
            el('div', { class: 'curses' }, lr.curses.map(c => el('span', {}, mc(c)))))),
        W.win(`Boons · ${lr.boons.length}`, el('div', { class: 'boons' }, lr.boons.map(b => el('div', { class: 'boon' }, el('b', {}, mc(b.n)), el('small', {}, b.type + (b.max && !/N\/A/.test(b.max) ? ' · ' + b.max.replace(/§./g, '') : '')), el('p', {}, mc(b.d)))))),
        el('div', { class: 'cols' },
          el('details', { class: 'win lrd' }, el('summary', {}, el('h2', {}, `Missions · ${lr.missions.length}`)), list(lr.missions, m => el('div', { class: 'lritem' }, el('div', {}, el('b', {}, mc(m.n)), el('p', {}, mc(m.d)))))),
          el('details', { class: 'win lrd' }, el('summary', {}, el('h2', {}, `Trials · ${lr.trials.length}`)), list(lr.trials, m => el('div', { class: 'lritem' }, el('div', {}, el('b', {}, mc(m.n)), el('p', {}, mc(m.d))))))),
        el('div', { class: 'cols' },
          W.win('Lootrun Division ranks', el('div', { class: 'ranklist' }, lr.ranks.map((x, i) => el('div', { class: 'rankrow' }, el('i', {}, i + 1), el('b', {}, x.rank), el('small', {}, x.xp + ' XP'), el('span', {}, mc(x.perk)))))),
          W.win('Reward chest', el('p', { class: 'hint', style: { marginTop: 0 } }, 'Rarest first. Each reward pull rolls once; the chest keeps the 36 best.'), el('ol', { class: 'rewards' }, lr.rewards.map(r => el('li', {}, mc(r)))))),
        el('p', { class: 'hint' }, 'From the Wynncraft Wiki (CC BY-SA). Refreshed weekly.')));
    });
  };

  const cf = { q: '', diff: '', len: '', min: 1, max: 130, sort: 'lvl' };
  W.pages['world/caves'] = function (root) {
    W.withData(root, ['world'], (world) => {
      const out = el('div', {});
      const run = () => {
        const q = cf.q.trim().toLowerCase();
        const list = world.caves.map((c, i) => ({ ...c, i })).filter(c => (!q || c.n.toLowerCase().includes(q)) && (!cf.diff || c.diff === cf.diff) && (!cf.len || c.len === cf.len) && c.lvl >= cf.min && c.lvl <= cf.max)
          .sort(cf.sort === 'name' ? (a, b) => a.n.localeCompare(b.n) : cf.sort === 'xp' ? (a, b) => parseInt(b.rew[0]) - parseInt(a.rew[0]) : (a, b) => a.lvl - b.lvl);
        out.replaceChildren(el('div', { class: 'resbar' }, el('span', {}, `${list.length} caves`)),
          el('div', { class: 'cavegrid' }, list.map(c => el('div', { class: 'cave', style: { '--c': DIFF_COL[c.diff] || '#aaa' } },
            el('div', { class: 'cavehead' }, el('b', {}, c.n), el('span', { class: 'rt lvl' }, 'Lv. ' + c.lvl)),
            el('div', { class: 'cavetags' }, el('span', { class: 'rt diff' }, W.cap(c.diff || '?')), el('span', { class: 'rt' }, W.cap(c.len || '?') + (c.time ? ' · ' + c.time : ''))),
            el('p', {}, W.mcHtml(c.desc)),
            el('div', { class: 'caverew' }, c.rew.map(r => el('span', {}, W.mcHtml(r)))),
            el('div', { class: 'caveact' }, coordChip(c.x, c.z, c.y), el('a', { href: mapLink('c:' + c.i, c.x, c.z) }, 'Show on map'))))));
      };
      root.replaceChildren(el('div', { class: 'stack' },
        W.win('Caves', el('p', { class: 'hint', style: { marginTop: 0 } }, `All ${world.caves.length} caves, with level, length, difficulty and rewards. Lootrun camps need most caves in their region done.`),
          el('div', { class: 'filters' },
            el('label', { class: 'grow' }, 'Search', el('input', { type: 'text', value: cf.q, placeholder: 'Cave name', oninput: (e) => { cf.q = e.target.value; run(); } })),
            el('label', {}, 'Difficulty', W.sel([['', 'Any'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['extreme', 'Extreme']], cf.diff, (v) => { cf.diff = v; run(); })),
            el('label', {}, 'Length', W.sel([['', 'Any'], ['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']], cf.len, (v) => { cf.len = v; run(); })),
            el('label', {}, 'Level', el('div', { class: 'range2' }, W.numIn(cf.min, (v) => { cf.min = v; run(); }, 1, 130), el('span', {}, 'to'), W.numIn(cf.max, (v) => { cf.max = v; run(); }, 1, 130))),
            el('label', {}, 'Sort by', W.sel([['lvl', 'Level'], ['name', 'Name'], ['xp', 'XP reward']], cf.sort, (v) => { cf.sort = v; run(); })))),
        out));
      run();
    });
  };
})(window.W);
