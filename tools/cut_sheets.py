"""Cut the Runway sheets in Assets/sheets into single sprites in Assets/.
Re-run after replacing a sheet. Each sprite is trimmed to its pixels and scaled
so its longest side is at most MAX px (keeps the page fast to load)."""
import sys, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = os.path.join(ROOT, 'Assets', 'sheets'); OUT = os.path.join(ROOT, 'Assets')
MAX = 384
# sheet -> names of pieces in reading order (top-to-bottom, left-to-right)
PLAN = {
  'sheet_miner.png':  ['miner_hang', 'miner_swing', 'miner_climb'],
  'sheet_bag.png':    ['bag_empty', 'bag_half', 'bag_full'],
  'sheet_lamp.png':   ['lamp_lit', 'lamp_out'],
  'sheet_hatch.png':  ['hatch_open', 'hatch_shut'],
  'sheet_timber.png': ['beam_horizontal', 'beam_vertical', 'beam_diagonal', 'rope'],
}
def solid(a, axis, thr=8):
    w, h = a.size; px = a.load()
    n = w if axis == 0 else h; m = h if axis == 0 else w
    out = []
    for i in range(n):
        c = 0
        for j in range(0, m, 2):
            v = px[i, j] if axis == 0 else px[j, i]
            if v > 40: c += 1
        out.append(c > thr // 2)
    return out
def runs(flags, gap=12):
    rs, start, last = [], None, None
    for i, f in enumerate(flags):
        if f:
            if start is None: start = i
            elif i - last > gap: rs.append((start, last + 1)); start = i
            last = i
    if start is not None: rs.append((start, last + 1))
    return [r for r in rs if r[1] - r[0] > 20]
def cut(img):
    """recursive XY cut: rows first, then columns inside each row"""
    a = img.getchannel('A'); boxes = []
    for y0, y1 in runs(solid(a, 1)):
        band = a.crop((0, y0, a.width, y1))
        cols = runs(solid(band, 0))
        for x0, x1 in cols:
            sub = a.crop((x0, y0, x1, y1)); bb = sub.getbbox()
            if len(cols) == 1 or True:
                inner = runs(solid(sub, 1))
                if len(inner) > 1:   # e.g. vertical pieces under a long beam
                    for b in cut(img.crop((x0, y0, x1, y1))):
                        boxes.append((b[0]+x0, b[1]+y0, b[2]+x0, b[3]+y0))
                    continue
            boxes.append((x0+bb[0], y0+bb[1], x0+bb[2], y0+bb[3]))
    return boxes
for sheet, names in PLAN.items():
    p = os.path.join(SHEETS, sheet)
    if not os.path.exists(p): print('missing', sheet); continue
    img = Image.open(p).convert('RGBA'); boxes = cut(img)
    if len(boxes) != len(names):
        print(f'{sheet}: found {len(boxes)} pieces, expected {len(names)}: {boxes}'); continue
    for name, b in zip(names, boxes):
        s = img.crop(b); s.thumbnail((MAX, MAX), Image.LANCZOS)
        s.save(os.path.join(OUT, name + '.png'), optimize=True)
        print(name, s.size)
for tex in ['tex_wall', 'tex_deep']:
    p = os.path.join(SHEETS, tex + '.png')
    if os.path.exists(p):
        Image.open(p).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, tex + '.jpg'), quality=82)
        print(tex, '512x512 jpg')
