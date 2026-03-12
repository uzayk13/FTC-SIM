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

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onGamepadConnected: (e: GamepadEvent) => void;
  private onGamepadDisconnected: (e: GamepadEvent) => void;

  constructor() {
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
  }

  private pollGamepad() {
    if (!this.gamepadConnected) return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) return;

    const deadzone = 0.1;
    const applyDeadzone = (v: number) => Math.abs(v) < deadzone ? 0 : v;

    this.gamepad1 = {
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
      this.gamepad2 = {
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

  // Unified axis getters combining keyboard + gamepad
  getAxis(name: string): number {
    switch (name) {
      case 'forward': {
        let v = 0;
        if (this.keys.has('KeyW')) v += 1;
        if (this.keys.has('KeyS')) v -= 1;
        if (this.gamepadConnected) v += this.gamepad1.left_stick_y;
        return Math.max(-1, Math.min(1, v));
      }
      case 'strafe': {
        let v = 0;
        if (this.keys.has('KeyA')) v -= 1;
        if (this.keys.has('KeyD')) v += 1;
        if (this.gamepadConnected) v += this.gamepad1.left_stick_x;
        return Math.max(-1, Math.min(1, v));
      }
      case 'turn': {
        let v = 0;
        if (this.keys.has('KeyQ')) v -= 1;
        if (this.keys.has('KeyE')) v += 1;
        if (this.gamepadConnected) v += this.gamepad1.right_stick_x;
        return Math.max(-1, Math.min(1, v));
      }
      case 'shooterPitch': {
        let v = 0;
        if (this.keys.has('ArrowUp')) v += 1;
        if (this.keys.has('ArrowDown')) v -= 1;
        if (this.gamepadConnected) v += this.gamepad1.right_stick_y;
        return Math.max(-1, Math.min(1, v));
      }
      case 'shooterYaw': {
        let v = 0;
        if (this.keys.has('ArrowLeft')) v -= 1;
        if (this.keys.has('ArrowRight')) v += 1;
        return Math.max(-1, Math.min(1, v));
      }
      default:
        return 0;
    }
  }

  isPressed(name: string): boolean {
    switch (name) {
      case 'shoot':
        return this.keys.has('Space') || (this.gamepadConnected && this.gamepad1.a);
      case 'intakeIn':
        return this.keys.has('KeyZ') || (this.gamepadConnected && this.gamepad1.left_bumper);
      case 'intakeOut':
        return this.keys.has('KeyX') || (this.gamepadConnected && this.gamepad1.right_bumper);
      case 'boost':
        return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
               (this.gamepadConnected && this.gamepad1.b);
      case 'reset':
        return this.keys.has('KeyR');
      case 'freecam':
        return this.keys.has('KeyF');
      case 'cam1':
        return this.keys.has('Digit1');
      case 'cam2':
        return this.keys.has('Digit2');
      case 'cam3':
        return this.keys.has('Digit3');
      default:
        return false;
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
