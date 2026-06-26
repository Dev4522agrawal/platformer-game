/**
 * Sector 2 — Cavern. Authored to the TILE_DICTIONARY and rendered through the
 * SAME paint-grid autotiler + object layers as Sector 1 (src/levels/sector1.ts);
 * it adds NO new mechanics. The cave identity comes from ENCLOSING the play
 * space: a forced-dirt (`D`) ceiling hung across the whole underground stretch
 * plus a deep cave-mouth overhang at the entrance, so the open sky only shows at
 * the entrance plateau and the exit (where the player emerges).
 *
 * Reachability: tuned to DEFAULT_MOVEMENT (src/game/movementConfig.ts). Derived
 * jump arc — jumpVelocity 420, gravityAscendHeld 900 -> max rise = 420^2/(2*900)
 * ≈ 98px ≈ 5.4 tiles; a same-height flat hop reaches well past 4 tiles. The
 * critical path keeps every gap ≤4 tiles and every upward step ≤3 tiles, all
 * comfortably inside that budget, and is completable IGNORING the key/vault
 * side-route (which only gates the diamond reward).
 *
 * Tile-role contract (identical to Sector 1): solid terrain comes from the paint
 * grid only (occupancy mask drives collision); one-way platforms, spikes, drones,
 * key→door and the checkpoint reuse the existing entity systems; multi-tile decor
 * (door/flag/waterColumn/cloud) comes from the structure macros.
 */

import { TILE } from '../core/constants';
import { THEMES } from '../engine/Background';
import { PAINT } from '../world/autotiler';
import { door, flag, waterColumn, cloud, type Placement } from '../world/structures';
import type {
  Cell,
  DroneSpec,
  FallingSpec,
  LevelDef,
  LockedDoorSpec,
  MovingSpec,
  OneWaySpec,
  SwitchSpec,
} from './types';

/** Level grid dimensions in tiles (matches Sector 1: ~2.4 screens wide). */
export const SECTOR2_WIDTH = 64;
export const SECTOR2_HEIGHT = 16;

/** Cave floor surface row; rows GROUND_TOP..HEIGHT-1 are solid body. */
const GROUND_TOP = 13;
/** Spike/accessory row — coplanar with the walking surface (GROUND_TOP - 1). */
const SURFACE_ROW = GROUND_TOP - 1;

/** Entrance + exit plateaus: raised solid land open to the sky (surface row). */
const PLATEAU_SURFACE = 9;
const ENTRANCE_END = 5; // cols 0..5 are the entrance plateau
const EXIT_START = 59; // cols 59..63 are the exit plateau (emergence)

/** Enclosing cave ceiling hung from the top across the underground stretch. */
const CEIL_BOTTOM = 4; // rows 0..4 are forced dirt over cols ENTRANCE_END+1..EXIT_START-1
const CAVE_START = ENTRANCE_END + 1; // 6
const CAVE_END = EXIT_START - 1; // 58

/** Deeper cave-mouth overhang at the entrance (the player drops through it). */
const MOUTH_START = 6;
const MOUTH_END = 9;
const MOUTH_BOTTOM = 6;

/** Floor pits [startCol, endCol] (inclusive) where the cave floor drops out. */
const PITS: ReadonlyArray<readonly [number, number]> = [
  [12, 14], // jumpable gap (3 wide)
  [35, 38], // crossed by the wood one-way bridge
  [52, 54], // jumpable gap (3 wide) with a stepping float
];

// --- spawn ----------------------------------------------------------------

/** Spawn point in world pixels (feet on the entrance plateau surface). */
export const SECTOR2_SPAWN = {
  x: 2 * TILE,
  y: PLATEAU_SURFACE * TILE - 16, // 16 = player box height
} as const;

// --- collectibles & key ---------------------------------------------------

/** Coins telegraph the route (over pits, over spike strips) + the vault reward. */
const COINS: ReadonlyArray<Cell> = [
  { col: 10, row: 11 }, // chamber 1
  { col: 13, row: 11 }, // arc over pit 1
  { col: 20, row: 11 }, // chamber 2
  { col: 22, row: 11 }, // over the spike strip (telegraph the hop)
  { col: 30, row: 11 }, // past the checkpoint
  { col: 36, row: 11 }, // over the pit-2 bridge
  { col: 43, row: 11 }, // over the vault-route spike strip (telegraph the hop)
  { col: 48, row: 7 }, // sealed in the vault (with the diamond)
  { col: 57, row: 9 }, // on the ascent toward the exit
];

/** Diamond — the reward sealed in the locked vault pocket. */
const DIAMOND: Cell = { col: 47, row: 7 };

/** Key pickup, atop the floating-tile climb in chamber 2. */
const KEY: Cell = { col: 19, row: 7 };

/** Mid-level respawn flag. */
const CHECKPOINT: Cell = { col: 26, row: SURFACE_ROW };

/** Sector exit door (kind 'exit') on the exit plateau; touching it completes. */
const EXIT = { col: 61, row: PLATEAU_SURFACE - 2, hTiles: 2 } as const;

// --- hazards --------------------------------------------------------------

/**
 * Spike traps (id 68, §4.18) on the surface row — damage TRIGGERS, never solid.
 * Two are jump-over strips on the critical path (each telegraphed by a coin
 * above); one bites a fall-short under the key climb (off the critical path).
 */
const SPIKES: ReadonlyArray<Cell> = [
  { col: 18, row: SURFACE_ROW }, // fall-short bite under the key climb (off-path)
  { col: 22, row: SURFACE_ROW }, // chamber jump-over strip (1/2)
  { col: 23, row: SURFACE_ROW }, // chamber jump-over strip (2/2)
  { col: 43, row: SURFACE_ROW }, // vault-route jump-over strip (1/2)
  { col: 44, row: SURFACE_ROW }, // vault-route jump-over strip (2/2)
];

// --- enemies --------------------------------------------------------------

/**
 * Patrol Drones (placeholder Characters sprite 15/16). Both pace flat cave floor,
 * auto-reversing at walls/pits, off the forced path — stomp or jump past them.
 */
const DRONES: ReadonlyArray<DroneSpec> = [
  { col: 8, row: GROUND_TOP, dir: 1 }, // chamber 1 (hemmed by the mouth wall + pit 1)
  { col: 41, row: GROUND_TOP, dir: -1 }, // mid chamber (hemmed by pit 2 + pit 3)
];

// --- one-way platforms ----------------------------------------------------

/**
 * Floating dirt/plain tiles (146/147, §4.17) + a wood bridge (47-50, §4.16). The
 * floats form the key climb, the vault-corridor steps, the pit-3 stepping stone,
 * the final ascent staircase and the vault's landing ledge.
 */
const ONE_WAY: ReadonlyArray<OneWaySpec> = [
  // Key climb (chamber 2).
  { col: 17, row: 10, wTiles: 1, art: 'floatDirt' },
  { col: 19, row: 8, wTiles: 1, art: 'floatDirt' },
  // Wood bridge across pit 2.
  { col: 35, row: 12, wTiles: 4, art: 'wood' },
  // Vault corridor steps up to row 8.
  { col: 40, row: 10, wTiles: 1, art: 'floatDirt' },
  { col: 42, row: 8, wTiles: 1, art: 'floatDirt' },
  // Stable wood landing ledge past the falling platform (also the door footing).
  { col: 45, row: 8, wTiles: 2, art: 'wood' },
  // Pit-3 stepping stone.
  { col: 53, row: 12, wTiles: 1, art: 'floatPlain' },
  // Final ascent staircase up to the exit plateau.
  { col: 56, row: 11, wTiles: 1, art: 'floatDirt' },
  { col: 58, row: 10, wTiles: 1, art: 'floatDirt' },
];

// --- falling platform (vault commitment) ----------------------------------

/** Falling platform poised over the vault-route spike strip: keep moving or drop. */
const FALL: FallingSpec = { col: 43, row: 8, wTiles: 2 };

// --- key-locked vault -----------------------------------------------------

/** Vault corridor surface row (shared by the float steps, falling platform, ledge). */
const VAULT_ROW = 8;

/** Key-locked door sealing the vault; opens only with the held key. */
const VAULT_LOCK: LockedDoorSpec = { id: 's2_vault', col: 46, row: VAULT_ROW - 1, hTiles: 2 };

/**
 * The vault is a SEALED terrain pocket (forced-dirt floor + roof + right wall) so
 * the locked door is the ONLY entrance — no hop-over, drop-in or pop-through. The
 * landing ledge (col 45-46) provides footing through the doorway, exactly like
 * Sector 1's vault.
 */
const VAULT_FLOOR: ReadonlyArray<Cell> = [
  { col: 47, row: VAULT_ROW },
  { col: 48, row: VAULT_ROW },
];
const VAULT_ROOF: ReadonlyArray<Cell> = [
  { col: 46, row: VAULT_ROW - 2 },
  { col: 47, row: VAULT_ROW - 2 },
  { col: 48, row: VAULT_ROW - 2 },
];
const VAULT_RIGHT: ReadonlyArray<Cell> = [
  { col: 49, row: VAULT_ROW - 2 },
  { col: 49, row: VAULT_ROW - 1 },
  { col: 49, row: VAULT_ROW },
];

// --- decoration -----------------------------------------------------------

/** Single-tile decor needing no macro (arrows §4.15, keyhole §4.19, mushrooms §4.20). */
const SIMPLE_DECOR: ReadonlyArray<Placement> = [
  { id: 88, col: 4, row: PLATEAU_SURFACE - 1 }, // right arrow -> into the cave
  { id: 88, col: 33, row: SURFACE_ROW }, // right arrow -> onward
  { id: 28, col: 16, row: SURFACE_ROW }, // keyhole block beside the key climb
  { id: 128, col: 9, row: SURFACE_ROW }, // red mushroom (cave floor)
  { id: 129, col: 31, row: SURFACE_ROW }, // tall brown mushroom
  { id: 128, col: 56, row: SURFACE_ROW }, // red mushroom (ascent base)
];

/**
 * Foreground decor blitted over the terrain (NO collision): the exit door macro,
 * the checkpoint flag and a cliffside waterfall pouring into pit 1.
 */
const DECOR: ReadonlyArray<Placement> = [
  ...door(EXIT.col, EXIT.row + 1, { windowed: false }),
  ...flag(CHECKPOINT.col, CHECKPOINT.row, { poleHeight: 3 }),
  ...waterColumn(14, 5, 8), // waterfall cascading into the pit-1 chasm (decorative)
  ...SIMPLE_DECOR,
];

/** Sky decor (behind terrain): clouds, visible only over the open-sky plateaus. */
const SKY_DECOR: ReadonlyArray<Placement> = [
  ...cloud(1, 2, 3), // wide cloud over the entrance plateau
  ...cloud(60, 2, 1), // lone puff over the exit (emergence)
];

// --- switches & moving platforms ------------------------------------------
// Sector 2 keeps the critical path self-contained (no switch-gated criticals),
// so it authors no levers/lifts; the falling platform above is the only timed
// beat. These arrays stay empty but typed for the shared LevelDef shape.

const MOVING: ReadonlyArray<MovingSpec> = [];
const SWITCHES: ReadonlyArray<SwitchSpec> = [];

// --- derived terrain ------------------------------------------------------

function inPit(col: number): boolean {
  return PITS.some(([start, end]) => col >= start && col <= end);
}

/**
 * Build the terrain paint grid ('.'/'S'/'D') from the declarative spec. Generated
 * (not hand-typed) so the cave geometry stays consistent and tunable.
 */
function buildPaintGrid(): string[] {
  const rows: string[][] = Array.from({ length: SECTOR2_HEIGHT }, () =>
    new Array<string>(SECTOR2_WIDTH).fill(PAINT.AIR),
  );

  // Entrance plateau (open sky): solid sand from PLATEAU_SURFACE down.
  for (let col = 0; col <= ENTRANCE_END; col++) {
    for (let row = PLATEAU_SURFACE; row < SECTOR2_HEIGHT; row++) rows[row][col] = PAINT.SAND;
  }
  // Exit plateau (open sky / emergence): solid sand from PLATEAU_SURFACE down.
  for (let col = EXIT_START; col < SECTOR2_WIDTH; col++) {
    for (let row = PLATEAU_SURFACE; row < SECTOR2_HEIGHT; row++) rows[row][col] = PAINT.SAND;
  }
  // Cave floor (sand-capped) across the underground stretch, minus the pits.
  for (let col = CAVE_START; col <= CAVE_END; col++) {
    if (inPit(col)) continue;
    for (let row = GROUND_TOP; row < SECTOR2_HEIGHT; row++) rows[row][col] = PAINT.SAND;
  }
  // Enclosing cave ceiling (forced dirt) hung from the top across the cave.
  for (let col = CAVE_START; col <= CAVE_END; col++) {
    for (let row = 0; row <= CEIL_BOTTOM; row++) rows[row][col] = PAINT.DIRT;
  }
  // Deeper cave-mouth overhang at the entrance (the player drops through it).
  for (let col = MOUTH_START; col <= MOUTH_END; col++) {
    for (let row = 0; row <= MOUTH_BOTTOM; row++) rows[row][col] = PAINT.DIRT;
  }
  // Sealed vault pocket (forced-dirt floor + roof + right wall).
  for (const { col, row } of [...VAULT_FLOOR, ...VAULT_ROOF, ...VAULT_RIGHT]) {
    rows[row][col] = PAINT.DIRT;
  }

  return rows.map((row) => row.join(''));
}

/** The terrain paint grid: feed to the autotiler for render ids. */
export const SECTOR2_PAINT: readonly string[] = buildPaintGrid();

/**
 * Decorative foreground depth: sand-capped earth clumps rising from the bottom
 * edge, autotiled through the SAME tiler and rendered purely visually in front of
 * the player (cave foreground earth). Mirrors Sector 1's foreground pass.
 */
const FOREGROUND_CLUMPS: ReadonlyArray<readonly [number, number]> = [
  [7, 14],
  [20, 28],
  [39, 47],
  [54, 62],
];
const FOREGROUND_CLUMP_TOP = SECTOR2_HEIGHT - 2;

function buildForegroundPaint(): string[] {
  const rows: string[][] = Array.from({ length: SECTOR2_HEIGHT }, () =>
    new Array<string>(SECTOR2_WIDTH).fill(PAINT.AIR),
  );
  // Paint the clumps as a SURFACE biome (sand), NOT forced dirt (D): the exposed
  // top row has air above, so the autotiler caps it with a sand surface tile and
  // fills dirt beneath — without a biome char the top would render as raw dirt
  // (a floating slab). Matches Sector 1's foreground (which uses grass).
  for (const [start, end] of FOREGROUND_CLUMPS) {
    for (let col = start; col <= end && col < SECTOR2_WIDTH; col++) {
      for (let row = FOREGROUND_CLUMP_TOP; row < SECTOR2_HEIGHT; row++) rows[row][col] = PAINT.SAND;
    }
  }
  return rows.map((row) => row.join(''));
}

/** The foreground paint grid: autotile it for render ids (visual only). */
export const SECTOR2_FOREGROUND_PAINT: readonly string[] = buildForegroundPaint();

// --- level bundle ---------------------------------------------------------

/** Sector 2 packaged as the generic LevelDef the loader consumes. */
export const sector2: LevelDef = {
  id: 'sector2',
  sector: 2,
  // Sector 2's exit is now a SECTOR TRANSITION into the final Ice sector (3): it
  // carries run-state forward and fires NO score (the single ARCADE_SCORE fires at
  // Sector 3's exit). Sector 5 (boss approach) isn't built yet.
  next: 'sector3',
  width: SECTOR2_WIDTH,
  height: SECTOR2_HEIGHT,
  spawn: { x: SECTOR2_SPAWN.x, y: SECTOR2_SPAWN.y },
  theme: THEMES.orange, // earthy/underground — distinct from Sector 1's teal sky
  paint: SECTOR2_PAINT,
  foregroundPaint: SECTOR2_FOREGROUND_PAINT,
  coins: COINS,
  diamond: DIAMOND,
  key: KEY,
  checkpoint: CHECKPOINT,
  exit: { col: EXIT.col, row: EXIT.row, hTiles: EXIT.hTiles },
  spikes: SPIKES,
  drones: DRONES,
  oneWayPlatforms: ONE_WAY,
  movingPlatforms: MOVING,
  fallingPlatforms: [FALL],
  lockedDoors: [VAULT_LOCK],
  switches: SWITCHES,
  decor: DECOR,
  skyDecor: SKY_DECOR,
};
