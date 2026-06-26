import { TILE } from '../core/constants';
import type { TileSource } from '../engine/TileSource';

/**
 * Screen-space player HUD: a heart row (lives), a coin tally, and the running
 * score. Everything here draws in raw canvas pixels with NO camera offset, so it
 * stays pinned to the top regardless of world scroll. Pure render — it reads the
 * passed-in HudState and owns no state of its own.
 */

/** Heart tile ids (TILE_DICTIONARY §4.x): full / half / empty. */
export const HEART_FULL_TILE = 44;
export const HEART_HALF_TILE = 45;
export const HEART_EMPTY_TILE = 46;

/** Coin icon for the tally (front frame of the animated coin, §4.19). */
export const COIN_ICON_TILE = 151;

// --- layout constants (design-res 480x270) --------------------------------

/** Outer padding from the screen edges. */
export const HUD_MARGIN = 6;
/** Rendered size of each heart, scaled down from the 18px source tile. */
export const HEART_SIZE = 14;
/** Horizontal gap between adjacent hearts. */
export const HEART_GAP = 2;
/** Vertical gap between the heart row and the coin row below it. */
export const HUD_ROW_GAP = 4;
/** Rendered size of the coin icon in the tally. */
export const COIN_ICON_SIZE = 11;
/** Gap between the coin icon and its number. */
export const COIN_TEXT_GAP = 3;

export const HUD_TEXT_FONT = '10px monospace';
export const HUD_SCORE_FONT = '12px monospace';
export const HUD_TEXT_COLOR = '#e8eefc';
export const HUD_SCORE_COLOR = '#9effa0';
/** Subtle shadow so light text stays legible over bright terrain. */
export const HUD_SHADOW_COLOR = 'rgba(0,0,0,0.55)';

// --- control legend + contextual interact hint (top-left, under the tally) ---

/** Top of the coin tally row (hearts row + gap), reused to stack things below it. */
const COIN_ROW_Y = HUD_MARGIN + HEART_SIZE + HUD_ROW_GAP;

/** Persistent one-line control legend, just below the coin tally. */
export const LEGEND_FONT = '7px monospace';
export const LEGEND_COLOR = '#9aa6c4';
export const LEGEND_Y = COIN_ROW_Y + COIN_ICON_SIZE + 7;
/** Minimal core-control reminder (real bindings: arrows/WASD move, Space/↑ jump, ↓/S use). */
export const LEGEND_TEXT = '← → MOVE  ↑ JUMP  S USE';

/** Contextual interact prompt, shown only while in range of an interactable. */
export const HINT_FONT = '8px monospace';
export const HINT_COLOR = '#ffe9a8';
export const HINT_Y = LEGEND_Y + 11;
/** Key label shown in the prompt (the interact key is ↓ / S). */
export const INTERACT_KEY_LABEL = 'S';

/** Live values the HUD reads each frame; no internal state is kept. */
export interface HudState {
  lives: number;
  maxLives: number;
  score: number;
  coins: number;
}

/** Blit a source tile at a SCREEN position, scaled to `size` px (square). */
function drawTileScaled(
  ctx: CanvasRenderingContext2D,
  source: TileSource,
  id: number,
  x: number,
  y: number,
  size: number,
): void {
  const scale = size / TILE;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  source.draw(ctx, id, 0, 0);
  ctx.restore();
}

/** Pick the heart tile for slot `i` given fractional lives (supports halves). */
function heartTileFor(lives: number, slot: number): number {
  const remaining = lives - slot;
  if (remaining >= 1) return HEART_FULL_TILE;
  if (remaining >= 0.5) return HEART_HALF_TILE;
  return HEART_EMPTY_TILE;
}

/** One-pixel drop-shadowed text helper. */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.fillStyle = HUD_SHADOW_COLOR;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * Draw the full HUD. `width` is the canvas design width, used to right-align the
 * score. Heart count is driven by maxLives so empties show the lost lives.
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  sheet: TileSource,
  width: number,
  state: HudState,
): void {
  // Hearts, top-left.
  for (let i = 0; i < state.maxLives; i++) {
    const x = HUD_MARGIN + i * (HEART_SIZE + HEART_GAP);
    drawTileScaled(ctx, sheet, heartTileFor(state.lives, i), x, HUD_MARGIN, HEART_SIZE);
  }

  // Coin tally under the hearts: icon + number.
  const coinY = HUD_MARGIN + HEART_SIZE + HUD_ROW_GAP;
  drawTileScaled(ctx, sheet, COIN_ICON_TILE, HUD_MARGIN, coinY, COIN_ICON_SIZE);
  ctx.font = HUD_TEXT_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawText(
    ctx,
    `${state.coins}`,
    HUD_MARGIN + COIN_ICON_SIZE + COIN_TEXT_GAP,
    coinY + COIN_ICON_SIZE / 2,
    HUD_TEXT_COLOR,
  );

  // Score, top-right.
  ctx.font = HUD_SCORE_FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  drawText(ctx, `${state.score}`, width - HUD_MARGIN, HUD_MARGIN, HUD_SCORE_COLOR);
}

/**
 * Persistent core-control legend, top-left under the coin tally. Screen-space,
 * no camera offset; sits clear of the heart row.
 */
export function drawControlLegend(ctx: CanvasRenderingContext2D): void {
  ctx.font = LEGEND_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawText(ctx, LEGEND_TEXT, HUD_MARGIN, LEGEND_Y, LEGEND_COLOR);
}

/**
 * Contextual interact prompt ("press S to <verb>"), top-left under the legend.
 * Drawn only when `verb` is non-null (the caller passes it while the player is in
 * range of an actionable interactable, and null otherwise).
 */
export function drawInteractHint(ctx: CanvasRenderingContext2D, verb: string | null): void {
  if (!verb) return;
  ctx.font = HINT_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawText(ctx, `press ${INTERACT_KEY_LABEL} to ${verb}`, HUD_MARGIN, HINT_Y, HINT_COLOR);
}
