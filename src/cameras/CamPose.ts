import * as THREE from 'three';
import type { CamPos, CamTarget, Shot } from '../timeline/types';
import type { World } from '../scenes/World';
import { easeFn } from '../timeline/Timeline';

/** Ergebnis jeder Kamera: Position, Ausrichtung, Brennweite, Fokus. */
export interface CamPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Brennweite in mm (Vollformat) */
  lens: number;
  focus: number;
  aperture: number;
}

export function makePose(): CamPose {
  return { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), lens: 35, focus: 5, aperture: 0.0015 };
}

export function copyPose(dst: CamPose, src: CamPose) {
  dst.pos.copy(src.pos);
  dst.quat.copy(src.quat);
  dst.lens = src.lens;
  dst.focus = src.focus;
  dst.aperture = src.aperture;
}

export function lerpPose(a: CamPose, b: CamPose, u: number, out: CamPose) {
  out.pos.lerpVectors(a.pos, b.pos, u);
  out.quat.slerpQuaternions(a.quat, b.quat, u);
  out.lens = a.lens + (b.lens - a.lens) * u;
  out.focus = a.focus + (b.focus - a.focus) * u;
  out.aperture = a.aperture + (b.aperture - a.aperture) * u;
}

const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** Kamera-Quaternion, die von pos auf target blickt (Kamera schaut entlang -Z). */
export function lookQuat(pos: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion, rollDeg = 0) {
  tmpM.lookAt(pos, target, UP);
  out.setFromRotationMatrix(tmpM);
  if (rollDeg) out.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rollDeg)));
  return out;
}

export function resolveTarget(world: World, t: CamTarget, out = new THREE.Vector3()): THREE.Vector3 {
  if (typeof t === 'object' && !Array.isArray(t)) {
    world.actorPoint(t.actor, t.socket, out);
    if (t.offset) out.add(new THREE.Vector3(...t.offset));
    return out;
  }
  if (typeof t === 'string' && world.actors.has(t)) return world.actorPoint(t, undefined, out);
  if (typeof t === 'string' && t.includes('.') && world.actors.has(t.split('.')[0])) {
    const [a, s] = t.split('.');
    return world.actorPoint(a, s, out);
  }
  return out.copy(world.timeline.resolve(t));
}

export function resolveCamPos(world: World, p: CamPos, out = new THREE.Vector3()): THREE.Vector3 {
  if (typeof p === 'object' && !Array.isArray(p)) {
    const a = world.actors.get(p.rel);
    if (!a) {
      const obj = world.objectTrack(p.rel);
      if (!obj) return out.set(0, 2, 0);
      return out.set(...p.offset).applyQuaternion(obj.quaternion).add(obj.position);
    }
    const off = new THREE.Vector3(...p.offset);
    const base = new THREE.Vector3();
    if (p.socket) a.socket(p.socket).getWorldPosition(base);
    else base.copy(a.object.position);
    if (p.world) return out.copy(base).add(off);
    return out.copy(off).applyQuaternion(a.object.quaternion).add(base);
  }
  return out.copy(world.timeline.resolve(p));
}

/** Deterministisches Handkamera-Wackeln */
export function shakeQuat(t: number, amount: number, out: THREE.Quaternion) {
  const n = (f: number, s: number) => Math.sin(t * f + s) * 0.6 + Math.sin(t * f * 2.13 + s * 1.7) * 0.3 + Math.sin(t * f * 4.7 + s * 0.3) * 0.1;
  const e = new THREE.Euler(n(1.1, 1) * 0.012 * amount, n(0.9, 2) * 0.016 * amount, n(0.7, 3) * 0.008 * amount);
  return out.setFromEuler(e);
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const la = new THREE.Vector3();
const lb = new THREE.Vector3();
const sq = new THREE.Quaternion();

/** Einstellung zum Zeitpunkt t auswerten. */
export function evalShot(world: World, shot: Shot, start: number, end: number, t: number, out: CamPose) {
  const u = easeFn(shot.ease ?? 'ease', (t - start) / Math.max(0.001, end - start));
  resolveCamPos(world, shot.from, a);
  if (shot.to) {
    resolveCamPos(world, shot.to, b);
    out.pos.lerpVectors(a, b, u);
  } else out.pos.copy(a);
  resolveTarget(world, shot.look, la);
  if (shot.lookTo) {
    resolveTarget(world, shot.lookTo, lb);
    la.lerp(lb, u);
  }
  lookQuat(out.pos, la, out.quat, shot.roll ?? 0);
  if (shot.shake) out.quat.multiply(shakeQuat(t, shot.shake, sq));
  out.lens = shot.lens + ((shot.lensTo ?? shot.lens) - shot.lens) * u;
  const f = shot.focus ? resolveTarget(world, shot.focus, lb) : la;
  out.focus = out.pos.distanceTo(f);
  out.aperture = shot.aperture ?? 0.0018;
}
