import * as THREE from 'three';
import type { Pose } from './poses';

export interface HumanLook {
  height?: number;
  build?: number; // Schulterbreite-Faktor
  skin?: string;
  hair?: string;
  hairStyle?: 'short' | 'bun' | 'long' | 'slick' | 'bald';
  shirt?: string;
  jacket?: string | null;
  pants?: string;
  shoes?: string;
  coat?: string | null;
  tie?: string | null;
  sunglasses?: boolean;
  glasses?: boolean;
  female?: boolean;
  skirt?: string | null;
}

const std = (color: string, rough = 0.7, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

function capsule(r: number, len: number, mat: THREE.Material, seg = 10) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, seg);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Gliederpuppe als Platzhalter. Hierarchie:
 * root > hips > spine > chest > neck > head, Schultern/Arme an chest, Beine an hips.
 * Blickrichtung +Z.
 */
export class Mannequin {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly spine = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly shoulderL = new THREE.Group();
  readonly shoulderR = new THREE.Group();
  readonly elbowL = new THREE.Group();
  readonly elbowR = new THREE.Group();
  readonly handL = new THREE.Group();
  readonly handR = new THREE.Group();
  readonly thighL = new THREE.Group();
  readonly thighR = new THREE.Group();
  readonly kneeL = new THREE.Group();
  readonly kneeR = new THREE.Group();
  readonly ankleL = new THREE.Group();
  readonly ankleR = new THREE.Group();
  /** Sockel für Requisiten */
  readonly sockets: Record<string, THREE.Object3D> = {};
  /** Kopfgeometrie (für Ego-Kamera ausblendbar) */
  readonly headMeshes: THREE.Object3D[] = [];
  readonly eye = new THREE.Object3D();
  private hipH: number;
  private stain?: THREE.Mesh;

  constructor(look: HumanLook = {}) {
    const H = look.height ?? 1.8;
    const k = H / 1.84;
    const bw = look.build ?? 1;
    const fem = !!look.female;
    const skin = new THREE.MeshPhysicalMaterial({ color: look.skin ?? '#d6a787', roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffd9c4'), sheenRoughness: 0.6 });
    const shirt = std(look.shirt ?? '#f2f2f0', 0.75);
    const jacketMat = look.jacket ? std(look.jacket, 0.65) : null;
    const coatMat = look.coat ? std(look.coat, 0.8) : null;
    const pants = std(look.pants ?? '#2f3e5c', 0.85);
    const shoes = std(look.shoes ?? '#2a1f18', 0.35, { metalness: 0.1 });
    const hairMat = std(look.hair ?? '#1c1714', 0.6);

    this.hipH = 0.98 * k;
    const upperArm = 0.3 * k;
    const foreArm = 0.27 * k;
    const thigh = 0.46 * k;
    const shin = 0.44 * k;
    const sh = (fem ? 0.18 : 0.205) * k * bw;

    this.root.add(this.hips);
    this.hips.position.y = this.hipH;
    this.hips.add(this.spine);
    this.spine.add(this.chest);
    this.chest.position.y = 0.22 * k;
    this.chest.add(this.neck);
    this.neck.position.y = 0.3 * k;
    this.neck.add(this.head);
    this.head.position.y = 0.09 * k;

    // Becken & Rumpf
    const torsoMat = jacketMat ?? coatMat ?? shirt;
    const pelvis = capsule(0.15 * k * (fem ? 1.05 : 1), 0.34 * k * bw, look.skirt ? std(look.skirt, 0.8) : pants);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(1, 1, 0.75);
    pelvis.position.y = 0.0;
    this.hips.add(pelvis);
    const belly = capsule(0.135 * k, 0.26 * k, torsoMat);
    belly.position.y = 0.12 * k;
    belly.scale.set(1.15 * bw, 1, 0.8);
    this.spine.add(belly);
    const torso = capsule(0.16 * k, 0.36 * k, torsoMat);
    torso.position.y = 0.1 * k;
    torso.scale.set(1.3 * bw * (fem ? 0.9 : 1), 1, 0.72);
    this.chest.add(torso);
    // Hemdkragen / V-Ausschnitt sichtbar unter Jackett
    if (jacketMat) {
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.12 * k, 0.26 * k), shirt);
      front.position.set(0, 0.17 * k, 0.118 * k);
      this.chest.add(front);
      if (look.tie) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(0.045 * k, 0.24 * k, 0.01), std(look.tie, 0.5));
        tie.position.set(0, 0.15 * k, 0.124 * k);
        this.chest.add(tie);
      }
    }
    if (coatMat) {
      // langer Mantel: Kegelstumpf von der Hüfte bis über die Knie
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * k, 0.27 * k, 0.62 * k, 16, 1, true), coatMat);
      skirt.material = coatMat.clone();
      (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      skirt.scale.z = 0.8;
      skirt.position.y = -0.24 * k;
      skirt.castShadow = true;
      this.hips.add(skirt);
    }
    if (look.skirt) {
      const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * k, 0.24 * k, 0.45 * k, 16), std(look.skirt, 0.8));
      sk.scale.z = 0.8;
      sk.position.y = -0.17 * k;
      sk.castShadow = true;
      this.hips.add(sk);
    }
    this.stain = new THREE.Mesh(new THREE.CircleGeometry(0.06 * k, 12), std('#4a2a14', 0.4));
    this.stain.position.set(0.04, 0.05 * k, 0.122 * k);
    this.stain.visible = false;
    this.chest.add(this.stain);

    // Hals & Kopf
    const neckM = capsule(0.055 * k, 0.12 * k, skin);
    neckM.position.y = 0.0;
    this.neck.add(neckM);
    // Kopf als Drehkörper (Schaufensterpuppen-Profil: Kinn, Wangen, Schädel)
    const prof = [
      [0.0, -0.005], [0.03, 0.0], [0.052, 0.025], [0.066, 0.065], [0.077, 0.105], [0.082, 0.145],
      [0.08, 0.18], [0.07, 0.212], [0.05, 0.236], [0.025, 0.248], [0.0, 0.251],
    ].map(([r, y]) => new THREE.Vector2(r * k * 1.18, y * k));
    const headGeo = new THREE.LatheGeometry(prof, 28);
    headGeo.scale(0.86, 1, 1.0);
    headGeo.computeVertexNormals();
    const headM = new THREE.Mesh(headGeo, skin);
    headM.position.y = -0.008 * k;
    headM.castShadow = true;
    this.head.add(headM);
    // dezentes Gesicht: Nase, Augenhöhlen, Brauen – bewusst neutral wie eine Schaufensterpuppe
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02 * k, 10, 8), skin);
    nose.scale.set(0.8, 1.3, 1.1);
    nose.position.set(0, 0.105 * k, 0.1 * k);
    this.head.add(nose);
    const socketMat = std(look.skin ?? '#d6a787', 0.7, { color: new THREE.Color(look.skin ?? '#d6a787').multiplyScalar(0.72) });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.016 * k, 10, 8), socketMat);
      e.scale.set(1.3, 0.75, 0.5);
      e.position.set(s * 0.037 * k, 0.13 * k, 0.088 * k);
      this.head.add(e);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024 * k, 8, 8), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * 0.098 * k, 0.11 * k, 0);
      this.head.add(ear);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.004 * k, 0.03 * k, 2, 6), hairMat);
      brow.rotation.z = Math.PI / 2 + s * 0.12;
      brow.position.set(s * 0.038 * k, 0.152 * k, 0.094 * k);
      this.head.add(brow);
    }
    // Haare
    const style = look.hairStyle ?? 'short';
    if (style !== 'bald') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1 * k, 24, 14, 0, Math.PI * 2, 0, Math.PI * (style === 'long' ? 0.62 : 0.52)), hairMat);
      cap.scale.set(0.9, 0.98, 1.06);
      cap.position.set(0, 0.145 * k, -0.012 * k);
      cap.rotation.x = -0.42;
      cap.castShadow = true;
      this.head.add(cap);
      if (style === 'short' || style === 'slick') {
        const quiff = new THREE.Mesh(new THREE.SphereGeometry(0.06 * k, 12, 8), hairMat);
        quiff.scale.set(1.35, 0.42, 1.0);
        quiff.position.set(0, 0.228 * k, 0.03 * k);
        this.head.add(quiff);
      }
      if (style === 'bun') {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.05 * k, 12, 10), hairMat);
        bun.position.set(0, 0.2 * k, -0.1 * k);
        this.head.add(bun);
      }
      if (style === 'long') {
        const back = capsule(0.085 * k, 0.28 * k, hairMat);
        back.position.set(0, 0.0, -0.06 * k);
        back.scale.set(1.2, 1, 0.6);
        this.head.add(back);
      }
    }
    if (look.sunglasses || look.glasses) {
      const gm = look.sunglasses ? std('#050505', 0.05, { metalness: 0.8 }) : std('#222', 0.3);
      for (const s of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.045 * k, look.sunglasses ? 0.03 * k : 0.026 * k, 0.006), look.sunglasses ? gm : std('#cfe6f2', 0.05, { transparent: true, opacity: 0.3 }));
        lens.position.set(s * 0.037 * k, 0.13 * k, 0.106 * k);
        this.head.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.13 * k, 0.006, 0.006), gm);
      bridge.position.set(0, 0.142 * k, 0.106 * k);
      this.head.add(bridge);
    }
    this.head.traverse((o) => this.headMeshes.push(o));
    this.eye.position.set(0, 0.13 * k, 0.1 * k);
    this.head.add(this.eye);

    // Arme
    const sleeve = jacketMat ?? coatMat ?? shirt;
    for (const side of [1, -1]) {
      const L = side === 1;
      const shoulder = L ? this.shoulderL : this.shoulderR;
      const elbow = L ? this.elbowL : this.elbowR;
      const hand = L ? this.handL : this.handR;
      shoulder.position.set(side * sh, 0.25 * k, 0);
      this.chest.add(shoulder);
      const ua = capsule(0.05 * k, upperArm + 0.04, sleeve);
      ua.position.y = -upperArm / 2;
      shoulder.add(ua);
      elbow.position.y = -upperArm;
      shoulder.add(elbow);
      const fa = capsule(0.043 * k, foreArm + 0.03, sleeve);
      fa.position.y = -foreArm / 2;
      elbow.add(fa);
      hand.position.y = -foreArm;
      elbow.add(hand);
      const cuff = capsule(0.04 * k, 0.03, shirt);
      cuff.position.y = -0.005;
      hand.add(cuff);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075 * k, 0.1 * k, 0.03 * k), skin);
      palm.position.y = -0.06 * k;
      palm.castShadow = true;
      hand.add(palm);
      const thumb = capsule(0.012 * k, 0.05 * k, skin, 6);
      thumb.position.set(-side * 0.035 * k, -0.045 * k, 0.02 * k);
      thumb.rotation.z = side * 0.6;
      hand.add(thumb);
    }
    // Beine
    for (const side of [1, -1]) {
      const L = side === 1;
      const th = L ? this.thighL : this.thighR;
      const kn = L ? this.kneeL : this.kneeR;
      const an = L ? this.ankleL : this.ankleR;
      th.position.set(side * 0.1 * k, -0.04 * k, 0);
      this.hips.add(th);
      const tm = capsule(0.075 * k * (fem ? 0.95 : 1), thigh + 0.06, pants);
      tm.position.y = -thigh / 2;
      th.add(tm);
      kn.position.y = -thigh;
      th.add(kn);
      const sm = capsule(0.058 * k, shin + 0.04, fem && look.skirt ? skin : pants);
      sm.position.y = -shin / 2;
      kn.add(sm);
      an.position.y = -shin;
      kn.add(an);
      const footGeo = new THREE.CapsuleGeometry(0.045 * k, 0.17 * k, 4, 10);
      footGeo.rotateX(Math.PI / 2);
      footGeo.scale(1.05, 0.72, 1);
      const foot = new THREE.Mesh(footGeo, shoes);
      foot.position.set(0, -0.04 * k, 0.055 * k);
      foot.castShadow = true;
      an.add(foot);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09 * k, 0.018 * k, 0.25 * k), std('#1a1410', 0.9));
      sole.position.set(0, -0.068 * k, 0.055 * k);
      an.add(sole);
    }

    // Sockel
    const mk = (name: string, parent: THREE.Object3D, p: [number, number, number]) => {
      const o = new THREE.Object3D();
      o.position.set(...p);
      parent.add(o);
      this.sockets[name] = o;
    };
    mk('handR', this.handR, [0, -0.09 * k, 0.03 * k]);
    mk('handL', this.handL, [0, -0.09 * k, 0.03 * k]);
    mk('head', this.head, [0, 0.13 * k, 0.1 * k]);
    mk('ear', this.head, [-0.11 * k, 0.12 * k, 0.02]);
    mk('chest', this.chest, [0, 0.12 * k, 0.14 * k]);
    mk('pocket', this.chest, [0.09 * k, 0.12 * k, 0.12 * k]);
    mk('hip', this.hips, [-0.17 * k, -0.04, 0.03]);
    mk('root', this.root, [0, 0, 0]);
  }

  setStain(on: boolean) {
    if (this.stain) this.stain.visible = on;
  }

  apply(p: Pose) {
    const g = (k: keyof Pose) => p[k] ?? 0;
    this.hips.position.y = this.hipH + g('hipsY');
    this.hips.rotation.set(g('hipsP'), g('hipsYaw'), g('hipsR'));
    this.spine.rotation.set(g('spineP'), g('spineY'), g('spineR'));
    this.chest.rotation.set(g('chestP'), g('chestY'), 0);
    this.neck.rotation.set(g('neckP'), 0, 0);
    this.head.rotation.set(g('headP'), g('headY'), g('headR'));
    this.shoulderL.rotation.set(-g('armLP'), g('armLT'), g('armLA'));
    this.shoulderR.rotation.set(-g('armRP'), -g('armRT'), -g('armRA'));
    this.elbowL.rotation.set(-g('elbowL'), 0, 0);
    this.elbowR.rotation.set(-g('elbowR'), 0, 0);
    this.handL.rotation.set(-g('wristL'), 0, 0);
    this.handR.rotation.set(-g('wristR'), 0, 0);
    this.thighL.rotation.set(-g('legLP'), 0, g('legLA'));
    this.thighR.rotation.set(-g('legRP'), 0, -g('legRA'));
    this.kneeL.rotation.set(g('kneeL'), 0, 0);
    this.kneeR.rotation.set(g('kneeR'), 0, 0);
    this.ankleL.rotation.set(-g('footL'), 0, 0);
    this.ankleR.rotation.set(-g('footR'), 0, 0);
  }
}
