// Guard brains: patrol, suspicion, chase, hunt — plus the geometry every
// stealth question needs (is the thief inside this cone, and does any wall or
// crate stand between them). Pure functions of the world state: no DOM here,
// so Node can import this file and drive the same rules in a test.
import { DETECTION, GUARD_KINDS, LANTERN, THIEF } from './config.js';

export const GUARD_CALM = 0;
export const GUARD_SUSPICIOUS = 1;
export const GUARD_ALERTED = 2;
export const GUARD_HUNT = 3;
export const GUARD_INVESTIGATE = 4;
const PEBBLE_HEAR = 260;

// Does the segment (x1,y1)-(x2,y2) cross the rectangle? (Slab test.)
export function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let low = 0;
  let high = 1;
  if (dx === 0) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    let a = (rect.x - x1) / dx;
    let b = (rect.x + rect.w - x1) / dx;
    if (a > b) { const t = a; a = b; b = t; }
    low = Math.max(low, a);
    high = Math.min(high, b);
    if (low > high) return false;
  }
  if (dy === 0) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    let a = (rect.y - y1) / dy;
    let b = (rect.y + rect.h - y1) / dy;
    if (a > b) { const t = a; a = b; b = t; }
    low = Math.max(low, a);
    high = Math.min(high, b);
    if (low > high) return false;
  }
  return true;
}

// True when nothing (wall or cover) stands between the two points.
export function hasLineOfSight(x1, y1, x2, y2, blockers) {
  for (let index = 0; index < blockers.length; index += 1) {
    if (segmentHitsRect(x1, y1, x2, y2, blockers[index])) return false;
  }
  return true;
}

// Is the thief inside this guard's vision cone (range + angle + sight line)?
export function thiefInCone(guard, thief, blockers) {
  const kind = GUARD_KINDS[guard.kind];
  const dx = thief.x - guard.x;
  const dy = thief.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > kind.coneRange || dist < 1) return false;
  let angleDiff = Math.atan2(dy, dx) - guard.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  if (Math.abs(angleDiff) > kind.coneHalf) return false;
  return hasLineOfSight(guard.x, guard.y, thief.x, thief.y, blockers);
}

// How lit is a point: 1 inside a lit lantern's pool, fading to 0 outside it.
export function lightAt(x, y, lanterns) {
  let lit = 0;
  for (let index = 0; index < lanterns.length; index += 1) {
    const lamp = lanterns[index];
    if (!lamp.lit) continue;
    const dist = Math.hypot(x - lamp.x, y - lamp.y);
    if (dist < LANTERN.radius) lit = Math.max(lit, 1 - dist / LANTERN.radius);
  }
  return lit;
}

function angleTo(fromX, fromY, toX, toY) {
  return Math.atan2(toY - fromY, toX - fromX);
}

function turnToward(guard, targetAngle, dt) {
  let diff = targetAngle - guard.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = 3.2 * dt;
  guard.angle += Math.max(-turn, Math.min(turn, diff));
}

function moveToward(guard, targetX, targetY, speed, dt, collide) {
  const dx = targetX - guard.x;
  const dy = targetY - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return true;
  const stepX = (dx / dist) * speed * dt;
  const stepY = (dy / dist) * speed * dt;
  guard.x += stepX;
  guard.y += stepY;
  guard.angle = angleTo(guard.x - stepX, guard.y - stepY, guard.x, guard.y);
  collide(guard);
  return Math.hypot(targetX - guard.x, targetY - guard.y) < 6;
}

export function createGuard(def, index) {
  const kind = GUARD_KINDS[def.kind];
  const first = def.waypoints[0];
  return {
    id: index,
    kind: def.kind,
    name: kind.name,
    x: first[0],
    y: first[1],
    angle: 0,
    waypoint: 0,
    waypoints: def.waypoints,
    state: GUARD_CALM,
    meter: 0,
    lastSeenX: first[0],
    lastSeenY: first[1],
    lostSight: 0,
    huntTimer: 0,
    pauseTimer: 0,
    speed: kind.speed,
  };
}

// One fixed step of one guard. `world` carries thief, lanterns, blockers and
// the noise events of this step; `events` collects bit flags for the caller.
export function stepGuard(guard, dt, world, events) {
  const kind = GUARD_KINDS[guard.kind];
  const thief = world.thief;
  const seen = thiefInCone(guard, thief, world.blockers);
  const lit = lightAt(thief.x, thief.y, world.lanterns);
  const dist = Math.hypot(thief.x - guard.x, thief.y - guard.y);

  if (seen) {
    let rate = lit > 0.25 ? DETECTION.fillLit : DETECTION.fillShadow;
    if (thief.sneaking) rate *= DETECTION.sneakFactor;
    if (!thief.sneaking) rate *= DETECTION.runFactor;
    if (dist < DETECTION.closeRange) rate *= DETECTION.closeBoost;
    const before = guard.meter;
    guard.meter = Math.min(1, guard.meter + rate * dt);
    guard.lastSeenX = thief.x;
    guard.lastSeenY = thief.y;
    guard.lostSight = 0;
    if (before < DETECTION.suspiciousAt && guard.meter >= DETECTION.suspiciousAt) {
      events.spotted = true;
    }
    if (guard.meter >= DETECTION.alertedAt && guard.state !== GUARD_ALERTED) {
      guard.state = GUARD_ALERTED;
      events.alarm = true;
      world.seen = true;
    }
  } else {
    guard.meter = Math.max(0, guard.meter - DETECTION.decay * dt);
    guard.lostSight += dt;
    if (guard.state === GUARD_ALERTED && guard.lostSight > DETECTION.loseSightAfter) {
      guard.state = GUARD_HUNT;
      guard.huntTimer = DETECTION.huntAfter;
    }
  }

  // A running thief is loud: guards nearby turn toward the footsteps.
  if (!thief.sneaking && thief.moving && dist < THIEF.noiseRadius) {
    if (guard.state === GUARD_CALM) {
      guard.state = GUARD_SUSPICIOUS;
      guard.lastSeenX = thief.x;
      guard.lastSeenY = thief.y;
    }
  }

  // A pebble landing nearby pulls every guard that can hear it.
  if (world.noise && world.noise.time > 0) {
    const noiseDist = Math.hypot(world.noise.x - guard.x, world.noise.y - guard.y);
    if (noiseDist < Math.max(kind.hearRadius, PEBBLE_HEAR)) {
      if (guard.state !== GUARD_ALERTED) {
        guard.state = GUARD_INVESTIGATE;
        guard.lastSeenX = world.noise.x;
        guard.lastSeenY = world.noise.y;
      }
    }
  }

  // A doused lantern a guard can see makes it suspicious of that spot.
  if (world.dousedLamp && guard.state === GUARD_CALM) {
    const lampDist = Math.hypot(world.dousedLamp.x - guard.x, world.dousedLamp.y - guard.y);
    if (lampDist < LANTERN.noticeRange
      && hasLineOfSight(guard.x, guard.y, world.dousedLamp.x, world.dousedLamp.y, world.blockers)) {
      guard.state = GUARD_SUSPICIOUS;
      guard.lastSeenX = world.dousedLamp.x;
      guard.lastSeenY = world.dousedLamp.y;
    }
  }

  switch (guard.state) {
    case GUARD_CALM: {
      if (guard.pauseTimer > 0) {
        guard.pauseTimer -= dt;
        break;
      }
      const target = guard.waypoints[guard.waypoint];
      const arrived = moveToward(guard, target[0], target[1], kind.patrolSpeed, dt, world.collide);
      if (arrived) {
        guard.waypoint = (guard.waypoint + 1) % guard.waypoints.length;
        guard.pauseTimer = 0.8;
      }
      break;
    }
    case GUARD_SUSPICIOUS: {
      const arrived = moveToward(guard, guard.lastSeenX, guard.lastSeenY, kind.patrolSpeed * 1.25, dt, world.collide);
      if (arrived || guard.meter <= 0.05) {
        guard.state = GUARD_CALM;
        guard.meter = Math.max(0, guard.meter - 0.2);
      }
      break;
    }
    case GUARD_ALERTED: {
      moveToward(guard, thief.x, thief.y, kind.chaseSpeed, dt, world.collide);
      if (dist < THIEF.catchRadius) events.caught = true;
      break;
    }
    case GUARD_HUNT: {
      guard.huntTimer -= dt;
      const arrived = moveToward(guard, guard.lastSeenX, guard.lastSeenY, kind.patrolSpeed, dt, world.collide);
      if (arrived) {
        guard.lastSeenX = guard.x + (guard.id % 2 === 0 ? 90 : -90);
        guard.lastSeenY = guard.y + 60;
      }
      if (guard.huntTimer <= 0) {
        guard.state = GUARD_CALM;
        guard.meter = 0.3;
      }
      break;
    }
    case GUARD_INVESTIGATE: {
      const arrived = moveToward(guard, guard.lastSeenX, guard.lastSeenY, kind.patrolSpeed * 1.4, dt, world.collide);
      if (arrived) {
        guard.state = GUARD_SUSPICIOUS;
        guard.pauseTimer = 1.2;
      }
      break;
    }
    default:
      break;
  }
  return events;
}
