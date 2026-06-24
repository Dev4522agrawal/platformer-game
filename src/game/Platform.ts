import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';
import type { Activatable, Solid } from './types';

/** The three platform behaviours spawned from a level's "entities" array. */
export type PlatformKind = 'moving' | 'falling' | 'cloud';

/**
 * A left/center/right tile strip plus a surface inset. The platform draws `left`
 * at its first column, `right` at its last, `center` in between (a 1-wide strip
 * just draws `left`). `surfaceInset` is how far the art's VISIBLE top surface
 * sits below the tile top in px — the collision box is pushed down by it so the
 * player's feet land on the drawn surface instead of floating above it.
 */
export interface PlatformArt {
  left: number;
  center: number;
  right: number;
  surfaceInset: number;
}

/**
 * Platform skins. Ids are read off the G atlas: 153-155 is the 3-wide cloud/dish
 * whose surface is ~6px down from the tile top; 48-50 is a solid wood-plank strip
 * flush with the tile top. Keep these tables trivially editable per sector.
 */
export const CLOUD_ART: PlatformArt = { left: 153, center: 154, right: 155, surfaceInset: 6 };
export const MOVING_ART: PlatformArt = { left: 48, center: 49, right: 50, surfaceInset: 0 };
export const FALLING_ART: PlatformArt = { left: 48, center: 49, right: 50, surfaceInset: 0 };

/** Gravity applied to a falling platform once it lets go (px/s^2). */
const FALL_GRAVITY = 900;
/** Warning time after a falling platform is triggered, before it drops (s). */
const FALL_TRIGGER_TIME = 0.5;
/** Render-only shake amplitude (px) during the warning phase. */
const FALL_JITTER = 1;

/**
 * A solid AABB the player can stand on and ride. The authored (x, y) is the
 * tile-aligned RENDER top-left; the collision box is shifted down by the art's
 * `surfaceInset` (and shortened to match) so landing/one-way checks use the
 * visible surface. One tile tall before inset, `wPx` wide, rendered as an
 * L/C/R strip. Subclasses drive motion and decide when it counts as solid.
 * `deltaX/deltaY` expose this step's movement, which the Player carries along.
 */
export abstract class Platform extends Entity implements Solid {
  abstract readonly kind: PlatformKind;

  protected readonly source: TileSource;
  protected readonly art: PlatformArt;

  constructor(source: TileSource, art: PlatformArt, x: number, y: number, wPx: number) {
    super();
    this.source = source;
    this.art = art;
    // Collision box: render x unchanged, top pushed down to the visible surface.
    this.x = this.prevX = x;
    this.y = this.prevY = y + art.surfaceInset;
    this.w = wPx;
    this.h = TILE - art.surfaceInset;
  }

  /** Movement applied this step (set once update() snapshots prev via beginStep). */
  get deltaX(): number {
    return this.x - this.prevX;
  }
  get deltaY(): number {
    return this.y - this.prevY;
  }

  /** Whether the player should collide with this platform right now. */
  abstract isSolid(): boolean;

  /** One-way (cloud) floors override this to true; all others stay solid both ways. */
  get oneWay(): boolean {
    return false;
  }

  /** Called once when the player lands on top. Default no-op. */
  onLanded(): void {
    /* no-op by default */
  }

  /** Restore the authored start state (the Game calls this on player respawn). */
  reset(): void {
    /* no-op by default */
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    const { x, y } = this.drawPos(alpha);
    // Undo the collision inset to get back to the tile-aligned render top.
    this.drawStrip(ctx, x, y - this.art.surfaceInset, camX, camY);
  }

  /** Draw the L/C/R skin strip across the platform width at world (x, y). */
  protected drawStrip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    camX: number,
    camY: number,
  ): void {
    const n = Math.max(1, Math.round(this.w / TILE));
    for (let i = 0; i < n; i++) {
      const id = n === 1 || i === 0 ? this.art.left : i === n - 1 ? this.art.right : this.art.center;
      this.source.draw(ctx, id, Math.round(x + i * TILE - camX), Math.round(y - camY));
    }
  }
}

/**
 * Moves between two authored points A and B at a constant speed. Free platforms
 * ping-pong (reverse on arrival); switch-controlled ones instead head to A or B
 * as commanded via Activatable.setActive and stop on arrival. Always solid;
 * vertical motion is carried to a rider too.
 */
export class MovingPlatform extends Platform implements Activatable {
  readonly kind = 'moving' as const;

  // Endpoints in COLLISION space (authored y + surfaceInset).
  private readonly ax: number;
  private readonly ay: number;
  private readonly bx: number;
  private readonly by: number;
  private readonly speed: number;
  /** Whether this platform is driven by a switch rather than ping-ponging. */
  readonly controlled: boolean;
  readonly id: string;
  /** Current destination: true = B, false = A. */
  private targetB: boolean;

  constructor(
    source: TileSource,
    art: PlatformArt,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    wPx: number,
    speed: number,
    controlled = false,
    id = '',
  ) {
    super(source, art, ax, ay, wPx);
    this.ax = ax;
    this.ay = ay + art.surfaceInset;
    this.bx = bx;
    this.by = by + art.surfaceInset;
    this.speed = speed;
    this.controlled = controlled;
    this.id = id;
    // Free platforms head to B immediately; controlled ones rest at A until told.
    this.targetB = !controlled;
  }

  isSolid(): boolean {
    return true;
  }

  /** Switch command: drive toward B when on, back toward A when off. */
  setActive(on: boolean): void {
    this.targetB = on;
  }

  update(dt: number): void {
    this.beginStep();
    const tx = this.targetB ? this.bx : this.ax;
    const ty = this.targetB ? this.by : this.ay;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step || dist === 0) {
      this.x = tx;
      this.y = ty;
      // Free platforms reverse on arrival; controlled ones wait for the switch.
      if (!this.controlled) this.targetB = !this.targetB;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  reset(): void {
    this.x = this.prevX = this.ax;
    this.y = this.prevY = this.ay;
    this.targetB = !this.controlled;
  }
}

type FallState = 'idle' | 'triggered' | 'falling' | 'gone';

/**
 * Holds position until stood on, briefly warns (jitter), then drops under
 * gravity and is removed once it leaves the map. Solid only while idle/triggered.
 */
export class FallingPlatform extends Platform {
  readonly kind = 'falling' as const;

  private state: FallState = 'idle';
  private timer = 0;
  private fallVy = 0;
  // Origin in COLLISION space (post-inset), captured after super().
  private readonly originX: number;
  private readonly originY: number;
  /** World y past which the platform is considered gone (below the map). */
  private readonly fallLimit: number;

  constructor(
    source: TileSource,
    art: PlatformArt,
    x: number,
    y: number,
    wPx: number,
    fallLimit: number,
  ) {
    super(source, art, x, y, wPx);
    this.originX = this.x;
    this.originY = this.y;
    this.fallLimit = fallLimit;
  }

  isSolid(): boolean {
    return this.state === 'idle' || this.state === 'triggered';
  }

  /** Begin the warning countdown (once). The player triggers this by standing on it. */
  onLanded(): void {
    if (this.state === 'idle') {
      this.state = 'triggered';
      this.timer = FALL_TRIGGER_TIME;
    }
  }

  update(dt: number): void {
    this.beginStep();
    if (this.state === 'triggered') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'falling';
        this.fallVy = 0;
      }
    } else if (this.state === 'falling') {
      this.fallVy += FALL_GRAVITY * dt;
      this.y += this.fallVy * dt;
      if (this.y > this.fallLimit) this.state = 'gone';
    }
  }

  reset(): void {
    this.state = 'idle';
    this.timer = 0;
    this.fallVy = 0;
    this.x = this.prevX = this.originX;
    this.y = this.prevY = this.originY;
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    if (this.state === 'gone') return;
    let { x, y } = this.drawPos(alpha);
    y -= this.art.surfaceInset; // back to the tile-aligned render top
    if (this.state === 'triggered') {
      x += (Math.random() * 2 - 1) * FALL_JITTER;
      y += (Math.random() * 2 - 1) * FALL_JITTER;
    }
    this.drawStrip(ctx, x, y, camX, camY);
  }
}

/**
 * A static one-way platform: solid only as a floor from above. Pass-through from
 * below and while fast-falling is handled in the Player's platform pass via the
 * `kind === 'cloud'` rule, so this class only needs to sit still and stay solid.
 */
export class CloudPlatform extends Platform {
  readonly kind = 'cloud' as const;

  isSolid(): boolean {
    return true;
  }

  get oneWay(): boolean {
    return true;
  }

  update(_dt: number): void {
    this.beginStep();
  }
}
