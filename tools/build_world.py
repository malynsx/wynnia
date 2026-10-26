"""World map and guide data for Wynnia.

data/world.json   map tiles, place names, services (workstations, banks...), caves  (Wynntils static data)
data/nodes.json   every gathering node, by profession and resource                   (Wynntils static data)
data/guides.json  raids and lootrunning, read from the Wynncraft Wiki                  (wiki API, slowly)

Run on its own (python tools/build_world.py) or from build_data.py's weekly job.
"""
import json, os, re, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
WYNNTILS = 'https://cdn.wynntils.com/static/Reference/'
WIKI = 'https://wynncraft.wiki.gg/api.php'
UA = {'User-Agent': 'WynniaGuideBuilder/1.0 (https://github.com/malynsx/wynnia; fan guide data, a few requests per week)'}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def save(name, obj):
    with open(os.path.join(DATA, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', name)


# ---------------------------------------------------------------- map data
def build_world():
    tiles = [{'n': m['name'], 'url': m['url'], 'x1': m['x1'], 'z1': m['z1'], 'x2': m['x2'], 'z2': m['z2']}
             for m in get(WYNNTILS + 'maps.json') if m['name'].startswith('Main')]
    labels = [{'n': l['name'], 'x': l['x'], 'z': l['z'], 'layer': l['layer'], 'lvl': l.get('level')} for l in get(WYNNTILS + 'places.json')['labels']]
    services = {s['type']: [[p['x'], p['z']] for p in s['locations']] for s in get(WYNNTILS + 'services.json')}
    caves = []
    for c in get(WYNNTILS + 'caves.json'):
        loc = c.get('location') or {}
        caves.append({'n': c['name'], 'desc': c.get('description', ''), 'len': c.get('length'), 'time': c.get('lengthInfo'),
                      'diff': c.get('difficulty'), 'lvl': c.get('requirements'), 'rew': c.get('rewards', []),
                      'x': loc.get('x'), 'y': loc.get('y'), 'z': loc.get('z')})
    save('world.json', {'tiles': tiles, 'labels': labels, 'services': services, 'caves': caves})


def build_nodes():
    """{profession: {resource: {"l": level, "p": [x, z, x, z, ...]}}} from Wynntils' node map features."""
    level = {}
    for n in get(WYNNTILS + 'gathering_nodes.json'):
        level[n['resource'].lower()] = n['level']
    out = {}
    for f in get(WYNNTILS + 'gathering_node_mapfeatures.json'):
        _, _, prof, res = f['categoryId'].split(':')
        loc = f['location']
        r = out.setdefault(prof, {}).setdefault(res, {'l': level.get(res, 0), 'p': []})
        r['p'] += [loc['x'], loc['z']]
    save('nodes.json', out)


# ---------------------------------------------------------------- wiki text
COLORS = {'black': '0', 'darkblue': '1', 'darkgreen': '2', 'darkaqua': '3', 'darkred': '4', 'darkpurple': '5', 'gold': '6', 'gray': '7', 'grey': '7',
          'darkgray': '8', 'darkgrey': '8', 'blue': '9', 'green': 'a', 'aqua': 'b', 'red': 'c', 'lightpurple': 'd', 'purple': 'd', 'pink': 'd',
          'yellow': 'e', 'white': 'f', 'plain': 'f'}


def colour_code(c):
    """wiki colour (var(--color-wc-aqua), #888, ...) -> Minecraft § code, so the site can colour it with W.mcHtml"""
    m = re.search(r'--color-(?:wc|var)-([a-z]+)', c)
    if m:
        return '§' + COLORS.get(m.group(1), 'f')
    hexes = {'#888': '8', '#777': '8', '#aaa': '7', '#808': '5', '#fa71af': 'd'}
    return '§' + hexes.get(c.strip().lower(), 'f')


def clean(t):
    """wikitext -> plain text with § colour codes"""
    t = re.sub(r'<ref[^>]*?/>', '', t)
    t = re.sub(r'<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'\[\[(?:File|Image):[^\]]*\]\]', '', t)
    for _ in range(4):   # nested templates, innermost first
        t = re.sub(r'\{\{c\|([^|{}]*)\|([^{}]*?)(?:\|[^{}]*)?\}\}', lambda m: colour_code(m.group(1)) + m.group(2) + '§r', t)
        t = re.sub(r'\{\{Text Gradient\|[^|{}]*\|([^{}]*)\}\}', r'§d\1§r', t)
        t = re.sub(r'\{\{(?:MajorID|GambitText)\|([^{}|]*)\}\}', r'\1', t)
        t = re.sub(r'\{\{Tooltip\|([^{}|]*)\|[^{}]*\}\}', r'\1', t)
        t = re.sub(r'\{\{MapLink\|x=(-?\d+)\|y=(-?\d+)\|z=(-?\d+)\}\}', r'[\1, \2, \3]', t)
        t = re.sub(r'\{\{(?:WynnIcon2?|CBIcon)\|[^{}]*\}\}', '', t)
        t = re.sub(r'\{\{[^{}]*\}\}', '', t)
    t = re.sub(r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1', t)
    t = re.sub(r'\[\[([^\]]*)\]\]', r'\1', t)
    t = re.sub(r'\[https?://\S+ ([^\]]*)\]', r'\1', t)
    t = re.sub(r'<abbr[^>]*>(.*?)</abbr>', r'\1', t)
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'</?(?:u|small|code|span[^>]*|div[^>]*)>', '', t)
    t = t.replace("'''", '').replace("''", '')
    return re.sub(r'[ \t]+', ' ', t).strip()


def page(title):
    q = urllib.parse.urlencode({'action': 'parse', 'page': title, 'prop': 'wikitext', 'format': 'json', 'formatversion': 2, 'redirects': 1})
    d = get(WIKI + '?' + q)
    time.sleep(4)   # be gentle with the wiki
    return d['parse']['wikitext']


def section(t, name):
    m = re.search(r'^(=+)\s*' + re.escape(name) + r'\s*\1\s*$', t, re.M)
    if not m:
        return ''
    rest = t[m.end():]
    n = re.search(r'^={1,%d}[^=].*$' % len(m.group(1)), rest, re.M)
    return rest[:n.start()] if n else rest


def subsections(t, level):
    """[(name, text)] for headings of exactly this level"""
    parts = re.split(r'^%s\s*([^=].*?)\s*%s\s*$' % ('=' * level, '=' * level), t, flags=re.M)
    return [(parts[i], parts[i + 1]) for i in range(1, len(parts) - 1, 2)]


def table(t):
    """first wikitable in t -> list of rows, each a list of cleaned cells"""
    m = re.search(r'\{\|.*?\n\|\}', t, re.S)
    if not m:
        return []
    rows = []
    for raw in re.split(r'\n\|-[^\n]*', m.group(0))[1:]:
        cells = []
        for line in raw.split('\n'):
            if line.startswith('|}') or line.startswith('!') or line.startswith('|+'):
                continue
            if line.startswith('|'):
                for c in line[1:].split('||'):
                    c = re.sub(r'^\s*(?:style|class|rowspan|colspan)="[^"]*"\s*\|', '', c)
                    cells.append(c)
            elif cells:
                cells[-1] += '\n' + line
        cells = [clean(c) for c in cells]
        if any(cells):
            rows.append(cells)
    return rows


def infobox(t):
    m = re.search(r'\{\{Infobox/Raid(.*?)\n\}\}', t, re.S)
    out = {}
    if m:
        for k, v in re.findall(r'^\|\s*(\w+)\s*=\s*(.*?)(?=^\||\Z)', m.group(1), re.M | re.S):
            out[k] = v.strip()
    return out


def first_sentences(t, n=2):
    t = re.sub(r'^=+.*?=+\s*$', '', t, flags=re.M)   # drop sub-headings
    para = [p.lstrip('»◆ ').strip() for p in clean(t).split('\n') if p.strip() and not p.startswith(('*', '|', '{', '!', ':'))]
    text = ' '.join(para[:2])
    parts = re.split(r'(?<=[.!?])\s+', text)
    return ' '.join(parts[:n])


def where(t, ib):
    if ib.get('location'):
        return clean(ib['location'])
    m = re.search(r'RenderLocation\|location=([^|}]*)', t)
    return clean(m.group(1)) if m else ''


RAIDS = [('Nest of the Grootslangs', 'Nest_of_the_Grootslangs'), ("Orphion's Nexus of Light", "Orphion's_Nexus_of_Light"),
         ('The Canyon Colossus', 'The_Canyon_Colossus_(Raid)'), ('The Nameless Anomaly', 'The_Nameless_Anomaly'), ('The Wartorn Palace', 'The_Wartorn_Palace')]


def build_guides():
    overview = page('Raids')
    raid_rows = {r[0]: r for r in table(section(overview, 'List of Raids'))}
    raids = []
    for name, title in RAIDS:
        t = page(title)
        ib = infobox(t)
        row = next((r for k, r in raid_rows.items() if name in k), [])
        rooms = []
        for i in (1, 2, 3):
            body = section(t, 'Room %d' % i)
            rooms.append([{'n': clean(n), 'd': first_sentences(b)} for n, b in subsections(body, 4) or subsections(body, 3) if not clean(n).startswith('Buff Room')])
        boss = section(t, 'Boss')
        buffs = []
        for r in table(section(t, 'Raid Power Ups')):
            if len(r) >= 4:
                buffs.append({'n': r[0], 't': r[1:4]})
        raids.append({
            'n': name, 'x': int(ib.get('xcoordinate') or 0), 'z': int(ib.get('zcoordinate') or 0),
            'lvl': int(re.sub(r'\D', '', ib.get('minlevel', '0')) or 0), 'len': clean(ib.get('length', '')), 'diff': clean(ib.get('difficulty', '')),
            'quest': clean(ib.get('quest', '')), 'rune': clean(ib.get('runes', '')), 'boss': (clean(ib.get('boss', '')) or (row[4] if len(row) > 4 else '')).replace('\n', ' · '),
            'where': where(t, ib),
            'lore': clean(ib.get('lore', '')), 'rewards': [clean(x) for x in re.findall(r'^\*\s*(.+)$', ib.get('rewards', ''), re.M)],
            'tomes': [x.strip() for x in (row[5].split('\n') if len(row) > 5 else []) if x.strip()],
            'prep': first_sentences(section(t, 'Preparing for the Raid'), 3), 'rooms': rooms,
            'boss_d': first_sentences(boss, 3), 'buffs': buffs,
        })
    ranks = [{'rank': r[1], 'xp': r[3], 'perk': r[4]} for r in table(section(overview, 'The Raid Division')) if len(r) >= 5]
    gambits = [{'n': r[0], 'd': r[1]} for r in table(section(overview, 'Silverbull Gambits')) if len(r) >= 2]

    lr = page('Lootrunning')
    camps = []
    for line in re.findall(r"^\*.*'''\[\[([^\]|]+)(?:\|[^\]]*)?\]\]'''.*?MapLink\|x=(-?\d+)\|y=(-?\d+)\|z=(-?\d+)", section(lr, 'Starting a Lootrun'), re.M):
        camps.append({'n': line[0], 'x': int(line[1]), 'y': int(line[2]), 'z': int(line[3])})
    lootrun = {
        'intro': first_sentences(lr.split('\n==')[0], 2),
        'camps': camps,
        'ranks': [{'rank': r[1], 'xp': r[3], 'perk': r[4]} for r in table(section(lr, 'The Lootrun Division')) if len(r) >= 5],
        'beacons': [{'n': r[0], 'd': r[1], 'rank': r[2], 'max': r[3], 'note': r[4] if len(r) > 4 else ''} for r in table(section(lr, 'Beacons')) if len(r) >= 4],
        'challenges': [{'n': r[0], 'd': r[1], 'note': r[2], 'lose': r[3]} for r in table(section(lr, 'Challenges')) if len(r) >= 4],
        'curses': [clean(x) for x in re.findall(r'^\*\s*(.+)$', section(lr, 'Curses').split('To calculate')[0], re.M)],
        'boons': [{'n': r[0], 'type': r[1], 'd': r[2], 'max': r[3]} for r in table(section(lr, 'Boons')) if len(r) >= 4],
        'missions': [{'n': r[0], 'd': r[1]} for r in table(section(lr, 'Missions')) if len(r) >= 2],
        'trials': [{'n': r[0], 'd': r[1]} for r in table(section(lr, 'Trials')) if len(r) >= 2],
        'rewards': [clean(x) for x in re.findall(r'^\*\s*(.+)$', section(lr, 'Rewards'), re.M)],
    }
    save('guides.json', {'raids': raids, 'raidRanks': ranks, 'gambits': gambits, 'lootrun': lootrun,
                         'source': 'Wynncraft Wiki (wynncraft.wiki.gg), CC BY-SA'})


# The wiki doesn't let other sites show its images, so the few the guides use are copied into img/guide/.
GUIDE_IMAGES = ['CBRaidIcon.png', 'LootrunUpdateIcon.png', 'NestoftheGrootslangsIcon.png', "Orphion'sNexusofLightIcon.png", 'TheCanyonColossusIcon.png',
                'TheNamelessAnomalyIcon.png', 'TheWartornPalaceIcon.png', 'LootrunChallengeSpelunk.png', 'LootrunChallengeSlay.png', 'LootrunChallengeTarget.png',
                'LootrunChallengeDestroy.png', 'LootrunChallengeDefend.png'] + ['Inspect beacon %s.png' % c for c in
                ('blue', 'purple', 'yellow', 'aqua', 'orange', 'green', 'dark grey', 'white', 'grey', 'red', 'pink', 'crimson', 'rainbow')]


def guide_slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower().rsplit('.', 1)[0]).strip('-') + '.png'


def build_guide_images():
    os.makedirs(os.path.join(ROOT, 'img', 'guide'), exist_ok=True)
    for i in range(0, len(GUIDE_IMAGES), 20):
        titles = '|'.join('File:' + n for n in GUIDE_IMAGES[i:i + 20])
        q = urllib.parse.urlencode({'action': 'query', 'titles': titles, 'prop': 'imageinfo', 'iiprop': 'url', 'format': 'json', 'formatversion': 2})
        for pg in get(WIKI + '?' + q)['query']['pages']:
            info = pg.get('imageinfo')
            if not info:
                print('no image:', pg['title'])
                continue
            req = urllib.request.Request(info[0]['url'], headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r, open(os.path.join(ROOT, 'img', 'guide', guide_slug(pg['title'][5:])), 'wb') as f:
                f.write(r.read())
            time.sleep(1)
        time.sleep(4)
    print('guide images done')


if __name__ == '__main__':
    build_guide_images()
    build_world()
    build_nodes()
    build_guides()
