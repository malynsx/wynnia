/* Detailed view of one character from the player API, with numbers worked out from it:
   XP left to the next level, per-hour rates, best grinding spot per profession, quest progress. */
(function (W) {
  const { el } = W;
  const GATHER = ['woodcutting', 'mining', 'fishing', 'farming'];
  const CRAFT = ['alchemism', 'armouring', 'cooking', 'jeweling', 'scribing', 'tailoring', 'weaponsmithing', 'woodworking'];
  const SKILLS = [['strength', 'Strength', 'earth'], ['dexterity', 'Dexterity', 'thunder'], ['intelligence', 'Intelligence', 'water'], ['defense', 'Defence', 'fire'], ['agility', 'Agility', 'air']];
  const qkey = (n) => String(n).toLowerCase().replace(/^realm of light [ivx]+ - /, '').replace(/[^a-z0-9]/g, '');

  const stat = (label, value, sub) => el('div', { class: 'cstat' }, el('b', {}, value == null ? '—' : value), el('span', {}, label), sub ? el('small', {}, sub) : null);
  const fmt = (n) => n == null ? null : Number(n).toLocaleString();
  const per = (n, hours, unit) => (n != null && hours > 0) ? `${W.num(n / hours, n / hours < 10 ? 1 : 0)} ${unit}` : null;

  function barList(obj, colour) {
    const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return el('p', { class: 'empty' }, 'None yet.');
    const top = rows[0][1] || 1;
    return el('div', { class: 'blist' }, rows.map(([name, n]) => el('div', { class: 'brow2' },
      el('span', {}, name.replace(/^Corrupted /, ''), /^Corrupted /.test(name) ? el('em', {}, 'Corrupted') : null),
      el('div', { class: 'cbar' }, el('i', { class: colour, style: { width: n / top * 100 + '%' } }), el('b', {}, n)))));
  }

  W.charDetail = (c, player, ref) => {
    const [profxp, spots, quests] = ref || [];
    const hours = c.playtime || 0;
    const art = W.CLASS_ART[String(c.reskin || c.type || '').toLowerCase()] || 'warrior';
    const clsName = W.cap(String(c.reskin || c.type || '').toLowerCase());
    const levelTotal = c.xpPercent ? c.xp / (c.xpPercent / 100) : null;
    const toNext = levelTotal ? Math.max(0, Math.round(levelTotal - c.xp)) : null;

    /* Professions */
    const xpLeft = (p) => profxp && profxp[p.level - 1] ? Math.round(profxp[p.level - 1] * (1 - (p.xpPercent || 0) / 100)) : null;
    const bestSpot = (prof, lvl) => {
      const list = spots && spots[prof]; if (!list) return null;
      const m = list.filter(x => x.l <= lvl).pop(); return m && m.spots[0] ? { mat: m.r, ...m.spots[0] } : null;
    };
    const profCard = (name) => {
      const p = (c.professions || {})[name] || { level: 1, xpPercent: 0 };
      const left = xpLeft(p), spot = GATHER.includes(name) ? bestSpot(name, p.level) : null;
      return el('div', { class: 'pcard' },
        el('div', { class: 'pico' }, W.art.wiki(name)),
        el('div', { class: 'pbody' },
          el('div', { class: 'phead2' }, el('b', {}, W.cap(name)), el('span', {}, 'Lv. ' + p.level)),
          el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: (p.xpPercent || 0) + '%', '--c': 'var(--gold)' } })),
          el('small', {}, left != null ? `${p.xpPercent || 0}% · ${left.toLocaleString()} XP to Lv. ${p.level + 1}` : `${p.xpPercent || 0}%`),
          spot ? el('a', { class: 'pspot', href: '#professions/spots' }, `Best now: ${W.cap(spot.mat)} at ${spot.area || spot.near}`) : null));
    };
    const profs = c.professions || {};
    const gatherTotal = GATHER.reduce((a, p) => a + ((profs[p] || {}).level || 1), 0);
    const craftTotal = CRAFT.reduce((a, p) => a + ((profs[p] || {}).level || 1), 0);

    /* Skill points */
    const sp = c.skillPoints || {}, spTotal = SKILLS.reduce((a, [k]) => a + (sp[k] || 0), 0), spTop = Math.max(1, ...SKILLS.map(([k]) => sp[k] || 0));

    /* Quests */
    let questBox = null;
    if (quests) {
      const done = new Set((c.quests || []).map(qkey));
      const have = quests.filter(x => done.has(qkey(x.n))).length;
      const open = quests.filter(x => !done.has(qkey(x.n)) && x.l <= (c.level || 0));
      questBox = W.win('Quests',
        el('div', { class: 'cbar big' }, el('i', { class: 'good', style: { width: have / quests.length * 100 + '%' } }), el('b', {}, `${have} of ${quests.length} quests`)),
        el('p', { class: 'hint' }, open.length ? `${open.length} unfinished quests are at or below this character’s level. The lowest: ` : 'Every quest at this level is done.',
          open.slice(0, 3).map((x, i) => [i ? ', ' : '', el('b', {}, `${x.n} (${x.l})`)])),
        el('div', { class: 'btns' }, el('a', { class: 'btnlink', href: `#players/quests?u=${encodeURIComponent(player.username)}&c=${encodeURIComponent(c.id)}` }, 'Open the quest checklist')));
    }

    const modes = (c.gamemode || []).map(m => el('span', { class: 'mode' }, W.words(String(m)).replace(/_/g, ' ')));
    return el('div', { class: 'stack chardetail', id: 'chardetail' },
      el('section', { class: 'herocard char' },
        el('div', { class: 'heroportrait small' }, W.art.wiki(art)),
        el('div', { class: 'heroinfo' },
          el('div', { class: 'heroname' }, el('h2', {}, c.nickname || clsName), modes),
          el('div', { class: 'herometa' },
            el('span', {}, c.reskin ? `${clsName} (${W.cap(String(c.type).toLowerCase())} reskin)` : clsName),
            el('span', {}, `${player.username}’s character`), c.preEconomy ? el('span', { class: 'mode' }, 'Pre-economy') : null),
          el('div', { class: 'glevel' }, el('b', {}, 'Combat Lv. ' + c.level),
            el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: (c.xpPercent || 0) + '%', '--c': 'var(--gold)' } })),
            el('span', {}, toNext != null ? `${c.xpPercent}% · ${W.short(toNext)} XP to go` : (c.xpPercent ?? 0) + '%')),
          el('div', { class: 'herotiles four' },
            stat('Total level', fmt(c.totalLevel)), stat('Playtime', hours ? W.num(hours, 1) + ' h' : null),
            stat('Content done', fmt(c.contentCompletion)), stat('Quests', (c.quests || []).length)))),
      el('div', { class: 'cols' },
        W.win('Combat & activity', el('div', { class: 'cstats' },
          stat('Mobs killed', fmt(c.mobsKilled), per(c.mobsKilled, hours, 'per hour')),
          stat('Deaths', fmt(c.deaths), per(c.deaths, hours, 'per hour')),
          stat('Logins', fmt(c.logins), c.logins && hours ? `${W.num(hours * 60 / c.logins, 0)} min per session` : null),
          stat('Chests found', fmt(c.chestsFound), per(c.chestsFound, hours, 'per hour')),
          stat('Discoveries', fmt(c.discoveries)),
          stat('Caves', fmt(c.caves)),
          stat('World events', fmt(c.worldEvents)),
          stat('Lootruns', fmt(c.lootruns)),
          stat('Wars', fmt(c.wars)),
          stat('Items identified', fmt(c.itemsIdentified)),
          stat('Blocks walked', c.blocksWalked != null ? W.short(c.blocksWalked) : null),
          stat('PvP', c.pvp && c.pvp.kills != null ? `${c.pvp.kills} / ${c.pvp.deaths}` : null, c.pvp && c.pvp.kills != null ? 'kills / deaths' : null))),
        W.win(`Skill points · ${spTotal} assigned`, el('div', { class: 'skills' }, SKILLS.map(([k, label, elem]) => el('div', { class: 'skill' },
          el('span', { style: { color: W.ELEM[elem] } }, label),
          el('div', { class: 'cbar' }, el('i', { style: { width: (sp[k] || 0) / spTop * 100 + '%', background: W.ELEM[elem] } })), el('b', { class: 'snum' }, sp[k] || 0)))),
          el('p', { class: 'hint' }, 'Points assigned on this character, not counting gear bonuses.'))),
      W.win(`Professions · ${gatherTotal} gathering, ${craftTotal} crafting levels`,
        el('div', { class: 'cap left', style: { marginTop: 0 } }, 'Gathering'), el('div', { class: 'pgrid' }, GATHER.map(profCard)),
        el('div', { class: 'cap left' }, 'Crafting'), el('div', { class: 'pgrid' }, CRAFT.map(profCard))),
      el('div', { class: 'cols' },
        W.win(`Dungeons · ${(c.dungeons && c.dungeons.total) || 0} runs`, barList(c.dungeons && c.dungeons.list, 'gold')),
        W.win(`Raids · ${(c.raids && c.raids.total) || 0} runs`, barList(c.raids && c.raids.list, 'good'))),
      questBox);
  };
})(window.W);
