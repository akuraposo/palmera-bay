// Keyboard and mouse, read once a frame. Keys held are a live set; actions
// (confirm, pause, punch, enter car, shoot) are edge-triggered and consumed
// with takeActions(), so one press never fires twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_PUNCH = 4;
export const ACTION_ENTER = 8;
export const ACTION_SHOOT = 16;
export const ACTION_MUTE = 32;

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let mouse = { x: 0, y: 0, down: false };
  let clicked = false;

  function keyToAction(code) {
    if (code === 'Space' || code === 'Enter') return ACTION_CONFIRM;
    if (code === 'KeyP' || code === 'Escape') return ACTION_PAUSE;
    if (code === 'KeyF') return ACTION_PUNCH;
    if (code === 'KeyE') return ACTION_ENTER;
    if (code === 'KeyM') return ACTION_MUTE;
    return 0;
  }

  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) {
      held.add(event.code);
      queued |= keyToAction(event.code);
    }
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top, down: mouse.down };
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top, down: true };
    clicked = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    /** -1 / 0 / 1 along each axis from WASD or the arrow keys. */
    move() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y, run: held.has('ShiftLeft') || held.has('ShiftRight') };
    },
    /** W/S throttle and A/D steering while driving; Space is the handbrake. */
    drive() {
      return {
        throttle: (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0),
        steer: (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) - (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0),
        brake: held.has('Space'),
      };
    },
    mouse() {
      return mouse;
    },
    /** True on the frame the mouse was clicked (also a confirm). */
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
    takeActions() {
      const actions = queued | (clicked ? ACTION_SHOOT | ACTION_CONFIRM : 0);
      queued = 0;
      clicked = false;
      return actions;
    },
    unlockAudio(audio) {
      audio.unlock();
    },
  };
}
