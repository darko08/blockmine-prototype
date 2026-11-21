# 3D preview: art sources

The 3D page (`3d/index.html`, open it with `?test` for simulated blocks) draws the cutaway mine with real 3D models.
It loads the 2D game's own `cutaway/settings.js`, `cutaway/mine.js` and `js/*.js`, so the rules are the same; only the drawing is new (`3d/game3d.js`).

- `miner/process_miner.py`: imports the Tripo miner GLB, decimates it to about 40,000 triangles, bakes its colour to one 2048 texture, exports `miner.fbx` and renders `render_before.png` / `render_after.png`.
- `miner/rig_miner.py`: adds a simple skeleton and four animations (idle, walk, climb, swing) to `miner.fbx` and exports `3d/models/miner.glb`; `--poses` renders `poses.png`.
- `models/slim_props.py`: decimates the Tripo prop models, shrinks their textures to 1024 and exports `3d/models/<name>.glb`.
- `shots/`: screenshots of the 3D page.

Run each with Blender 4.5 headless: `blender -b --factory-startup --python <script> -- <args>`.
The source GLBs from Runway (`miner/miner_source.glb`, `models/*.glb`, 5 to 42 MB each) are kept out of git.
