/**
 * Scoring model for a single sector run.
 *
 * Deliberately small for the V1 slice: a flat per-pickup value plus a time
 * bonus that decays each second. All four knobs live at the top so the feel can
 * be tuned without hunting through the logic.
 *
 * NOTE: an efficiency / no-death multiplier is a LATER step — when it lands it
 * slots in at the marked line in computeScore().
 */

/** Points awarded per coin collected. */
export const COIN_POINTS = 100;

/** Points awarded for the (single) diamond. */
export const DIAMOND_POINTS = 500;

/** Maximum time bonus, awarded for an instant clear. */
export const TIME_BONUS_CAP = 2000;

/** Points shaved off the time bonus for each whole second elapsed. */
export const TIME_PENALTY_PER_SEC = 10;

/** Tally of what a run collected, plus the derived total. */
export interface RunResult {
  coins: number;
  diamonds: number;
  elapsedSeconds: number;
  timeBonus: number;
  score: number;
}

/** Time bonus for a given elapsed duration, floored at zero. */
export function timeBonus(elapsedSeconds: number): number {
  return Math.max(0, TIME_BONUS_CAP - Math.floor(elapsedSeconds) * TIME_PENALTY_PER_SEC);
}

/**
 * Compute the run tally (pure: no side effects). A clean clear earns the time
 * bonus; a game-over keeps only the accumulated pickup score (pass
 * `includeTimeBonus = false`).
 */
export function computeScore(
  coins: number,
  diamonds: number,
  elapsedSeconds: number,
  includeTimeBonus = true,
): RunResult {
  const bonus = includeTimeBonus ? timeBonus(elapsedSeconds) : 0;
  // <-- efficiency / no-death multiplier would multiply the line below here.
  const score = coins * COIN_POINTS + diamonds * DIAMOND_POINTS + bonus;
  return { coins, diamonds, elapsedSeconds, timeBonus: bonus, score };
}
