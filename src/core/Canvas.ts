/** Fixed internal design resolution. All drawing happens at this size. */
export const DESIGN_WIDTH = 480;
export const DESIGN_HEIGHT = 270;

/**
 * Owns the <canvas> and its scaling.
 *
 * The backing buffer is sized to DESIGN_WIDTH x DESIGN_HEIGHT multiplied by the
 * devicePixelRatio so it stays crisp on high-DPI screens, while the CSS box is
 * letterboxed/pillarboxed to fit the container preserving the 16:9 aspect.
 * Nearest-neighbor scaling keeps the pixel-art look.
 */
export class Canvas {
  readonly el: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  private readonly container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private dpr = 1;

  constructor(container: HTMLElement) {
    this.container = container;

    this.el = document.createElement('canvas');
    this.el.className = 'game-canvas';

    const ctx = this.el.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context is not available');
    }
    this.ctx = ctx;

    container.appendChild(this.el);
    this.resize();
  }

  /** Begin observing the container for size changes. */
  observe(): void {
    if (this.resizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  /** Recompute the backing buffer and the fitted CSS size. */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1;

    // Backing buffer at design resolution * DPR.
    const bufferWidth = Math.round(DESIGN_WIDTH * this.dpr);
    const bufferHeight = Math.round(DESIGN_HEIGHT * this.dpr);
    if (this.el.width !== bufferWidth || this.el.height !== bufferHeight) {
      this.el.width = bufferWidth;
      this.el.height = bufferHeight;
    }

    // Fit into the container preserving 16:9 (letterbox / pillarbox).
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    const scale = Math.min(cw / DESIGN_WIDTH, ch / DESIGN_HEIGHT);
    const cssWidth = Math.max(0, Math.floor(DESIGN_WIDTH * scale));
    const cssHeight = Math.max(0, Math.floor(DESIGN_HEIGHT * scale));
    this.el.style.width = `${cssWidth}px`;
    this.el.style.height = `${cssHeight}px`;

    // Draw in design-pixel units; DPR is folded into the transform.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Width/height of the logical drawing surface, in design pixels. */
  get width(): number {
    return DESIGN_WIDTH;
  }
  get height(): number {
    return DESIGN_HEIGHT;
  }

  /** Stop observing and drop the canvas element. */
  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.el.remove();
  }
}
