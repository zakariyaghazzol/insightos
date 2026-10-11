import {
  AnimationAction,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  NoBlending,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  Shape,
  ShapeGeometry,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type WalkAvatarFrame = {
  /** Sprout faces +Z at zero; +PI/2 turns right. Never clamp this to a front view. */
  heading: number;
  /** Unbounded completed stride count, measured from actual screen travel. */
  gait: number;
  speed: number;
  phase: 'idle' | 'turning' | 'walking' | 'inspecting' | 'tapping' | 'celebrating';
  phaseTime: number;
  reducedMotion: boolean;
  delta: number;
};

export const WALK_ASSET = '/experiments/sprout-walk/sprout-walk-v001.glb';
export const WALK_STRIDE_MODEL_UNITS = 0.82;
const VERTICAL_SPAN = 3.6;
const FOOT_PADDING_PX = 20;
const CLIPS = {
  idle: 'Sprout_Idle',
  turning: 'Sprout_WalkLoop',
  walking: 'Sprout_WalkLoop',
  inspecting: 'Sprout_InspectTarget',
  tapping: 'Sprout_TapTarget',
  celebrating: 'Sprout_JoyJump',
} as const;

type WalkingAvatar = {
  render(frame: WalkAvatarFrame): void;
  resize(): void;
  dispose(): void;
  diagnostics(): object;
};

/** A private copy of the shipped Soft Original reflection studio. No app controller. */
function createSoftEnvironment(renderer: WebGLRenderer) {
  const studio = new Scene();
  studio.background = new Color().setRGB(0.022, 0.031, 0.047);
  const cards = [
    { position: [-3.5, 3.8, 3], size: [1.55, 3.4], color: [1, 0.95, 0.9], intensity: 18 },
    { position: [3.2, 1.5, 2], size: [1.1, 3.2], color: [0.95, 1, 1], intensity: 18 },
    { position: [1.2, 3, -2], size: [2.8, 0.9], color: [0.84, 1, 0.95], intensity: 16 },
    { position: [-0.3, 2.4, 3.4], size: [4.3, 0.85], color: [0.95, 1, 1], intensity: 20 },
  ];
  for (const card of cards) {
    const shape = new Shape();
    if (card.position[2] > 0) {
      shape.moveTo(-0.12, -0.5);
      shape.bezierCurveTo(-0.4, -0.44, -0.5, -0.15, -0.32, 0.08);
      shape.bezierCurveTo(-0.12, 0.3, -0.1, 0.43, 0, 0.5);
      shape.bezierCurveTo(0.16, 0.56, 0.34, 0.43, 0.28, 0.29);
      shape.bezierCurveTo(0.22, 0.15, 0.36, -0.1, 0.4, -0.32);
      shape.bezierCurveTo(0.42, -0.46, 0.12, -0.55, -0.12, -0.5);
    } else {
      shape.moveTo(-0.5, -0.5);
      shape.lineTo(0.5, -0.5);
      shape.lineTo(0.5, 0.5);
      shape.lineTo(-0.5, 0.5);
      shape.closePath();
    }
    const geometry = new ShapeGeometry(shape, 16);
    geometry.scale(card.size[0], card.size[1], 1);
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: new Color()
          .setRGB(card.color[0], card.color[1], card.color[2])
          .multiplyScalar(card.intensity),
      }),
    );
    mesh.position.set(card.position[0], card.position[1], card.position[2]);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  }
  const generator = new PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, 0.025, 0.1, 100, { size: 128 });
  } finally {
    studio.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    generator.dispose();
  }
}

function applySoftMaterial(model: Group) {
  // This is the production v008 treatment. Model/rig geometry stays untouched.
  const materials = new Set<Material>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.frustumCulled = false;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (materials.has(material)) continue;
      materials.add(material);
      if (!(material instanceof MeshPhysicalMaterial) || material.transmission <= 0) continue;
      material.premultipliedAlpha = true;
      material.onBeforeCompile = (shader) => {
        shader.vertexShader =
          'varying float sproutExtremity;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             sproutExtremity = smoothstep(0.70, 0.92, abs(position.y));`,
          );
        shader.fragmentShader = 'varying float sproutExtremity;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <transmission_fragment>',
            `#include <transmission_fragment>
             #ifdef USE_TRANSMISSION
               float sproutEdge = smoothstep(0.16, 0.62, 1.0 - saturate(dot(normal, geometryViewDir)));
               float sproutUncovered = 1.0 - transmitted.a;
               material.transmissionAlpha = mix(material.transmissionAlpha, 1.0, saturate(sproutEdge + sproutUncovered + sproutExtremity));
             #endif`,
          )
          .replace(
            '#include <opaque_fragment>',
            `#ifdef USE_TRANSMISSION
               outgoingLight = mix(outgoingLight, diffuseColor.rgb * 0.16 + outgoingLight * 0.2, sproutUncovered * 0.8);
               outgoingLight = mix(outgoingLight, outgoingLight * 0.4 + vec3(0.01, 0.13, 0.23), sproutExtremity * 0.8);
               vec3 sproutRimPigment = mix(vec3(0.15, 0.21, 0.88), vec3(0.02, 0.20, 0.32), sproutExtremity);
               outgoingLight = mix(outgoingLight, sproutRimPigment, sproutEdge * 0.8);
             #endif
             #include <opaque_fragment>`,
          );
      };
      material.customProgramCacheKey = () => 'sprout-soft-shell-v008';
    }
  });
  // Keep eyes out of the opaque transmission capture to prevent dark refracted
  // duplicates. Depth still occludes the face when Sprout turns all the way around.
  const faceMaterials = new Map<Material, Material>();
  model.getObjectByName('FACE_ANCHOR')?.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const clone = (source: Material) => {
      let result = faceMaterials.get(source);
      if (!result) {
        result = source.clone();
        result.transparent = true;
        result.blending = NoBlending;
        result.forceSinglePass = true;
        faceMaterials.set(source, result);
      }
      return result;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(clone)
      : clone(object.material);
  });
  return materials;
}

function disposeModel(model: Group, originalMaterials: Set<Material>) {
  const materials = new Set(originalMaterials);
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap)
      texture.image.close();
  }
  for (const skeleton of skeletons) skeleton.dispose();
}

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const fractional = (value: number) => ((value % 1) + 1) % 1;

/**
 * Standalone visual consumer: the host owns travel, task state and the frame clock.
 * No input hooks, cursor changes, microphone, Electron bridge or production imports.
 * Callers disposing during await must dispose the returned instance when it resolves.
 */
export async function createWalkingAvatar(canvas: HTMLCanvasElement): Promise<WalkingAvatar> {
  const response = await fetch(WALK_ASSET);
  if (!response.ok) throw new Error(`Walking asset failed to load (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, '/experiments/sprout-walk/');
  const model = gltf.scene;
  const originalMaterials = applySoftMaterial(model);
  const missing = [...new Set(Object.values(CLIPS))].filter(
    (name) => !gltf.animations.some((clip) => clip.name === name),
  );
  if (missing.length) {
    disposeModel(model, originalMaterials);
    throw new Error(`Walking asset is missing authored clips: ${missing.join(', ')}.`);
  }
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch (error) {
    disposeModel(model, originalMaterials);
    throw error;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  let environment: ReturnType<typeof createSoftEnvironment>;
  try {
    environment = createSoftEnvironment(renderer);
  } catch (error) {
    disposeModel(model, originalMaterials);
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
  const scene = new Scene();
  scene.environment = environment.texture;
  scene.environmentIntensity = 1;
  const key = new DirectionalLight(0xf1faff, 1.7);
  key.position.set(-3.5, 3.8, 3);
  const rim = new DirectionalLight(0xa7ddd7, 0.7);
  rim.position.set(1.2, 3, -2);
  scene.add(key, rim, new HemisphereLight(0xe4f6f3, 0x131b24, 0.4));
  const yawMount = new Group();
  yawMount.name = 'EXPERIMENT_TRAVEL_YAW';
  yawMount.add(model);
  scene.add(yawMount);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const floorY = bounds.min.y;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  const mixer = new AnimationMixer(model);
  const actions = new Map<string, AnimationAction>();
  const weights = new Map<string, number>();
  for (const name of new Set(Object.values(CLIPS))) {
    const clip = gltf.animations.find((candidate) => candidate.name === name)!;
    const action = mixer.clipAction(clip).setEffectiveWeight(name === CLIPS.idle ? 1 : 0);
    action.play();
    action.paused = true;
    actions.set(name, action);
    weights.set(name, name === CLIPS.idle ? 1 : 0);
  }
  let disposed = false;
  let contextLost = false;
  let frames = 0;
  let elapsed = 0;
  let width = 152;
  let height = 180;
  let phase: WalkAvatarFrame['phase'] = 'idle';
  let phaseTime = 0;
  let heading = 0;
  let gait = 0;
  let playbackGait = 0;
  let gaitOffset = 0;
  let reducedMotion = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    canvas.dataset.rendererState = 'context-lost';
    canvas.dispatchEvent(new CustomEvent('sprout-renderer-state', { detail: 'context-lost' }));
  };
  const onRestored = () => {
    if (disposed) return;
    // Environment render-target pixels do not survive a lost GL context.
    environment.dispose();
    try {
      environment = createSoftEnvironment(renderer);
      scene.environment = environment.texture;
      contextLost = false;
      canvas.dataset.rendererState = 'ready';
      canvas.dispatchEvent(new CustomEvent('sprout-renderer-state', { detail: 'ready' }));
    } catch {
      contextLost = true;
      canvas.dataset.rendererState = 'context-lost';
    }
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function resize() {
    if (disposed || contextLost) return;
    width = Math.max(1, canvas.clientWidth || 152);
    height = Math.max(1, canvas.clientHeight || 180);
    renderer.setPixelRatio(Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
    renderer.setSize(width, height, false);
    const modelUnitsPerPixel = VERTICAL_SPAN / height;
    const centerY = floorY + VERTICAL_SPAN / 2 - FOOT_PADDING_PX * modelUnitsPerPixel;
    camera.left = (-VERTICAL_SPAN * width) / height / 2;
    camera.right = -camera.left;
    camera.top = VERTICAL_SPAN / 2;
    camera.bottom = -camera.top;
    camera.position.set(0, centerY, 6);
    camera.lookAt(0, centerY, 0);
    camera.updateProjectionMatrix();
  }

  function render(frame: WalkAvatarFrame) {
    if (disposed || contextLost) return;
    const delta = Math.min(0.1, Math.max(0, finite(frame.delta)));
    elapsed += delta;
    const previousPhase = phase;
    phase = frame.phase;
    phaseTime = Math.max(0, finite(frame.phaseTime));
    heading = finite(frame.heading, heading);
    gait = finite(frame.gait, gait);
    reducedMotion = frame.reducedMotion;
    // Keep the same foot phase across travel → turn → travel. A global turn clock
    // would abruptly exchange the planted and lifted feet at every corner.
    if (!reducedMotion && phase === 'turning') {
      if (previousPhase !== 'turning') playbackGait = gait + gaitOffset;
      playbackGait += delta * 0.6;
    } else if (!reducedMotion && phase === 'walking') {
      if (previousPhase === 'turning') gaitOffset = playbackGait - gait;
      playbackGait = gait + gaitOffset;
    }
    yawMount.rotation.set(0, heading, 0);
    const selected = frame.reducedMotion ? CLIPS.idle : CLIPS[phase];
    const blend = frame.reducedMotion ? 1 : 1 - Math.exp(-delta * 15);
    let totalWeight = 0;
    for (const [name] of actions) {
      const next =
        (weights.get(name) ?? 0) + ((name === selected ? 1 : 0) - (weights.get(name) ?? 0)) * blend;
      weights.set(name, next);
      totalWeight += next;
    }
    for (const [name, action] of actions) {
      const duration = action.getClip().duration;
      action.setEffectiveWeight((weights.get(name) ?? 0) / Math.max(0.0001, totalWeight));
      action.enabled = true;
      action.paused = true;
      if (frame.reducedMotion) action.time = 0;
      else if (name === CLIPS.walking) action.time = fractional(playbackGait) * duration;
      else if (name === CLIPS.idle) action.time = fractional(elapsed / duration) * duration;
      else if (name === selected)
        action.time = Math.min(phaseTime, Math.max(0, duration - 0.00001));
    }
    mixer.update(0);
    renderer.render(scene, camera);
    frames++;
  }

  resize();
  canvas.dataset.rendererState = 'ready';
  return {
    render,
    resize,
    diagnostics: () => ({
      asset: WALK_ASSET,
      state: disposed ? 'disposed' : contextLost ? 'context-lost' : 'ready',
      frames,
      phase,
      phaseTime,
      heading,
      gait,
      playbackGait,
      reducedMotion,
      profile: 'soft-original-v008',
      clips: gltf.animations.map((clip) => ({ name: clip.name, duration: clip.duration })),
      activeWeights: Object.fromEntries(weights),
      modelBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      modelPixelsPerUnit: height / VERTICAL_SPAN,
      stridePixels: (WALK_STRIDE_MODEL_UNITS * height) / VERTICAL_SPAN,
      footPoint: { x: width / 2, y: height - FOOT_PADDING_PX },
      cssSize: { width, height },
      bufferSize: { width: canvas.width, height: canvas.height },
      drawCalls: renderer.info.render.calls,
      faceQueue: 'post-transmission-depth-tested',
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      disposeModel(model, originalMaterials);
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.dataset.rendererState = 'disposed';
    },
  };
}
