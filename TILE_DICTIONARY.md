# Sector Runner — Tile Dictionary

**Pack:** Kenney "Pixel Platformer" (CC0). 180 terrain/object tiles + UI glyphs.
**Status:** single source of truth. Per the project rule, **no map/placement code is written before this is approved.**
**Geometry source:** `tools/tileEdges/tileEdges.json` (auto-extracted, calibrated 5/5).
**Meaning + placement + creative logic:** this document. Where the two disagree, **this document wins** (the semantic overrides in §2 are authoritative).

---

## 0. How to read an entry

Every family lists: **IDs**, **identity** (what it is), **open edges** (which sides connect / continue), and **placement + creative use**.

- **open** = terrain/fill runs off this edge (it joins a neighbour on that side).
- **closed** = a drawn outline caps this edge (it's a finished border — nothing attaches here).
- **empty** = transparent edge (object tile, not terrain).

"Open bottom," for a grass surface tile, means *dirt continues below it* — i.e. it's the **top of a tall terrain column**, not a one-tile platform.

---

## 1. Grid & ID model

The sheet is **20 columns × 9 rows**. `id = row * 20 + col`.

- **Horizontal families** differ by **±1** (edge variants: left-cap / centre / right-cap).
- **Vertical families** differ by **±20** (stems, ropes, pipes, ladders, waterfalls, door halves, biome variants stacked).

This is why your stems read 32 → 52 → 72, the pulley reads 69 → 89 → 109, and the snow tuft 144 sits directly under the grass tuft 124. Keep this in mind — it's how the pack telegraphs "these go together vertically."

---

## 2. Edge overrides (authoritative — these correct the auto-extraction)

The extractor reads outlines off pixels; it can't know a tile is *meant* to connect. These are the corrections from your pass. **Use these, not the raw JSON, for the listed tiles.**

| Tile | Raw read | **Override** | Why |
|---|---|---|---|
| 51 | bottom closed | **bottom OPEN** | ladder top — joins 71 below |
| 71 | — | top + bottom OPEN | ladder segment, repeats for any height |
| 72 | — | **bottom CLOSED**, top open | mushroom stem base, sits on ground |
| 69 | bottom closed | **bottom OPEN**, top closed | pulley wheel, fixes to ceiling, rope hangs |
| 89 | low conf | top + bottom OPEN | pulley rope segment, repeats |
| 109 | top closed | **top OPEN** | pulley foot, joins rope above, fixes to platform |
| 70 | low conf | **top OPEN** | free-hanging pulley handle (when 109 has no surface) |
| 137 | low conf | **bottom CLOSED**, top open | tree base, sits on ground |
| 96 / 116 | — | top + bottom OPEN | independent tree stems (96 has side-leaf, 116 bare) |
| 97 | — | top OPEN (to crown) | stem→crown connector (the "V") |
| 117 | low conf | **all four OPEN** | stem with branches on *both* sides |
| 136 | low: left | **left OPEN** | stem with left branch |
| 138 | low: right | **right OPEN** | stem with right branch |
| 98 / 118 | low: right | **right OPEN only** | left-branch endpoints (98 leafy, 118 bare) |
| 139 | low: left | **left OPEN only** | right-branch endpoint |
| 99 / 119 | low: r,l | left + right OPEN | branch extenders (99 leafy, 119 bare) |
| 131 | — | top + bottom OPEN | flag pole, repeats for height |
| 111 / 112 | low: bottom | bottom OPEN | flag cloth (animated pair), sits on pole |
| 110 | low: bottom | bottom OPEN | door top |
| 130 / 150 | — | top OPEN | door bottoms (130 windowed, 150 plain) |
| 84 / 85 / 86 | low: bottom | bottom OPEN (to post) | rectangular sign boards on a post |
| 33 / 53 | low conf | surface row | water **surface wave** loop pair |
| 34 / 35 | — | top of column | **waterfall top** loop pair |
| 54 / 55 | — | mid of column | waterfall middle loop pair |
| 74 / 75 | low conf | bottom of column | waterfall **splash base** loop pair |
| **144** | low: r,b,l | accessory (see §4.20) | **snow/ice ground tuft** — *needs your thumbs-up* |

Everything **not** in this table uses the extractor's geometry as-is.

---

## 3. Terrain philosophy — the creative core

This is the "how to think" layer you asked me to update. Five principles, drawn from how Kenney's own promo scenes (your two reference shots) are built:

1. **Surfaces cap, fill bodies.** Only **grass / sand / ice tops** are walkable surfaces. **Dirt is body** — it fills *below* a surface or builds cave walls. Never end a terrain column with bare dirt where the player can stand; always cap it with a grass/sand/ice top. A floating bare-dirt block with a walkable top reads as a bug.

2. **Multilayer = life.** The character walks on **one** plane, but the scene should have **two or three dirt layers** at different depths. A darker dirt layer *behind* the play surface, lighter dirt *in front*, reads as a cliff face / cut-away earth. This is the single biggest difference between "tilemap test" and "alive world." (See both reference shots — every cliff is layered, never a flat wall.)

3. **Build caves & overhangs from the ceiling down.** Hang dirt columns from the *top* of the screen and grow them downward; cap their *underside* with the appropriate edge tiles. That negative space between an overhang and the floor is a cave mouth. Dirt fill tiles (§4.4) carry the interior/corner edge variants for exactly this.

4. **Verticals double as platforms.** Tree crowns and mushroom caps aren't just decoration — their flat tops are **landing surfaces** (your reference B literally uses red mushroom caps as jump platforms). Plan trees/mushrooms where you want mid-air footing, not only as scenery.

5. **Rotation is free content.** Flipping a tile 180° (or mirroring it) multiplies the set:
   - **spike 68** flipped → **ceiling spikes**
   - **grass tuft / sprout 124–125** flipped → **hanging vines / roots** off an overhang
   - **arrow signs 87/88** mirror into each other
   - sand/grass edge tiles mirror left↔right
   Treat the sheet as ~1.5× bigger than its tile count.

---

## 4. The families

### 4.1 Grass-dirt terrain — `0 1 2 3` / `20 21 22 23`
Grass top over dirt. **0–3** = one-tile-tall floating grass platforms (edge variants: 0 isolated, 1 left-cap→open right, 2 centre→open L+R, 3 right-cap→open left). **20–23** = the **surface row of tall terrain** (same horizontal variants but **bottom open** — dirt fills below). Use 20–23 for real ground, 0–3 for thin ledges.

### 4.2 Sand / dried-top terrain — `40 41 42 43` / `60 61 62 63`
Identical system to grass but a **tan/dried top** (land with no grass). 40–43 thin, 60–63 tall (bottom open). Use for arid stretches, paths, worn ground.

### 4.3 Ice / snow terrain — `80 81 82 83` / `100 101 102 103`
Identical system with a **white/ice top**. 80–83 thin, 100–103 tall (bottom open). Snow biome ground.

> The three surface families (grass / sand / ice) are interchangeable edge-for-edge — same column logic, different biome skin. Mix them along a level for biome transitions.

### 4.4 Dirt fill & cave walls — `4 5` / `24 25` / `104` / `120 121 122 123` / `140 141 142 143`
Pure **dirt body** — never a standalone surface. These carry the interior + corner + edge variants you need to fill behind/below surfaces and to shape **cave interiors, overhangs, cliff cut-aways**. This is the multilayer toolkit (§3.2, §3.3). Pick the variant whose open edges match where the dirt continues.

### 4.5 Surprise / appearing platform — `8 → 7 → 6`
One animated family: **8** small chunk → **7** larger → **6** full block. Play in sequence to **materialise a platform from nothing** (timed/triggered ledge). Reverse to dissolve it.

### 4.6 Mystery boxes — yellow `9 10 11`, brown `29 30 31`
Mario-style hit boxes. **9/29** blank, **10/30** "?" , **11/31** used ("0"). Solid blocks; swap "?"→used on hit. Yellow and brown are palette variants — use brown in earthy zones, yellow as the classic.

### 4.7 Trees — stems, branches, crown, base
The richest system. Assemble bottom-up:

- **Base:** `137` (bottom closed, top open) — sits on ground.
- **Trunk stems:** `96` (leafy side), `116` (bare) — top+bottom open, stack freely for height.
- **Branching stems:** `136` (left branch), `138` (right branch), `117` (both branches) — open on their branch side(s).
- **Crown connector:** `97` — the "V" that joins trunk to canopy (top open to crown).
- **Canopy (leaves):** the 4×4 block `16 17 18 19 / 36 37 38 39 / 56 57 58 59 / 76 77 78 79` — corner/edge/centre leaf pieces. **Rearrange them** for any crown size/shape (small round bush → big multilayer crown like reference A).

**Branch recipe (your grammar):**
- Left branch:  `98|118` ← `(99|119)×N` ← `136|117`
- Right branch: `138|117` → `(99|119)×N` → `139`
(`99/98` leafy, `119/118` bare; `N = 0…∞`.) Endpoints cap the branch; extenders set its length.

**Full tree =** `137` → stems (mix straight + branching) → `97` → canopy. Crown tops are walkable (§3.4).

### 4.8 Mushroom platforms — caps `12 13 14 15`, stem `32 52 72`
Cap is a horizontal strip: `14`(left) – `13×N`(extenders) – `12`(centre, sits on stem) – `13×N` – `15`(right). Stem drops `32 → 52 → 72` (**72 base, closed bottom**). The **cap top is a jump platform** (reference B). Vary cap width with 13-count; vary stem height with 52-repeats.

### 4.9 Water — surface & waterfalls
Two systems, both animated by **looping a pair** (same trick as the character walk cycle):
- **Pond/lake surface:** `33 ↔ 53` looped = animated wave row. `73` (solid blue) fills below.
- **Waterfall (vertical):** `34/35` top (pour-over) → `54/55` middle (falling) → `74/75` splash base — loop each pair. Cascade them down a cliff face (reference B, right side). `73` for still pools at the bottom.

### 4.10 Pipes
- **Vertical:** `95` top opening → `115` middle (∞) → `135` bottom opening.
- **Horizontal:** `132` left opening → `133` middle (∞) → `134` right opening.
- **Corners (elbows):** `93 94 113 114` — join a vertical run to a horizontal one (all four edges already correct). Build the blue pipe network like reference B's top-left.

### 4.11 Pulleys
- **Vertical:** `69` wheel (fixes to ceiling, bottom open) → `89` rope (∞, both open) → foot: `109` (fixes to a platform, top open) **or** `70` (free-hanging handle, top open).
- **Horizontal:** `90` left handle (opens right) → `91` rope (both open) → `92` right handle (opens left).
Use length of the rope segment to set travel/height (reference A hangs one from a ledge).

### 4.12 Ladder — `51` + `71`
`51` top (bottom open) + `71` segment repeated for any height. **Climbable**, not solid. Run it up a cliff to a high ledge (reference A).

### 4.13 Door — `110` + (`130` | `150`)
`110` top (bottom open) + bottom half: `130` (with glass window) or `150` (plain), both top open. Set into a wall as a level exit / entrance.

### 4.14 Flag — `131` + `111/112`
`131` pole (top+bottom open, repeat for height) + flag cloth `111 ↔ 112` looped (animated, bottom open) at the top. Checkpoint / goal (reference A peak).

### 4.15 Signs — `84 85 86 87 88`
Rectangular boards on a post (bottom open to post): `84` ←arrow, `85` →arrow, `86` blank. Arrow-shaped: `87` left, `88` right (mirror pair). Wayfinding / hints.

### 4.16 Wood platforms — `47 48 49 50`
Thin **wooden one-way platforms** (edge variants). Lighter-touch footing than terrain; good for mid-air paths.

### 4.17 Floating tiles — `146 147`
A walkable tile with its **lower half empty** (hangs in air, no support needed). `146` plain, `147` with a little dirt underneath. Use for clean floating islands where a full terrain column would look wrong.

### 4.18 Interactive & traps
- **Levers** `64 65 66` — one mechanic, 3 states (left / neutral / right). Toggle doors/platforms.
- **Spike** `68` — hazard. Flip for ceiling spikes (§3.5).
- **Jump pad** `107 ↔ 108` — compressed/open animated pair. Bounce.
- **Button** `148 ↔ 149` — unpressed/pressed animated pair. Pressure trigger.

**Trap behaviour model (important):** spikes, jump pads, buttons are **trigger overlays, not collidable blocks**. Place them **coplanar with the walking surface** as a backdrop layer that **activates when the character reaches it** — the player runs *onto* the spike zone and dies, they are not *stopped* by it like a wall. (A spike used as a solid block would halt movement and never actually touch the player.) Treat this whole group as a separate "trigger" layer over terrain.

### 4.19 Collectibles & HUD
- **Key** `27` (collectible) + **keyhole block** `28` (locked, opened by the key).
- **Chest** `26`, **Diamond** `67`, **Coins** `151 ↔ 152` (front/side spin loop).
- **Hearts** `44` full / `45` half / `46` empty — HUD health, not world tiles.

### 4.20 Ground accessories — `124 125 126 127 128 129` (+ `144 145`)
Free-standing decor that **only sits on ground** (dirt/sand/ice surface), never floats: `124` short grass tuft, `125` tall tuft, `126` small pine, `127` cactus, `128` red mushroom, `129` tall brown mushroom. **`145`** snowman. **`144`** = **snow/ice tuft** — the snow-biome twin of `124` (it sits directly below 124 in the sheet). Use as low hurdles / to dress surfaces. Flip tufts for hanging vines (§3.5).

### 4.21 Barricades — `105 106`
Wooden barricades: `105` full, `106` short. Obstacles / set dressing.

### 4.22 Clouds — `153 154 155 156`
Background only. **Do not use as platforms** (we already have plenty of footing) — pure sky decor. (`153` left, `156` right edge variants for wide clouds.)

### 4.23 UI glyphs — `157 159` … `160–179`
`157` dot, `158` ✕, `159` %, `160–169` digits 0–9 (style A), `170–179` digits 0–9 (style B). **Excluded from terrain.** HUD/score only.

---

## 5. Composition recipes

Concrete builds so a map author (or a CC prompt) has a pattern to follow, not just a parts list.

- **Layered ground + cave:** lay a grass/sand/ice surface row (20–23 / 60–63 / 100–103); fill 2–4 dirt rows below (§4.4). Behind it, offset a *darker* dirt layer for depth. For a cave, hang a dirt overhang from above and cap its underside — the gap is the cave mouth.
- **A tree (big, reference-A style):** `137` base → `116`/`96` stems → a `117` (both branches) with `98|118 + 99|119×2 + 139` arms → `97` connector → a 3×4 canopy from the leaf block. Land the player on the crown.
- **Mushroom jump platform:** stem `32/52/72`, cap `14 13 12 13 15`. Drop several at rising heights for a climb.
- **Waterfall on a cliff:** at the cliff lip, `34/35`; down the face, `54/55 ×N`; at the floor, `74/75` + a `73` pool. Loop each pair.
- **Vertical pulley:** `69` on the ceiling, `89 ×N` rope, `109` onto the platform it lifts (or `70` if it hangs free).
- **Door in a wall:** carve a 1×2 gap in terrain, drop `110` + `130/150`.
- **Flag goal:** `131 ×N` pole on a peak, `111/112` cloth on top.
- **Rotated hazards:** ceiling run of flipped `68`; flipped `124/125` as vines off an overhang lip.

---

## 6. Open flags & questions

1. **Tile 144 — confirm.** I've recorded it as the **snow/ice ground tuft** (snow twin of 124, which it sits directly beneath). Your earlier note guessed "blades/trap." Pixels read like a tuft, not blades — **thumbs-up to lock it as a snow accessory, or tell me it's a trap and I'll move it to §4.18.**
2. **Autotile vs hand-place (forward, not blocking).** This dictionary supports either. If you want the engine to *auto-pick* edge tiles (Wang/terrain brush, or your custom autotiler), I'll add a machine-readable `tileMeta.json` (edges + family + role) next to it so code can consume it. If you'd rather hand-place from these recipes, the markdown is enough. Which way?

---

## 7. Workflow from here

1. You review this (esp. the §2 overrides and the 144 flag) and correct anything I misread.
2. On approval I (a) update the PRD to commit to **this single Kenney pack as the sole game**, dropping the industrial set, and (b) — if you chose autotile — emit `tileMeta.json`.
3. *Then* the no-code gate lifts and we start on map authoring / the autotiler, one approved instance before mass-producing.
