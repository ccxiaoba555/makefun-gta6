// Vice Bay — keyboard and mouse input.
// Tracks which keys are held and which were just pressed this frame, so the
// game loop can ask "is W down?" and "did the player just hit E?" separately.

export const GAME_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyJ', 'KeyK', 'KeyE', 'KeyM', 'KeyP', 'KeyQ', 'KeyR', 'KeyG',
  'Digit1', 'Digit2', 'Digit3',
  'Space', 'Enter', 'Escape',
];

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.onTap = null; // called on any fresh key press (used to wake audio)
    this.onClick = null; // called with {x, y} in canvas pixels
    this._keydown = (event) => {
      if (GAME_KEYS.includes(event.code)) event.preventDefault();
      if (!event.repeat) {
        this.pressed.add(event.code);
        if (this.onTap) this.onTap(event.code);
      }
      this.down.add(event.code);
    };
    this._keyup = (event) => {
      this.down.delete(event.code);
    };
    this._blur = () => {
      this.down.clear();
    };
    this._mousedown = (event) => {
      if (this.onClick) {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (event.currentTarget.width / rect.width);
        const y = (event.clientY - rect.top) * (event.currentTarget.height / rect.height);
        this.onClick({ x, y });
      }
    };
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
    window.addEventListener('blur', this._blur);
  }

  attachCanvas(canvas) {
    canvas.addEventListener('mousedown', this._mousedown);
  }

  isDown(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  // True once for the frame the key went down; reading it consumes it.
  wasPressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  // Any fresh press at all, consumed.
  anyPressed() {
    if (this.pressed.size === 0) return null;
    const first = this.pressed.values().next().value;
    this.pressed.clear();
    return first;
  }

  endFrame() {
    this.pressed.clear();
  }
}
