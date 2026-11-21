// Everything the eye sees: the manor floor, the lantern light, the guards'
// vision cones, the thief, the loot and every screen. Drawing only — it never
// changes the rules, and it never reads the clock except through the time the
// caller hands it, so a staged shot paints the same frame every time.
import { COLORS, FIELD, LANTERN, LOOT, THIEF } from './config.js';
import { GUARD_ALERTED, GUARD_HUNT, GUARD_INVESTIGATE, GUARD_SUSPICIOUS, lightAt } from './guards.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_CAUGHT = 3;
export const SCREEN_LEVELDONE = 4;
export const SCREEN_OVER = 5;
export const SCREEN_WIN = 6;

const TILE = 64;

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const floats = [];
  let motes = null;

  function seedMotes(random) {
    motes = [];
    for (let index = 0; index < 90; index += 1) {
      motes.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        size: 1 + random() * 2,
        phase: random() * Math.PI * 2,
        speed: 0.2 + random() * 0.5,
      });
    }
  }

  function fit() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    ctx.setTransform(scale, 0, 0, scale, (canvas.width - FIELD.width * scale) / 2, (canvas.height - FIELD.height * scale) / 2);
  }

  function drawFloor(lanterns, time) {
    ctx.fillStyle = COLORS.backdrop;
    ctx.fillRect(-40, -40, FIELD.width + 80, FIELD.height + 80);
    for (let ty = 0; ty < FIELD.height / TILE; ty += 1) {
      for (let tx = 0; tx < FIELD.width / TILE; tx += 1) {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // Lantern pools: warm light on the floor, flickering almost imperceptibly.
    for (const lamp of lanterns) {
      if (!lamp.lit) continue;
      const flicker = 0.92 + 0.08 * Math.sin(time * 2.1 + lamp.x * 0.01 + lamp.y * 0.013);
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 8, lamp.x, lamp.y, LANTERN.radius * flicker);
      glow.addColorStop(0, 'rgba(255, 201, 77, 0.34)');
      glow.addColorStop(0.6, 'rgba(255, 201, 77, 0.12)');
      glow.addColorStop(1, 'rgba(255, 201, 77, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lamp.x - LANTERN.radius, lamp.y - LANTERN.radius, LANTERN.radius * 2, LANTERN.radius * 2);
    }
  }

  function drawCone(guard) {
    const kind = guard.kind;
    const range = kind === 'warden' ? 305 : kind === 'hound' ? 155 : 225;
    const half = kind === 'warden' ? 0.45 : kind === 'hound' ? 0.72 : 0.55;
    const hot = guard.state === GUARD_ALERTED;
    const gradient = ctx.createRadialGradient(guard.x, guard.y, 10, guard.x, guard.y, range);
    gradient.addColorStop(0, hot ? 'rgba(255, 93, 93, 0.42)' : 'rgba(255, 201, 77, 0.30)');
    gradient.addColorStop(1, hot ? 'rgba(255, 93, 93, 0.02)' : 'rgba(255, 201, 77, 0.02)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(guard.x, guard.y);
    ctx.arc(guard.x, guard.y, range, guard.angle - half, guard.angle + half);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hot ? 'rgba(255, 93, 93, 0.5)' : COLORS.coneEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawGuard(guard, time) {
    drawCone(guard);
    // Body: a cloaked figure, coloured by kind, facing its patrol direction.
    ctx.fillStyle = guard.kind === 'warden' ? '#c9a7ff' : guard.kind === 'hound' ? '#ff7a7a' : '#ff9d5c';
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.arc(guard.x + Math.cos(guard.angle) * 6, guard.y + Math.sin(guard.angle) * 6, 6, 0, Math.PI * 2);
    ctx.fill();
    // The eye above the head: a ring that fills with suspicion, red on alarm.
    const meter = guard.meter;
    if (meter > 0.03 || guard.state === GUARD_ALERTED) {
      const eyeY = guard.y - 26;
      ctx.fillStyle = 'rgba(7, 8, 24, 0.8)';
      ctx.beginPath();
      ctx.arc(guard.x, eyeY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = guard.state === GUARD_ALERTED ? COLORS.alarm : COLORS.gold;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(guard.x, eyeY, 7, -Math.PI / 2, -Math.PI / 2 + meter * Math.PI * 2);
      ctx.stroke();
      if (guard.state === GUARD_ALERTED) {
        ctx.fillStyle = COLORS.alarm;
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', guard.x, eyeY - 12);
      } else if (guard.state === GUARD_SUSPICIOUS || guard.state === GUARD_INVESTIGATE || guard.state === GUARD_HUNT) {
        ctx.fillStyle = COLORS.gold;
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', guard.x, eyeY - 12);
      }
    }
    // State label under the guard, so the player can read intent at a glance.
    if (guard.state !== 0) {
      ctx.fillStyle = guard.state === GUARD_ALERTED ? COLORS.alarm : COLORS.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = guard.state === GUARD_ALERTED ? 'ALERTED'
        : guard.state === GUARD_SUSPICIOUS ? 'suspicious'
        : guard.state === GUARD_INVESTIGATE ? 'investigating' : 'hunting';
      ctx.fillText(label, guard.x, guard.y + 30);
    }
  }

  function drawThief(thief, time) {
    // A running thief leaves a noise ring; a sneaking one crouches low.
    if (thief.moving && !thief.sneaking) {
      const pulse = (time % 0.6) / 0.6;
      ctx.strokeStyle = `rgba(78, 205, 196, ${0.35 * (1 - pulse)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(thief.x, thief.y, THIEF.radius + pulse * 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    const radius = thief.sneaking ? THIEF.radius - 3 : THIEF.radius;
    ctx.fillStyle = COLORS.thief;
    ctx.beginPath();
    ctx.arc(thief.x, thief.y, radius, 0, Math.PI * 2);
    ctx.fill();
    // Hood: a darker triangle pointing where the thief faces.
    ctx.fillStyle = COLORS.thiefDark;
    ctx.beginPath();
    ctx.moveTo(thief.x + Math.cos(thief.angle) * (radius + 7), thief.y + Math.sin(thief.angle) * (radius + 7));
    ctx.lineTo(thief.x + Math.cos(thief.angle + 2.5) * radius * 0.8, thief.y + Math.sin(thief.angle + 2.5) * radius * 0.8);
    ctx.lineTo(thief.x + Math.cos(thief.angle - 2.5) * radius * 0.8, thief.y + Math.sin(thief.angle - 2.5) * radius * 0.8);
    ctx.closePath();
    ctx.fill();
    if (thief.sneaking) {
      ctx.strokeStyle = 'rgba(244, 241, 230, 0.55)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(thief.x, thief.y, radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawWallsAndCover(level) {
    for (const wall of level.walls) {
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = COLORS.wallTop;
      ctx.fillRect(wall.x, wall.y, wall.w, 4);
    }
    for (const block of level.cover) {
      if (block.kind === 'crate') {
        ctx.fillStyle = COLORS.crate;
        ctx.fillRect(block.x, block.y, block.w, block.h);
        ctx.strokeStyle = COLORS.crateTop;
        ctx.lineWidth = 2;
        ctx.strokeRect(block.x + 3, block.y + 3, block.w - 6, block.h - 6);
        ctx.beginPath();
        ctx.moveTo(block.x, block.y);
        ctx.lineTo(block.x + block.w, block.y + block.h);
        ctx.moveTo(block.x + block.w, block.y);
        ctx.lineTo(block.x, block.y + block.h);
        ctx.stroke();
      } else if (block.kind === 'hedge') {
        ctx.fillStyle = COLORS.hedge;
        roundRect(ctx, block.x, block.y, block.w, block.h, 12);
        ctx.fill();
        ctx.fillStyle = COLORS.hedgeTop;
        for (let index = 0; index < 5; index += 1) {
          ctx.beginPath();
          ctx.arc(block.x + 10 + index * ((block.w - 20) / 4), block.y + block.h / 2, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = COLORS.pillar;
        ctx.beginPath();
        ctx.arc(block.x + block.w / 2, block.y + block.h / 2, block.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.wallTop;
        ctx.beginPath();
        ctx.arc(block.x + block.w / 2, block.y + block.h / 2, block.w / 2 - 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLanterns(lanterns, time) {
    for (const lamp of lanterns) {
      const flicker = lamp.lit ? 0.9 + 0.1 * Math.sin(time * 3 + lamp.x) : 0;
      ctx.fillStyle = '#1a1d33';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 9, 0, Math.PI * 2);
      ctx.fill();
      if (lamp.lit) {
        ctx.fillStyle = COLORS.gold;
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, 6 * flicker + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(lamp.x - 2, lamp.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = COLORS.muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lamp.x - 5, lamp.y - 5);
        ctx.lineTo(lamp.x + 5, lamp.y + 5);
        ctx.moveTo(lamp.x + 5, lamp.y - 5);
        ctx.lineTo(lamp.x - 5, lamp.y + 5);
        ctx.stroke();
      }
    }
  }

  function drawLoot(state, time) {
    const stone = state.moonstone;
    if (!stone.taken) {
      const pulse = 1 + 0.12 * Math.sin(time * 3);
      const glow = ctx.createRadialGradient(stone.x, stone.y, 2, stone.x, stone.y, 34 * pulse);
      glow.addColorStop(0, 'rgba(184, 167, 255, 0.55)');
      glow.addColorStop(1, 'rgba(184, 167, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(stone.x - 34, stone.y - 34, 68, 68);
      ctx.fillStyle = COLORS.moonstone;
      ctx.beginPath();
      ctx.moveTo(stone.x, stone.y - 14);
      ctx.lineTo(stone.x + 10, stone.y);
      ctx.lineTo(stone.x, stone.y + 14);
      ctx.lineTo(stone.x - 10, stone.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COLORS.white;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MOONSTONE', stone.x, stone.y - 22);
    }
    for (const coinDef of state.coins) {
      if (coinDef.taken) continue;
      ctx.fillStyle = COLORS.coin;
      ctx.beginPath();
      ctx.arc(coinDef.x, coinDef.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6d2f';
      ctx.beginPath();
      ctx.arc(coinDef.x, coinDef.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The exit: a green door once the Moonstone is taken, a locked one before.
    const exit = state.exit;
    ctx.fillStyle = exit.open ? COLORS.exit : '#5a3a3a';
    roundRect(ctx, exit.x, exit.y, exit.w, exit.h, 6);
    ctx.fill();
    ctx.fillStyle = exit.open ? '#0d2b16' : COLORS.white;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(exit.open ? 'EXIT' : 'LOCKED', exit.x + exit.w / 2, exit.y + exit.h / 2 + 5);
  }

  function drawPebble(state) {
    if (state.pebble) {
      ctx.fillStyle = '#c8c8d8';
      ctx.beginPath();
      ctx.arc(state.pebble.x, state.pebble.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.noise) {
      const pulse = 1 - state.noise.time / 1.2;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - pulse)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.noise.x, state.noise.y, 12 + pulse * state.noise.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawMotes(state, time) {
    if (!motes) return;
    ctx.fillStyle = 'rgba(255, 220, 130, 0.5)';
    for (const mote of motes) {
      const lit = lightAt(mote.x, mote.y, state.lanterns);
      if (lit < 0.2) continue;
      const drift = Math.sin(time * mote.speed + mote.phase) * 6;
      ctx.globalAlpha = 0.25 + 0.45 * lit;
      ctx.fillRect(mote.x + drift, mote.y + Math.cos(time * mote.speed * 0.7 + mote.phase) * 4, mote.size, mote.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats(dt) {
    for (let index = floats.length - 1; index >= 0; index -= 1) {
      const item = floats[index];
      item.life -= dt;
      if (item.life <= 0) {
        floats.splice(index, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, item.life / 0.5);
      ctx.fillStyle = item.color;
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.text, item.x, item.y - (1.2 - item.life) * 30);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(state, screen, best, ui) {
    ctx.fillStyle = 'rgba(7, 8, 24, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, 44);
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SHADOWLANTERN · ${state.level.name}`, 16, 28);
    ctx.textAlign = 'center';
    ctx.fillText(`SCORE ${state.score}`, FIELD.width / 2 - 60, 28);
    ctx.fillStyle = state.moonstone.taken ? COLORS.moonstone : COLORS.muted;
    ctx.fillText(state.moonstone.taken ? '◆ MOONSTONE TAKEN — REACH THE EXIT' : '◇ STEAL THE MOONSTONE', FIELD.width / 2 + 170, 28);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.white;
    ctx.fillText(`LIVES ${'♥'.repeat(state.lives)}${'♡'.repeat(Math.max(0, 3 - state.lives))}   PEBBLES ${ui.pebblesLeft}   BEST ${best}`, FIELD.width - 16, 28);
    // Bottom hint bar, only while playing.
    if (screen === SCREEN_PLAY) {
      ctx.fillStyle = 'rgba(7, 8, 24, 0.6)';
      ctx.fillRect(0, FIELD.height - 30, FIELD.width, 30);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WASD / arrows move · Shift sneak · Space douse lantern · Q throw pebble · P pause · M mute · R restart', FIELD.width / 2, FIELD.height - 10);
    }
    if (ui.muted) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('MUTED', FIELD.width - 16, 62);
    }
  }

  function panel(title, lines, accent) {
    const width = 640;
    const height = 120 + lines.length * 30;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    ctx.fillStyle = 'rgba(7, 8, 24, 0.88)';
    roundRect(ctx, x, y, width, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent || COLORS.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, 14);
    ctx.stroke();
    ctx.fillStyle = accent || COLORS.gold;
    ctx.font = 'bold 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, FIELD.width / 2, y + 58);
    ctx.fillStyle = COLORS.white;
    ctx.font = '17px system-ui, sans-serif';
    lines.forEach((line, index) => {
      ctx.fillText(line, FIELD.width / 2, y + 100 + index * 30);
    });
  }

  function drawScreen(state, screen, best, ui, time) {
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(7, 8, 24, 0.55)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 64px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('SHADOWLANTERN', FIELD.width / 2, 190);
      ctx.fillStyle = COLORS.white;
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Steal the Moonstone, reach the exit unseen.', FIELD.width / 2, 232);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('WASD / arrows move · Shift sneak · Space douse lantern · Q throw pebble', FIELD.width / 2, 300);
      ctx.fillText('Guards see you in the light. Shadows hide you. Seen means caught.', FIELD.width / 2, 328);
      ctx.fillStyle = COLORS.thief;
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(best > 0 ? `BEST SCORE ${best} — PRESS SPACE OR CLICK TO START` : 'PRESS SPACE OR CLICK TO START', FIELD.width / 2, 400);
    } else if (screen === SCREEN_PAUSED) {
      panel('PAUSED', ['The manor waits. Press P or Space to keep sneaking.'], COLORS.muted);
    } else if (screen === SCREEN_CAUGHT) {
      panel('CAUGHT!', [`A guard caught you in the light. ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.`, 'Press Space to try this manor again.'], COLORS.alarm);
    } else if (screen === SCREEN_LEVELDONE) {
      const lines = [
        `${state.level.name} cleared — ${state.levelScore} points`,
        state.ghostBonus ? 'GHOST BONUS ×2 — never seen!' : 'Seen along the way — ghost bonus missed.',
        `Loot ${state.coinsTaken} / 3 · Time ${Math.floor(state.levelTime)}s`,
        'Press Space for the next manor.',
      ];
      panel('MANOR CLEARED', lines, COLORS.exit);
    } else if (screen === SCREEN_OVER) {
      panel('THE LANTERNS WIN', [`Out of lives. Final score ${state.score}. Best ${best}.`, 'Press Space to steal again.'], COLORS.alarm);
    } else if (screen === SCREEN_WIN) {
      const rank = state.score >= 4000 ? 'MASTER THIEF' : state.score >= 3000 ? 'SHADOW' : state.score >= 2000 ? 'PROWLER' : 'PICKPOCKET';
      panel('ALL THREE MANORS CLEAN', [
        `Final score ${state.score} — rank: ${rank}`,
        `Best ${Math.max(best, state.score)} · Ghost runs earn double.`,
        'Press Space to play again.',
      ], COLORS.gold);
    }
  }

  function draw(state, screen, best, ui, time, dt) {
    fit();
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    drawFloor(state.lanterns, time);
    drawWallsAndCover(state.level);
    drawLanterns(state.lanterns, time);
    drawMotes(state, time);
    drawLoot(state, time);
    for (const guard of state.guards) drawGuard(guard, time);
    drawThief(state.thief, time);
    drawPebble(state);
    drawFloats(dt);
    // A soft vignette: the edges of the manor stay dark, like night.
    const vignette = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.35, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85);
    vignette.addColorStop(0, 'rgba(7, 8, 24, 0)');
    vignette.addColorStop(1, 'rgba(7, 8, 24, 0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawHud(state, screen, best, ui);
    drawScreen(state, screen, best, ui, time);
  }

  return {
    draw,
    seedMotes,
    addFloat(text, x, y, color) {
      floats.push({ text, x, y, color: color || COLORS.white, life: 1.2 });
    },
  };
}
