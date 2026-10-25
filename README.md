# Wynntools

Handy tools for Wynncraft, made by Malyns. A static site: open `index.html` or serve the folder.

- **Mounts**: stable manager with Wynntils import, breeding predictions, pair finder, lineage planner, feed planner, training, timers, market maths, "wanted" posters, breed ledger and almanac (formerly Paddock).
- **Items**: search every item by type, rarity, class, level and identification; compare up to four side by side.
- **Crafting**: ingredient combiner with placement effectiveness, and an ingredient browser.
- **Professions**: XP calculator and a gathering material list.
- **Players**: lookup with mount access, head-to-head compare, quest checklist.
- **Guilds**: lookup with members and ranks, territory snapshot.

## Data

`tools/build_data.py` writes the trimmed game data in `data/` and downloads missing icons into `img/`. A GitHub Action runs it every week. Run it by hand with:

```bash
pip install pillow
python tools/build_data.py
```

Sources: Wynntils static data, the Wynncraft item guide, the Wynncraft Wiki and the Wynncraft API. Ingredient icons are the Minecraft items they appear as (PrismarineJS minecraft-assets).

## Live player and guild lookups

The Wynncraft API sends no CORS headers, so browsers refuse to let other websites read it. `proxy/worker.js` is a small Cloudflare Worker that forwards only player and guild requests, adds CORS for this site and caches each answer for two minutes. To switch lookups on:

1. In the Cloudflare dashboard, go to Workers & Pages → Create → Worker, paste `proxy/worker.js` and deploy (or run `npx wrangler deploy` inside `proxy/`).
2. Put the worker's address (for example `https://wynntools-api.<you>.workers.dev`) into `W.API_RELAY` in `js/shared.js`.

Fan-made; not affiliated with Wynncraft or Mojang.
