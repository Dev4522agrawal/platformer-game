import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';
import type { Activatable } from './types';
import type { Player } from './Player';

/** Switch skin tile ids on the terrain packed sheet (confirm via the G atlas). */
export const LEVER_TILE = 109;
export const BUTTON_TILE = 151;
export const CHAIN_TILE = 109; // placeholder; real industrial chain arrives in Sector 2

/** How long the player must hold the interact key, per skin string. */
export type InteractMode = 'oneshot' | 'toggle' | 'momentary';
/** What the switch does to its targets (all routed through registry.setActive). */
export type InteractEffect = 'openDoor' | 'movePlatform' | 'toggleState';

/** How close (in px) the player must be for the switch to be in range. */
const RANGE_PAD = TILE;

/**
 * One class covers levers, buttons and chains. The behaviour is driven by
 * `mode` + `holdTime`; the result is always pushed to the targeted Activatables
 * via the shared registry whenever `active` changes.
 *
 *   momentary: active only while held in range (auto-releases).
 *   oneshot:   hold to completion once, then lock on.
 *   toggle:    hold to completion flips active; must release before flipping again.
 */
export class Interactable extends Entity {
  active = false;

  private holdTimer = 0;
  private fired = false;
  /** Toggle guard: a completed toggle requires a release before the next one. */
  private armed = true;

  private readonly source: TileSource;
  private readonly skin: number;
  private readonly mode: InteractMode;
  private readonly holdTime: number;
  private readonly targets: readonly string[];
  private readonly registry: Map<string, Activatable>;
  /** Informational; propagation is uniform regardless of effect. */
  readonly effect: InteractEffect;

  constructor(
    source: TileSource,
    skin: number,
    x: number,
    y: number,
    mode: InteractMode,
    holdTime: number,
    effect: InteractEffect,
    targets: readonly string[],
    registry: Map<string, Activatable>,
  ) {
    super();
    this.source = source;
    this.skin = skin;
    this.mode = mode;
    this.holdTime = holdTime;
    this.effect = effect;
    this.targets = targets;
    this.registry = registry;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.w = TILE;
    this.h = TILE;
  }

  /** Player AABB within ~1 tile AND grounded. */
  inRange(player: Player): boolean {
    if (!player.grounded) return false;
    return (
      player.x < this.x + this.w + RANGE_PAD &&
      player.x + player.w > this.x - RANGE_PAD &&
      player.y < this.y + this.h + RANGE_PAD &&
      player.y + player.h > this.y - RANGE_PAD
    );
  }

  /** `interactHeld` = Down/S currently held (grounded, so no fast-fall conflict). */
  update(dt: number, player: Player | null = null, interactHeld = false): void {
    this.beginStep();
    const engaged = player ? this.inRange(player) && interactHeld : false;
    const prevActive = this.active;

    if (this.mode === 'momentary') {
      this.active = engaged;
    } else if (this.mode === 'oneshot' && this.fired) {
      // locked on; ignore further input
    } else if (engaged) {
      this.holdTimer += dt;
      if (this.holdTimer >= this.holdTime) {
        if (this.mode === 'oneshot') {
          this.active = true;
          this.fired = true;
        } else if (this.armed) {
          // toggle: flip once per hold; re-arm only after a release
          this.active = !this.active;
          this.armed = false;
        }
        this.holdTimer = 0;
      }
    } else {
      // Out of range or released before completion.
      this.holdTimer = 0;
      this.armed = true;
    }

    if (this.active !== prevActive) this.propagate();
  }

  /** On player respawn: clear state and force targets off. */
  resetOnCheckpoint(): void {
    this.active = false;
    this.holdTimer = 0;
    this.fired = false;
    this.armed = true;
    this.propagate();
  }

  private propagate(): void {
    for (const id of this.targets) {
      this.registry.get(id)?.setActive(this.active);
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    const { x, y } = this.drawPos(alpha);
    const dx = Math.round(x - camX);
    const dy = Math.round(y - camY);
    this.source.draw(ctx, this.skin, dx, dy);

    // "Light on" pixel when active.
    if (this.active) {
      ctx.fillStyle = 'rgba(130,255,150,0.95)';
      ctx.fillRect(dx + TILE - 5, dy + 3, 2, 2);
    }

    // Hold progress bar above the switch.
    if (this.holdTimer > 0 && this.holdTime > 0) {
      const p = Math.min(1, this.holdTimer / this.holdTime);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(dx, dy - 5, TILE, 3);
      ctx.fillStyle = '#9effa0';
      ctx.fillRect(dx, dy - 5, Math.round(TILE * p), 3);
    }
  }
}
