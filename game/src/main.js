// Boot and the one loop: input is read once per frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between seven screens: title,
// play, paused, caught, level complete, game over and victory.
//
// ?seed=N fixes the run. ?shot=start|play|hide|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_ALARM, EVENT_CAUGHT, EVENT_COIN, EVENT_DOUSE, EVENT_LEVELDONE,
  EVENT_MOONSTONE, EVENT_OVER, EVENT_PEBBLE, EVENT_SPOTTED, EVENT_WIN,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PEBBLE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_CAUGHT, SCREEN_LEVELDONE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Footsteps sound at most this often while the thief is moving. */
const FOOTSTEP_EVERY = 0.3;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
renderer.seedMotes(createRandom(seed ^ 0x9e3779b9));
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { pebblesLeft: world.pebblesLeft(), muted: false }, 0, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let footstepTimer = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    world.resetRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${LIVES} lives. Steal the Moonstone.`);
  }

  function endRun() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winRun() {
    screen = SCREEN_WIN;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Victory. All three manors clean. Score ${world.state.score}.`);
  }

  function react(events) {
    const state = world.state;
    if (events & EVENT_COIN) {
      audio.pickup();
      renderer.addFloat('+50', state.thief.x, state.thief.y - 20, '#ffd94d');
    }
    if (events & EVENT_MOONSTONE) {
      audio.moonstone();
      renderer.addFloat('MOONSTONE!', state.thief.x, state.thief.y - 24, '#b8a7ff');
      announce('Moonstone taken. Reach the exit.');
    }
    if (events & EVENT_DOUSE) audio.douse();
    if (events & EVENT_PEBBLE) audio.pebble();
    if (events & EVENT_SPOTTED) {
      audio.spotted();
      announce('A guard is suspicious.');
    }
    if (events & EVENT_ALARM) {
      audio.alarm();
      announce('Alarm! A guard is chasing you.');
    }
    if (events & EVENT_CAUGHT) {
      audio.caught();
      screen = SCREEN_CAUGHT;
      announce(`Caught. ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.`);
    }
    if (events & EVENT_LEVELDONE) {
      audio.levelDone();
      screen = SCREEN_LEVELDONE;
      announce(`${state.level.name} cleared. ${state.levelScore} points.`);
    }
    if (events & EVENT_OVER) {
      audio.caught();
      endRun();
    }
    if (events & EVENT_WIN) {
      audio.victory();
      winRun();
    }
  }

  // Screen changes. `actions` is this frame's edge-triggered input, read once
  // by frame() and shared with step() so a press is never spent twice.
  function handleActions(actions) {
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      world.restartLevel();
      screen = SCREEN_PLAY;
      announce('Manor restarted.');
      return;
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startRun();
      }
    } else if (screen === SCREEN_CAUGHT) {
      if (actions & ACTION_CONFIRM) {
        world.restartLevel();
        screen = SCREEN_PLAY;
        announce('Trying the manor again.');
      }
    } else if (screen === SCREEN_LEVELDONE) {
      if (actions & ACTION_CONFIRM) {
        world.advance();
        screen = SCREEN_PLAY;
        announce(`Manor ${world.state.levelIndex + 1}: ${world.state.level.name}.`);
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  // Mouse position translated into field coordinates, undoing the letterbox.
  function aimPoint() {
    const mouse = input.mouse();
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    return { x: (mouse.x - offsetX) / scale, y: (mouse.y - offsetY) / scale };
  }

  // One fixed step of the live game. Edge actions fire only on the first
  // step of the frame (the caller clears them after that).
  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, sneak: false });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const dir = input.direction();
    const aim = aimPoint();
    const events = world.step(STEP, {
      mx: dir.x,
      my: dir.y,
      sneak: input.isSneaking(),
      interact: Boolean(actions & ACTION_INTERACT),
      pebble: Boolean(actions & ACTION_PEBBLE),
      pebbleX: aim.x,
      pebbleY: aim.y,
    });
    const thief = world.state.thief;
    if (thief.moving && !thief.sneaking) {
      footstepTimer -= STEP;
      if (footstepTimer <= 0) {
        audio.footstep();
        footstepTimer = FOOTSTEP_EVERY;
      }
    }
    react(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    let actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      accumulator += dt;
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, { pebblesLeft: world.pebblesLeft(), muted: audio.isMuted() }, time, dt);
  }

  // Leaving the tab pauses a running game rather than letting guards hunt unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('SHADOWLANTERN. Steal the Moonstone, reach the exit unseen. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
