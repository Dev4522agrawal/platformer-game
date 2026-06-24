/**
 * A packed, grid-of-tiles spritesheet wrapping a single ImageBitmap.
 *
 * Tiles are addressed by a row-major id: `id = row * columns + col`, with the
 * column count derived from the bitmap width. Source regions account for an
 * optional uniform `margin` (border around the whole sheet) and `spacing` (gap
 * between adjacent tiles); the Kenney packed sheets use neither (both 0).
 */
import type { TileSource } from './TileSource';

export interface SpriteSheetConfig {
  tileSize?: number;
  spacing?: number;
  margin?: number;
}

export class SpriteSheet implements TileSource {
  readonly tileSize: number;
  readonly spacing: number;
  readonly margin: number;
  readonly columns: number;
  readonly rows: number;

  private readonly bitmap: ImageBitmap;

  constructor(bitmap: ImageBitmap, config: SpriteSheetConfig = {}) {
    this.bitmap = bitmap;
    this.tileSize = config.tileSize ?? 18;
    this.spacing = config.spacing ?? 0;
    this.margin = config.margin ?? 0;

    const stride = this.tileSize + this.spacing;
    // +spacing so the trailing tile (which has no spacing after it) still counts.
    this.columns = Math.floor((bitmap.width - 2 * this.margin + this.spacing) / stride);
    this.rows = Math.floor((bitmap.height - 2 * this.margin + this.spacing) / stride);
  }

  /** Total number of addressable tiles in the sheet. */
  get count(): number {
    return this.columns * this.rows;
  }

  /** Every grid id, 0..count-1 (row-major). */
  ids(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }

  /**
   * Blit tile `id` at internal-pixel (x, y), at 1:1 scale. `flipX` mirrors the
   * tile horizontally about its own center (used for facing direction later).
   * Coordinates are rounded so pixel art stays crisp under camera offsets.
   */
  draw(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, flipX = false): void {
    const col = id % this.columns;
    const row = Math.floor(id / this.columns);
    const sx = this.margin + col * (this.tileSize + this.spacing);
    const sy = this.margin + row * (this.tileSize + this.spacing);
    const dx = Math.round(x);
    const dy = Math.round(y);
    const size = this.tileSize;

    if (flipX) {
      ctx.save();
      ctx.translate(dx + size, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.bitmap, sx, sy, size, size, 0, 0, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(this.bitmap, sx, sy, size, size, dx, dy, size, size);
    }
  }

  /** Release the underlying ImageBitmap. The instance is unusable afterward. */
  dispose(): void {
    this.bitmap.close();
  }
}
