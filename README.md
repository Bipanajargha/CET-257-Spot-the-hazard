# Spot the Hazard

An interactive hazard-perception training game set in a **real, walkable
3D warehouse** — built from actual Three.js geometry (racking, boxes, a
forklift, worker figures, a fire exit), not a photo or a flat panorama.
Movement works like Google Street View: walk with **W/A/S/D**, or just
**click the floor** to walk there; drag the mouse to look around.

**Stack:** HTML, CSS, vanilla JavaScript, [three.js](https://threejs.org/)
(loaded via CDN — no build step, no bundler, no npm install required).

> **On the visuals:** this is procedurally-built low-poly 3D geometry
> (boxes, cylinders, capsules — the same primitives any Three.js scene is
> made of), not a photo and not a downloaded 3D model. There's no
> image/3D-asset generation tool available in this pipeline, and licensed
> assets (e.g. from Sketchfab) can't be redistributed here — but real
> `.glb`/`.gltf` models can be dropped in later; see **Customising** below.

## Folder structure

```
spot-the-hazard/
├── index.html                 # all screens (menu, how-to-play, settings,
│                               # leaderboard, loading, game, pause, results)
├── css/
│   └── style.css              # all styling (dark theme, gold accent)
├── js/
│   ├── storage.js             # localStorage helpers (settings + leaderboard)
│   ├── audio.js                # WebAudio sound effects (no audio files needed)
│   ├── hazards.js              # world layout + the 8 hazards' 3D positions
│   ├── scene3d.js              # the 3D warehouse itself: room, racking,
│   │                            # forklift, workers, hazards, camera
│   │                            # controls (WASD + drag-look + click-to-walk)
│   ├── leaderboard.js          # leaderboard list rendering
│   ├── game.js                 # scoring, timer, hints, results
│   └── main.js                 # screen navigation + UI wiring + bootstrap
├── assets/
│   └── icons/
│       └── favicon.svg
└── README.md
```

There's no `assets/images/` or asset-generation script anymore — the
whole warehouse is built at runtime from code, so there's nothing to
regenerate or embed.

## Running it

**Just double-click `index.html`.** Nothing to load from disk, so no
`file://` restrictions apply. The only requirement is an **internet
connection**, because three.js itself loads from a CDN
(`unpkg.com/three@0.160.0`) in `index.html`.

If you'd rather serve it over HTTP anyway:

```bash
cd spot-the-hazard
python3 -m http.server 8000
# then open http://localhost:8000
```

Or, with Node installed: `npx serve .`

**To go fully offline (including three.js):** download `three.min.js`
from https://unpkg.com/three@0.160.0/build/three.min.js on any machine
with internet, drop it in a new `libs/` folder here, and change the
`<script src="https://unpkg.com/...">` line near the bottom of
`index.html` to `<script src="libs/three.min.js"></script>`.

## Gameplay concept (updated)

1. **Safe Room** — before training starts, the player sees a hazard-free
   version of the same warehouse (Skip, or Look Around then Begin).
2. **Live scene, click anytime** — hazards have no per-hazard timer or
   urgency. Click any hazard, in any order, whenever you spot it. The
   only clock is the level's own overall time limit (80 seconds).
3. **Spot it, then fix it** — clicking a hazard isn't the end. A small
   menu asks what the correct real-world response is ("Report it to a
   supervisor" or "Fix it myself right now" — "Ignore it" is always
   wrong). The right answer earns a bonus; the wrong one loses points,
   even though the hazard was spotted.
4. **Pass or replay** — a level needs `passMinFound` hazards found —
   see each level's `passMinFound` in `hazards.js` — to pass within
   its `timeLimit` (80s). Fewer than that on time-out forces a replay
   of the same level.

## Controls

- **Look around:** click-and-drag (mouse) or touch-drag
- **Walk forward / backward:** **W** / **S** (or ↑ / ↓)
- **Turn left / right:** **A** / **D** (or ← / →)
- **Click the floor** anywhere to walk to that point (Street-View style)
- **Click a hazard object** in the scene to score it, anytime; clicking
  any other prop (racking, boxes, the forklift, a compliant worker, the
  wall...) counts as a wrong guess
- **Hint button** turns the camera to face the next undiscovered hazard

Keyboard input is ignored while a settings/pause modal is open, or while
a settings field is focused.

## What's in the scene

Each of the 4 levels is now its own differently-shaped warehouse, built
and lit at runtime, rather than one shared corridor:

- **Level 1 — Orientation**: a small, single-aisle room (18m × 30m) —
  the simplest layout, for learning the controls.
- **Level 2 — Midday Rush**: a wider room (30m × 42m) with **two**
  parallel racking aisles side by side, joined by a cross-aisle gap
  partway down so you can cut between them.
- **Level 3 — Loading & Fire Safety**: a single racked aisle (24m ×
  46m) that opens into a distinct, unracked **loading-dock zone** with
  its own hazard-striped floor marking and dock doors on the end wall.
- **Level 4 — Full Shift Audit**: the largest layout (36m × 54m) —
  **three** parallel aisles with **two** cross-aisle gaps, a proper
  multi-aisle warehouse grid rather than a single strip.

Every level still includes:
- Floor, walls, ceiling (a fully enclosed rectangular room on all 4
  sides), painted lane lines down the centre of every aisle, ceiling
  strip lights
- Racking bays (steel-blue uprights, orange beams, cardboard boxes) —
  now a real physical obstacle: walking into a rack row stops you, so
  aisles behave like aisles instead of being purely decorative
- A forklift, and one or two compliant hi-vis workers, placed
  per-level (all just décor/props — clicking them is a wrong guess,
  they aren't the hazard)
- A fire exit door with an illuminated sign and extinguisher
- **5 to 8 real hazard objects per level**, positioned to fit that
  level's specific layout: a floor spill, an overloaded top shelf, a
  trailing cable, an unsecured pallet, a forklift parked too close to
  the walkway, a worker *without* a hi-vis vest, a bent racking
  upright, and boxes blocking the fire exit

## Scoring (updated)

| Event | Points |
|---|---|
| Hazard found | +10 |
| Correct fix chosen | +5 |
| Wrong fix chosen | −3 |
| All hazards found before time runs out | +20 |
| Wrong click (non-hazard object) | −(difficulty penalty) |
| Hint used | −2 |

## What's implemented

- **Main menu** — animated, CSS-only warehouse atmosphere (receding
  shelving silhouettes, a perspective floor grid, a pulsing hazard icon,
  staggered button entrance) — Play Game / How to Play / Settings /
  Leaderboards / Exit
- **How to Play** modal — the 4-step tutorial
- **Settings** — music & SFX volume, difficulty (Easy/Normal/Hard —
  changes move/turn speed and the wrong-guess penalty), countdown timer
  length, and a Reset Progress action, all persisted to `localStorage`
- **Loading screen** with a simulated progress bar and safety tip
- **Real 3D gameplay across multiple phases** — each level's hazards
  are grouped into 2–3 phases; finishing every hazard in a phase pops
  a "Phase Complete" toast with that phase's points, and the HUD shows
  which phase you're currently on. Navigation is WASD + drag-look +
  click-to-walk through an actual Three.js scene, with racking rows
  you physically can't walk through
- **A different warehouse layout per level** — see "What's in the
  scene" above
- **Results screen** — star rating (1–3) and a full scoring breakdown:
  each phase's subtotal, correct hits, wrong guesses, time bonus, and
  the final Total Score
- **Leaderboard** — This Week / All Time tabs backed by `localStorage`,
  seeded with a few sample scores; your own runs are added automatically
- **Sound** — every interaction has audio, synthesised at runtime with
  the WebAudio API (zero audio files to manage): correct hit, wrong
  guess, phase-complete chime, Safe Room toggle, footsteps while
  walking, hint use, and a win fanfare on full completion

## Customising / extending

- **Add more workers or props:** call `_makeWorker(hiVis)` in
  `js/scene3d.js` for another figure, or add a new `_addXxx()` method
  following the same pattern as `_addForklift` / `_addFireExit`.
- **Move a hazard, or add a new one:** edit `js/hazards.js` — each
  hazard is just an `{ id, title, x, y, z, description }` entry; `x`/`z`
  are position along/across the aisle, `y` is height off the floor.
  Then add a matching `case` in `Warehouse3D._addHazards()` in
  `scene3d.js` that builds its geometry (or reuse an existing one).
- **Use a real 3D model instead of primitives:** three.js can load
  `.glb`/`.gltf` files via `THREE.GLTFLoader` (an addon, not in the core
  UMD bundle — you'd add its script tag and swap a `_hazardXxx()` /
  `_addXxx()` method to load the model instead of building it from boxes).
  Keep in mind licensing — a model downloaded from a site like Sketchfab
  needs a licence that allows redistribution before shipping it in this
  project.
- **Add a whole new level:** duplicate `LEVEL_1_WAREHOUSE` and `WORLD` in
  `js/hazards.js` (e.g. `LEVEL_2_LOADING_BAY`), build its geometry in a
  new method, and pass it to `Game.init()` in `main.js`.


## Changes since the Assignment 1 presentation (client feedback, 17 Sep 2026)

1. **Hazard removed once handled** – after a response is chosen the hazard flashes green, shrinks out of the scene and shows a floating "RESOLVED" tag. It can no longer be clicked.
2. **Status feedback after every action** – a status panel and a green/red screen flash confirm every spot, fix, wrong click and hint, and say what the best response was.
3. **Difficulty changes the time limit** – Easy 1.5x (120 s), Normal 1x (80 s), Hard 0.75x (60 s) per level.
