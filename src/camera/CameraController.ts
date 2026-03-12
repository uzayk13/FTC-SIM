import * as THREE from 'three';
import { Robot } from '../robot/Robot';

export class CameraController {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLElement;
  robot: Robot;

  mode: 'follow' | 'freecam' | 'overhead' | 'side' = 'follow';

  // Follow cam
  followDistance = 2.5;
  followHeight = 1.8;
  followAngle = 0;
  followSmoothing = 5;

  // Freecam
  freecamPos = new THREE.Vector3(0, 5, 8);
  freecamEuler = new THREE.Euler(-0.5, 0, 0, 'YXZ');
  freecamSpeed = 3;
  freecamFastSpeed = 8;
  mouseDown = false;
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  sensitivity = 0.003;

  private keys = new Set<string>();
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onContextMenu: (e: Event) => void;

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLElement, robot: Robot) {
    this.camera = camera;
    this.canvas = canvas;
    this.robot = robot;

    this.onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      this.keys.add(e.code);

      if (e.code === 'KeyF') this.toggleFreecam();
      if (e.code === 'Digit1') this.setMode('follow');
      if (e.code === 'Digit2') this.setMode('overhead');
      if (e.code === 'Digit3') this.setMode('side');
    };
    this.onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 2 || (e.button === 0 && this.mode === 'freecam')) {
        this.mouseDown = true;
        this.canvas.requestPointerLock?.();
      }
    };
    this.onMouseUp = () => {
      this.mouseDown = false;
      document.exitPointerLock?.();
    };
    this.onMouseMove = (e: MouseEvent) => {
      if (this.mouseDown || document.pointerLockElement === this.canvas) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    };
    this.onWheel = (e: WheelEvent) => {
      if (this.mode === 'follow') {
        this.followDistance = Math.max(1, Math.min(10, this.followDistance + e.deltaY * 0.003));
      }
    };
    this.onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  toggleFreecam() {
    if (this.mode === 'freecam') {
      this.mode = 'follow';
    } else {
      this.freecamPos.copy(this.camera.position);
      this.freecamEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.mode = 'freecam';
    }
  }

  setMode(mode: typeof this.mode) {
    this.mode = mode;
  }

  update(dt: number) {
    // Consume mouse delta
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    switch (this.mode) {
      case 'follow':
        this.updateFollow(dt, dx);
        break;
      case 'freecam':
        this.updateFreecam(dt, dx, dy);
        break;
      case 'overhead':
        this.updateOverhead(dt);
        break;
      case 'side':
        this.updateSide(dt);
        break;
    }
  }

  private updateFollow(dt: number, mouseDx: number) {
    const robotPos = this.robot.getPosition();

    // Mouse orbits around robot
    if (this.mouseDown) {
      this.followAngle -= mouseDx * this.sensitivity * 2;
    }

    const targetX = robotPos.x + Math.sin(this.followAngle) * this.followDistance;
    const targetZ = robotPos.z + Math.cos(this.followAngle) * this.followDistance;
    const targetY = robotPos.y + this.followHeight;

    const t = 1 - Math.exp(-this.followSmoothing * dt);
    this.camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), t);

    const lookTarget = robotPos.clone();
    lookTarget.y += 0.1;
    this.camera.lookAt(lookTarget);
  }

  private updateFreecam(dt: number, mouseDx: number, mouseDy: number) {
    // Mouse look
    this.freecamEuler.y -= mouseDx * this.sensitivity;
    this.freecamEuler.x -= mouseDy * this.sensitivity;
    this.freecamEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.freecamEuler.x));

    this.camera.quaternion.setFromEuler(this.freecamEuler);

    // WASD movement
    const speed = this.keys.has('ShiftLeft') ? this.freecamFastSpeed : this.freecamSpeed;
    const move = new THREE.Vector3();

    if (this.keys.has('KeyW')) move.z -= 1;
    if (this.keys.has('KeyS')) move.z += 1;
    if (this.keys.has('KeyA')) move.x -= 1;
    if (this.keys.has('KeyD')) move.x += 1;
    if (this.keys.has('Space')) move.y += 1;
    if (this.keys.has('ControlLeft')) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      move.applyQuaternion(this.camera.quaternion);
      this.freecamPos.add(move);
    }

    this.camera.position.copy(this.freecamPos);
  }

  private updateOverhead(dt: number) {
    const robotPos = this.robot.getPosition();
    const target = new THREE.Vector3(robotPos.x, 8, robotPos.z);
    const t = 1 - Math.exp(-3 * dt);
    this.camera.position.lerp(target, t);
    this.camera.lookAt(robotPos);
  }

  private updateSide(dt: number) {
    const robotPos = this.robot.getPosition();
    const target = new THREE.Vector3(robotPos.x + 4, 1.5, robotPos.z);
    const t = 1 - Math.exp(-3 * dt);
    this.camera.position.lerp(target, t);
    const lookAt = robotPos.clone();
    lookAt.y += 0.2;
    this.camera.lookAt(lookAt);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
