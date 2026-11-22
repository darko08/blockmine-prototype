"""Shrink the Tripo prop models for the 3D page: decimate (keeping their own UVs and textures), shrink the
textures to 1024, put the origin at the centre of the base, and export 3d/models/<name>.glb.
  blender -b --factory-startup --python art-source/models/slim_props.py -- [name ...]"""
import bpy, sys, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '3d', 'models')
TARGET = {'ore': 2500, 'ore_rich': 3000, 'ladder': 2500, 'headframe': 8000, 'cart': 3000, 'barrel': 2000,
          'crate': 1500, 'iron': 2500, 'silver': 2500, 'lantern': 2500, 'timber': 1200,
          'dep_bitcoin': 3500, 'dep_iron': 3000, 'dep_silver': 3500, 'dep_amber': 3000, 'bag_empty': 2500, 'bag_half': 2500, 'bag_full': 3000}
names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
names = names or [n for n in TARGET if os.path.exists(os.path.join(HERE, n + '.glb'))]
os.makedirs(OUT, exist_ok=True)
for name in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, name + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.calc_loop_triangles(); before = len(o.data.loop_triangles)
    m = o.modifiers.new('d', 'DECIMATE'); m.ratio = min(1, TARGET[name] / before); m.delimit = {'UV', 'SEAM'}
    bpy.ops.object.modifier_apply(modifier='d')
    o.data.calc_loop_triangles(); after = len(o.data.loop_triangles)
    # origin at the middle of the base
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in o.data.vertices: v.co -= shift
    for im in bpy.data.images:
        if im.size[0] > 1024: im.scale(1024, 1024)
    for ob in list(bpy.context.scene.objects):
        if ob != o: bpy.data.objects.remove(ob)
    out = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82)
    size = hi - lo
    print(f'PROP {name} tris {before}->{after} size {size.x:.3f} {size.y:.3f} {size.z:.3f} glb {os.path.getsize(out) / 1e6:.2f} MB')
