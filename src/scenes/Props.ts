import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PropDef } from '../timeline/types';
import type { Timeline } from '../timeline/Timeline';
import { easeFn } from '../timeline/Timeline';
import type { Actor } from './actors/Actor';
import { M } from './materials';
import { mug } from './sets/furniture';

function shapeMesh(def: PropDef): THREE.Object3D {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  switch (def.shape) {
    case 'letter': {
      // Umschlag/Brief: leicht gewölbtes Blatt
      const geo = new THREE.PlaneGeometry(0.21, 0.27, 6, 1);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setZ(i, -0.014 * (p.getX(i) / 0.105) ** 2);
      geo.computeVertexNormals();
      const m = add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: def.color ?? '#efe7d6', roughness: 0.85, side: THREE.DoubleSide })));
      m.rotation.x = -Math.PI / 2;
      break;
    }
    case 'papers': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.22), M.paper()));
      break;
    }
    case 'usb': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.05), M.plastic(def.color ?? '#1d4ed8')));
      const tip = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.014), M.metal()));
      tip.position.z = 0.03;
      break;
    }
    case 'phone': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.15, 0.008), M.darkMetal()));
      const s = add(new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.142), M.emissive('#9cc6ff', 0.9)));
      s.position.z = 0.0045;
      break;
    }
    case 'mug': {
      const m = mug(def.color ?? '#c2410c');
      m.traverse((o) => (o.castShadow = true));
      g.add(m);
      break;
    }
    case 'glass': {
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 16), M.glass()));
      m.position.y = 0.055;
      break;
    }
    case 'box':
    default: {
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.2), M.plastic(def.color ?? '#2563eb')));
      m.position.y = 0.15;
    }
  }
  return g;
}

const gltf = new GLTFLoader();
const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(1, 1, 1);

export class Props {
  readonly group = new THREE.Group();
  private items = new Map<string, THREE.Object3D>();

  constructor(
    private tl: Timeline,
    private actors: Map<string, Actor>,
  ) {
    this.group.name = 'props';
    for (const [id, def] of Object.entries(tl.data.props)) {
      const obj = new THREE.Group();
      obj.name = `prop.${id}`;
      obj.matrixAutoUpdate = false;
      obj.add(shapeMesh(def));
      this.items.set(id, obj);
      this.group.add(obj);
      if (def.model) {
        gltf
          .loadAsync(def.model)
          .then((g) => {
            obj.clear();
            obj.add(g.scene);
          })
          .catch((e) => console.warn(`[requisite] ${def.model} nicht ladbar – Platzhalter bleibt`, e));
      }
    }
  }

  get(id: string) {
    return this.items.get(id);
  }

  update(t: number) {
    for (const [id, obj] of this.items) {
      const { key, flyU } = this.tl.sampleProp(id, t);
      if (!key || key.visible === false) {
        obj.visible = false;
        continue;
      }
      obj.visible = true;
      const rot = key.rot ?? [0, 0, 0];
      tmpE.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]));
      tmpQ.setFromEuler(tmpE);
      if (key.attach) {
        const [actorId, socketName = 'handR'] = key.attach.split('.');
        const actor = this.actors.get(actorId);
        if (!actor || !actor.object.visible) {
          obj.visible = false;
          continue;
        }
        const socket = actor.socket(socketName);
        socket.updateWorldMatrix(true, false);
        const off = key.at ? this.tl.resolve(key.at) : new THREE.Vector3();
        tmpM2.compose(off, tmpQ, tmpS);
        obj.matrix.multiplyMatrices(socket.matrixWorld, tmpM2);
      } else {
        const to = this.tl.resolve(key.at);
        let p = to;
        let q = tmpQ;
        if (key.fly && flyU < 1) {
          const from = this.tl.resolve(key.fly.from);
          const u = easeFn('linear', flyU);
          p = from.clone().lerp(to, u);
          p.y += Math.sin(u * Math.PI) * (key.fly.arc ?? 0.5);
          // Flattern
          const spin = (key.fly.spin ?? 2) * u * Math.PI * 2;
          q = tmpQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(spin) * 0.6, spin, Math.cos(spin * 0.7) * 0.4)));
        }
        tmpM.compose(p, q, tmpS);
        obj.matrix.copy(tmpM);
      }
      obj.matrixWorldNeedsUpdate = true;
    }
  }
}
