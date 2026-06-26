import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';
import { animatedTileId } from '../engine/TileAnimator';

/** Gem tile id on the terrain packed sheet (confirm via the G atlas). */
export const GEM_TILE = 67;

const BOB_AMPLITUDE = 2; // px
const BOB_SPEED = 4; // rad/s

/**
 * A floating pickup. Visual-only for now: it bobs gently and, on contact with
 * the player, the Game flags it collected, removes it, and spawns particles.
 */
export class Collectible extends Entity {
  collected = false;

  private readonly tileId: number;
  private readonly source: TileSource;
  private bobTimer = 0;
  /** Monotonic seconds clock (fixed-step) driving the dictionary frame loop. */
  private animSeconds = 0;

  constructor(source: TileSource, x: number, y: number, tileId: number = GEM_TILE) {
    super();
    this.source = source;
    this.tileId = tileId;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.w = 14;
    this.h = 14;
  }

  update(dt: number): void {
    this.beginStep();
    this.bobTimer += dt * BOB_SPEED;
    this.animSeconds += dt;
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    if (this.collected) return;
    const { x, y } = this.drawPos(alpha);
    const bob = Math.sin(this.bobTimer) * BOB_AMPLITUDE;
    // Center the 18x18 tile on the 14x14 box, plus the bob offset. Paired tiles
    // (e.g. the coin 151/152) loop via the shared animator; a gem just passes through.
    const id = animatedTileId(this.tileId, this.animSeconds);
    const drawX = x + this.w / 2 - TILE / 2 - camX;
    const drawY = y + this.h / 2 - TILE / 2 + bob - camY;
    this.source.draw(ctx, id, drawX, drawY);
  }
}
