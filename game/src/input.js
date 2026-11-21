// Keyboard and mouse, turned into a direction vector plus edge-triggered
// actions. Holding a key never repeats an action: each press is consumed once
// by takeActions(), and the direction is read fresh every frame.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PEBBLE = 8;
export const ACTION_RESTART = 16;
export const ACTION_MUTE = 32;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM | ACTION_INTERACT,
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_INTERACT,
  KeyQ: ACTION_PEBBLE,
  KeyR: ACTION_RESTART,
  KeyM: ACTION_MUTE,
};

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function onKeyDown(event) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) queued |= action;
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    mouseDown = true;
    queued |= ACTION_CONFIRM;
  }

  function onMouseUp() {
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  function direction() {
    let x = 0;
    let y = 0;
    if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
    if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
    if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
    if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
    return { x, y };
  }

  function takeActions() {
    const actions = queued;
    queued = 0;
    return actions;
  }

  // Synthetic input for the shot autopilot and for tests: press a key as if
  // a finger hit it. Only used by shots.js, never by the live loop.
  function press(code) {
    onKeyDown({ code, repeat: false, preventDefault() {} });
  }

  function release(code) {
    onKeyUp({ code });
  }

  return {
    direction,
    takeActions,
    press,
    release,
    isSneaking() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
  };
}
