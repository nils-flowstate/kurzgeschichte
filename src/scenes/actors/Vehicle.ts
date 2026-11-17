import * as THREE from 'three';
import { M } from '../materials';

let bodyGeo: THREE.ExtrudeGeometry | null = null;
let cabinGeo: THREE.ExtrudeGeometry | null = null;

function profileGeo(points: [number, number][], width: number) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
    curveSegments: 4,
  });
  // Profil liegt in XY (x = Fahrzeuglänge), Extrusion entlang Z -> drehen, sodass Länge = Z
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Limousine (Platzhalter), Front zeigt nach +Z. */
export class Vehicle {
  readonly group = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private occupants: THREE.Mesh[] = [];
  private brake: THREE.Mesh[] = [];

  constructor(color: string, opts: { glassOpacity?: number; name?: string } = {}) {
    if (!bodyGeo) {
      bodyGeo = profileGeo(
        [
          [-2.4, 0.32],
          [-2.45, 0.62],
          [-2.35, 0.95],
          [-1.15, 1.0],
          [1.05, 1.0],
          [2.3, 0.86],
          [2.42, 0.62],
          [2.38, 0.32],
        ],
        1.72,
      );
      cabinGeo = profileGeo(
        [
          [-1.75, 0.98],
          [-1.05, 1.4],
          [0.35, 1.43],
          [1.15, 0.98],
        ],
        1.56,
      );
    }
    const body = new THREE.Mesh(bodyGeo, M.carPaint(color));
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#0b0f14',
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: opts.glassOpacity ?? 0.88,
      clearcoat: 1,
    });
    const cabin = new THREE.Mesh(cabinGeo!, glassMat);
    cabin.castShadow = true;
    this.group.add(cabin);
    // Dachholm
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 1.3), M.carPaint(color));
    roof.position.set(0, 1.47, -0.33);
    this.group.add(roof);
    const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.25, 12);
    rimGeo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const w = new THREE.Group();
        const tire = new THREE.Mesh(tireGeo, M.tire());
        tire.castShadow = true;
        const rim = new THREE.Mesh(rimGeo, M.metal());
        w.add(tire, rim);
        w.position.set(sx * 0.82, 0.34, sz * 1.45);
        this.group.add(w);
        this.wheels.push(w);
      }
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.05), M.emissive('#fff6e0', 1.5));
      head.position.set(sx * 0.6, 0.78, 2.46);
      this.group.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.09, 0.05),
        new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff1a10', emissiveIntensity: 1.2 }),
      );
      tail.position.set(sx * 0.6, 0.86, -2.47);
      this.group.add(tail);
      this.brake.push(tail);
    }
    // Insassen-Silhouetten (Fahrer + Beifahrer/hinten)
    const headGeo = new THREE.SphereGeometry(0.11, 12, 10);
    const silMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 });
    for (const [x, z] of [
      [0.38, 0.05],
      [-0.38, -0.9],
    ]) {
      const h = new THREE.Mesh(headGeo, silMat);
      h.position.set(x, 1.22, z);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.25, 4, 8), silMat);
      torso.position.set(0, -0.32, 0);
      h.add(torso);
      this.group.add(h);
      this.occupants.push(h);
    }
    if (opts.name) this.group.name = opts.name;
  }

  setDistance(d: number) {
    for (const w of this.wheels) w.rotation.x = d / 0.34;
  }
  setOccupants(n: number) {
    this.occupants.forEach((o, i) => (o.visible = i < n));
  }
  setBraking(on: boolean) {
    for (const b of this.brake) (b.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 4 : 1.2;
  }
}
