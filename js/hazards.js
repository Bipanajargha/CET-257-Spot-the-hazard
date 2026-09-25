/* hazards.js — each of the 4 levels now has its OWN warehouse layout
   (different room size, different number/arrangement of racking aisles,
   Level 3 has a distinct loading-dock zone) rather than all 4 levels
   reusing one shared corridor. See the `world` object on each level for
   its room shape; see scene3d.js's _addRacking()/_updateMovement() for
   how `rackRows` (with `gaps` for cross-aisles) drives both the visual
   racking AND the player's collision so you can't walk through it.

   Hazards are clickable anytime, in any order — there's no escalation
   timer per hazard. Each level just gives you a fixed overall time
   limit to find enough of them. Coordinates are world-space metres:
   X = across the room, Y = up, Z = down the length of the room. */

const PHASE_LABELS = {
  1: 'Phase 1',
  2: 'Phase 2',
  3: 'Phase 3'
};

/* Every hazard's "Spot it, then fix it" step: after a hazard is spotted,
   the player must pick the correct real-world response from these 3
   options. `correctFix` is the index into FIX_OPTIONS. "Ignore it" is
   always wrong — it exists as a plausible-looking trap answer. */
const FIX_OPTIONS = ['Report it to a supervisor', 'Fix it myself right now', 'Ignore it — not my job'];

/* ---------- Hazard CONTENT (title/description/correctFix/default
   height) — shared across levels. WHERE each one is placed (x, z) is
   level-specific, since every level now has a differently shaped room;
   see each level's `hazards` list below. ---------- */
const HAZARD_DEFS = {
  1: { id: 1, title: 'Spill on the Floor', y: 0.01,
       description: 'An unmarked liquid spill creates a slip hazard in a walked aisle.', correctFix: 1 },
  2: { id: 2, title: 'Overloaded Top Shelf', y: 4.35,
       description: 'Boxes stacked above the rated shelf height risk falling on staff below.', correctFix: 0 },
  3: { id: 3, title: 'Trailing Power Cable', y: 0.02,
       description: 'A cable runs across the walkway, creating a trip hazard.', correctFix: 1 },
  4: { id: 4, title: 'Unsecured Pallet', y: 0.35,
       description: 'A leaning, unstrapped pallet could topple onto an aisle.', correctFix: 0 },
  5: { id: 5, title: 'Forklift Too Close to Aisle', y: 0.6,
       description: 'A forklift is operating without clearance from the pedestrian walkway.', correctFix: 0 },
  6: { id: 6, title: 'Worker Without Hi-Vis Vest', y: 0.9,
       description: 'A staff member on the warehouse floor is missing required hi-vis PPE.', correctFix: 0 },
  7: { id: 7, title: 'Damaged Racking Frame', y: 2.1,
       description: 'A bent upright on the racking has not been reported or cordoned off.', correctFix: 0 },
  8: { id: 8, title: 'Blocked Fire Exit', y: 1.0,
       description: 'Boxes stacked in front of the fire exit would slow evacuation.', correctFix: 1 }
};

/** Build a level's hazard list. entries: [hazardId, phase, x, z]. Each
 *  level places the same 8 possible hazard TYPES at its own coordinates,
 *  since every level's room is a different shape. */
function buildHazards(entries) {
  return entries.map(([id, phase, x, z]) => Object.assign({ phase, x, z }, HAZARD_DEFS[id]));
}

/* ======================================================================
   LEVEL 1 — ORIENTATION: a small, single-aisle room. The simplest,
   most compact layout — one aisle between two racking walls — so a
   first-time player learns the controls before anything more complex.
   ====================================================================== */
const LEVEL_1_ORIENTATION = {
  id: 'level1',
  name: 'Level 1: Orientation',
  phaseCount: 2,
  passMinFound: 3,
  timeLimit: 80,
  world: {
    roomWidth: 18, roomLength: 30, roomHeight: 6.5,
    corridorHalfWidth: 7.6, walkableZMin: 2, walkableZMax: 28,
    spawn: { x: 0, y: 1.7, z: 3, yaw: 0 },
    rackRows: [
      { x: -7, zStart: 6, zEnd: 26, gaps: [] },
      { x: 7, zStart: 6, zEnd: 26, gaps: [] }
    ],
    fireExitZ: 27, forkliftX: -4, forkliftZ: 16,
    workerPositions: [{ x: -5, z: 11, rot: -2.0 }]
  },
  hazards: buildHazards([
    [1, 1, -3, 8], [3, 1, 2, 14], [4, 1, -3.5, 19],
    [6, 2, 3.5, 22], [8, 2, 0, 26.5]
  ])
};

/* ======================================================================
   LEVEL 2 — MIDDAY RUSH: a wider room with TWO parallel aisles (a real
   grid layout, not one corridor), joined by a cross-aisle gap so you
   can cut between them partway down the room.
   ====================================================================== */
const LEVEL_2_MIDDAY = {
  id: 'level2',
  name: 'Level 2: Midday Rush',
  phaseCount: 2,
  passMinFound: 4,
  timeLimit: 80,
  world: {
    roomWidth: 30, roomLength: 42, roomHeight: 7,
    corridorHalfWidth: 12.5, walkableZMin: 2, walkableZMax: 40,
    spawn: { x: -6, y: 1.7, z: 3, yaw: 0 },
    rackRows: [
      { x: -11, zStart: 6, zEnd: 38, gaps: [[20, 26]] },
      { x: -1, zStart: 6, zEnd: 38, gaps: [[20, 26]] },
      { x: 9, zStart: 6, zEnd: 38, gaps: [[20, 26]] }
    ],
    fireExitZ: 39, forkliftX: 13, forkliftZ: 10,
    workerPositions: [{ x: 4, z: 30, rot: 1.0 }, { x: -9, z: 10, rot: -1.0 }]
  },
  hazards: buildHazards([
    [1, 1, -6, 9], [2, 1, -11, 15], [5, 1, 4, 12],
    [3, 2, 0, 22], [4, 2, -7, 30], [6, 2, 5, 34]
  ])
};

/* ======================================================================
   LEVEL 3 — LOADING & FIRE SAFETY: a single racked aisle for the first
   half of the room, opening into a wide, unracked LOADING DOCK zone
   with its own floor marking and dock doors — a genuinely different
   space, not just more of the same aisle.
   ====================================================================== */
const LEVEL_3_LOADING = {
  id: 'level3',
  name: 'Level 3: Loading & Fire Safety',
  phaseCount: 3,
  passMinFound: 5,
  timeLimit: 80,
  world: {
    roomWidth: 24, roomLength: 46, roomHeight: 7.2,
    corridorHalfWidth: 8.6, walkableZMin: 2, walkableZMax: 44,
    spawn: { x: 0, y: 1.7, z: 3, yaw: 0 },
    rackRows: [
      { x: -8, zStart: 6, zEnd: 28, gaps: [] },
      { x: 8, zStart: 6, zEnd: 28, gaps: [] }
    ],
    dockZone: { zStart: 28, zEnd: 46, doors: 3 },
    fireExitZ: 43, forkliftX: 5, forkliftZ: 35,
    workerPositions: [{ x: -4, z: 18, rot: 2.0 }]
  },
  hazards: buildHazards([
    [2, 1, -8, 12], [5, 1, 4, 20],
    [3, 2, 0, 24], [4, 2, -6, 32], [6, 2, 6, 36],
    [7, 3, 8, 16], [8, 3, 0, 42.5]
  ])
};

/* ======================================================================
   LEVEL 4 — FULL SHIFT AUDIT: the largest layout — THREE parallel
   aisles with TWO cross-aisle gaps, a proper multi-aisle warehouse
   grid rather than a single strip.
   ====================================================================== */
const LEVEL_4_FULL_AUDIT = {
  id: 'level4',
  name: 'Level 4: Full Shift Audit',
  phaseCount: 3,
  passMinFound: 6,
  timeLimit: 80,
  world: {
    roomWidth: 36, roomLength: 54, roomHeight: 7.5,
    corridorHalfWidth: 17.5, walkableZMin: 2, walkableZMax: 52,
    spawn: { x: 0, y: 1.7, z: 3, yaw: 0 },
    rackRows: [
      { x: -15, zStart: 6, zEnd: 50, gaps: [[18, 24], [34, 40]] },
      { x: -5, zStart: 6, zEnd: 50, gaps: [[18, 24], [34, 40]] },
      { x: 5, zStart: 6, zEnd: 50, gaps: [[18, 24], [34, 40]] },
      { x: 15, zStart: 6, zEnd: 50, gaps: [[18, 24], [34, 40]] }
    ],
    fireExitZ: 51, forkliftX: -15, forkliftZ: 44,
    workerPositions: [{ x: 10, z: 14, rot: 1.2 }, { x: -10, z: 44, rot: -2.0 }]
  },
  hazards: buildHazards([
    [1, 1, -10, 9], [2, 1, -15, 14], [5, 1, 10, 18],
    [3, 2, 0, 21], [4, 2, -10, 29], [6, 2, 10, 33],
    [7, 3, 15, 44], [8, 3, 0, 50.5]
  ])
};

// Kept for anything that still refers to the original single-level name.
const LEVEL_1_WAREHOUSE = LEVEL_4_FULL_AUDIT;

// All levels available in this build, in play order. Level 1 is always
// unlocked; each further level unlocks once the one before it is
// passed (see Storage.unlockLevelIndex, called from game.js on pass).
const LEVELS = [LEVEL_1_ORIENTATION, LEVEL_2_MIDDAY, LEVEL_3_LOADING, LEVEL_4_FULL_AUDIT];

const DIFFICULTY_SETTINGS = {
  easy:   { moveSpeed: 6.5, turnSpeed: 95, wrongPenalty: 3 },
  normal: { moveSpeed: 5.5, turnSpeed: 80, wrongPenalty: 5 },
  hard:   { moveSpeed: 4.5, turnSpeed: 65, wrongPenalty: 8 }
};
