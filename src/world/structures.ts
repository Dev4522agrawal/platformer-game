/**
 * Structure macros: pure functions that expand a TILE_DICTIONARY recipe into a
 * correct list of tile placements. Multi-tile objects (doors, flags, waterfalls,
 * clouds) must NOT be hand-counted into the object layer — that is what shatters
 * them. Author with these instead; each returns `Placement[]` the level's object
 * layer spreads in. No rendering, no engine coupling.
 *
 * (The tree() macro was cut: this pack's canopy tiles each carry their own
 * outline, so they can't be tiled into a clean crown. See tools/treeBaker/ for
 * the dev-tool exploration that confirmed it.)
 *
 * Recipe map:
 *   door()        -> §4.12 (top 110 + bottom 130 windowed / 150 plain)
 *   flag()        -> §4.14 (pole 131 xN + cloth 111<->112)
 *   waterColumn() -> §4.9  (top 34/35 -> mid 54/55 -> splash 74/75)
 *   pipeV()       -> §4.10 (top 95 -> mid 115 -> bottom 135)
 *   pipeH()       -> §4.10 (left 132 -> mid 133 -> right 134)
 *   cloud()       -> §4.22 (single 154; wide 153 + 155xN + 156) — BACKGROUND only
 */

/** One tile to blit at a grid cell. Shape matches the level's object layer. */
export interface Placement {
  id: number;
  col: number;
  row: number;
}

// ---- Door (§4.12) --------------------------------------------------------

export interface DoorOptions {
  windowed?: boolean;
}

/** Door tile ids (TILE_DICTIONARY §4.13): a 110 top over a windowed/plain bottom. */
export const DOOR_TOP_TILE = 110;
export const DOOR_BOTTOM_WINDOW_TILE = 130;
export const DOOR_BOTTOM_PLAIN_TILE = 150;

/** Two stacked halves at `(col, groundRow)`: top 110 over a windowed/plain bottom. */
export function door(col: number, groundRow: number, opts: DoorOptions = {}): Placement[] {
  const windowed = opts.windowed ?? true;
  return [
    { id: DOOR_TOP_TILE, col, row: groundRow - 1 },
    { id: windowed ? DOOR_BOTTOM_WINDOW_TILE : DOOR_BOTTOM_PLAIN_TILE, col, row: groundRow },
  ];
}

// ---- Flag (§4.14) --------------------------------------------------------

export interface FlagOptions {
  poleHeight?: number;
}

const FLAG_POLE = 131;
/** Cloth animation pair 111 <-> 112; we place frame A (the engine loops them). */
const FLAG_CLOTH_A = 111;
const FLAG_DEFAULT_POLE_HEIGHT = 3;

/** Pole `131` up from `(col, groundRow)` with the cloth at its top. */
export function flag(col: number, groundRow: number, opts: FlagOptions = {}): Placement[] {
  const poleHeight = opts.poleHeight ?? FLAG_DEFAULT_POLE_HEIGHT;
  const out: Placement[] = [];
  for (let k = 0; k < poleHeight; k++) {
    out.push({ id: FLAG_POLE, col, row: groundRow - k });
  }
  out.push({ id: FLAG_CLOTH_A, col, row: groundRow - poleHeight });
  return out;
}

// ---- Water column (§4.9) -------------------------------------------------

const WATER_TOP = 34; // pair 34/35
const WATER_MID = 54; // pair 54/55
const WATER_SPLASH = 74; // pair 74/75

/**
 * Vertical waterfall from `topRow` spanning `height` tiles: pour-over top, a run
 * of falling middles, then the splash base. Each is frame A of its loop pair.
 */
export function waterColumn(col: number, topRow: number, height: number): Placement[] {
  const h = Math.max(2, height);
  const out: Placement[] = [{ id: WATER_TOP, col, row: topRow }];
  for (let r = 1; r < h - 1; r++) out.push({ id: WATER_MID, col, row: topRow + r });
  out.push({ id: WATER_SPLASH, col, row: topRow + h - 1 });
  return out;
}

// ---- Pipes (§4.10) -------------------------------------------------------

const PIPE_V_TOP = 95; // top opening
const PIPE_V_MID = 115; // middle run (∞)
const PIPE_V_BOTTOM = 135; // bottom opening
const PIPE_H_LEFT = 132; // left opening
const PIPE_H_MID = 133; // middle run (∞)
const PIPE_H_RIGHT = 134; // right opening

/**
 * Vertical pipe run from `(col, topRow)` spanning `height` tiles: top opening,
 * a run of middles, then the bottom opening. Decorative set-dressing only (no
 * collision) — these tiles carry no terrain edges in the occupancy mask.
 */
export function pipeV(col: number, topRow: number, height: number): Placement[] {
  const h = Math.max(2, height);
  const out: Placement[] = [{ id: PIPE_V_TOP, col, row: topRow }];
  for (let r = 1; r < h - 1; r++) out.push({ id: PIPE_V_MID, col, row: topRow + r });
  out.push({ id: PIPE_V_BOTTOM, col, row: topRow + h - 1 });
  return out;
}

/**
 * Horizontal pipe run from `(leftCol, row)` spanning `width` tiles: left opening,
 * a run of middles, then the right opening. Decorative set-dressing only.
 */
export function pipeH(leftCol: number, row: number, width: number): Placement[] {
  const w = Math.max(2, width);
  const out: Placement[] = [{ id: PIPE_H_LEFT, col: leftCol, row }];
  for (let i = 1; i < w - 1; i++) out.push({ id: PIPE_H_MID, col: leftCol + i, row });
  out.push({ id: PIPE_H_RIGHT, col: leftCol + w - 1, row });
  return out;
}

// ---- Cloud (§4.22, background only) --------------------------------------

const CLOUD_SINGLE = 154;
const CLOUD_LEFT = 153;
const CLOUD_MID = 155;
const CLOUD_RIGHT = 156;

/** A complete cloud shape (never a fragment): single rounded tile, or L+mid+R. */
export function cloud(col: number, row: number, width = 1): Placement[] {
  if (width <= 1) return [{ id: CLOUD_SINGLE, col, row }];
  const out: Placement[] = [{ id: CLOUD_LEFT, col, row }];
  for (let i = 1; i < width - 1; i++) out.push({ id: CLOUD_MID, col: col + i, row });
  out.push({ id: CLOUD_RIGHT, col: col + width - 1, row });
  return out;
}
