/**
 * Shared level-authoring types: the declarative shape every sector exposes and
 * the generic loader (Game.loadScene) consumes. A level is DATA — paint grids +
 * object arrays — mapped onto the existing player / camera / pickup / platform /
 * door / switch systems. No engine coupling here.
 *
 * Authoring rules (unchanged from Sector 1): terrain comes from the paint grid
 * (autotiler) + a derived occupancy mask (collision); every tile id placed in a
 * level/decor array MUST come from the TILE_DICTIONARY via the structure macros
 * (door/flag/waterColumn/cloud) or documented ids.
 */

import type { BackgroundTheme } from '../engine/Background';
import type { Placement } from '../world/structures';

/** A tile-grid coordinate. */
export interface Cell {
  col: number;
  row: number;
}

/** A patrol-drone spawn: a column, the surface row its feet rest on, and a facing. */
export interface DroneSpec extends Cell {
  dir: 1 | -1;
}

/** One-way platform skins (dictionary §4.16 wood, §4.17 floating tiles). */
export type OneWayArt = 'wood' | 'floatPlain' | 'floatDirt';

/** A one-way platform run, `wTiles` wide, anchored at its top-left, with a skin. */
export interface OneWaySpec extends Cell {
  wTiles: number;
  art: OneWayArt;
}

/** A falling platform run, `wTiles` wide, anchored at its top-left. */
export interface FallingSpec extends Cell {
  wTiles: number;
}

/**
 * A switch-controlled vertical lift. Rests at `lowRow` until its switch fires,
 * then rises to `highRow` (same column). `id` links it to a SwitchSpec target.
 */
export interface MovingSpec {
  id: string;
  col: number;
  lowRow: number;
  highRow: number;
  wTiles: number;
  speed: number;
}

/** A key-locked door, `hTiles` tall, opened only by the held key. */
export interface LockedDoorSpec {
  id: string;
  col: number;
  row: number;
  hTiles: number;
}

/** Switch skins driven by the one Interactable primitive. */
export type SwitchKind = 'lever' | 'button';
/** Hold-to-fire behaviour (maps to Interactable's InteractMode). */
export type SwitchMode = 'oneshot' | 'toggle' | 'momentary';

/** A lever/button that drives one moving platform (via the activatable registry). */
export interface SwitchSpec {
  kind: SwitchKind;
  col: number;
  row: number;
  mode: SwitchMode;
  holdTime: number;
  targetId: string;
}

/** The sector exit door (kind 'exit'); touching it ends the run. */
export interface ExitSpec {
  col: number;
  row: number;
  hTiles: number;
}

/**
 * A complete, self-contained level. The generic loader builds the scene purely
 * from these fields — no per-sector code lives in the Game.
 */
export interface LevelDef {
  /** Registry key / stable id (e.g. 'sector1'). */
  readonly id: string;
  /** Sector number, surfaced in the score snapshot + ARCADE_SCORE envelope. */
  readonly sector: number;
  /**
   * The level key to load when this sector's exit door is reached. A non-null
   * `next` makes the exit a SECTOR TRANSITION (carry run-state, load next); a
   * null/absent `next` marks this as the FINAL sector, whose exit ends the run.
   * Data-driven on purpose: wiring Sector 5 later is just `sector2.next='sector5'`.
   */
  readonly next: string | null;
  readonly width: number;
  readonly height: number;
  /** Spawn point in world pixels (player feet on the surface). */
  readonly spawn: { readonly x: number; readonly y: number };
  /** Per-level backdrop theme (Sector 1 = teal sky, Sector 2 = earthy cave). */
  readonly theme: BackgroundTheme;
  /** Terrain paint grid (chars '.'/'G'/'S'/'I'/'D') -> autotiler render ids. */
  readonly paint: readonly string[];
  /** Decorative foreground depth paint grid (visual only, no collision). */
  readonly foregroundPaint: readonly string[];
  readonly coins: ReadonlyArray<Cell>;
  readonly diamond: Cell | null;
  readonly key: Cell | null;
  readonly checkpoint: Cell;
  readonly exit: ExitSpec;
  readonly spikes: ReadonlyArray<Cell>;
  readonly drones: ReadonlyArray<DroneSpec>;
  readonly oneWayPlatforms: ReadonlyArray<OneWaySpec>;
  readonly movingPlatforms: ReadonlyArray<MovingSpec>;
  readonly fallingPlatforms: ReadonlyArray<FallingSpec>;
  readonly lockedDoors: ReadonlyArray<LockedDoorSpec>;
  readonly switches: ReadonlyArray<SwitchSpec>;
  /** Foreground decor (over terrain, no collision): doors/flags/waterfalls/etc. */
  readonly decor: ReadonlyArray<Placement>;
  /** Sky decor (behind terrain, no collision): clouds. */
  readonly skyDecor: ReadonlyArray<Placement>;
}
