/**
 * Level registry: the single seam the Game loads sectors through. `loadScene`
 * takes a key, looks the LevelDef up here, and builds the scene generically. This
 * is what sector progression (1 -> 2 -> 5) will reuse later — adding a level is
 * adding it to LEVELS.
 */

import type { LevelDef } from './types';
import { sector1 } from './sector1';
import { sector2 } from './sector2';
import { sector3 } from './sector3';

/** Every authored level, keyed by its stable id. */
export const LEVELS = { sector1, sector2, sector3 } as const satisfies Record<string, LevelDef>;

/** A valid level key (e.g. 'sector1' | 'sector2' | 'sector3'). */
export type LevelKey = keyof typeof LEVELS;

/** The level a fresh run starts on (progression is wired separately later). */
export const DEFAULT_LEVEL: LevelKey = 'sector1';

/**
 * The next sector to load after `key`'s exit door, or null if `key` is the final
 * sector (its exit ends the run). Centralises the `LevelDef.next` (a loose string)
 * down to a validated, strongly-typed `LevelKey`, so the chain stays data-driven
 * (set `next` in the sector files) while callers never hand-cast.
 */
export function nextLevelKey(key: LevelKey): LevelKey | null {
  const next = LEVELS[key].next;
  return next && next in LEVELS ? (next as LevelKey) : null;
}

/**
 * Resolve the starting level from a URL query string for isolated testing:
 *   ?level=sector2   (exact key)   or   ?sector=2   (sector number)
 * Anything unrecognised falls back to DEFAULT_LEVEL.
 */
export function resolveLevelKey(search: string): LevelKey {
  const params = new URLSearchParams(search);

  const level = params.get('level');
  if (level && level in LEVELS) return level as LevelKey;

  const sector = params.get('sector');
  if (sector) {
    const key = `sector${sector}`;
    if (key in LEVELS) return key as LevelKey;
  }

  return DEFAULT_LEVEL;
}
