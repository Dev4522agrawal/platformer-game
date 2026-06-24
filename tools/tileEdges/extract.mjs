/**
 * Tile-edge extractor (dev tool — NOT part of the game build).
 *
 * Reads each 18x18 Kenney terrain tile and classifies its four edges as:
 *   "open"   - terrain/fill continues past the edge (no dark outline)
 *   "closed" - a dark outline runs along the edge
 *   "empty"  - the edge is (mostly) transparent
 *
 * Emits tileEdges.json (measured data) + tileEdges_review.html (visual review).
 * Run: `node tools/tileEdges/extract.mjs`
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

// --- Tunable constants ------------------------------------------------------
const TILE = 18;
const OUTLINE_LUMA = 90; // pixels darker than this count as outline (Kenney outline ~74, fill >=110)
const OUTLINE_FRAC = 0.55; // >this fraction of edge sample is outline-dark -> "closed"
const ALPHA_MIN = 0.25; // opaque fraction below this -> "empty"
const CORNER_SKIP = 3; // ignore this many px at each END of an edge
const EDGE_DEPTH = 2; // sample the outermost N px lines of the edge
const ALPHA_BORDERLINE = 0.15; // |opaqueFrac - ALPHA_MIN| under this -> low confidence
const DARK_BORDERLINE = 0.12; // |darkFrac - OUTLINE_FRAC| under this -> low confidence
const CENTER = 8; // inner NxN region used for the median fill color

const EDGES = ['top', 'right', 'bottom', 'left'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PRIMARY_DIR = join(ROOT, 'public', 'assets', 'kenney', 'base', 'Tiles');
const PACKED_PNG = join(ROOT, 'public', 'assets', 'kenney', 'base', 'Tilemap', 'tilemap_packed.png');

// --- Source loading ---------------------------------------------------------

/** Try the individual tile_NNNN.png files (id === filename). Returns null if absent. */
function loadIndividualTiles() {
  let names;
  try {
    names = readdirSync(PRIMARY_DIR).filter((n) => /^tile_\d{4}\.png$/.test(n));
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  names.sort();
  const tiles = [];
  for (const name of names) {
    const id = parseInt(name.slice(5, 9), 10);
    const png = PNG.sync.read(readFileSync(join(PRIMARY_DIR, name)));
    const raw = readFileSync(join(PRIMARY_DIR, name));
    tiles.push({ id, png, base64: raw.toString('base64') });
  }
  return { source: `individual files (${PRIMARY_DIR})`, tiles };
}

/** Fallback: slice the packed atlas into an 18x18 grid (id = row*cols + col). */
function loadPackedTiles() {
  const sheet = PNG.sync.read(readFileSync(PACKED_PNG));
  const cols = Math.floor(sheet.width / TILE);
  const rows = Math.floor(sheet.height / TILE);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      const png = new PNG({ width: TILE, height: TILE });
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sIdx = ((r * TILE + y) * sheet.width + (c * TILE + x)) * 4;
          const dIdx = (y * TILE + x) * 4;
          png.data[dIdx] = sheet.data[sIdx];
          png.data[dIdx + 1] = sheet.data[sIdx + 1];
          png.data[dIdx + 2] = sheet.data[sIdx + 2];
          png.data[dIdx + 3] = sheet.data[sIdx + 3];
        }
      }
      const base64 = PNG.sync.write(png).toString('base64');
      tiles.push({ id, png, base64 });
    }
  }
  return { source: `packed atlas (${PACKED_PNG}, ${cols}x${rows})`, tiles };
}

// --- Pixel helpers ----------------------------------------------------------

function px(png, x, y) {
  const i = (y * png.width + x) * 4;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] };
}

function luma({ r, g, b }) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Coordinates of the outermost EDGE_DEPTH lines for an edge, minus the corners. */
function edgeSampleCoords(edge) {
  const lo = CORNER_SKIP;
  const hi = TILE - 1 - CORNER_SKIP;
  const coords = [];
  if (edge === 'top' || edge === 'bottom') {
    const rows =
      edge === 'top'
        ? Array.from({ length: EDGE_DEPTH }, (_, d) => d)
        : Array.from({ length: EDGE_DEPTH }, (_, d) => TILE - 1 - d);
    for (const y of rows) for (let x = lo; x <= hi; x++) coords.push([x, y]);
  } else {
    const colsArr =
      edge === 'left'
        ? Array.from({ length: EDGE_DEPTH }, (_, d) => d)
        : Array.from({ length: EDGE_DEPTH }, (_, d) => TILE - 1 - d);
    for (const x of colsArr) for (let y = lo; y <= hi; y++) coords.push([x, y]);
  }
  return coords;
}

/** Classify one edge -> { state, opaqueFrac, darkFrac, low }. */
function classifyEdge(png, edge) {
  const coords = edgeSampleCoords(edge);
  let opaque = 0;
  let dark = 0;
  for (const [x, y] of coords) {
    const p = px(png, x, y);
    if (p.a > 128) {
      opaque++;
      if (luma(p) < OUTLINE_LUMA) dark++;
    }
  }
  const opaqueFrac = coords.length ? opaque / coords.length : 0;
  const darkFrac = opaque ? dark / opaque : 0;

  let state;
  let low;
  if (opaqueFrac < ALPHA_MIN) {
    state = 'empty';
    low = Math.abs(opaqueFrac - ALPHA_MIN) < ALPHA_BORDERLINE;
  } else {
    state = darkFrac > OUTLINE_FRAC ? 'closed' : 'open';
    low =
      Math.abs(opaqueFrac - ALPHA_MIN) < ALPHA_BORDERLINE ||
      Math.abs(darkFrac - OUTLINE_FRAC) < DARK_BORDERLINE;
  }
  return { state, opaqueFrac, darkFrac, low };
}

/** Median hex color of the opaque pixels in the inner CENTERxCENTER region. */
function fillColor(png) {
  const lo = Math.floor((TILE - CENTER) / 2);
  const hi = lo + CENTER - 1;
  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = lo; y <= hi; y++) {
    for (let x = lo; x <= hi; x++) {
      const p = px(png, x, y);
      if (p.a > 128) {
        rs.push(p.r);
        gs.push(p.g);
        bs.push(p.b);
      }
    }
  }
  if (rs.length === 0) return '#000000';
  const med = (arr) => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  };
  const hex = (n) => n.toString(16).padStart(2, '0');
  return `#${hex(med(rs))}${hex(med(gs))}${hex(med(bs))}`;
}

/** Full per-tile analysis. */
function analyze(png) {
  const edges = {};
  const openEdges = [];
  const lowEdges = [];
  for (const edge of EDGES) {
    const c = classifyEdge(png, edge);
    edges[edge] = c.state;
    if (c.state === 'open') openEdges.push(edge);
    if (c.low) lowEdges.push(edge);
  }
  return {
    edges,
    openEdges,
    fillColor: fillColor(png),
    confidence: lowEdges.length ? 'low' : 'high',
    lowEdges,
  };
}

// --- Calibration ------------------------------------------------------------

const CALIBRATION = {
  0: [],
  1: ['right'],
  2: ['left', 'right'],
  3: ['left'],
  20: ['bottom'],
};

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((e) => s.has(e));
}

function runCalibration(results) {
  let pass = 0;
  const lines = [];
  for (const [idStr, expected] of Object.entries(CALIBRATION)) {
    const id = Number(idStr);
    const r = results.get(id);
    const ok = r && sameSet(r.openEdges, expected);
    if (ok) pass++;
    lines.push(
      `  tile ${String(id).padEnd(3)} expected [${expected.join(',')}]  got [${
        r ? r.openEdges.join(',') : 'MISSING'
      }]  ${ok ? 'PASS' : 'FAIL'}`,
    );
  }
  const total = Object.keys(CALIBRATION).length;
  return { pass, total, lines };
}

/** On failure, dump the raw measurements for each edge of the failing tiles. */
function dumpCalibrationDiagnostics(png, id) {
  console.log(`  -- tile ${id} edge measurements --`);
  for (const edge of EDGES) {
    const c = classifyEdge(png, edge);
    console.log(
      `     ${edge.padEnd(6)} state=${c.state.padEnd(6)} darkFrac=${c.darkFrac.toFixed(
        3,
      )} opaqueFrac=${c.opaqueFrac.toFixed(3)}`,
    );
  }
}

// --- HTML review page -------------------------------------------------------

const EDGE_COLOR = { open: '#3ad36b', closed: '#e0503a', empty: '#888888' };

function buildHtml(source, tiles, analysisById) {
  const cells = tiles
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(({ id, base64 }) => {
      const a = analysisById.get(id);
      const bar = (edge) => EDGE_COLOR[a.edges[edge]];
      const lowRing = a.confidence === 'low' ? ' low' : '';
      const lowNote =
        a.confidence === 'low' ? `<div class="lownote">low: ${a.lowEdges.join(', ')}</div>` : '';
      return `<div class="cell${lowRing}" data-low="${a.confidence === 'low'}">
  <div class="tilewrap">
    <span class="edge top" style="background:${bar('top')}"></span>
    <span class="edge right" style="background:${bar('right')}"></span>
    <span class="edge bottom" style="background:${bar('bottom')}"></span>
    <span class="edge left" style="background:${bar('left')}"></span>
    <img src="data:image/png;base64,${base64}" width="108" height="108" alt="tile ${id}">
  </div>
  <div class="id">#${id}</div>
  ${lowNote}
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tile Edge Review</title>
<style>
  body { background:#1e1e1e; color:#ddd; font-family: ui-monospace, monospace; margin:16px; }
  h1 { font-size:16px; }
  .meta { color:#999; font-size:12px; margin-bottom:12px; }
  .legend span { display:inline-block; margin-right:14px; }
  .swatch { display:inline-block; width:12px; height:12px; vertical-align:middle; margin-right:4px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap:14px; margin-top:14px; }
  .cell { background:#2a2a2a; border-radius:6px; padding:10px; text-align:center; }
  .cell.low { outline:2px solid #e8c000; }
  .tilewrap { position:relative; width:108px; height:108px; margin:0 auto; }
  .tilewrap img { image-rendering: pixelated; display:block; }
  .edge { position:absolute; }
  .edge.top { top:0; left:0; right:0; height:4px; }
  .edge.bottom { bottom:0; left:0; right:0; height:4px; }
  .edge.left { top:0; bottom:0; left:0; width:4px; }
  .edge.right { top:0; bottom:0; right:0; width:4px; }
  .id { margin-top:6px; font-size:12px; color:#bbb; }
  .lownote { font-size:11px; color:#e8c000; margin-top:2px; }
  label { font-size:13px; cursor:pointer; }
</style>
</head>
<body>
<h1>Tile Edge Review</h1>
<div class="meta">source: ${source} &nbsp;|&nbsp; ${tiles.length} tiles</div>
<div class="legend">
  <span><i class="swatch" style="background:${EDGE_COLOR.open}"></i>open</span>
  <span><i class="swatch" style="background:${EDGE_COLOR.closed}"></i>closed</span>
  <span><i class="swatch" style="background:${EDGE_COLOR.empty}"></i>empty</span>
  <span><i class="swatch" style="outline:2px solid #e8c000;background:transparent"></i>low confidence</span>
  &nbsp;&nbsp;<label><input type="checkbox" id="lowOnly"> show low-confidence only</label>
</div>
<div class="grid" id="grid">
${cells}
</div>
<script>
  document.getElementById('lowOnly').addEventListener('change', (e) => {
    const on = e.target.checked;
    for (const cell of document.querySelectorAll('.cell')) {
      cell.style.display = on && cell.dataset.low !== 'true' ? 'none' : '';
    }
  });
</script>
</body>
</html>`;
}

// --- Main -------------------------------------------------------------------

function main() {
  let loaded = loadIndividualTiles();
  if (!loaded) {
    console.log('Individual tiles not found; falling back to packed atlas.');
    loaded = loadPackedTiles();
  }
  const { source, tiles } = loaded;
  console.log(`Source: ${source}`);
  console.log(`Tiles processed: ${tiles.length}`);

  const analysisById = new Map();
  for (const { id, png } of tiles) analysisById.set(id, analyze(png));

  // Calibration gate.
  const cal = runCalibration(analysisById);
  console.log(`\nCalibration (${cal.pass}/${cal.total} PASS):`);
  for (const line of cal.lines) console.log(line);
  if (cal.pass !== cal.total) {
    console.log(`\nConstants: OUTLINE_LUMA=${OUTLINE_LUMA} OUTLINE_FRAC=${OUTLINE_FRAC} ALPHA_MIN=${ALPHA_MIN} CORNER_SKIP=${CORNER_SKIP} EDGE_DEPTH=${EDGE_DEPTH}`);
    for (const idStr of Object.keys(CALIBRATION)) {
      const id = Number(idStr);
      if (!sameSet(analysisById.get(id).openEdges, CALIBRATION[idStr])) {
        const tile = tiles.find((t) => t.id === id);
        if (tile) dumpCalibrationDiagnostics(tile.png, id);
      }
    }
    console.error('\nCalibration FAILED — output not written. Nudge constants above and re-run.');
    process.exitCode = 1;
    return;
  }

  // tileEdges.json (sorted numeric keys).
  const sortedIds = [...analysisById.keys()].sort((a, b) => a - b);
  const tilesOut = {};
  for (const id of sortedIds) tilesOut[id] = analysisById.get(id);
  const json = {
    meta: {
      source,
      tileCount: tiles.length,
      constants: { TILE, OUTLINE_LUMA, OUTLINE_FRAC, ALPHA_MIN, CORNER_SKIP, EDGE_DEPTH },
      calibration: `${cal.pass}/${cal.total} PASS`,
    },
    tiles: tilesOut,
  };
  const jsonPath = join(__dirname, 'tileEdges.json');
  writeFileSync(jsonPath, JSON.stringify(json, null, 2));

  // tileEdges_review.html.
  const htmlPath = join(__dirname, 'tileEdges_review.html');
  writeFileSync(htmlPath, buildHtml(source, tiles, analysisById));

  const lowIds = sortedIds.filter((id) => analysisById.get(id).confidence === 'low');
  console.log(`\nLow-confidence tiles (${lowIds.length}): ${lowIds.join(', ') || 'none'}`);
  console.log(`\nWrote: ${jsonPath}`);
  console.log(`Wrote: ${htmlPath}`);
}

main();
