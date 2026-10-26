/* World > Events: world events starting soon (Wynncraft API, which shows the next 15 minutes), this week's lootrun
   and raid loot pools with a countdown to the weekly reset, and the guild season's end. Countdowns tick in place. */
(function (W) {
  const { el } = W;
  const DIFF_COL = { EASY: '#87b85b', MEDIUM: '#e0c27a', HARD: '#d9894a' };
  const EF = { lo: 1, hi: 132, all: false };

  /* Loot pools turn over every Friday at 19:00 UTC (Wynnpool's reset time; Wynncraft doesn't publish one). */
  const nextPoolReset = (now = Date.now()) => {
    const d = new Date(now); d.setUTCHours(19, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
    if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
    return d.getTime();
  };
  const left = (ms) => {
    if (ms <= 0) return 'Starting';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
  };
  /* a text node that keeps counting down to `at` */
  const tickers = new Set();
  const countdown = (at, cls) => { const n = el('b', { class: cls || '' }, left(at - Date.now())); n._at = at; tickers.add(n); return n; };
  const mapLink = (ev) => {
    const locs = ev.location || [], pins = locs.map((l, i) => `${l.event.x}_${l.event.z}_${encodeURIComponent(ev.name + (locs.length > 1 ? ' ' + (i + 1) : ''))}`);
    const c = locs[0] && locs[0].event;
    return c ? `#world/map?m=world&p=${pins.join(';')}&v=${c.x},${c.z},0.5` : null;
  };

  W.pages['world/events'] = function (root) {
    let events = null, evErr = null, pools = null, poolErr = null, season = null;
    const tick = setInterval(() => tickers.forEach(n => { if (!n.isConnected) return tickers.delete(n); n.textContent = left(n._at - Date.now()); }), 1000);
    let refresh = 0;
    W.onLeave(() => { clearInterval(tick); clearInterval(refresh); tickers.clear(); });

    W.withData(root, ['items'], (items) => {
      const byName = Object.fromEntries(items.map(i => [i.n, i]));
      const loadEvents = () => W.api('map/world-events').then(d => { events = d; evErr = null; draw(); }).catch(e => { evErr = e.message; draw(); });
      loadEvents();
      refresh = setInterval(loadEvents, 60000);   // the API only looks 15 minutes ahead, so keep asking
      W.api('map/loot-pools').then(d => { pools = d; draw(); }).catch(e => { poolErr = e.message; draw(); });
      W.api('guild/seasons').then(d => {
        const k = Object.keys(d).sort((a, b) => b - a)[0];
        if (k) season = { n: k, end: Date.parse(d[k].endDate), sr: d[k] }; draw();
      }).catch(() => {});
      draw();

      function draw() {
        tickers.clear();
        const now = Date.now();
        const soon = (events || []).filter(e => e.schedule).sort((a, b) => Date.parse(a.schedule) - Date.parse(b.schedule));
        const next = soon.find(e => Date.parse(e.schedule) > now);
        root.replaceChildren(el('div', { class: 'stack' },
          el('div', { class: 'kpi evkpi' },
            el('div', {}, countdown(nextPoolReset()), el('span', {}, 'Loot pools reset')),
            el('div', {}, next ? countdown(Date.parse(next.schedule)) : el('b', {}, '—'), el('span', {}, next ? 'Next: ' + next.name : 'Next world event')),
            el('div', {}, season && season.end > now ? countdown(season.end) : el('b', {}, '—'), el('span', {}, season ? `Guild season ${season.n} ends` : 'Guild season'))),
          eventsWin(soon), poolsWin()));
      }

      function eventsWin(soon) {
        if (evErr) return W.win('World events', el('div', { class: 'warn' }, relayMsg(evErr)));
        if (!events) return W.win('World events', el('p', { class: 'empty' }, 'Loading world events…'));
        const now = Date.now(), inLvl = (e) => e.level >= EF.lo && e.level <= EF.hi;
        const row = (e) => {
          const at = e.schedule ? Date.parse(e.schedule) : null, link = mapLink(e);
          return el('div', { class: 'evrow' + (at && at <= now ? ' live' : '') },
            el('span', { class: 'evlvl' }, 'Lv. ' + e.level),
            el('div', { class: 'evname' }, el('b', {}, e.name),
              el('small', {}, el('i', { class: 'sw', style: { background: DIFF_COL[e.difficulty] || '#aaa' } }), `${W.cap(String(e.difficulty).toLowerCase())} · ${W.cap(String(e.length).toLowerCase())}` +
                ((e.location || []).length > 1 ? ` · ${(e.location || []).length} possible spots` : ''))),
            el('div', { class: 'evwhen' }, at ? (at <= now ? el('b', { class: 'up' }, 'Started') : countdown(at)) : el('small', {}, 'Not in the next 15 min')),
            link ? el('a', { class: 'btnlink mini', href: link }, 'Map') : null);
        };
        const shown = soon.filter(inLvl);
        return W.win('World events',
          el('div', { class: 'evtools' },
            el('label', {}, 'Levels ', W.numIn(EF.lo, (v) => { EF.lo = v; draw(); }, 1, 132), ' to ', W.numIn(EF.hi, (v) => { EF.hi = v; draw(); }, 1, 132)),
            el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: EF.all, onchange: (e) => { EF.all = e.target.checked; draw(); } }), 'Show every event')),
          shown.length ? el('div', { class: 'evlist' }, shown.map(row)) : el('p', { class: 'empty' }, 'Nothing in that level range starts in the next 15 minutes. This list refreshes every minute.'),
          EF.all ? el('div', { class: 'cap left' }, `Every world event · ${events.filter(inLvl).length}`) : null,
          EF.all ? el('div', { class: 'evlist' }, events.filter(e => !e.schedule && inLvl(e)).sort((a, b) => a.level - b.level).map(row)) : null,
          el('p', { class: 'hint' }, 'Wynncraft only shows world events starting in the next 15 minutes, so this checks again every minute. Map pins every spot the event can appear at. Annihilation isn’t listed: it comes around every few days at times Wynncraft doesn’t publish.'));
      }

      function poolsWin() {
        if (poolErr) return W.win('This week’s loot pools', el('div', { class: 'warn' }, relayMsg(poolErr)));
        if (!pools) return W.win('This week’s loot pools', el('p', { class: 'empty' }, 'Loading loot pools…'));
        const TIER_ORDER = ['MYTHIC', 'FABLED', 'LEGENDARY'];
        const card = (p) => {
          const top = p.rewards.filter(r => r.type === 'ITEM' && TIER_ORDER.includes(r.tier)).sort((a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
          const other = p.rewards.filter(r => r.type !== 'ITEM').map(r => r.name);
          return el('div', { class: 'poolcard' },
            el('div', { class: 'poolhead' }, el('img', { src: p.type === 'RAID' ? 'img/guide/' + (p.name.replace(/[^A-Za-z']/g, '') + 'Icon').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png' : 'img/guide/inspect-beacon-rainbow.png', alt: '' }),
              el('div', {}, el('b', {}, p.name), el('small', {}, p.type === 'RAID' ? 'Raid reward pool' : 'Lootrun camp'))),
            el('div', { class: 'poolitems' }, top.map(r => {
              const it = byName[r.name], tier = r.tier.toLowerCase();
              const chip = el('span', { class: 'poolitem' + (r.shiny ? ' shiny' : ''), style: { '--tc': tier === 'mythic' ? '#cf5ce8' : W.tierColor(tier) } }, it ? W.art.item(it.ic) : null, r.name, r.shiny ? el('small', {}, 'Shiny') : null);
              return it ? W.tip(chip, () => W.itemCard(it)) : chip;
            })),
            other.length ? el('small', { class: 'poolother' }, 'Also: ' + [...new Set(other)].slice(0, 6).join(', ') + (other.length > 6 ? '…' : '')) : null);
        };
        return W.win('This week’s loot pools',
          el('p', { class: 'hint', style: { marginTop: 0 } }, 'Mythic, fabled and legendary items in each pool this week. They change every Friday at 19:00 UTC (', new Date(nextPoolReset()).toLocaleString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' }), ' your time).'),
          el('div', { class: 'poolgrid' }, pools.map(card)));
      }
    });
  };
  /* the old relay doesn't pass map requests on yet */
  const relayMsg = (m) => /not found|404/i.test(m) ? 'The Wynnia relay needs updating before it can show this (proxy/worker.js).' : m;
})(window.W);
