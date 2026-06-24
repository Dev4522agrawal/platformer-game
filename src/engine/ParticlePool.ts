const MAX_PARTICLES = 200;
const GRAVITY = 400; // px/s^2, light
const LIFE = 0.4; // seconds

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Fixed-size particle pool. All particles are pre-allocated once; spawning just
 * reactivates dead slots, so there is zero per-frame allocation. Purely visual.
 */
export class ParticlePool {
  private readonly particles: Particle[];

  constructor() {
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: LIFE,
      size: 1,
      r: 255,
      g: 255,
      b: 255,
    }));
  }

  /** Activate up to `count` dead particles at (x, y) flying out radially. */
  spawnBurst(x: number, y: number, color: RGB, count = 10, speed = 120): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.active) continue;

      const angle = Math.random() * Math.PI * 2;
      const mag = speed * (0.5 + Math.random() * 0.5);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * mag;
      p.vy = Math.sin(angle) * mag;
      p.maxLife = LIFE;
      p.life = LIFE;
      p.size = 1 + Math.floor(Math.random() * 3); // 1..3
      p.r = color.r;
      p.g = color.g;
      p.b = color.b;
      spawned++;
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /** Deactivate all particles (scene unload). */
  clear(): void {
    for (const p of this.particles) p.active = false;
  }
}
