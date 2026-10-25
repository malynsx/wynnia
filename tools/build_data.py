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
import io
import json
import os
import re
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
UA = {'User-Agent': 'Mozilla/5.0 (Wynntools data builder; github.com/fuller-i/wynntools)'}
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
        for src, dst in (('durability', 'd'), ('healthOrDamage', 'h'), ('duration', 'du'), ('basicDuration', 'bd')):
            if r.get(src):
                o[dst] = [r[src]['minimum'], r[src]['maximum']]
        out.append(o)
    out.sort(key=lambda x: (x['s'], x['t'], x['l'][0]))
    return out


def build_quests():
    u = 'https://wynncraft.wiki.gg/index.php?' + urllib.parse.urlencode({
        'title': 'Special:CargoExport', 'tables': 'Quests', 'limit': '2000', 'format': 'json',
        'fields': 'Quests._pageTitle,Quests.name,Quests.level,Quests.length,Quests.province,Quests.type'})
    rows = get_json(u)
    out = [{'n': r.get('name') or r.get('_pageTitle'), 'l': r.get('level') or 0, 'len': r.get('length'),
            'p': r.get('province'), 'ty': r.get('type') or 'Normal'} for r in rows if (r.get('name') or '') != '???']
    out.sort(key=lambda x: (x['l'], x['n']))
    return out


def build_profxp():
    d = get_json(WIKI_API + '?' + urllib.parse.urlencode({'action': 'parse', 'page': 'Professions', 'prop': 'wikitext', 'format': 'json'}))
    wt = d['parse']['wikitext']['*']
    rows = re.findall(r'^\|(\d+)\|\|([\d,]+) XP\|\|(\d+)\|\|([\d,]+) XP', wt, re.M)
    return [int(r[1].replace(',', '')) for r in rows]   # index i = XP to go from level i+1 to i+2


def main():
    os.makedirs(DATA, exist_ok=True)
    base = 'https://cdn.wynntils.com/static/'
    gear = get_json(base + 'Reference/gear.json')
    ing = get_json(base + 'Reference/ingredients.json')
    adv_ing = get_json(base + 'Reference/advanced_ingredients.json')
    mats = get_json(base + 'Reference/materials.json')

    names = {icon_name(v) for v in list(gear.values()) + list(mats.values())} - {None}
    icons = item_icons(names)
    print('item icons:', sum(1 for v in icons.values() if v), '/', len(icons))

    save('items.json', build_gear(gear, icons))
    save('ingredients.json', build_ingredients(ing, adv_ing))
    save('materials.json', build_materials(mats, icons))
    save('recipes.json', build_recipes(get_json(base + 'Reference/recipes.json')))
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
