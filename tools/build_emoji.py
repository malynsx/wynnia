"""Make the Discord bot's emoji set (brand/emoji/*.png) from the site's own Wynncraft and wiki icons.

The bot uploads these as application emojis when /register is opened (see proxy/bot.js), so its messages can show
real game icons inline. Each is a 128x128 PNG: pixel art is scaled up without smoothing, larger art is fitted."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'brand' / 'emoji'
SIZE = 128

SOURCES = {
    'wynnia': 'brand/wynnia-ring-128.png',
    # elements
    'earth': 'img/ui/powder-earth.webp', 'thunder': 'img/ui/powder-thunder.webp', 'water': 'img/ui/powder-water.webp',
    'fire': 'img/ui/powder-fire.webp', 'air': 'img/ui/powder-air.webp',
    # classes
    'warrior': 'img/wiki/warrior.webp', 'archer': 'img/wiki/archer.webp', 'mage': 'img/wiki/mage.webp',
    'assassin': 'img/wiki/assassin.webp', 'shaman': 'img/wiki/shaman.webp',
    # gear slots
    'helmet': 'img/items/helmet.diamond.webp', 'chestplate': 'img/items/chestplate.diamond.webp', 'leggings': 'img/items/leggings.diamond.webp',
    'boots': 'img/items/boots.diamond.webp', 'ring': 'img/items/ring.basicGem.webp', 'necklace': 'img/items/necklace.basicGold.webp',
    'bracelet': 'img/items/bracelet.basicGold.webp', 'bow': 'img/items/bow.multi3.webp', 'spear': 'img/items/spear.multi3.webp',
    'wand': 'img/items/wand.multi3.webp', 'dagger': 'img/items/dagger.multi3.webp', 'relik': 'img/items/relik.multi3.webp',
    'tome': 'img/items/tome.weapon.webp',
    # player stats (the same icons as the site's badges)
    'playtime': 'img/items/tome.movement.webp', 'level': 'img/items/profession.gemDiamond.webp', 'quests': 'img/items/profession.paperOak.webp',
    'mobs': 'img/items/dagger.fire3.webp', 'chests': 'img/items/profession.ingotGold.webp', 'dungeons': 'img/items/helmet.diamond.webp',
    'raids': 'img/items/chestplate.gold.webp', 'wars': 'img/items/spear.thunder3.webp', 'pvp': 'img/items/dagger.basicGold.webp',
    'guildtome': 'img/items/tome.guild.webp', 'lootrun': 'img/items/tome.lootrun.webp',
    # everything else
    'emerald': 'img/wiki/emeraldicon.webp', 'guild': 'img/wiki/guild-banner-tier-3.webp', 'questbook': 'img/wiki/questbook.webp',
    'mythic': 'img/guide/inspect-beacon-purple.png', 'beacon': 'img/guide/inspect-beacon-aqua.png', 'camp': 'img/guide/lootrunupdateicon.png',
    'notg': 'img/guide/nestofthegrootslangsicon.png', 'nol': 'img/guide/orphion-snexusoflighticon.png', 'tcc': 'img/guide/thecanyoncolossusicon.png',
    'tna': 'img/guide/thenamelessanomalyicon.png', 'twp': 'img/guide/thewartornpalaceicon.png',
}


def fit(src):
    im = Image.open(ROOT / src).convert('RGBA')
    box = im.getbbox()
    if box: im = im.crop(box)
    w, h = im.size
    scale = (SIZE - 8) / max(w, h)
    pixel = max(w, h) <= 40
    if pixel: scale = max(1, int(scale))   # whole steps keep pixel art crisp
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.NEAREST if pixel else Image.LANCZOS)
    out = Image.new('RGBA', (SIZE, SIZE))
    out.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    return out


def dot(colour):
    out = Image.new('RGBA', (SIZE, SIZE))
    ImageDraw.Draw(out).ellipse((34, 34, 94, 94), fill=colour)
    return out


OUT.mkdir(parents=True, exist_ok=True)
for name, src in SOURCES.items():
    fit(src).save(OUT / f'{name}.png', optimize=True)
dot('#43b581').save(OUT / 'online.png', optimize=True)
dot('#747f8d').save(OUT / 'offline.png', optimize=True)
print(len(SOURCES) + 2, 'emoji written to', OUT)

# crisp 128px copies of every item icon, for the bot's thumbnails (Discord smooths small images when it enlarges them)
BIG = ROOT / 'img' / 'items128'
BIG.mkdir(exist_ok=True)
icons = sorted((ROOT / 'img' / 'items').glob('*.webp'))
for f in icons:
    fit(f.relative_to(ROOT)).save(BIG / (f.stem + '.png'), optimize=True)
print(len(icons), 'item icons written to', BIG)
