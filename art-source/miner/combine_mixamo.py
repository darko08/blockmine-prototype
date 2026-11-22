"""Combine the Mixamo downloads (art-source/mixamo/*.fbx) into the game's 3d/models/miner.glb:
the rigged miner from idle.fbx (downloaded with skin) plus every other file's animation as its own clip.
  blender -b --factory-startup --python art-source/miner/combine_mixamo.py -- art-source/mixamo 3d/models/miner.glb
The raw Mixamo files stay out of git; only this finished model is published."""
import bpy, sys, os

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(args[0]), os.path.abspath(args[1])
CLIPS = ['idle', 'walk', 'climb', 'swing', 'jump']           # idle.fbx carries the skin
NO_ROOT_MOTION = {'jump', 'climb'}                            # the game moves him; the clip only moves his limbs
# (Mixamo's ladder climb holds his hips about a metre to the side and up, even 'in place')

bpy.ops.wm.read_factory_settings(use_empty=True)

def imported(path):
    before = set(bpy.data.objects); acts = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    return [o for o in bpy.data.objects if o not in before], [a for a in bpy.data.actions if a not in acts]

objs, acts = imported(os.path.join(SRC, 'idle.fbx'))
rig = next(o for o in objs if o.type == 'ARMATURE'); body = [o for o in objs if o.type == 'MESH']
acts[0].name = 'idle'; acts[0].use_fake_user = True
clips = {'idle': acts[0]}
for name in CLIPS[1:]:
    p = os.path.join(SRC, name + '.fbx')
    if not os.path.exists(p): print('MISSING', name); continue
    o2, a2 = imported(p)
    a = a2[0]; a.name = name; a.use_fake_user = True; clips[name] = a
    for o in o2: bpy.data.objects.remove(o)
    if name in NO_ROOT_MOTION:   # drop the hips' travel so the clip stays where the game puts him
        for fc in list(a.fcurves):
            if fc.data_path.endswith('Hips"].location'): a.fcurves.remove(fc)

rig.animation_data_create(); rig.animation_data.action = None
for tr in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(tr)
for name, a in clips.items():
    tr = rig.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, int(a.frame_range[0]), a)

bpy.context.view_layer.update()
lo = min((o.matrix_world @ v.co).z for o in body for v in o.data.vertices)
hi = max((o.matrix_world @ v.co).z for o in body for v in o.data.vertices)
print('HEIGHT', round(hi - lo, 3), 'FEET', round(lo, 3), 'IMAGES', [(i.name, tuple(i.size)) for i in bpy.data.images])
for a in clips.values(): print('CLIP', a.name, a.frame_range[:], 'frames', len(a.fcurves), 'curves')

bpy.ops.object.select_all(action='DESELECT')
for o in [rig] + body: o.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_format='GLB', export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_image_format='JPEG', export_jpeg_quality=85)
print('GLB', OUT, round(os.path.getsize(OUT) / 1e6, 2), 'MB')
