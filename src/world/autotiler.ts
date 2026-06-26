/**
 * Terrain autotiler: paint grid -> tile-id grid for the renderer.
 *
 * ALGORITHM (per solid cell; N/E/S/W = is-that-4-neighbour-solid, OOB = air):
 *   1. CLASSIFY. A cell is SURFACE iff its char is a biome (G/S/I) AND N is air.
 *      Everything else is FILL — buried biome cells AND every `D` cell (D forces
 *      dirt body regardless of column biome: cave ceilings, overhang undersides).
 *   2. SURFACE pick from SURFACE_POOL[biome][height]: height = "tall" if S solid
 *      else "thin"; horizontal variant index from W/E via SURFACE_VARIANT_ORDER
 *      (isolated=0, openRight=1, openLeftRight=2, openLeft=3).
 *   3. FILL pick from FILL_DIRT: build the needed edge signature (per side: "open"
 *      if that neighbour is solid, "closed" if air) and choose the dirt tile whose
 *      MERGED edges equal it. No exact match -> most-sides match, tie-break to the
 *      all-open interior filler. Never throws.
 *
 * MERGE RULE reminder: FILL matching reads each dirt tile's *merged* edges
 * (tileMeta override wins over tileEdges geometry) via src/data/tiles.ts.
 */

import {
  GRID,
  edgesOf,
  FILL_DIRT,
  SURFACE_POOL,
  type Biome,
  type Edge,
  type Edges,
  type Height,
  type Side,
} from '../data/tiles';

/** Paint-grid characters. */
export const PAINT = {
  AIR: '.',
  GRASS: 'G',
  SAND: 'S',
  ICE: 'I',
  DIRT: 'D',
} as const;

/** Air cells become this id in the output grid. */
export const AIR_ID = -1;

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** Biome lookup for the surface-capable chars (D has no biome — it is always fill). */
const CHAR_BIOME: Record<string, Biome> = {
  [PAINT.GRASS]: 'grass',
  [PAINT.SAND]: 'sand',
  [PAINT.ICE]: 'ice',
};

function isSolidChar(ch: string | undefined): boolean {
  return ch !== undefined && ch !== PAINT.AIR;
}

/** Char at (col,row); out-of-grid reads as air. */
function charAt(grid: string[], col: number, row: number): string | undefined {
  return grid[row]?.[col];
}

/** Stable 4-char signature key, e.g. "ooco", for a side->open/closed map. */
function sigKey(edges: Edges): string {
  return SIDES.map((s) => (edges[s] === 'open' ? 'o' : 'c')).join('');
}

// ---- One-time signature -> tileId lookup over the dirt pool ----

/** All-open interior dirt tile: the tie-break filler for fully-buried cells. */
const INTERIOR_DIRT_ID: number = (() => {
  const interior = FILL_DIRT.find((id) => sigKey(edgesOf(id)) === 'oooo');
  return interior ?? FILL_DIRT[0];
})();

/** signature key -> dirt tile id (first tile wins for any duplicate signature). */
const DIRT_BY_SIG: Map<string, number> = (() => {
  const map = new Map<string, number>();
  for (const id of FILL_DIRT) {
    const key = sigKey(edgesOf(id));
    if (!map.has(key)) map.set(key, id);
  }
  return map;
})();

/**
 * Pick a dirt tile for a needed signature. Exact match first; otherwise the
 * candidate matching the most sides, tie-breaking toward the interior filler.
 * Never throws — always returns a valid dirt id.
 */
function pickFill(needed: Edges): number {
  const key = sigKey(needed);
  const exact = DIRT_BY_SIG.get(key);
  if (exact !== undefined) return exact;

  let bestId = INTERIOR_DIRT_ID;
  let bestScore = -1;
  for (const id of FILL_DIRT) {
    const e = edgesOf(id);
    let score = 0;
    for (const s of SIDES) {
      const candOpen = e[s] === 'open';
      const needOpen = needed[s] === 'open';
      if (candOpen === needOpen) score++;
    }
    // Strictly-greater keeps the earliest-listed best; the explicit interior
    // tie-break below resolves equal scores deterministically.
    if (score > bestScore || (score === bestScore && id === INTERIOR_DIRT_ID)) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

/** Pick a biome surface tile from its 4 horizontal variants. */
function pickSurface(biome: Biome, height: Height, west: boolean, east: boolean): number {
  const variants = SURFACE_POOL[biome][height];
  // Index matches SURFACE_VARIANT_ORDER = [isolated, openRight, openLeftRight, openLeft].
  let index: number;
  if (!west && !east) index = 0; // isolated
  else if (!west && east) index = 1; // openRight
  else if (west && east) index = 2; // openLeftRight
  else index = 3; // openLeft
  return variants[index];
}

/** Build the FILL signature: "open" if a neighbour is solid, "closed" if air. */
function fillSignature(n: boolean, e: boolean, s: boolean, w: boolean): Edges {
  const sideOf = (solid: boolean): Edge => (solid ? 'open' : 'closed');
  return { top: sideOf(n), right: sideOf(e), bottom: sideOf(s), left: sideOf(w) };
}

/**
 * Convert a paint grid (array of equal-length strings) into a tile-id grid.
 * Output dimensions equal the input; air cells are AIR_ID (-1).
 */
export function autotile(paint: string[]): number[][] {
  const out: number[][] = [];
  for (let row = 0; row < paint.length; row++) {
    const line = paint[row];
    const ids: number[] = [];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (!isSolidChar(ch)) {
        ids.push(AIR_ID);
        continue;
      }

      const n = isSolidChar(charAt(paint, col, row - 1));
      const e = isSolidChar(charAt(paint, col + 1, row));
      const s = isSolidChar(charAt(paint, col, row + 1));
      const w = isSolidChar(charAt(paint, col - 1, row));

      const biome = CHAR_BIOME[ch];
      const isSurface = biome !== undefined && !n;

      if (isSurface) {
        const height: Height = s ? 'tall' : 'thin';
        ids.push(pickSurface(biome, height, w, e));
      } else {
        ids.push(pickFill(fillSignature(n, e, s, w)));
      }
    }
    out.push(ids);
  }
  return out;
}

/** Re-exported for callers that size their canvas from the grid. */
export { GRID };
