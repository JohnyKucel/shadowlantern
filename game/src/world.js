// The game's rules and state, with no drawing and no browser in it: the thief,
// the guards, the lanterns, the loot and the exit. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sounds,
// screens) without the world knowing about them. Nothing here reads the clock:
// the same seed and the same inputs always give the same game.
import { FIELD, LANTERN, LOOT, PEBBLE, PEBBLES_PER_LEVEL, THIEF } from './config.js';
import { LEVELS } from './levels.js';
import { createGuard, stepGuard } from './guards.js';

export const EVENT_COIN = 1;
export const EVENT_MOONSTONE = 2;
export const EVENT_DOUSE = 4;
export const EVENT_PEBBLE = 8;
export const EVENT_SPOTTED = 16;
export const EVENT_ALARM = 32;
export const EVENT_CAUGHT = 64;
export const EVENT_LEVELDONE = 128;
export const EVENT_OVER = 256;
export const EVENT_WIN = 512;

function circleHitsRect(cx, cy, radius, rect) {
  const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < radius * radius;
}

function overlapsRect(ax, ay, aw, ah, rect) {
  return ax < rect.x + rect.w && ax + aw > rect.x && ay < rect.y + rect.h && ay + ah > rect.y;
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: null,
    thief: null,
    guards: [],
    lanterns: [],
    coins: [],
    moonstone: null,
    exit: null,
    pebbles: [],
    pebble: null,
    noise: null,
    dousedLamp: null,
    blockers: [],
    score: 0,
    levelScore: 0,
    coinsTaken: 0,
    lives: 3,
    seen: false,
    seenLevel: false,
    levelTime: 0,
    runTime: 0,
    status: 'playing',
    ghostBonus: false,
  };

  function collide(entity, radius) {
    for (let index = 0; index < state.blockers.length; index += 1) {
      const rect = state.blockers[index];
      const nearX = Math.max(rect.x, Math.min(entity.x, rect.x + rect.w));
      const nearY = Math.max(rect.y, Math.min(entity.y, rect.y + rect.h));
      let dx = entity.x - nearX;
      let dy = entity.y - nearY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radius * radius) continue;
      if (distSq === 0) {
        // Dead centre of a block: push out along the smallest penetration.
        const left = entity.x - rect.x;
        const right = rect.x + rect.w - entity.x;
        const top = entity.y - rect.y;
        const bottom = rect.y + rect.h - entity.y;
        const smallest = Math.min(left, right, top, bottom);
        if (smallest === left) entity.x = rect.x - radius;
        else if (smallest === right) entity.x = rect.x + rect.w + radius;
        else if (smallest === top) entity.y = rect.y - radius;
        else entity.y = rect.y + rect.h + radius;
        continue;
      }
      const dist = Math.sqrt(distSq);
      dx /= dist;
      dy /= dist;
      entity.x = nearX + dx * radius;
      entity.y = nearY + dy * radius;
    }
    entity.x = Math.max(THIEF.radius, Math.min(FIELD.width - THIEF.radius, entity.x));
    entity.y = Math.max(THIEF.radius, Math.min(FIELD.height - THIEF.radius, entity.y));
  }

  function loadLevel(index) {
    const def = LEVELS[index];
    state.levelIndex = index;
    state.level = def;
    state.thief = {
      x: def.start.x, y: def.start.y, vx: 0, vy: 0,
      angle: -Math.PI / 2, sneaking: false, moving: false,
    };
    state.guards = def.guards.map((guardDef, guardIndex) => createGuard(guardDef, guardIndex));
    state.lanterns = def.lanterns.map((lamp) => ({ x: lamp.x, y: lamp.y, lit: true }));
    state.coins = def.coins.map((coinDef) => ({ x: coinDef.x, y: coinDef.y, taken: false }));
    state.moonstone = { x: def.moonstone.x, y: def.moonstone.y, taken: false };
    state.exit = { x: def.exit.x, y: def.exit.y, w: def.exit.w, h: def.exit.h, open: false };
    state.pebble = null;
    state.noise = null;
    state.dousedLamp = null;
    state.blockers = [...def.walls, ...def.cover];
    state.levelScore = 0;
    state.coinsTaken = 0;
    state.seenLevel = false;
    state.levelTime = 0;
    state.status = 'playing';
  }

  function resetRun() {
    state.score = 0;
    state.lives = 3;
    state.seen = false;
    state.runTime = 0;
    loadLevel(0);
  }

  function restartLevel() {
    loadLevel(state.levelIndex);
  }

  function finishLevel() {
    const timeBonus = Math.max(0, LOOT.timeBonusMax - Math.floor(state.levelTime) * LOOT.timeBonusPerSec);
    let gained = LOOT.levelBase + state.coinsTaken * LOOT.coinPoints + timeBonus;
    state.ghostBonus = !state.seenLevel;
    if (state.ghostBonus) gained *= 2;
    state.levelScore = gained;
    state.score += gained;
    if (state.levelIndex + 1 >= LEVELS.length) {
      state.status = 'won';
      return EVENT_WIN;
    }
    state.status = 'leveldone';
    return EVENT_LEVELDONE;
  }

  function advance() {
    loadLevel(state.levelIndex + 1);
  }

  // One fixed step. `input` is { mx, my, sneak, interact, pebble, pebbleX, pebbleY }.
  // mx/my is the wanted move direction (-1..1); pebble* is an edge trigger.
  function step(dt, input) {
    let events = 0;
    if (state.status !== 'playing') return events;
    state.levelTime += dt;
    state.runTime += dt;
    state.dousedLamp = null;
    const thief = state.thief;

    // Move the thief: accelerate toward the wanted direction, damp the rest.
    const speed = input.sneak ? THIEF.sneakSpeed : THIEF.walkSpeed;
    thief.sneaking = Boolean(input.sneak);
    const wantX = input.mx || 0;
    const wantY = input.my || 0;
    const wantLen = Math.hypot(wantX, wantY);
    thief.moving = wantLen > 0.05;
    if (thief.moving) {
      const nx = wantX / Math.max(1, wantLen);
      const ny = wantY / Math.max(1, wantLen);
      thief.vx += nx * THIEF.accel * dt;
      thief.vy += ny * THIEF.accel * dt;
      thief.angle = Math.atan2(ny, nx);
    }
    const damp = Math.max(0, 1 - THIEF.damping * dt);
    thief.vx *= damp;
    thief.vy *= damp;
    const vel = Math.hypot(thief.vx, thief.vy);
    if (vel > speed) {
      thief.vx = (thief.vx / vel) * speed;
      thief.vy = (thief.vy / vel) * speed;
    }
    thief.x += thief.vx * dt;
    thief.y += thief.vy * dt;
    collide(thief, THIEF.radius);

    // Interact: douse the nearest lit lantern within reach.
    if (input.interact) {
      for (let index = 0; index < state.lanterns.length; index += 1) {
        const lamp = state.lanterns[index];
        if (!lamp.lit) continue;
        if (Math.hypot(lamp.x - thief.x, lamp.y - thief.y) <= LANTERN.douseRange) {
          lamp.lit = false;
          state.dousedLamp = lamp;
          events |= EVENT_DOUSE;
          break;
        }
      }
    }

    // Throw a pebble toward the aim point (or the facing direction).
    if (input.pebble && state.pebbles.length < 99 && pebbleCount() < PEBBLES_PER_LEVEL && !state.pebble) {
      const aimX = input.pebbleX ?? thief.x + Math.cos(thief.angle) * 120;
      const aimY = input.pebbleY ?? thief.y + Math.sin(thief.angle) * 120;
      const dx = aimX - thief.x;
      const dy = aimY - thief.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      state.pebble = {
        x: thief.x, y: thief.y,
        vx: (dx / dist) * PEBBLE.speed, vy: (dy / dist) * PEBBLE.speed,
        time: 0,
      };
      state.pebbles.push(1);
      events |= EVENT_PEBBLE;
    }
    if (state.pebble) {
      const pebble = state.pebble;
      pebble.time += dt;
      pebble.x += pebble.vx * dt;
      pebble.y += pebble.vy * dt;
      let landed = pebble.time >= PEBBLE.maxFlight;
      for (let index = 0; !landed && index < state.blockers.length; index += 1) {
        if (circleHitsRect(pebble.x, pebble.y, 4, state.blockers[index])) landed = true;
      }
      if (landed) {
        state.noise = { x: pebble.x, y: pebble.y, time: 1.2, radius: PEBBLE.hearRadius };
        state.pebble = null;
      }
    }
    if (state.noise) {
      state.noise.time -= dt;
      if (state.noise.time <= 0) state.noise = null;
    }

    // Loot: coins and the Moonstone are picked up by touch.
    for (let index = 0; index < state.coins.length; index += 1) {
      const coinDef = state.coins[index];
      if (coinDef.taken) continue;
      if (Math.hypot(coinDef.x - thief.x, coinDef.y - thief.y) < THIEF.radius + 14) {
        coinDef.taken = true;
        state.coinsTaken += 1;
        events |= EVENT_COIN;
      }
    }
    if (!state.moonstone.taken
      && Math.hypot(state.moonstone.x - thief.x, state.moonstone.y - thief.y) < THIEF.radius + 16) {
      state.moonstone.taken = true;
      state.exit.open = true;
      events |= EVENT_MOONSTONE;
    }

    // Guards think, chase and catch.
    const guardEvents = { spotted: false, alarm: false, caught: false };
    const guardWorld = {
      thief, lanterns: state.lanterns, blockers: state.blockers,
      noise: state.noise, dousedLamp: state.dousedLamp, collide, seen: state.seen,
    };
    for (let index = 0; index < state.guards.length; index += 1) {
      stepGuard(state.guards[index], dt, guardWorld, guardEvents);
    }
    state.seen = guardWorld.seen;
    if (state.seen) state.seenLevel = true;
    if (guardEvents.spotted) events |= EVENT_SPOTTED;
    if (guardEvents.alarm) events |= EVENT_ALARM;
    if (guardEvents.caught) {
      state.lives -= 1;
      if (state.lives <= 0) {
        state.status = 'over';
        events |= EVENT_OVER;
      } else {
        state.status = 'caught';
        events |= EVENT_CAUGHT;
      }
      return events;
    }

    // The exit opens only once the Moonstone is taken.
    if (state.exit.open
      && overlapsRect(thief.x - THIEF.radius, thief.y - THIEF.radius, THIEF.radius * 2, THIEF.radius * 2, state.exit)) {
      events |= finishLevel();
    }
    return events;
  }

  function pebbleCount() {
    return state.pebbles.length;
  }

  function pebblesLeft() {
    return Math.max(0, PEBBLES_PER_LEVEL - state.pebbles.length);
  }

  resetRun();
  return { state, resetRun, loadLevel, restartLevel, advance, step, pebblesLeft, collide };
}
