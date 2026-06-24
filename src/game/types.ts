/**
 * Shared structural interfaces for the interactable system (milestone 5b).
 *
 * `Activatable` is anything a switch can drive (doors, switch-controlled
 * platforms). `Solid` is anything the player's collision pass resolves against
 * (platforms and closed doors) — a superset of the 5a platform shape, so the
 * existing resolve logic works unchanged against arbitrary AABBs.
 */

/** Something a switch/lever/button can turn on or off, keyed by id. */
export interface Activatable {
  id: string;
  setActive(on: boolean): void;
}

/** An AABB the player collides with. `oneWay` marks cloud-style floors. */
export interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Movement applied this fixed step (for riding); 0 for static solids. */
  deltaX: number;
  deltaY: number;
  /** True for one-way floors (catch from above only). */
  oneWay: boolean;
  /** Discriminator for debugging/skins; not used by the resolve math. */
  kind: string;
  /** Whether to collide right now (e.g. open door / gone platform => false). */
  isSolid(): boolean;
  /** Optional: fired once when the player lands on top (falling platforms). */
  onLanded?(): void;
}
