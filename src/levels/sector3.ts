/**
 * Sector 3 — Ice Caverns (the FINAL sector). Authored to the TILE_DICTIONARY and
 * rendered through the SAME paint-grid autotiler + object layers as Sectors 1 & 2
 * (src/levels/sector1.ts, sector2.ts); it adds NO new mechanics. The cavern
 * identity comes from the ICE biome surfaces (paint char `I` -> 80-83 thin /
 * 100-103 tall) plus an ENCLOSING forced-dirt (`D`) ceiling and a deep cave-mouth
 * overhang at the entrance, so open sky only shows at the entrance plateau and the
 * exit (where the player emerges). Decorative WATER (animated waves 33<->53 +
 * a waterColumn waterfall) and a PIPE network (vertical + horizontal runs) dress
 * the ice — all set-dressing, NO collision (none enters the occupancy mask).
 *
 * Reachability: tuned to DEFAULT_MOVEMENT (src/game/movementConfig.ts). Derived
 * jump arc — jumpVelocity 420, gravityAscendHeld 900 -> max rise = 420^2/(2*900)
 * ≈ 98px ≈ 5.4 tiles; a same-height flat hop clears well past 4 tiles. The
 * critical path keeps every gap ≤4 tiles and every upward step ≤3 tiles, all
 * comfortably inside that budget, and is completable IGNORING the key/vault
 * side-route (which only gates the diamond reward).
 *
 * Tile-role contract (identical to Sectors 1 & 2): solid terrain comes from the
 * paint grid only (occupancy mask drives collision); one-way platforms, spikes,
 * drones, key->door and the checkpoint reuse the existing entity systems; the
 * multi-tile decor (door/flag/waterColumn/pipeV/pipeH/cloud) comes from the
 * structure macros. Animated decor pairs (water 33/53, waterfall, flag) loop
 * through the TileAnimator automatically when blitted in the decor layer.
 */

import { TILE } from '../core/constants';
import { THEMES } from '../engine/Background';
import { PAINT } from '../world/autotiler';
import {
  door,
  flag,
  waterColumn,
  pipeV,
  pipeH,
  cloud,
  type Placement,
} from '../world/structures';
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

/** Level grid dimensions in tiles (matches Sectors 1 & 2: ~2.4 screens wide). */
export const SECTOR3_WIDTH = 64;
export const SECTOR3_HEIGHT = 16;

/** Cave floor surface row; rows GROUND_TOP..HEIGHT-1 are solid body. */
const GROUND_TOP = 13;
/** Spike/accessory row — coplanar with the walking surface (GROUND_TOP - 1). */
const SURFACE_ROW = GROUND_TOP - 1;

/** Entrance + exit plateaus: raised solid land open to the sky (surface row). */
const PLATEAU_SURFACE = 9;
const ENTRANCE_END = 5; // cols 0..5 are the entrance plateau
const EXIT_START = 59; // cols 59..63 are the exit plateau (emergence)

/** Enclosing cave ceiling hung from the top across the underground stretch. */
const CEIL_BOTTOM = 4; // rows 0..4 are forced dirt over cols CAVE_START..CAVE_END
const CAVE_START = ENTRANCE_END + 1; // 6
const CAVE_END = EXIT_START - 1; // 58

/** Deeper cave-mouth overhang at the entrance (the player descends through it). */
const MOUTH_START = 6;
const MOUTH_END = 9;
const MOUTH_BOTTOM = 6;

/** Floor pits [startCol, endCol] (inclusive) where the cave floor drops out. */
const PITS: ReadonlyArray<readonly [number, number]> = [
  [13, 15], // jumpable gap (3 wide), waterfall pours into it
  [34, 37], // crossed by the wood one-way bridge
  [51, 53], // jumpable gap (3 wide) with a stepping float
];

// --- spawn ----------------------------------------------------------------

/** Spawn point in world pixels (feet on the entrance plateau surface). */
export const SECTOR3_SPAWN = {
  x: 2 * TILE,
  y: PLATEAU_SURFACE * TILE - 16, // 16 = player box height
} as const;

// --- collectibles & key ---------------------------------------------------

/** Coins telegraph the route (over pits, over spike strips) + the vault reward. */
const COINS: ReadonlyArray<Cell> = [
  { col: 8, row: 11 }, // chamber 1
  { col: 11, row: 11 }, // approach to pit 1
  { col: 14, row: 10 }, // arc over pit 1 (above the waterfall)
  { col: 22, row: 11 }, // chamber 2
  { col: 24, row: 11 }, // over the spike strip (telegraph the hop)
  { col: 30, row: 11 }, // past the checkpoint
  { col: 36, row: 11 }, // over the pit-2 bridge
  { col: 43, row: 11 }, // over the vault-route spike strip (telegraph the hop)
  { col: 48, row: 7 }, // sealed in the vault (beside the diamond)
  { col: 56, row: 9 }, // on the ascent toward the exit
];

/** Diamond — the reward sealed in the locked vault pocket. */
const DIAMOND: Cell = { col: 47, row: 7 };

/** Key pickup, atop the floating-tile climb in chamber 2. */
const KEY: Cell = { col: 19, row: 7 };

/** Mid-level respawn flag. */
const CHECKPOINT: Cell = { col: 27, row: SURFACE_ROW };

/** Sector exit door (kind 'exit') on the exit plateau; touching it ends the run. */
const EXIT = { col: 61, row: PLATEAU_SURFACE - 2, hTiles: 2 } as const;

// --- hazards --------------------------------------------------------------

/**
 * Spike traps (id 68, §4.18) on the surface row — damage TRIGGERS, never solid.
 * Two are jump-over strips on the critical path (each telegraphed by a coin
 * above); one bites a fall-short under the key climb (off the critical path).
 */
const SPIKES: ReadonlyArray<Cell> = [
  { col: 18, row: SURFACE_ROW }, // fall-short bite under the key climb (off-path)
  { col: 23, row: SURFACE_ROW }, // chamber jump-over strip (1/2)
  { col: 24, row: SURFACE_ROW }, // chamber jump-over strip (2/2)
  { col: 43, row: SURFACE_ROW }, // vault-route jump-over strip (1/2)
  { col: 44, row: SURFACE_ROW }, // vault-route jump-over strip (2/2)
];

// --- enemies --------------------------------------------------------------

/**
 * Patrol Drones (placeholder Characters sprite 15/16). Both pace flat cave floor,
 * auto-reversing at walls/pits — stomp or jump past them, neither blocks the path.
 */
const DRONES: ReadonlyArray<DroneSpec> = [
  { col: 9, row: GROUND_TOP, dir: 1 }, // chamber 1 (hemmed by the mouth wall + pit 1)
  { col: 40, row: GROUND_TOP, dir: -1 }, // mid chamber (hemmed by pit 2 + pit 3)
];

// --- one-way platforms ----------------------------------------------------

/**
 * Floating tiles (146/147, §4.17) + a wood bridge (47-50, §4.16). The floats form
 * the key climb, the vault-corridor steps, the pit-3 stepping stone and the final
 * ascent staircase; the wood spans pit 2 and the vault's landing ledge.
 */
const ONE_WAY: ReadonlyArray<OneWaySpec> = [
  // Key climb (chamber 2).
  { col: 17, row: 10, wTiles: 1, art: 'floatDirt' },
  { col: 19, row: 8, wTiles: 1, art: 'floatDirt' },
  // Wood bridge across pit 2.
  { col: 34, row: 12, wTiles: 4, art: 'wood' },
  // Vault corridor steps up to row 8.
  { col: 40, row: 10, wTiles: 1, art: 'floatDirt' },
  { col: 42, row: 8, wTiles: 1, art: 'floatDirt' },
  // Stable wood landing ledge past the falling platform (also the door footing).
  { col: 45, row: 8, wTiles: 2, art: 'wood' },
  // Pit-3 stepping stone.
  { col: 52, row: 12, wTiles: 1, art: 'floatPlain' },
  // Final ascent staircase up to the exit plateau.
  { col: 55, row: 11, wTiles: 1, art: 'floatDirt' },
  { col: 57, row: 10, wTiles: 1, art: 'floatDirt' },
];

// --- falling platform (vault commitment) ----------------------------------

/** Falling platform poised over the vault-route spike strip: keep moving or drop. */
const FALL: FallingSpec = { col: 43, row: 8, wTiles: 2 };

// --- key-locked vault -----------------------------------------------------

/** Vault corridor surface row (shared by the float steps, falling platform, ledge). */
const VAULT_ROW = 8;

/** Key-locked door sealing the vault; opens only with the held key. */
const VAULT_LOCK: LockedDoorSpec = { id: 's3_vault', col: 46, row: VAULT_ROW - 1, hTiles: 2 };

/**
 * The vault is a SEALED terrain pocket (forced-dirt floor + roof + right wall) so
 * the locked door is the ONLY entrance — no hop-over, drop-in or pop-through. The
 * landing ledge (col 45-46) provides footing through the doorway, exactly like
 * Sectors 1 & 2.
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

// --- decorative water (NO collision) --------------------------------------

/**
 * Animated water-surface waves (33 <-> 53, §4.9) sitting at the pit floors as icy
 * pool surfaces. Placed in the decor layer, so the TileAnimator loops the pair at
 * render time. Purely visual: pits stay pits (no footing here).
 */
const WATER_WAVES: ReadonlyArray<Placement> = [
  { id: 33, col: 13, row: 13 }, // pit-1 pool (flanking the waterfall splash)
  { id: 33, col: 15, row: 13 },
  { id: 33, col: 35, row: 13 }, // pit-2 pool, beneath the wood bridge
  { id: 33, col: 36, row: 13 },
];

// --- switches & moving platforms ------------------------------------------
// Sector 3 keeps the critical path self-contained (no switch-gated criticals),
// so it authors no levers/lifts; the falling platform above is the only timed
// beat. These arrays stay empty but typed for the shared LevelDef shape.

const MOVING: ReadonlyArray<MovingSpec> = [];
const SWITCHES: ReadonlyArray<SwitchSpec> = [];

// --- decoration -----------------------------------------------------------

/** Single-tile decor needing no macro (arrows §4.15, keyhole §4.19, snow §4.20). */
const SIMPLE_DECOR: ReadonlyArray<Placement> = [
  { id: 88, col: 4, row: PLATEAU_SURFACE - 1 }, // right arrow -> into the cave
  { id: 88, col: 31, row: SURFACE_ROW }, // right arrow -> onward
  { id: 28, col: 16, row: SURFACE_ROW }, // keyhole block beside the key climb
  { id: 144, col: 9, row: SURFACE_ROW }, // snow tuft (cave floor)
  { id: 145, col: 30, row: SURFACE_ROW }, // snowman
  { id: 144, col: 55, row: SURFACE_ROW }, // snow tuft (ascent base)
];

/**
 * Foreground decor blitted over the terrain (NO collision): the exit door macro,
 * the checkpoint flag, a cliffside waterfall pouring into pit 1, the animated
 * icy pool waves and a blue pipe network (vertical + horizontal runs) threaded
 * through the cavern as set-dressing.
 */
const DECOR: ReadonlyArray<Placement> = [
  ...door(EXIT.col, EXIT.row + 1, { windowed: false }),
  ...flag(CHECKPOINT.col, CHECKPOINT.row, { poleHeight: 3 }),
  ...waterColumn(14, 5, 9), // waterfall cascading into the pit-1 chasm (decorative)
  ...WATER_WAVES,
  ...pipeV(31, 5, 3), // vertical pipe hung from the cave ceiling
  ...pipeH(8, 5, 3), // horizontal pipe run under the ceiling near the entrance
  ...SIMPLE_DECOR,
];

/** Sky decor (behind terrain): clouds, visible only over the open-sky plateaus. */
const SKY_DECOR: ReadonlyArray<Placement> = [
  ...cloud(1, 2, 3), // wide cloud over the entrance plateau
  ...cloud(60, 2, 1), // lone puff over the exit (emergence)
];

// --- derived terrain ------------------------------------------------------

function inPit(col: number): boolean {
  return PITS.some(([start, end]) => col >= start && col <= end);
}

/**
 * Build the terrain paint grid ('.'/'I'/'D') from the declarative spec. Generated
 * (not hand-typed) so the cavern geometry stays consistent and tunable. Surfaces
 * paint ICE (`I`); the enclosing ceiling/overhang/vault seal force dirt (`D`).
 */
function buildPaintGrid(): string[] {
  const rows: string[][] = Array.from({ length: SECTOR3_HEIGHT }, () =>
    new Array<string>(SECTOR3_WIDTH).fill(PAINT.AIR),
  );

  // Entrance plateau (open sky): solid ice from PLATEAU_SURFACE down.
  for (let col = 0; col <= ENTRANCE_END; col++) {
    for (let row = PLATEAU_SURFACE; row < SECTOR3_HEIGHT; row++) rows[row][col] = PAINT.ICE;
  }
  // Exit plateau (open sky / emergence): solid ice from PLATEAU_SURFACE down.
  for (let col = EXIT_START; col < SECTOR3_WIDTH; col++) {
    for (let row = PLATEAU_SURFACE; row < SECTOR3_HEIGHT; row++) rows[row][col] = PAINT.ICE;
  }
  // Cave floor (ice-capped) across the underground stretch, minus the pits.
  for (let col = CAVE_START; col <= CAVE_END; col++) {
    if (inPit(col)) continue;
    for (let row = GROUND_TOP; row < SECTOR3_HEIGHT; row++) rows[row][col] = PAINT.ICE;
  }
  // Enclosing cave ceiling (forced dirt) hung from the top across the cave.
  for (let col = CAVE_START; col <= CAVE_END; col++) {
    for (let row = 0; row <= CEIL_BOTTOM; row++) rows[row][col] = PAINT.DIRT;
  }
  // Deeper cave-mouth overhang at the entrance (the player descends through it).
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
export const SECTOR3_PAINT: readonly string[] = buildPaintGrid();

/**
 * Decorative foreground depth: ice-capped clumps rising from the bottom edge,
 * autotiled through the SAME tiler and rendered purely visually in front of the
 * player. Mirrors Sectors 1 & 2's foreground pass (painted as a SURFACE biome so
 * the exposed top caps with an ice surface tile rather than a floating raw slab).
 */
const FOREGROUND_CLUMPS: ReadonlyArray<readonly [number, number]> = [
  [7, 14],
  [20, 28],
  [39, 47],
  [54, 62],
];
const FOREGROUND_CLUMP_TOP = SECTOR3_HEIGHT - 2;

function buildForegroundPaint(): string[] {
  const rows: string[][] = Array.from({ length: SECTOR3_HEIGHT }, () =>
    new Array<string>(SECTOR3_WIDTH).fill(PAINT.AIR),
  );
  for (const [start, end] of FOREGROUND_CLUMPS) {
    for (let col = start; col <= end && col < SECTOR3_WIDTH; col++) {
      for (let row = FOREGROUND_CLUMP_TOP; row < SECTOR3_HEIGHT; row++) rows[row][col] = PAINT.ICE;
    }
  }
  return rows.map((row) => row.join(''));
}

/** The foreground paint grid: autotile it for render ids (visual only). */
export const SECTOR3_FOREGROUND_PAINT: readonly string[] = buildForegroundPaint();

// --- level bundle ---------------------------------------------------------

/** Sector 3 packaged as the generic LevelDef the loader consumes. */
export const sector3: LevelDef = {
  id: 'sector3',
  sector: 3,
  // FINAL sector: a null `next` makes its exit the run-end seam (fires the single
  // ARCADE_SCORE via Game.endRun). Wiring a later sector is just changing this.
  next: null,
  width: SECTOR3_WIDTH,
  height: SECTOR3_HEIGHT,
  spawn: { x: SECTOR3_SPAWN.x, y: SECTOR3_SPAWN.y },
  theme: THEMES.teal, // blue sky (the family Sector 1 vacates for forest/green)
  paint: SECTOR3_PAINT,
  foregroundPaint: SECTOR3_FOREGROUND_PAINT,
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
