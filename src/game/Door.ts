import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';
import { DOOR_TOP_TILE, DOOR_BOTTOM_PLAIN_TILE } from '../world/structures';
import type { Activatable, Solid } from './types';

/**
 * Closed-door BOTTOM tile (TILE_DICTIONARY §4.13). A rendered door is never a
 * slab: it is the 110 top over this bottom (see render()). Sourced from the door
 * macro's ids so there is one definition of the door recipe.
 */
export const DOOR_CLOSED_TILE = DOOR_BOTTOM_PLAIN_TILE;

export type DoorKind = 'locked' | 'timed' | 'permanent' | 'exit';

/** Default seconds a timed door stays open before re-closing. */
export const DEFAULT_TIMED_DURATION = 8;
/** Visual pulse rate for the exit door (rad/s). */
const EXIT_PULSE_SPEED = 4;

/**
 * A vertical door, `hTiles` tall. Acts as a closed solid until opened. How it
 * opens depends on `kind`:
 *   - permanent: setActive(on) sets open and it stays.
 *   - timed:     setActive(true) opens it and starts a close timer.
 *   - locked:    ignores setActive; opened only by a key (Game calls unlock()).
 *   - exit:      never solid; the Game fires a sector-complete trigger on touch.
 */
export class Door extends Entity implements Activatable, Solid {
  readonly oneWay = false;
  open = false;

  private closeTimer = 0;
  private pulse = 0;

  private readonly source: TileSource;
  private readonly closedTile: number;
  private readonly duration: number;

  constructor(
    source: TileSource,
    closedTile: number,
    public readonly id: string,
    public readonly kind: DoorKind,
    x: number,
    y: number,
    hTiles: number,
    duration: number = DEFAULT_TIMED_DURATION,
  ) {
    super();
    this.source = source;
    this.closedTile = closedTile;
    this.duration = duration;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.w = TILE;
    this.h = Math.max(1, hTiles) * TILE;
  }

  // Solid: static, so no riding motion.
  get deltaX(): number {
    return 0;
  }
  get deltaY(): number {
    return 0;
  }

  isSolid(): boolean {
    return !this.open && this.kind !== 'exit';
  }

  setActive(on: boolean): void {
    switch (this.kind) {
      case 'permanent':
        this.open = on;
        break;
      case 'timed':
        if (on) {
          this.open = true;
          this.closeTimer = this.duration;
        }
        break;
      case 'locked': // key only
      case 'exit': // trigger only
        break;
    }
  }

  /** Open a locked door with the player's key. Returns true if it consumed one. */
  unlock(): boolean {
    if (this.kind === 'locked' && !this.open) {
      this.open = true;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.beginStep();
    this.pulse += dt * EXIT_PULSE_SPEED;
    if (this.kind === 'timed' && this.open && this.closeTimer > 0) {
      this.closeTimer -= dt;
      if (this.closeTimer <= 0) this.open = false;
    }
  }

  /** Return to the test-room default (closed) for a deterministic respawn. */
  reset(): void {
    this.open = false;
    this.closeTimer = 0;
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    const { x, y } = this.drawPos(alpha);
    const dx = Math.round(x - camX);
    const dyTop = Math.round(y - camY);
    const rows = Math.round(this.h / TILE);

    if (this.kind === 'exit') {
      // Gentle pulse so the goal reads as interactive.
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.35 * (0.5 + 0.5 * Math.sin(this.pulse));
      this.drawClosed(ctx, dx, dyTop, rows);
      ctx.restore();
      return;
    }

    if (this.open) return; // open: render nothing
    this.drawClosed(ctx, dx, dyTop, rows);
  }

  /**
   * Draw a closed door per the dictionary (§4.13): a 110 top over the bottom
   * tile (150 plain / 130 windowed), never a stack of identical slabs. Any rows
   * beyond two repeat the bottom tile.
   */
  private drawClosed(ctx: CanvasRenderingContext2D, dx: number, dyTop: number, rows: number): void {
    for (let r = 0; r < rows; r++) {
      const id = r === 0 ? DOOR_TOP_TILE : this.closedTile;
      this.source.draw(ctx, id, dx, dyTop + r * TILE);
    }
  }
}
