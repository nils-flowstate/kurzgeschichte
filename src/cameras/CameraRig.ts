import * as THREE from 'three';
import type { World } from '../scenes/World';
import { copyPose, lerpPose, makePose } from './CamPose';
import { type CameraMode, DirectorCamera, EgoCamera, FilmCamera, FreeCamera, ThirdPersonCamera } from './modes';

export type CameraId = CameraMode['id'];

/**
 * Verwaltet die Kameras, blendet beim Umschalten weich über und überträgt die
 * Pose auf die eine echte THREE-Kamera.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly film: FilmCamera;
  readonly director: DirectorCamera;
  readonly ego: EgoCamera;
  readonly third: ThirdPersonCamera;
  readonly free: FreeCamera;
  active: CameraMode;
  readonly pose = makePose();
  private target = makePose();
  private from = makePose();
  private blend = 1;
  private blendDur = 0.9;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  onModeChange?: (id: CameraId) => void;

  constructor(private world: World) {
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 4000);
    this.film = new FilmCamera(world);
    this.director = new DirectorCamera(world);
    this.ego = new EgoCamera(world);
    this.third = new ThirdPersonCamera(world);
    this.free = new FreeCamera();
    this.active = this.film;
  }

  get modes(): Record<CameraId, CameraMode> {
    return { film: this.film, director: this.director, ego: this.ego, third: this.third, free: this.free };
  }

  setMode(id: CameraId, instant = false) {
    const next = this.modes[id];
    if (next === this.active && !instant) return;
    copyPose(this.from, this.pose);
    next.enter(this.pose);
    this.active = next;
    this.blend = instant ? 1 : 0;
    this.onModeChange?.(id);
  }

  setFollowActor(id: string) {
    this.ego.setActor(id);
    this.third.setActor(id);
    if (this.active === this.ego || this.active === this.third) {
      copyPose(this.from, this.pose);
      this.blend = 0;
    }
  }

  update(t: number, dt: number) {
    this.active.update(t, dt, this.target);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      const u = this.blend * this.blend * (3 - 2 * this.blend);
      lerpPose(this.from, this.target, u, this.pose);
    } else copyPose(this.pose, this.target);
    // Ego: eigenen Kopf ausblenden
    for (const [id, a] of this.world.actors) a.setHeadVisible(!(this.active === this.ego && id === this.ego.actorId && this.blend > 0.4));
    const c = this.camera;
    c.position.copy(this.pose.pos);
    c.quaternion.copy(this.pose.quat);
    c.setFocalLength(this.pose.lens);
    c.updateMatrixWorld();
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Fokus-Punkt für Schatten (was gerade im Bild wichtig ist) */
  focusPoint(out: THREE.Vector3) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.pose.quat);
    return out.copy(this.pose.pos).addScaledVector(fwd, Math.min(12, Math.max(3, this.pose.focus)));
  }

  attachInput(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      if (this.active === this.free) {
        el.requestPointerLock?.();
        return;
      }
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => {
      this.dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.active === this.free && document.pointerLockElement === el) {
        this.free.yaw -= e.movementX * 0.0022;
        this.free.pitch = THREE.MathUtils.clamp(this.free.pitch - e.movementY * 0.0022, -1.5, 1.5);
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.active === this.ego) {
        this.ego.yaw = THREE.MathUtils.clamp(this.ego.yaw - dx * 0.004, -2.2, 2.2);
        this.ego.pitch = THREE.MathUtils.clamp(this.ego.pitch - dy * 0.004, -1.2, 1.2);
      } else if (this.active === this.third) {
        this.third.yaw -= dx * 0.005;
        this.third.pitch = THREE.MathUtils.clamp(this.third.pitch + dy * 0.004, -0.4, 1.2);
      }
    });
    el.addEventListener(
      'wheel',
      (e) => {
        if (this.active === this.third) this.third.distance = THREE.MathUtils.clamp(this.third.distance * (1 + e.deltaY * 0.001), 1.0, 9);
        if (this.active === this.free) this.free.lens = THREE.MathUtils.clamp(this.free.lens * (1 - e.deltaY * 0.001), 12, 120);
        e.preventDefault();
      },
      { passive: false },
    );
    el.addEventListener('dblclick', () => {
      this.ego.yaw = this.ego.pitch = 0;
      this.third.yaw = 0;
      this.third.pitch = 0.12;
    });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      this.free.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.free.keys.delete(e.code));
    window.addEventListener('blur', () => this.free.keys.clear());
  }
}
