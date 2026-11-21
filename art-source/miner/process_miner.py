"""Turn the Tripo miner GLB into a game-weight FBX.
Run headless:
  blender -b --factory-startup --python art-source/miner/process_miner.py -- <folder> [target_tris]
Steps: import miner_source.glb, render it from four sides (render_before.png), decimate a copy to about
target_tris triangles, give it fresh UVs, bake the original's colour onto one 2048 texture (miner_color.png),
export miner.fbx with that texture embedded, then import the FBX into an empty scene and render it the same
way (render_after.png)."""
import bpy, bmesh, sys, os, math, json
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
DIR = os.path.abspath(args[0])
TARGET = int(args[1]) if len(args) > 1 else 40000
TEX = 2048
SRC = os.path.join(DIR, 'miner_source.glb')


def tris(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def render_turnaround(objs, out, label):
    """four views (front, right, back, left) side by side, textured, studio light, transparent background"""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_cavity = False
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 600, 900
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    centre, size = (lo + hi) / 2, hi - lo
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(size.z, max(size.x, size.y) * 1.5) * 1.08
    cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
    # the figure is thin along X, so it faces along X; front view looks from -X
    frames = []
    for i, az in enumerate([0, 90, 180, 270]):
        a = math.radians(az)
        d = Vector((-math.cos(a), -math.sin(a), 0))
        cam.location = centre + d * (size.length * 3)
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        p = os.path.join(DIR, f'_view{i}.png'); sc.render.filepath = p
        bpy.ops.render.render(write_still=True); frames.append(p)
    # stitch the four views with Blender's own image buffers
    import numpy as np
    imgs = []
    for p in frames:
        im = bpy.data.images.load(p); a = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)
        imgs.append(a); bpy.data.images.remove(im); os.remove(p)
    strip = np.concatenate(imgs, axis=1)
    bg = np.ones_like(strip); bg[..., :3] = (0.16, 0.15, 0.14)   # dark backdrop so the texture reads
    out_px = strip * strip[..., 3:4] + bg * (1 - strip[..., 3:4]); out_px[..., 3] = 1
    h, w = out_px.shape[:2]
    im = bpy.data.images.new('strip', w, h, alpha=True); im.pixels = out_px.ravel()
    im.filepath_raw = out; im.file_format = 'PNG'; im.save()
    bpy.data.objects.remove(cam)
    print(f'RENDER {label} -> {out}')


# ---------- before ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
high = mesh_objects()[0]
high.name = 'miner_high'
before = tris(high)
print('TRIS_BEFORE', before)
render_turnaround([high], os.path.join(DIR, 'render_before.png'), 'before')

# ---------- decimate a copy ----------
low = high.copy(); low.data = high.data.copy(); low.name = 'miner'
bpy.context.scene.collection.objects.link(low)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = low; low.select_set(True)
dec = low.modifiers.new('decimate', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'
dec.ratio = TARGET / before; dec.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=dec.name)
after = tris(low)
print('TRIS_AFTER', after)

# fresh UVs for the low mesh, so one clean 2048 atlas holds everything
me = low.data
while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
me.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, area_weight=0.0)
bpy.ops.uv.pack_islands(margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')

# a new material on the low mesh with one 2048 image to bake into
img = bpy.data.images.new('miner_color', TEX, TEX, alpha=False)
mat = bpy.data.materials.new('miner'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
me.materials.clear(); me.materials.append(mat)
nt.nodes.active = tn

# ---------- bake the original's colour onto the low mesh ----------
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
bk = sc.render.bake
bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
bk.use_selected_to_active = True; bk.cage_extrusion = 0.01; bk.max_ray_distance = 0.03; bk.margin = 8
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
bpy.ops.object.bake(type='DIFFUSE')
png = os.path.join(DIR, 'miner_color.png')
img.filepath_raw = png; img.file_format = 'PNG'; img.save()
print('BAKED', png)

# ---------- export ----------
bpy.data.objects.remove(high)
img.filepath = png                      # the FBX exporter embeds the file at this path
bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
fbx = os.path.join(DIR, 'miner.fbx')
bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True, path_mode='COPY', embed_textures=True,
                         mesh_smooth_type='FACE', apply_scale_options='FBX_SCALE_ALL')
print('FBX', fbx, round(os.path.getsize(fbx) / 1e6, 2), 'MB')

# ---------- after: the FBX alone, in an empty scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
objs = mesh_objects()
print('FBX_IMPORT', [(o.name, tris(o)) for o in objs], 'images', [(i.name, tuple(i.size), i.packed_file is not None) for i in bpy.data.images])
render_turnaround(objs, os.path.join(DIR, 'render_after.png'), 'after')
json.dump({'tris_before': before, 'tris_after': after}, open(os.path.join(DIR, 'stats.json'), 'w'))
