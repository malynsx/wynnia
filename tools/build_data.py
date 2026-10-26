"""Builds the trimmed game data in data/ and downloads any icons that are missing in img/.

Sources:
  - Wynntils static data (gear, ingredients, materials, territories)  https://cdn.wynntils.com/static/
  - Wynncraft item icons                                              https://cdn.wynncraft.com/nextgen/itemguide/3.3/
  - Minecraft item textures for ingredients (PrismarineJS assets)
  - Wynncraft Wiki (quest list, profession XP chart)

Run from the repo root:  python tools/build_data.py
"""
import concurrent.futures as cf
import datetime
import html
import io
import json
import os
import re
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
UA = {'User-Agent': 'Mozilla/5.0 (Wynnia data builder; github.com/fuller-i/wynntools)'}
ITEM_CDN = 'https://cdn.wynncraft.com/nextgen/itemguide/3.3/'
MC_ASSETS = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2/'
LEGACY = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/common/legacy.json'
WIKI_API = 'https://wynncraft.wiki.gg/api.php'

# Legacy ids whose modern texture is not stored under the plain name.
TEXTURE_FALLBACKS = {
    '148:0': 'blocks/iron_block.png', '171:0': 'blocks/white_wool.png', '171:14': 'blocks/red_wool.png',
    '171:7': 'blocks/gray_wool.png', '213:0': 'blocks/magma.png', '29:0': 'blocks/piston_top_sticky.png',
    '323:0': 'items/oak_sign.png', '67:0': 'blocks/cobblestone.png', '70:0': 'blocks/stone.png',
    '77:0': 'blocks/stone.png', '80:0': 'blocks/snow.png', '97:4': 'blocks/cracked_stone_bricks.png',
    '392:0': 'items/potato.png', '437:0': 'items/dragon_breath.png',
}


def get(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def get_json(url):
    return json.loads(get(url))


def save(name, obj):
    with open(os.path.join(DATA, name), 'w', encoding='utf8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def rng(v):
    """Identification value: fixed number, or [min, max]."""
    if isinstance(v, dict):
        return [v.get('min', v.get('raw')), v.get('max', v.get('raw'))]
    return v


def try_download(urls, dest):
    if os.path.exists(dest):
        return True
    for u in urls:
        try:
            b = get(u, 25)
        except Exception:
            continue
        with open(dest, 'wb') as f:
            f.write(b)
        return True
    return False


def shrink(path, size):
    from PIL import Image
    im = Image.open(path).convert('RGBA')
    if max(im.size) > size:
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(path, 'WEBP', quality=90)


def is_blank(im):
    """True when fewer than 2% of the pixels are visible."""
    a = im.convert('RGBA').getchannel('A')
    return sum(a.histogram()[17:]) < a.width * a.height * 0.02


def armour_candidates(name):
    c = [name]
    t, _, m = name.partition('.')
    if t in ('helmet', 'chestplate', 'leggings', 'boots'):
        mm = m.replace('pale_', '')
        c += [f'{m}_{t}', f'{mm}_{t}', f'{mm.replace("gold", "golden")}_{t}', f'{mm.replace("chain", "chainmail")}_{t}']
    return c


def item_icons(names):
    """Download Wynncraft item icons; returns {icon name: file name or None}."""
    os.makedirs(os.path.join(ROOT, 'img', 'items'), exist_ok=True)

    def one(n):
        dest = os.path.join(ROOT, 'img', 'items', n + '.webp')
        fresh = not os.path.exists(dest)
        ok = try_download([ITEM_CDN + c + '.webp' for c in armour_candidates(n)], dest)
        if ok and fresh:
            shrink(dest, 96)
        return n, (n + '.webp') if ok else None

    with cf.ThreadPoolExecutor(8) as ex:
        found = dict(ex.map(one, sorted(names)))
    # The item guide serves some icons as blank placeholders; treat those as missing.
    from PIL import Image
    for n, f in found.items():
        p = os.path.join(ROOT, 'img', 'items', f) if f else None
        if p and is_blank(Image.open(p)):
            os.remove(p)
            found[n] = None
    # Gathering materials the item guide lacks: the wiki has e.g. PlankOakIcon.png.
    missing = [n for n, f in found.items() if not f and n.startswith('profession.')]
    if missing:
        titles = {}
        for n in missing:
            m = re.match(r'profession\.([a-z]+)([A-Z]\w*)', n)
            if m:
                kind, name = m.group(1).capitalize(), m.group(2)
                titles[n] = [f'File:{kind}{name}Icon.png', f'File:{kind}Icon.png']
        wanted = sorted({t for ts in titles.values() for t in ts})
        urls = {}
        for i in range(0, len(wanted), 40):
            d = get_json(WIKI_API + '?' + urllib.parse.urlencode({'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url', 'format': 'json', 'titles': '|'.join(wanted[i:i + 40])}))
            for p in d['query']['pages'].values():
                if 'imageinfo' in p:
                    urls[p['title']] = p['imageinfo'][0]['url']
        for n, ts in titles.items():
            url = next((urls[t] for t in ts if t in urls), None)
            if url:
                dest = os.path.join(ROOT, 'img', 'items', n + '.webp')
                from PIL import Image
                im = Image.open(io.BytesIO(get(url))).convert('RGBA')
                im.thumbnail((96, 96), Image.NEAREST if im.size[0] <= 32 else Image.LANCZOS)
                im.save(dest, 'WEBP', quality=90)
                found[n] = n + '.webp'
    return found


def icon_name(item):
    ic = item.get('icon') or {}
    val = ic.get('value')
    if ic.get('format') == 'attribute' and isinstance(val, dict):
        return val.get('name')
    return None


def build_gear(gear, icons):
    fallback = {}
    for item in gear.values():
        n = icon_name(item)
        sub = item.get('subType') or item.get('type')
        if n and icons.get(n) and sub not in fallback:
            fallback[sub] = icons[n]
    out = []
    for name, it in gear.items():
        req = it.get('requirements') or {}
        sub = it.get('subType') or it.get('type')
        icon = icons.get(icon_name(it)) or fallback.get(sub)
        o = {
            'n': name, 't': sub, 'g': it.get('type'), 'r': it.get('tier') or it.get('rarity'),
            'l': req.get('level', 0), 'ic': icon,
        }
        if req.get('classRequirement'):
            o['c'] = req['classRequirement']
        sk = {k: req[k] for k in ('strength', 'dexterity', 'intelligence', 'defence', 'agility') if req.get(k)}
        if sk:
            o['q'] = sk
        if it.get('base'):
            o['b'] = {k: rng(v) for k, v in it['base'].items()}
        if it.get('identifications'):
            o['i'] = {k: rng(v) for k, v in it['identifications'].items()}
        if it.get('majorIds'):
            o['m'] = list(it['majorIds'].keys())
        for src, dst in (('powderSlots', 'ps'), ('attackSpeed', 'as'), ('averageDps', 'dps'), ('restriction', 'rs')):
            if it.get(src) and it.get(src) != 'none':
                o[dst] = it[src]
        out.append(o)
    out.sort(key=lambda x: (x['l'], x['n']))
    return out


def build_major_ids(gear):
    """Major ID name -> its in-game description (HTML with Wynncraft colours and glyphs, rendered by W.mcHtml)."""
    out = {}
    for it in gear.values():
        for name, desc in (it.get('majorIds') or {}).items():
            out.setdefault(name, desc)
    return dict(sorted(out.items()))


def build_ingredients(ing, adv):
    legacy = get_json(LEGACY)
    os.makedirs(os.path.join(ROOT, 'img', 'ing'), exist_ok=True)
    wanted = {}
    for name, a in adv.items():
        ic = a.get('icon') or {}
        if ic.get('format') == 'legacy':
            key = ic['value']
            mc = (legacy['items'].get(key) or legacy['blocks'].get(key) or legacy['items'].get(key.split(':')[0] + ':0') or 'minecraft:barrier').split(':')[1]
            wanted[key.replace(':', '_') + '.png'] = [MC_ASSETS + TEXTURE_FALLBACKS[key]] if key in TEXTURE_FALLBACKS else \
                [MC_ASSETS + p for p in (f'items/{mc}.png', f'blocks/{mc}.png', f'blocks/{mc}_top.png', f'blocks/{mc}_front.png')]
        elif ic.get('format') == 'skin':
            wanted['skin_' + ic['value'][:16] + '.png'] = [f'https://mc-heads.net/avatar/{ic["value"]}/64']

    def one(kv):
        f, urls = kv
        return f, try_download(urls, os.path.join(ROOT, 'img', 'ing', f))

    with cf.ThreadPoolExecutor(8) as ex:
        have = dict(ex.map(one, wanted.items()))

    tiers = {'TIER_0': 0, 'TIER_1': 1, 'TIER_2': 2, 'TIER_3': 3}
    out = []
    for name, it in ing.items():
        a = adv.get(name) or {}
        ic = a.get('icon') or {}
        f = (ic['value'].replace(':', '_') + '.png') if ic.get('format') == 'legacy' else \
            ('skin_' + ic['value'][:16] + '.png') if ic.get('format') == 'skin' else None
        req = it.get('requirements') or {}
        o = {'n': name, 'tr': tiers.get(it.get('tier'), 0), 'l': req.get('level', 0), 'sk': req.get('skills', []),
             'ic': f if f and have.get(f) else None}
        if it.get('identifications'):
            o['i'] = {k: rng(v) for k, v in it['identifications'].items()}
        for src, dst in (('itemOnlyIDs', 'io'), ('consumableOnlyIDs', 'co'), ('ingredientPositionModifiers', 'pm')):
            vals = {k: v for k, v in (it.get(src) or {}).items() if v}
            if vals:
                o[dst] = vals
        out.append(o)
    out.sort(key=lambda x: (x['l'], x['n']))
    return out


def build_materials(mats, icons):
    out = []
    for name, m in mats.items():
        out.append({'n': name, 'p': m.get('subType'), 'l': (m.get('requirements') or {}).get('level', 0),
                    'ic': icons.get(icon_name(m))})
    out.sort(key=lambda x: (x['l'], x['n']))
    return out


def build_recipes(recipes):
    out = []
    for r in recipes.values():
        o = {'s': r.get('skill'), 't': r.get('type'), 'l': [r['level']['minimum'], r['level']['maximum']], 'xp': r.get('xp', 0)}
        o['m'] = [[m['amount'], m['item']] for m in r.get('materials', [])]
        for src, dst in (('durability', 'd'), ('healthOrDamage', 'h'), ('duration', 'du'), ('basicDuration', 'bd')):
            if r.get(src):
                o[dst] = [r[src]['minimum'], r[src]['maximum']]
        out.append(o)
    out.sort(key=lambda x: (x['s'], x['t'], x['l'][0]))
    return out


def banner_textures():
    """Front face (20x40) of every Minecraft banner pattern, used to draw guild banners."""
    from PIL import Image
    folder = os.path.join(ROOT, 'img', 'banner')
    os.makedirs(folder, exist_ok=True)
    listing = get_json('https://api.github.com/repos/PrismarineJS/minecraft-assets/contents/data/1.20.2/entity/banner')
    for f in listing:
        dest = os.path.join(folder, f['name'])
        if os.path.exists(dest):
            continue
        im = Image.open(io.BytesIO(get(f['download_url']))).convert('RGBA')
        s = im.width // 64   # textures are 64x64 (or a multiple); the front face sits at (1,1) size 20x40
        im.crop((1 * s, 1 * s, 21 * s, 41 * s)).save(dest)


def territory_areas():
    try:
        terr = get_json('https://athena.wynntils.com/cache/get/territoryList')
    except Exception:
        return []
    out = []
    for name, t in terr.items():
        loc = t.get('location') or {}
        (x1, z1), (x2, z2) = loc.get('start', [0, 0]), loc.get('end', [0, 0])
        out.append((name, min(x1, x2), max(x1, x2), min(z1, z2), max(z1, z2)))
    return out


def build_spots(base):
    """Densest clusters of gathering nodes per material, with the area (territory) and nearest named place."""
    import math
    areas = territory_areas()

    def area_at(x, z):
        inside = [a for a in areas if a[1] <= x <= a[2] and a[3] <= z <= a[4]]
        if inside:
            return min(inside, key=lambda a: (a[2] - a[1]) * (a[4] - a[3]))[0]
        near = min(areas, key=lambda a: math.hypot((a[1] + a[2]) / 2 - x, (a[3] + a[4]) / 2 - z), default=None)
        if near and math.hypot((near[1] + near[2]) / 2 - x, (near[3] + near[4]) / 2 - z) < 250:
            return near[0]
        return None

    feats = get_json(base + 'Reference/gathering_node_mapfeatures.json')
    nodes = get_json(base + 'Reference/gathering_nodes.json')
    places = get_json(base + 'Reference/places.json')['labels']
    level = {}
    for n in nodes:
        level[n['resource'].lower()] = n['level']
    by = {}
    for f in feats:
        _, _, prof, res = f['categoryId'].split(':')
        loc = f['location']
        by.setdefault((prof, res), []).append((loc['x'], loc.get('y', 64), loc['z']))
    R, APART = 48, 220
    out = {}
    for (prof, res), pts in by.items():
        scored = []
        for (x, y, z) in pts:
            near = [(a, b, c) for (a, b, c) in pts if (a - x) ** 2 + (c - z) ** 2 <= R * R]
            scored.append((len(near), near))
        scored.sort(key=lambda s: -s[0])
        spots = []
        for n, near in scored:
            cx = round(sum(p[0] for p in near) / n)
            cy = round(sum(p[1] for p in near) / n)
            cz = round(sum(p[2] for p in near) / n)
            if any((cx - s['x']) ** 2 + (cz - s['z']) ** 2 < APART * APART for s in spots):
                continue
            pl = min(places, key=lambda p: (p['x'] - cx) ** 2 + (p['z'] - cz) ** 2)
            spots.append({'x': cx, 'y': cy, 'z': cz, 'n': n, 'near': pl['name'], 'area': area_at(cx, cz),
                          'lvl': pl.get('level'), 'd': round(math.hypot(pl['x'] - cx, pl['z'] - cz))})
            if len(spots) == 3:
                break
        out.setdefault(prof, []).append({'r': res, 'l': level.get(res, 0), 'total': len(pts), 'spots': spots})
    for prof in out:
        out[prof].sort(key=lambda m: m['l'])
    return out


def build_tomes(tomes, icons):
    out = []
    for name, t in tomes.items():
        o = {'n': name, 't': t.get('subType'), 'g': 'tome', 'r': t.get('tier'), 'l': (t.get('requirements') or {}).get('level', 0), 'ic': icons.get(icon_name(t))}
        if t.get('identifications'):
            o['i'] = {k: rng(v) for k, v in t['identifications'].items()}
        out.append(o)
    out.sort(key=lambda x: (x['t'], x['l'], x['n']))
    return out


def stable_ids(names):
    """Short build links store items by number. Numbers never change once given; new items get the next one."""
    path = os.path.join(DATA, 'itemids.json')
    ids = json.load(open(path, encoding='utf8')) if os.path.exists(path) else {}
    nxt = max(ids.values(), default=0) + 1
    for n in sorted(names):
        if n not in ids:
            ids[n] = nxt
            nxt += 1
    save('itemids.json', ids)


def build_quests():
    u = 'https://wynncraft.wiki.gg/index.php?' + urllib.parse.urlencode({
        'title': 'Special:CargoExport', 'tables': 'Quests', 'limit': '2000', 'format': 'json',
        'fields': 'Quests._pageTitle,Quests.name,Quests.level,Quests.length,Quests.province,Quests.type'})
    rows = get_json(u)
    out = [{'n': html.unescape(r.get('name') or r.get('_pageTitle')), 'l': r.get('level') or 0, 'len': r.get('length'),
            'p': r.get('province'), 'ty': r.get('type') or 'Normal'} for r in rows if (r.get('name') or '') != '???']
    out.sort(key=lambda x: (x['l'], x['n']))
    return out


def build_profxp():
    d = get_json(WIKI_API + '?' + urllib.parse.urlencode({'action': 'parse', 'page': 'Professions', 'prop': 'wikitext', 'format': 'json'}))
    wt = d['parse']['wikitext']['*']
    rows = re.findall(r'^\|(\d+)\|\|([\d,]+) XP\|\|(\d+)\|\|([\d,]+) XP', wt, re.M)
    return [int(r[1].replace(',', '')) for r in rows]   # index i = XP to go from level i+1 to i+2


API_FIELDS = {'n': 'name', 't': 'type', 'g': 'category', 'r': 'rarity', 'l': 'level', 'ic': 'icon', 'c': 'classRequirement', 'q': 'skillRequirements',
              'b': 'base', 'i': 'identifications', 'm': 'majorIds', 'ps': 'powderSlots', 'as': 'attackSpeed', 'dps': 'averageDps', 'rs': 'restriction',
              'tr': 'stars', 'sk': 'professions', 'io': 'itemOnlyIds', 'co': 'consumableOnlyIds', 'pm': 'positionModifiers', 'p': 'profession'}


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def build_api():
    """Static, CORS-enabled JSON API on GitHub Pages: api/v1/*.json, plus one file per item and ingredient."""
    out = os.path.join(ROOT, 'api', 'v1')
    os.makedirs(os.path.join(out, 'item'), exist_ok=True)
    os.makedirs(os.path.join(out, 'ingredient'), exist_ok=True)

    def readable(o):
        r = {API_FIELDS.get(k, k): v for k, v in o.items()}
        if r.get('icon'):
            r['icon'] = ('https://malynsx.github.io/wynntools/img/items/' if 'stars' not in r else 'https://malynsx.github.io/wynntools/img/ing/') + r['icon']
        return r

    def write(path, obj):
        with open(os.path.join(out, path), 'w', encoding='utf8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

    data = lambda n: json.load(open(os.path.join(DATA, n), encoding='utf8'))
    items, ings = [readable(x) for x in data('items.json')], [readable(x) for x in data('ingredients.json')]
    for it in items:
        it['slug'] = slug(it['name'])
        write(f"item/{it['slug']}.json", it)
    for g in ings:
        g['slug'] = slug(g['name'])
        write(f"ingredient/{g['slug']}.json", g)
    write('items.json', items)
    write('ingredients.json', ings)
    write('materials.json', [readable(x) for x in data('materials.json')])
    write('recipes.json', data('recipes.json'))
    write('quests.json', data('quests.json'))
    write('spots.json', data('spots.json'))
    write('olinus-spots.json', data('olinus.json'))
    write('territories.json', data('territories.json') if os.path.exists(os.path.join(DATA, 'territories.json')) else [])
    write('profession-xp.json', data('profxp.json'))
    write('major-ids.json', data('majorids.json'))
    write('index.json', {
        'name': 'Wynnia API', 'version': 1, 'updated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
        'docs': 'https://malynsx.github.io/wynntools/#home/api',
        'endpoints': ['items.json', 'item/{slug}.json', 'ingredients.json', 'ingredient/{slug}.json', 'materials.json', 'recipes.json',
                      'quests.json', 'spots.json', 'olinus-spots.json', 'territories.json', 'profession-xp.json', 'major-ids.json'],
    })


def main():
    os.makedirs(DATA, exist_ok=True)
    base = 'https://cdn.wynntils.com/static/'
    gear = get_json(base + 'Reference/gear.json')
    ing = get_json(base + 'Reference/ingredients.json')
    adv_ing = get_json(base + 'Reference/advanced_ingredients.json')
    mats = get_json(base + 'Reference/materials.json')

    tomes = get_json(base + 'Reference/tomes.json')
    names = {icon_name(v) for v in list(gear.values()) + list(mats.values()) + list(tomes.values())} - {None}
    icons = item_icons(names)
    print('item icons:', sum(1 for v in icons.values() if v), '/', len(icons))

    save('items.json', build_gear(gear, icons))
    save('majorids.json', build_major_ids(gear))
    save('tomes.json', build_tomes(tomes, icons))
    stable_ids(list(gear.keys()) + list(tomes.keys()))
    save('ingredients.json', build_ingredients(ing, adv_ing))
    save('materials.json', build_materials(mats, icons))
    save('recipes.json', build_recipes(get_json(base + 'Reference/recipes.json')))
    save('spots.json', build_spots(base))
    save('idkeys.json', {v: k for k, v in get_json(base + 'Reference/id_keys.json').items()})
    build_api()
    try:
        banner_textures()
    except Exception as e:
        print('banner textures skipped:', e)
    try:
        save('quests.json', build_quests())
        save('profxp.json', build_profxp())
    except Exception as e:  # the wiki is occasionally slow; keep the previous files
        print('wiki step skipped:', e)
    try:
        terr = get_json('https://athena.wynntils.com/cache/get/territoryList')
        save('territories.json', [{'n': k, 'g': (v.get('guild') or {}).get('name'), 'p': (v.get('guild') or {}).get('prefix'),
                                    'c': (v.get('guild') or {}).get('color'), 'a': v.get('acquired'), 'hq': v.get('hq', False)}
                                   for k, v in terr.items()])
    except Exception as e:
        print('territory step skipped:', e)
    save('meta.json', {'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')})
    print('done')


if __name__ == '__main__':
    main()
