// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. Held keys live in state.keys; edge-triggered keys (buy,
// grenade, weapon slots) are collected in state.pressed and drained by takePressed.
export function createInput(canvas, onLockChange, onCanvasClick) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, pressed, locked: false, firing: false, lookX: 0, lookY: 0 };
  const EDGE_CODES = new Set(['KeyB', 'KeyG', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code) && EDGE_CODES.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); pressed.clear(); });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
    if (state.locked && event.button === 2) state.firing = true;
    // Clicking the bare canvas re-locks the pointer after a round change.
    if (!state.locked && event.target === canvas && onCanvasClick) onCanvasClick();
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0 || event.button === 2) state.firing = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
