# Run: blender --background --python import_blender.py
import bpy
from pathlib import Path
folder = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(folder / 'smarttwin_sts_crane.glb'))
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'smarttwin_sts_crane.blend'))
