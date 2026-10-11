export type Point = { x: number; y: number };
export type WalkPhase = 'idle' | 'turning' | 'walking' | 'inspecting' | 'tapping' | 'celebrating';
export type Destination = Point & { id: string; label: string; lookHeading?: number };
export type WalkEvent = { type: 'opened'; id: string; request: number };

export const STRIDE_PX = 46;
const MAX_SPEED = 100;
const ACCELERATION = 220;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** A visual rehearsal only. Arrival emits a local event; this owns no native input. */
export class Locomotion {
  position: Point;
  heading = 0;
  gait = 0;
  speed = 0;
  phase: WalkPhase = 'idle';
  phaseTime = 0;
  destination: Destination | null = null;
  request = 0;
  stridePixels = STRIDE_PX;
  private turnStart = 0;
  private turnDelta = 0;
  private turnDuration = 0;
  private opened = false;
  private inspectOnly = false;

  constructor(start: Point) {
    this.position = { ...start };
  }

  go(destination: Destination) {
    if (![destination.x, destination.y].every(Number.isFinite)) return;
    this.cancel();
    this.destination = { ...destination };
    const dx = destination.x - this.position.x;
    const dy = destination.y - this.position.y;
    this.turnStart = this.heading;
    this.turnDelta = wrap(Math.atan2(dx, dy) - this.heading);
    this.turnDuration = 0.25 + Math.abs(this.turnDelta) * 0.2;
    this.enter('turning');
  }

  turnAround() {
    this.cancel();
    this.inspectOnly = true;
    this.turnStart = this.heading;
    this.turnDelta = Math.PI * 2;
    this.turnDuration = 6;
    this.enter('turning');
  }

  cancel() {
    this.request++;
    this.speed = 0;
    this.destination = null;
    this.opened = false;
    this.inspectOnly = false;
    this.enter('idle');
  }

  reset(point: Point) {
    this.cancel();
    this.position = { ...point };
    this.heading = 0;
    this.gait = 0;
  }

  /** Hidden tabs do not teleport the character or complete an unseen action. */
  update(delta: number, reducedMotion = false): WalkEvent[] {
    if (!Number.isFinite(delta) || delta <= 0) return [];
    const dt = Math.min(delta, 0.05);
    const events: WalkEvent[] = [];
    this.phaseTime += dt;
    if (reducedMotion && this.phase !== 'idle') {
      if (this.destination) {
        this.position = { x: this.destination.x, y: this.destination.y };
        if (!this.opened)
          events.push({ type: 'opened', id: this.destination.id, request: this.request });
      }
      this.cancel();
      return events;
    }
    if (this.phase === 'turning') {
      const t = Math.min(1, this.phaseTime / this.turnDuration);
      this.heading = this.turnStart + this.turnDelta * smooth(t);
      if (t === 1) {
        this.heading = wrap(this.heading);
        this.enter(this.inspectOnly ? 'idle' : 'walking');
        this.inspectOnly = false;
      }
    } else if (this.phase === 'walking' && this.destination) {
      const dx = this.destination.x - this.position.x;
      const dy = this.destination.y - this.position.y;
      const remaining = Math.hypot(dx, dy);
      const desiredSpeed = Math.min(MAX_SPEED, Math.sqrt(2 * ACCELERATION * remaining));
      this.speed += Math.max(
        -ACCELERATION * dt,
        Math.min(ACCELERATION * dt, desiredSpeed - this.speed),
      );
      const distance = Math.min(remaining, this.speed * dt);
      if (remaining > 0) {
        this.position.x += (dx / remaining) * distance;
        this.position.y += (dy / remaining) * distance;
        this.gait += distance / this.stridePixels;
      }
      if (remaining < 0.5 || distance === remaining) {
        this.position = { x: this.destination.x, y: this.destination.y };
        this.speed = 0;
        this.enter('inspecting');
      }
    } else if (this.phase === 'inspecting') {
      const look = this.destination?.lookHeading;
      if (look !== undefined) this.heading += wrap(look - this.heading) * (1 - Math.exp(-7 * dt));
      if (this.phaseTime >= 1.5) this.enter('tapping');
    } else if (this.phase === 'tapping') {
      if (this.phaseTime >= 0.625 && !this.opened && this.destination) {
        this.opened = true;
        events.push({ type: 'opened', id: this.destination.id, request: this.request });
      }
      if (this.phaseTime >= 1.25) this.enter('celebrating');
    } else if (this.phase === 'celebrating') {
      this.heading += wrap(-this.heading) * (1 - Math.exp(-5 * dt));
      if (this.phaseTime >= 2.2) {
        this.destination = null;
        this.enter('idle');
      }
    }
    return events;
  }

  private enter(phase: WalkPhase) {
    this.phase = phase;
    this.phaseTime = 0;
  }
}
