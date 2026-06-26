/**
 * Tiny typed wrapper over localStorage for persisted progress.
 *
 * Every access is wrapped in try/catch: private-browsing mode and disabled
 * storage throw on access, and that MUST NOT crash the game — a failed read
 * falls back to 0 and a failed write is silently dropped (the run still ends
 * cleanly, it just won't persist). All keys are `sr_`-prefixed per the arcade
 * contract; add more constants here as more progress needs persisting.
 */

/** Persisted best score across runs. */
const STORAGE_KEY = 'sr_best_score';

/** Read the stored best score, or 0 if absent/unparseable/storage unavailable. */
export function loadBestScore(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Persist a new best score. Silently no-ops if storage is unavailable. */
export function saveBestScore(score: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    // Storage disabled (private mode / quota): keep playing without persistence.
  }
}
