"""Turn the generated pickaxe (art-source/models/pickaxe.glb) into 3d/models/pick.glb, ready to hold: the handle along +Y with
the grip at the origin, the head at the top pointing along +X, about 1 unit long. Found from the shape itself: the handle is
the longest axis, the head is the end with the widest cross-section. Renders pick_check.png from the front.
  blender -b --factory-startup --python art-source/models/pick_for_hand.py"""
import bpy, os, math
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', '3d', 'models', 'pick.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, 'pickaxe.glb'))
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
m = o.modifiers.new('d', 'DECIMATE'); m.ratio = min(1, 2500 / len(o.data.polygons)); bpy.ops.object.modifier_apply(modifier='d')
P = np.array([v.co[:] for v in o.data.vertices]); c = P.mean(0); Q = P - c
w, V = np.linalg.eigh(np.cov(Q.T)); order = np.argsort(w)[::-1]
a1, a2 = V[:, order[0]], V[:, order[1]]           # the handle's long axis, then the head's axis
t = Q @ a1; lo, hi = t.min(), t.max()
spread = lambda sel: np.ptp(Q[sel] @ a2) if sel.any() else 0
if spread(t > hi - 0.2 * (hi - lo)) < spread(t < lo + 0.2 * (hi - lo)): a1 = -a1; t = -t; lo, hi = -hi, -lo   # head at +
# the head's own direction: along a2, pointing to the longer side of the head
head = Q[t > hi - 0.2 * (hi - lo)] @ a2
if abs(head.max()) < abs(head.min()): a2 = -a2
a3 = np.cross(a2, a1)
R = Matrix([list(a2), list(a1), list(a3)])        # rows: new X (head), new Y (handle), new Z
grip = c + a1 * (lo + 0.12 * (hi - lo))           # where his hand holds it, a little up from the end
o.data.transform(Matrix.Translation(-Vector(grip)))
o.data.transform(R.to_4x4())
L = hi - lo
o.data.transform(Matrix.Scale(1 / L, 4))
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82)
vs = [v.co for v in o.data.vertices]
print('PICK', os.path.getsize(OUT), 'bytes; y', round(min(v.y for v in vs), 2), round(max(v.y for v in vs), 2),
      'x', round(min(v.x for v in vs), 2), round(max(v.x for v in vs), 2))
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 400
cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = 1.4
cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, 0.45, 5); cam.rotation_euler = (0, 0, 0)   # looking down -Z at the XY plane: handle up, head across
sc.render.filepath = os.path.join(HERE, 'pick_check.png'); bpy.ops.render.render(write_still=True)
