"""Give the decimated miner a simple skeleton and four animations, and export miner_rigged.glb for the 3D page.
  blender -b --factory-startup --python art-source/miner/rig_miner.py -- <folder> [--poses]
Reads miner.fbx (made by process_miner.py). The figure stands on Z=0, faces +X, arms out along +-Y (T-pose).
Joint positions are fractions of his height, measured on the T-pose renders. --poses renders each animation's
key poses to poses.png so the bends can be checked."""
import bpy, sys, os, math
from mathutils import Vector, Quaternion

args = sys.argv[sys.argv.index('--') + 1:]
DIR = os.path.abspath(args[0]); POSES = '--poses' in args

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(DIR, 'miner.fbx'))
body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = [body.matrix_world @ v.co for v in body.data.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs); H = zmax - zmin
torso = [v for v in vs if zmin + 0.55 * H < v.z < zmin + 0.75 * H]
torso = sorted(torso, key=lambda v: abs(v.y))[: len(torso) // 2]   # the middle half: the chest, not the arms
cx = sum(v.x for v in torso) / len(torso); cy = sum(v.y for v in torso) / len(torso)
legs = [v for v in vs if zmin + 0.25 * H < v.z < zmin + 0.35 * H]
lx = sum(v.x for v in legs) / len(legs)
print('H', round(H, 3), 'centre', round(cx, 3), round(cy, 3))

def P(x, y, z): return Vector((cx + x * H, cy + y * H, zmin + z * H))
# name: (head, tail, parent)
J = {
    'hips': (P(0, 0, 0.56), P(0, 0, 0.66), None),
    'spine': (P(0, 0, 0.66), P(0, 0, 0.76), 'hips'),
    'chest': (P(0, 0, 0.76), P(0, 0, 0.84), 'spine'),
    'head': (P(0, 0, 0.84), P(0, 0, 1.0), 'chest'),
}
for s, sg in (('L', 1), ('R', -1)):
    J['shoulder.' + s] = (P(0, sg * 0.04, 0.79), P(0, sg * 0.11, 0.765), 'chest')
    J['upperarm.' + s] = (P(0, sg * 0.11, 0.765), P(0, sg * 0.25, 0.755), 'shoulder.' + s)
    J['forearm.' + s] = (P(0, sg * 0.25, 0.755), P(0, sg * 0.40, 0.75), 'upperarm.' + s)
    J['hand.' + s] = (P(0, sg * 0.40, 0.75), P(0, sg * 0.47, 0.75), 'forearm.' + s)
    J['thigh.' + s] = (P(lx / H - cx / H, sg * 0.065, 0.56), P(lx / H - cx / H, sg * 0.07, 0.31), 'hips')
    J['shin.' + s] = (P(lx / H - cx / H, sg * 0.07, 0.31), P(lx / H - cx / H, sg * 0.07, 0.075), 'thigh.' + s)
    J['foot.' + s] = (P(lx / H - cx / H, sg * 0.07, 0.075), P(lx / H - cx / H + 0.09, sg * 0.07, 0.02), 'shin.' + s)

arm_data = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('miner_rig', arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
for name, (h, t, par) in J.items():
    b = eb.new(name); b.head, b.tail = h, t
    b.roll = 0
for name, (h, t, par) in J.items():
    if par: eb[name].parent = eb[par]; eb[name].use_connect = (eb[par].tail - eb[name].head).length < 1e-4
bpy.ops.object.mode_set(mode='OBJECT')

# skin: Blender's automatic (heat) weights; if any vertex gets none, fall back to nearest-bone weights
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
unweighted = [v.index for v in body.data.vertices if not any(g.weight > 1e-3 for g in v.groups)]
print('UNWEIGHTED', len(unweighted), 'of', len(body.data.vertices))
if len(unweighted) > len(body.data.vertices) * 0.01:
    print('heat weights failed; using nearest-bone weights')
    for vg in list(body.vertex_groups): body.vertex_groups.remove(vg)
    groups = {n: body.vertex_groups.new(name=n) for n in J}
    segs = {n: (h, t) for n, (h, t, _) in J.items() if n != 'shoulder.L' and n != 'shoulder.R'}
    def dist(p, a, b):
        ab = b - a; t = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (a + ab * t - p).length
    for v in body.data.vertices:
        d = sorted((dist(v.co, a, b), n) for n, (a, b) in segs.items())[:2]
        w0, w1 = 1 / (d[0][0] + 1e-4) ** 4, 1 / (d[1][0] + 1e-4) ** 4
        groups[d[0][1]].add([v.index], w0 / (w0 + w1), 'REPLACE'); groups[d[1][1]].add([v.index], w1 / (w0 + w1), 'REPLACE')
elif unweighted:   # a few stray bits (inside the coat): give them to the nearest weighted neighbour's bones
    import mathutils
    kd = mathutils.kdtree.KDTree(len(body.data.vertices)); bad = set(unweighted)
    for v in body.data.vertices:
        if v.index not in bad: kd.insert(v.co, v.index)
    kd.balance()
    for i in unweighted:
        _, j, _ = kd.find(body.data.vertices[i].co)
        for g in body.data.vertices[j].groups: body.vertex_groups[g.group].add([i], g.weight, 'REPLACE')

# ---------- animations ----------
pb = rig.pose.bones
def rot(name, axis, deg):
    """rotate a bone about a world axis as it is in the rest pose (children follow their parents)"""
    b = rig.data.bones[name]
    local = (b.matrix_local.to_3x3().inverted() @ Vector(axis)).normalized()
    return Quaternion(local, math.radians(deg))
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

def pose(spec):
    """spec: {bone: [(axis, deg), ...]}; every other bone at rest"""
    for p in pb:
        q = Quaternion()
        for axis, deg in spec.get(p.name, []): q = q @ rot(p.name, axis, deg)
        p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = q
    rig.location = Vector((0, 0, spec.get('_drop', 0)))

def arms_down(extra_l=0, extra_r=0, elbow_l=12, elbow_r=12, fwd_l=0, fwd_r=0):
    # T-pose arms swing down about X; +Y side (L) turns with +X, -Y side (R) with -X. Forward swing about Z.
    return {
        'upperarm.L': [(X, -72 + extra_l), (Z, fwd_l)], 'upperarm.R': [(X, 72 - extra_r), (Z, -fwd_r)],
        'forearm.L': [(Z, elbow_l)], 'forearm.R': [(Z, -elbow_r)],
    }

def legs(thigh_l, thigh_r, knee_l, knee_r):
    # thigh forward = rotate about -Y with this rig's axes; knee bends back
    return {'thigh.L': [(Y, -thigh_l)], 'thigh.R': [(Y, -thigh_r)], 'shin.L': [(Y, knee_l)], 'shin.R': [(Y, knee_r)]}

def merge(*ds):
    out = {}
    for d in ds:
        for k, v in d.items():
            out[k] = out.get(k, []) + v if isinstance(v, list) else v
    return out

FPS = 24
ACTIONS = {
    'idle': [(0, merge(arms_down(), legs(0, 0, 0, 0), {'chest': [(Y, 0)]})),
             (36, merge(arms_down(2, 2), legs(0, 0, 0, 0), {'chest': [(Y, 2)]})),
             (72, merge(arms_down(), legs(0, 0, 0, 0), {'chest': [(Y, 0)]}))],
    'walk': [(0, merge(arms_down(fwd_l=-22, fwd_r=22), legs(26, -20, 6, 10), {'spine': [(Y, 4)]})),
             (6, merge(arms_down(fwd_l=0, fwd_r=0), legs(6, -4, 4, 38), {'spine': [(Y, 4)], '_drop': 0.012})),
             (12, merge(arms_down(fwd_l=22, fwd_r=-22), legs(-20, 26, 10, 6), {'spine': [(Y, 4)]})),
             (18, merge(arms_down(fwd_l=0, fwd_r=0), legs(-4, 6, 38, 4), {'spine': [(Y, 4)], '_drop': 0.012})),
             (24, merge(arms_down(fwd_l=-22, fwd_r=22), legs(26, -20, 6, 10), {'spine': [(Y, 4)]}))],
    # facing the ladder (the page turns his back to the camera); hands reach overhead in turn, knees lift in turn
    'climb': [(0, merge({'upperarm.L': [(X, 115)], 'upperarm.R': [(X, -35)], 'forearm.L': [(Z, 25)], 'forearm.R': [(Z, -60)]}, legs(45, 0, 75, 10))),
              (12, merge({'upperarm.L': [(X, 35)], 'upperarm.R': [(X, -115)], 'forearm.L': [(Z, 60)], 'forearm.R': [(Z, -25)]}, legs(0, 45, 10, 75))),
              (24, merge({'upperarm.L': [(X, 115)], 'upperarm.R': [(X, -35)], 'forearm.L': [(Z, 25)], 'forearm.R': [(Z, -60)]}, legs(45, 0, 75, 10)))],
    # sliding down a ladder: hands gripping the rails at chest height, knees a little bent, no stepping
    'slide': [(0, merge(arms_down(extra_l=28, extra_r=28, fwd_l=-62, fwd_r=-62, elbow_l=55, elbow_r=55), legs(18, 14, 30, 26), {'spine': [(Y, 6)]})),
              (12, merge(arms_down(extra_l=28, extra_r=28, fwd_l=-60, fwd_r=-64, elbow_l=58, elbow_r=52), legs(16, 16, 28, 28), {'spine': [(Y, 6)]})),
              (24, merge(arms_down(extra_l=28, extra_r=28, fwd_l=-62, fwd_r=-62, elbow_l=55, elbow_r=55), legs(18, 14, 30, 26), {'spine': [(Y, 6)]}))],
    # both hands on the pick: raised overhead, then a strike forward and down
    'swing': [(0, merge({'upperarm.L': [(X, 100)], 'upperarm.R': [(X, -100)], 'forearm.L': [(Z, -60)], 'forearm.R': [(Z, 60)]}, legs(12, -12, 8, 4), {'spine': [(Y, -10)]})),
              (8, merge(arms_down(fwd_l=-65, fwd_r=-65, elbow_l=5, elbow_r=5), legs(12, -12, 14, 4), {'spine': [(Y, 24)]})),
              (16, merge({'upperarm.L': [(X, 100)], 'upperarm.R': [(X, -100)], 'forearm.L': [(Z, -60)], 'forearm.R': [(Z, 60)]}, legs(12, -12, 8, 4), {'spine': [(Y, -10)]}))],
}
if POSES:
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.film_transparent = False; sc.render.resolution_x, sc.render.resolution_y = 360, 540
    cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = H * 1.25
    cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
    shots = []
    for name, keys in ACTIONS.items():
        for frame, spec in keys[:-1] if len(keys) > 2 else keys:
            pose(spec)
            for view, d in (('side', Vector((0, -1, 0))), ('front', Vector((1, 0, 0)))):
                cam.location = Vector((cx, cy, zmin + H / 2)) + d * 5 * H
                cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
                p = os.path.join(DIR, f'_p_{name}_{frame}_{view}.png'); sc.render.filepath = p
                bpy.ops.render.render(write_still=True); shots.append(p)
    import numpy as np
    ims = []
    for p in shots:
        im = bpy.data.images.load(p); ims.append(np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)); bpy.data.images.remove(im); os.remove(p)
    cols = 8; rows = [np.concatenate(ims[i:i + cols] + [np.zeros_like(ims[0])] * (cols - len(ims[i:i + cols])), axis=1) for i in range(0, len(ims), cols)]
    sheet = np.concatenate(rows[::-1], axis=0); sheet[..., 3] = 1
    out = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0]); out.pixels = sheet.ravel()
    out.filepath_raw = os.path.join(DIR, 'poses.png'); out.file_format = 'PNG'; out.save()
    print('POSES', len(shots))

rig.animation_data_create()
made = []
for name, keys in ACTIONS.items():
    act = bpy.data.actions.new(name); act.use_fake_user = True; rig.animation_data.action = act
    for frame, spec in keys:
        pose(spec)
        for p in pb: p.keyframe_insert('rotation_quaternion', frame=frame)
        rig.keyframe_insert('location', frame=frame)
    made.append(act)
# one NLA track per action so the glTF exporter writes each as its own clip
rig.animation_data.action = None
for act in made:
    tr = rig.animation_data.nla_tracks.new(); tr.name = act.name; tr.strips.new(act.name, 0, act)

pose({})
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True)
glb = os.path.join(DIR, '..', '..', '3d', 'models', 'miner.glb')
os.makedirs(os.path.dirname(glb), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_image_format='JPEG', export_jpeg_quality=85,
                          export_apply=False)
print('GLB', os.path.abspath(glb), round(os.path.getsize(glb) / 1e6, 2), 'MB')
