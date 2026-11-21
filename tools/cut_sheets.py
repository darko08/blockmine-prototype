"""Cut the Runway sheets in Assets/sheets into single sprites in Assets/, and prepare the rock backdrops.
Re-run after replacing a sheet:  python tools/cut_sheets.py
Each sprite is found as one of the N largest connected shapes on the sheet (loose bits such as
flying chips are dropped), trimmed, and scaled so its longest side is at most MAX px.
It also measures where the rope meets each piece and where the painted lantern sits on the miner,
and prints them for settings.js."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = os.path.join(ROOT, 'Assets', 'sheets'); OUT = os.path.join(ROOT, 'Assets')
MAX = 384

# sheet -> piece names, and how to order the pieces found
PLAN = {
  'miner.png':  (['miner_climb', 'miner_swing', 'miner_hang'], 'x'),
  'ore.png':    (['ore_small', 'ore_medium', 'ore_large'], 'area'),
  'bag.png':    (['bag_empty', 'bag_half', 'bag_full'], 'x'),
  'lamp.png':   (['lamp_lit', 'lamp_out'], 'x'),
  'hatch.png':  (['hatch_open', 'hatch_shut'], 'x'),
  'timber.png': (['beam_horizontal', 'beam_vertical', 'beam_diagonal', 'rope'], 'timber'),
}

def pieces(img, n):
    a = np.array(img.getchannel('A')) > 40
    small = a[::4, ::4]
    grown = ndimage.binary_dilation(small, iterations=3)          # glue a piece's own fringes together
    lab, count = ndimage.label(grown)
    sizes = ndimage.sum(small, lab, range(1, count + 1))
    keep = np.argsort(sizes)[::-1][:n] + 1
    out = []
    for k in keep:
        ys, xs = np.where(lab == k)
        x0, x1, y0, y1 = xs.min() * 4, (xs.max() + 1) * 4, ys.min() * 4, (ys.max() + 1) * 4
        mask = np.zeros_like(a); mask[y0:y1, x0:x1] = np.kron(lab[y0 // 4:(y1 + 3) // 4, x0 // 4:(x1 + 3) // 4] == k,
                                                              np.ones((4, 4), bool))[:y1 - y0, :x1 - x0]
        piece = np.array(img).copy(); piece[~mask] = 0           # only this shape, nothing from neighbours
        crop = Image.fromarray(piece).crop((x0, y0, x1, y1)); bb = crop.getbbox()
        out.append({'img': crop.crop(bb), 'x': x0 + bb[0], 'area': int(sizes[k - 1]),
                    'w': bb[2] - bb[0], 'h': bb[3] - bb[1]})
    return out

def order(found, how):
    if how == 'x': return sorted(found, key=lambda p: p['x'])
    if how == 'area': return sorted(found, key=lambda p: p['area'])
    # timber: beam is the widest-for-height, rope the thinnest tall piece, post tall and thick, brace what is left
    rest = list(found)
    beam = max(rest, key=lambda p: p['w'] / p['h']); rest.remove(beam)
    rope = min(rest, key=lambda p: p['area']); rest.remove(rope)
    post = max(rest, key=lambda p: p['h'] / p['w']); rest.remove(post)
    return [beam, post, rest[0], rope]

def top_x(im, frac=0.03):
    """centre of the opaque pixels in the top rows: where a rope or handle meets the piece"""
    a = np.array(im.getchannel('A')) > 100
    rows = a[: max(2, int(im.height * frac))]
    xs = np.where(rows.any(axis=0))[0]
    return round(float(xs.mean()) / im.width, 3)

def lantern(im):
    """the painted lantern's lit glass: bright warm pixels in the lower 2/3; returns centre x, centre y, height as fractions"""
    p = np.array(im.convert('RGBA')).astype(int); r, g, b, a = p[..., 0], p[..., 1], p[..., 2], p[..., 3]
    hot = (a > 200) & (r > 215) & (g > 140) & (b < 140)
    hot[: im.height // 3] = False
    lab, n = ndimage.label(ndimage.binary_dilation(hot, iterations=4))
    if not n: return None
    k = np.argmax(ndimage.sum(hot, lab, range(1, n + 1))) + 1
    ys, xs = np.where((lab == k) & hot)
    cx, cy, gh = xs.mean(), ys.mean(), ys.max() - ys.min() + 1
    return {'x': round(cx / im.width, 3), 'y': round(cy / im.height, 3), 'h': round(gh * 2.3 / im.height, 3)}

measured = {}
for sheet, (names, how) in PLAN.items():
    p = os.path.join(SHEETS, sheet)
    if not os.path.exists(p): print('missing', sheet); continue
    img = Image.open(p).convert('RGBA')
    found = order(pieces(img, len(names)), how)
    for name, piece in zip(names, found):
        s = piece['img']; s.thumbnail((MAX, MAX), Image.LANCZOS)
        s.save(os.path.join(OUT, name + '.webp'), quality=86, method=6)
        info = {'size': s.size}
        if name.startswith(('miner', 'bag')): info['ropeX'] = top_x(s)
        if name.startswith('miner'): info['lantern'] = lantern(s)
        measured[name] = info
        print(name, info)

# rock backdrops: made to loop vertically (the bottom crossfades into the top), plus a join strip
# that fades the upper rock into the deep rock so the change of rock has no hard line
W, H, BLEND = 544, 960, 160
def looped(path):
    im = np.array(Image.open(path).convert('RGB').resize((W, H + BLEND), Image.LANCZOS)).astype(float)
    body = im[:H].copy(); tail = im[H:]
    t = np.linspace(0, 1, BLEND)[:, None, None]
    body[:BLEND] = tail * (1 - t) + body[:BLEND] * t           # row H wraps into row 0 smoothly
    return body
up, deep = looped(os.path.join(SHEETS, 'rock-upper.png')), looped(os.path.join(SHEETS, 'rock-deep.png'))
for name, arr in (('rock_upper', up), ('rock_deep', deep)):
    Image.fromarray(arr.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.webp'), quality=80, method=6)
JOIN = 480
t = np.linspace(0, 1, JOIN)[:, None, None]; t = t * t * (3 - 2 * t)
join = up[:JOIN] * (1 - t) + deep[:JOIN] * t                 # both start at row 0 where they meet
Image.fromarray(join.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, 'rock_join.webp'), quality=80, method=6)
print('rock_upper, rock_deep', (W, H), 'rock_join', (W, JOIN))
