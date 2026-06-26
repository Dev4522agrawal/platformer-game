import { Entity } from '../engine/Entity';
import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';
import { animationFramesFor } from '../engine/TileAnimator';
import type { Activatable } from './types';
import type { Player } from './Player';

/**
 * Switch skin tile ids (dictionary §4.18 / §4.19). LEVER is the neutral state of
 * the 3-state lever (64 left / 65 neutral / 66 right). BUTTON is the pressure
 * button (148 unpressed / 149 pressed). CHAIN is a Sector-2 placeholder.
 */
export const LEVER_TILE = 65;
export const BUTTON_TILE = 148;
export const CHAIN_TILE = 109; // placeholder; real industrial chain arrives in Sector 2

/** How long the player must hold the interact key, per skin string. */
export type InteractMode = 'oneshot' | 'toggle' | 'momentary';
/** What the switch does to its targets (all routed through registry.setActive). */
export type InteractEffect = 'openDoor' | 'movePlatform' | 'toggleState';

/** How close (in px) the player must be for the switch to be in range. */
const RANGE_PAD = TILE;

/**
 * Verb shown in the contextual interact prompt, per effect — so any interactable
 * surfaces the right action without hardcoding a specific switch.
 */
const PROMPT_VERB: Record<InteractEffect, string> = {
  openDoor: 'open door',
  movePlatform: 'activate platform',
  toggleState: 'flip switch',
};

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

  /**
   * Whether a contextual "press X" prompt should show now: the player is in
   * range AND the switch can still do something (a spent oneshot is silent).
   */
  wantsPrompt(player: Player): boolean {
    if (!this.inRange(player)) return false;
    if (this.mode === 'oneshot' && this.fired) return false; // already activated
    return true;
  }

  /** Human verb for the interact prompt (derived from the effect, not hardcoded). */
  get promptVerb(): string {
    return PROMPT_VERB[this.effect];
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
    // Skins with a dictionary animation pair (e.g. button 148 up / 149 pressed)
    // show their pressed frame while engaged or latched on; a pair-less skin
    // (e.g. the lever's 65) just draws itself.
    const frames = animationFramesFor(this.skin);
    const pressed = this.active || this.holdTimer > 0;
    const id = pressed && frames.length > 1 ? frames[1] : frames[0];
    this.source.draw(ctx, id, dx, dy);

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
