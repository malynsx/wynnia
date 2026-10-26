"""Item set bonuses for Wynnia's build maths, written into data/engine.json as "sets".

Bonuses come from the Wynncraft API (/v3/item/sets). Its parts lists miss pieces for some sets (Cosmic Foundations
leaves out Dark Matter), so each set's wiki page ("<name> Set") adds the parts listed in its infobox.

  "sets": { "Cosmic Foundations": { "p": ["Dark Matter", "Fermion", ...],
                                     "b": { "4": { "rawHealth": 1500, ... } },
                                     "m": { "4": ["MAJOR_ID"] } } }

Run on its own (python tools/build_sets.py) or from build_data.py's weekly job.
"""
import json, os, re, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
WIKI = 'https://wynncraft.wiki.gg/api.php'
UA = {'User-Agent': 'WynniaSetBuilder/1.0 (https://github.com/malynsx/wynnia; fan build calculator, a few requests per week)'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def wiki_parts(name):
    """Part names from the set's wiki infobox, or [] if the page isn't there."""
    q = urllib.parse.urlencode({'action': 'parse', 'page': name + ' Set', 'prop': 'wikitext', 'format': 'json', 'formatversion': 2, 'redirects': 1})
    try:
        d = get(WIKI + '?' + q)
    except Exception:
        return []
    finally:
        time.sleep(2)   # be gentle with the wiki
    t = (d.get('parse') or {}).get('wikitext') or ''
    m = re.search(r'^\|\s*parts\s*=\s*(.*?)$', t, re.M)
    return [p.split('|')[0].strip() for p in re.findall(r'\[\[([^\]]+)\]\]', m.group(1))] if m else []


def build_sets():
    api = get('https://api.wynncraft.com/v3/item/sets')
    with open(os.path.join(DATA, 'items.json'), encoding='utf-8') as f:
        known = {i['n'] for i in json.load(f)}
    out = {}
    for name, s in api.items():
        parts = [p for p in s.get('parts') or [] if p in known]
        parts += [p for p in wiki_parts(name) if p in known and p not in parts]
        bonuses = s.get('bonuses') or {}
        if not parts or not bonuses:
            continue
        out[name] = {
            'p': sorted(parts),
            'b': {n: {k: v for k, v in (b.get('minor') or {}).items() if isinstance(v, (int, float))} for n, b in bonuses.items()},
            'm': {n: b['major'] for n, b in bonuses.items() if b.get('major')},
        }
    path = os.path.join(DATA, 'engine.json')
    with open(path, encoding='utf-8') as f:
        eng = json.load(f)
    eng['sets'] = out
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(eng, f, ensure_ascii=False, separators=(',', ':'))
    print('sets:', len(out))


if __name__ == '__main__':
    build_sets()
