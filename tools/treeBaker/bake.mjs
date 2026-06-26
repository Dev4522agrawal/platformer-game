/**
 * Tree baker (dev tool — NOT part of the game build).
 *
 * Trees are decorative-only (no collision), so we COMPOSE each tree ONCE at
 * build time into a single trimmed PNG instead of assembling it tile-by-tile at
 * runtime (which keeps producing shattered canopies). This bakes several
 * candidate trees from the Kenney leaf/trunk tiles and emits a standalone review
 * page so the human can pick the variant(s) that match Kenney's hero tree.
 *
 * Reads individual 18x18 tiles read-only; writes PNGs + trees_review.html.
 * Run: `node tools/treeBaker/bake.mjs`
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

// --- Constants --------------------------------------------------------------
const TILE = 18;
const REVIEW_SCALES = [1, 6]; // shown in the review page
const OUTLINE_LUMA = 90; // luma below this counts as the dark Kenney outline (matches tileEdges)

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TILES_DIR = join(ROOT, 'public', 'assets', 'kenney', 'base', 'Tiles');
const OUT_DIR = join(__dirname, 'out');

// Trunk tiles (TILE_DICTIONARY.md §4.7 / tileMeta.json).
const T_BASE = 137; // trunk bottom
const T_STEM_BARE = 116; // plain vertical stem
const T_STEM_LEAFY = 96; // stem with little leaf sprigs poking off the sides
const T_CONNECTOR = 97; // crown connector (trunk -> crown)

// Canopy nine-slice atlas (4x4 of leaf tiles):
//   16 17 18 19
//   36 37 38 39
//   56 57 58 59
//   76 77 78 79
const ATLAS = [
  [16, 17, 18, 19],
  [36, 37, 38, 39],
  [56, 57, 58, 59],
  [76, 77, 78, 79],
];

// --- Tile loading (cached) --------------------------------------------------
const tileCache = new Map();
function getTile(id) {
  if (tileCache.has(id)) return tileCache.get(id);
  const file = join(TILES_DIR, `tile_${String(id).padStart(4, '0')}.png`);
  const png = PNG.sync.read(readFileSync(file));
  const t = { data: png.data, width: png.width, height: png.height };
  tileCache.set(id, t);
  return t;
}

function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// --- Nine-slice leaf-mass ---------------------------------------------------
/**
 * leafMass(w, h) -> Placement[] in TILE-LOCAL coords ({ id, col, row }).
 * Corners 16/19/76/79; edges alternate; interior alternates 37/38/57/58.
 */
function leafMass(w, h) {
  const out = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const top = row === 0;
      const bot = row === h - 1;
      const left = col === 0;
      const right = col === w - 1;
      let id;
      if (top && left) id = 16;
      else if (top && right) id = 19;
      else if (bot && left) id = 76;
      else if (bot && right) id = 79;
      else if (top) id = col % 2 ? 18 : 17;
      else if (bot) id = col % 2 ? 78 : 77;
      else if (left) id = row % 2 ? 56 : 36;
      else if (right) id = row % 2 ? 59 : 39;
      else id = [[37, 38], [57, 58]][row % 2][col % 2];
      out.push({ id, col, row });
    }
  }
  return out;
}

// --- Compositing ------------------------------------------------------------
/**
 * compose(placements, { trim }) -> { rgba: Buffer, width, height }
 * placements: { id, px, py } in PIXEL coords. Blitted back-to-front (array
 * order) with proper src-over alpha compositing. Margins trimmed unless trim:false.
 */
function compose(placements, { trim = true } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placements) {
    minX = Math.min(minX, p.px);
    minY = Math.min(minY, p.py);
    maxX = Math.max(maxX, p.px + TILE);
    maxY = Math.max(maxY, p.py + TILE);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const rgba = Buffer.alloc(width * height * 4); // zero = transparent

  for (const p of placements) {
    const tile = getTile(p.id);
    const ox = p.px - minX;
    const oy = p.py - minY;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const si = (y * tile.width + x) * 4;
        const sa = tile.data[si + 3] / 255;
        if (sa === 0) continue;
        const di = ((oy + y) * width + (ox + x)) * 4;
        const da = rgba[di + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA === 0) continue;
        for (let k = 0; k < 3; k++) {
          const sc = tile.data[si + k];
          const dc = rgba[di + k];
          rgba[di + k] = Math.round((sc * sa + dc * da * (1 - sa)) / outA);
        }
        rgba[di + 3] = Math.round(outA * 255);
      }
    }
  }

  if (!trim) return { rgba, width, height };

  // Trim fully-transparent margins.
  let t = height;
  let b = -1;
  let l = width;
  let r = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] !== 0) {
        if (y < t) t = y;
        if (y > b) b = y;
        if (x < l) l = x;
        if (x > r) r = x;
      }
    }
  }
  if (b < 0) return { rgba, width, height }; // fully empty (shouldn't happen)
  const tw = r - l + 1;
  const th = b - t + 1;
  const trimmed = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const srcRow = ((t + y) * width + l) * 4;
    rgba.copy(trimmed, y * tw * 4, srcRow, srcRow + tw * 4);
  }
  return { rgba: trimmed, width: tw, height: th };
}

function toPng({ rgba, width, height }) {
  const png = new PNG({ width, height });
  rgba.copy(png.data);
  return PNG.sync.write(png);
}

// --- Tree assembly ----------------------------------------------------------
/**
 * Build a tree from a DATA spec into pixel placements.
 *  trunk: { height, stem }            (stem tile id; height in tiles, >=2)
 *  canopy: [{ w, h, ox, oy }]         (tile offsets; drawn in array order)
 *  sprigs: [{ id, ox, oy }]           (optional trunk-side accents)
 * Trunk occupies tile column 0: row 0 = connector (top), last row = base (bottom).
 */
function buildTree(spec) {
  const placements = [];
  const push = (id, col, row) => placements.push({ id, px: col * TILE, py: row * TILE });

  const { trunk, canopy = [], sprigs = [] } = spec;
  for (let row = 0; row < trunk.height; row++) {
    if (row === trunk.height - 1) push(T_BASE, 0, row);
    else if (row === 0) push(T_CONNECTOR, 0, row);
    else push(trunk.stem, 0, row);
  }
  for (const m of canopy) {
    for (const p of leafMass(m.w, m.h)) push(p.id, p.col + m.ox, p.row + m.oy);
  }
  for (const s of sprigs) push(s.id, s.ox, s.oy);
  return placements;
}

// A single leaf-mass bottom sits on the connector (row 0) when oy = 1 - h.
const massBottomOnConnector = (h) => 1 - h;
// Center a w-wide mass over the 1-wide trunk at col 0.
const centerOver = (w) => -Math.floor((w - 1) / 2);

// --- Variant specs (DATA) ---------------------------------------------------
const VARIANTS = [
  {
    name: 'tree_small',
    spec: {
      trunk: { height: 3, stem: T_STEM_BARE },
      canopy: [{ w: 2, h: 2, ox: centerOver(2), oy: massBottomOnConnector(2) }],
    },
    desc: 'trunk 3 (bare) + single 2×2 leaf-mass',
  },
  {
    name: 'tree_medium',
    spec: {
      trunk: { height: 4, stem: T_STEM_BARE },
      canopy: [{ w: 3, h: 3, ox: centerOver(3), oy: massBottomOnConnector(3) }],
    },
    desc: 'trunk 4 (bare) + single 3×3 leaf-mass',
  },
  {
    name: 'tree_large_single',
    spec: {
      trunk: { height: 5, stem: T_STEM_BARE },
      canopy: [{ w: 4, h: 3, ox: centerOver(4), oy: massBottomOnConnector(3) }],
    },
    desc: 'trunk 5 (bare) + single 4×3 leaf-mass',
  },
  {
    name: 'tree_large_double',
    spec: {
      trunk: { height: 5, stem: T_STEM_LEAFY },
      // Two overlapping 3×3 masses: left higher, right lower-and-right (Kenney hero look).
      canopy: [
        { w: 3, h: 3, ox: -2, oy: massBottomOnConnector(3) - 1 }, // left, raised one tile
        { w: 3, h: 3, ox: 0, oy: massBottomOnConnector(3) }, // right, down + right, overlapping
      ],
    },
    desc: 'trunk 5 (leafy stems = side sprigs) + TWO overlapping 3×3 masses (left raised, right down+right)',
  },
];

// --- Seam detection ---------------------------------------------------------
/**
 * Bake an untrimmed w×h leaf-mass and inspect a purely-interior tile seam.
 * Returns { seamless, detail }. If interior tiles carry their own outlines the
 * seam column will be markedly darker than the tile midline -> grid lines.
 */
function detectInteriorSeams(w, h) {
  if (w < 4 || h < 4) return { seamless: true, detail: 'mass too small to have an interior-interior seam' };
  const placements = leafMass(w, h).map((p) => ({ id: p.id, px: p.col * TILE, py: p.row * TILE }));
  const { rgba, width } = compose(placements, { trim: false });

  const interiorRows = [];
  for (let y = TILE; y < (h - 1) * TILE; y++) interiorRows.push(y);

  // Dark fraction of a vertical pixel column over the interior rows.
  const darkFracCol = (x) => {
    let opaque = 0;
    let dark = 0;
    for (const y of interiorRows) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] > 128) {
        opaque++;
        if (luma(rgba[i], rgba[i + 1], rgba[i + 2]) < OUTLINE_LUMA) dark++;
      }
    }
    return opaque ? dark / opaque : 0;
  };

  // x = 2*TILE is the seam between interior columns 1 and 2; x-4 is a tile midline.
  const seamX = 2 * TILE;
  const seam = Math.max(darkFracCol(seamX - 1), darkFracCol(seamX));
  const mid = darkFracCol(seamX - 4);
  const seamless = seam <= mid + 0.15; // tolerance: seam not appreciably darker than midline
  return {
    seamless,
    detail: `interior seam darkFrac=${seam.toFixed(2)} vs midline=${mid.toFixed(2)}`,
  };
}

// --- atlas_raw (identity reference) -----------------------------------------
function atlasRawPlacements() {
  const out = [];
  for (let r = 0; r < ATLAS.length; r++) {
    for (let c = 0; c < ATLAS[r].length; c++) {
      out.push({ id: ATLAS[r][c], px: c * TILE, py: r * TILE });
    }
  }
  return out;
}

// --- HTML review page -------------------------------------------------------
function buildHtml(baked, seamReport) {
  const card = (b) => {
    const imgs = REVIEW_SCALES.map(
      (s) =>
        `<div class="scaleblock"><div class="scalelbl">${s}×</div>` +
        `<img class="px" src="data:image/png;base64,${b.base64}" ` +
        `width="${b.width * s}" height="${b.height * s}" alt="${b.name}"></div>`,
    ).join('');
    return `<div class="card">
  <div class="name">${b.name}</div>
  <div class="dims">${b.width}×${b.height}px</div>
  <div class="spec">${b.desc}</div>
  <div class="scales">${imgs}</div>
</div>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tree Baker Review</title>
<style>
  body { background:#1e1e1e; color:#ddd; font-family: ui-monospace, monospace; margin:18px; }
  h1 { font-size:17px; margin-bottom:4px; }
  .note { color:#c9c97a; font-size:13px; max-width:760px; line-height:1.5; margin:8px 0 4px; }
  .seam { color:#9fd0ff; font-size:13px; margin:8px 0 18px; }
  .grid { display:flex; flex-wrap:wrap; gap:18px; align-items:flex-start; }
  .card { background:#2a2a2a; border-radius:8px; padding:14px; }
  .name { font-size:14px; color:#fff; }
  .dims { font-size:12px; color:#9a9; margin-top:2px; }
  .spec { font-size:12px; color:#aaa; margin:6px 0 10px; max-width:300px; }
  .scales { display:flex; gap:18px; align-items:flex-end; background:#3a3a3a; padding:12px; border-radius:6px; }
  .scaleblock { text-align:center; }
  .scalelbl { font-size:11px; color:#888; margin-bottom:6px; }
  .px { image-rendering: pixelated; display:block; }
</style>
</head>
<body>
<h1>Tree Baker Review</h1>
<div class="note">Compare against Kenney's sample tree — pick the variant(s) that match; we
finalize those into the game as placed sprites. (Open the Kenney sample separately.)</div>
<div class="seam">${seamReport}</div>
<div class="grid">
${baked.map(card).join('\n')}
</div>
</body>
</html>`;
}

// --- Main -------------------------------------------------------------------
function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const baked = [];
  const record = (name, desc, composed) => {
    const png = toPng(composed);
    const path = join(OUT_DIR, `${name}.png`);
    writeFileSync(path, png);
    baked.push({ name, desc, width: composed.width, height: composed.height, base64: png.toString('base64') });
    console.log(`  ${name.padEnd(20)} ${composed.width}×${composed.height}px  -> ${path}`);
  };

  console.log('Baking variants:');
  for (const v of VARIANTS) {
    record(v.name, v.desc, compose(buildTree(v.spec)));
  }
  // tree_pine: no coniferous shape is feasible from the rounded nine-slice leaf
  // atlas (it only makes rounded leaf-masses). A single-tile pine exists as
  // decor (tile 126, pine_small) if a pine is ever needed — skipped here.
  console.log('  tree_pine            SKIPPED (no conifer shape from rounded leaf atlas; see tile 126 pine_small)');

  record('atlas_raw', 'raw 4×4 canopy atlas (16/17/18/19 … 76/77/78/79) — identity reference', compose(atlasRawPlacements()));

  // Seam check on the largest single mass (4×3 has an interior; probe 4×4 for a full interior-interior seam).
  const seam = detectInteriorSeams(4, 4);
  const seamReport = seam.seamless
    ? `Interior seams: SEAMLESS — ${seam.detail}. Single-mass crowns are usable.`
    : `Interior seams: GRID LINES DETECTED — ${seam.detail}. Interior tiles carry their own ` +
      `outlines, so single large masses show internal lines; prefer the OVERLAPPING-masses layout ` +
      `(tree_large_double), not bigger single masses.`;
  console.log(`\n${seamReport}`);

  const htmlPath = join(__dirname, 'trees_review.html');
  writeFileSync(htmlPath, buildHtml(baked, seamReport));
  console.log(`\nWrote: ${htmlPath}`);
  console.log('Open trees_review.html to pick the winners.');
}

main();
