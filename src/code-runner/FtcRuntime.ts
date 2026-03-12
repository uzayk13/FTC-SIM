/**
 * FTC SDK + FTCLib Runtime Stubs
 *
 * Creates JavaScript class stubs that mimic the FTC Robot Controller SDK
 * and FTCLib APIs, wired into the simulator's robot.
 */
import type { Engine } from '../core/Engine';

export interface FtcRuntimeContext {
  hardwareMap: any;
  telemetry: any;
  gamepad1: any;
  gamepad2: any;
  runtime: any;
  /** All stub classes available to user code */
  classes: Record<string, any>;
  /** Called every frame to sync motor powers → sim robot */
  syncMotors(): void;
}

export function createFtcRuntime(engine: Engine): FtcRuntimeContext {
  // ========================================================
  // Enums
  // ========================================================
  const DcMotorDirection = { FORWARD: 'FORWARD', REVERSE: 'REVERSE' };
  const DcMotorRunMode = {
    RUN_WITHOUT_ENCODER: 'RUN_WITHOUT_ENCODER',
    RUN_USING_ENCODER: 'RUN_USING_ENCODER',
    RUN_TO_POSITION: 'RUN_TO_POSITION',
    STOP_AND_RESET_ENCODER: 'STOP_AND_RESET_ENCODER',
  };
  const DcMotorZeroPowerBehavior = { BRAKE: 'BRAKE', FLOAT: 'FLOAT' };
  const ServoDirection = { FORWARD: 'FORWARD', REVERSE: 'REVERSE' };
  const AngleUnit = { RADIANS: 'RADIANS', DEGREES: 'DEGREES' };
  const DistanceUnit = { CM: 'CM', INCH: 'INCH', MM: 'MM', METER: 'METER' };
  const CurrentUnit = { AMPS: 'AMPS', MILLIAMPS: 'MILLIAMPS' };

  // GamepadKeys for FTCLib
  const GamepadKeysButton = {
    A: 'a', B: 'b', X: 'x', Y: 'y',
    DPAD_UP: 'dpad_up', DPAD_DOWN: 'dpad_down',
    DPAD_LEFT: 'dpad_left', DPAD_RIGHT: 'dpad_right',
    LEFT_BUMPER: 'left_bumper', RIGHT_BUMPER: 'right_bumper',
    BACK: 'back', START: 'start',
    LEFT_STICK_BUTTON: 'left_stick_button',
    RIGHT_STICK_BUTTON: 'right_stick_button',
  };
  const GamepadKeysTrigger = {
    LEFT_TRIGGER: 'left_trigger', RIGHT_TRIGGER: 'right_trigger',
  };

  // Motor RunMode for FTCLib
  const FtcLibMotorRunMode = {
    RawPower: 'RawPower',
    VelocityControl: 'VelocityControl',
    PositionControl: 'PositionControl',
  };

  // ========================================================
  // Hardware Stubs
  // ========================================================

  class DcMotorStub {
    _name: string;
    _power = 0;
    _direction = DcMotorDirection.FORWARD;
    _mode = DcMotorRunMode.RUN_WITHOUT_ENCODER;
    _zeroPowerBehavior = DcMotorZeroPowerBehavior.BRAKE;
    _targetPosition = 0;
    _currentPosition = 0;
    _velocity = 0;

    // Static enums accessible as DcMotor.Direction.FORWARD etc.
    static Direction = DcMotorDirection;
    static RunMode = DcMotorRunMode;
    static ZeroPowerBehavior = DcMotorZeroPowerBehavior;

    constructor(name: string) { this._name = name; }

    setPower(p: number) { this._power = p; }
    getPower() { return this._power; }
    setDirection(d: string) { this._direction = d; }
    getDirection() { return this._direction; }
    setMode(m: string) {
      this._mode = m;
      if (m === DcMotorRunMode.STOP_AND_RESET_ENCODER) {
        this._currentPosition = 0;
      }
    }
    getMode() { return this._mode; }
    setTargetPosition(p: number) { this._targetPosition = p; }
    getTargetPosition() { return this._targetPosition; }
    getCurrentPosition() { return this._currentPosition; }
    setZeroPowerBehavior(b: string) { this._zeroPowerBehavior = b; }
    getZeroPowerBehavior() { return this._zeroPowerBehavior; }
    isBusy() { return false; }
    // DcMotorEx methods
    setVelocity(v: number, _unit?: string) { this._velocity = v; this._power = v / 2800; }
    getVelocity(_unit?: string) { return this._velocity; }
    setTargetPositionTolerance(_t: number) {}
    getMotorType() { return {}; }
    setMotorType(_t: any) {}
    getCurrent(_unit: string) { return 0; }

    // Effective power accounting for direction
    get effectivePower() {
      return this._power * (this._direction === DcMotorDirection.REVERSE ? -1 : 1);
    }
  }

  class DcMotorExStub extends DcMotorStub {
    static Direction = DcMotorDirection;
    static RunMode = DcMotorRunMode;
    static ZeroPowerBehavior = DcMotorZeroPowerBehavior;
  }

  class ServoStub {
    _name: string;
    _position = 0.5;
    _direction = ServoDirection.FORWARD;
    static Direction = ServoDirection;

    constructor(name: string) { this._name = name; }
    setPosition(p: number) { this._position = Math.max(0, Math.min(1, p)); }
    getPosition() { return this._position; }
    setDirection(d: string) { this._direction = d; }
    getDirection() { return this._direction; }
    scaleRange(_min: number, _max: number) {}
  }

  class CRServoStub {
    _name: string;
    _power = 0;
    _direction = ServoDirection.FORWARD;
    static Direction = ServoDirection;

    constructor(name: string) { this._name = name; }
    setPower(p: number) { this._power = Math.max(-1, Math.min(1, p)); }
    getPower() { return this._power; }
    setDirection(d: string) { this._direction = d; }
    getDirection() { return this._direction; }
  }

  class ColorSensorStub {
    _name: string;
    constructor(name: string) { this._name = name; }
    red() { return 128; }
    green() { return 128; }
    blue() { return 128; }
    alpha() { return 255; }
    argb() { return 0xFFFFFFFF; }
  }

  class DistanceSensorStub {
    _name: string;
    constructor(name: string) { this._name = name; }
    getDistance(unit: string) {
      const baseCm = 50;
      if (unit === DistanceUnit.INCH) return baseCm / 2.54;
      if (unit === DistanceUnit.MM) return baseCm * 10;
      if (unit === DistanceUnit.METER) return baseCm / 100;
      return baseCm;
    }
  }

  class TouchSensorStub {
    _name: string;
    constructor(name: string) { this._name = name; }
    isPressed() { return false; }
    getValue() { return 0; }
  }

  class AnalogInputStub {
    _name: string;
    constructor(name: string) { this._name = name; }
    getVoltage() { return 0; }
    getMaxVoltage() { return 3.3; }
  }

  class DigitalChannelStub {
    _name: string;
    constructor(name: string) { this._name = name; }
    getState() { return false; }
    setState(_s: boolean) {}
    setMode(_m: string) {}
  }

  // IMU
  class IMUStub {
    _name: string;
    constructor(name: string) { this._name = name; }
    initialize(_params: any) {}
    resetYaw() {}
    getRobotYawPitchRollAngles() {
      const heading = (() => { const q = engine.robot.getQuaternion(); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z)); })() ?? 0;
      return {
        getYaw: (_unit?: string) => heading * (180 / Math.PI),
        getPitch: (_unit?: string) => 0,
        getRoll: (_unit?: string) => 0,
      };
    }
    getRobotAngularVelocity(_unit?: string) {
      return { xRotationRate: 0, yRotationRate: 0, zRotationRate: 0 };
    }
    getAngularOrientation(..._args: any[]) {
      const heading = (() => { const q = engine.robot.getQuaternion(); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z)); })() ?? 0;
      return { firstAngle: heading * (180 / Math.PI), secondAngle: 0, thirdAngle: 0 };
    }
    getAngularVelocity(..._args: any[]) {
      return { xRotationRate: 0, yRotationRate: 0, zRotationRate: 0 };
    }
    getLinearAcceleration() {
      return { xAccel: 0, yAccel: 0, zAccel: 0 };
    }
    getGravity() {
      return { xAccel: 0, yAccel: -9.81, zAccel: 0 };
    }
  }

  class BNO055IMUStub extends IMUStub {
    static Parameters = class {
      angleUnit = AngleUnit.DEGREES;
      accelUnit = 'METERS_PERSEC_PERSEC';
      loggingEnabled = false;
    };
    static SensorMode = { IMU: 'IMU', NDOF: 'NDOF' };
  }

  class RevHubOrientationOnRobotStub {
    static LogoFacingDirection = {
      UP: 'UP', DOWN: 'DOWN', FORWARD: 'FORWARD', BACKWARD: 'BACKWARD',
      LEFT: 'LEFT', RIGHT: 'RIGHT',
    };
    static UsbFacingDirection = {
      UP: 'UP', DOWN: 'DOWN', FORWARD: 'FORWARD', BACKWARD: 'BACKWARD',
      LEFT: 'LEFT', RIGHT: 'RIGHT',
    };
    constructor(_logo?: string, _usb?: string) {}
  }

  class IMUParametersStub {
    imuOrientationOnRobot: any;
    constructor(orientation?: any) {
      this.imuOrientationOnRobot = orientation;
    }
  }

  class VoltageSensorStub {
    _name: string;
    constructor(name: string) { this._name = name; }
    getVoltage() { return 12.0; }
  }

  class LynxModuleStub {
    static BulkCachingMode = {
      OFF: 'OFF', AUTO: 'AUTO', MANUAL: 'MANUAL',
    };
    setBulkCachingMode(_m: string) {}
    clearBulkCache() {}
  }

  // ========================================================
  // ElapsedTime
  // ========================================================
  class ElapsedTimeStub {
    private _start = performance.now();
    static Resolution = { SECONDS: 'SECONDS', MILLISECONDS: 'MILLISECONDS' };

    constructor(_resolution?: string) {
      this._start = performance.now();
    }
    reset() { this._start = performance.now(); }
    seconds() { return (performance.now() - this._start) / 1000; }
    milliseconds() { return performance.now() - this._start; }
    time() { return this.seconds(); }
    startTime() { return this._start; }
    toString() { return `${this.seconds().toFixed(3)} seconds`; }
  }

  // ========================================================
  // Range utility
  // ========================================================
  const RangeStub = {
    clip(value: number, min: number, max: number) {
      return Math.max(min, Math.min(max, value));
    },
    scale(n: number, x1: number, x2: number, y1: number, y2: number) {
      const a = (n - x1) / (x2 - x1);
      return y1 + a * (y2 - y1);
    },
  };

  // ========================================================
  // Telemetry
  // ========================================================
  class TelemetryStub {
    private _data: Map<string, string> = new Map();
    private _lines: string[] = [];
    private _autoClear = true;

    addData(caption: string, ...args: any[]) {
      let value: string;
      if (args.length >= 2 && typeof args[0] === 'string') {
        // Format string: addData("key", "%.2f", val)
        try {
          value = this._format(args[0], ...args.slice(1));
        } catch {
          value = String(args[0]);
        }
      } else {
        value = String(args[0]);
      }
      this._data.set(caption, value);
      return this;
    }

    addLine(line?: string) {
      this._lines.push(line ?? '');
      return this;
    }

    clear() {
      this._data.clear();
      this._lines = [];
    }

    update() {
      // Push to robot telemetry
      for (const [k, v] of this._data) {
        engine.robot.telemetry[k] = v;
      }
      for (let i = 0; i < this._lines.length; i++) {
        engine.robot.telemetry[`_line${i}`] = this._lines[i];
      }
      if (this._autoClear) {
        this._data.clear();
        this._lines = [];
      }
    }

    isAutoClear() { return this._autoClear; }
    setAutoClear(v: boolean) { this._autoClear = v; }
    isAutomaticClear() { return this._autoClear; }
    setAutomaticClear(v: boolean) { this._autoClear = v; }
    setMsTransmissionInterval(_ms: number) {}
    speak(_text: string, _lang?: string) {}

    private _format(fmt: string, ...args: any[]): string {
      let i = 0;
      return fmt.replace(/%[.\d]*[dfsbeox%]/g, (match) => {
        if (match === '%%') return '%';
        const val = args[i++];
        if (match.includes('d')) return String(Math.floor(Number(val)));
        if (match.includes('f')) {
          const precision = match.match(/\.(\d+)/);
          return precision ? Number(val).toFixed(Number(precision[1])) : String(val);
        }
        return String(val);
      });
    }
  }

  // ========================================================
  // HardwareMap
  // ========================================================
  const allDevices = new Map<string, any>();

  function getOrCreate(name: string, Factory: any): any {
    const key = name.toLowerCase().replace(/\s+/g, '');
    if (!allDevices.has(key)) {
      allDevices.set(key, new Factory(name));
    }
    return allDevices.get(key);
  }

  class DeviceMapping {
    private _factory: any;
    constructor(factory: any) { this._factory = factory; }
    get(name: string) { return getOrCreate(name, this._factory); }
  }

  class HardwareMapStub {
    dcMotor = new DeviceMapping(DcMotorStub);
    dcMotorEx = new DeviceMapping(DcMotorExStub);
    servo = new DeviceMapping(ServoStub);
    crservo = new DeviceMapping(CRServoStub);
    colorSensor = new DeviceMapping(ColorSensorStub);
    distanceSensor = new DeviceMapping(DistanceSensorStub);
    touchSensor = new DeviceMapping(TouchSensorStub);
    analogInput = new DeviceMapping(AnalogInputStub);
    digitalChannel = new DeviceMapping(DigitalChannelStub);
    imu = new DeviceMapping(IMUStub);
    voltageSensor = new DeviceMapping(VoltageSensorStub);

    get(classRefOrName: any, name?: string): any {
      const deviceName = name ?? classRefOrName;
      // If called with a class ref as first arg, try to pick the right factory
      if (name !== undefined && classRefOrName) {
        const typeName = classRefOrName?._ftcType ?? classRefOrName?.name ?? '';
        const factories: Record<string, any> = {
          DcMotor: DcMotorStub,
          DcMotorEx: DcMotorExStub,
          Servo: ServoStub,
          CRServo: CRServoStub,
          ColorSensor: ColorSensorStub,
          DistanceSensor: DistanceSensorStub,
          TouchSensor: TouchSensorStub,
          IMU: IMUStub,
          BNO055IMU: BNO055IMUStub,
          AnalogInput: AnalogInputStub,
          DigitalChannel: DigitalChannelStub,
          VoltageSensor: VoltageSensorStub,
          LynxModule: LynxModuleStub,
        };
        const Factory = factories[typeName] ?? DcMotorStub;
        return getOrCreate(name, Factory);
      }
      return getOrCreate(deviceName, DcMotorStub);
    }

    getAll(classRef: any): any[] {
      const typeName = classRef?._ftcType ?? classRef?.name ?? '';
      if (typeName === 'LynxModule') return [new LynxModuleStub()];
      return [];
    }

    getNamesOf(_device: any) { return new Set<string>(); }
    contains(name: string) { return allDevices.has(name.toLowerCase().replace(/\s+/g, '')); }
  }

  // ========================================================
  // FTCLib — PID Controllers
  // ========================================================
  class PIDControllerStub {
    private _kP: number;
    private _kI: number;
    private _kD: number;
    private _setpoint = 0;
    private _integral = 0;
    private _prevError = 0;
    private _prevTime = performance.now();

    constructor(kP: number, kI: number, kD: number) {
      this._kP = kP; this._kI = kI; this._kD = kD;
    }

    calculate(measurement: number, setpoint?: number): number {
      if (setpoint !== undefined) this._setpoint = setpoint;
      const now = performance.now();
      const dt = (now - this._prevTime) / 1000;
      this._prevTime = now;

      const error = this._setpoint - measurement;
      this._integral += error * dt;
      const derivative = dt > 0 ? (error - this._prevError) / dt : 0;
      this._prevError = error;

      return this._kP * error + this._kI * this._integral + this._kD * derivative;
    }

    setPID(kP: number, kI: number, kD: number) {
      this._kP = kP; this._kI = kI; this._kD = kD;
    }
    setSetpoint(sp: number) { this._setpoint = sp; }
    getSetpoint() { return this._setpoint; }
    atSetPoint() { return Math.abs(this._prevError) < 0.01; }
    setTolerance(t: number) { void t; }
    setIntegrationBounds(_min: number, _max: number) {}
    reset() { this._integral = 0; this._prevError = 0; this._prevTime = performance.now(); }
    getPositionError() { return this._prevError; }
  }

  class PIDFControllerStub extends PIDControllerStub {
    private _kF: number;
    constructor(kP: number, kI: number, kD: number, kF: number) {
      super(kP, kI, kD);
      this._kF = kF;
    }
    calculate(measurement: number, setpoint?: number): number {
      return super.calculate(measurement, setpoint) + this._kF * this.getSetpoint();
    }
    setF(kF: number) { this._kF = kF; }
  }

  // Feedforward controllers
  class SimpleMotorFeedforwardStub {
    private _kS: number; private _kV: number; private _kA: number;
    constructor(kS: number, kV: number, kA = 0) {
      this._kS = kS; this._kV = kV; this._kA = kA;
    }
    calculate(velocity: number, acceleration = 0) {
      return this._kS * Math.sign(velocity) + this._kV * velocity + this._kA * acceleration;
    }
  }

  class ElevatorFeedforwardStub extends SimpleMotorFeedforwardStub {
    private _kG: number;
    constructor(kS: number, kG: number, kV: number, kA = 0) {
      super(kS, kV, kA);
      this._kG = kG;
    }
    calculate(velocity: number, acceleration = 0) {
      return super.calculate(velocity, acceleration) + this._kG;
    }
  }

  class ArmFeedforwardStub {
    private _kS: number; private _kCos: number; private _kV: number; private _kA: number;
    constructor(kS: number, kCos: number, kV: number, kA = 0) {
      this._kS = kS; this._kCos = kCos; this._kV = kV; this._kA = kA;
    }
    calculate(positionRadians: number, velocity: number, acceleration = 0) {
      return this._kS * Math.sign(velocity) +
        this._kCos * Math.cos(positionRadians) +
        this._kV * velocity + this._kA * acceleration;
    }
  }

  // ========================================================
  // FTCLib — Geometry
  // ========================================================
  class Rotation2dStub {
    private _radians: number;
    constructor(radians = 0) { this._radians = radians; }
    static fromDegrees(deg: number) { return new Rotation2dStub(deg * Math.PI / 180); }
    getRadians() { return this._radians; }
    getDegrees() { return this._radians * 180 / Math.PI; }
    getCos() { return Math.cos(this._radians); }
    getSin() { return Math.sin(this._radians); }
    getTan() { return Math.tan(this._radians); }
    rotateBy(other: Rotation2dStub) {
      return new Rotation2dStub(this._radians + other._radians);
    }
    unaryMinus() { return new Rotation2dStub(-this._radians); }
    minus(other: Rotation2dStub) { return new Rotation2dStub(this._radians - other._radians); }
    plus(other: Rotation2dStub) { return this.rotateBy(other); }
    equals(other: any) { return other instanceof Rotation2dStub && Math.abs(this._radians - other._radians) < 1e-9; }
  }

  class Translation2dStub {
    private _x: number; private _y: number;
    constructor(x = 0, y = 0) { this._x = x; this._y = y; }
    getX() { return this._x; }
    getY() { return this._y; }
    getDistance(other: Translation2dStub) {
      return Math.hypot(this._x - other._x, this._y - other._y);
    }
    getNorm() { return Math.hypot(this._x, this._y); }
    rotateBy(rotation: Rotation2dStub) {
      const cos = rotation.getCos();
      const sin = rotation.getSin();
      return new Translation2dStub(this._x * cos - this._y * sin, this._x * sin + this._y * cos);
    }
    plus(other: Translation2dStub) { return new Translation2dStub(this._x + other._x, this._y + other._y); }
    minus(other: Translation2dStub) { return new Translation2dStub(this._x - other._x, this._y - other._y); }
    times(scalar: number) { return new Translation2dStub(this._x * scalar, this._y * scalar); }
    div(scalar: number) { return new Translation2dStub(this._x / scalar, this._y / scalar); }
  }

  class Pose2dStub {
    private _translation: Translation2dStub;
    private _rotation: Rotation2dStub;
    constructor(xOrTranslation: any = 0, yOrRotation: any = 0, rotation?: any) {
      if (xOrTranslation instanceof Translation2dStub) {
        this._translation = xOrTranslation;
        this._rotation = yOrRotation instanceof Rotation2dStub ? yOrRotation : new Rotation2dStub();
      } else {
        this._translation = new Translation2dStub(xOrTranslation, yOrRotation);
        this._rotation = rotation instanceof Rotation2dStub ? rotation : new Rotation2dStub(rotation ?? 0);
      }
    }
    getX() { return this._translation.getX(); }
    getY() { return this._translation.getY(); }
    getRotation() { return this._rotation; }
    getTranslation() { return this._translation; }
    getHeading() { return this._rotation.getRadians(); }
    transformBy(transform: any) {
      return new Pose2dStub(
        this._translation.plus(transform.getTranslation().rotateBy(this._rotation)),
        this._rotation.plus(transform.getRotation())
      );
    }
    relativeTo(other: Pose2dStub) {
      const t = this._translation.minus(other._translation).rotateBy(other._rotation.unaryMinus());
      return new Pose2dStub(t, this._rotation.minus(other._rotation));
    }
    plus(other: any) { return this.transformBy(other); }
  }

  class Transform2dStub {
    private _translation: Translation2dStub;
    private _rotation: Rotation2dStub;
    constructor(translation?: Translation2dStub, rotation?: Rotation2dStub) {
      this._translation = translation ?? new Translation2dStub();
      this._rotation = rotation ?? new Rotation2dStub();
    }
    getTranslation() { return this._translation; }
    getRotation() { return this._rotation; }
  }

  // ========================================================
  // FTCLib — GamepadEx
  // ========================================================
  class GamepadExStub {
    private _gamepad: any;
    constructor(gamepad: any) { this._gamepad = gamepad; }
    getButton(button: string) {
      return !!this._gamepad[button];
    }
    getTrigger(trigger: string) {
      return this._gamepad[trigger] ?? 0;
    }
    getLeftX() { return this._gamepad.left_stick_x ?? 0; }
    getLeftY() { return this._gamepad.left_stick_y ?? 0; }
    getRightX() { return this._gamepad.right_stick_x ?? 0; }
    getRightY() { return this._gamepad.right_stick_y ?? 0; }
    getRawGamepad() { return this._gamepad; }
    getGamepadButton(button: string) {
      return new GamepadButtonStub(this, button);
    }
    getGamepadTrigger(trigger: string) {
      return new GamepadTriggerStub(this, trigger);
    }
    isDown(button: string) { return this.getButton(button); }
    wasJustPressed(_button: string) { return false; }
    wasJustReleased(_button: string) { return false; }
    stateJustChanged(_button: string) { return false; }
    readButtons() {}
  }

  class GamepadButtonStub {
    private _gamepadEx: GamepadExStub;
    private _button: string;
    constructor(gp: GamepadExStub, button: string) {
      this._gamepadEx = gp; this._button = button;
    }
    get() { return this._gamepadEx.getButton(this._button); }
    whenPressed(_cmd: any) { return this; }
    whenHeld(_cmd: any) { return this; }
    whenReleased(_cmd: any) { return this; }
    toggleWhenPressed(_cmd: any) { return this; }
    cancelWhenPressed(_cmd: any) { return this; }
    whileHeld(_cmd: any) { return this; }
    whenActive(_cmd: any) { return this; }
    whileActiveContinuous(_cmd: any) { return this; }
    whenInactive(_cmd: any) { return this; }
  }

  class GamepadTriggerStub {
    private _gamepadEx: GamepadExStub;
    private _trigger: string;
    constructor(gp: GamepadExStub, trigger: string) {
      this._gamepadEx = gp; this._trigger = trigger;
    }
    get() { return this._gamepadEx.getTrigger(this._trigger); }
    whenPressed(_cmd: any) { return this; }
    whenReleased(_cmd: any) { return this; }
    whileHeld(_cmd: any) { return this; }
  }

  // ========================================================
  // FTCLib — Command System
  // ========================================================
  class CommandSchedulerStub {
    private _subsystems: any[] = [];
    private _commands: any[] = [];

    run() {
      for (const sub of this._subsystems) {
        if (typeof sub.periodic === 'function') sub.periodic();
      }
      const active: any[] = [];
      for (const cmd of this._commands) {
        try {
          if (typeof cmd.execute === 'function') cmd.execute();
          if (typeof cmd.isFinished === 'function' && cmd.isFinished()) {
            if (typeof cmd.end === 'function') cmd.end(false);
          } else {
            active.push(cmd);
          }
        } catch {
          active.push(cmd);
        }
      }
      this._commands = active;
    }

    schedule(...commands: any[]) {
      for (const cmd of commands.flat()) {
        if (typeof cmd.initialize === 'function') cmd.initialize();
        this._commands.push(cmd);
      }
    }

    cancel(cmd: any) {
      const idx = this._commands.indexOf(cmd);
      if (idx >= 0) {
        if (typeof cmd.end === 'function') cmd.end(true);
        this._commands.splice(idx, 1);
      }
    }

    cancelAll() {
      for (const cmd of this._commands) {
        if (typeof cmd.end === 'function') cmd.end(true);
      }
      this._commands = [];
    }

    clear() { this._commands = []; this._subsystems = []; }

    registerSubsystem(...subsystems: any[]) {
      for (const s of subsystems.flat()) {
        if (!this._subsystems.includes(s)) this._subsystems.push(s);
      }
    }

    unregisterSubsystem(sub: any) {
      const idx = this._subsystems.indexOf(sub);
      if (idx >= 0) this._subsystems.splice(idx, 1);
    }

    isScheduled(cmd: any) { return this._commands.includes(cmd); }
    requiring(sub: any) { void sub; return undefined; }
    getDefaultCommand(sub: any) { void sub; return undefined; }
    setDefaultCommand(sub: any, cmd: any) { void sub; void cmd; }
  }

  const globalScheduler = new CommandSchedulerStub();

  class SubsystemBaseStub {
    constructor() {
      globalScheduler.registerSubsystem(this);
    }
    periodic() {}
    simulationPeriodic() {}
    disable() {}
    register() { globalScheduler.registerSubsystem(this); }
    setDefaultCommand(cmd: any) { void cmd; }
    getDefaultCommand() { return undefined; }
  }

  class CommandBaseStub {
    protected _requirements = new Set<any>();
    addRequirements(...subsystems: any[]) {
      for (const s of subsystems.flat()) this._requirements.add(s);
    }
    getRequirements() { return this._requirements; }
    initialize() {}
    execute() {}
    isFinished() { return false; }
    end(_interrupted: boolean) {}
    runsWhenDisabled() { return false; }
    getName() { return this.constructor.name; }
    withTimeout(ms: number) { void ms; return this; }
    andThen(...next: any[]) { return new SequentialCommandGroupStub(this, ...next); }
    alongWith(...parallel: any[]) { return new ParallelCommandGroupStub(this, ...parallel); }
    raceWith(...parallel: any[]) { return new ParallelRaceGroupStub(this, ...parallel); }
    deadlineWith(...parallel: any[]) { return new ParallelDeadlineGroupStub(this, ...parallel); }
  }

  class InstantCommandStub extends CommandBaseStub {
    private _toRun: () => void;
    constructor(toRun: () => void, ...requirements: any[]) {
      super();
      this._toRun = toRun ?? (() => {});
      this.addRequirements(...requirements);
    }
    initialize() { this._toRun(); }
    isFinished() { return true; }
  }

  class RunCommandStub extends CommandBaseStub {
    private _toRun: () => void;
    constructor(toRun: () => void, ...requirements: any[]) {
      super();
      this._toRun = toRun;
      this.addRequirements(...requirements);
    }
    execute() { this._toRun(); }
  }

  class StartEndCommandStub extends CommandBaseStub {
    private _onStart: () => void;
    private _onEnd: () => void;
    constructor(onStart: () => void, onEnd: () => void, ...requirements: any[]) {
      super();
      this._onStart = onStart;
      this._onEnd = onEnd;
      this.addRequirements(...requirements);
    }
    initialize() { this._onStart(); }
    end(_interrupted: boolean) { this._onEnd(); }
  }

  class WaitCommandStub extends CommandBaseStub {
    private _ms: number;
    private _start = 0;
    constructor(ms: number) { super(); this._ms = ms; }
    initialize() { this._start = performance.now(); }
    isFinished() { return performance.now() - this._start >= this._ms; }
  }

  class WaitUntilCommandStub extends CommandBaseStub {
    private _condition: () => boolean;
    constructor(condition: () => boolean) { super(); this._condition = condition; }
    isFinished() { return this._condition(); }
  }

  class SequentialCommandGroupStub extends CommandBaseStub {
    private _commands: any[];
    private _currentIdx = 0;
    constructor(...commands: any[]) {
      super();
      this._commands = commands.flat();
    }
    addCommands(...commands: any[]) { this._commands.push(...commands.flat()); }
    initialize() {
      this._currentIdx = 0;
      if (this._commands.length > 0 && this._commands[0].initialize) {
        this._commands[0].initialize();
      }
    }
    execute() {
      if (this._currentIdx >= this._commands.length) return;
      const cmd = this._commands[this._currentIdx];
      if (cmd.execute) cmd.execute();
      if (cmd.isFinished && cmd.isFinished()) {
        if (cmd.end) cmd.end(false);
        this._currentIdx++;
        if (this._currentIdx < this._commands.length && this._commands[this._currentIdx].initialize) {
          this._commands[this._currentIdx].initialize();
        }
      }
    }
    isFinished() { return this._currentIdx >= this._commands.length; }
    end(interrupted: boolean) {
      if (interrupted && this._currentIdx < this._commands.length) {
        const cmd = this._commands[this._currentIdx];
        if (cmd.end) cmd.end(true);
      }
    }
  }

  class ParallelCommandGroupStub extends CommandBaseStub {
    private _commands: any[];
    private _finished: boolean[] = [];
    constructor(...commands: any[]) {
      super();
      this._commands = commands.flat();
    }
    addCommands(...commands: any[]) { this._commands.push(...commands.flat()); }
    initialize() {
      this._finished = this._commands.map(() => false);
      for (const cmd of this._commands) { if (cmd.initialize) cmd.initialize(); }
    }
    execute() {
      for (let i = 0; i < this._commands.length; i++) {
        if (this._finished[i]) continue;
        const cmd = this._commands[i];
        if (cmd.execute) cmd.execute();
        if (cmd.isFinished && cmd.isFinished()) {
          if (cmd.end) cmd.end(false);
          this._finished[i] = true;
        }
      }
    }
    isFinished() { return this._finished.every(f => f); }
    end(interrupted: boolean) {
      if (interrupted) {
        for (let i = 0; i < this._commands.length; i++) {
          if (!this._finished[i] && this._commands[i].end) this._commands[i].end(true);
        }
      }
    }
  }

  class ParallelRaceGroupStub extends CommandBaseStub {
    private _commands: any[];
    constructor(...commands: any[]) {
      super();
      this._commands = commands.flat();
    }
    addCommands(...commands: any[]) { this._commands.push(...commands.flat()); }
    initialize() { for (const cmd of this._commands) { if (cmd.initialize) cmd.initialize(); } }
    execute() {
      for (const cmd of this._commands) { if (cmd.execute) cmd.execute(); }
    }
    isFinished() { return this._commands.some(cmd => cmd.isFinished && cmd.isFinished()); }
    end(interrupted: boolean) {
      for (const cmd of this._commands) { if (cmd.end) cmd.end(interrupted || !(cmd.isFinished && cmd.isFinished())); }
    }
  }

  class ParallelDeadlineGroupStub extends ParallelCommandGroupStub {
    private _deadline: any;
    constructor(deadline: any, ...others: any[]) {
      super(deadline, ...others);
      this._deadline = deadline;
    }
    isFinished() { return this._deadline.isFinished && this._deadline.isFinished(); }
  }

  // ========================================================
  // FTCLib — Motor (FTCLib wrapper)
  // ========================================================
  class FtcLibMotorStub {
    private _dcMotor: DcMotorStub;
    static RunMode = FtcLibMotorRunMode;
    static ZeroPowerBehavior = DcMotorZeroPowerBehavior;

    constructor(_hMap: any, name: string) {
      this._dcMotor = getOrCreate(name, DcMotorStub) as DcMotorStub;
    }
    set(power: number) { this._dcMotor.setPower(power); }
    get() { return this._dcMotor.getPower(); }
    setPower(p: number) { this._dcMotor.setPower(p); }
    getPower() { return this._dcMotor.getPower(); }
    setRunMode(m: string) { this._dcMotor.setMode(m); }
    setZeroPowerBehavior(b: string) { this._dcMotor.setZeroPowerBehavior(b); }
    resetEncoder() { this._dcMotor.setMode(DcMotorRunMode.STOP_AND_RESET_ENCODER); }
    getCurrentPosition() { return this._dcMotor.getCurrentPosition(); }
    setTargetPosition(p: number) { this._dcMotor.setTargetPosition(p); }
    isBusy() { return false; }
    setVeloCoefficients(_kP: number, _kI: number, _kD: number, _kF?: number) {}
    setFeedforwardCoefficients(_kS: number, _kV: number, _kA?: number) {}
    setInverted(inverted: boolean) {
      this._dcMotor.setDirection(inverted ? DcMotorDirection.REVERSE : DcMotorDirection.FORWARD);
    }
    getEncoder() {
      const motor = this._dcMotor;
      return {
        getPosition() { return motor.getCurrentPosition(); },
        getRevolutions() { return motor.getCurrentPosition() / 537.7; },
        getRawVelocity() { return motor._velocity; },
        getCorrectedVelocity() { return motor._velocity; },
        reset() { motor._currentPosition = 0; },
        setDistancePerPulse(_d: number) {},
      };
    }
  }

  class FtcLibMotorExStub extends FtcLibMotorStub {
    setVelocity(v: number, _unit?: string) {
      this.setPower(v / 2800);
    }
    getVelocity(_unit?: string) { return this.getPower() * 2800; }
    stopMotor() { this.setPower(0); }
    setTargetDistance(_d: number) {}
    atTargetPosition() { return true; }
  }

  class MotorGroupStub {
    private _motors: FtcLibMotorStub[];
    constructor(...motors: FtcLibMotorStub[]) { this._motors = motors.flat(); }
    set(power: number) { for (const m of this._motors) m.set(power); }
    get() { return this._motors.length > 0 ? this._motors[0].get() : 0; }
    stopMotor() { this.set(0); }
  }

  // ========================================================
  // FTCLib — Drive Bases
  // ========================================================
  class MecanumDriveStub {
    private _fl: FtcLibMotorStub;
    private _fr: FtcLibMotorStub;
    private _bl: FtcLibMotorStub;
    private _br: FtcLibMotorStub;

    constructor(fl: any, fr: any, bl: any, br: any) {
      this._fl = fl; this._fr = fr; this._bl = bl; this._br = br;
    }
    driveRobotCentric(strafe: number, forward: number, rotation: number, _heading?: number) {
      const fl = forward + strafe + rotation;
      const fr = forward - strafe - rotation;
      const bl = forward - strafe + rotation;
      const br = forward + strafe - rotation;
      const max = Math.max(1, Math.abs(fl), Math.abs(fr), Math.abs(bl), Math.abs(br));
      this._fl.set(fl / max);
      this._fr.set(fr / max);
      this._bl.set(bl / max);
      this._br.set(br / max);
    }
    driveFieldCentric(strafe: number, forward: number, rotation: number, heading: number) {
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const rotStrafe = strafe * cos - forward * sin;
      const rotForward = strafe * sin + forward * cos;
      this.driveRobotCentric(rotStrafe, rotForward, rotation);
    }
    stop() { this._fl.set(0); this._fr.set(0); this._bl.set(0); this._br.set(0); }
  }

  class DifferentialDriveStub {
    private _left: FtcLibMotorStub;
    private _right: FtcLibMotorStub;

    constructor(left: any, right: any) { this._left = left; this._right = right; }
    arcadeDrive(forward: number, rotation: number) {
      this._left.set(forward + rotation);
      this._right.set(forward - rotation);
    }
    tankDrive(left: number, right: number) {
      this._left.set(left);
      this._right.set(right);
    }
    stop() { this._left.set(0); this._right.set(0); }
  }

  // ========================================================
  // FTCLib — Odometry (stubs)
  // ========================================================
  class MecanumDriveOdometryStub {
    private _pose: Pose2dStub;
    constructor(_kinematics: any, _gyroAngle: any, initialPose?: Pose2dStub) {
      this._pose = initialPose ?? new Pose2dStub();
    }
    update(_gyroAngle: any, ..._wheelSpeeds: any[]) { return this._pose; }
    getPoseMeters() { return this._pose; }
    resetPosition(pose: Pose2dStub) { this._pose = pose; }
  }

  class DifferentialDriveOdometryStub {
    private _pose: Pose2dStub;
    constructor(_gyroAngle: any, initialPose?: Pose2dStub) {
      this._pose = initialPose ?? new Pose2dStub();
    }
    update(gyroAngle: any, leftDistance: number, rightDistance: number) {
      void gyroAngle; void leftDistance; void rightDistance;
      return this._pose;
    }
    getPoseMeters() { return this._pose; }
    resetPosition(pose: Pose2dStub) { this._pose = pose; }
  }

  class MecanumDriveKinematicsStub {
    constructor(..._wheelPositions: any[]) {}
    toWheelSpeeds(_chassisSpeeds: any) {
      return { frontLeftMetersPerSecond: 0, frontRightMetersPerSecond: 0, rearLeftMetersPerSecond: 0, rearRightMetersPerSecond: 0 };
    }
    toChassisSpeeds(..._wheelSpeeds: any[]) {
      return { vxMetersPerSecond: 0, vyMetersPerSecond: 0, omegaRadiansPerSecond: 0 };
    }
  }

  // ========================================================
  // Trajectory stubs
  // ========================================================
  class TrajectoryStub {
    getTotalTimeSeconds() { return 0; }
    sample(_t: number) {
      return {
        timeSeconds: 0, positionMeters: 0, velocityMetersPerSecond: 0,
        accelerationMetersPerSecondSq: 0, poseMeters: new Pose2dStub(), curvatureRadPerMeter: 0,
      };
    }
    getStates() { return []; }
    getInitialPose() { return new Pose2dStub(); }
  }

  class TrajectoryConfigStub {
    constructor(_maxVel: number, _maxAccel: number) {}
    addConstraint(_c: any) { return this; }
    setReversed(_r: boolean) { return this; }
    setStartVelocity(_v: number) { return this; }
    setEndVelocity(_v: number) { return this; }
  }

  const TrajectoryGeneratorStub = {
    generateTrajectory(_start: any, _interior: any[], _end: any, _config: any) {
      return new TrajectoryStub();
    },
  };

  // ========================================================
  // Assemble: classes dict + .class refs
  // ========================================================

  // Create `.class` references for hardwareMap.get(Type.class, "name")
  function makeClassRef(name: string) {
    return { _ftcType: name, name, class: { _ftcType: name, name } };
  }

  const DcMotorClass = makeClassRef('DcMotor');
  const DcMotorExClass = makeClassRef('DcMotorEx');
  const ServoClass = makeClassRef('Servo');
  const CRServoClass = makeClassRef('CRServo');
  const ColorSensorClass = makeClassRef('ColorSensor');
  const DistanceSensorClass = makeClassRef('DistanceSensor');
  const TouchSensorClass = makeClassRef('TouchSensor');
  const IMUClass = makeClassRef('IMU');
  const BNO055IMUClass = makeClassRef('BNO055IMU');
  const AnalogInputClass = makeClassRef('AnalogInput');
  const DigitalChannelClass = makeClassRef('DigitalChannel');
  const VoltageSensorClass = makeClassRef('VoltageSensor');
  const LynxModuleClass = makeClassRef('LynxModule');

  // Assign static enums + .class to the class constructors
  Object.assign(DcMotorClass, DcMotorStub);
  Object.assign(DcMotorExClass, DcMotorExStub);
  Object.assign(ServoClass, ServoStub);
  Object.assign(CRServoClass, CRServoStub);
  Object.assign(IMUClass, { Parameters: IMUParametersStub });
  Object.assign(BNO055IMUClass, BNO055IMUStub);

  const hwMap = new HardwareMapStub();
  const telemetry = new TelemetryStub();

  const classes: Record<string, any> = {
    // FTC SDK hardware
    DcMotor: DcMotorClass,
    DcMotorEx: DcMotorExClass,
    DcMotorSimple: DcMotorClass,
    Servo: ServoClass,
    CRServo: CRServoClass,
    ColorSensor: ColorSensorClass,
    DistanceSensor: DistanceSensorClass,
    TouchSensor: TouchSensorClass,
    IMU: IMUClass,
    BNO055IMU: BNO055IMUClass,
    RevHubOrientationOnRobot: RevHubOrientationOnRobotStub,
    AnalogInput: AnalogInputClass,
    DigitalChannel: DigitalChannelClass,
    VoltageSensor: VoltageSensorClass,
    LynxModule: LynxModuleClass,

    // Enums
    AngleUnit,
    DistanceUnit,
    CurrentUnit,

    // Utility
    ElapsedTime: ElapsedTimeStub,
    Range: RangeStub,

    // Telemetry / Gamepad types
    Telemetry: TelemetryStub,
    Gamepad: class {},

    // FTCLib — Command System
    CommandScheduler: { getInstance() { return globalScheduler; } },
    CommandBase: CommandBaseStub,
    SubsystemBase: SubsystemBaseStub,
    Subsystem: SubsystemBaseStub,
    InstantCommand: InstantCommandStub,
    RunCommand: RunCommandStub,
    StartEndCommand: StartEndCommandStub,
    WaitCommand: WaitCommandStub,
    WaitUntilCommand: WaitUntilCommandStub,
    SequentialCommandGroup: SequentialCommandGroupStub,
    ParallelCommandGroup: ParallelCommandGroupStub,
    ParallelRaceGroup: ParallelRaceGroupStub,
    ParallelDeadlineGroup: ParallelDeadlineGroupStub,
    ConditionalCommand: class extends CommandBaseStub {
      _onTrue: any; _onFalse: any; _condition: () => boolean;
      constructor(onTrue: any, onFalse: any, condition: () => boolean) {
        super(); this._onTrue = onTrue; this._onFalse = onFalse; this._condition = condition;
      }
      initialize() { (this._condition() ? this._onTrue : this._onFalse).initialize?.(); }
      execute() { (this._condition() ? this._onTrue : this._onFalse).execute?.(); }
      isFinished() { return (this._condition() ? this._onTrue : this._onFalse).isFinished?.() ?? true; }
    },
    SelectCommand: class extends CommandBaseStub {
      constructor(_commands: any, _selector: any) { super(); }
    },
    PerpetualCommand: class extends CommandBaseStub {
      _command: any;
      constructor(command: any) { super(); this._command = command; }
      initialize() { this._command.initialize?.(); }
      execute() { this._command.execute?.(); }
      isFinished() { return false; }
    },

    // FTCLib — Gamepad
    GamepadEx: GamepadExStub,
    GamepadKeys: { Button: GamepadKeysButton, Trigger: GamepadKeysTrigger },
    GamepadButton: GamepadButtonStub,
    GamepadTrigger: GamepadTriggerStub,

    // FTCLib — Hardware
    Motor: FtcLibMotorStub,
    MotorEx: FtcLibMotorExStub,
    MotorGroup: MotorGroupStub,

    // FTCLib — Controllers
    PIDController: PIDControllerStub,
    PIDFController: PIDFControllerStub,
    SimpleMotorFeedforward: SimpleMotorFeedforwardStub,
    ElevatorFeedforward: ElevatorFeedforwardStub,
    ArmFeedforward: ArmFeedforwardStub,

    // FTCLib — Geometry
    Pose2d: Pose2dStub,
    Rotation2d: Rotation2dStub,
    Translation2d: Translation2dStub,
    Transform2d: Transform2dStub,
    Vector2d: Translation2dStub,

    // FTCLib — Drive
    MecanumDrive: MecanumDriveStub,
    DifferentialDrive: DifferentialDriveStub,

    // FTCLib — Odometry
    MecanumDriveOdometry: MecanumDriveOdometryStub,
    DifferentialDriveOdometry: DifferentialDriveOdometryStub,
    MecanumDriveKinematics: MecanumDriveKinematicsStub,

    // FTCLib — Trajectory
    Trajectory: TrajectoryStub,
    TrajectoryConfig: TrajectoryConfigStub,
    TrajectoryGenerator: TrajectoryGeneratorStub,

    // Thread stubs
    Thread: {
      sleep(_ms: number) {},
      currentThread() { return { isInterrupted() { return false; } }; },
    },
    SystemClock: { sleep(_ms: number) {} },
  };

  // ========================================================
  // Motor → Robot sync
  // ========================================================
  const LEFT_PATTERNS = ['frontleft', 'fl', 'leftfront', 'lf', 'leftmotor', 'left', 'backleft', 'bl', 'leftback', 'lb', 'motorfl', 'motorbl', 'leftdrive', 'frontleftmotor', 'backleftmotor', 'motor0', 'motor2'];
  const RIGHT_PATTERNS = ['frontright', 'fr', 'rightfront', 'rf', 'rightmotor', 'right', 'backright', 'br', 'rightback', 'rb', 'motorfr', 'motorbr', 'rightdrive', 'frontrightmotor', 'backrightmotor', 'motor1', 'motor3'];
  const SHOOTER_PATTERNS = ['shooter', 'launcher', 'flywheel', 'shoot', 'catapult', 'outtake'];
  const INTAKE_PATTERNS = ['intake', 'collector', 'roller', 'sweeper'];

  function syncMotors() {
    let leftPower = 0, rightPower = 0, leftCount = 0, rightCount = 0;
    let shooterPower = 0, intakePower = 0;

    for (const [, device] of allDevices) {
      if (!(device instanceof DcMotorStub)) continue;
      const name = device._name.toLowerCase().replace(/[\s_-]/g, '');

      if (LEFT_PATTERNS.some(p => name.includes(p))) {
        leftPower += device.effectivePower;
        leftCount++;
      } else if (RIGHT_PATTERNS.some(p => name.includes(p))) {
        rightPower += device.effectivePower;
        rightCount++;
      } else if (SHOOTER_PATTERNS.some(p => name.includes(p))) {
        shooterPower = device.effectivePower;
      } else if (INTAKE_PATTERNS.some(p => name.includes(p))) {
        intakePower = device.effectivePower;
      }
    }

    if (leftCount > 0) leftPower /= leftCount;
    if (rightCount > 0) rightPower /= rightCount;

    // If we found drive motors, use them; otherwise fall back to nothing
    if (leftCount > 0 || rightCount > 0) {
      const forward = (leftPower + rightPower) / 2;
      const turn = (rightPower - leftPower) / 2;
      engine.robot.setDrivePower(
        Math.max(-1, Math.min(1, forward)),
        Math.max(-1, Math.min(1, turn))
      );
    }

    if (Math.abs(shooterPower) > 0.1) {
      engine.robot.shoot();
    }

    if (intakePower > 0.1) {
      engine.robot.intakeIn();
    } else if (intakePower < -0.1) {
      engine.robot.intakeOut();
    }

    // Update encoder positions (simulated)
    for (const [, device] of allDevices) {
      if (device instanceof DcMotorStub) {
        device._currentPosition += Math.round(device._power * 28); // ~28 ticks per frame at 60fps
      }
    }
  }

  return {
    hardwareMap: hwMap,
    telemetry,
    gamepad1: engine.input.gamepad1,
    gamepad2: engine.input.gamepad2,
    runtime: new ElapsedTimeStub(),
    classes,
    syncMotors,
  };
}
