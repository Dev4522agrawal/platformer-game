/**
 * Keys whose default browser behavior we suppress WHILE the game is focused.
 * Anything not in this set is left untouched so the host page keeps working
 * (e.g. tabbing away, browser shortcuts) when the player isn't in the game.
 */
const GAME_KEYS: ReadonlySet<string> = new Set([
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Escape',
  'KeyP',
  'KeyR',
  'KeyG',
  'KeyH',
  'KeyB',
  'KeyK',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Enter',
]);

/**
 * Focus-scoped keyboard input.
 *
 * - State lives in a Set<string> of KeyboardEvent.code values.
 * - Listeners are bound to the game container, NOT window/document, so input
 *   never leaks to or from the host page.
 * - Keys are only recorded / prevented while the container (or a descendant)
 *   actually has focus.
 */
export class Input {
  private readonly container: HTMLElement;
  private readonly pressed = new Set<string>();

  // Bound once so add/removeEventListener reference identical handlers.
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(container: HTMLElement) {
    this.container = container;

    this.onKeyDown = (e) => {
      if (!this.isFocused()) return;
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        this.pressed.add(e.code);
      }
    };

    this.onKeyUp = (e) => {
      // Always clear on keyup, even if focus state changed mid-press, so a key
      // can never get stuck "down".
      this.pressed.delete(e.code);
      if (this.isFocused() && GAME_KEYS.has(e.code)) {
        e.preventDefault();
      }
    };

    // If the container loses focus, drop all held keys to avoid stuck input.
    this.onBlur = () => {
      this.pressed.clear();
    };
  }

  /** Attach listeners to the container. */
  attach(): void {
    this.container.addEventListener('keydown', this.onKeyDown);
    this.container.addEventListener('keyup', this.onKeyUp);
    this.container.addEventListener('blur', this.onBlur);
  }

  /** Remove every listener and clear state. Safe to call multiple times. */
  detach(): void {
    this.container.removeEventListener('keydown', this.onKeyDown);
    this.container.removeEventListener('keyup', this.onKeyUp);
    this.container.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
  }

  /** True when the container or one of its descendants holds focus. */
  private isFocused(): boolean {
    const active = document.activeElement;
    return active === this.container || this.container.contains(active);
  }

  /** Is the given KeyboardEvent.code currently held? */
  isDown(code: string): boolean {
    return this.pressed.has(code);
  }
}
