import type { Keymap, GamepadBindings } from './Keymap';
import { AXIS_FIELDS, BUTTON_FIELDS, defaultKeymap } from './Keymap';

export interface GamepadState {
  left_stick_x: number;
  left_stick_y: number;
  right_stick_x: number;
  right_stick_y: number;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  left_bumper: boolean;
  right_bumper: boolean;
  left_trigger: number;
  right_trigger: number;
  dpad_up: boolean;
  dpad_down: boolean;
  dpad_left: boolean;
  dpad_right: boolean;
  start: boolean;
  back: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private gamepadConnected = false;
  private gamepadIndex = -1;

  gamepad1: GamepadState = this.emptyGamepad();
  gamepad2: GamepadState = this.emptyGamepad();

  // Physical gamepad readings, before keyboard composition.
  private physical1: GamepadState = this.emptyGamepad();
  private physical2: GamepadState = this.emptyGamepad();

  private keymap: Keymap = defaultKeymap();

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onGamepadConnected: (e: GamepadEvent) => void;
  private onGamepadDisconnected: (e: GamepadEvent) => void;

  constructor(keymap?: Keymap) {
    if (keymap) this.keymap = keymap;
    this.onKeyDown = (e: KeyboardEvent) => {
      // Don't capture input when typing in textarea
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      this.keys.add(e.code);
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    this.onGamepadConnected = (e: GamepadEvent) => {
      this.gamepadConnected = true;
      this.gamepadIndex = e.gamepad.index;
      document.getElementById('gamepad-indicator')?.classList.remove('hidden');
    };

    this.onGamepadDisconnected = () => {
      this.gamepadConnected = false;
      this.gamepadIndex = -1;
      document.getElementById('gamepad-indicator')?.classList.add('hidden');
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  private emptyGamepad(): GamepadState {
    return {
      left_stick_x: 0, left_stick_y: 0,
      right_stick_x: 0, right_stick_y: 0,
      a: false, b: false, x: false, y: false,
      left_bumper: false, right_bumper: false,
      left_trigger: 0, right_trigger: 0,
      dpad_up: false, dpad_down: false,
      dpad_left: false, dpad_right: false,
      start: false, back: false,
    };
  }

  update() {
    this.pollGamepad();
    this.gamepad1 = this.compose(this.physical1, this.keymap.gamepad1);
    this.gamepad2 = this.compose(this.physical2, this.keymap.gamepad2);
  }

  setKeymap(keymap: Keymap) {
    this.keymap = keymap;
  }

  /**
   * Build the final gamepad state for this frame from the physical reading
   * (if any) plus current keyboard. Both are recomputed every frame, so
   * releasing a key returns the field to rest immediately.
   */
  private compose(physical: GamepadState, bindings: GamepadBindings): GamepadState {
    const out: GamepadState = { ...physical };

    for (const field of AXIS_FIELDS) {
      const b = bindings.axes[field];
      if (!b) continue;
      const isTrigger = field === 'left_trigger' || field === 'right_trigger';
      const physicalActive = isTrigger ? physical[field] > 0.01 : Math.abs(physical[field]) > 0.01;
      if (physicalActive) continue;
      if (isTrigger) {
        out[field] = b.positive && this.keys.has(b.positive) ? 1 : 0;
      } else {
        const pos = b.positive && this.keys.has(b.positive) ? 1 : 0;
        const neg = b.negative && this.keys.has(b.negative) ? 1 : 0;
        out[field] = pos - neg;
      }
    }

    for (const field of BUTTON_FIELDS) {
      const b = bindings.buttons[field];
      if (!b || !b.key) continue;
      out[field] = physical[field] || this.keys.has(b.key);
    }

    return out;
  }

  private pollGamepad() {
    // Reset physical state each frame so disconnects / no-input return to rest.
    this.physical1 = this.emptyGamepad();
    this.physical2 = this.emptyGamepad();

    if (!this.gamepadConnected) return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) return;

    const deadzone = 0.1;
    const applyDeadzone = (v: number) => Math.abs(v) < deadzone ? 0 : v;

    this.physical1 = {
      left_stick_x: applyDeadzone(gp.axes[0] ?? 0),
      left_stick_y: applyDeadzone(-(gp.axes[1] ?? 0)), // invert Y
      right_stick_x: applyDeadzone(gp.axes[2] ?? 0),
      right_stick_y: applyDeadzone(-(gp.axes[3] ?? 0)),
      a: gp.buttons[0]?.pressed ?? false,
      b: gp.buttons[1]?.pressed ?? false,
      x: gp.buttons[2]?.pressed ?? false,
      y: gp.buttons[3]?.pressed ?? false,
      left_bumper: gp.buttons[4]?.pressed ?? false,
      right_bumper: gp.buttons[5]?.pressed ?? false,
      left_trigger: gp.buttons[6]?.value ?? 0,
      right_trigger: gp.buttons[7]?.value ?? 0,
      dpad_up: gp.buttons[12]?.pressed ?? false,
      dpad_down: gp.buttons[13]?.pressed ?? false,
      dpad_left: gp.buttons[14]?.pressed ?? false,
      dpad_right: gp.buttons[15]?.pressed ?? false,
      start: gp.buttons[9]?.pressed ?? false,
      back: gp.buttons[8]?.pressed ?? false,
    };

    // Second gamepad
    const gp2 = gamepads[this.gamepadIndex + 1];
    if (gp2) {
      this.physical2 = {
        left_stick_x: applyDeadzone(gp2.axes[0] ?? 0),
        left_stick_y: applyDeadzone(-(gp2.axes[1] ?? 0)),
        right_stick_x: applyDeadzone(gp2.axes[2] ?? 0),
        right_stick_y: applyDeadzone(-(gp2.axes[3] ?? 0)),
        a: gp2.buttons[0]?.pressed ?? false,
        b: gp2.buttons[1]?.pressed ?? false,
        x: gp2.buttons[2]?.pressed ?? false,
        y: gp2.buttons[3]?.pressed ?? false,
        left_bumper: gp2.buttons[4]?.pressed ?? false,
        right_bumper: gp2.buttons[5]?.pressed ?? false,
        left_trigger: gp2.buttons[6]?.value ?? 0,
        right_trigger: gp2.buttons[7]?.value ?? 0,
        dpad_up: gp2.buttons[12]?.pressed ?? false,
        dpad_down: gp2.buttons[13]?.pressed ?? false,
        dpad_left: gp2.buttons[14]?.pressed ?? false,
        dpad_right: gp2.buttons[15]?.pressed ?? false,
        start: gp2.buttons[9]?.pressed ?? false,
        back: gp2.buttons[8]?.pressed ?? false,
      };
    }
  }

  /**
   * Unified axis getters. Movement axes read from the keymap-driven
   * gamepad1 state so remaps apply here too; camera/sim keys stay raw.
   */
  getAxis(name: string): number {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    switch (name) {
      case 'forward': return clamp(this.gamepad1.left_stick_y);
      case 'strafe': return clamp(this.gamepad1.left_stick_x);
      case 'turn': return clamp(this.gamepad1.right_stick_x);
      case 'shooterPitch': return clamp(this.gamepad1.right_stick_y);
      case 'shooterYaw': {
        // Historically dpad_left/right; follow whatever is bound to them now.
        const l = this.gamepad1.dpad_left ? 1 : 0;
        const r = this.gamepad1.dpad_right ? 1 : 0;
        return clamp(r - l);
      }
      default:
        return 0;
    }
  }

  isPressed(name: string): boolean {
    switch (name) {
      // Gamepad-driven (follow keymap)
      case 'shoot': return this.gamepad1.a;
      case 'intakeIn': return this.gamepad1.left_bumper;
      case 'intakeOut': return this.gamepad1.right_bumper;
      case 'boost': return this.gamepad1.b;
      // Sim-only, hardcoded
      case 'reset': return this.keys.has('KeyR');
      case 'freecam': return this.keys.has('KeyF');
      case 'cam1': return this.keys.has('Digit1');
      case 'cam2': return this.keys.has('Digit2');
      case 'cam3': return this.keys.has('Digit3');
      default: return false;
    }
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }
}
