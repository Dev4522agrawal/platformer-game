/** Stable identifier the arcade host uses to attribute scores to this game. */
export const GAME_ID = 'sector-runner';

/** Arbitrary metadata payload sent alongside a score. */
export type ScoreMeta = Record<string, unknown>;

/**
 * The single score-out seam to the arcade host.
 *
 * This is the ONLY place that posts a score to the parent frame. Gameplay code
 * (later milestones) will call this when a run ends. It is intentionally NOT
 * called anywhere yet — the seam just needs to exist and be correct.
 *
 * Note: targetOrigin is '*' for now because the host origin is not yet known.
 * Lock this down to the real arcade origin once it is finalized.
 */
export function dispatchScore(score: number, meta: ScoreMeta = {}): void {
  window.parent.postMessage(
    { type: 'ARCADE_SCORE', gameId: GAME_ID, score, meta },
    '*',
  );
}
