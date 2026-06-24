import { loadImageBitmap } from '../core/assets';
import { TILE } from '../core/constants';
import type { TileSource } from './TileSource';

/**
 * A TileSource backed by individual tile_NNNN.png files rather than a packed
 * sheet. The id IS the 4-digit filename number, so in-game ids match Finder
 * exactly — used for the Kenney Characters and Backgrounds folders whose packed
 * sheets don't share the loose-file layout.
 */
export class LooseTileSet implements TileSource {
  private readonly bitmaps: Map<number, ImageBitmap>;

  private constructor(bitmaps: Map<number, ImageBitmap>) {
    this.bitmaps = bitmaps;
  }

  /**
   * Load exactly the listed ids from `${folder}/tile_NNNN.png`. Loads run in
   * parallel; the resolved set only contains ids that fetched successfully.
   */
  static async load(folder: string, ids: number[]): Promise<LooseTileSet> {
    const entries = await Promise.all(
      ids.map(async (id): Promise<[number, ImageBitmap]> => {
        const path = `${folder}/tile_${String(id).padStart(4, '0')}.png`;
        return [id, await loadImageBitmap(path)];
      }),
    );
    return new LooseTileSet(new Map(entries));
  }

  draw(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, flipX = false): void {
    const bitmap = this.bitmaps.get(id);
    if (!bitmap) return; // id not loaded — skip silently.

    const dx = Math.round(x);
    const dy = Math.round(y);
    if (flipX) {
      ctx.save();
      ctx.translate(dx + TILE, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(bitmap, 0, 0, TILE, TILE);
      ctx.restore();
    } else {
      ctx.drawImage(bitmap, dx, dy, TILE, TILE);
    }
  }

  dispose(): void {
    for (const bitmap of this.bitmaps.values()) bitmap.close();
    this.bitmaps.clear();
  }

  ids(): number[] {
    return [...this.bitmaps.keys()];
  }
}
