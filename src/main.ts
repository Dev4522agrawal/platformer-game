import './style.css';
import { Game } from './core/Game';
import { shouldMountTestScene, mountAutotilerTestScene } from './world/testScene';

// Expose for manual lifecycle poking from the dev console (start/pause/destroy).
// Harmless in production; the arcade host drives these via its own integration.
declare global {
  interface Window {
    sectorRunner?: Game;
  }
}

const root = document.getElementById('game-root');
if (!root) {
  throw new Error('#game-root element not found');
}

// Debug-only: `?debug=autotiler` replaces the normal view with the autotiler
// test scene (inert otherwise). Never the default; see src/world/testScene.ts.
if (shouldMountTestScene()) {
  mountAutotilerTestScene(root);
} else {
  mountGame(root);
}

function mountGame(container: HTMLElement): void {
  const game = new Game();

  // Render the static MENU. We deliberately do NOT auto-start: the loop only runs
  // after the player clicks START (or presses Enter) — mirroring the arcade
  // cover + START flow.
  game.init(container);

  window.sectorRunner = game;
}
