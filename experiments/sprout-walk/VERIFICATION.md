# Walking playground verification — October 11, 2026

Story: choose a sample folder → turn and walk → inspect → tap-contact receipt →
show its sample contents → celebrate. Scope is the isolated playground at
`http://127.0.0.1:5175/`, not Windows/Electron folder automation.

## Confirmed

| Boundary                      | Evidence                                                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and separate build | Experiment typecheck and Vite build passed. Outputs are in `.local/sprout-walk-dist`.                                                                                                                                                                                                   |
| Controller                    | 13 tests passed: exactly-once open after arrival/contact; cancellation before contact; retarget invalidation; large-delta clamp; reduced-motion path; consistent distance/gait at 30/120 fps; no overshoot in four quadrants; nonfinite destination rejection; full turn emits no open. |
| Asset                         | Independent validation passed; zero glTF errors; two warnings inherited from v008. Original 11 clips, geometry, materials, rig and original binary bytes unchanged. Three new clips match actual Blender export streams.                                                                |
| Blender                       | 99 sampled poses checked; real Cycles renders cover front, sides, back, inspection and tap.                                                                                                                                                                                             |
| Browser appearance            | Eight heading samples inspected; eyes properly disappear behind the body, no dark refracted eye copies. Quarter-cycle walk, inspect, tap, joy and idle sampled; jump fits canvas.                                                                                                       |
| Renderer lifecycle            | Actual Chromium WebGL loss/restore, resize, reduced motion, repeated disposal and render after disposal passed in the renderer audit.                                                                                                                                                   |
| Full playground               | In-app browser loaded live 3D. Projects trip opened the correct three sample files. Full tour completed with Projects, Ideas, Photos and Keepsakes all marked opened, final phase idle.                                                                                                 |
| Cancellation                  | Stop and Escape both returned to paused/idle without opening the pending folder.                                                                                                                                                                                                        |
| Keyboard / reduced motion     | Enter on Photos with Reduce motion checked opened its sample contents directly. Closing a reopened Projects preview returned focus to Projects after correcting Set-order focus handling.                                                                                               |
| Source isolation              | Original checkout remains clean at `a4f9b65` on `ui/presentation-polish`. Only experiment, versioned asset and proof paths are added in this worktree. No production imports, scripts, routes or backend/voice files were changed.                                                      |

## Proofs

- `artifacts/sprout-walk/playground-open.png`: actual in-app browser, Projects open
  with Sprout fully visible beside it.
- `artifacts/renderer-walk-angles.png`: eight real browser-rendered headings.
- `artifacts/renderer-walk-poses.png`: sampled actual authored animation poses.
- `experiments/sprout-walk/asset-source/proof-*.png`: actual Blender Cycles renders.

Browser diagnostics showed shader-compiler floating-point precision warnings
from the generated Three.js environment shader; no JavaScript errors were found.
The Vite build reports a >500 KB Three.js bundle advisory (about 170 KB gzipped).
These are retained observations, not silently suppressed warnings.

## Practical limits

- The real UI was inspected at the available in-app viewport (about 787 CSS px).
  A requested 390px browser viewport override did not apply; it was reset.
  The 320/390px layout has static review but not a verified device-size screenshot.
- This is a stylized, skinned-foot gait, not terrain IK. Travel has no obstacle
  avoidance. Starting/stopping/turning blend the current gait; no dedicated
  start/stop/turn clips are authored yet.
- Native cursor/desktop overlay, actual folder actions, multiple monitors and
  physical voice integration are outside this experiment. No real input is moved,
  hidden, intercepted or replayed. Native adoption needs the adapter and testing
  described in README.md after the main app integration.
