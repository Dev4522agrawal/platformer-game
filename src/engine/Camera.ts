import { INTERNAL_W, INTERNAL_H } from '../core/constants';
import type { Entity } from './Entity';
import type { Tilemap } from './Tilemap';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Speed below which lookahead relaxes back to centered. */
const LOOKAHEAD_SPEED = 110;
/** How far ahead of the player the camera leads, in px. */
const LOOKAHEAD_DIST = 48;

/**
 * Smoothed follow camera with horizontal lookahead and screen shake.
 *
 * follow() lerps toward a centered target plus a velocity-driven lookahead that
 * ramps in/out gently. shake() injects a decaying sinusoidal offset returned by
 * renderOffset(), which the Game adds to the camera position for WORLD rendering
 * only (HUD/debug stay still).
 */
export class Camera {
  x = 0;
  y = 0;

  private lookahead = 0;
  private shakeTime = 0;
  private shakeDur = 0;
  private shakeMag = 0;
  shakeEnabled = true;

  /** Smoothly track `target`, leading slightly in the travel direction. */
  follow(target: Entity, map: Tilemap, _dt: number): void {
    const centerX = target.x + target.w / 2;
    const centerY = target.y + target.h / 2;

    const lookTarget = Math.abs(target.vx) > LOOKAHEAD_SPEED ? Math.sign(target.vx) * LOOKAHEAD_DIST : 0;
    this.lookahead += (lookTarget - this.lookahead) * 0.05;

    const targetX = centerX - INTERNAL_W / 2 + this.lookahead;
    const targetY = centerY - INTERNAL_H / 2;

    this.x += (targetX - this.x) * 0.15;
    this.y += (targetY - this.y) * 0.1;

    const maxX = Math.max(0, map.pixelWidth - INTERNAL_W);
    const maxY = Math.max(0, map.pixelHeight - INTERNAL_H);
    this.x = clamp(this.x, 0, maxX);
    this.y = clamp(this.y, 0, maxY);
  }

  /** Snap instantly to the target (used on (re)spawn so there's no glide-in). */
  snapTo(target: Entity, map: Tilemap): void {
    const maxX = Math.max(0, map.pixelWidth - INTERNAL_W);
    const maxY = Math.max(0, map.pixelHeight - INTERNAL_H);
    this.lookahead = 0;
    this.x = clamp(target.x + target.w / 2 - INTERNAL_W / 2, 0, maxX);
    this.y = clamp(target.y + target.h / 2 - INTERNAL_H / 2, 0, maxY);
  }

  /** Kick off a screen shake of `mag` px decaying over `durFrames` fixed steps. */
  shake(mag: number, durFrames: number): void {
    if (!this.shakeEnabled) return;
    this.shakeMag = mag;
    this.shakeDur = durFrames;
    this.shakeTime = durFrames;
  }

  /** Advance shake timers. */
  update(_dt: number): void {
    if (this.shakeTime > 0) this.shakeTime--;
  }

  /** Current world-render offset from shake; {0,0} when not shaking. */
  renderOffset(): { ox: number; oy: number } {
    if (this.shakeTime <= 0 || this.shakeDur <= 0) return { ox: 0, oy: 0 };
    const falloff = (this.shakeTime / this.shakeDur) * this.shakeMag;
    const phase = this.shakeTime * 1.7; // fast frequency
    return { ox: Math.sin(phase) * falloff, oy: Math.cos(phase * 1.3) * falloff };
  }
}
