import { TILE } from '../core/constants';
import type { Tilemap } from './Tilemap';

/** Axis-aligned bounding box in internal pixels (top-left origin). */
export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CollisionResult {
  x: number;
  y: number;
  onGround: boolean;
  onCeiling: boolean;
  onWallLeft: boolean;
  onWallRight: boolean;
}

/**
 * Sweep `box` by displacement (vx, vy) against the terrain layer and resolve
 * overlaps, X axis first then Y. Only the tiles along each leading edge are
 * tested (a column for the X pass, a row for the Y pass) — never the whole map.
 * On contact the box is pushed flush to the tile boundary, that axis is stopped,
 * and the matching flag is set.
 *
 * Returns the resolved position and contact flags; it does NOT mutate `box`.
 */
export function resolveAABB(box: AABB, vx: number, vy: number, map: Tilemap): CollisionResult {
  const { w, h } = box;
  const result: CollisionResult = {
    x: box.x,
    y: box.y,
    onGround: false,
    onCeiling: false,
    onWallLeft: false,
    onWallRight: false,
  };

  // --- X axis ---
  let x = box.x + vx;
  let y = box.y;
  if (vx !== 0) {
    const movingRight = vx > 0;
    const edgeX = movingRight ? x + w : x;
    const tileX = Math.floor(edgeX / TILE);
    const top = Math.floor(y / TILE);
    const bottom = Math.floor((y + h - 1) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      if (map.isSolid(tileX, ty)) {
        if (movingRight) {
          x = tileX * TILE - w;
          result.onWallRight = true;
        } else {
          x = (tileX + 1) * TILE;
          result.onWallLeft = true;
        }
        break;
      }
    }
  }

  // --- Y axis (using the X-resolved horizontal span) ---
  y = box.y + vy;
  if (vy !== 0) {
    const movingDown = vy > 0;
    const edgeY = movingDown ? y + h : y;
    const tileY = Math.floor(edgeY / TILE);
    const left = Math.floor(x / TILE);
    const right = Math.floor((x + w - 1) / TILE);
    for (let tx = left; tx <= right; tx++) {
      if (map.isSolid(tx, tileY)) {
        if (movingDown) {
          y = tileY * TILE - h;
          result.onGround = true;
        } else {
          y = (tileY + 1) * TILE;
          result.onCeiling = true;
        }
        break;
      }
    }
  }

  result.x = x;
  result.y = y;
  return result;
}
