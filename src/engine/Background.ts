import { INTERNAL_W, INTERNAL_H, TILE } from '../core/constants';
import type { TileSource } from './TileSource';

/**
 * A layered backdrop theme. The Kenney background tiles stack into three bands:
 *   - skyIds:   plain sky fills for the region ABOVE the horizon.
 *   - solidIds: plain ground-colour fills for the region BELOW the horizon.
 *   - bandIds:  the decorative horizon separator (clouds/trees/hills, transparent
 *               above), cycled across the width as a single row.
 *
 * horizonY is in internal px (0..INTERNAL_H); parallax is 0..1 (fraction of the
 * camera's horizontal motion the band follows — smaller = further away).
 */
export type BackgroundTheme = {
  skyIds: number[];
  bandIds: number[];
  solidIds: number[];
  horizonY: number;
  parallax: number;
};

/**
 * Per-sector colour families. Ids come from the Backgrounds folder (id ===
 * filename number) — confirm/adjust against the B atlas overlay.
 */
export const THEMES: Record<'teal' | 'orange' | 'green', BackgroundTheme> = {
  teal: { skyIds: [0, 1, 2, 3], bandIds: [8, 9, 10, 11], solidIds: [16, 17, 18, 19], horizonY: 150, parallax: 0.3 },
  orange: { skyIds: [4, 5], bandIds: [12, 13], solidIds: [20, 21], horizonY: 150, parallax: 0.3 },
  green: { skyIds: [6, 7], bandIds: [14, 15], solidIds: [22, 23], horizonY: 150, parallax: 0.3 },
};

/**
 * Screen-space layered parallax background. Fills the whole 480x270 viewport and
 * does NOT scroll vertically; only the horizon band parallaxes horizontally,
 * cycling its tile set so the strip has variety and wraps seamlessly.
 */
export class Background {
  private theme: BackgroundTheme;
  private readonly source: TileSource;

  constructor(theme: BackgroundTheme, source: TileSource) {
    this.theme = theme;
    this.source = source;
  }

  /** Swap the active theme at runtime (theme preview). */
  setTheme(theme: BackgroundTheme): void {
    this.theme = theme;
  }

  render(ctx: CanvasRenderingContext2D, camX: number): void {
    const { skyIds, bandIds, solidIds, horizonY, parallax } = this.theme;

    // (1) SKY — flat fill above the horizon (set members are equivalent fills).
    this.fillRegion(ctx, skyIds[0], 0, horizonY);
    // (2) SOLID — flat fill below the band row.
    this.fillRegion(ctx, solidIds[0], horizonY + TILE, INTERNAL_H);

    // (3) BAND — decorative horizon row with parallax + variety + seamless wrap.
    const worldBandX = camX * parallax;
    const ox = -(((worldBandX % TILE) + TILE) % TILE);
    const startCol = Math.floor(worldBandX / TILE);
    const len = bandIds.length;
    const tiles = Math.ceil(INTERNAL_W / TILE) + 1;
    for (let i = 0; i <= tiles; i++) {
      const idx = (((startCol + i) % len) + len) % len;
      this.source.draw(ctx, bandIds[idx], ox + i * TILE, horizonY);
    }
  }

  /** Tile `id` across the viewport width for rows spanning [yStart, yEnd). */
  private fillRegion(ctx: CanvasRenderingContext2D, id: number, yStart: number, yEnd: number): void {
    for (let y = yStart; y < yEnd; y += TILE) {
      for (let x = 0; x < INTERNAL_W; x += TILE) {
        this.source.draw(ctx, id, x, y);
      }
    }
  }
}
