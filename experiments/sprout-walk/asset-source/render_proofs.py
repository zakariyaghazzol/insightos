"""Reopen experimental source; audit poses and render real multi-angle frames.
This script never saves a Blender source or changes any production asset.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent.parent
manifest = json.loads((ROOT / 'public/experiments/sprout-walk/sprout-walk-v001.manifest.json').read_text())
assert Path(bpy.data.filepath).resolve() == BASE / 'sprout-walk-v001.blend'
source_digest = hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()
assert source_digest == manifest['source_sha256']
scene = bpy.data.scenes['SPROUT_Walk_Experiment_v001']
bpy.context.window.scene = scene
rig = scene.objects['RIG_Sprout']
body_keys = [scene.objects[n].data.shape_keys for n in ('SPROUT_BODY', 'SPROUT_CORE')]
eyes = [scene.objects['EYE_'+s] for s in ('L', 'R')]
glints = [scene.objects['GLINT_'+s] for s in ('L', 'R')]
reaction = scene.objects['REACTION_ROOT']
owners = [rig, *body_keys, reaction, *[eye.data.shape_keys for eye in eyes], *glints]
model = [o for o in bpy.data.collections['SPROUT_MODEL'].objects if o.type == 'MESH']

def activate(clip, frame):
    for owner in owners:
        ad = owner.animation_data
        if ad:
            ad.action = None
            ad.use_nla = False
            for track in ad.nla_tracks:
                track.mute = True
    for bone in rig.pose.bones:
        bone.location = bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    reaction.location = reaction.rotation_euler = (0, 0, 0)
    reaction.scale = (1, 1, 1)
    for keys in [*body_keys, *[eye.data.shape_keys for eye in eyes]]:
        for key in list(keys.key_blocks)[1:]:
            key.value = 0
    for glint in glints:
        glint.scale = (1, 1, 1)
    for owner in owners:
        ad = owner.animation_data
        if ad:
            track = next((t for t in ad.nla_tracks if t.name == clip), None)
            if track:
                strip = track.strips[0]
                ad.action, ad.action_slot = strip.action, strip.action_slot
            owner.update_tag()
    scene.frame_set(frame)
    bpy.context.view_layer.update()

def evaluated_points(obj):
    ob = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ob.to_mesh()
    points = [ob.matrix_world @ v.co for v in mesh.vertices]
    ob.to_mesh_clear()
    return points

union = {'min': [float('inf')]*3, 'max': [float('-inf')]*3}
poses = []
for clip in manifest['clips']:
    count = round(clip['duration_seconds']*24)
    for frame in range(1, count+2):
        activate(clip['name'], frame)
        assert list(rig.pose.bones['ROOT'].location) == [0, 0, 0]
        assert list(rig.pose.bones['ROOT'].rotation_euler) == [0, 0, 0]
        assert [k.value for k in body_keys[0].key_blocks] == [k.value for k in body_keys[1].key_blocks]
        points = [p for ob in model for p in evaluated_points(ob)]
        for axis in range(3):
            union['min'][axis] = min(union['min'][axis], min(p[axis] for p in points))
            union['max'][axis] = max(union['max'][axis], max(p[axis] for p in points))
        assert all(math.isfinite(value) for p in points for value in p)
        if frame in (1, 9, 16, 24, 31):
            poses.append({'clip': clip['name'], 'frame': frame, 'feet_world': {side: list((rig.matrix_world @ rig.pose.bones['FOOT_'+side].matrix).translation) for side in ('L', 'R')}})
if 'cycles' not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module='cycles')
try:
    scene.render.engine = 'CYCLES'
except TypeError as error:
    raise RuntimeError('Cycles unavailable') from error
preferences = bpy.context.preferences.addons['cycles'].preferences
choices = [i.identifier for i in preferences.bl_rna.properties['compute_device_type'].enum_items]
assert not choices or 'OPTIX' in choices
preferences.compute_device_type = 'OPTIX'
preferences.get_devices()
for device in preferences.devices:
    device.use = device.type == 'OPTIX'
assert any(device.use for device in preferences.devices)
assert 'GPU' in [i.identifier for i in scene.cycles.bl_rna.properties['device'].enum_items]
scene.cycles.device = 'GPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.film_transparent = True
for name, value in (('file_format', 'PNG'), ('color_mode', 'RGBA')):
    assert value in [i.identifier for i in scene.render.image_settings.bl_rna.properties[name].enum_items]
    setattr(scene.render.image_settings, name, value)
scene.render.resolution_x = scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
camera = scene.objects['CAM_sprout_hero']
scene.camera = camera
camera.data.ortho_scale = 2.85
for card in [o for o in scene.objects if o.name.startswith('REFLECTION_sprout_')]:
    card.visible_camera = False
renders = []
for clip, frame, angle in [('Sprout_WalkLoop', 9, 0), ('Sprout_WalkLoop', 24, 0),
                           ('Sprout_WalkLoop', 9, 65), ('Sprout_WalkLoop', 24, 90),
                           ('Sprout_WalkLoop', 9, 180), ('Sprout_WalkLoop', 24, -90),
                           ('Sprout_InspectTarget', 16, 30), ('Sprout_TapTarget', 16, 65)]:
    activate(clip, frame)
    radians = math.radians(angle)
    camera.location = (6*math.sin(radians), -6*math.cos(radians), .40)
    camera.rotation_euler = (Vector((0, 0, .04))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    path = BASE / ('proof-'+clip.removeprefix('Sprout_').lower()+'-'+str(frame)+'-'+str(angle)+'.png')
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    renders.append({'clip': clip, 'frame': frame, 'angle_degrees': angle, 'file': path.name})
report = {'pass': True, 'source_sha256': source_digest, 'poses_checked': 99,
          'root_stationary': True, 'paired_shell_core_shapes': True,
          'bounds_blender': union, 'sampled_foot_positions': poses, 'renders': renders,
          'scope': 'Source Cycles frames, not browser lighting; no desktop behavior.'}
(BASE / 'source-pose-audit.json').write_text(json.dumps(report, indent=2)+'\n')
assert hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest() == source_digest
print(json.dumps({'pass': True, 'bounds': union, 'renders': len(renders)}))
