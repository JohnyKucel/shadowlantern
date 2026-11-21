// SHADOWLANTERN — every number the game agrees on, in one place.
// The field is a 1280x720 top-down manor floor; the canvas scales it to the window.
export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const BEST_KEY = 'shadowlantern-best';
export const LIVES = 3;
export const PEBBLES_PER_LEVEL = 3;

// Palette: night indigo, stone floor, lantern gold, thief teal, alarm red.
export const COLORS = {
  backdrop: '#0d1026',
  floor: '#232744',
  floorAlt: '#20243e',
  wall: '#3a3f66',
  wallTop: '#4a5080',
  shadow: '#070818',
  gold: '#ffc94d',
  goldDim: '#8a6d2f',
  cone: 'rgba(255, 201, 77, 0.20)',
  coneEdge: 'rgba(255, 201, 77, 0.38)',
  thief: '#4ecdc4',
  thiefDark: '#2a8a84',
  alarm: '#ff5d5d',
  white: '#f4f1e6',
  muted: '#9aa0c3',
  crate: '#5d4a2f',
  crateTop: '#7a6240',
  hedge: '#2e5d3a',
  hedgeTop: '#3f7a4e',
  pillar: '#565c8a',
  moonstone: '#b8a7ff',
  coin: '#ffd94d',
  exit: '#7dff9e',
};

// How fast the thief moves, and how the two gaits differ.
export const THIEF = {
  radius: 12,
  walkSpeed: 175,
  sneakSpeed: 88,
  accel: 1500,
  damping: 8,
  // Running is loud: guards inside this radius hear the footsteps.
  noiseRadius: 95,
  catchRadius: 26,
};

// Detection: the meter fills while the thief is inside a cone, in the light,
// and drains when unseen. Sneaking in shadow is nearly invisible.
export const DETECTION = {
  fillLit: 1.15,
  fillShadow: 0.45,
  sneakFactor: 0.45,
  runFactor: 1.35,
  closeBoost: 1.6,
  closeRange: 90,
  decay: 0.55,
  suspiciousAt: 0.5,
  alertedAt: 1.0,
  loseSightAfter: 3.0,
  huntAfter: 6.0,
};

// Guard kinds. Watcher patrols waypoints, Hound is fast with a short cone and
// chases sound, Warden is slow with a long cone and holds chokepoints.
export const GUARD_KINDS = {
  watcher: { speed: 58, patrolSpeed: 58, chaseSpeed: 120, coneRange: 225, coneHalf: 0.55, hearRadius: 240, color: '#ff9d5c', name: 'Watcher' },
  hound: { speed: 98, patrolSpeed: 98, chaseSpeed: 175, coneRange: 155, coneHalf: 0.72, hearRadius: 320, color: '#ff7a7a', name: 'Hound' },
  warden: { speed: 38, patrolSpeed: 38, chaseSpeed: 95, coneRange: 305, coneHalf: 0.45, hearRadius: 200, color: '#c9a7ff', name: 'Warden' },
};

export const LANTERN = { radius: 130, douseRange: 46, noticeRange: 320 };
export const PEBBLE = { speed: 420, hearRadius: 260, maxFlight: 0.6 };
export const LOOT = { coinPoints: 50, levelBase: 500, timeBonusMax: 300, timeBonusPerSec: 5 };
