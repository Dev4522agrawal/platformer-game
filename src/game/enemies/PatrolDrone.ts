import { Entity } from '../../engine/Entity';
import { TILE } from '../../core/constants';
import { SpriteAnimator } from '../../engine/SpriteAnimator';
import type { TileSource } from '../../engine/TileSource';
import type { Tilemap } from '../../engine/Tilemap';

/**
 * Walk-cycle frames for the patrol drone. The Base pack ships NO documented enemy
 * sprite (TILE_DICTIONARY / tileMeta cover terrain + objects only, and even the
 * player tile is a "plausible guess"), so this is a FLAGGED placeholder: the
 * red two-legged walker robot on the Characters sheet (loose ids 15/16, a clear
 * two-frame walk), distinct from the green player (id 0) and reading as hostile.
 * Swap these two ids if a real enemy sprite is added to the dictionary later.
 */
export const DRONE_WALK_A = 15;
export const DRONE_WALK_B = 16;

/** Drone hurtbox size (px). Narrower/shorter than the 18px sprite cell. */
const DRONE_W = 14;
const DRONE_H = 14;

/** Horizontal patrol speed (px/s). Well under the player run cap so it's outrun-able. */
export const PATROL_SPEED = 40;

/** Probe distance ahead of the leading edge used for the wall/ledge turn tests (px). */
const EDGE_PROBE = 1;

/** Fixed steps each walk frame is held (cycle at 60fps). */
const WALK_FRAME_STEPS = 10;

/**
 * Minimum downward speed (vy is +down) for a contact to count as a head-stomp.
 * Below this the player isn't really "coming down on" the drone, so it's a hit.
 */
export const STOMP_MIN_FALL_VY = 60;

/**
 * Upward velocity granted to the player on a successful stomp (vy is +down, so a
 * negative value launches up). A small hop — weaker than a full jump (-420).
 */
export const STOMP_BOUNCE_VY = -260;

/**
 * How far the player's feet may sink past the drone's top and still count as a
 * stomp (px). Past this the contact is treated as a side/below hit.
 */
export const STOMP_TOP_BAND = 8;

/**
 * A ground enemy that paces a flat stretch, reversing at a solid wall ahead or a
 * ledge (no ground ahead) so it never walks into terrain or off a pit. It carries
 * no vertical physics by design: the edge logic keeps its feet on the authored
 * surface, so it never needs to touch the collision core.
 *
 * Contact is resolved by the Game (the same damage seam spikes use): a downward
 * stomp kills it and bounces the player; any other contact deals one point of
 * damage. `kill()` flips it dead (the Game stops drawing/colliding it); `reset()`
 * restores its authored start state so a mid-fight death cleanly retries — it is
 * enumerated by the existing respawn-reset path, exactly like platforms/doors.
 */
export class PatrolDrone extends Entity {
  /** False once stomped; gates update/render and the Game's contact tests. */
  alive = true;

  private dir: 1 | -1;
  private readonly startX: number;
  private readonly startDir: 1 | -1;
  private readonly source: TileSource;
  private readonly map: Tilemap;
  private readonly walkAnim = new SpriteAnimator(
    [
      { id: DRONE_WALK_A, duration: WALK_FRAME_STEPS },
      { id: DRONE_WALK_B, duration: WALK_FRAME_STEPS },
    ],
    true,
  );

  /**
   * @param col     spawn column (tile); the hurtbox is centred in it
   * @param feetRow tile row whose TOP the drone's feet rest on (the ground surface)
   * @param dir     initial travel direction (+1 right / -1 left)
   */
  constructor(source: TileSource, map: Tilemap, col: number, feetRow: number, dir: 1 | -1) {
    super();
    this.source = source;
    this.map = map;
    this.dir = dir;
    this.startDir = dir;
    const x = col * TILE + (TILE - DRONE_W) / 2;
    const y = feetRow * TILE - DRONE_H;
    this.startX = x;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.w = DRONE_W;
    this.h = DRONE_H;
  }

  update(_dt: number): void {
    this.beginStep();
    if (!this.alive) return;
    this.walkAnim.update();

    // Probe one pixel beyond the leading edge: turn at a solid wall at body
    // height, or at a ledge where the tile under the next step isn't solid.
    const aheadX = this.dir > 0 ? this.x + this.w + EDGE_PROBE : this.x - EDGE_PROBE;
    const aheadCol = Math.floor(aheadX / TILE);
    const bodyRow = Math.floor((this.y + this.h / 2) / TILE);
    const footRow = Math.floor((this.y + this.h + EDGE_PROBE) / TILE);
    const wallAhead = this.map.isSolid(aheadCol, bodyRow);
    const groundAhead = this.map.isSolid(aheadCol, footRow);

    if (wallAhead || !groundAhead) {
      this.dir = (this.dir * -1) as 1 | -1;
    } else {
      this.x += this.dir * PATROL_SPEED * _dt;
    }
  }

  /** Stomped: go dead (the Game spawns the death burst + bounces the player). */
  kill(): void {
    this.alive = false;
  }

  /** Restore authored start position / direction / alive state for a clean retry. */
  reset(): void {
    this.alive = true;
    this.dir = this.startDir;
    this.x = this.prevX = this.startX;
    // y never changes (no vertical physics), so it needs no restore.
    this.walkAnim.reset();
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    if (!this.alive) return;
    const { x, y } = this.drawPos(alpha);
    // Centre the 18x18 sprite on the hurtbox, feet aligned to the box bottom.
    const drawX = x + this.w / 2 - TILE / 2 - camX;
    const drawY = y + this.h - TILE - camY;
    // Mirror when travelling right (matches the player's draw convention).
    this.source.draw(ctx, this.walkAnim.currentId(), drawX, drawY, this.dir > 0);
  }
}
