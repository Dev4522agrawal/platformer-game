/**
 * Base class for everything that lives in the world and moves over time.
 *
 * Position is double-buffered: each subclass calls `beginStep()` at the top of
 * update() to snapshot prev -> current, so render() can interpolate between the
 * two by `alpha` (the leftover accumulator fraction). This decouples the fixed
 * simulation rate from the variable display rate, keeping motion smooth.
 */
export abstract class Entity {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  w = 0;
  h = 0;

  /** Advance one fixed step. Implementations should call beginStep() first. */
  abstract update(dt: number): void;

  /** Draw the entity. Default is a no-op; subclasses override. */
  render(_ctx: CanvasRenderingContext2D, _alpha: number, _camX: number, _camY: number): void {
    /* no-op by default */
  }

  /** Release any owned resources. Default is a no-op. */
  destroy(): void {
    /* no-op by default */
  }

  /** Snapshot the current position as the previous one for interpolation. */
  protected beginStep(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Interpolated draw position for the given render alpha. */
  protected drawPos(alpha: number): { x: number; y: number } {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      y: this.prevY + (this.y - this.prevY) * alpha,
    };
  }
}
