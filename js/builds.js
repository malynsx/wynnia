/* Build Library: builds saved from the Loadout Builder, kept in this browser. Each entry keeps the build code,
   a name, your own tags and a snapshot of its numbers (class, archetype, elements, health, damage), so the
   library can sort and filter without loading the game data. */
(function (W) {
  const { el } = W;
  const KEY = 'wynnia.builds';
  const SITE = 'https://malynsx.github.io/wynnia/';
  const ELEM_COL = { earth: '#00aa00', thunder: '#ffff55', water: '#55ffff', fire: '#ff5555', air: '#ffffff', neutral: '#ffaa00' };

  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
  W.builds = {
    list: read,
    get: (id) => read().find(b => b.id === id) || null,
    /* add or update; returns the saved entry */
    save(entry) {
      const list = read(), now = new Date().toISOString();
      const i = entry.id ? list.findIndex(b => b.id === entry.id) : -1;
      const out = Object.assign({ created: now }, i >= 0 ? list[i] : {}, entry, { id: entry.id || Math.random().toString(36).slice(2, 10), updated: now });
      if (i >= 0) list[i] = out; else list.unshift(out);
      write(list);
      return out;
    },
    remove(id) { write(read().filter(b => b.id !== id)); },
  };

  /* the link that opens a saved build in the Loadout Builder */
  W.buildLink = (b, local) => (local ? location.href.split('#')[0] : SITE) + '#items/loadout?b=' + b.code + (b.name ? '&n=' + encodeURIComponent(b.name) : '');
  /* tags the build earns by itself: class, archetype and its main damage elements */
  W.buildAutoTags = (s) => [s && s.cls && W.cap(s.cls), s && s.arch, ...((s && s.elems) || []).map(W.cap)].filter(Boolean);
  const fmt = (n) => n == null ? '—' : Math.abs(n) >= 10000 ? W.short(n) : Math.round(n).toLocaleString('en-US');

  const LF = { q: '', cls: '', tag: '', sort: 'updated' };
  W.pages['items/builds'] = function (root) {
    const draw = () => {
      const all = read();
      const tagsOf = (b) => [...W.buildAutoTags(b.snap), ...(b.tags || [])];
      const allTags = [...new Set(all.flatMap(b => b.tags || []))].sort();
      const q = LF.q.trim().toLowerCase();
      const shown = all.filter(b => (!LF.cls || (b.snap && b.snap.cls) === LF.cls) && (!LF.tag || tagsOf(b).includes(LF.tag))
        && (!q || [b.name, b.notes, (b.snap || {}).weapon, ...tagsOf(b)].some(t => t && String(t).toLowerCase().includes(q))))
        .sort((a, b) => LF.sort === 'name' ? (a.name || '').localeCompare(b.name || '') : LF.sort === 'dps' ? ((b.snap || {}).dps || 0) - ((a.snap || {}).dps || 0)
          : LF.sort === 'ehp' ? ((b.snap || {}).ehp || 0) - ((a.snap || {}).ehp || 0) : String(b.updated).localeCompare(String(a.updated)));
      const classes = ['archer', 'warrior', 'mage', 'assassin', 'shaman'];
      root.replaceChildren(el('div', { class: 'stack' },
        W.win('Build library',
          el('p', { class: 'hint', style: { marginTop: 0 } }, 'Builds you save in the Loadout Builder land here. They stay in this browser; use Back up to keep a copy or move them to another device.'),
          el('div', { class: 'libtools' },
            el('input', { type: 'search', placeholder: 'Search names, weapons, tags…', value: LF.q, oninput: (e) => { LF.q = e.target.value; const c = e.target.selectionStart; draw(); const i = root.querySelector('.libtools input'); i.focus(); i.setSelectionRange(c, c); } }),
            W.sel([['updated', 'Recently changed'], ['name', 'Name'], ['dps', 'Main attack DPS'], ['ehp', 'Effective HP']], LF.sort, (v) => { LF.sort = v; draw(); })),
          el('div', { class: 'libchips' },
            el('button', { class: 'chipbtn' + (!LF.cls ? ' on' : ''), onclick: () => { LF.cls = ''; draw(); } }, 'All classes'),
            classes.map(c => el('button', { class: 'chipbtn' + (LF.cls === c ? ' on' : ''), onclick: () => { LF.cls = LF.cls === c ? '' : c; draw(); } }, W.art.wiki(c), W.cap(c),
              el('small', {}, all.filter(b => (b.snap || {}).cls === c).length)))),
          allTags.length ? el('div', { class: 'libchips' }, el('span', { class: 'cap' }, 'Your tags'),
            allTags.map(t => el('button', { class: 'chipbtn tag' + (LF.tag === t ? ' on' : ''), onclick: () => { LF.tag = LF.tag === t ? '' : t; draw(); } }, t))) : null,
          el('div', { class: 'btns' },
            el('a', { class: 'btnlink', href: '#items/loadout' }, 'New build'),
            importBox(),
            el('button', { onclick: backup, disabled: !all.length }, 'Back up'),
            el('label', { class: 'btnfile' }, 'Restore', el('input', { type: 'file', accept: '.json,application/json', onchange: restore })))),
        shown.length ? el('div', { class: 'libgrid' }, shown.map(card))
          : W.win(all.length ? 'No matches' : 'No saved builds yet', el('p', { class: 'empty' }, all.length ? 'Nothing matches those filters.' : 'Open the Loadout Builder, put a build together and press Save to library. Builds people share with you can be saved the same way.'))));
    };

    function card(b) {
      const s = b.snap || {};
      const open = '#items/loadout?b=' + b.code + (b.name ? '&n=' + encodeURIComponent(b.name) : '') + '&lib=' + b.id;
      return el('article', { class: 'libcard', style: { '--rc': s.rar ? W.tierColor(s.rar) : '#4a3d66' } },
        el('div', { class: 'libhead' },
          el('a', { class: 'islot', href: open, 'aria-label': 'Open ' + (b.name || 'build') }, s.ic ? W.art.item(s.ic) : W.art.wiki(s.cls || 'weaponsmithing')),
          el('div', {}, el('a', { class: 'libname', href: open }, b.name || 'Untitled build'),
            el('small', {}, [s.cls && W.cap(s.cls), s.arch, s.lvl && 'Lv. ' + s.lvl].filter(Boolean).join(' · ') || 'No weapon yet'),
            s.weapon ? el('small', { style: { color: s.rar === 'mythic' ? '#cf5ce8' : s.rar ? W.tierColor(s.rar) : '' } }, s.weapon) : null)),
        el('div', { class: 'libtags' }, W.buildAutoTags(s).map(t => el('span', { class: 'chip auto', style: ELEM_COL[t.toLowerCase()] ? { '--ec': ELEM_COL[t.toLowerCase()] } : null }, t)),
          (b.tags || []).map(t => el('span', { class: 'chip' }, t))),
        el('div', { class: 'libstats' },
          el('div', {}, el('b', {}, fmt(s.hp)), el('span', {}, 'Health')),
          el('div', {}, el('b', {}, fmt(s.ehp)), el('span', {}, 'EHP')),
          el('div', {}, el('b', {}, fmt(s.dps)), el('span', {}, 'Main DPS')),
          el('div', {}, el('b', {}, fmt(s.spellDmg)), el('span', {}, s.spell || 'Best spell'))),
        b.notes ? el('p', { class: 'libnotes' }, b.notes) : null,
        el('div', { class: 'libfoot' },
          el('small', {}, 'Saved ' + W.ago(b.updated)),
          el('div', { class: 'libbtns' },
            el('a', { class: 'btnlink mini', href: open }, 'Open'),
            el('button', { class: 'mini', title: 'Copy a short link to this build', onclick: (e) => W.copyShort(W.buildLink(b, true), e.target) }, 'Share'),
            el('button', { class: 'mini danger', title: 'Delete from the library', onclick: () => { if (confirm(`Delete "${b.name || 'Untitled build'}" from your library?`)) { W.builds.remove(b.id); draw(); } } }, 'Delete'))));
    }

    /* paste any Wynnia build link (full or short) and open it in the builder, ready to save */
    function importBox() {
      const inp = el('input', { type: 'text', placeholder: 'Paste a build link to open it' });
      const go = (e) => {
        const v = inp.value.trim(), btn = e && e.target;
        const short = /(?:#s\/|\/b\/)([A-Za-z0-9]{4,12})\b/.exec(v), full = /#(items\/loadout\?[^\s]+)/.exec(v);
        if (full) { location.hash = full[1]; return; }
        if (!short) { inp.setCustomValidity('That isn’t a Wynnia build link.'); inp.reportValidity(); return; }
        if (btn) btn.textContent = 'Opening…';
        W.resolveShort(short[1]).then(h => { if (!/^#items\/loadout\?/.test(h)) throw new Error('That link isn’t a build.'); location.hash = h.slice(1); })
          .catch(err => { if (btn) btn.textContent = 'Open'; inp.setCustomValidity(err.message); inp.reportValidity(); });
      };
      inp.addEventListener('input', () => inp.setCustomValidity(''));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      return el('div', { class: 'search libimport' }, inp, el('button', { onclick: go }, 'Open'));
    }
    function backup() {
      const blob = new Blob([JSON.stringify({ wynnia: 'builds', v: 1, builds: read() }, null, 1)], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'wynnia-builds.json' });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    function restore(e) {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => {
        const d = JSON.parse(t), got = (d && d.builds) || [];
        if (!Array.isArray(got)) throw new Error();
        const have = new Set(read().map(b => b.id));
        let n = 0;
        got.filter(b => b && typeof b.code === 'string').forEach(b => { if (!have.has(b.id)) { W.builds.save(b); n++; } });
        alert(n ? `Added ${n} build${n === 1 ? '' : 's'}.` : 'Those builds are already in your library.');
        draw();
      }).catch(() => alert('That file isn’t a Wynnia build backup.'));
    }
    draw();
  };
})(window.W);
