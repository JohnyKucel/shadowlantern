// The three manors. Each level is plain data: walls and cover (rectangles that
// block movement and line of sight), lanterns (pools of light), guard patrols,
// loot, the Moonstone, the exit door and the thief's start. A `route` of
// waypoints threads the safe lane through the manor; the screenshot autopilot
// follows it, and a patient player can too.
import { FIELD } from './config.js';

const BORDER = 24;

function borderWalls() {
  return [
    { x: 0, y: 0, w: FIELD.width, h: BORDER },
    { x: 0, y: FIELD.height - BORDER, w: FIELD.width, h: BORDER },
    { x: 0, y: 0, w: BORDER, h: FIELD.height },
    { x: FIELD.width - BORDER, y: 0, w: BORDER, h: FIELD.height },
  ];
}

function crate(x, y) { return { x, y, w: 48, h: 48, kind: 'crate' }; }
function hedge(x, y, w = 72) { return { x, y, w, h: 32, kind: 'hedge' }; }
function pillar(x, y) { return { x, y, w: 36, h: 36, kind: 'pillar' }; }
function lantern(x, y) { return { x, y, lit: true }; }
function coin(x, y) { return { x, y, taken: false }; }
function watcher(points) { return { kind: 'watcher', waypoints: points }; }
function hound(points) { return { kind: 'hound', waypoints: points }; }
function warden(points) { return { kind: 'warden', waypoints: points }; }

export const LEVELS = [
  {
    name: 'Copper Gate',
    subtitle: 'Two Watchers mind the gate. Learn their rounds.',
    start: { x: 88, y: 632 },
    moonstone: { x: 1152, y: 108 },
    exit: { x: 1188, y: 636, w: 56, h: 48 },
    walls: [
      ...borderWalls(),
      { x: 400, y: BORDER, w: 24, h: 260 },
      { x: 820, y: 436, w: 24, h: 236 },
      { x: 620, y: 330, w: 150, h: 24 },
    ],
    cover: [
      crate(300, 480), crate(560, 150), hedge(880, 300), crate(700, 560),
      pillar(1020, 130), hedge(180, 300), crate(940, 560),
    ],
    lanterns: [lantern(250, 150), lantern(650, 120), lantern(950, 480), lantern(500, 560)],
    guards: [
      watcher([[300, 200], [700, 200]]),
      watcher([[1000, 180], [1000, 560]]),
    ],
    coins: [coin(350, 620), coin(880, 92), coin(620, 430)],
    route: [
      [88, 632], [280, 620], [280, 340], [480, 340], [480, 120], [700, 120],
      [860, 120], [860, 190], [860, 430], [940, 430], [940, 360], [1000, 360],
      [1000, 100], [1152, 108],
      [1152, 300], [1120, 620], [1188, 660],
    ],
  },
  {
    name: 'Silver Hall',
    subtitle: 'A Hound runs the lower hall. The side room hides bonus loot.',
    start: { x: 88, y: 108 },
    moonstone: { x: 1152, y: 620 },
    exit: { x: 56, y: 636, w: 56, h: 48 },
    walls: [
      ...borderWalls(),
      { x: 300, y: BORDER, w: 24, h: 320 },
      { x: 300, y: 480, w: 24, h: 216 },
      { x: 700, y: 200, w: 24, h: 300 },
      { x: 980, y: BORDER, w: 24, h: 240 },
      { x: 1004, y: 300, w: 96, h: 24 },
      { x: 1160, y: 300, w: 96, h: 24 },
    ],
    cover: [
      crate(180, 300), hedge(480, 120), crate(560, 420), hedge(820, 560),
      pillar(880, 120), crate(1040, 470), hedge(420, 600), crate(1080, 120),
    ],
    lanterns: [
      lantern(180, 200), lantern(520, 90), lantern(840, 160), lantern(620, 340),
      lantern(1080, 380), lantern(420, 620),
    ],
    guards: [
      watcher([[180, 150], [620, 150]]),
      watcher([[520, 420], [900, 420]]),
      watcher([[1060, 430], [1060, 620]]),
      hound([[150, 600], [620, 600]]),
    ],
    coins: [coin(1120, 120), coin(1180, 180), coin(640, 620)],
    route: [
      [88, 108], [200, 108], [200, 260], [260, 260], [260, 420], [420, 420],
      [420, 560], [620, 560], [760, 560], [760, 420], [920, 420], [920, 560],
      [1152, 620], [1152, 420], [920, 420], [920, 560], [920, 620], [620, 620],
      [620, 560], [420, 560], [420, 420], [260, 420], [260, 260], [200, 260],
      [120, 260], [120, 560], [84, 660],
    ],
  },
  {
    name: 'Moonstone Vault',
    subtitle: 'Wardens hold the chokepoints. The vault is crossed, never rushed.',
    start: { x: 88, y: 632 },
    moonstone: { x: 640, y: 360 },
    exit: { x: 56, y: 56, w: 56, h: 48 },
    walls: [
      ...borderWalls(),
      { x: 300, y: BORDER, w: 24, h: 280 },
      { x: 300, y: 440, w: 24, h: 256 },
      { x: 940, y: BORDER, w: 24, h: 280 },
      { x: 940, y: 440, w: 24, h: 256 },
      { x: 500, y: 180, w: 280, h: 24 },
      { x: 500, y: 516, w: 280, h: 24 },
      { x: 500, y: 204, w: 24, h: 120 },
      { x: 756, y: 396, w: 24, h: 120 },
    ],
    cover: [
      crate(180, 200), hedge(420, 420), crate(860, 200), hedge(760, 560),
      pillar(600, 300), pillar(660, 420), crate(1100, 340), hedge(180, 480),
    ],
    lanterns: [
      lantern(180, 120), lantern(640, 90), lantern(1100, 120), lantern(420, 300),
      lantern(860, 300), lantern(180, 600), lantern(640, 640), lantern(1100, 600),
    ],
    guards: [
      warden([[380, 300], [380, 620]]),
      warden([[900, 200], [900, 520]]),
      watcher([[640, 120], [640, 150]]),
      watcher([[200, 360], [200, 560]]),
      hound([[600, 620], [1000, 620]]),
    ],
    coins: [coin(640, 110), coin(1100, 620), coin(180, 360)],
    route: [
      [88, 632], [140, 632], [140, 500], [140, 380], [380, 380], [460, 380],
      [560, 380], [560, 420], [640, 420], [640, 360],
      [700, 300], [800, 280], [820, 140], [400, 140], [400, 380], [200, 380],
      [120, 380], [120, 200], [120, 100], [84, 80],
    ],
  },
];

export function levelCount() {
  return LEVELS.length;
}
