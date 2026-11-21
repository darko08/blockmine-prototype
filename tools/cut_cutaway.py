"""Cut the cutaway mine's Runway sheets (Assets/sheets/cutaway/) into the files the game loads (Assets/cutaway/).
Re-run after replacing a sheet:  python tools/cut_cutaway.py
Each piece is one of the largest connected shapes on its sheet (loose bits such as chips or a smoke wisp
are dropped), trimmed and shrunk. The script also measures where the lantern sits in each miner pose and
where the bag's strap is, and prints them for cutaway/settings.js."""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'Assets', 'sheets', 'cutaway'); OUT = os.path.join(ROOT, 'Assets', 'cutaway')
os.makedirs(OUT, exist_ok=True)

def pieces(img, n, drop_edge=False):
    a = np.array(img.getchannel('A')) > 60
    small = a[::4, ::4]
    lab, count = ndimage.label(ndimage.binary_dilation(small, iterations=3))
    sizes = ndimage.sum(small, lab, range(1, count + 1))
    keep = [k + 1 for k in np.argsort(sizes)[::-1]]
    if drop_edge:   # a shape touching the left or right edge of the sheet is scenery, not a piece
        keep = [k for k in keep if not ((lab == k)[:, 0].any() or (lab == k)[:, -1].any())]
    out = []
    for k in keep[:n]:
        m = np.kron(lab == k, np.ones((4, 4), bool))[:a.shape[0], :a.shape[1]]
        arr = np.array(img).copy(); arr[~m] = 0
        ys, xs = np.where(m & a)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        out.append({'img': Image.fromarray(arr).crop(box), 'x': int(box[0]), 'y': int(box[1]), 'w': int(box[2] - box[0]), 'h': int(box[3] - box[1]), 'area': int(m.sum())})
    return out

def reading_order(ps):
    rows = sorted(ps, key=lambda p: p['y'] + p['h'] / 2)
    lines, cur = [], [rows[0]]
    for p in rows[1:]:
        if p['y'] > max(q['y'] + q['h'] * 0.6 for q in cur): lines.append(cur); cur = [p]
        else: cur.append(p)
    lines.append(cur)
    return [p for line in lines for p in sorted(line, key=lambda q: q['x'])]

def save(im, name, max_side):
    im = im.copy(); im.thumbnail((max_side, max_side), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), quality=86, method=6)
    return im

def lantern(im):
    """the lantern's lit glass: bright warm pixels; centre x, centre y and lantern height as fractions"""
    p = np.array(im.convert('RGBA')).astype(int); r, g, b, a = p[..., 0], p[..., 1], p[..., 2], p[..., 3]
    hot = (a > 200) & (r > 225) & (g > 150) & (b < 150)
    lab, n = ndimage.label(ndimage.binary_dilation(hot, iterations=3))
    k = np.argmax(ndimage.sum(hot, lab, range(1, n + 1))) + 1
    ys, xs = np.where((lab == k) & hot)
    return {'x': round(xs.mean() / im.width, 3), 'y': round(ys.mean() / im.height, 3), 'h': round((ys.max() - ys.min() + 1) * 2.6 / im.height, 3)}

info = {}
# miner: from the edited sheet (miner-noladder.png: the same three poses without the painted ladder and rock face)
m = reading_order(pieces(Image.open(os.path.join(SRC, 'miner-noladder.png')).convert('RGBA'), 3, drop_edge=True))
for name, p in zip(['miner_walk', 'miner_climb', 'miner_mine'], m):
    im = save(p['img'], name, 512)
    # the body's centre line (where his feet and the ladder are): middle of the opaque columns in the lower half
    a = np.array(im.getchannel('A'))[im.height // 2:] > 100
    cols = np.where(a.any(axis=0))[0]
    info[name] = {'size': im.size, 'lantern': lantern(im), 'bodyX': round(float((cols.min() + cols.max()) / 2) / im.width, 3)}

for name, p in zip(['bag_empty', 'bag_half', 'bag_full'], reading_order(pieces(Image.open(os.path.join(SRC, 'bag.png')).convert('RGBA'), 3))):
    im = save(p['img'], name, 384)
    a = np.array(im.getchannel('A'))[: max(2, im.height // 30)] > 100
    info[name] = {'size': im.size, 'strapX': round(float(np.where(a.any(axis=0))[0].mean()) / im.width, 3)}

for name, p in zip(['lamp_lit', 'lamp_out'], reading_order(pieces(Image.open(os.path.join(SRC, 'lamp.png')).convert('RGBA'), 2))):
    info[name] = {'size': save(p['img'], name, 256).size}

for name, p in zip(['ore_zone1', 'ore_zone2', 'ore_zone3', 'ore_zone4', 'ore_rich'], reading_order(pieces(Image.open(os.path.join(SRC, 'ore.png')).convert('RGBA'), 5))):
    info[name] = {'size': save(p['img'], name, 256).size}

# timber: tell the pieces apart by shape
ts = pieces(Image.open(os.path.join(SRC, 'timber.png')).convert('RGBA'), 6)
top = min(ts, key=lambda p: p['area']); rest = [p for p in ts if p is not top]
tall = sorted([p for p in rest if p['h'] > 1.5 * p['w']], key=lambda p: p['x'])
wide = sorted([p for p in rest if p['w'] > 2 * p['h']], key=lambda p: p['y'])
brace = [p for p in rest if p not in tall and p not in wide][0]
named = {'post': tall[0], 'ladder': tall[-1], 'beam_cap': wide[0], 'floor': wide[-1], 'brace': brace, 'ladder_top': top}
for name, p in named.items():
    im = p['img']
    if name == 'ladder':   # keep the middle so it repeats rung to rung without the rail ends
        im = im.crop((0, int(im.height * 0.06), im.width, int(im.height * 0.94)))
    info[name] = {'size': save(im, name, 512).size}

for name, p in zip(['headframe_open', 'headframe_shut'], reading_order(pieces(Image.open(os.path.join(SRC, 'headframe.png')).convert('RGBA'), 2))):
    info[name] = {'size': save(p['img'], name, 640).size}

PROPS = ['prop_cart', 'prop_barrel', 'prop_crates', 'prop_pick', 'prop_shovel', 'prop_rubble', 'prop_rope', 'prop_oilcan']
for name, p in zip(PROPS, reading_order(pieces(Image.open(os.path.join(SRC, 'props.png')).convert('RGBA'), 8))):
    info[name] = {'size': save(p['img'], name, 320).size}

# backdrops
s = Image.open(os.path.join(SRC, 'surface.png')).convert('RGB'); s.thumbnail((1800, 1800), Image.LANCZOS)
s.save(os.path.join(OUT, 'surface.webp'), quality=80, method=6); info['surface'] = {'size': s.size}
for n in range(1, 5):
    for kind in ('tunnel', 'rock'):
        t = Image.open(os.path.join(SRC, f'{kind}-{n}.png')).convert('RGB').resize((512, 512), Image.LANCZOS)
        t.save(os.path.join(OUT, f'{kind}_zone{n}.webp'), quality=80, method=6)

print(json.dumps({k: v for k, v in info.items() if k.startswith(('miner', 'bag'))}, indent=1))
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.webp'))
print('webp total', round(total / 1024), 'KB')
