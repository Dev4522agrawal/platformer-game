import type { Entity } from './Entity';

/**
 * Owns a flat list of entities and fans lifecycle calls out to them. No pooling
 * yet — add/remove are plain array operations. `clear()` destroys every entity
 * and drops all references so owned resources are released.
 */
export class EntityManager {
  private readonly entities: Entity[] = [];

  add<T extends Entity>(entity: T): T {
    this.entities.push(entity);
    return entity;
  }

  remove(entity: Entity): void {
    const i = this.entities.indexOf(entity);
    if (i === -1) return;
    this.entities.splice(i, 1);
    entity.destroy();
  }

  update(dt: number): void {
    for (const entity of this.entities) {
      entity.update(dt);
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, camX: number, camY: number): void {
    for (const entity of this.entities) {
      entity.render(ctx, alpha, camX, camY);
    }
  }

  /** Read-only view of the live entities. */
  get all(): readonly Entity[] {
    return this.entities;
  }

  clear(): void {
    for (const entity of this.entities) {
      entity.destroy();
    }
    this.entities.length = 0;
  }
}
