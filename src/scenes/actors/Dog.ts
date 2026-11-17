import * as THREE from 'three';

const mat = (c: string, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

function cap(r: number, len: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Husky-Platzhalter (Blick +Z). */
export class Dog {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly collar = new THREE.Object3D();
  readonly sockets: Record<string, THREE.Object3D> = {};
  readonly headMeshes: THREE.Object3D[] = [];
  readonly eye = new THREE.Object3D();
  private legs: { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number }[] = [];
  private tail = new THREE.Group();

  constructor() {
    const grey = mat('#5d6166');
    const white = mat('#cfccc5');
    const dark = mat('#222');
    this.root.add(this.body);
    this.body.position.y = 0.52;
    const torso = cap(0.17, 0.78, grey);
    torso.rotation.x = Math.PI / 2;
    this.body.add(torso);
    const belly = cap(0.14, 0.6, white);
    belly.rotation.x = Math.PI / 2;
    belly.position.y = -0.06;
    this.body.add(belly);
    // Kopf
    this.head.position.set(0, 0.17, 0.4);
    this.body.add(this.head);
    const neck = cap(0.11, 0.3, grey);
    neck.rotation.x = -0.6;
    neck.position.set(0, -0.04, -0.05);
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), grey);
    skull.position.set(0, 0.07, 0.06);
    skull.castShadow = true;
    this.head.add(skull);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), white);
    mask.position.set(0, 0.04, 0.11);
    this.head.add(mask);
    const snout = cap(0.05, 0.16, white);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.02, 0.2);
    this.head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), dark);
    nose.position.set(0, 0.035, 0.285);
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), grey);
      ear.position.set(s * 0.065, 0.2, 0.03);
      ear.rotation.z = -s * 0.2;
      this.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), mat('#7fb6e8', 0.1));
      eye.position.set(s * 0.045, 0.1, 0.165);
      this.head.add(eye);
    }
    this.head.traverse((o) => this.headMeshes.push(o));
    this.eye.position.set(0, 0.1, 0.2);
    this.head.add(this.eye);
    this.collar.position.set(0, 0.0, -0.02);
    this.head.add(this.collar);
    const collarM = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 16), mat('#b91c1c', 0.5));
    collarM.rotation.x = Math.PI / 2 - 0.6;
    collarM.position.set(0, -0.02, -0.04);
    this.head.add(collarM);
    // Beine
    for (const front of [true, false])
      for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.1, -0.05, front ? 0.3 : -0.3);
        this.body.add(hip);
        const upper = cap(0.05, 0.26, grey);
        upper.position.y = -0.12;
        hip.add(upper);
        const knee = new THREE.Group();
        knee.position.y = -0.24;
        hip.add(knee);
        const lower = cap(0.038, 0.26, white);
        lower.position.y = -0.12;
        knee.add(lower);
        const paw = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), white);
        paw.scale.set(1, 0.6, 1.3);
        paw.position.set(0, -0.24, 0.02);
        knee.add(paw);
        this.legs.push({ hip, knee, front, side });
      }
    // Schwanz (eingerollt)
    this.tail.position.set(0, 0.08, -0.45);
    this.body.add(this.tail);
    const tailM = cap(0.05, 0.32, grey);
    tailM.position.set(0, 0.12, -0.03);
    tailM.rotation.x = -0.5;
    this.tail.add(tailM);
    this.sockets.collar = this.collar;
    this.sockets.root = this.root;
    this.sockets.head = this.eye;
  }

  apply(p: Record<string, number>) {
    const phase = p.phase ?? 0;
    const amp = p.amp ?? 0;
    const gallop = p.gallop ?? 0;
    const sit = p.sit ?? 0;
    const pull = p.pull ?? 0;
    this.body.rotation.set(-0.45 * sit - 0.12 * pull, 0, 0);
    this.body.position.y = 0.52 - 0.12 * sit + 0.04 * gallop * Math.abs(Math.sin(phase)) - 0.05 * pull;
    this.head.rotation.set(-0.25 * sit + (p.headP ?? 0) + 0.2 * pull, 0, 0);
    for (const l of this.legs) {
      const off = gallop > 0.5 ? (l.front ? 0 : Math.PI * 0.6) + (l.side > 0 ? 0.25 : 0) : (l.front ? 0 : Math.PI) + (l.side > 0 ? Math.PI : 0);
      const s = Math.sin(phase + off);
      let hipRot = -amp * s * 0.9;
      let kneeRot = (l.front ? -1 : 1) * amp * 0.8 * Math.max(0, Math.cos(phase + off));
      if (sit > 0) {
        if (!l.front) {
          hipRot = -1.3 * sit;
          kneeRot = 2.0 * sit;
        } else hipRot = 0.45 * sit;
      }
      if (pull > 0) hipRot += l.front ? -0.35 : 0.25;
      l.hip.rotation.x = hipRot;
      l.knee.rotation.x = kneeRot;
    }
    this.tail.rotation.set(0.3, p.tail ?? 0, 0);
  }
}
