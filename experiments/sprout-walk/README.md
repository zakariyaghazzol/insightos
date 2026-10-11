# Sprout walking playground

An isolated, browser-only locomotion experiment on `experiment/sprout-walk`.
Built from UI checkpoint `a4f9b65`; it is not part of the panel integration PR.

Choose a sample folder: Sprout turns, walks beside it, inspects, taps and celebrates.
The normal pointer stays visible. No filesystem, native pointer, microphone,
voice, backend or production-panel entry point is imported or invoked.
The folder contents are explicit fixtures. This does not open real folders.

## Run separately

From this checkout (install the existing lockfile dependencies with `npm ci` if
needed):

```powershell
node node_modules/vite/bin/vite.js --config experiments/sprout-walk/vite.config.ts
```

Open <http://127.0.0.1:5175/>. The existing application stays on 5173. The experiment
has its own Vite config and entry, without modifying package scripts or app routes.
On the author's machine it lives at `D:/hackathon2026/insightos-walk`; its ignored
`node_modules` junction reuses the installed dependencies of the original checkout.

Controls: choose any folder, take a four-stop tour, turn through 360 degrees, Stop
or Escape, Reset, and Reduce motion. Standard keyboard buttons are supported.
Reduced motion opens a sample directly without walking or celebrating. Resizing,
hiding the page or losing the WebGL context cancels pending travel. Recovered
rendering requires a fresh destination, so no delayed folder action fires.

## Files and ownership

- `main.ts`, `index.html`, `style.css`: standalone playground, sample data and local
  open receipts. Folder previews stay beside the character on wide layouts and
  move below the stage on narrow layouts.
- `locomotion.ts`: path/yaw/state timing, cancellation and distance-based gait.
  Only its tap-contact marker emits an open event, once per trip.
- `avatar.ts`: private Soft Original renderer, authored-clip sampling, material
  treatment and depth-correct eyes; independent of production's front-facing
  controller and strict clip validator.
- `asset-source/`: separate editable Blender source, repeatable author/export
  scripts, validation and real Cycles proofs. The original v008 files are intact.
- `public/experiments/sprout-walk/`: versioned experimental GLB and manifest.

Animation hierarchy: screen position → heading parent → complete rig/skeleton.
The in-place walk covers 0.82 model units per full cycle. The renderer reports
the equivalent pixel stride (41 pixels at a 180-pixel canvas); travel distance
drives gait, including acceleration and slowing down. Turning blends an in-place
step and carries its foot phase into walking. Existing joy is reused on arrival.

## Verification

```powershell
node node_modules/typescript/bin/tsc -p experiments/sprout-walk/tsconfig.json
node node_modules/vitest/vitest.mjs run --config experiments/sprout-walk/vitest.config.ts
node experiments/sprout-walk/asset-source/verify_asset.mjs
node node_modules/vite/bin/vite.js build --config experiments/sprout-walk/vite.config.ts
```

Build output goes to ignored `.local/sprout-walk-dist`, not the accepted app's
`dist`. The standalone Three.js bundle has a size advisory; it is not lazy loaded
because the entire playground is the 3D experience.

The 13 controller checks cover tap timing, cancellation, retargeting, delayed
frames, reduced motion, frame-rate/stride consistency, quadrants and invalid input.
GLB verification confirms all 11 existing clips and original binary geometry /
material / rig data are preserved. There are zero validation errors and two
inherited non-root-skinned-mesh warnings, unchanged from v008.

Browser rendering has been inspected from eight directions and sampled across
walk/inspect/tap/joy. Renderer tests exercised actual WebGL loss/restoration,
resize, reduced motion and double disposal. Full playground checks and their
screenshots are recorded in `VERIFICATION.md` and `artifacts/sprout-walk/`.

## Scope of the next integration

This proves a stylized walk on an empty stage. Rounded soles use existing skin
weights; there is no terrain IK, obstacle avoidance, dedicated turn-start/stop
asset, desktop overlay or native folder wiring yet. The sample-open receipt is
not evidence of native action success.

After the main UI/backend merge, bring this feature's reviewed commits onto that
integrated baseline. First add a non-focus-stealing, click-through Electron overlay
with DPI/multi-monitor mapping and user takeover. Keep the normal cursor visible.
Then adapt the existing verified target/action pipeline: resolve → choreograph →
revalidate target → execute existing action once → verify success → celebrate.
The real action must retain existing cancellation and authorization contracts.
Do not merge this experimental branch into the current panel PR merely to share it.
