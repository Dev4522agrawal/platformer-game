/**
 * Sector 1 — Surface / Nature. Authored to the TILE_DICTIONARY, rendered through
 * the paint-grid autotiler (src/world/autotiler.ts). This module is DATA ONLY:
 * it owns the terrain paint grid + the object/entity layers and exposes derived
 * helpers (the occupancy mask for collision). The Game wires these into the
 * existing player / camera / pickup systems.
 *
 * Tile-role contract (from TILE_DICTIONARY §3, §4):
 *   - SOLID terrain: only the paint grid (grass tops 0-3/20-23, dirt body). The
 *     occupancy mask below drives collision; the autotiler only picks render ids.
 *   - ONE-WAY: wood platforms (47-50, §4.16) and floating tiles (146/147, §4.17).
 *   - NON-SOLID decor: signs (§4.15), ground accessories (§4.20), the keyhole
 *     block (28, §4.19) and clouds (153-156, §4.22 — BACKGROUND ONLY, never
 *     footing).
 */

import { TILE } from '../core/constants';
import { THEMES } from '../engine/Background';
import { SKIN_SECTOR1 } from '../game/Player';
import { PAINT } from '../world/autotiler';
import { door, flag, waterColumn, cloud, type Placement } from '../world/structures';
import type { LevelDef } from './types';

/** Level grid dimensions in tiles (a real horizontal level: ~2.4 screens wide). */
export const SECTOR1_WIDTH = 64;
export const SECTOR1_HEIGHT = 16;

/** Top row of the main walkable ground; rows GROUND_TOP..HEIGHT-1 are solid body. */
const GROUND_TOP = 13;

/** Pit ranges [startCol, endCol] (inclusive) where the ground drops out. */
const PITS: ReadonlyArray<readonly [number, number]> = [
  [16, 18], // jumpable gap (3 wide)
  [30, 33], // crossed by the wood one-way bridge
  [48, 50], // crossed by a floating-tile step
];

/** A gentle one-tile hill so the start isn't dead flat. */
const MOUND_ROW = 12;
const MOUND_START = 6;
const MOUND_END = 9;

/**
 * Isolated single grass cells -> the autotiler resolves these to thin floating
 * grass platforms (id 0, §4.1). A short reachable climb to the key.
 */
const GRASS_LEDGES: ReadonlyArray<Cell> = [
  { col: 22, row: 10 },
  { col: 24, row: 8 },
];

/** Forced-dirt overhang hung from the top of the screen (cave-mouth depth, §3.3). */
const OVERHANG_TOP = 0;
const OVERHANG_BOTTOM = 6;
const OVERHANG_START = 38;
const OVERHANG_END = 40;

// --- shared shapes --------------------------------------------------------

/** A tile-grid coordinate. */
export interface Cell {
  col: number;
  row: number;
}

/** A non-terrain tile blitted by dictionary id at a cell (no collision). */
export interface DecorTile extends Cell {
  id: number;
}

/** A horizontal one-way platform run, `wTiles` wide, anchored at its top-left. */
export interface PlatformSpec extends Cell {
  wTiles: number;
}

/** Spawn point, in world pixels (feet on the ground-top surface). */
export const SECTOR1_SPAWN = {
  x: 2 * TILE,
  y: GROUND_TOP * TILE - 16, // 16 = player box height
} as const;

// --- collectibles & key (existing pickup logic) ---------------------------

/** Coin face id (animated 151<->152, §4.19); we render the front frame. */
export const COIN_ID = 151;
/** Diamond pickup id (§4.19). */
export const DIAMOND_ID = 67;
/** Key pickup id (§4.19) — sets player.heldKey (HUD shows it). */
export const KEY_ID = 27;

/** Coins along the critical path + over the pits to telegraph the route. */
export const SECTOR1_COINS: ReadonlyArray<Cell> = [
  { col: 5, row: 11 },
  { col: 9, row: 11 },
  { col: 13, row: 11 },
  { col: 17, row: 10 }, // arc over pit 1
  { col: 22, row: 9 }, // over the first grass ledge
  { col: 26, row: 11 },
  { col: 35, row: 11 },
  { col: 44, row: 11 },
  { col: 49, row: 10 }, // over pit 3
];

/** Diamond — the reward at the top of the lever-driven lift detour. */
export const SECTOR1_DIAMOND: Cell = { col: 54, row: 5 };

/** Key pickup, on top of the short grass-ledge climb. */
export const SECTOR1_KEY: Cell = { col: 24, row: 7 };

/** Respawn flag roughly mid-level. */
export const SECTOR1_CHECKPOINT: Cell = { col: 35, row: 12 };

/** Sector exit door (kind 'exit'); touching it completes the sector. */
export const SECTOR1_EXIT = { col: 62, row: 11, hTiles: 2 } as const;

// --- hazards --------------------------------------------------------------

/**
 * Spike traps (id 68, §4.18). Placed on row GROUND_TOP-1 so the sprite sits ON
 * the walking surface; they are damage TRIGGERS, never solid (NOT in the
 * occupancy mask), so the player can run onto them or hop clear.
 *
 * Placements are tuned to the existing movement constants — every spike is
 * avoidable with a reachable jump and none block the critical path:
 *   - a 2-wide strip on flat ground the player hops over (coin at (44,11) above
 *     telegraphs the arc);
 *   - one spike under the optional key-ledge climb, so falling short of a ledge
 *     jump lands on it instead of safe ground (off the critical path).
 */
export const SECTOR1_SPIKES: ReadonlyArray<Cell> = [
  { col: 43, row: GROUND_TOP - 1 }, // jump-over strip (1/2)
  { col: 44, row: GROUND_TOP - 1 }, // jump-over strip (2/2)
  { col: 23, row: GROUND_TOP - 1 }, // under the key-ledge climb (fall-short bite)
];

// --- enemies --------------------------------------------------------------

/** A patrol-drone spawn: a column, the surface row its feet rest on, and a facing. */
export interface DroneSpec extends Cell {
  dir: 1 | -1;
}

/**
 * Patrol Drones (placeholder Characters sprite 15/16, flagged — no enemy tile is
 * documented). Both sit on the main ground (row GROUND_TOP) and pace a flat
 * stretch, auto-reversing at the bounding walls/pits, so neither blocks the
 * critical path — the player can stomp them or simply jump over/past:
 *   - the first, a clear teachable encounter on the opening flat, hemmed between
 *     the starting mound (left wall) and pit 1 (right ledge);
 *   - the second on the next flat, hemmed between pit 1 and pit 2.
 */
export const SECTOR1_DRONES: ReadonlyArray<DroneSpec> = [
  { col: 11, row: GROUND_TOP, dir: 1 }, // teachable first encounter (cols ~10-15)
  { col: 25, row: GROUND_TOP, dir: -1 }, // second encounter (cols ~19-29)
];

// --- one-way platforms ----------------------------------------------------

/** Wood one-way platforms (47-50, §4.16). The bridge across pit 2. */
export const SECTOR1_WOOD_PLATFORMS: ReadonlyArray<PlatformSpec> = [
  { col: 30, row: 12, wTiles: 4 },
];

/** Floating one-way tiles (146 plain / 147 dirt-under, §4.17). */
export interface FloatSpec extends Cell {
  dirt: boolean;
}
export const SECTOR1_FLOATS: ReadonlyArray<FloatSpec> = [
  { col: 49, row: 12, dirt: false }, // stepping stone across pit 3
  { col: 54, row: 6, dirt: true }, // landing for the lift detour
];

// --- lever + lift (optional vertical detour to the diamond) ---------------

/** Switch-controlled vertical lift; the lever drives it between two rows. */
export const SECTOR1_LIFT = {
  id: 'lift',
  col: 52,
  lowRow: 12,
  highRow: 6,
  wTiles: 2,
  speed: 55,
} as const;

/** Lever (64/65/66, §4.18) that toggles the lift. Resting skin = neutral (65). */
export const SECTOR1_LEVER = {
  col: 51,
  row: 12,
  targetId: SECTOR1_LIFT.id,
} as const;

// --- optional side route: button -> falling platform -> key-locked vault --
//
// An entirely OPTIONAL elevated loop sitting ABOVE the spikes. It gates a small
// COIN reward — never the exit: the main ground path is untouched, so a player
// who ignores the whole route still completes the sector. Every actor here is
// pushed into the same platform / door / switch arrays the Game already resets
// on respawn ([Game.respawnPlayer]), so a death cleanly retries the sequence.
//
// Flow (the key is collected earlier, on the grass-ledge climb at col 24):
//   1. On the ground just past the cave overhang, stand on the stowed BRIDGE and
//      hold interact to fire the ground-level BUTTON; the bridge rises, lifting
//      the player up to the corridor (mirrors the lever->lift ride).
//   2. Step onto the FALLING platform poised directly over the spikes — keep
//      moving or it drops you onto them (a real timing beat).
//   3. Reach the LOCKED door; the held key opens it, into a sealed terrain pocket
//      holding the coin reward. Drop back through the door to the ground to leave.

/** Corridor surface row shared by the raised bridge / falling platform / ledge. */
const SIDE_ROW = 8;

/** Registry id linking the button to the bridge it raises. */
export const SIDE_BRIDGE_ID = 'side_bridge';

/** Seconds the player must hold interact to fire the (oneshot) button. */
export const SIDE_BUTTON_HOLD = 0.2;

/**
 * Ground-level button (148/149) beside the stowed bridge. A oneshot: one hold
 * raises the bridge for good (until a respawn re-stows it). Non-solid, so the
 * main-path runner passes through it harmlessly.
 */
export const SIDE_BUTTON = {
  col: 40,
  row: 12, // sits at standing-body height on the ground, in range of the bridge
  targetId: SIDE_BRIDGE_ID,
} as const;

/**
 * Switch-raised bridge: a controlled lift stowed flush in the floor (coplanar
 * with the ground, so it never blocks the run) that rises to the corridor and
 * carries the rider up — exactly like the diamond lift, driven by the button.
 */
export const SIDE_BRIDGE = {
  id: SIDE_BRIDGE_ID,
  col: 41,
  stowedRow: GROUND_TOP, // flush with the ground until the button fires
  raisedRow: SIDE_ROW,
  wTiles: 2,
  speed: 70,
} as const;

/** Falling platform: the timing commitment, poised directly over the spikes. */
export const SIDE_FALL: PlatformSpec = { col: 43, row: SIDE_ROW, wTiles: 2 };

/** Stable one-way landing ledge past the falling platform; the door's footing. */
export const SIDE_LEDGE: PlatformSpec = { col: 45, row: SIDE_ROW, wTiles: 2 };

/** Key-locked door sealing the vault; opens only when the player holds the key. */
export const SIDE_LOCK = {
  id: 'side_lock',
  col: 46,
  row: SIDE_ROW - 1, // 2 tiles tall, blocking the corridor at body height
  hTiles: 2,
} as const;

/** Coins sealed in the vault pocket behind the locked door (the reward). */
export const SIDE_REWARD_COINS: ReadonlyArray<Cell> = [
  { col: 47, row: SIDE_ROW - 1 },
  { col: 48, row: SIDE_ROW - 1 },
];

/**
 * The vault is a SEALED terrain pocket — a solid grass floor + dirt roof painted
 * into the terrain grid — so the locked door is the ONLY entrance: no hop-over
 * (the roof caps it), no drop-in (the roof), and no from-below pop-through (the
 * floor is solid both ways, unlike a one-way platform).
 */
const SIDE_VAULT_FLOOR: ReadonlyArray<Cell> = [
  { col: 47, row: SIDE_ROW },
  { col: 48, row: SIDE_ROW },
];
const SIDE_VAULT_ROOF: ReadonlyArray<Cell> = [
  { col: 46, row: SIDE_ROW - 2 },
  { col: 47, row: SIDE_ROW - 2 },
  { col: 48, row: SIDE_ROW - 2 },
];

// --- decoration -----------------------------------------------------------

/** Single-tile decor that needs no macro (signs §4.15, accessories §4.20, keyhole). */
const SIMPLE_DECOR: ReadonlyArray<DecorTile> = [
  // Signs (§4.15) for wayfinding (sit on ground, bottom open to post).
  { id: 86, col: 6, row: 11 }, // info board (on the mound top)
  { id: 88, col: 12, row: 12 }, // right arrow -> onward
  { id: 88, col: 58, row: 12 }, // right arrow -> exit
  // Ground accessories (§4.20) — ground only, never floating.
  { id: 124, col: 7, row: 11 }, // grass tuft (on the mound)
  { id: 126, col: 14, row: 12 }, // small pine
  { id: 128, col: 26, row: 12 }, // red mushroom
  { id: 125, col: 45, row: 12 }, // tall tuft
  // Keyhole block (28, §4.19) — set-dressing pair for the key.
  { id: 28, col: 28, row: 12 },
];

/**
 * Foreground decor, blitted over the terrain (NO collision). Multi-tile objects
 * come from the structure macros so they expand the dictionary recipe correctly:
 * the visible exit door (§4.12, the exit trigger entity itself is rendered
 * invisibly), the checkpoint flag (§4.14) and a cliffside waterfall (§4.9).
 * Single-tile set-dressing is appended. (The tree decor was cut — its canopy
 * tiles each carry their own outline and can't tile cleanly.)
 */
export const SECTOR1_DECOR: ReadonlyArray<Placement> = [
  ...door(SECTOR1_EXIT.col, SECTOR1_EXIT.row + 1, { windowed: false }),
  ...flag(SECTOR1_CHECKPOINT.col, SECTOR1_CHECKPOINT.row, { poleHeight: 3 }),
  ...waterColumn(39, 7, 6),
  ...SIMPLE_DECOR,
];

/**
 * Sky decor drawn BEHIND the terrain: clouds (153-156, §4.22) via the macro so
 * they are always complete shapes — pure background, never platforms.
 */
export const SECTOR1_SKY_DECOR: ReadonlyArray<Placement> = [
  ...cloud(8, 2, 4), // wide cloud (153 + 155 + 156)
  ...cloud(45, 3, 1), // lone rounded puff (154)
];

// --- derived terrain ------------------------------------------------------

function inPit(col: number): boolean {
  return PITS.some(([start, end]) => col >= start && col <= end);
}

/**
 * Build the terrain paint grid (chars '.'/'G'/'D') from the declarative spec.
 * Generated rather than hand-typed so the geometry stays consistent and tunable.
 */
function buildPaintGrid(): string[] {
  const rows: string[][] = Array.from({ length: SECTOR1_HEIGHT }, () =>
    new Array<string>(SECTOR1_WIDTH).fill(PAINT.AIR),
  );

  // Main ground body (solid below the surface row), minus the pits.
  for (let col = 0; col < SECTOR1_WIDTH; col++) {
    if (inPit(col)) continue;
    for (let row = GROUND_TOP; row < SECTOR1_HEIGHT; row++) rows[row][col] = PAINT.GRASS;
  }
  // Gentle starting mound.
  for (let col = MOUND_START; col <= MOUND_END; col++) rows[MOUND_ROW][col] = PAINT.GRASS;
  // Isolated grass ledges (autotiler resolves to thin floating platforms).
  for (const { col, row } of GRASS_LEDGES) rows[row][col] = PAINT.GRASS;
  // Forced-dirt overhang hung from the top (cave-mouth depth).
  for (let col = OVERHANG_START; col <= OVERHANG_END; col++) {
    for (let row = OVERHANG_TOP; row <= OVERHANG_BOTTOM; row++) rows[row][col] = PAINT.DIRT;
  }
  // Side-route vault: a sealed pocket (grass floor + dirt roof) the locked door
  // is the only way into.
  for (const { col, row } of SIDE_VAULT_FLOOR) rows[row][col] = PAINT.GRASS;
  for (const { col, row } of SIDE_VAULT_ROOF) rows[row][col] = PAINT.DIRT;

  return rows.map((row) => row.join(''));
}

/** The terrain paint grid: feed to the autotiler for render ids. */
export const SECTOR1_PAINT: readonly string[] = buildPaintGrid();

/**
 * Occupancy mask (1 = solid, 0 = air) for collision. Solidity is derived from
 * the paint grid alone — every non-air paint cell is solid terrain; objects
 * (decor/clouds/collectibles) contribute nothing here, one-way platforms resolve
 * separately as Solids.
 */
export function buildOccupancyMask(): number[][] {
  return SECTOR1_PAINT.map((line) =>
    [...line].map((ch) => (ch === PAINT.AIR ? 0 : 1)),
  );
}

// --- decorative foreground depth (NO collision) ---------------------------

/**
 * Land masses that rise from the bottom screen edge and overlap the play surface
 * for depth (§3.2). A SEPARATE paint grid run through the SAME autotiler so edges
 * stay correct; rendered purely visually in front of the player. Each clump is a
 * 2-tile-tall grass mound at the very bottom rows.
 */
const FOREGROUND_CLUMPS: ReadonlyArray<readonly [number, number]> = [
  [1, 7],
  [19, 27],
  [40, 47],
  [55, 63],
];
const FOREGROUND_CLUMP_TOP = SECTOR1_HEIGHT - 2;

function buildForegroundPaint(): string[] {
  const rows: string[][] = Array.from({ length: SECTOR1_HEIGHT }, () =>
    new Array<string>(SECTOR1_WIDTH).fill(PAINT.AIR),
  );
  for (const [start, end] of FOREGROUND_CLUMPS) {
    for (let col = start; col <= end && col < SECTOR1_WIDTH; col++) {
      for (let row = FOREGROUND_CLUMP_TOP; row < SECTOR1_HEIGHT; row++) rows[row][col] = PAINT.GRASS;
    }
  }
  return rows.map((row) => row.join(''));
}

/** The foreground paint grid: autotile it for render ids (visual only). */
export const SECTOR1_FOREGROUND_PAINT: readonly string[] = buildForegroundPaint();

// --- level bundle ---------------------------------------------------------

/**
 * Sector 1 packaged as the generic LevelDef the loader consumes. This is purely
 * a re-shaping of the consts above into the shared registry shape — every value
 * is the same authored data, just gathered so the Game needs no Sector-1-specific
 * code. The one-way platforms fold in the wood bridge, the floating stepping
 * tiles AND the side-route landing ledge; the moving platforms fold in the
 * diamond lift and the button-raised bridge.
 */
export const sector1: LevelDef = {
  id: 'sector1',
  sector: 1,
  next: 'sector2',
  width: SECTOR1_WIDTH,
  height: SECTOR1_HEIGHT,
  spawn: { x: SECTOR1_SPAWN.x, y: SECTOR1_SPAWN.y },
  theme: THEMES.green, // forest/green (Sector 3 now takes the blue/teal sky)
  playerSkin: SKIN_SECTOR1,
  paint: SECTOR1_PAINT,
  foregroundPaint: SECTOR1_FOREGROUND_PAINT,
  coins: [...SECTOR1_COINS, ...SIDE_REWARD_COINS],
  diamond: SECTOR1_DIAMOND,
  key: SECTOR1_KEY,
  // Keyhole block (col 28): carrying the key here spawns the heavy enemy.
  keyhole: { col: 28, row: 12 },
  checkpoint: SECTOR1_CHECKPOINT,
  exit: { col: SECTOR1_EXIT.col, row: SECTOR1_EXIT.row, hTiles: SECTOR1_EXIT.hTiles },
  spikes: SECTOR1_SPIKES,
  drones: SECTOR1_DRONES,
  oneWayPlatforms: [
    ...SECTOR1_WOOD_PLATFORMS.map((p) => ({ col: p.col, row: p.row, wTiles: p.wTiles, art: 'wood' as const })),
    ...SECTOR1_FLOATS.map((f) => ({
      col: f.col,
      row: f.row,
      wTiles: 1,
      art: f.dirt ? ('floatDirt' as const) : ('floatPlain' as const),
    })),
    { col: SIDE_LEDGE.col, row: SIDE_LEDGE.row, wTiles: SIDE_LEDGE.wTiles, art: 'wood' as const },
  ],
  movingPlatforms: [
    {
      id: SECTOR1_LIFT.id,
      col: SECTOR1_LIFT.col,
      lowRow: SECTOR1_LIFT.lowRow,
      highRow: SECTOR1_LIFT.highRow,
      wTiles: SECTOR1_LIFT.wTiles,
      speed: SECTOR1_LIFT.speed,
    },
    {
      id: SIDE_BRIDGE.id,
      col: SIDE_BRIDGE.col,
      lowRow: SIDE_BRIDGE.stowedRow,
      highRow: SIDE_BRIDGE.raisedRow,
      wTiles: SIDE_BRIDGE.wTiles,
      speed: SIDE_BRIDGE.speed,
    },
  ],
  fallingPlatforms: [{ col: SIDE_FALL.col, row: SIDE_FALL.row, wTiles: SIDE_FALL.wTiles }],
  lockedDoors: [{ id: SIDE_LOCK.id, col: SIDE_LOCK.col, row: SIDE_LOCK.row, hTiles: SIDE_LOCK.hTiles }],
  switches: [
    {
      kind: 'lever',
      col: SECTOR1_LEVER.col,
      row: SECTOR1_LEVER.row,
      mode: 'toggle',
      holdTime: 0.25,
      targetId: SECTOR1_LEVER.targetId,
    },
    {
      kind: 'button',
      col: SIDE_BUTTON.col,
      row: SIDE_BUTTON.row,
      mode: 'oneshot',
      holdTime: SIDE_BUTTON_HOLD,
      targetId: SIDE_BUTTON.targetId,
    },
    // Vault lever on the corridor ledge: now the SOLE opener of the vault door
    // (the key no longer opens it). One hold latches it open.
    {
      kind: 'lever',
      col: SIDE_LEDGE.col,
      row: SIDE_ROW - 1,
      mode: 'oneshot',
      holdTime: 0.25,
      targetId: SIDE_LOCK.id,
      effect: 'openDoor',
    },
  ],
  decor: SECTOR1_DECOR,
  skyDecor: SECTOR1_SKY_DECOR,
};
