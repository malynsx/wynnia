# Wynnia

Handy tools for Wynncraft, made by Malyns. A static site: open `index.html` or serve the folder. Live at https://malynsx.github.io/wynntools/

- **Mounts**: stable with Wynntils import and share links, breeding predictions, pair finder, lineage planner, feed planner, training, timers, market maths, "wanted" posters, breed ledger (paste a breed from Wynntils) and almanac.
- **Items**: search and compare every item; loadout builder with Wynntils paste (exact rolls and powders), skill point check and share links.
- **Crafting**: ingredient combiner, ingredient finder, ingredient browser.
- **Professions**: XP calculator, grinding spots (Olinus10's picks plus node clusters), material calculator, gathering list.
- **Players**: lookup with character breakdowns and ability trees, compare (accounts and characters), watchlist, leaderboards, quest checklist.
- **Guilds**: lookup with banner, members, top contributors and newest members; territory snapshot.
- **Quick search** in the header (press `/`), five themes, works on phones.

## Wynnia API

Static, CORS-open JSON at `https://malynsx.github.io/wynntools/api/v1/` (items, ingredients, materials, recipes, quests, spots, Olinus10's spots, territories, profession XP). Docs on the site under Home › API.

## Data

`tools/build_data.py` writes the trimmed game data in `data/`, the public API in `api/v1/` and downloads missing icons into `img/`. A GitHub Action runs it every week. By hand:

```bash
pip install pillow
python tools/build_data.py
```

Sources: Wynntils static data, the Wynncraft item guide, the Wynncraft Wiki, the Wynncraft API, Olinus10's leveling guides (`data/olinus.json`, edited by hand). Ingredient icons are the Minecraft items they appear as (PrismarineJS minecraft-assets).

## Live player and guild lookups

The Wynncraft API sends no CORS headers, so browsers refuse to let other websites read it. `proxy/worker.js` is a small Cloudflare Worker that forwards player, guild, ability-tree and leaderboard requests, adds CORS for this site and caches each answer for two minutes. Deploy it in the Cloudflare dashboard (Workers & Pages → your worker → Edit code → paste → Deploy) and set its address in `W.API_RELAY` in `js/shared.js`.

Fan-made; not affiliated with Wynncraft or Mojang.
