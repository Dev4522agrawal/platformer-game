/**
 * Generic, data-driven tile animation.
 *
 * The dictionary (tileMeta.json `animationPairs`) marks which tile ids are frames
 * of the same looping motion (coin 151/152, flag 111/112, button 148/149, the
 * water/waterfall pairs, …). This module is the ONE place that knows how to turn
 * an authored frame id + a clock into the frame to draw *right now*. It is pure
 * render-time selection — no state, no gameplay effect — so any future paired
 * tile animates simply by being placed; no bespoke per-tile code is needed.
 *
 * Source of truth is the dictionary, imported the same way as src/data/tiles.ts.
 */
import tileMetaRaw from '../data/tileMeta.json';

/** Frames per second every paired tile loops at (shared by all animation pairs). */
export const TILE_ANIM_FPS = 5;

const PAIRS = (tileMetaRaw as { animationPairs: Record<string, unknown> }).animationPairs;

/**
 * id -> the ordered frame list its group cycles through. Every frame id in a
 * group maps to the same list, so an animation plays no matter which frame was
 * authored into the map.
 */
const FRAMES: ReadonlyMap<number, readonly number[]> = (() => {
  const map = new Map<number, readonly number[]>();
  for (const value of Object.values(PAIRS)) {
    if (!Array.isArray(value)) continue; // skip the "_note" string entry
    const frames = value as number[];
    for (const id of frames) map.set(id, frames);
  }
  return map;
})();

/**
 * Every frame a tile can show (just `[id]` when it isn't paired). Use this to
 * PRELOAD all frames a loose-tile renderer might draw, so alt frames aren't
 * missing bitmaps at render time.
 */
export function animationFramesFor(id: number): readonly number[] {
  return FRAMES.get(id) ?? [id];
}

/** Whether a tile id participates in a looping animation pair. */
export function isAnimatedTile(id: number): boolean {
  return FRAMES.has(id);
}

/**
 * The frame a (possibly animated) tile should display at `clockSeconds`. Tiles
 * with no pair pass straight through, so this is safe to call on any tile id.
 */
export function animatedTileId(id: number, clockSeconds: number): number {
  const frames = FRAMES.get(id);
  if (!frames || frames.length < 2) return id;
  const index = Math.floor(clockSeconds * TILE_ANIM_FPS) % frames.length;
  return frames[index];
}
