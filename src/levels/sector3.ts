/**
 * Sector 3 — Ice Caverns (the FINAL sector). Authored to the TILE_DICTIONARY and
 * rendered through the SAME paint-grid autotiler + object layers as Sectors 1 & 2;
 * it adds NO new mechanics. The cavern identity comes from the ICE biome surfaces
 * (paint char `I`) plus an ENCLOSING forced-dirt (`D`) ceiling and a cave-mouth
 * overhang at the entrance. Decorative WATER and a PIPE network dress the ice — all
 * set-dressing, NO collision.
 *
 * DISTINCT FROM SECTOR 2 (intentionally re-paced, same biome/mechanics): Sector 2
 * is three evenly-spaced single pits with a late key climb. Sector 3 opens with a
 * float-stepping-stone pit, runs a longer mid chamber guarded by a LARGER enemy,
 * pushes the checkpoint past the bridge, moves the key climb earlier/taller, and
 * ends on a 3-step ascent staircase. The optional vault side-route (cols 40-49) is
 * the only piece kept structurally identical, since it is the shared diamond beat.
 *
 * Reachability: tuned to DEFAULT_MOVEMENT (src/game/movementConfig.ts). Derived
 * jump arc — jumpVelocity 420, gravityAscendHeld 900 -> max rise ≈ 5.4 tiles; a
 * same-height flat hop clears well past 4 tiles. Every critical gap ≤4 tiles and
 * every upward step ≤3 tiles; completable IGNORING the key/vault side-route.
 *
 * Tile-role contract (identical to Sectors 1 & 2): solid terrain comes from the
 * paint grid only; one-way platforms, spikes, enemies, the lever->vault door and
 * the checkpoint reuse the existing entity systems; multi-tile decor comes from
 * the structure macros. Animated decor pairs loop through the TileAnimator.
 */

import { TILE } from '../core/constants';
import { THEMES } from '../engine/Background';
import { SKIN_SECTOR3 } from '../game/Player';
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

/**
 * Floor pits [startCol, endCol] (inclusive). Re-paced vs Sector 2: a wide opening
 * pit crossed by stepping stones, a bridged mid pit, and a tighter end pit.
 */
const PITS: ReadonlyArray<readonly [number, number]> = [
  [10, 13], // wide opening gap, crossed by a 2-wide float stepping stone
  [33, 36], // crossed by the wood one-way bridge
  [50, 52], // jumpable gap (3 wide) with a stepping float
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
  { col: 7, row: 11 }, // chamber 1
  { col: 11, row: 10 }, // arc over the pit-1 stepping stones
  { col: 18, row: 11 }, // mid chamber
  { col: 29, row: 10 }, // over the chamber spike strip (telegraph the hop)
  { col: 35, row: 11 }, // over the pit-2 bridge
  { col: 39, row: 11 }, // past the checkpoint
  { col: 43, row: 11 }, // over the vault-route spike strip (telegraph the hop)
  { col: 48, row: 7 }, // sealed in the vault (beside the diamond)
  { col: 51, row: 10 }, // arc over pit 3
  { col: 56, row: 9 }, // on the ascent toward the exit
];

/** Diamond — the reward sealed in the locked vault pocket. */
const DIAMOND: Cell = { col: 47, row: 7 };

/** Key pickup, atop the (earlier, taller) floating-tile climb. */
const KEY: Cell = { col: 22, row: 8 };

/** Mid-level respawn flag — pushed PAST the bridge (vs Sector 2's pre-bridge flag). */
const CHECKPOINT: Cell = { col: 38, row: SURFACE_ROW };

/** Sector exit door (kind 'exit') on the exit plateau; touching it ends the run. */
const EXIT = { col: 61, row: PLATEAU_SURFACE - 2, hTiles: 2 } as const;

// --- hazards --------------------------------------------------------------

/**
 * Spike traps (id 68, §4.18) on the surface row — damage TRIGGERS, never solid.
 * Two jump-over strips on the critical path (each telegraphed by a coin above);
 * one bites a fall-short under the key climb (off the critical path).
 */
const SPIKES: ReadonlyArray<Cell> = [
  { col: 21, row: SURFACE_ROW }, // fall-short bite under the key climb (off-path)
  { col: 29, row: SURFACE_ROW }, // chamber jump-over strip (1/2)
  { col: 30, row: SURFACE_ROW }, // chamber jump-over strip (2/2)
  { col: 43, row: SURFACE_ROW }, // vault-route jump-over strip (1/2)
  { col: 44, row: SURFACE_ROW }, // vault-route jump-over strip (2/2)
];

// --- enemies --------------------------------------------------------------

/**
 * Patrol enemies. A small drone (15/16) opens chamber 1; the LARGER enemy (18/19,
 * bigger hurtbox) guards the long mid chamber to raise the difficulty; a second
 * small drone paces the flat before the vault. All stompable / jump-past-able,
 * none block the critical path.
 */
const DRONES: ReadonlyArray<DroneSpec> = [
  { col: 7, row: GROUND_TOP, dir: 1 }, // chamber 1 (hemmed by the mouth wall + pit 1)
  { col: 28, row: GROUND_TOP, dir: -1, kind: 'large' }, // mid-chamber guard (larger)
  { col: 46, row: GROUND_TOP, dir: 1 }, // flat before the vault / pit 3
];

// --- one-way platforms ----------------------------------------------------

/**
 * Floating tiles (146/147, §4.17) + a wood bridge (47-50, §4.16). The floats form
 * the pit-1 stepping stones, the (earlier) key climb, the vault-corridor steps,
 * the pit-3 stepping stone and a 3-step final ascent staircase; the wood spans
 * pit 2 and the vault's landing ledge.
 */
const ONE_WAY: ReadonlyArray<OneWaySpec> = [
  // Pit-1 stepping stones (mid-pit footing).
  { col: 11, row: 12, wTiles: 2, art: 'floatPlain' },
  // Key climb (earlier + taller than Sector 2's).
  { col: 20, row: 11, wTiles: 1, art: 'floatDirt' },
  { col: 22, row: 9, wTiles: 1, art: 'floatDirt' },
  // Wood bridge across pit 2.
  { col: 33, row: 12, wTiles: 4, art: 'wood' },
  // Vault corridor steps up to row 8 (shared diamond beat — kept).
  { col: 40, row: 10, wTiles: 1, art: 'floatDirt' },
  { col: 42, row: 8, wTiles: 1, art: 'floatDirt' },
  // Stable wood landing ledge past the falling platform (also the door footing).
  { col: 45, row: 8, wTiles: 2, art: 'wood' },
  // Pit-3 stepping stone.
  { col: 51, row: 12, wTiles: 1, art: 'floatPlain' },
  // Final ascent: a 3-step staircase up to the exit plateau.
  { col: 54, row: 11, wTiles: 1, art: 'floatDirt' },
  { col: 56, row: 10, wTiles: 1, art: 'floatDirt' },
  { col: 58, row: 9, wTiles: 1, art: 'floatDirt' },
];

// --- falling platform (vault commitment) ----------------------------------

/** Falling platform poised over the vault-route spike strip: keep moving or drop. */
const FALL: FallingSpec = { col: 43, row: 8, wTiles: 2 };

// --- key-locked vault -----------------------------------------------------

/** Vault corridor surface row (shared by the float steps, falling platform, ledge). */
const VAULT_ROW = 8;

/** Vault door; now opened SOLELY by the vault lever (the key no longer opens it). */
const VAULT_LOCK: LockedDoorSpec = { id: 's3_vault', col: 46, row: VAULT_ROW - 1, hTiles: 2 };

/**
 * The vault is a SEALED terrain pocket (forced-dirt floor + roof + right wall) so
 * the door is the ONLY entrance. The landing ledge (col 45-46) provides footing
 * through the doorway, exactly like Sectors 1 & 2.
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

// --- switches & moving platforms ------------------------------------------
// No moving lifts. The ONE switch is the vault lever (on the corridor ledge):
// it is now the SOLE opener of the vault door (the key no longer opens it).

const MOVING: ReadonlyArray<MovingSpec> = [];
const SWITCHES: ReadonlyArray<SwitchSpec> = [
  {
    kind: 'lever',
    col: 45, // on the wood landing ledge beside the vault door
    row: VAULT_ROW - 1,
    mode: 'oneshot',
    holdTime: 0.25,
    targetId: VAULT_LOCK.id,
    effect: 'openDoor',
  },
];

// --- decorative water (NO collision) --------------------------------------

/** Animated water-surface waves (33 <-> 53, §4.9) at the pit floors (icy pools). */
const WATER_WAVES: ReadonlyArray<Placement> = [
  { id: 33, col: 12, row: 13 }, // pit-1 pool
  { id: 33, col: 13, row: 13 },
  { id: 33, col: 34, row: 13 }, // pit-2 pool, beneath the wood bridge
  { id: 33, col: 35, row: 13 },
];

// --- decoration -----------------------------------------------------------

/** Single-tile decor needing no macro (arrows §4.15, keyhole §4.19, snow §4.20). */
const SIMPLE_DECOR: ReadonlyArray<Placement> = [
  { id: 88, col: 4, row: PLATEAU_SURFACE - 1 }, // right arrow -> into the cave
  { id: 88, col: 31, row: SURFACE_ROW }, // right arrow -> onward
  { id: 28, col: 25, row: SURFACE_ROW }, // keyhole block (heavy-enemy spawn point)
  { id: 144, col: 7, row: SURFACE_ROW }, // snow tuft (cave floor)
  { id: 145, col: 18, row: SURFACE_ROW }, // snowman
  { id: 144, col: 54, row: SURFACE_ROW }, // snow tuft (ascent base)
];

/**
 * Foreground decor blitted over the terrain (NO collision): the exit door macro,
 * the checkpoint flag, a cliffside waterfall pouring into pit 1, the animated icy
 * pool waves and a blue pipe network threaded through the cavern as set-dressing.
 */
const DECOR: ReadonlyArray<Placement> = [
  ...door(EXIT.col, EXIT.row + 1, { windowed: false }),
  ...flag(CHECKPOINT.col, CHECKPOINT.row, { poleHeight: 3 }),
  ...waterColumn(10, 5, 9), // waterfall cascading into the pit-1 chasm (decorative)
  ...WATER_WAVES,
  ...pipeV(28, 5, 3), // vertical pipe hung from the cave ceiling
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
 * Build the terrain paint grid ('.'/'I'/'D') from the declarative spec. Surfaces
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
 * player. Painted as a SURFACE biome so the exposed top caps with an ice surface
 * tile rather than a floating raw slab.
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
  // ARCADE_SCORE via Game.endRun).
  next: null,
  width: SECTOR3_WIDTH,
  height: SECTOR3_HEIGHT,
  spawn: { x: SECTOR3_SPAWN.x, y: SECTOR3_SPAWN.y },
  theme: THEMES.teal, // blue sky (the family Sector 1 vacates for forest/green)
  playerSkin: SKIN_SECTOR3,
  paint: SECTOR3_PAINT,
  foregroundPaint: SECTOR3_FOREGROUND_PAINT,
  coins: COINS,
  diamond: DIAMOND,
  key: KEY,
  // Keyhole block (col 25): carrying the key here spawns the heavy enemy.
  keyhole: { col: 25, row: SURFACE_ROW },
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
