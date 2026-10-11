# Experimental Sprout locomotion source

This is a separate version of Soft Original v008. The approved Blender source,
production assets, panel, and voice/controller files are untouched.

`sprout-walk-v001.blend` is editable in Blender 5.2.2 LTS. Runtime:
`public/experiments/sprout-walk/sprout-walk-v001.glb`.

## Animation contract

| Clip                   | Duration | Purpose                                                                               |
| ---------------------- | -------- | ------------------------------------------------------------------------------------- |
| `Sprout_WalkLoop`      | 1.25 s   | Two alternating stubby steps, 55% stance, small body sway and delayed antenna motion. |
| `Sprout_InspectTarget` | 1.5 s    | Curious lean toward a target, then neutral.                                           |
| `Sprout_TapTarget`     | 1.25 s   | Weight shifts left; right foot reaches and taps at 0.625 s, then returns.             |

The nine-bone rig, geometry, materials, facial shapes, hierarchy and all eleven
existing runtime clips are exact copies of v008. The new actions key the rig and
paired shell/core morphs. They do not key the eye controller or reaction root.

The walk is in place. Forward is **+Z**, up is **+Y**, and one complete cycle
represents **0.82 model units** of travel. Drive animation phase from distance:

```text
time = (travelled_model_units / 0.82 modulo 1) * 1.25 seconds
```

At unmodified speed this means 0.656 model units per second. Scale both travel
distance and stride together when converting to pixels. The full animated model
is approximately 2.33 units tall. Do not run a fixed-speed foot loop underneath
independently accelerating travel: that causes visible sliding.

Use a separate parent for travel and yaw. The authored root does not translate or
rotate. Feet stay fixed in height during stance, translate backward linearly to
cancel forward travel, then lift by up to 0.115 units and return smoothly. The
stance contract applies to the foot bones; existing blended skin weights and the
rounded soles make this a stylized gait, not an IK-ground-constrained locomotion
system. There are no obstacle-avoidance, turning, stair or terrain clips.

`InspectTarget` and `TapTarget` start/end neutral and can crossfade into idle.
The walk has a seamless cycle, but it begins mid-step rather than at a neutral
stance; blend the walk weight during acceleration/deceleration.

## Reproduction and verification

From the checkout root, use a background Blender process. The author script
refuses to overwrite an existing version; use a clean checkout/output version to
regenerate. It never opens or saves the user's live Blender scene.

```powershell
& 'D:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup design/buddy/sprout/source/sprout-soft-original-v008.blend --python-exit-code 1 --python experiments/sprout-walk/asset-source/author_walk.py
node experiments/sprout-walk/asset-source/verify_asset.mjs
& 'D:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup experiments/sprout-walk/asset-source/sprout-walk-v001.blend --python-exit-code 1 --python experiments/sprout-walk/asset-source/render_proofs.py
```

`author_walk.py` authors normal Blender actions, saves/reopens the source and
exports glTF through Blender. It then appends only the new animation/accessor
streams to the frozen v008 runtime container. This retains all old binary bytes,
including geometry, materials and the previously verified eye clips.

`verify_asset.mjs` independently compares the new runtime channels against the
actual Blender export and verifies exact preservation of v008. Khronos validator:
**zero errors, two warnings inherited unchanged from v008** for non-root skinned
meshes. The experimental renderer must transform the complete loaded scene,
including skeleton; do not move only the skinned mesh object.

`render_proofs.py` reopens the saved source, checks 99 sampled poses, stationary
root and paired shell/core morphs, then renders eight real Cycles frames from the
front, sides and back plus inspect/tap poses. The `proof-*.png` images are actual
source renders with transparent backgrounds. Browser glass lighting needs its
own verification; these images do not demonstrate desktop/native integration.
