/**
 * Tile data layer: merges the two authored JSON artifacts into one typed table.
 *
 *   tileEdges.json  — pixel-extracted raw edge geometry (open/closed/empty per side)
 *   tileMeta.json   — semantics (family/role/biome/height/group/name/flags) AND
 *                     authoritative edge OVERRIDES.
 *
 * MERGE RULE (critical): both files are keyed by tile id. The merged `edges` for
 * a tile is `tileMeta.edges` IF PRESENT, else the `tileEdges` geometry. Where a
 * tile in tileMeta has an explicit `edges` object, it WINS.
 *
 * Edge meaning: open = terrain continues off that side (joins a neighbour);
 * closed = a drawn border caps it; empty = transparent (object tile).
 */

import tileMetaRaw from './tileMeta.json';
import tileEdgesRaw from './tileEdges.json';

export type Edge = 'open' | 'closed' | 'empty';
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Edges = Record<Side, Edge>;

export type Biome = 'grass' | 'sand' | 'ice';
export type Height = 'thin' | 'tall';

/** Horizontal surface-variant slots, in the order the autotiler indexes them. */
export type SurfaceVariant = 'isolated' | 'openRight' | 'openLeftRight' | 'openLeft';

/** One merged tile record: tileMeta semantics + the resolved edge geometry. */
export interface TileInfo {
  id: number;
  family: string;
  role: string;
  biome?: string;
  height?: Height;
  group?: string;
  name?: string;
  /** Resolved edges: tileMeta.edges if present, else tileEdges geometry. */
  edges: Edges;
}

// ---- Raw-shape views over the imported JSON (kept narrow, cast at the boundary) ----

interface RawMetaTile {
  family: string;
  role: string;
  biome?: string;
  height?: string;
  group?: string;
  name?: string;
  edges?: Partial<Record<Side, string>>;
}

interface RawMeta {
  grid: { cols: number; rows: number; tileSize: number };
  autotile: {
    surfaceVariantOrder: SurfaceVariant[];
    surface: Record<Biome, Record<Height, number[]>>;
    fill: { dirt: number[] };
  };
  tiles: Record<string, RawMetaTile>;
}

interface RawEdgesTile {
  edges: Record<Side, string>;
}

interface RawEdges {
  tiles: Record<string, RawEdgesTile>;
}

const META = tileMetaRaw as unknown as RawMeta;
const EDGES = tileEdgesRaw as unknown as RawEdges;

/** Grid geometry, sourced from the JSON (never a magic literal elsewhere). */
export const GRID = {
  cols: META.grid.cols,
  rows: META.grid.rows,
  tile: META.grid.tileSize,
} as const;

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

function asEdge(value: string): Edge {
  if (value === 'open' || value === 'closed' || value === 'empty') return value;
  throw new Error(`tiles: unexpected edge value "${value}"`);
}

/** Resolve a tile's edges: tileMeta override wins, else the pixel-extracted geometry. */
function resolveEdges(id: number, meta: RawMetaTile | undefined): Edges {
  const fallback = EDGES.tiles[String(id)]?.edges;
  const override = meta?.edges;
  const out = {} as Edges;
  for (const side of SIDES) {
    const raw = override?.[side] ?? fallback?.[side];
    // Object tiles can be absent from one source; default to "empty" (transparent).
    out[side] = raw ? asEdge(raw) : 'empty';
  }
  return out;
}

function buildTable(): Record<number, TileInfo> {
  const table: Record<number, TileInfo> = {};
  for (const key of Object.keys(META.tiles)) {
    const id = Number(key);
    const m = META.tiles[key];
    table[id] = {
      id,
      family: m.family,
      role: m.role,
      biome: m.biome,
      height: m.height === 'thin' || m.height === 'tall' ? m.height : undefined,
      group: m.group,
      name: m.name,
      edges: resolveEdges(id, m),
    };
  }
  return table;
}

/** The merged source-of-truth table, keyed by tile id. */
export const TileTable: Record<number, TileInfo> = buildTable();

/** Typed accessor. Throws on an unknown id rather than returning undefined. */
export function getTile(id: number): TileInfo {
  const info = TileTable[id];
  if (!info) throw new Error(`tiles: no tile with id ${id}`);
  return info;
}

/** Merged edges for a tile id (convenience for the autotiler's signature build). */
export function edgesOf(id: number): Edges {
  return getTile(id).edges;
}

// ---- Autotile pools, exported straight from tileMeta.autotile ----

export const SURFACE_VARIANT_ORDER: readonly SurfaceVariant[] =
  META.autotile.surfaceVariantOrder;

/** surfacePool[biome][height] -> the 4 horizontal variants in variant-order. */
export const SURFACE_POOL: Record<Biome, Record<Height, number[]>> =
  META.autotile.surface;

/** The dirt-body candidate pool the FILL picker matches edge signatures against. */
export const FILL_DIRT: number[] = META.autotile.fill.dirt;
