# Run: blender --background --python import_blender.py
from pathlib import Path
import bpy
folder = Path(__file__).resolve().parent
for name in ['kalmar_ottawa_t2', 'terberg_yt193', 'terberg_yt220']:
    path = folder / (name + '.glb')
    if not path.exists():
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.ops.wm.save_as_mainfile(filepath=str(folder / (name + '.blend')))
