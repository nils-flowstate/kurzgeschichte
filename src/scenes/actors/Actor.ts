import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ActorDef } from '../../timeline/types';
import type { ActorSample, Timeline } from '../../timeline/Timeline';
import { Mannequin, type HumanLook } from './Mannequin';
import { Dog } from './Dog';
import { Vehicle } from './Vehicle';
import { blendPose, evalPose } from './poses';

const gltfLoader = new GLTFLoader();

interface GltfRig {
  scene: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  clips: THREE.AnimationClip[];
  head?: THREE.Object3D;
  handR?: THREE.Object3D;
  handL?: THREE.Object3D;
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/**
 * Eine Figur/ein Fahrzeug der Geschichte. Nutzt einen Platzhalter, bis ein
 * glTF/GLB-Modell (actors.<id>.model in der Timeline) geladen ist.
 */
export class Actor {
  readonly object = new THREE.Group();
  readonly human?: Mannequin;
  readonly dog?: Dog;
  readonly car?: Vehicle;
  private gltf?: GltfRig;
  private label?: THREE.Sprite;
  lastSample: ActorSample | null = null;

  constructor(
    readonly id: string,
    readonly def: ActorDef,
  ) {
    this.object.name = `actor.${id}`;
    if (def.kind === 'human') {
      this.human = new Mannequin((def.look ?? {}) as HumanLook);
      this.human.root.name = `${id}.placeholder`;
      this.object.add(this.human.root);
    } else if (def.kind === 'dog') {
      this.dog = new Dog();
      this.dog.root.name = `${id}.placeholder`;
      this.object.add(this.dog.root);
    } else if (def.kind === 'car') {
      this.car = new Vehicle(String(def.look?.color ?? '#0a0a0c'), { glassOpacity: Number(def.look?.glassOpacity ?? 0.9) });
      this.car.group.name = `${id}.placeholder`;
      this.object.add(this.car.group);
    }
    this.label = makeLabel(def.name);
    this.label.position.y = def.kind === 'dog' ? 1.0 : def.kind === 'car' ? 2.0 : 2.1;
    this.label.visible = false;
    this.object.add(this.label);
  }

  async loadModel(): Promise<void> {
    const url = this.def.model;
    if (!url) return;
    try {
      const gltf = await gltfLoader.loadAsync(url);
      const scene = gltf.scene;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      scene.scale.setScalar(this.def.modelScale ?? 1);
      scene.rotation.y = THREE.MathUtils.degToRad(this.def.modelYaw ?? 0);
      const mixer = new THREE.AnimationMixer(scene);
      const actions = new Map<string, THREE.AnimationAction>();
      for (const clip of gltf.animations) {
        const a = mixer.clipAction(clip);
        a.play();
        a.setEffectiveWeight(0);
        actions.set(clip.name, a);
      }
      const find = (name: string | undefined, fallback: RegExp) => {
        let found: THREE.Object3D | undefined;
        scene.traverse((o) => {
          if (found) return;
          if (name ? o.name === name : fallback.test(o.name)) found = o;
        });
        return found;
      };
      this.gltf = {
        scene,
        mixer,
        actions,
        clips: gltf.animations,
        head: find(this.def.bones?.head, /head$/i),
        handR: find(this.def.bones?.handR, /right.?hand$/i),
        handL: find(this.def.bones?.handL, /left.?hand$/i),
      };
      // Platzhalter ausblenden, Modell einsetzen
      for (const c of [...this.object.children]) if (c !== this.label) c.visible = false;
      this.object.add(scene);
      console.info(`[figur] Modell für "${this.id}" geladen: ${url}`);
    } catch (e) {
      console.warn(`[figur] Modell ${url} für "${this.id}" konnte nicht geladen werden – Platzhalter bleibt.`, e);
    }
  }

  showLabel(on: boolean) {
    if (this.label) this.label.visible = on;
  }

  update(s: ActorSample | null, t: number, tl: Timeline) {
    this.lastSample = s;
    if (!s) {
      this.object.visible = false;
      return;
    }
    this.object.visible = s.visible;
    this.object.position.copy(s.pos);
    this.object.rotation.set(0, s.heading, 0);
    this.object.updateMatrixWorld();
    if (!s.visible) return;

    if (this.gltf) {
      this.updateGltf(s);
      return;
    }
    if (this.human) {
      const cur = evalPose(s.pose, { t: s.poseTime, dist: s.distance, speed: s.speed });
      let p = cur;
      if (s.blend < 1) {
        const prev = evalPose(s.prevPose, { t: s.prevPoseTime, dist: s.distance, speed: s.speed });
        p = blendPose(prev, cur, s.blend);
      }
      if (s.look) p = this.applyLook(p, s.look);
      this.human.apply(p);
      const stain = tl.state(`${this.id}.stain`, t);
      this.human.setStain(stain === true);
    } else if (this.dog) {
      const cur = evalPose(s.pose, { t: s.poseTime, dist: s.distance, speed: s.speed }) as Record<string, number>;
      let p = cur;
      if (s.blend < 1) {
        const prev = evalPose(s.prevPose, { t: s.prevPoseTime, dist: s.distance, speed: s.speed }) as Record<string, number>;
        p = blendPose(prev, cur, s.blend) as Record<string, number>;
      }
      this.dog.apply(p);
    } else if (this.car) {
      this.car.setDistance(s.distance);
      const occ = tl.state(`${this.id}.occupants`, t);
      this.car.setOccupants(typeof occ === 'number' ? occ : 1);
      this.car.setBraking(s.speed < 0.5);
    }
  }

  private applyLook(p: ReturnType<typeof evalPose>, target: THREE.Vector3) {
    const local = this.object.worldToLocal(tmpV.copy(target));
    const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.25, 1.25);
    const horiz = Math.hypot(local.x, local.z);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - 1.65, Math.max(0.3, horiz)), -0.7, 0.8);
    return {
      ...p,
      headY: (p.headY ?? 0) * 0.3 + yaw * 0.7,
      chestY: (p.chestY ?? 0) + yaw * 0.25,
      headP: (p.headP ?? 0) * 0.4 + pitch,
    };
  }

  private updateGltf(s: ActorSample) {
    const g = this.gltf!;
    const map = this.def.animations ?? {};
    const clipFor = (pose: string) => g.actions.get(map[pose] ?? '') ?? g.actions.get(map.idle ?? '') ?? g.actions.get(g.clips[0]?.name ?? '');
    for (const a of g.actions.values()) a.setEffectiveWeight(0);
    const cur = clipFor(s.pose);
    const prev = clipFor(s.prevPose);
    if (prev && prev !== cur && s.blend < 1) {
      prev.setEffectiveWeight(1 - s.blend);
      prev.time = s.prevPoseTime % prev.getClip().duration;
    }
    if (cur) {
      cur.setEffectiveWeight(prev === cur ? 1 : s.blend);
      cur.time = s.poseTime % cur.getClip().duration;
    }
    g.mixer.update(0);
  }

  socket(name: string): THREE.Object3D {
    if (this.gltf) {
      if (name === 'handR' && this.gltf.handR) return this.gltf.handR;
      if (name === 'handL' && this.gltf.handL) return this.gltf.handL;
      if ((name === 'head' || name === 'eye') && this.gltf.head) return this.gltf.head;
    }
    if (this.human) return this.human.sockets[name] ?? this.human.sockets.root;
    if (this.dog) return this.dog.sockets[name] ?? this.dog.sockets.root;
    return this.object;
  }

  /** Augenposition + Blickrichtung (für Ego-Kamera). */
  eyeTransform(pos: THREE.Vector3, quat: THREE.Quaternion) {
    const eye = this.gltf?.head ?? this.human?.eye ?? this.dog?.eye;
    if (!eye) {
      this.object.getWorldPosition(pos);
      pos.y += this.car ? 1.2 : 1.6;
      this.object.getWorldQuaternion(quat);
      return;
    }
    eye.updateWorldMatrix(true, false);
    eye.getWorldPosition(pos);
    eye.getWorldQuaternion(tmpQ);
    quat.copy(tmpQ);
  }

  setHeadVisible(v: boolean) {
    const list = this.human?.headMeshes ?? this.dog?.headMeshes;
    if (list) for (const o of list) if ((o as THREE.Mesh).isMesh) o.visible = v;
  }

  /** Höhe für Third-Person-Ziel */
  get chestHeight() {
    return this.car ? 1.2 : this.dog ? 0.6 : 1.45;
  }
}

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(10,12,16,0.65)';
  ctx.beginPath();
  ctx.roundRect(4, 12, 248, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.8, 0.2, 1);
  s.renderOrder = 100;
  return s;
}
