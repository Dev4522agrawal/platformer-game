/**
 * A source of 18x18 tiles addressable by a numeric id. Two implementations:
 *   - SpriteSheet: a packed grid where id is row-major (terrain).
 *   - LooseTileSet: individual tile_NNNN.png files keyed so id === filename
 *     number, guaranteeing the in-game id matches what Finder shows.
 *
 * Tilemap, Player and the debug atlas all draw through this interface so either
 * backing store works interchangeably.
 */
export interface TileSource {
  /** Blit tile `id` at internal-pixel (x, y); `flipX` mirrors horizontally. */
  draw(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, flipX?: boolean): void;
  /** Release every owned ImageBitmap. The source is unusable afterward. */
  dispose(): void;
  /** All ids this source can draw (used by the atlas overlay). */
  ids(): number[];
}
