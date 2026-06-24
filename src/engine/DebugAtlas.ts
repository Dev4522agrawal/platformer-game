import { INTERNAL_W, INTERNAL_H, TILE } from '../core/constants';
import type { TileSource } from './TileSource';

/**
 * Dev tool: lay out every tile a TileSource can draw in a grid with its real id
 * overlaid, so a human can read off the correct id for level authoring. Works
 * for both packed sheets (terrain) and loose tile sets (characters/backgrounds),
 * where the id now matches the tile_NNNN.png filename. Toggled by a held key in
 * the game loop; see Game.renderScene.
 */
export function drawAtlas(ctx: CanvasRenderingContext2D, source: TileSource): void {
  const ids = source.ids();
  const columns = Math.max(1, Math.floor(INTERNAL_W / TILE));

  ctx.save();

  // Dim the scene so the atlas reads clearly on top of it.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '6px monospace';

  for (let slot = 0; slot < ids.length; slot++) {
    const id = ids[slot];
    const x = (slot % columns) * TILE;
    const y = Math.floor(slot / columns) * TILE;

    source.draw(ctx, id, x, y);

    // Thin grid cell + id label for legibility.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

    const label = String(id);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(x + 1, y + 1, label.length * 4 + 1, 7);
    ctx.fillStyle = '#9effa0';
    ctx.fillText(label, x + 1, y + 1);
  }

  ctx.restore();
}
