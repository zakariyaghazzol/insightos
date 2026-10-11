import { describe, expect, it } from 'vitest';
import { Locomotion, STRIDE_PX, type Point, type WalkEvent, type WalkPhase } from './locomotion';

const FRAME = 1 / 60;
const folder = { id: 'notes', label: 'Notes', x: 180, y: 140, lookHeading: 0.3 };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function advanceUntil(walk: Locomotion, phase: WalkPhase): WalkEvent[] {
  const events: WalkEvent[] = [];
  for (let frame = 0; frame < 6000 && walk.phase !== phase; frame++) {
    events.push(...walk.update(FRAME));
  }
  expect(walk.phase).toBe(phase);
  return events;
}

function advance(walk: Locomotion, seconds: number, reducedMotion = false): WalkEvent[] {
  const events: WalkEvent[] = [];
  for (let frame = 0; frame < Math.ceil(seconds / FRAME); frame++) {
    events.push(...walk.update(FRAME, reducedMotion));
  }
  return events;
}

describe('experimental Sprout locomotion', () => {
  it('opens exactly once, only at tap contact after arrival and inspection', () => {
    const walk = new Locomotion({ x: 20, y: 30 });
    walk.go(folder);
    const request = walk.request;

    expect(advanceUntil(walk, 'inspecting')).toEqual([]);
    expect(walk.position).toEqual({ x: folder.x, y: folder.y });
    expect(walk.speed).toBe(0);
    expect(advance(walk, 1.4)).toEqual([]);
    expect(walk.phase).toBe('inspecting');
    expect(advanceUntil(walk, 'tapping')).toEqual([]);
    expect(advance(walk, 0.6)).toEqual([]);
    expect(walk.phase).toBe('tapping');

    const events = advance(walk, 0.05);
    expect(events).toEqual([{ type: 'opened', id: folder.id, request }]);
    expect(walk.phase).toBe('tapping');
    expect(walk.phaseTime).toBeGreaterThanOrEqual(0.625);
    expect(advance(walk, 12)).toEqual([]);
    expect(walk.phase).toBe('idle');
  });

  it('canceling immediately before tap contact prevents opening', () => {
    const walk = new Locomotion({ x: 0, y: 0 });
    walk.go(folder);
    expect(advanceUntil(walk, 'tapping')).toEqual([]);
    expect(advance(walk, 0.6)).toEqual([]);
    const request = walk.request;
    const stoppedAt = { ...walk.position };

    walk.cancel();
    expect(walk.request).toBeGreaterThan(request);
    expect(advance(walk, 15)).toEqual([]);
    expect(walk.position).toEqual(stoppedAt);
    expect(walk.phase).toBe('idle');
    expect(walk.destination).toBeNull();
  });

  it('retargeting invalidates the pending tap and opens only the new folder', () => {
    const walk = new Locomotion({ x: 0, y: 0 });
    walk.go(folder);
    expect(advanceUntil(walk, 'tapping')).toEqual([]);
    expect(advance(walk, 0.6)).toEqual([]);
    const oldRequest = walk.request;

    walk.go({ id: 'photos', label: 'Photos', x: 45, y: 270 });
    const newRequest = walk.request;
    expect(newRequest).toBeGreaterThan(oldRequest);
    expect(advance(walk, 15)).toEqual([{ type: 'opened', id: 'photos', request: newRequest }]);
    expect(walk.phase).toBe('idle');
  });

  it('a resumed-tab delta cannot teleport or skip inspection and tap contact', () => {
    const walk = new Locomotion({ x: 0, y: 0 });
    walk.go({ ...folder, x: 350, y: 250 });
    expect(walk.update(3600)).toEqual([]);
    expect(walk.phase).toBe('turning');
    expect(walk.position).toEqual({ x: 0, y: 0 });
    expect(advanceUntil(walk, 'walking')).toEqual([]);

    const before = { ...walk.position };
    expect(walk.update(3600)).toEqual([]);
    expect(distance(before, walk.position)).toBeLessThanOrEqual(5);
    expect(walk.phase).toBe('walking');
    expect(advanceUntil(walk, 'inspecting')).toEqual([]);
    expect(walk.update(3600)).toEqual([]);
    expect(walk.phase).toBe('inspecting');
    expect(advanceUntil(walk, 'tapping')).toEqual([]);
    expect(walk.update(3600)).toEqual([]);
    expect(walk.phase).toBe('tapping');
  });

  it('reduced motion opens once without playing the walk or gesture sequence', () => {
    const walk = new Locomotion({ x: 20, y: 30 });
    walk.go(folder);
    const request = walk.request;
    const gait = walk.gait;

    expect(walk.update(FRAME, true)).toEqual([{ type: 'opened', id: folder.id, request }]);
    expect(walk.phase).toBe('idle');
    expect(walk.speed).toBe(0);
    expect(walk.gait).toBe(gait);
    const stationaryAt = { ...walk.position };
    expect(advance(walk, 10, true)).toEqual([]);
    expect(walk.position).toEqual(stationaryAt);
  });

  it.each([1 / 120, 1 / 30])('ties gait cycles to distance traveled at frame delta %s', (dt) => {
    const start = { x: 21, y: 38 };
    const walk = new Locomotion(start);
    walk.stridePixels = STRIDE_PX * 1.2;
    walk.go(folder);
    let traveled = 0;
    for (let frame = 0; frame < 6000 && walk.phase !== 'inspecting'; frame++) {
      const before = { ...walk.position };
      expect(walk.update(dt)).toEqual([]);
      traveled += distance(before, walk.position);
    }
    expect(walk.phase).toBe('inspecting');
    expect(traveled).toBeCloseTo(distance(start, folder), 5);
    // Arrival may snap the last sub-pixel remainder; the authored stride must
    // otherwise cover exactly the distance walked, independent of frame rate.
    expect(Math.abs(walk.gait * walk.stridePixels - traveled)).toBeLessThan(0.5);
    const gaitAtArrival = walk.gait;
    advance(walk, 5);
    expect(walk.gait).toBe(gaitAtArrival);
  });

  it.each([
    { x: 10, y: 15 },
    { x: 290, y: 15 },
    { x: 10, y: 270 },
    { x: 290, y: 270 },
  ])('never overshoots the path bounds toward $x, $y', (target) => {
    const start = { x: 130, y: 120 };
    const walk = new Locomotion(start);
    walk.go({ ...folder, ...target });
    for (let frame = 0; frame < 6000 && walk.phase !== 'inspecting'; frame++) {
      expect(walk.update(FRAME)).toEqual([]);
      expect(walk.position.x).toBeGreaterThanOrEqual(Math.min(start.x, target.x) - 1e-8);
      expect(walk.position.x).toBeLessThanOrEqual(Math.max(start.x, target.x) + 1e-8);
      expect(walk.position.y).toBeGreaterThanOrEqual(Math.min(start.y, target.y) - 1e-8);
      expect(walk.position.y).toBeLessThanOrEqual(Math.max(start.y, target.y) + 1e-8);
    }
    expect(walk.phase).toBe('inspecting');
    expect(walk.position).toEqual(target);
  });

  it('rejects nonfinite destinations and deltas without corrupting an active walk', () => {
    const walk = new Locomotion({ x: 0, y: 0 });
    walk.go(folder);
    const request = walk.request;
    for (const invalid of [NaN, Infinity, -Infinity]) {
      walk.go({ ...folder, x: invalid });
      walk.go({ ...folder, y: invalid });
      expect(walk.update(invalid)).toEqual([]);
    }
    expect(walk.update(0)).toEqual([]);
    expect(walk.update(-1)).toEqual([]);
    expect(walk.request).toBe(request);
    expect(walk.destination).toEqual(folder);
    expect(walk.position).toEqual({ x: 0, y: 0 });
    expect(advance(walk, 15)).toEqual([{ type: 'opened', id: folder.id, request }]);
  });

  it('turn-around cancels a pending action and rotates without clicking or translating', () => {
    const walk = new Locomotion({ x: 50, y: 50 });
    walk.go(folder);
    expect(advanceUntil(walk, 'tapping')).toEqual([]);
    const stoppedAt = { ...walk.position };
    walk.turnAround();
    expect(advance(walk, 3)).toEqual([]);
    expect(walk.phase).toBe('turning');
    expect(walk.position).toEqual(stoppedAt);
    expect(advance(walk, 10)).toEqual([]);
    expect(walk.phase).toBe('idle');
    expect(walk.position).toEqual(stoppedAt);
    expect(walk.destination).toBeNull();
  });
});
