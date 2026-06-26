import { Entity } from '../../engine/Entity';
import { TILE } from '../../core/constants';
import { SpriteAnimator } from '../../engine/SpriteAnimator';
import { DAMAGE_SMALL, DAMAGE_FULL } from '../Player';
import { ENEMY_KILL_POINTS, BIG_ENEMY_KILL_POINTS } from '../score';
import type { TileSource } from '../../engine/TileSource';
import type { Tilemap } from '../../engine/Tilemap';

/**
 * Enemy sprite ids (Characters atlas). The Base pack ships NO documented enemy
 * sprite, so these are FLAGGED placeholders isolated as named constants for
 * one-line swaps when real enemy art lands:
 *   - small patrol drone: 15/16 walk, 17 defeated;
 *   - large patrol enemy: 18/19 walk, 20 defeated;
 *   - heavy (key-spawned) enemy: 21/22 walk, 23 defeated.
 * Each pair reads as a two-frame walk distinct from the green player (0-7).
 */
export const DRONE_WALK_A = 15;
export const DRONE_WALK_B = 16;
export const DRONE_DEFEATED = 17;
export const LARGE_WALK_A = 18;
export const LARGE_WALK_B = 19;
export const LARGE_DEFEATED = 20;
export const HEAVY_WALK_A = 21;
export const HEAVY_WALK_B = 22;
export const HEAVY_DEFEATED = 23;

/** Horizontal patrol speed (px/s). Well under the player run cap so it's outrun-able. */
export const PATROL_SPEED = 40;

/** Probe distance ahead of the leading edge used for the wall/ledge turn tests (px). */
const EDGE_PROBE = 1;

/** Fixed steps each walk frame is held (cycle at 60fps). */
const WALK_FRAME_STEPS = 10;

/** Seconds the defeated sprite lingers (squash + fade) before it stops drawing. */
export const DEFEAT_LINGER_SECONDS = 0.4;

/**
 * Minimum downward speed (vy is +down) for a contact to count as a head-stomp.
 * Below this the player isn't really "coming down on" the enemy, so it's a hit.
 */
export const STOMP_MIN_FALL_VY = 60;

/**
 * Upward velocity granted to the player on a successful stomp (vy is +down, so a
 * negative value launches up). A small hop — weaker than a full jump (-420).
 */
export const STOMP_BOUNCE_VY = -260;

/**
 * How far the player's feet may sink past the enemy's top and still count as a
 * stomp (px). Past this the contact is treated as a side/below hit.
 */
export const STOMP_TOP_BAND = 8;

/**
 * One enemy variant: its walk pair + defeated frame, its hurtbox size, the sprite
 * render scale (1 = a single 18px tile), the damage a side-hit deals (in hearts)
 * and the points a stomp awards. All three variants share the exact patrol /
 * stomp / edge-probe / defeat logic below — only these knobs differ.
 */
export interface EnemyKind {
  readonly walkA: number;
  readonly walkB: number;
  readonly defeated: number;
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  readonly contactDamage: number;
  readonly killPoints: number;
}

/** Small ground patrol drone (the original): half-heart side-hit, normal size. */
export const SMALL_DRONE: EnemyKind = {
  walkA: DRONE_WALK_A,
  walkB: DRONE_WALK_B,
  defeated: DRONE_DEFEATED,
  w: 14,
  h: 14,
  scale: 1,
  contactDamage: DAMAGE_SMALL,
  killPoints: ENEMY_KILL_POINTS,
};

/** Larger patrol enemy (S2/S3): bigger hurtbox/sprite, still a half-heart hit. */
export const LARGE_DRONE: EnemyKind = {
  walkA: LARGE_WALK_A,
  walkB: LARGE_WALK_B,
  defeated: LARGE_DEFEATED,
  w: 20,
  h: 20,
  scale: 1.35,
  contactDamage: DAMAGE_SMALL,
  killPoints: BIG_ENEMY_KILL_POINTS,
};

/** Heavy key-spawned enemy: largest hurtbox/sprite, full-heart side-hit. */
export const HEAVY_DRONE: EnemyKind = {
  walkA: HEAVY_WALK_A,
  walkB: HEAVY_WALK_B,
  defeated: HEAVY_DEFEATED,
  w: 24,
  h: 24,
  scale: 1.6,
  contactDamage: DAMAGE_FULL,
  killPoints: BIG_ENEMY_KILL_POINTS,
};

/** Level-data tag for an enemy variant; mapped to the EnemyKind on load. */
export type EnemyKindId = 'small' | 'large' | 'heavy';

/** Resolve a level-data tag to its EnemyKind config. */
export const ENEMY_KINDS: Record<EnemyKindId, EnemyKind> = {
  small: SMALL_DRONE,
  large: LARGE_DRONE,
  heavy: HEAVY_DRONE,
};

/**
 * A ground enemy that paces a flat stretch, reversing at a solid wall ahead or a
 * ledge (no ground ahead) so it never walks into terrain or off a pit. It carries
 * no vertical physics by design: the edge logic keeps its feet on the authored
 * surface, so it never needs to touch the collision core.
 *
 * Contact is resolved by the Game (the same damage seam spikes use): a downward
 * stomp kills it (bouncing the player + awarding kill points); any other contact
 * deals `kind.contactDamage`. `kill()` starts a brief DEFEATED-state linger
 * (squash + fade) before it stops drawing; `reset()` restores its authored start
 * state so a mid-fight death cleanly retries — it is enumerated by the existing
 * respawn-reset path, exactly like platforms/doors.
 */
export class PatrolDrone extends Entity {
  /** False once stomped; gates patrol/contact (the defeated linger still draws). */
  alive = true;

  /** Variant config (frames/size/damage/points); read by the Game on contact. */
  readonly kind: EnemyKind;

  private dir: 1 | -1;
  private deathTimer = 0;
  private readonly startX: number;
  private readonly startDir: 1 | -1;
  private readonly source: TileSource;
  private readonly map: Tilemap;
  private readonly walkAnim: SpriteAnimator;

  /**
   * @param col     spawn column (tile); the hurtbox is centred in it
   * @param feetRow tile row whose TOP the enemy's feet rest on (the ground surface)
   * @param dir     initial travel direction (+1 right / -1 left)
   * @param kind    variant config (defaults to the small patrol drone)
   */
  constructor(
    source: TileSource,
    map: Tilemap,
    col: number,
    feetRow: number,
    dir: 1 | -1,
    kind: EnemyKind = SMALL_DRONE,
  ) {
    super();
    this.source = source;
    this.map = map;
    this.dir = dir;
    this.startDir = dir;
    this.kind = kind;
    const x = col * TILE + (TILE - kind.w) / 2;
    const y = feetRow * TILE - kind.h;
    this.startX = x;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.w = kind.w;
    this.h = kind.h;
    this.walkAnim = new SpriteAnimator(
      [
        { id: kind.walkA, duration: WALK_FRAME_STEPS },
        { id: kind.walkB, duration: WALK_FRAME_STEPS },
      ],
      true,
    );
  }

  update(dt: number): void {
    this.beginStep();
    if (!this.alive) {
      // Tick down the defeated-state linger; no patrol once stomped.
      if (this.deathTimer > 0) this.deathTimer = Math.max(0, this.deathTimer - dt);
      return;
    }
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
      this.x += this.dir * PATROL_SPEED * dt;
    }
  }

  /** Stomped: go dead and start the defeated-state linger before it vanishes. */
  kill(): void {
    this.alive = false;
    this.deathTimer = DEFEAT_LINGER_SECONDS;
  }

  /** Restore authored start position / direction / alive state for a clean retry. */
  reset(): void {
    this.alive = true;
    this.deathTimer = 0;
    this.dir = this.startDir;
    this.x = this.prevX = this.startX;
    // y never changes (no vertical physics), so it needs no restore.
    this.walkAnim.reset();
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    if (this.alive) {
      this.drawSprite(ctx, this.walkAnim.currentId(), alpha, camX, camY, 1, 1);
      return;
    }
    if (this.deathTimer > 0) {
      // Defeated linger: squash toward the feet and fade out over the window.
      const p = 1 - this.deathTimer / DEFEAT_LINGER_SECONDS; // 0 -> 1
      this.drawSprite(ctx, this.kind.defeated, alpha, camX, camY, 1 - 0.5 * p, 1 - p);
    }
  }

  /**
   * Blit the variant sprite, feet-aligned to the hurtbox bottom and centred on it,
   * scaled by `kind.scale`. `squashY` (vertical scale, anchored at the feet) and
   * `alphaMul` drive the defeated squash/fade. The scale-1 path mirrors the
   * original crisp blit exactly; larger variants draw through a scaled transform.
   */
  private drawSprite(
    ctx: CanvasRenderingContext2D,
    id: number,
    alpha: number,
    camX: number,
    camY: number,
    squashY: number,
    alphaMul: number,
  ): void {
    const { x, y } = this.drawPos(alpha);
    const spriteSize = TILE * this.kind.scale;
    const drawX = x + this.w / 2 - spriteSize / 2 - camX;
    const drawY = y + this.h - spriteSize - camY;
    const flip = this.dir > 0;

    if (this.kind.scale === 1 && squashY === 1 && alphaMul === 1) {
      // Original tuned path: integer-rounded 18x18 blit (crisp pixel art).
      this.source.draw(ctx, id, drawX, drawY, flip);
      return;
    }

    ctx.save();
    ctx.globalAlpha = alphaMul;
    // Anchor the transform at the feet so the squash collapses downward.
    ctx.translate(Math.round(drawX), Math.round(drawY + spriteSize));
    ctx.scale(this.kind.scale, this.kind.scale * squashY);
    this.source.draw(ctx, id, 0, -TILE, flip);
    ctx.restore();
  }
}
