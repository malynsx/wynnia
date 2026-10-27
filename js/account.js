/* Optional "Log in with Discord": your builds, stable, watchlists, price alerts and timers follow you to every device,
   and you can link your Wynncraft account (the same link the Discord bot's /link makes). Nothing here is needed to
   use the site. Login and saved data live in the Wynnia bot worker (see proxy/bot.js). */
(function (W) {
  const { el } = W;
  const BOT = 'https://wynnia-bot.connormaltren.workers.dev';
  const TOKEN = 'wynnia.auth', ME = 'wynnia.me', SYNC = 'wynnia.sync', BACKUP = 'wynnia.sync.backup';
  /* what gets saved to your account: every bit of the site that remembers something for you */
  const SYNCED = [
    ['wynnia.builds', 'Build library', 'chestplate.diamond'], ['wt.loadout2', 'Loadout Builder', 'helmet.gold'], ['stableLedger.v1', 'Stable and ledger', 'profession.grainWheat'],
    ['wt.market', 'Mount market', 'profession.ingotGold'], ['wynnia.watch', 'Price alerts', 'profession.gemGold'], ['wt.watch', 'Player watchlist', 'necklace.basicCross'],
    ['wt.timers', 'Timers', 'profession.meatStar'], ['wt.compare', 'Item compare', 'dagger.multi2'], ['wt.theme', 'Theme', 'charm.light'],
  ];
  const KEYS = SYNCED.map(s => s[0]);
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    json: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };

  /* coming back from Discord: #auth=<token>&back=<where you were> (read before the page draws) */
  const m = /^#auth=([0-9a-f]{64})(?:&back=(.*))?$/.exec(location.hash);
  if (m) {
    ls.set(TOKEN, m[1]); ls.set(ME, null);
    history.replaceState(null, '', location.pathname + (m[2] ? decodeURIComponent(m[2]) : '#home/account'));
  }

  const A = W.account = {
    token: () => ls.get(TOKEN),
    me: () => A.token() ? ls.json(ME, null) : null,
    login: () => { location.href = `${BOT}/auth/login?back=${encodeURIComponent(location.hash || '#home/account')}`; },
    logout: async () => {
      const t = A.token();
      ls.set(TOKEN, null); ls.set(ME, null); ls.set(SYNC, null);
      if (t) fetch(`${BOT}/auth/logout`, { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => {});
      chip();
      if (location.hash === '#home/account') window.dispatchEvent(new HashChangeEvent('hashchange')); else W.go('home/account');
    },
    status: '',
  };

  async function api(path, opts = {}) {
    const r = await fetch(BOT + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + A.token() }, opts.body ? { 'Content-Type': 'application/json' } : {}) }));
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && A.token()) { ls.set(TOKEN, null); ls.set(ME, null); chip(); }
    if (!r.ok) throw new Error(j.error || 'The Wynnia server didn’t answer (' + r.status + ').');
    return j;
  }
  A.refresh = () => api('/api/me').then(me => { ls.set(ME, me); chip(); return me; });

  /* ---------- keeping saved data in step ----------
     Every change to a synced key marks this device "dirty" and uploads a few seconds later. On load, if the account
     holds something newer than this device last saw (and this device has nothing unsent), it's copied in and the page
     reloads once. If both changed, this device wins; a device's own data is kept as a backup before it's replaced. */
  let applying = false, timer = null;
  const setItem = Storage.prototype.setItem, removeItem = Storage.prototype.removeItem;
  const touched = (store, k) => {
    if (applying || store !== window.localStorage || !KEYS.includes(k) || !A.token()) return;
    const s = ls.json(SYNC, { at: 0 }); if (!s.dirty) { s.dirty = true; setItem.call(localStorage, SYNC, JSON.stringify(s)); }
    clearTimeout(timer); timer = setTimeout(push, 3000);
  };
  /* only real changes count (the theme picker, for one, rewrites its setting on every load) */
  Storage.prototype.setItem = function (k, v) { const was = this.getItem(k); setItem.call(this, k, v); if (was !== String(v)) touched(this, k); };
  Storage.prototype.removeItem = function (k) { const was = this.getItem(k); removeItem.call(this, k); if (was != null) touched(this, k); };

  const snapshot = () => Object.fromEntries(KEYS.map(k => [k, ls.get(k)]).filter(([, v]) => v != null));
  async function push() {
    if (!A.token()) return;
    try {
      A.status = 'Saving…'; paint();
      const { at } = await api('/api/save', { method: 'PUT', body: JSON.stringify({ data: snapshot() }) });
      ls.set(SYNC, { at, dirty: false }); A.status = 'Saved';
    } catch (e) { A.status = e.message; }
    paint();
  }
  A.syncNow = push;
  async function pull() {
    if (!A.token()) return;
    let srv;
    try { srv = await api('/api/save'); } catch (e) { A.status = e.message; paint(); return; }
    const s = ls.json(SYNC, { at: 0 });
    if (srv.data && srv.at > s.at && !s.dirty) {
      const mine = snapshot();
      if (Object.keys(mine).length && !s.at) ls.set(BACKUP, { at: Date.now(), data: mine });   // first sync on this device: keep what it had
      applying = true;
      KEYS.forEach(k => ls.set(k, srv.data[k] != null ? srv.data[k] : null));
      applying = false;
      ls.set(SYNC, { at: srv.at, dirty: false });
      if (!sessionStorage.getItem('wynnia.synced')) { sessionStorage.setItem('wynnia.synced', '1'); location.reload(); }
      return;
    }
    if (s.dirty || (!srv.data && Object.keys(snapshot()).length)) return push();
    A.status = 'Saved'; paint();
  }
  A.restoreBackup = () => {
    const b = ls.json(BACKUP, null); if (!b) return;
    KEYS.forEach(k => ls.set(k, b.data[k] != null ? b.data[k] : null));   // goes through the hook, so it uploads too
    ls.set(BACKUP, null);
    setTimeout(() => location.reload(), 3500);
  };

  /* ---------- header chip: "Log in" or your Discord avatar ---------- */
  function chip() {
    let box = document.getElementById('acct');
    const top = document.querySelector('header.top');
    if (!top) return;
    if (!box) { box = el('div', { id: 'acct' }); top.insertBefore(box, top.querySelector('.theme-pick')); }
    const me = A.me();
    box.replaceChildren(me
      ? el('a', { class: 'acctchip', href: '#home/account', title: 'Your account' }, me.avatar ? el('img', { src: me.avatar, alt: '' }) : el('span', { class: 'acctnone' }, (me.name || '?')[0]), el('span', {}, me.name))
      : A.token() ? el('a', { class: 'acctchip', href: '#home/account' }, 'Account')
      : el('button', { class: 'acctchip login', onclick: A.login }, 'Log in'));
  }
  let paint = () => {};   // the account page swaps this for its own redraw while it's open

  /* ---------- Home › Account ---------- */
  W.pages['home/account'] = function (root) {
    const draw = () => root.replaceChildren(el('div', { class: 'stack' }, ...(A.token() ? signedIn() : [signedOut()])));
    paint = draw; W.onLeave(() => { paint = () => {}; });
    draw();
    if (A.token()) A.refresh().then(draw).catch(e => { A.status = e.message; draw(); });

    function signedOut() {
      return W.win('Account', el('p', { style: { marginTop: 0 } }, 'Log in with Discord to keep your builds, stable, watchlists, price alerts and timers on every device, and to link your Wynncraft account.'),
        el('p', { class: 'hint' }, 'It’s optional: everything on Wynnia works without an account, and your data stays in this browser until you log in. Wynnia only sees your Discord name and avatar.'),
        el('div', { class: 'btns' }, el('button', { onclick: A.login }, 'Log in with Discord')));
    }

    function signedIn() {
      const me = A.me();
      if (!me) return [W.win('Account', el('p', { class: 'empty' }, 'Loading your account…'))];
      const l = me.linked;
      const name = el('input', { placeholder: 'Your Minecraft username', maxlength: 16, onkeydown: (e) => { if (e.key === 'Enter') doLink(); } });
      const msg = el('div');
      const doLink = () => {
        msg.replaceChildren(el('p', { class: 'hint' }, 'Looking that up…'));
        api('/api/link', { method: 'POST', body: JSON.stringify({ name: name.value }) }).then(() => A.refresh()).then(draw)
          .catch(e => msg.replaceChildren(el('div', { class: 'warn' }, e.message)));
      };
      const s = ls.json(SYNC, { at: 0 }), backup = ls.json(BACKUP, null);
      const unlink = () => api('/api/link', { method: 'DELETE' }).then(() => A.refresh()).then(draw).catch(e => msg.replaceChildren(el('div', { class: 'warn' }, e.message)));
      const saving = A.status && A.status !== 'Saved';
      const when = s.at ? (Date.now() - s.at < 60000 ? 'just now' : W.ago(new Date(s.at).toISOString()) || 'just now') : null;
      return [
        el('section', { class: 'accthero' },
          el('div', { class: 'acctside' },
            me.avatar ? el('img', { class: 'acctav', src: me.avatar, alt: '' }) : el('span', { class: 'acctnone big' }, (me.name || '?')[0]),
            el('div', { class: 'acctwho' }, el('small', { class: 'eyebrow' }, 'Discord'), el('h2', {}, me.name), el('span', { class: 'muted' }, '@' + me.username),
              el('button', { class: 'mini', onclick: A.logout }, 'Log out'))),
          el('div', { class: 'acctside' }, ...(l
            ? [el('img', { class: 'acctskin', src: `https://mc-heads.net/head/${l.uuid}/120`, alt: '' }),
              el('div', { class: 'acctwho' }, el('small', { class: 'eyebrow' }, 'Wynncraft'), el('h2', {}, l.name), el('span', { class: 'muted' }, 'Linked: your profile shows the Discord badge'),
                el('div', { class: 'acctbtns' },
                  el('a', { class: 'btnlink', href: '#players/lookup?u=' + encodeURIComponent(l.name) }, 'Open my profile'),
                  el('a', { class: 'btnlink alt', href: '#players/plan?u=' + encodeURIComponent(l.name) }, 'My next steps'),
                  el('button', { class: 'mini', onclick: unlink }, 'Unlink')), msg)]
            : [el('div', { class: 'acctwho' }, el('small', { class: 'eyebrow' }, 'Wynncraft'), el('h2', {}, 'Not linked yet'),
              el('span', { class: 'muted' }, 'Link your username to open your profile in one click, get the Discord badge on it, and use /me in the bot.'),
              el('div', { class: 'acctrow' }, name, el('button', { onclick: doLink }, 'Link')), msg)]))),
        W.win('Saved to your account',
          el('div', { class: 'acctstatus' },
            el('span', { class: 'dot ' + (saving ? (A.status === 'Saving…' ? 'busy' : 'bad') : s.at ? 'ok' : '') }),
            el('span', {}, saving ? A.status : when ? `Everything is saved to your account. Last saved ${when}.` : 'Nothing saved yet.'),
            el('button', { class: 'mini', onclick: push }, 'Save now')),
          el('div', { class: 'acctsync' }, SYNCED.map(([k, label, icon]) => {
            const c = describe(k);
            return el('div', { class: 'acctitem' + (c ? '' : ' off') }, el('img', { src: `img/items/${icon}.webp`, alt: '' }),
              el('div', {}, el('b', {}, label), el('small', {}, c || 'Nothing yet')));
          })),
          backup ? el('p', { class: 'hint' }, 'This browser had its own data before you logged in. ',
            el('a', { href: '#home/account', onclick: (e) => { e.preventDefault(); if (confirm('Replace your saved data with what this browser had before you logged in?')) A.restoreBackup(); } }, 'Use that instead')) : null)];
    }
  };

  /* a short line about what each saved thing holds, or null when it's empty */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  function describe(k) {
    const v = ls.json(k, null);
    if (v == null || (Array.isArray(v) && !v.length)) return null;
    switch (k) {
      case 'wynnia.builds': return plural(v.length, 'build');
      case 'wt.loadout2': { const n = Object.values(v.s || {}).filter(Boolean).length; return n ? plural(n, 'gear slot') + ' filled' : null; }
      case 'stableLedger.v1': return [(v.mounts || []).length && plural(v.mounts.length, 'mount'), (v.ledger || []).length && plural(v.ledger.length, 'ledger entry', 'ledger entries')].filter(Boolean).join(', ') || null;
      case 'wt.market': return plural((v.rows || []).length, 'listing');
      case 'wynnia.watch': return plural(v.length, 'item') + ' watched';
      case 'wt.watch': return plural(v.length, 'player');
      case 'wt.timers': return plural(v.length, 'timer');
      case 'wt.compare': return plural(v.length, 'item');
      case 'wt.theme': return W.cap(ls.get(k));
      default: return 'Saved';
    }
  }

  /* is this Wynncraft account linked to a Discord account (for the profile badge); asked once per page load */
  const linkedCache = {};
  W.linkedDiscord = (uuid) => linkedCache[uuid] || (linkedCache[uuid] = fetch(`${BOT}/api/linked?uuid=${encodeURIComponent(uuid)}`).then(r => r.ok ? r.json() : {}).then(j => !!j.linked).catch(() => false));

  document.addEventListener('DOMContentLoaded', () => {
    chip();
    if (A.token()) { A.refresh().catch(() => {}); pull(); }
  });
})(window.W);
