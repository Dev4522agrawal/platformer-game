/**
 * Terrain autotiling: turns the 'terrain' layer's 0/1 occupancy mask into the
 * tile ids that actually get drawn (the "display grid"). Collision (isSolid)
 * always reads the raw mask; only rendering goes through the display grid.
 *
 * For each occupied cell, the row (surface vs fill) depends on whether terrain
 * is present directly above it, and the variant (single/left/center/right)
 * depends on whether terrain is present to its left/right.
 */

/** One terrain "look": the four edge variants for above-ground vs buried tiles. */
export interface TerrainFamily {
  /** No terrain above this cell -> the visible top surface. */
  surface: { single: number; left: number; center: number; right: number };
  /** Terrain present above this cell -> buried fill. */
  fill: { single: number; left: number; center: number; right: number };
}

/**
 * Grass-on-dirt (Sector 1). Ids confirmed against the G atlas: 0-3 are the
 * grass-top variants (single/left/center/right edge), 120-123 the dirt fill
 * directly below. Edit this table (or add new families) as new sectors land.
 */
export const GRASS_FAMILY: TerrainFamily = {
  surface: { single: 0, left: 1, center: 2, right: 3 },
  fill: { single: 120, left: 121, center: 122, right: 123 },
};

/** Level-authored "family" string -> TerrainFamily. Unknown names fall back to grass. */
export const TERRAIN_FAMILIES: Record<string, TerrainFamily> = {
  grass: GRASS_FAMILY,
};

/** True if (tx, ty) is inside the mask and non-zero. Out-of-bounds is never occupied. */
function occupied(mask: number[][], tx: number, ty: number): boolean {
  return mask[ty]?.[tx] !== undefined && mask[ty][tx] !== 0;
}

/**
 * Build the display grid: for each occupied mask cell, pick the surface/fill
 * row by whether terrain sits above it, and the single/left/center/right
 * variant by its horizontal neighbors. Empty cells stay 0 (not drawn).
 */
export function computeDisplayGrid(mask: number[][], fam: TerrainFamily): number[][] {
  const display: number[][] = mask.map((row) => row.map(() => 0));

  for (let ty = 0; ty < mask.length; ty++) {
    const row = mask[ty];
    for (let tx = 0; tx < row.length; tx++) {
      if (row[tx] === 0) continue;

      const hasAbove = occupied(mask, tx, ty - 1);
      const hasLeft = occupied(mask, tx - 1, ty);
      const hasRight = occupied(mask, tx + 1, ty);
      const variants = hasAbove ? fam.fill : fam.surface;

      if (!hasLeft && !hasRight) display[ty][tx] = variants.single;
      else if (!hasLeft && hasRight) display[ty][tx] = variants.left;
      else if (hasLeft && hasRight) display[ty][tx] = variants.center;
      else display[ty][tx] = variants.right;
    }
  }

  if (import.meta.env.DEV) assertSurfaceInvariant(mask, display, fam);
  return display;
}

/**
 * Dev-only sanity check: a cell drawn with a `surface` tile must have nothing
 * occupied directly above it (that's the condition that picked `surface` in
 * the first place). Can't happen by construction — kept as an assertion so a
 * future refactor that breaks it is caught immediately.
 */
function assertSurfaceInvariant(mask: number[][], display: number[][], fam: TerrainFamily): void {
  const surfaceIds = new Set(Object.values(fam.surface));
  for (let ty = 0; ty < display.length; ty++) {
    for (let tx = 0; tx < display[ty].length; tx++) {
      if (!surfaceIds.has(display[ty][tx])) continue;
      if (occupied(mask, tx, ty - 1)) {
        console.warn(
          `Autotile: surface tile at (${tx},${ty}) has occupied terrain directly above it.`,
        );
      }
    }
  }
}
