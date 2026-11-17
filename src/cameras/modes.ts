import * as THREE from 'three';
import type { World } from '../scenes/World';
import type { Shot, SubtitleEvent } from '../timeline/types';
import { type CamPose, copyPose, evalShot, lookQuat, makePose } from './CamPose';

export interface CameraMode {
  readonly id: 'film' | 'ego' | 'third' | 'free' | 'director';
  readonly label: string;
  enter(from: CamPose): void;
  /** t = Story-Zeit, dt = echte Sekunden seit dem letzten Frame */
  update(t: number, dt: number, out: CamPose): void;
  /** ändert sich bei jedem harten Schnitt */
  cutId: number;
}

/** Sichtlinie prüfen und Kamera ggf. vor das Hindernis ziehen. */
export class Occlusion {
  private ray = new THREE.Raycaster();
  private meshes: THREE.Object3D[] = [];
  constructor(world: World) {
    const isDynamic = (o: THREE.Object3D | null) => {
      for (let p = o; p; p = p.parent) if (world.sets.dynamic.has(p)) return true;
      return false;
    };
    const consider = (m: THREE.Mesh) => {
      const mat = m.material as THREE.Material | undefined;
      if (m.isMesh && mat && !Array.isArray(mat) && !mat.transparent && mat.depthWrite !== false && !m.userData.batched && !isDynamic(m)) {
        m.geometry.computeBoundingSphere();
        if ((m.geometry.boundingSphere?.radius ?? 0) > 0.25) this.meshes.push(m);
      }
    };
    for (const name of ['set.city', 'set.office']) world.scene.getObjectByName(name)?.traverse((o) => consider(o as THREE.Mesh));
    for (const m of world.sets.collision) consider(m);
  }
  /** Gibt die korrigierte Kameraposition zurück (zwischen target und cam). */
  resolve(target: THREE.Vector3, cam: THREE.Vector3, pad = 0.25): THREE.Vector3 {
    const dir = cam.clone().sub(target);
    const len = dir.length();
    if (len < 0.01) return cam;
    dir.divideScalar(len);
    this.ray.set(target, dir);
    this.ray.far = len;
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (hit) return target.clone().addScaledVector(dir, Math.max(0.3, hit.distance - pad));
    return cam;
  }
}

// ---------------------------------------------------------------- 1 Film
export class FilmCamera implements CameraMode {
  readonly id = 'film' as const;
  readonly label = 'Filmkamera';
  cutId = 0;
  private last = -1;
  private occ: Occlusion;
  private tmp = new THREE.Vector3();
  constructor(private world: World) {
    this.occ = new Occlusion(world);
  }
  enter() {}
  update(t: number, _dt: number, out: CamPose) {
    const tl = this.world.timeline;
    const i = tl.shotIndex(t);
    const shot = tl.shot(i);
    if (!shot) return;
    if (i !== this.last) {
      this.cutId++;
      this.last = i;
    }
    evalShot(this.world, shot, shot.t, tl.shotEnd(i), t, out);
    // Sicherheitsnetz: steht etwas zwischen Kamera und Figur, rückt die Kamera heran
    if (typeof shot.look === 'object' && !Array.isArray(shot.look) && 'actor' in shot.look) {
      const look = this.world.actorPoint(shot.look.actor, shot.look.socket, this.tmp);
      const fixed = this.occ.resolve(look, out.pos, 0.15);
      if (fixed !== out.pos) out.pos.copy(fixed);
    }
  }
  currentShotName(t: number) {
    const tl = this.world.timeline;
    return tl.shot(tl.shotIndex(t))?.name ?? '';
  }
}

// ---------------------------------------------------------------- Regie (Cinema)
interface DirShot extends Shot {
  end: number;
}

/**
 * Automatischer Regisseur: erzeugt aus Kapiteln, Dialogen, Insert-Hinweisen und
 * Bewegung eine Schnittfolge (Totale, Halbnah, Nah, Over-Shoulder, Schnittbild).
 * Rein aus der Timeline abgeleitet -> deterministisch.
 */
export class DirectorCamera implements CameraMode {
  readonly id = 'director' as const;
  readonly label = 'Regie (Cinema)';
  cutId = 0;
  readonly shots: DirShot[] = [];
  private last = -1;
  private occ: Occlusion;
  private tmp = new THREE.Vector3();

  constructor(private world: World) {
    this.occ = new Occlusion(world);
    this.build();
  }

  private build() {
    const tl = this.world.timeline;
    const D = tl.duration;
    const cuts = new Set<number>([0]);
    for (const c of tl.data.chapters) cuts.add(c.t);
    const subs = tl.events<SubtitleEvent>('subtitle');
    for (const s of subs) if (s.style === 'dialog') cuts.add(s.t - 0.15);
    for (const ins of tl.data.inserts ?? []) {
      cuts.add(ins.t);
      cuts.add(ins.t + ins.dur);
    }
    let list = [...cuts].filter((c) => c >= 0 && c < D).sort((a, b) => a - b);
    // lange Segmente teilen, sehr kurze zusammenlegen
    const out: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const e = list[i + 1] ?? D;
      if (out.length && s - out[out.length - 1] < 1.6 && !(tl.data.inserts ?? []).some((x) => Math.abs(x.t - s) < 0.01)) continue;
      out.push(s);
      const len = e - s;
      if (len > 7.5) {
        const n = Math.round(len / 5);
        for (let k = 1; k < n; k++) out.push(s + (len * k) / n);
      }
    }
    list = out;
    const chapterStarts = new Set(tl.data.chapters.map((c) => c.t));
    list.forEach((s, idx) => {
      const e = list[idx + 1] ?? D;
      const mid = (s + e) / 2;
      const side = idx % 2 === 0 ? 1 : -1;
      const ins = (tl.data.inserts ?? []).find((x) => s >= x.t - 0.01 && s < x.t + x.dur);
      const sub = subs.find((x) => s + 0.2 >= x.t && s + 0.2 < x.t + x.dur && x.style === 'dialog') ?? subs.find((x) => s + 0.2 >= x.t && s + 0.2 < x.t + x.dur);
      const focus = this.focusActor(mid);
      const ps = tl.sampleActor(focus, mid);
      const moving = !!ps && ps.speed > 0.6 && !['sit', 'sit_type'].includes(ps.pose);
      let shot: Shot;
      if (ins) {
        const target = ins.target;
        const isActorTarget = typeof target === 'object' && !Array.isArray(target);
        shot = isActorTarget
          ? (() => {
              const tid = (target as { actor: string }).actor;
              const k = this.world.actors.get(tid)?.def.kind === 'dog' ? 2.6 : 1.5;
              return { t: s, name: ins.name ?? 'Schnittbild', from: { rel: tid, socket: (target as { socket?: string }).socket ?? 'chest', offset: [0.3 * side * k, 0.22 * k, 0.6 * k] as [number, number, number] }, look: target, lens: ins.lens ?? 85, aperture: 0.003 };
            })()
          : { t: s, name: ins.name ?? 'Schnittbild', from: { rel: 'protagonist', socket: 'head', offset: [0.18, 0.05, -0.25] }, look: target, lens: ins.lens ?? 85, aperture: 0.003 };
      } else if (chapterStarts.has(s)) {
        shot = {
          t: s,
          name: 'Totale',
          from: { rel: focus, offset: [5.5 * side, 2.8, 6.5] },
          to: { rel: focus, offset: [4.6 * side, 2.3, 5.4] },
          look: { actor: focus },
          lens: 24,
          aperture: 0.0008,
        };
      } else if (sub && sub.style === 'dialog' && sub.speaker && sub.speaker !== 'protagonist' && this.world.actors.has(sub.speaker)) {
        shot = {
          t: s,
          name: 'Over-Shoulder',
          from: { rel: 'protagonist', socket: 'head', offset: [-0.32 * side, 0.08, -0.55] },
          look: { actor: sub.speaker, socket: 'head' },
          lens: 50,
          aperture: 0.0035,
          shake: 0.25,
        };
      } else if (sub && sub.style === 'dialog' && sub.speaker === 'protagonist') {
        const listener = this.nearest('protagonist', mid);
        shot = listener
          ? { t: s, name: 'Gegenschuss', from: { rel: listener, socket: 'head', offset: [0.32 * side, 0.08, -0.55] }, look: { actor: 'protagonist', socket: 'head' }, lens: 55, aperture: 0.0035, shake: 0.25 }
          : { t: s, name: 'Nah', from: { rel: 'protagonist', socket: 'head', offset: [0.45 * side, 0.02, 1.9] }, look: { actor: 'protagonist', socket: 'head' }, lens: 60, aperture: 0.004 };
      } else if (sub && (sub.style === 'thought' || sub.style === 'letter')) {
        const letterShot = sub.style === 'letter' && idx % 3 === 1;
        shot = letterShot
          ? { t: s, name: 'Schnittbild Brief', from: { rel: 'protagonist', socket: 'head', offset: [0.12, 0.1, -0.08] }, look: { actor: 'protagonist', socket: 'handR' }, lens: 45, aperture: 0.005 }
          : {
              t: s,
              name: 'Nahaufnahme',
              from: { rel: focus, socket: 'head', offset: [0.55 * side, 0.03, 2.3] },
              to: { rel: focus, socket: 'head', offset: [0.45 * side, 0.02, 1.95] },
              look: { actor: focus, socket: 'head' },
              lens: 65,
              aperture: 0.005,
            };
      } else if (moving) {
        shot =
          idx % 3 === 2
            ? { t: s, name: 'Verfolger', from: { rel: focus, socket: 'chest', offset: [0.5 * side, 0.35, -2.6] }, look: { actor: focus, socket: 'head' }, lens: 32, shake: 0.6, aperture: 0.0015 }
            : { t: s, name: 'Halbnah (Fahrt)', from: { rel: focus, socket: 'chest', offset: [1.7 * side, 0.15, 2.4] }, look: { actor: focus, socket: 'chest' }, lens: 35, shake: 0.5, aperture: 0.0018 };
      } else {
        shot = {
          t: s,
          name: 'Halbnah',
          from: { rel: focus, socket: 'chest', offset: [1.3 * side, 0.12, 2.0] },
          to: { rel: focus, socket: 'chest', offset: [1.15 * side, 0.12, 1.8] },
          look: { actor: focus, socket: 'head' },
          lens: 42,
          aperture: 0.0025,
          shake: 0.2,
        };
      }
      this.shots.push({ ...shot, end: e });
    });
  }

  private focusActor(t: number): string {
    const tl = this.world.timeline;
    const s = tl.sampleActor('protagonist', t);
    return s && s.visible ? 'protagonist' : ([...this.world.actors.keys()].find((id) => tl.sampleActor(id, t)?.visible) ?? 'protagonist');
  }

  private nearest(of: string, t: number): string | null {
    const tl = this.world.timeline;
    const p = tl.sampleActor(of, t)?.pos;
    if (!p) return null;
    let best: string | null = null;
    let bd = 6;
    for (const [id, a] of this.world.actors) {
      if (id === of || a.def.kind !== 'human') continue;
      const s = tl.sampleActor(id, t);
      if (!s || !s.visible) continue;
      const d = s.pos.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  enter() {}

  shotAt(t: number) {
    let lo = 0;
    let hi = this.shots.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.shots[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  update(t: number, _dt: number, out: CamPose) {
    const i = this.shotAt(t);
    const s = this.shots[i];
    if (!s) return;
    if (i !== this.last) {
      this.cutId++;
      this.last = i;
    }
    // Beim Schnitt eine Variante wählen, die freie Sicht hat (gespiegelt, höher, enger …)
    if (this.variantFor !== i) {
      this.variantFor = i;
      this.variant = this.pickVariant(s, t);
    }
    const v = this.variants(s)[this.variant] ?? s;
    evalShot(this.world, v, s.t, s.end, t, out);
    // Sichtlinie freihalten (Notfall: an das Hindernis heranrücken)
    const look = typeof v.look === 'object' && !Array.isArray(v.look) && 'actor' in v.look ? this.world.actorPoint(v.look.actor, v.look.socket, this.tmp) : null;
    if (look) {
      const fixed = this.occ.resolve(look, out.pos);
      if (fixed !== out.pos) {
        out.pos.copy(fixed);
        lookQuat(out.pos, look, out.quat);
      }
    }
  }

  private variantFor = -1;
  private variant = 0;
  private variantCache = new Map<DirShot, Shot[]>();

  /** Alternativen einer Einstellung: gespiegelt, höher, enger, von hinten. */
  private variants(s: DirShot): Shot[] {
    let list = this.variantCache.get(s);
    if (list) return list;
    const mod = (fn: (o: [number, number, number]) => [number, number, number], lensK = 1): Shot => {
      const m = (p: Shot['from'] | undefined) =>
        p && typeof p === 'object' && !Array.isArray(p) && 'rel' in p ? { ...p, offset: fn(p.offset) } : p;
      return { ...s, from: m(s.from)!, to: m(s.to), lens: s.lens * lensK, lensTo: s.lensTo ? s.lensTo * lensK : undefined };
    };
    list = [
      s,
      mod(([x, y, z]) => [-x, y, z]),
      mod(([x, y, z]) => [x * 0.6, y + 0.9, z * 0.6], 0.8),
      mod(([x, y, z]) => [-x * 0.6, y + 0.9, z * 0.6], 0.8),
      mod(([x, y, z]) => [x * 0.45, y + 0.2, z * 0.45], 0.75),
      mod(([x, y, z]) => [-x * 0.5, y + 0.35, -Math.abs(z) * 0.8], 0.8),
    ];
    this.variantCache.set(s, list);
    return list;
  }

  private pickVariant(s: DirShot, t: number): number {
    const list = this.variants(s);
    const probe = makePose();
    const mid = Math.min(s.end - 0.05, t + 0.5);
    for (let k = 0; k < list.length; k++) {
      const v = list[k];
      if (!(typeof v.look === 'object' && !Array.isArray(v.look) && 'actor' in v.look)) return 0;
      evalShot(this.world, v, s.t, s.end, mid, probe);
      const look = this.world.actorPoint(v.look.actor, v.look.socket, new THREE.Vector3());
      const fixed = this.occ.resolve(look, probe.pos, 0);
      if (fixed === probe.pos) return k;
    }
    return 0;
  }
  currentShotName(t: number) {
    return this.shots[this.shotAt(t)]?.name ?? '';
  }
}

// ---------------------------------------------------------------- 2 Ego
export class EgoCamera implements CameraMode {
  readonly id = 'ego' as const;
  readonly label = 'Ego-Perspektive';
  cutId = 0;
  actorId = 'protagonist';
  yaw = 0;
  pitch = 0;
  private smoothQ = new THREE.Quaternion();
  private first = true;
  private flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  constructor(private world: World) {}
  enter() {
    this.first = true;
    this.yaw = this.pitch = 0;
  }
  setActor(id: string) {
    if (this.actorId !== id) this.world.actors.get(this.actorId)?.setHeadVisible(true);
    this.actorId = id;
    this.first = true;
  }
  update(_t: number, dt: number, out: CamPose) {
    const a = this.world.actors.get(this.actorId);
    if (!a) return;
    const q = new THREE.Quaternion();
    a.eyeTransform(out.pos, q);
    q.multiply(this.flip);
    // Kopfbewegung leicht glätten (gegen Wackeln beim Laufen)
    if (this.first) {
      this.smoothQ.copy(q);
      this.first = false;
    } else this.smoothQ.slerp(q, 1 - Math.exp(-dt * 14));
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    out.quat.copy(this.smoothQ).multiply(look);
    // minimal nach vorn, damit nichts vom eigenen Körper ins Bild ragt
    out.pos.add(new THREE.Vector3(0, 0, -0.06).applyQuaternion(out.quat));
    out.lens = 22;
    out.focus = 3;
    out.aperture = 0.001;
  }
}

// ---------------------------------------------------------------- 3 Third Person
export class ThirdPersonCamera implements CameraMode {
  readonly id = 'third' as const;
  readonly label = 'Third Person';
  cutId = 0;
  actorId = 'protagonist';
  yaw = 0;
  pitch = 0.12;
  distance = 2.6;
  shoulder = 0.45;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private first = true;
  private occ: Occlusion;
  constructor(private world: World) {
    this.occ = new Occlusion(world);
  }
  enter(from: CamPose) {
    this.pos.copy(from.pos);
    this.first = true;
  }
  setActor(id: string) {
    this.actorId = id;
    this.first = true;
  }
  update(_t: number, dt: number, out: CamPose) {
    const a = this.world.actors.get(this.actorId);
    if (!a) return;
    const s = a.lastSample;
    const heading = (s?.heading ?? 0) + this.yaw;
    const tgt = a.object.position.clone();
    tgt.y += a.car ? 1.6 : a.dog ? 0.7 : Math.max(0.6, (a.human?.hips.position.y ?? 1) + 0.65);
    const dist = a.car ? this.distance * 2.4 : a.dog ? this.distance * 0.8 : this.distance;
    const back = new THREE.Vector3(-Math.sin(heading) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(heading) * Math.cos(this.pitch));
    const right = new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading));
    const desired = tgt.clone().addScaledVector(back, dist).addScaledVector(right, this.shoulder * (a.car ? 0 : 1));
    const shoulderTgt = tgt.clone().addScaledVector(right, this.shoulder * 0.6 * (a.car ? 0 : 1));
    this.pos.lerp(desired, this.first ? 1 : 1 - Math.exp(-dt * 6));
    this.target.lerp(shoulderTgt, this.first ? 1 : 1 - Math.exp(-dt * 12));
    this.first = false;
    const p = this.occ.resolve(this.target, this.pos, 0.2);
    out.pos.copy(p);
    lookQuat(out.pos, this.target, out.quat);
    out.lens = 28;
    out.focus = out.pos.distanceTo(this.target);
    out.aperture = 0.0015;
  }
}

// ---------------------------------------------------------------- 4 Frei
export class FreeCamera implements CameraMode {
  readonly id = 'free' as const;
  readonly label = 'Freie Kamera';
  cutId = 0;
  readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  private pos = new THREE.Vector3();
  lens = 30;
  enter(from: CamPose) {
    this.pos.copy(from.pos);
    const e = new THREE.Euler().setFromQuaternion(from.quat, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.lens = Math.min(50, Math.max(20, from.lens));
  }
  update(_t: number, dt: number, out: CamPose) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const v = new THREE.Vector3();
    const k = this.keys;
    if (k.has('KeyW')) v.add(fwd);
    if (k.has('KeyS')) v.sub(fwd);
    if (k.has('KeyD')) v.add(right);
    if (k.has('KeyA')) v.sub(right);
    if (k.has('KeyE')) v.y += 1;
    if (k.has('KeyQ')) v.y -= 1;
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 14 : 3.5;
    if (v.lengthSq() > 0) this.pos.addScaledVector(v.normalize(), speed * Math.min(dt, 0.1));
    out.pos.copy(this.pos);
    out.quat.copy(q);
    out.lens = this.lens;
    out.focus = 6;
    out.aperture = 0.001;
  }
}

export { makePose, copyPose };
