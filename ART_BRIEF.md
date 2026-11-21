# Cutaway mine: art brief

The target is your reference image: a dark side-on cutaway of a timbered mine, lit only by lanterns and glowing amber crystal, with a headframe and a night sky above.

**Sixteen images:**
- 7 sprite sheets: miner, bag, lamp, ore, timber, headframe, props
- 1 surface backdrop
- 8 seamless rock tiles, two per zone

That is about the size of your last batch. When you post the links, give each file the name in **bold**. They go into `Assets/sheets/cutaway/`, and the cutting tool turns them into the files the game loads.

## Rules for every sprite sheet
These help the cutting tool and keep the pieces matching:
- **Background:** transparent, with nothing else in the picture.
- **Spacing:** pieces well apart, never touching or overlapping.
- **Framing:** each piece fully in frame, all drawn at the same scale.
- **View:** side-on, the way the game shows the mine.
- **Facing:** characters face **right**. The game mirrors them to walk left.

Every prompt below already includes these rules. You can paste each one as it is.

**Shared style line** (already in each prompt):
> dark painterly realism, weathered wood and rusted iron, warm amber lantern light against near-black shadow, gritty high detail, consistent warm lighting from the left

---

## 1. **miner.png**: three poses

> Game sprite sheet, no scene, no ground, no text, no logos, transparent background. Three separate full-body side views of the same old gold-rush miner facing right, well spaced apart, none touching, same scale: (1) walking, holding a lit oil lantern out in front at chest height; (2) climbing a wooden ladder seen from the side, both hands up on the rungs, lantern hanging from his belt; (3) swinging a pickaxe overhead at a rock face, lantern hanging from his belt. Wide-brimmed leather hat, beard, long worn coat, boots. No backpack and no bag on him. Dark painterly realism, weathered leather and cloth, warm amber lantern light against near-black shadow, gritty high detail, consistent warm lighting from the left.

*Why there's no bag:* the bag changes as it fills, so it is a separate piece that the game straps to his back. His painted lantern is the one lamp. When the oil runs out, the game lays the "gone out" lantern over it.

## 2. **bag.png**: three fill states

> Game sprite sheet, no scene, no figure, no text, no logos, transparent background. Three separate side views of the same canvas miner's sack worn on the back, with a leather shoulder strap at the top, well spaced apart, none touching, same scale: (1) empty and limp; (2) half full, bulging, a faint amber glow at the opening; (3) full and heavy, amber crystals poking out of the top and glowing. Patched rough canvas, leather strap and buckle. Dark painterly realism, warm amber light against near-black shadow, gritty high detail, consistent warm lighting from the left.

## 3. **lamp.png**: lit and gone out

> Game sprite sheet, no scene, no figure, no text, no logos, transparent background. Two separate views of the same small brass miner's oil lantern with a carry ring, well spaced apart, none touching, same scale: (1) lit, a bright warm flame behind the glass; (2) gone out, dark glass, a thin wisp of smoke rising. No glow or halo painted around the lantern itself. Dark painterly realism, tarnished brass and soot, gritty high detail, consistent warm lighting from the left.

*Why no halo:* the game draws the light circle itself.

## 4. **ore.png**: five crystal clusters

> Game sprite sheet, no scene, no figures, no text, no logos, no symbols, transparent background. Five separate clusters of glowing crystal growing out of a small base of dark rock, well spaced apart, none touching, same scale, each a little richer than the last: (1) small dull pale-yellow crystals, barely glowing; (2) clear amber crystals with a soft glow; (3) deep orange crystals, brighter glow; (4) fiery red-orange crystals with ember sparks, strong glow; (5) a brilliant gold-white cluster, the richest and brightest of all. Crystals point straight up. Dark painterly realism, warm amber glow against near-black, gritty high detail.

*Which is which:* the game uses clusters 1–4 for zones I–IV and cluster 5 for the rare rich node. It turns them to grow from ceilings and walls.

## 5. **timber.png**: the tunnel set

> Game sprite sheet, no scene, no figures, no text, no logos, transparent background. Six separate pieces of old mine timbering, flat side-on, well spaced apart, none touching, same scale: (1) a tall vertical support post with iron bands; (2) a long horizontal cap beam; (3) a diagonal corner brace; (4) a long flat plank-and-rubble floor strip; (5) a tall straight wooden ladder with many rungs, drawn so the top and bottom match and it can repeat; (6) a short wooden ladder top with side rails curving over. Weathered dark wood, rusted iron straps and nails. Dark painterly realism, warm amber lantern light against near-black shadow, gritty high detail, consistent warm lighting from the left.

## 6. **headframe.png**: hatch open and shut

> Game sprite sheet, no scene, no figures, no text, no logos, transparent background. Two separate side-on views of the same wooden mine headframe standing over a square shaft opening, a rope wheel at the top, well spaced apart, none touching, same scale: (1) the hatch doors at its foot swung open, warm amber light rising from the shaft below; (2) the hatch doors shut and barred with an iron bar. Weathered timber, iron bolts, hemp rope. Dark painterly realism, warm amber light against near-black shadow, gritty high detail.

## 7. **props.png**: things in the tunnels

> Game sprite sheet, no scene, no figures, no text, no logos, transparent background. Eight separate mining props, side-on, well spaced apart, none touching, same scale: an iron ore cart on rails, a wooden barrel, a stack of two wooden crates, a pickaxe leaning against a rock, a shovel, a pile of loose rubble, a coil of rope, an oil can. Weathered wood, rusted iron. Dark painterly realism, warm amber lantern light against near-black shadow, gritty high detail, consistent warm lighting from the left.

*How they're used:* the game scatters these along the tunnels, placed by the block hash.

## 8. **surface.png**: the backdrop above the hatch (not transparent)

> Wide game background painting, side-on, no figures, no text, no logos: the ground above an old mine at night, seen flat and straight on. Dark jagged mountains under a stormy night sky, a small wooden cabin with one lit window on the left, scrubby grass and rocks along a flat ground line across the bottom edge. The middle of the ground line left plain and empty for the headframe to stand on. Dark painterly realism, near-black blues and greys with one warm window light, gritty high detail. Wide landscape format.

## 9. Rock tiles: eight seamless squares (not transparent)

These need to be **seamless and tileable** in both directions, square, seen flat and straight on. There are two kinds for each zone:
- **tunnel-N.png:** the back wall you see inside a tunnel. Lighter, with texture.
- **rock-N.png:** the solid rock between tunnels. Denser and darker, a cut-away rock face.

Use this frame for all eight. Paste the zone wording where it says [ZONE]:
> Seamless tileable square texture, flat and straight on, no objects, no figures, no text, no logos, no timber: [ZONE]. Even lighting across the whole tile so it repeats without seams. Dark painterly realism, gritty high detail.

| File | [ZONE] |
|---|---|
| **tunnel-1.png** | the back wall of an upper mine tunnel, packed brown earth and loose stones |
| **rock-1.png** | a cut-away face of solid brown earth and buried stones, darker and denser |
| **tunnel-2.png** | the back wall of a mine tunnel in grey stone, chisel marks and cracks |
| **rock-2.png** | a cut-away face of solid grey bedrock, darker and denser |
| **tunnel-3.png** | the back wall of a deep mine tunnel in dark rock with thin glowing amber veins |
| **rock-3.png** | a cut-away face of dark rock with faint thin amber veins, darker and denser |
| **tunnel-4.png** | the back wall of the deepest mine tunnel in black rock with bright glowing ember-orange veins |
| **rock-4.png** | a cut-away face of black rock with glowing ember veins, darker and denser |

---

## What happens when you send them
1. I'll download each file under its name into `Assets/sheets/cutaway/`.
2. I'll cut the sheets into single pieces. The game will then use:
   - the miner's lantern position in each pose;
   - the bag strapped to his back;
   - timber posts, braces and cap beams framing each tunnel;
   - the ladder repeating down the shafts;
   - the headframe over the hatch, and the props placed from the block hash.
3. I'll give the HUD single-line brass bars like your reference: OIL, BAG, BLOCK and OPEN, and the percentage.
4. As always, every picture stays a file you can swap. No rules change.
