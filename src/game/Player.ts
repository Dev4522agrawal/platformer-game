import { Entity } from '../engine/Entity';
import { resolveAABB } from '../engine/collision';
import { TILE } from '../core/constants';
import { SpriteAnimator } from '../engine/SpriteAnimator';
import type { Tilemap } from '../engine/Tilemap';
import type { TileSource } from '../engine/TileSource';
import type { Input } from '../core/Input';
import type { MovementConfig } from './movementConfig';
import type { Solid } from './types';

/**
 * Sheet tile id of the idle robot sprite drawn for the player. This is a
 * plausible guess — confirm the real id with the KeyH character atlas overlay
 * and adjust. Purely cosmetic; collision uses the box below, not the sprite.
 */
export const PLAYER_TILE = 0;

const PLAYER_W = 12;
const PLAYER_H = 16;

/** Downward speed above which a landing counts as a hard impact (camera shake). */
const LANDING_IMPACT_VY = 450;

const LEFT_KEYS = ['ArrowLeft', 'KeyA'] as const;
const RIGHT_KEYS = ['ArrowRight', 'KeyD'] as const;
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'] as const;
const DOWN_KEYS = ['ArrowDown', 'KeyS'] as const;

/**
 * The player character and the entire movement system. All feel lives in the
 * injected MovementConfig; this class only sequences the rules. The update body
 * follows the milestone's a..l order: inputs, horizontal accel/decel, jump
 * buffer, coyote, jump execution, variable-height + apex + fast-fall gravity,
 * timer decrement, collision resolution, then bookkeeping.
 */
export class Player extends Entity {
  // Public so the debug readout can verify coyote/buffer numerically.
  grounded = false;
  wasGrounded = false;
  coyoteTimer = 0;
  jumpBufferTimer = 0;

  private facing: 1 | -1 = 1;
  private prevJumpHeld = false;
  /** The solid stood on last frame; its motion is carried this frame (riding). */
  private groundPlatform: Solid | null = null;

  /** Holds a single key, used to open one locked door. Survives respawn. */
  heldKey = false;
  private isAscendingFromJump = false;
  /** Stays true only while the jump-hold is still boosting THIS jump's ascent. */
  private holdBoostActive = false;
  private apexHangTimer = 0;

  /** Colour base id; walk frames are [base, base+1]. Derived from PLAYER_TILE. */
  private readonly base = PLAYER_TILE;
  private readonly walkAnim = new SpriteAnimator(
    [
      { id: PLAYER_TILE, duration: 8 },
      { id: PLAYER_TILE + 1, duration: 8 },
    ],
    true,
  );
  /** Tile id chosen each update for rendering (walk frame or idle base). */
  private renderId = PLAYER_TILE;

  /**
   * One-shot: true only on the frame the player lands from a hard fall
   * (downward speed > LANDING_IMPACT_VY). The Game reads it to trigger a shake.
   */
  landingImpact = false;

  /** Current respawn point — starts at spawn, moved by checkpoints. */
  private respawnX: number;
  private respawnY: number;

  constructor(
    private readonly config: MovementConfig,
    spawnX: number,
    spawnY: number,
    private readonly sheet: TileSource,
    private readonly map: Tilemap,
    private readonly input: Input,
  ) {
    super();
    this.respawnX = spawnX;
    this.respawnY = spawnY;
    this.x = this.prevX = spawnX;
    this.y = this.prevY = spawnY;
    this.w = PLAYER_W;
    this.h = PLAYER_H;
  }

  /** Box center, in world px (for camera follow and contact tests). */
  get centerX(): number {
    return this.x + this.w / 2;
  }
  get centerY(): number {
    return this.y + this.h / 2;
  }

  /** Current collision box for overlap tests against pickups/checkpoints. */
  get aabb(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  /** Move the respawn point (checkpoints call this). */
  setRespawn(x: number, y: number): void {
    this.respawnX = x;
    this.respawnY = y;
  }

  update(dt: number, solids: readonly Solid[] = []): void {
    this.beginStep();
    const cfg = this.config;
    this.landingImpact = false; // one-shot, recomputed each step

    // Ride: carry the motion of the platform we stood on last frame, applied
    // before integration so the collision passes see the carried position. The
    // pre-ride position stays in prevX/prevY (beginStep ran first), so the cloud
    // one-way test below still reads the true start-of-frame bottom.
    if (this.groundPlatform && this.groundPlatform.isSolid()) {
      this.x += this.groundPlatform.deltaX;
      this.y += this.groundPlatform.deltaY;
    }
    this.groundPlatform = null;

    // (a) Inputs ---------------------------------------------------------
    const left = this.anyDown(LEFT_KEYS);
    const right = this.anyDown(RIGHT_KEYS);
    const inputDir = left && !right ? -1 : right && !left ? 1 : 0;

    const jumpHeld = this.anyDown(JUMP_KEYS);
    const jumpPressed = jumpHeld && !this.prevJumpHeld;
    const downHeld = this.anyDown(DOWN_KEYS);
    const fastFall = downHeld && !this.grounded;

    // (b) Horizontal accel / decel --------------------------------------
    this.integrateHorizontal(inputDir, dt);

    // (c) Jump buffer ----------------------------------------------------
    if (jumpPressed) this.jumpBufferTimer = cfg.jumpBufferFrames;

    // (d) Coyote: refreshed while grounded, counts down while airborne.
    if (this.grounded) this.coyoteTimer = cfg.coyoteFrames;

    // (e) Execute jump ---------------------------------------------------
    if ((this.grounded || this.coyoteTimer > 0) && this.jumpBufferTimer > 0) {
      this.vy = cfg.jumpVelocity;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.grounded = false;
      this.isAscendingFromJump = true;
      this.holdBoostActive = true; // latch the hold for variable height
      this.apexHangTimer = 0;
    }

    // (f) Variable jump height ------------------------------------------
    // Once released during this ascent, the boost stays off for the rest of it.
    if (this.isAscendingFromJump && this.vy < 0 && !jumpHeld) {
      this.holdBoostActive = false;
    }

    let gravity: number;
    if (this.isAscendingFromJump && this.vy < 0) {
      gravity = this.holdBoostActive ? cfg.gravityAscendHeld : cfg.gravityAscendReleased;
    } else {
      gravity = cfg.gravityFall;
    }

    // (g) Apex hang: soften gravity for a few frames near the top of the arc.
    if (Math.abs(this.vy) < cfg.apexHangThreshold && this.apexHangTimer < cfg.apexHangFrames) {
      gravity *= cfg.apexHangFactor;
      this.apexHangTimer++;
    } else if (Math.abs(this.vy) >= cfg.apexHangThreshold) {
      this.apexHangTimer = 0;
    }

    // (h) Fast fall overrides gravity + fall cap while Down held airborne.
    let fallCap = cfg.maxFallSpeed;
    if (fastFall) {
      gravity = cfg.gravityFall * cfg.fastFallMultiplier;
      fallCap = cfg.fastFallMaxSpeed;
    }

    // (i) Apply gravity, clamp fall speed.
    this.vy += gravity * dt;
    if (this.vy > fallCap) this.vy = fallCap;

    // (j) Decrement timers ----------------------------------------------
    if (this.coyoteTimer > 0) this.coyoteTimer--;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer--;

    // (k) Move + resolve collisions -------------------------------------
    const result = resolveAABB(
      { x: this.x, y: this.y, w: this.w, h: this.h },
      this.vx * dt,
      this.vy * dt,
      this.map,
    );
    this.x = result.x;
    this.y = result.y;

    if (result.onWallLeft || result.onWallRight) this.vx = 0;
    if (result.onCeiling) this.vy = 0;

    this.grounded = result.onGround;
    if (this.grounded) {
      // Hard landing from a fall this frame -> let the Game shake the camera.
      if (!this.wasGrounded && this.vy > LANDING_IMPACT_VY) this.landingImpact = true;
      this.vy = 0;
      // Landed (not rising): the jump arc is over.
      if (!this.isAscendingFromJump || this.vy >= 0) this.isAscendingFromJump = false;
      this.holdBoostActive = false;
      this.apexHangTimer = 0;
    }

    // (k2) Solid pass: additive resolve against platform/door AABBs, after the
    // tilemap resolve. May set grounded/groundPlatform; never clears tile-ground.
    this.resolveSolids(solids, downHeld);

    if (inputDir !== 0) this.facing = inputDir;

    // Walk animation: cycle frames only when actually running on the ground;
    // idle or airborne shows the single base frame.
    if (this.grounded && Math.abs(this.vx) > 5) {
      this.walkAnim.update();
      this.renderId = this.walkAnim.currentId();
    } else {
      this.walkAnim.reset();
      this.renderId = this.base;
    }

    // (l) Bookkeeping ----------------------------------------------------
    this.wasGrounded = this.grounded;
    this.prevJumpHeld = jumpHeld;
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    const { x, y } = this.drawPos(alpha);
    const size = TILE;
    // Center the 18x18 sprite on the 12-wide box, feet aligned to the box bottom.
    const drawX = x + this.w / 2 - size / 2 - camX;
    const drawY = y + this.h - size - camY;
    // Flip when facing right: the base sprite is drawn facing left, so a
    // right-ward run must mirror it (fixes the previous moonwalk).
    this.sheet.draw(ctx, this.renderId, drawX, drawY, this.facing > 0);
  }

  /** Reset to the current respawn point with cleared velocity, timers, flags. */
  respawn(): void {
    this.x = this.prevX = this.respawnX;
    this.y = this.prevY = this.respawnY;
    this.vx = 0;
    this.vy = 0;
    this.landingImpact = false;
    this.grounded = false;
    this.wasGrounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.isAscendingFromJump = false;
    this.holdBoostActive = false;
    this.apexHangTimer = 0;
    this.prevJumpHeld = false;
    this.groundPlatform = null;
    this.walkAnim.reset();
    this.renderId = this.base;
  }

  /**
   * Resolve the player box against each solid (platforms + closed doors), after
   * the tilemap pass. Full solids resolve on the lesser-penetration axis;
   * one-way solids (clouds) only catch a descending player whose feet were above
   * the top last frame (and never while fast-fall is held).
   */
  private resolveSolids(solids: readonly Solid[], downHeld: boolean): void {
    const prevBottom = this.prevY + this.h;
    for (const p of solids) {
      if (!p.isSolid()) continue;

      const overlapX = Math.min(this.x + this.w, p.x + p.w) - Math.max(this.x, p.x);
      const overlapY = Math.min(this.y + this.h, p.y + p.h) - Math.max(this.y, p.y);
      if (overlapX <= 0 || overlapY <= 0) continue;

      if (p.oneWay) {
        if (downHeld) continue; // drop through while holding Down
        if (this.vy < 0) continue; // rising -> pass through from below
        if (prevBottom > p.y) continue; // already below the top -> pass through
        this.y = p.y - this.h;
        this.vy = 0;
        this.grounded = true;
        this.groundPlatform = p;
        continue;
      }

      // Full solid: push out along the axis of least penetration.
      if (overlapX < overlapY) {
        if (this.x + this.w / 2 < p.x + p.w / 2) this.x = p.x - this.w;
        else this.x = p.x + p.w;
        this.vx = 0;
      } else if (this.y + this.h / 2 < p.y + p.h / 2) {
        // Landed on top.
        this.y = p.y - this.h;
        this.vy = 0;
        this.grounded = true;
        this.groundPlatform = p;
        p.onLanded?.();
      } else {
        // Hit the underside.
        this.y = p.y + p.h;
        this.vy = 0;
      }
    }
  }

  private anyDown(codes: readonly string[]): boolean {
    for (const code of codes) {
      if (this.input.isDown(code)) return true;
    }
    return false;
  }

  /**
   * Integrate vx for one step. Picks ground vs air rates, and within those
   * no-input vs same-direction vs opposite-direction. Reversing preserves
   * magnitude (no dead stop): the opposite-decel rate simply drives vx through
   * zero toward the new target.
   */
  private integrateHorizontal(inputDir: number, dt: number): void {
    const cfg = this.config;
    const accel = this.grounded ? cfg.groundAccel : cfg.airAccel;
    const decelNoInput = this.grounded ? cfg.groundDecelNoInput : cfg.airDecelNoInput;
    const decelOpposite = this.grounded ? cfg.groundDecelOpposite : cfg.airDecelOpposite;

    if (inputDir !== 0) {
      const target = inputDir * cfg.maxRunSpeed;
      const sameDir = this.vx === 0 || Math.sign(this.vx) === inputDir;
      const rate = sameDir ? accel : decelOpposite;
      this.vx += inputDir * rate * dt;
      // Don't overshoot the run cap when accelerating in the input direction.
      if (inputDir > 0 && this.vx > target) this.vx = target;
      if (inputDir < 0 && this.vx < target) this.vx = target;
    } else {
      const drop = decelNoInput * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
    }

    if (this.vx > cfg.maxRunSpeed) this.vx = cfg.maxRunSpeed;
    if (this.vx < -cfg.maxRunSpeed) this.vx = -cfg.maxRunSpeed;

    if (inputDir === 0 && Math.abs(this.vx) < cfg.minMoveThreshold) this.vx = 0;
  }
}
