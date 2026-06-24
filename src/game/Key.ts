import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';

/** Key tile id on the terrain packed sheet (confirm via the G atlas). */
export const KEY_TILE = 27;

const BOB_AMPLITUDE = 2; // px
const BOB_SPEED = 4; // rad/s

/**
 * A pickup that grants the player a single held key (used to open one locked
 * door). Like Collectible: bobs gently; the Game flags it collected on contact,
 * sets player.heldKey, removes it and spawns particles.
 */
export class Key extends Entity {
  collected = false;

  private readonly source: TileSource;
  private readonly tileId: number;
  private bobTimer = 0;

  constructor(source: TileSource, x: number, y: number, tileId: number = KEY_TILE) {
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
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    if (this.collected) return;
    const { x, y } = this.drawPos(alpha);
    const bob = Math.sin(this.bobTimer) * BOB_AMPLITUDE;
    const drawX = x + this.w / 2 - TILE / 2 - camX;
    const drawY = y + this.h / 2 - TILE / 2 + bob - camY;
    this.source.draw(ctx, this.tileId, drawX, drawY);
  }
}
