import './style.css';
import { createWalkingAvatar } from './avatar';
import { Locomotion, type Destination } from './locomotion';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const stage = $('#stage');
const traveler = $('#traveler');
const status = $('#status');
const arrival = $('#arrival');
const preview = $('#folder-preview');
const reduced = $<HTMLInputElement>('#reduced-motion');
const media = matchMedia('(prefers-reduced-motion: reduce)');
reduced.checked = media.matches;

const folders = [
  {
    id: 'projects',
    label: 'Projects',
    x: 0.16,
    y: 0.29,
    color: '#92dbe9',
    files: ['A new beginning.pdf', 'Little discoveries.txt', 'Weekend project.glb'],
  },
  {
    id: 'ideas',
    label: 'Ideas',
    x: 0.84,
    y: 0.29,
    color: '#b4aff0',
    files: ['What if….txt', 'A brighter tomorrow.pdf', 'Inspiration.png'],
  },
  {
    id: 'photos',
    label: 'Photos',
    x: 0.19,
    y: 0.7,
    color: '#efb6ae',
    files: ['Morning light.jpg', 'By the water.jpg', 'Small adventures.jpg'],
  },
  {
    id: 'archive',
    label: 'Keepsakes',
    x: 0.81,
    y: 0.7,
    color: '#95cfba',
    files: ['First steps.webm', 'A little note.txt', 'Good memories.jpg'],
  },
];
const buttons = new Map<string, HTMLButtonElement>();
const motion = new Locomotion({ x: 0, y: 0 });
const opened = new Set<string>();
let currentPreviewId: string | null = null;
let avatar: Awaited<ReturnType<typeof createWalkingAvatar>> | null = null;
let ready = false;
let disposed = false;
let raf = 0;
let previousTime = 0;
let previousStatus = '';
let tour: string[] = [];
let tourNextAt = 0;
let sceneTime = 0;

function folderSvg(id: string, color: string) {
  return `<svg viewBox="0 0 80 66" aria-hidden="true"><defs><linearGradient id="${id}-back" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".7"/></linearGradient><linearGradient id="${id}-front" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="${color}" stop-opacity=".8"/></linearGradient></defs><path d="M8 13Q8 7 14 7H30L37 14H66Q72 14 72 20V52Q72 58 66 58H14Q8 58 8 52Z" fill="url(#${id}-back)" stroke="#fff" stroke-opacity=".85"/><path d="M11 25Q10 21 15 21H69Q75 21 74 27L70 53Q69 58 63 58H15Q10 58 10 53Z" fill="url(#${id}-front)" stroke="#fff" stroke-opacity=".9"/><path d="M18 26H65" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}
for (const folder of folders) {
  const button = document.createElement('button');
  button.className = 'folder';
  button.type = 'button';
  button.disabled = true;
  button.dataset.folder = folder.id;
  button.setAttribute('aria-label', `Open ${folder.label} sample folder`);
  button.innerHTML = `${folderSvg(folder.id, folder.color)}<span class="folder-name">${folder.label}</span><span class="folder-check" aria-hidden="true">✓</span>`;
  button.addEventListener('click', () => {
    tour = [];
    begin(folder.id);
  });
  $('#folders').append(button);
  buttons.set(folder.id, button);
}

function announce(text: string) {
  if (text === previousStatus) return;
  previousStatus = text;
  status.textContent = text;
}
function home() {
  return { x: stage.clientWidth / 2, y: stage.clientHeight * 0.74 };
}
function target(id: string): Destination {
  const folder = folders.find((item) => item.id === id)!;
  const width = stage.clientWidth;
  const center = { x: width * folder.x, y: stage.clientHeight * folder.y };
  // Stand beside the icon so neither Sprout nor the actual cursor covers its label.
  const standRight = folder.x < 0.5;
  const gap = width < 500 ? 57 : 77;
  return {
    id,
    label: folder.label,
    x: Math.max(70, Math.min(width - 70, center.x + (standRight ? gap : -gap))),
    y: Math.min(stage.clientHeight - 47, center.y + 57),
    lookHeading: standRight ? -1.08 : 1.08,
  };
}
function clearHighlights() {
  for (const button of buttons.values()) button.classList.remove('is-target');
}
function begin(id: string) {
  if (!ready) return;
  preview.hidden = true;
  clearHighlights();
  buttons.get(id)?.classList.add('is-target');
  const destination = target(id);
  motion.go(destination);
  announce(`Turning toward ${destination.label}.`);
  arrival.style.display = 'block';
  arrival.style.left = `${destination.x}px`;
  arrival.style.top = `${destination.y}px`;
  $('#stop').removeAttribute('disabled');
}
function stop(message = 'Paused. Choose a folder when you’re ready.') {
  tour = [];
  motion.cancel();
  arrival.style.display = 'none';
  clearHighlights();
  $('#stop').setAttribute('disabled', '');
  announce(message);
}
function showFolder(id: string) {
  const folder = folders.find((item) => item.id === id);
  if (!folder) return;
  currentPreviewId = id;
  opened.add(id);
  buttons.get(id)?.classList.add('is-opened');
  $('#folder-title').textContent = folder.label;
  const list = $('#folder-files');
  list.replaceChildren(
    ...folder.files.map((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      return li;
    }),
  );
  preview.hidden = false;
  if (stage.clientWidth < 560) {
    stage.after(preview);
    preview.classList.add('outside-stage');
    preview.style.left = '';
  } else {
    stage.append(preview);
    preview.classList.remove('outside-stage');
    preview.style.left = folder.x < 0.5 ? `${stage.clientWidth - 334}px` : '24px';
  }
  announce(`${folder.label} is open. These are sample files.`);
  arrival.style.display = 'none';
}
function layout() {
  for (const folder of folders) {
    const button = buttons.get(folder.id)!;
    button.style.left = `${folder.x * 100}%`;
    button.style.top = `${folder.y * 100}%`;
  }
  // A resized stage invalidates its route. Do not finish a click at stale coordinates.
  tour = [];
  motion.reset(home());
  preview.hidden = true;
  clearHighlights();
  arrival.style.display = 'none';
  if (ready) announce('Choose a folder for a little field trip.');
  placeAvatar();
  avatar?.resize();
}
function placeAvatar() {
  traveler.style.transform = `translate3d(${motion.position.x - 76}px, ${motion.position.y - 160}px, 0)`;
  stage.dataset.phase = motion.phase;
  stage.dataset.heading = motion.heading.toFixed(3);
}

$('#tour').addEventListener('click', () => {
  tour = folders.map((folder) => folder.id);
  begin(tour.shift()!);
});
$('#turn').addEventListener('click', () => {
  if (!ready) return;
  stop();
  preview.hidden = true;
  motion.turnAround();
  $('#stop').removeAttribute('disabled');
  announce('A little look around.');
});
$('#stop').addEventListener('click', () => stop());
$('#reset').addEventListener('click', () => {
  stop('Ready for another adventure.');
  motion.reset(home());
  opened.clear();
  for (const button of buttons.values()) button.classList.remove('is-opened');
  preview.hidden = true;
});
$('#close-preview').addEventListener('click', () => {
  preview.hidden = true;
  const id = currentPreviewId;
  if (id) buttons.get(id)?.focus({ preventScroll: true });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    stop();
    preview.hidden = true;
  }
});
reduced.addEventListener('change', () => {
  if (reduced.checked) stop('Reduced motion on. Choose a folder to open it directly.');
});
const mediaChange = () => {
  reduced.checked = media.matches;
  if (media.matches) stop('Reduced motion on.');
};
media.addEventListener('change', mediaChange);
document.addEventListener('visibilitychange', () => {
  previousTime = 0;
  if (document.hidden) stop('Paused while you were away.');
});
const observer = new ResizeObserver(layout);
observer.observe(stage);
layout();

$('#avatar').addEventListener('sprout-renderer-state', (event) => {
  const state = (event as CustomEvent<string>).detail;
  if (disposed) return;
  ready = state === 'ready';
  if (!ready) stop('The 3D view paused. Waiting for it to recover.');
  else announce('Sprout is back. Choose a folder to continue.');
  stage.classList.toggle('has-error', !ready);
  for (const button of buttons.values()) button.disabled = !ready;
  for (const id of ['tour', 'turn', 'reset']) $<HTMLButtonElement>(`#${id}`).disabled = !ready;
});

function draw(time: number) {
  if (disposed) return;
  const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
  previousTime = time;
  sceneTime += dt;
  const oldPhase = motion.phase;
  const events = motion.update(dt, reduced.checked);
  placeAvatar();
  for (const event of events) showFolder(event.id);
  if (oldPhase !== motion.phase) {
    const label = motion.destination?.label;
    if (motion.phase === 'turning' && label) announce(`Turning toward ${label}.`);
    if (motion.phase === 'walking') announce(`On my way to ${label}.`);
    if (motion.phase === 'inspecting') announce(`Found ${label}. Taking a closer look.`);
    if (motion.phase === 'tapping') announce(`Opening ${label}…`);
    if (motion.phase === 'idle') {
      $('#stop').setAttribute('disabled', '');
      clearHighlights();
      if (tour.length) tourNextAt = sceneTime + 1.1;
    }
  }
  if (motion.phase === 'idle' && tour.length && sceneTime >= tourNextAt) begin(tour.shift()!);
  avatar?.render({
    heading: motion.heading,
    gait: motion.gait,
    speed: motion.speed,
    phase: motion.phase,
    phaseTime: motion.phaseTime,
    reducedMotion: reduced.checked,
    delta: dt,
  });
  raf = requestAnimationFrame(draw);
}

try {
  const loaded = await createWalkingAvatar($<HTMLCanvasElement>('#avatar'));
  if (disposed) loaded.dispose();
  else {
    avatar = loaded;
    const metrics = loaded.diagnostics() as { stridePixels?: number };
    if (metrics.stridePixels && metrics.stridePixels > 0)
      motion.stridePixels = metrics.stridePixels;
    ready = true;
    stage.setAttribute('aria-busy', 'false');
    for (const button of buttons.values()) button.disabled = false;
    for (const id of ['tour', 'turn', 'reset']) $<HTMLButtonElement>(`#${id}`).disabled = false;
    announce('Choose a folder for a little field trip.');
    raf = requestAnimationFrame(draw);
  }
} catch (error) {
  stage.classList.add('has-error');
  stage.setAttribute('aria-busy', 'false');
  announce('Sprout could not load. Reload this preview to try again.');
  console.error('Walking preview initialization failed:', error);
}

// Read-only evidence for this standalone playground; no app/voice/native bridge.
Object.defineProperty(window, '__sproutWalk', {
  configurable: true,
  value: {
    snapshot: () => ({
      ready,
      phase: motion.phase,
      heading: motion.heading,
      position: { ...motion.position },
      gait: motion.gait,
      speed: motion.speed,
      opened: [...opened],
      destination: motion.destination?.id ?? null,
      request: motion.request,
      reducedMotion: reduced.checked,
      renderer: avatar?.diagnostics(),
    }),
  },
});
function dispose() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(raf);
  observer.disconnect();
  media.removeEventListener('change', mediaChange);
  avatar?.dispose();
}
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
