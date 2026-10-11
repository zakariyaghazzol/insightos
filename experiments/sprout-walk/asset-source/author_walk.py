"""Versioned, additive locomotion on the approved Soft Original rig.

Run headless Blender with the v008 .blend and --python this_file.
Only files under this experimental source/public directory are written.
Blender creates the actions; the exporter output contributes only those new
animation streams to the frozen runtime GLB, preserving every old byte.
"""
import bpy
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
from mathutils import Vector

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent.parent
PUBLIC = ROOT / 'public/experiments/sprout-walk'
SOURCE = ROOT / 'design/buddy/sprout/source/sprout-soft-original-v008.blend'
BASELINE = ROOT / 'public/buddy/sprout-v008.glb'
EDITABLE = BASE / 'sprout-walk-v001.blend'
TRIAL = BASE / 'sprout-walk-source-v001.glb'
OUTPUT = PUBLIC / 'sprout-walk-v001.glb'
FPS = 24
STRIDE = .82
STANCE = .55
CLIPS = {'Sprout_WalkLoop': 30, 'Sprout_InspectTarget': 36, 'Sprout_TapTarget': 30}

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def set_enum(owner, name, value):
    choices = [item.identifier for item in owner.bl_rna.properties[name].enum_items]
    assert value in choices, (name, value, choices)
    setattr(owner, name, value)

def ease(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)

def pulse(t, begin, peak, end):
    if t <= begin or t >= end:
        return 0
    return ease((t-begin)/(peak-begin) if t <= peak else (end-t)/(end-peak))

def read_glb(path):
    data = Path(path).read_bytes()
    length, kind = struct.unpack_from('<II', data, 12)
    assert data[:4] == b'glTF' and kind == 0x4e4f534a
    return json.loads(data[20:20+length]), data[28+length:]

def accessor_bytes(doc, payload, index):
    acc = doc['accessors'][index]
    assert 'sparse' not in acc
    view = doc['bufferViews'][acc['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[acc['type']]
    size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[acc['componentType']] * width
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = view.get('byteStride', size)
    return b''.join(payload[start+i*stride:start+i*stride+size] for i in range(acc['count']))

def author():
    assert Path(bpy.data.filepath).resolve() == SOURCE.resolve()
    assert not any(p.exists() for p in (EDITABLE, TRIAL, OUTPUT)), 'Version exists; use a new version.'
    preserved = {str(p.relative_to(ROOT)): sha(p) for p in (SOURCE, BASELINE)}
    original = json.loads((ROOT / 'design/buddy/sprout/sprout-soft-original-v008.manifest.json').read_text())
    assert sha(SOURCE) == original['editable_source_sha256']
    assert sha(BASELINE) == original['sha256']
    scene = bpy.data.scenes['INSIGHTOS_Sprout_v008_soft_original']
    bpy.context.window.scene = scene
    scene.name = 'SPROUT_Walk_Experiment_v001'
    rig = scene.objects['RIG_Sprout']
    body, core = [scene.objects[n] for n in ('SPROUT_BODY', 'SPROUT_CORE')]
    keys = [ob.data.shape_keys for ob in (body, core)]
    owners = [rig, *keys]
    assert scene.render.fps == FPS and len(rig.pose.bones) == 9
    inv_local = {b.name: b.bone.matrix_local.to_3x3().inverted() for b in rig.pose.bones}
    # Source forward is -Y, exported forward is +Z. Foot local axes differ
    # from the torso's; converting vectors avoids an accidental sideways step.
    def displace(bone, xyz):
        bone.location = inv_local[bone.name] @ Vector(xyz)

    samples = {}
    for clip, frames in CLIPS.items():
        for owner in owners:
            ad = owner.animation_data
            ad.action = None
            ad.use_nla = False
            for track in ad.nla_tracks:
                track.mute = True
        samples[clip] = []
        for frame in range(1, frames+2):
            t = (frame-1)/frames
            theta = 2*math.pi*t
            for bone in rig.pose.bones:
                bone.location = bone.rotation_euler = (0, 0, 0)
                bone.scale = (1, 1, 1)
            torso = rig.pose.bones['BODY']
            squash = sway_l = sway_r = 0
            if clip == 'Sprout_WalkLoop':
                # With root travelling STRIDE per cycle, the straight stance
                # segment cancels its velocity exactly; swing returns the foot.
                for side, offset in (('L', 0), ('R', .5)):
                    p = (t+offset) % 1
                    travel = STRIDE*STANCE
                    foot = rig.pose.bones['FOOT_'+side]
                    if p < STANCE:
                        forward = travel*(.5-p/STANCE)
                        lift = pitch = 0
                    else:
                        swing = (p-STANCE)/(1-STANCE)
                        forward = travel*(-.5+ease(swing))
                        lift = .115*math.sin(math.pi*swing)**2
                        pitch = .11*math.sin(2*math.pi*swing)
                    displace(foot, (0, -forward, lift))
                    foot.rotation_euler.x = pitch
                # Feet are ROOT siblings: torso bob/roll never lifts soles.
                displace(torso, (.018*math.sin(theta), 0, .018*math.sin(theta)**2))
                torso.rotation_euler = (.020, .025*math.sin(theta), .018*math.sin(theta))
                squash = .045+.045*math.cos(2*theta)
                sway_l = .025*max(0, math.sin(theta))
                sway_r = .025*max(0, -math.sin(theta))
                for side, sign in (('L', -1), ('R', 1)):
                    base = rig.pose.bones['BUD_'+side+'_BASE']
                    tip = rig.pose.bones['BUD_'+side+'_TIP']
                    base.rotation_euler = (.065*math.sin(theta-.4), 0, sign*.045+.05*math.sin(theta))
                    tip.rotation_euler = (-.05*math.sin(theta-.9), 0, -.04*math.sin(theta-.5))
            elif clip == 'Sprout_InspectTarget':
                look = pulse(t, .05, .4, .94)
                # A curious whole-body lean and asymmetrical attentive antennae.
                torso.rotation_euler.x = .09*look
                displace(torso, (0, -.035*look, -.016*look))
                rig.pose.bones['BUD_L_BASE'].rotation_euler.z = -.18*look
                rig.pose.bones['BUD_R_BASE'].rotation_euler.z = .11*look
                rig.pose.bones['BUD_L_TIP'].rotation_euler.x = .09*look
                squash = .10*look
            else:
                lean = pulse(t, .03, .35, .96)
                reach = pulse(t, .12, .50, .88)
                lift = .13*pulse(t, .12, .32, .50)+.065*pulse(t, .53, .67, .88)
                torso.rotation_euler.y = -.045*lean
                torso.rotation_euler.x = .035*lean
                displace(torso, (-.045*lean, 0, -.01*lean))
                displace(rig.pose.bones['FOOT_R'], (0, -.28*reach, lift))
                # The right foot makes contact at t=.5, then lifts to return.
                rig.pose.bones['BUD_R_BASE'].rotation_euler.z = .09*lean
                rig.pose.bones['BUD_L_BASE'].rotation_euler.z = -.045*lean
                squash = .08*lean
            for bone in rig.pose.bones:
                for prop in ('location', 'rotation_euler', 'scale'):
                    bone.keyframe_insert(data_path=prop, frame=frame, group=bone.name)
            for shape_keys in keys:
                for name, value in (('Jelly_Squash', squash), ('Jelly_Sway_L', sway_l), ('Jelly_Sway_R', sway_r)):
                    shape_keys.key_blocks[name].value = value
                for key in list(shape_keys.key_blocks)[1:]:
                    key.keyframe_insert(data_path='value', frame=frame)
            samples[clip].append({b.name: {'location': list(b.location), 'rotation': list(b.rotation_euler)} for b in rig.pose.bones})
        for owner in owners:
            ad = owner.animation_data
            action, slot = ad.action, ad.action_slot
            action.name = clip+'_'+('Rig' if owner == rig else owner.name)+'_experiment_v001'
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for fc in bag.fcurves:
                            for point in fc.keyframe_points:
                                set_enum(point, 'interpolation', 'LINEAR')
            track = ad.nla_tracks.new()
            track.name = clip
            strip = track.strips.new(clip, 1, action)
            strip.action_slot = slot
            set_enum(strip, 'blend_type', 'REPLACE')
            set_enum(strip, 'extrapolation', 'NOTHING')
            ad.action = None
            ad.use_nla = True
            for track in ad.nla_tracks:
                track.mute = track.name != 'Sprout_Idle'
    for clip in CLIPS:
        assert max(abs(a-b) for name in samples[clip][0] for field in ('location', 'rotation')
                   for a, b in zip(samples[clip][0][name][field], samples[clip][-1][name][field])) < 1e-6
    scene.frame_set(1)
    bpy.context.view_layer.update()
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in bpy.data.collections['SPROUT_MODEL'].objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.wm.save_as_mainfile(filepath=str(EDITABLE))
    bpy.ops.wm.open_mainfile(filepath=str(EDITABLE))
    if 'io_scene_gltf2' not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    import io_scene_gltf2
    settings = dict(original['settings'], filepath=str(TRIAL))
    assert all(k in bpy.ops.export_scene.gltf.get_rna_type().properties for k in settings)
    class EyeTrackDependencyRefresh:
        is_critical = True
        def post_animation_track_switch_hook(self, obj, track, name, kind, export_settings):
            if kind == 'KEY' and obj.name in ('EYE_L', 'EYE_R'):
                ad = obj.data.shape_keys.animation_data
                strip = ad.nla_tracks[track.idx].strips[0]
                ad.action, ad.action_slot, ad.use_nla = strip.action, strip.action_slot, False
                obj.data.shape_keys.update_tag()
                obj.data.update_tag()
                obj.update_tag(refresh={'OBJECT', 'DATA', 'TIME'})
                bpy.context.view_layer.update()
        def animation_track_switch_loop_hook(self, obj, restored, export_settings):
            if restored and obj.name in ('EYE_L', 'EYE_R'):
                obj.data.shape_keys.animation_data.action = None
                obj.data.shape_keys.animation_data.use_nla = True
    assert not hasattr(io_scene_gltf2, 'glTF2ExportUserExtension')
    io_scene_gltf2.glTF2ExportUserExtension = EyeTrackDependencyRefresh
    try:
        bpy.ops.export_scene.gltf(**settings)
    finally:
        del io_scene_gltf2.glTF2ExportUserExtension
    old, old_binary = read_glb(BASELINE)
    trial, trial_binary = read_glb(TRIAL)
    doc, binary = copy.deepcopy(old), bytearray(old_binary)
    node_names = {n['name']: i for i, n in enumerate(old['nodes'])}
    copied = {}
    def copy_accessor(index):
        if index in copied:
            return copied[index]
        payload = accessor_bytes(trial, trial_binary, index)
        acc = {k: v for k, v in trial['accessors'][index].items() if k not in ('bufferView', 'byteOffset')}
        for candidate, other in enumerate(doc['accessors']):
            if {k: v for k, v in other.items() if k not in ('bufferView', 'byteOffset')} == acc and accessor_bytes(doc, binary, candidate) == payload:
                copied[index] = candidate
                return candidate
        binary.extend(b'\0' * (-len(binary) % 4))
        view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)}
        binary.extend(payload)
        acc['bufferView'] = len(doc['bufferViews'])
        doc['bufferViews'].append(view)
        copied[index] = len(doc['accessors'])
        doc['accessors'].append(acc)
        return copied[index]
    for clip in CLIPS:
        animation = copy.deepcopy(next(a for a in trial['animations'] if a['name'] == clip))
        animation['channels'] = [c for c in animation['channels'] if trial['nodes'][c['target']['node']]['name'] != 'RIG_Sprout']
        used = sorted({c['sampler'] for c in animation['channels']})
        for channel in animation['channels']:
            channel['sampler'] = used.index(channel['sampler'])
            name = trial['nodes'][channel['target']['node']]['name']
            assert name not in ('REACTION_ROOT', 'EYE_L', 'EYE_R', 'GLINT_L', 'GLINT_R')
            channel['target']['node'] = node_names[name]
        animation['samplers'] = [animation['samplers'][i] for i in used]
        for sampler in animation['samplers']:
            sampler['input'] = copy_accessor(sampler['input'])
            sampler['output'] = copy_accessor(sampler['output'])
        doc['animations'].append(animation)
    binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    encoded += b' ' * (-len(encoded) % 4)
    data = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(binary))
    data += struct.pack('<II', len(encoded), 0x4e4f534a)+encoded
    data += struct.pack('<II', len(binary), 0x004e4942)+binary
    OUTPUT.write_bytes(data)
    for field in ('nodes', 'skins', 'meshes', 'materials', 'images', 'textures', 'samplers'):
        assert doc.get(field) == old.get(field), field
    assert binary[:len(old_binary)] == old_binary
    assert doc['animations'][:11] == old['animations'] and len(doc['animations']) == 14
    assert all(sha(ROOT/p) == digest for p, digest in preserved.items())
    manifest = {'version': 'sprout-walk-v001', 'experimental': True, 'asset': '/experiments/sprout-walk/sprout-walk-v001.glb',
        'sha256': sha(OUTPUT), 'bytes': len(data), 'blender': bpy.app.version_string,
        'editable_source': str(EDITABLE.relative_to(ROOT)), 'source_sha256': sha(EDITABLE),
        'source_export': str(TRIAL.relative_to(ROOT)), 'source_export_sha256': sha(TRIAL),
        'forward_axis': '+Z', 'up_axis': '+Y', 'fps': FPS,
        'clips': [{'name': n, 'duration_seconds': count/FPS, 'root_motion': False} for n, count in CLIPS.items()],
        'walk': {'stride_model_units': STRIDE, 'cycle_seconds': 1.25, 'foot_stance_fraction': STANCE,
            'foot_lift_model_units': .115, 'steps_per_cycle': 2,
            'phase_rule': 'Set clip time to (travelled distance / stride modulo 1) * cycle_seconds. Direction belongs to a separate parent transform.'},
        'tap_contact_seconds': .625,
        'preservation': {'baseline_files': preserved, 'original_11_clips_exact': True,
            'geometry_materials_rig_morphs_hierarchy_exact': True, 'original_binary_prefix_exact': True},
        'limitations': ['In-place walk with a fixed authored stride; no ground/obstacle IK.',
            'No root travel or turning clips; runtime controls travel, acceleration and facing.',
            'Blender renders and browser glass shading are separate verification surfaces.']}
    (PUBLIC / 'sprout-walk-v001.manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'asset': str(OUTPUT), 'source': str(EDITABLE), 'sha256': sha(OUTPUT), 'bytes': len(data), 'preserved': True}))

if __name__ == '__main__':
    author()
