"""Export miner_for_mixamo.fbx: the decimated miner (miner.fbx) turned to face the front (-Y in Blender, what Mixamo
calls the front), feet on the ground at the origin, texture embedded. Also renders mixamo_check.png from the front.
  blender -b --factory-startup --python art-source/miner/for_mixamo.py -- art-source/miner"""
import bpy, sys, os, math
from mathutils import Vector

DIR = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(DIR, 'miner.fbx'))
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
o.rotation_euler = (0, 0, -math.pi / 2)        # he faces +X; turn him to face -Y
bpy.ops.object.transform_apply(rotation=True)
vs = [v.co for v in o.data.vertices]
lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
for v in o.data.vertices: v.co -= shift
o.scale = (1.8, 1.8, 1.8)                       # a man about 1.8 m tall, so Mixamo's preview and sizes look right
bpy.ops.object.transform_apply(scale=True)
img = next(i for i in bpy.data.images if i.size[0] > 0)
if not img.filepath or not os.path.exists(bpy.path.abspath(img.filepath)):
    p = os.path.join(DIR, 'miner_color.png'); img.filepath = p
out = os.path.join(DIR, 'miner_for_mixamo.fbx')
bpy.ops.export_scene.fbx(filepath=out, use_selection=True, path_mode='COPY', embed_textures=True, mesh_smooth_type='FACE')
print('FBX', out, round(os.path.getsize(out) / 1e6, 2), 'MB', 'height', round((hi.z - lo.z) * 1.8, 2), 'm')

# a front view to check he faces the camera
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x, sc.render.resolution_y = 500, 600
cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = 2.2
cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -6, 0.9); cam.rotation_euler = (math.pi / 2, 0, 0)
sc.render.filepath = os.path.join(DIR, 'mixamo_check.png'); bpy.ops.render.render(write_still=True)
print('CHECK', sc.render.filepath)
