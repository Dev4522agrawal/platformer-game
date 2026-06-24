/**
 * Frame-driven sprite animation. Each frame holds a sheet tile `id` and a
 * `duration` measured in fixed steps (frames @60). One update() advances exactly
 * one tick, so callers drive it from the fixed-step update loop.
 */
export interface AnimFrame {
  id: number;
  duration: number;
}

export class SpriteAnimator {
  private readonly frames: readonly AnimFrame[];
  private readonly loop: boolean;
  private index = 0;
  private ticks = 0;

  constructor(frames: readonly AnimFrame[], loop = true) {
    this.frames = frames;
    this.loop = loop;
  }

  /** Advance one fixed step, moving to the next frame when the current expires. */
  update(): void {
    if (this.frames.length === 0) return;
    this.ticks++;
    if (this.ticks >= this.frames[this.index].duration) {
      this.ticks = 0;
      if (this.index < this.frames.length - 1) {
        this.index++;
      } else if (this.loop) {
        this.index = 0;
      }
    }
  }

  /** Sheet tile id of the current frame (0 if there are no frames). */
  currentId(): number {
    return this.frames[this.index]?.id ?? 0;
  }

  /** Rewind to the first frame. */
  reset(): void {
    this.index = 0;
    this.ticks = 0;
  }
}
