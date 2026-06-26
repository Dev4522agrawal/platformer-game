/**
 * Tile renderer: blits 18x18 Kenney tiles by id. No game-state coupling — it
 * only draws what it is handed (an id grid from the autotiler, or single ids).
 *
 * Images are the individual tile_NNNN.png files, lazily loaded and cached. Paths
 * resolve through assetUrl()/import.meta.env.BASE_URL so the build survives being
 * served from the /sector-runner/ sub-path (never a hardcoded absolute path).
 */

import { loadImageBitmap } from '../core/assets';
import { GRID } from '../data/tiles';
import { AIR_ID } from './autotiler';

/** Folder (base-relative) holding the loose tile PNGs. */
const TILES_FOLDER = 'assets/kenney/base/Tiles';

/** Tile edge length in source pixels (from the grid data, not a magic number). */
const TILE = GRID.tile;

function tilePath(id: number): string {
  return `${TILES_FOLDER}/tile_${String(id).padStart(4, '0')}.png`;
}

/**
 * Lazy, cached image source for tile ids. Call `load(ids)` once with every id
 * you intend to draw; await `ready` before the first draw. `dispose()` closes
 * all bitmaps (the destroy() contract — no leaked ImageBitmaps).
 */
export class TileRenderer {
  private readonly bitmaps = new Map<number, ImageBitmap>();
  private loadPromise: Promise<void> | null = null;

  /** Begin loading the listed ids (deduped). Resolves via `ready`. */
  load(ids: number[]): Promise<void> {
    const unique = [...new Set(ids)].filter((id) => id !== AIR_ID && !this.bitmaps.has(id));
    this.loadPromise = Promise.all(
      unique.map(async (id) => {
        this.bitmaps.set(id, await loadImageBitmap(tilePath(id)));
      }),
    ).then(() => undefined);
    return this.loadPromise;
  }

  /** Resolves once the most recent `load()` has finished. */
  get ready(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  /** Blit a single tile id at internal-pixel (x, y), drawn at TILE*scale. */
  drawTile(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, scale: number): void {
    const bitmap = this.bitmaps.get(id);
    if (!bitmap) return; // not loaded — skip silently rather than throw mid-frame.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, Math.round(x), Math.round(y), TILE * scale, TILE * scale);
  }

  /**
   * Blit a whole id grid. Cell (col,row) lands at
   * (originX + col*TILE*scale, originY + row*TILE*scale). AIR_ID cells are skipped.
   */
  drawTileGrid(
    ctx: CanvasRenderingContext2D,
    idGrid: number[][],
    originX: number,
    originY: number,
    scale: number,
  ): void {
    ctx.imageSmoothingEnabled = false;
    const step = TILE * scale;
    for (let row = 0; row < idGrid.length; row++) {
      const ids = idGrid[row];
      for (let col = 0; col < ids.length; col++) {
        const id = ids[col];
        if (id === AIR_ID) continue;
        this.drawTile(ctx, id, originX + col * step, originY + row * step, scale);
      }
    }
  }

  /** Close every cached ImageBitmap. The renderer is unusable afterward. */
  dispose(): void {
    for (const bitmap of this.bitmaps.values()) bitmap.close();
    this.bitmaps.clear();
    this.loadPromise = null;
  }
}
