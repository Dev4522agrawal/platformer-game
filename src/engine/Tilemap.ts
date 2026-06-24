import { INTERNAL_W, INTERNAL_H } from '../core/constants';
import type { TileSource } from './TileSource';
import { computeDisplayGrid, GRASS_FAMILY, TERRAIN_FAMILIES } from './Autotile';

/**
 * One grid layer of a level. `data` is row-major [y][x]; a value of 0 means
 * "empty". For most layers a non-zero value is a sheet tile id drawn directly
 * (no gid offset). The 'terrain' layer is the exception: it is an OCCUPANCY
 * MASK (any non-zero = solid) autotiled into real ids for rendering — see
 * `terrainDisplay` / Autotile.ts.
 */
export interface TileLayer {
  name: string;
  collision: boolean;
  data: number[][];
}

export interface TilemapData {
  width: number;
  height: number;
  tileSize: number;
  /** Terrain look-and-feel ("grass", etc.) -> Autotile.TERRAIN_FAMILIES. Defaults to grass. */
  family?: string;
  layers: TileLayer[];
}

/** Tile sources a Tilemap draws with. `backgrounds` is optional. */
export interface TilemapSheets {
  tiles: TileSource;
  backgrounds?: TileSource;
}

/** Conventional layer names. Only 'background' and 'terrain' are rendered. */
const BACKGROUND_LAYER = 'background';
const TERRAIN_LAYER = 'terrain';

export class Tilemap {
  readonly data: TilemapData;

  private readonly sheets: TilemapSheets;
  private readonly layers: Map<string, TileLayer>;
  /** Autotiled ids for the terrain layer, used for rendering only. */
  private readonly terrainDisplay: number[][];

  constructor(data: TilemapData, sheets: TilemapSheets) {
    this.data = data;
    this.sheets = sheets;
    this.layers = new Map(data.layers.map((layer) => [layer.name, layer]));

    const terrain = this.layers.get(TERRAIN_LAYER);
    const family = TERRAIN_FAMILIES[data.family ?? 'grass'] ?? GRASS_FAMILY;
    this.terrainDisplay = terrain ? computeDisplayGrid(terrain.data, family) : [];
  }

  /** Tile id at (tx, ty) on a layer. Returns 0 for empty/unknown/out-of-bounds. */
  tileAt(layerName: string, tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.data.width || ty >= this.data.height) return 0;
    const layer = this.layers.get(layerName);
    return layer?.data[ty]?.[tx] ?? 0;
  }

  /** A terrain tile is solid when non-zero. Out-of-bounds is non-solid. */
  isSolid(tx: number, ty: number): boolean {
    return this.tileAt(TERRAIN_LAYER, tx, ty) !== 0;
  }

  get pixelWidth(): number {
    return this.data.width * this.data.tileSize;
  }

  get pixelHeight(): number {
    return this.data.height * this.data.tileSize;
  }

  /**
   * Draw the background then terrain layers, offset by the camera. Only tiles
   * intersecting the visible 480x270 window are drawn. Hazard/interactive layers
   * are intentionally not rendered here.
   */
  render(ctx: CanvasRenderingContext2D, camX = 0, camY = 0): void {
    this.renderLayer(ctx, BACKGROUND_LAYER, this.sheets.backgrounds, camX, camY);
    this.renderLayer(ctx, TERRAIN_LAYER, this.sheets.tiles, camX, camY);
  }

  private renderLayer(
    ctx: CanvasRenderingContext2D,
    layerName: string,
    sheet: TileSource | undefined,
    camX: number,
    camY: number,
  ): void {
    if (!sheet) return;
    const layer = this.layers.get(layerName);
    if (!layer) return;
    const source = layerName === TERRAIN_LAYER ? this.terrainDisplay : layer.data;

    const ts = this.data.tileSize;
    const startX = Math.max(0, Math.floor(camX / ts));
    const endX = Math.min(this.data.width - 1, Math.floor((camX + INTERNAL_W) / ts));
    const startY = Math.max(0, Math.floor(camY / ts));
    const endY = Math.min(this.data.height - 1, Math.floor((camY + INTERNAL_H) / ts));

    for (let ty = startY; ty <= endY; ty++) {
      const row = source[ty];
      if (!row) continue;
      for (let tx = startX; tx <= endX; tx++) {
        const id = row[tx] ?? 0;
        if (id === 0) continue;
        sheet.draw(ctx, id, tx * ts - camX, ty * ts - camY);
      }
    }
  }
}
