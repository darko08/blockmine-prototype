"""Simple placeholder art for the cutaway mine, written to Assets/cutaway/.
Every file here will be replaced by painted art; the game only cares about the file names.
Run:  python tools/make_placeholders.py"""
import os, random
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Assets', 'cutaway')
os.makedirs(OUT, exist_ok=True)
save = lambda im, name: im.save(os.path.join(OUT, name), optimize=True)

# rock and tunnel back-wall per zone: grey, brown, rust, ember
ZONES = [((74, 72, 70), (40, 38, 36)), ((88, 72, 58), (46, 38, 30)), ((96, 60, 44), (50, 32, 24)), ((70, 40, 34), (38, 22, 20))]
for i, (rock, back) in enumerate(ZONES):
    for name, base, n in (('rock', rock, 60), ('tunnel', back, 30)):
        rnd = random.Random(f'{name}{i}')
        im = Image.new('RGB', (128, 128), base); d = ImageDraw.Draw(im)
        for _ in range(n):   # blotches, wrapped so the tile repeats cleanly
            x, y, r = rnd.randrange(128), rnd.randrange(128), rnd.randrange(4, 14)
            k = rnd.randrange(-16, 16); c = tuple(max(0, min(255, v + k)) for v in base)
            for ox in (-128, 0, 128):
                for oy in (-128, 0, 128):
                    d.ellipse([x + ox - r, y + oy - r, x + ox + r, y + oy + r], fill=c)
        if name == 'rock' and i >= 2:   # glowing veins in the deep
            for _ in range(5):
                x, y = rnd.randrange(128), rnd.randrange(128)
                d.line([x, y, (x + rnd.randrange(-30, 30)) % 128, (y + rnd.randrange(-30, 30)) % 128], fill=(255, 120 if i == 2 else 80, 30), width=2)
        save(im.filter(ImageFilter.GaussianBlur(1.2)), f'{name}_zone{i + 1}.png')

def ore(name, fill, edge, spikes):
    im = Image.new('RGBA', (64, 64)); d = ImageDraw.Draw(im)
    rnd = random.Random(name)
    for _ in range(spikes):
        cx = 32 + rnd.randrange(-14, 14); h = rnd.randrange(16, 28); w = rnd.randrange(5, 9)
        d.polygon([(cx - w, 46), (cx, 46 - h), (cx + w, 46)], fill=fill, outline=edge)
    d.ellipse([12, 40, 52, 56], fill=(40, 34, 30, 255))
    save(im, name)
ore('ore_zone1.png', (200, 170, 120, 255), (90, 70, 40, 255), 3)
ore('ore_zone2.png', (230, 160, 70, 255), (110, 60, 20, 255), 4)
ore('ore_zone3.png', (255, 130, 40, 255), (120, 40, 10, 255), 5)
ore('ore_zone4.png', (255, 90, 30, 255), (110, 20, 10, 255), 6)
ore('ore_rich.png', (255, 235, 140, 255), (255, 255, 255, 255), 7)

im = Image.new('RGBA', (32, 64)); d = ImageDraw.Draw(im)   # ladder: repeats vertically
d.rectangle([4, 0, 8, 63], fill=(120, 86, 50, 255)); d.rectangle([24, 0, 28, 63], fill=(120, 86, 50, 255))
for y in (8, 24, 40, 56): d.rectangle([4, y, 28, y + 3], fill=(150, 110, 66, 255))
save(im, 'ladder.png')

im = Image.new('RGB', (128, 128), (14, 14, 18)); save(im, 'surface.png')

def miner(name, arms):
    im = Image.new('RGBA', (40, 64)); d = ImageDraw.Draw(im)
    d.ellipse([13, 2, 27, 16], fill=(170, 140, 110, 255))                 # head
    d.rectangle([11, 0, 29, 6], fill=(90, 90, 96, 255))                    # helmet
    d.rectangle([12, 16, 28, 42], fill=(92, 70, 52, 255))                  # coat
    d.rectangle([12, 42, 18, 62], fill=(60, 50, 44, 255)); d.rectangle([22, 42, 28, 62], fill=(60, 50, 44, 255))
    for a in arms: d.line(a, fill=(92, 70, 52, 255), width=5)
    if name == 'miner_mine.png': d.line([30, 10, 38, 2], fill=(160, 160, 170, 255), width=3); d.line([33, 0, 39, 8], fill=(160, 160, 170, 255), width=3)
    save(im, name)
miner('miner_walk.png', [[13, 18, 8, 36], [27, 18, 32, 36]])
miner('miner_climb.png', [[13, 18, 10, 4], [27, 18, 30, 4]])
miner('miner_mine.png', [[13, 18, 8, 34], [27, 18, 32, 8]])

for name, fill in (('bag_empty.png', 0.25), ('bag_half.png', 0.6), ('bag_full.png', 1.0)):
    im = Image.new('RGBA', (40, 48)); d = ImageDraw.Draw(im)
    w = int(10 + 8 * fill)
    d.line([20, 0, 20, 10], fill=(120, 90, 60, 255), width=3)
    d.ellipse([20 - w, 10, 20 + w, 46], fill=(126, 98, 66, 255), outline=(70, 50, 30, 255))
    if fill > 0.5: d.ellipse([20 - w + 4, 12, 20 + w - 4, 22], fill=(255, 150, 50, 255))
    save(im, name)

for name, lit in (('lamp_lit.png', True), ('lamp_out.png', False)):
    im = Image.new('RGBA', (24, 32)); d = ImageDraw.Draw(im)
    d.arc([6, 0, 18, 10], 180, 360, fill=(120, 110, 100, 255), width=2)
    d.rectangle([5, 6, 19, 28], outline=(110, 100, 90, 255), width=2, fill=(255, 190, 80, 255) if lit else (30, 30, 34, 255))
    save(im, name)

for name, open_ in (('hatch_open.png', True), ('hatch_shut.png', False)):
    im = Image.new('RGBA', (96, 40)); d = ImageDraw.Draw(im)
    d.rectangle([0, 28, 95, 39], fill=(100, 74, 48, 255))
    if open_:
        d.polygon([(4, 28), (14, 2), (22, 2), (20, 28)], fill=(120, 88, 56, 255)); d.polygon([(76, 28), (74, 2), (82, 2), (92, 28)], fill=(120, 88, 56, 255))
        d.rectangle([24, 30, 72, 39], fill=(255, 150, 60, 255))
    else:
        d.rectangle([14, 18, 82, 30], fill=(120, 88, 56, 255)); d.line([30, 24, 66, 24], fill=(70, 70, 76, 255), width=3)
    save(im, name)
print('placeholders in', OUT)
