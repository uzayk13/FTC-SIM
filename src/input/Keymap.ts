export type GamepadIdx = 1 | 2;

export const AXIS_FIELDS = [
  'left_stick_x',
  'left_stick_y',
  'right_stick_x',
  'right_stick_y',
  'left_trigger',
  'right_trigger',
] as const;

export const BUTTON_FIELDS = [
  'a', 'b', 'x', 'y',
  'left_bumper', 'right_bumper',
  'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right',
  'start', 'back',
] as const;

export type AxisField = (typeof AXIS_FIELDS)[number];
export type ButtonField = (typeof BUTTON_FIELDS)[number];
export type GamepadField = AxisField | ButtonField;

export interface AxisBinding { positive?: string; negative?: string }
export interface ButtonBinding { key?: string }

export interface GamepadBindings {
  axes: Partial<Record<AxisField, AxisBinding>>;
  buttons: Partial<Record<ButtonField, ButtonBinding>>;
}

export interface Keymap {
  gamepad1: GamepadBindings;
  gamepad2: GamepadBindings;
}

export function isAxisField(f: string): f is AxisField {
  return (AXIS_FIELDS as readonly string[]).includes(f);
}
export function isButtonField(f: string): f is ButtonField {
  return (BUTTON_FIELDS as readonly string[]).includes(f);
}

export function emptyBindings(): GamepadBindings {
  return { axes: {}, buttons: {} };
}

export function emptyKeymap(): Keymap {
  return { gamepad1: emptyBindings(), gamepad2: emptyBindings() };
}

/**
 * Default keymap — mirrors the old hardcoded behavior in InputManager so
 * existing users feel nothing changed. gamepad2 is unbound by default.
 */
export function defaultKeymap(): Keymap {
  return {
    gamepad1: {
      axes: {
        left_stick_y: { positive: 'KeyW', negative: 'KeyS' },
        left_stick_x: { positive: 'KeyD', negative: 'KeyA' },
        right_stick_x: { positive: 'KeyE', negative: 'KeyQ' },
      },
      buttons: {
        a: { key: 'Space' },
        b: { key: 'ShiftLeft' },
        x: { key: 'KeyR' },
        y: { key: 'KeyF' },
        left_bumper: { key: 'KeyZ' },
        right_bumper: { key: 'KeyX' },
        dpad_up: { key: 'ArrowUp' },
        dpad_down: { key: 'ArrowDown' },
        dpad_left: { key: 'ArrowLeft' },
        dpad_right: { key: 'ArrowRight' },
      },
    },
    gamepad2: emptyBindings(),
  };
}

const STORAGE_KEY = 'ftc-sim-keymap-v1';

export function loadSavedKeymap(): Keymap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Keymap;
  } catch {
    return null;
  }
}

export function saveKeymap(km: Keymap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(km));
  } catch { /* ignore quota errors */ }
}

/** Reserved keys — never used for gamepad bindings. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'KeyF',      // freecam toggle
  'Digit1', 'Digit2', 'Digit3', // camera modes
  'KeyH',      // controls panel toggle
  'Escape',
]);

/** Pretty name for a KeyboardEvent.code, for display in UI. */
export function displayKey(code: string | undefined): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Space': return 'Space';
    case 'ShiftLeft': return 'Shift';
    case 'ShiftRight': return 'R-Shift';
    case 'ControlLeft': return 'Ctrl';
    case 'ControlRight': return 'R-Ctrl';
    case 'AltLeft': return 'Alt';
    case 'AltRight': return 'R-Alt';
    case 'ArrowUp': return '↑';
    case 'ArrowDown': return '↓';
    case 'ArrowLeft': return '←';
    case 'ArrowRight': return '→';
    case 'Enter': return 'Enter';
    case 'Backspace': return 'Backspace';
    case 'Tab': return 'Tab';
    case 'Escape': return 'Esc';
    default: return code;
  }
}
