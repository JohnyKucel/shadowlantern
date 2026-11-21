// The screenshot scenes behind ?shot=start|play|hide|end. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot that
// follows the level's safe route, waits out patrols in the dark and backs out
// of any cone it is caught standing in — so the frame is what a short game
// really looks like, and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_CAUGHT, EVENT_LEVELDONE, EVENT_OVER, EVENT_WIN } from './world.js';
import { GUARD_CALM, thiefInCone, lightAt } from './guards.js';
import { SCREEN_LEVELDONE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const LEVEL_LIMIT_SECONDS = 300;
const WAYPOINT_REACH = 26;

function directionTo(state, targetX, targetY) {
  const thief = state.thief;
  const dx = targetX - thief.x;
  const dy = targetY - thief.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { mx: 0, my: 0, dist };
  return { mx: dx / dist, my: dy / dist, dist };
}

// The autopilot's one decision per step: which way to move, and whether to
// freeze. It sneaks everywhere — slow, quiet, and nearly invisible in shadow.
function autopilotStep(state) {
  const thief = state.thief;
  const route = state.level.route;
  let waypointIndex = state.autopilotWaypoint || 0;
  if (waypointIndex >= route.length) waypointIndex = route.length - 1;
  const target = route[waypointIndex];
  const toward = directionTo(state, target[0], target[1]);
  if (toward.dist < WAYPOINT_REACH) {
    state.autopilotWaypoint = waypointIndex + 1;
    return { mx: 0, my: 0, sneak: true };
  }

  // Any guard that can see the thief right now is the threat to answer.
  let threat = null;
  for (const guard of state.guards) {
    if (thiefInCone(guard, thief, state.blockers)) {
      threat = guard;
      break;
    }
  }
  if (threat) {
    const lit = lightAt(thief.x, thief.y, state.lanterns);
    if (lit > 0.25) {
      // Caught in the light: back away from the guard until the cone lets go.
      const away = directionTo(state, thief.x * 2 - threat.x, thief.y * 2 - threat.y);
      return { mx: away.mx, my: away.my, sneak: true };
    }
    // In shadow the meter fills slower than it drains once the guard looks
    // away, so freezing and waiting the patrol out is the right move.
    return { mx: 0, my: 0, sneak: true };
  }
  // A guard already suspicious of this spot: wait until it calms down.
  for (const guard of state.guards) {
    if (guard.meter > 0.3) return { mx: 0, my: 0, sneak: true };
  }
  return { mx: toward.mx, my: toward.my, sneak: true };
}

function runAutopilot(world, seconds) {
  const state = world.state;
  state.autopilotWaypoint = 0;
  const steps = Math.floor(seconds / STEP);
  let events = 0;
  for (let index = 0; index < steps; index += 1) {
    events = world.step(STEP, autopilotStep(state));
    if (events & (EVENT_LEVELDONE | EVENT_WIN | EVENT_OVER)) break;
    if (events & EVENT_CAUGHT) break;
  }
  return events;
}

// The hide scene: the thief crouched behind the Copper Gate's middle crate
// while a Watcher's cone sweeps past it. The crate genuinely blocks the
// line of sight, so the meter stays at zero while the cone covers the crate.
function stageHide(world) {
  world.loadLevel(0);
  const state = world.state;
  state.thief.x = 584;
  state.thief.y = 210;
  state.thief.sneaking = true;
  const guard = state.guards[0];
  guard.x = 430;
  guard.y = 100;
  guard.angle = Math.atan2(140 - 100, 584 - 430);
  guard.waypoint = 1;
  guard.state = GUARD_CALM;
  guard.meter = 0;
  for (let index = 0; index < 90; index += 1) {
    world.step(STEP, { mx: 0, my: 0, sneak: true });
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

/**
 * Set `world` to the named scene (start, play, hide or end) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'hide') return stageHide(world);
  if (name !== 'play' && name !== 'end') {
    world.resetRun();
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { mx: 0, my: 0, sneak: false });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    world.resetRun();
    world.loadLevel(1);
    runAutopilot(world, PLAY_SECONDS);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // end: the autopilot plays the whole run, manor by manor, until it wins.
  world.resetRun();
  let events = 0;
  for (let level = 0; level < 3; level += 1) {
    events = runAutopilot(world, LEVEL_LIMIT_SECONDS);
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    if (events & EVENT_LEVELDONE) {
      world.advance();
      continue;
    }
    break;
  }
  const over = world.state.status === 'over';
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
