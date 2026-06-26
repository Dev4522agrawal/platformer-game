/**
 * Autotiler test scene (debug-only). This is the SINGLE instance we eyeball
 * before mass-producing levels — it is NOT a real level. It hand-authors one
 * paint grid that exercises every terrain path, runs it through the autotiler,
 * draws it with the renderer, then hand-places a few OBJECT ids (not autotiled)
 * to prove single-tile blitting and that the dictionary ids are right.
 *
 * Mounts ONLY behind a debug flag (URL `?debug=autotiler` or DEBUG_AUTOTILER).
 * Per project convention it stays in the build behind the flag and is otherwise
 * inert (never the default view).
 */

import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../core/Canvas';
import { GRID } from '../data/tiles';
import { autotile } from './autotiler';
import { TileRenderer } from './tilemapRenderer';

/** Compile-time escape hatch (the URL param is the usual trigger). */
export const DEBUG_AUTOTILER = false;
const DEBUG_PARAM = 'debug';
const DEBUG_VALUE = 'autotiler';

/** True when the autotiler test scene should replace the normal view. */
export function shouldMountTestScene(): boolean {
  if (DEBUG_AUTOTILER) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get(DEBUG_PARAM) === DEBUG_VALUE;
}

/**
 * Hand-authored paint grid (26 wide x 15 tall). Chars:
 *   '.' air · 'G' grass · 'S' sand · 'I' ice · 'D' forced dirt.
 * Exercises: flat tall grass ground + interior/edge fill · a stepped grass mound
 * (left/right caps) · a dirt overhang/cave (D forces bare dirt on top + underside)
 * · a pit (isolated caps on both edges) · inline sand + ice patches (biome switch
 * across one surface row) · a lone thin grass platform.
 */
const PAINT_GRID: readonly string[] = [
  '...DDDDD..................', // 0  cave ceiling (forced dirt, hangs from top)
  '...DDDDD..................', // 1  cave ceiling
  '...DDDDD..................', // 2  cave underside (air below -> bare dirt)
  '..........................', // 3
  '..........................', // 4
  '..........................', // 5
  '..........................', // 6
  '..........G...............', // 7  lone thin grass platform (air all around)
  '..........................', // 8
  '................GGG.......', // 9  mound peak
  '...............GGGGG......', // 10 mound shoulders (left/right step caps)
  'GGGGGGGGGGGG..GGGGGGSSGIIG', // 11 surface row: grass, pit gap, sand + ice patches
  'GGGGGGGGGGGG..GGGGGGGGGGGG', // 12 fill
  'GGGGGGGGGGGG..GGGGGGGGGGGG', // 13 fill
  'GGGGGGGGGGGG..GGGGGGGGGGGG', // 14 fill (bottom row -> bottom-edge dirt)
];

/**
 * Hand-placed objects, blitted by id over the autotiled grid (NOT autotiled).
 * Proves single-tile object blitting + that the dictionary ids resolve to the
 * right sprites. Cells are (col,row); each id sits in an air cell.
 */
interface PlacedObject {
  id: number;
  col: number;
  row: number;
}
const OBJECTS: readonly PlacedObject[] = [
  // Tree: base 137 on the ground, bare stem 116, crown connector 97 (the "V").
  { id: 137, col: 1, row: 10 },
  { id: 116, col: 1, row: 9 },
  { id: 97, col: 1, row: 8 },
  // Vertical water column: waterfall top 34 -> mid 54 -> splash base 74.
  { id: 34, col: 8, row: 8 },
  { id: 54, col: 8, row: 9 },
  { id: 74, col: 8, row: 10 },
  // Short grass tuft 124 sitting on the ground.
  { id: 124, col: 4, row: 10 },
  // Floating tile 146 (lower half empty, hangs in air).
  { id: 146, col: 22, row: 6 },
];

const MIN_SCALE = 1;

/** Largest integer scale at which the grid fits inside the design buffer. */
function fitScale(gridW: number, gridH: number): number {
  const s = Math.floor(Math.min(DESIGN_WIDTH / gridW, DESIGN_HEIGHT / gridH));
  return Math.max(MIN_SCALE, s);
}

/** Handle returned by the mount, so main.ts can tear the scene down cleanly. */
export interface TestSceneHandle {
  destroy(): void;
}

/**
 * Mount the test scene into `container`. Builds a contract-compliant 480x270
 * buffer (DPR-aware, FIT-scaled, nearest-neighbour, scoped to the container),
 * autotiles the paint grid, loads every needed tile, and draws. Redraws on
 * resize. Returns a handle whose destroy() releases everything.
 */
export function mountAutotilerTestScene(container: HTMLElement): TestSceneHandle {
  const idGrid = autotile([...PAINT_GRID]);
  const gridW = idGrid[0]?.length ?? 0;
  const gridH = idGrid.length;
  const scale = fitScale(gridW * GRID.tile, gridH * GRID.tile);

  const stepPx = GRID.tile * scale;
  const originX = Math.floor((DESIGN_WIDTH - gridW * stepPx) / 2);
  const originY = Math.floor((DESIGN_HEIGHT - gridH * stepPx) / 2);

  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('autotiler test scene: 2D context unavailable');
  container.appendChild(canvas);

  const renderer = new TileRenderer();
  let loaded = false;

  function draw(): void {
    if (!loaded) return;
    ctx!.imageSmoothingEnabled = false;
    ctx!.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    renderer.drawTileGrid(ctx!, idGrid, originX, originY, scale);
    for (const obj of OBJECTS) {
      renderer.drawTile(ctx!, obj.id, originX + obj.col * stepPx, originY + obj.row * stepPx, scale);
    }
  }

  function fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(DESIGN_WIDTH * dpr);
    const bh = Math.round(DESIGN_HEIGHT * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const css = Math.min(cw / DESIGN_WIDTH, ch / DESIGN_HEIGHT);
    canvas.style.width = `${Math.max(0, Math.floor(DESIGN_WIDTH * css))}px`;
    canvas.style.height = `${Math.max(0, Math.floor(DESIGN_HEIGHT * css))}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.imageSmoothingEnabled = false;
    draw();
  }

  const resizeObserver = new ResizeObserver(() => fit());
  resizeObserver.observe(container);
  fit();

  // Collect every id we will draw (grid + objects) and load once.
  const objectIds = OBJECTS.map((o) => o.id);
  const gridIds = idGrid.flat();
  renderer.load([...gridIds, ...objectIds]).then(() => {
    loaded = true;
    fit();
  });

  return {
    destroy(): void {
      resizeObserver.disconnect();
      renderer.dispose();
      canvas.remove();
    },
  };
}
