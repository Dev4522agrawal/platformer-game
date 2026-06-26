import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';

/** Spike trap tile id on the terrain packed sheet (TILE_DICTIONARY §4.18). */
export const SPIKE_TILE = 68;

/**
 * Pixels the damage hurtbox is inset from each edge of the full tile. A spike's
 * trigger is smaller than its footprint so a glancing pass at the very edge of
 * the sprite doesn't feel cheap.
 */
export const SPIKE_HURTBOX_INSET = 3;

/**
 * A static spike trap. Per TILE_DICTIONARY §4.18/§6 spikes are NOT solid terrain:
 * they render sprite 68 sitting coplanar with the walking surface, and their
 * collision is purely a damage TRIGGER — an inset hurtbox the player overlaps.
 * They are never added to the occupancy mask, so the player runs onto/over the
 * footprint (and can jump clear) rather than being physically stopped or stood on.
 *
 * Damage is dealt by the Game calling Player.takeDamage(1, 'spike') on overlap;
 * i-frames are handled there, so no immunity logic is re-implemented here.
 */
export class Spike extends Entity {
  /** Top-left of the rendered tile in world px (the hurtbox is inset from this). */
  private readonly originX: number;
  private readonly originY: number;
  private readonly source: TileSource;

  constructor(source: TileSource, x: number, y: number) {
    super();
    this.source = source;
    this.originX = x;
    this.originY = y;
    // The collision box IS the inset damage trigger, not the full tile, so the
    // existing AABB overlap helper tests the trigger zone directly.
    this.x = this.prevX = x + SPIKE_HURTBOX_INSET;
    this.y = this.prevY = y + SPIKE_HURTBOX_INSET;
    this.w = TILE - SPIKE_HURTBOX_INSET * 2;
    this.h = TILE - SPIKE_HURTBOX_INSET * 2;
  }

  /** Static: nothing to integrate, just keep the interpolation buffer coherent. */
  update(_dt: number): void {
    this.beginStep();
  }

  render(ctx: CanvasRenderingContext2D, _alpha: number, camX: number, camY: number): void {
    this.source.draw(ctx, SPIKE_TILE, this.originX - camX, this.originY - camY);
  }
}
