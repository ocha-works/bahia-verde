// input.js — keyboard and mouse state for the game.
// The loop polls `keys` (a Set of codes currently held) and `pressed`
// (codes that went down since the last frame, cleared by the loop),
// and reads the mouse position in canvas coordinates plus its button.

export const keys = new Set();
export const pressed = new Set();
export const mouse = { x: 0, y: 0, down: false, clicked: false };

let attached = false;

export function attachInput(canvas) {
  if (attached) return;
  attached = true;

  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    // Keep the page from scrolling or tabbing away mid-chase.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  const updateMouse = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (event.clientX - rect.left) * scaleX;
    mouse.y = (event.clientY - rect.top) * scaleY;
  };
  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (event) => {
    updateMouse(event);
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
}

// Called once per frame after the frame's logic has consumed the edges.
export function endFrameInput() {
  pressed.clear();
  mouse.clicked = false;
}

export function moveAxis() {
  let x = 0;
  let y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  return { x, y };
}
