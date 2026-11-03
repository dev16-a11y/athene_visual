import bpy, sys
src = sys.argv[-2]
dst = sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True)
print('EXPORTED', dst)
