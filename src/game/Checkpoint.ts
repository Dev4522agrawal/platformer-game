import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';
import type { Player } from './Player';

/** Flag tile ids on the terrain packed sheet (confirm via the G atlas). */
export const CHECKPOINT_INACTIVE = 112;
export const CHECKPOINT_ACTIVE = 111;

/**
 * A respawn flag. Once the player touches it, it activates (swaps to the raised
 * flag) and moves the player's respawn point here. Idempotent after activation.
 */
export class Checkpoint extends Entity {
  active = false;

  private readonly source: TileSource;

  constructor(source: TileSource, x: number, y: number) {
    super();
    this.source = source;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.w = 16;
    this.h = 18;
  }

  update(_dt: number): void {
    this.beginStep();
  }

  /** Raise the flag and adopt this spot as the player's respawn point. */
  activate(player: Player): void {
    if (this.active) return;
    this.active = true;
    player.setRespawn(this.x, this.y);
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    const { x, y } = this.drawPos(alpha);
    const id = this.active ? CHECKPOINT_ACTIVE : CHECKPOINT_INACTIVE;
    // Bottom-align the 18px tile to the box; horizontally center it.
    const drawX = x + this.w / 2 - TILE / 2 - camX;
    const drawY = y + this.h - TILE - camY;
    this.source.draw(ctx, id, drawX, drawY);
  }
}
