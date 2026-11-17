import * as THREE from 'three';
import { M, box, rng } from '../materials';
import { coneMesh } from '../fx/Volumetric';
import type { SetContext } from './SetContext';

const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, seg = 16) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export function plant(seed: number, height = 1.4, potR = 0.25): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const pot = cyl(potR, potR * 0.8, potR * 1.6, M.pot(), 20);
  pot.position.y = potR * 0.8;
  g.add(pot);
  const soil = cyl(potR * 0.92, potR * 0.92, 0.02, M.fabric('#2b2119'));
  soil.position.y = potR * 1.58;
  g.add(soil);
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.5, 1, 4);
  // Blatt leicht biegen
  const p = leafGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.25;
    p.setZ(i, y * y * 0.6);
    p.setX(i, p.getX(i) * Math.sin(((y / 0.5) * Math.PI) * 0.95 + 0.1));
  }
  leafGeo.translate(0, 0.25, 0);
  leafGeo.computeVertexNormals();
  const n = Math.round(14 + height * 10);
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.Mesh(leafGeo, r() > 0.4 ? M.leaf() : M.leafDark());
    const a = r() * Math.PI * 2;
    const h = potR * 1.6 + r() * (height - potR * 1.6 - 0.35);
    leaf.position.set(Math.cos(a) * 0.05, h, Math.sin(a) * 0.05);
    leaf.rotation.set(0, a, 0);
    leaf.rotateX(-0.3 - r() * 0.9);
    const s = 0.7 + r() * 0.7;
    leaf.scale.set(s, s, s);
    leaf.castShadow = true;
    g.add(leaf);
  }
  const stem = cyl(0.015, 0.02, height * 0.85, M.fabric('#4a3a24'), 6);
  stem.position.y = height * 0.45;
  g.add(stem);
  return g;
}

export function desk(w = 1.6, d = 0.8, h = 0.74, top: THREE.Material = M.woodPlain()): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.035, d, top, 0, h, 0));
  for (const sx of [-1, 1]) {
    g.add(box(0.05, h, d * 0.9, M.darkMetal(), sx * (w / 2 - 0.05), h / 2, 0));
  }
  return g;
}

export function officeChair(color = '#2a2d31'): THREE.Group {
  const g = new THREE.Group();
  const seat = box(0.48, 0.07, 0.46, M.fabric(color), 0, 0.47, 0);
  g.add(seat);
  const back = box(0.46, 0.55, 0.06, M.fabric(color), 0, 0.82, -0.22);
  back.rotation.x = -0.1;
  g.add(back);
  const post = cyl(0.025, 0.025, 0.38, M.darkMetal(), 8);
  post.position.y = 0.25;
  g.add(post);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.03, 0.03, 0.3, M.darkMetal(), Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15);
    leg.rotation.y = a;
    g.add(leg);
  }
  return g;
}

export function monitor(screenMat?: THREE.Material): { group: THREE.Group; screen: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(box(0.62, 0.38, 0.03, M.darkMetal(), 0, 0.33, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.59, 0.35), screenMat ?? M.emissive('#1d2836', 0.6));
  screen.position.set(0, 0.33, 0.016);
  g.add(screen);
  g.add(box(0.05, 0.16, 0.04, M.darkMetal(), 0, 0.08, -0.02));
  g.add(box(0.22, 0.015, 0.16, M.darkMetal(), 0, 0.008, -0.02));
  return { group: g, screen };
}

export function workstation(seed: number): THREE.Group {
  const g = desk(1.6, 0.8);
  const { group: mon } = monitor();
  mon.position.set(0, 0.755, -0.2);
  g.add(mon);
  g.add(box(0.44, 0.02, 0.14, M.plastic('#d8d8d8'), 0, 0.765, 0.12));
  const ch = officeChair(seed % 2 ? '#2a2d31' : '#3b4a5a');
  ch.position.set(0, 0, 0.6);
  ch.rotation.y = Math.PI + (rng(seed)() - 0.5) * 0.6;
  g.add(ch);
  return g;
}

export function mug(color = '#ffffff'): THREE.Group {
  const g = new THREE.Group();
  const body = cyl(0.042, 0.038, 0.095, M.ceramic(color), 18);
  body.position.y = 0.0475;
  g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16), M.ceramic(color));
  handle.position.set(0.046, 0.05, 0);
  handle.rotation.y = 0;
  g.add(handle);
  return g;
}

export function kicker(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.4, 0.2, 0.78, M.woodPlain(), 0, 0.82, 0));
  g.add(box(1.3, 0.02, 0.68, M.fabric('#2d7a3a'), 0, 0.925, 0, { cast: false }));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(box(0.08, 0.72, 0.08, M.woodPlain(), sx * 0.6, 0.36, sz * 0.3));
  for (let i = 0; i < 8; i++) {
    const rod = cyl(0.01, 0.01, 1.3, M.metal(), 6);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(-0.6 + (i * 1.2) / 7, 0.98, 0);
    g.add(rod);
    for (let k = 0; k < 3; k++) {
      const fig = box(0.03, 0.12, 0.04, M.plastic(i % 2 ? '#c0392b' : '#2c5fa8'), -0.6 + (i * 1.2) / 7, 0.94, -0.2 + k * 0.2);
      g.add(fig);
    }
  }
  return g;
}

export function sofa(color = '#5d6670', w = 2.0): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.42, 0.9, M.fabric(color), 0, 0.21, 0));
  g.add(box(w, 0.5, 0.2, M.fabric(color), 0, 0.62, -0.35));
  for (const sx of [-1, 1]) g.add(box(0.18, 0.62, 0.9, M.fabric(color), sx * (w / 2 - 0.09), 0.31, 0));
  return g;
}

export function tvWall(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.8, 0.45, 0.45, M.woodPlain(), 0, 0.225, 0));
  const tv = box(1.45, 0.84, 0.05, M.darkMetal(), 0, 1.05, -0.1);
  g.add(tv);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.79), M.emissive('#203a5a', 0.5));
  scr.position.set(0, 1.05, -0.074);
  g.add(scr);
  // zwei Konsolen
  g.add(box(0.3, 0.06, 0.25, M.plastic('#f2f2f2'), -0.45, 0.48, 0.05));
  g.add(box(0.3, 0.07, 0.25, M.plastic('#111'), 0.45, 0.485, 0.05));
  return g;
}

export function dartboard(): THREE.Group {
  const g = new THREE.Group();
  const rings = ['#1a1a1a', '#c8392b', '#e8dcc0', '#1a1a1a', '#2a8a3a', '#c8392b'];
  rings.forEach((c, i) => {
    const r = 0.23 - i * 0.04;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), M.fabric(c));
    m.position.z = 0.01 + i * 0.002;
    g.add(m);
  });
  const back = cyl(0.25, 0.25, 0.04, M.fabric('#111'), 32);
  back.rotation.x = Math.PI / 2;
  g.add(back);
  return g;
}

export function ceilingPanel(w: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.emissive('#fff4e2', 5.5));
  m.rotation.x = Math.PI / 2;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

export function shelf(w: number, h: number, d: number, levels: number, mat: THREE.Material = M.woodPlain()) {
  const g = new THREE.Group();
  for (let i = 0; i <= levels; i++) g.add(box(w, 0.025, d, mat, 0, (i * h) / levels, 0));
  for (const sx of [-1, 1]) g.add(box(0.025, h, d, mat, sx * (w / 2), h / 2, 0));
  return g;
}

/** Drehtür mit Scharnier links (lokal x=0), Tür öffnet um -Y. */
export function hingedDoor(
  ctx: SetContext,
  id: string,
  w: number,
  h: number,
  mat: THREE.Material,
  maxAngle = -1.75,
): THREE.Group {
  const pivot = new THREE.Group();
  const leaf = box(w, h, 0.045, mat, w / 2, h / 2, 0);
  pivot.add(leaf);
  const handle = box(0.12, 0.02, 0.04, M.metal(), w - 0.1, 1.02, 0.045);
  pivot.add(handle);
  const handle2 = handle.clone();
  handle2.position.z = -0.045;
  pivot.add(handle2);
  ctx.name(id, pivot);
  ctx.dyn(pivot);
  ctx.door(id, (o) => (pivot.rotation.y = o * maxAngle));
  return pivot;
}

/** Schiebetür (2 Flügel), öffnen zur Seite – lokal zentriert. */
export function slidingDoors(ctx: SetContext, id: string, w: number, h: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const l = box(w / 2, h, 0.05, mat, -w / 4, h / 2, 0);
  const r = box(w / 2, h, 0.05, mat, w / 4, h / 2, 0);
  g.add(l, r);
  ctx.name(id, g);
  ctx.dyn(g);
  ctx.door(id, (o) => {
    l.position.x = -w / 4 - o * (w / 2 - 0.04);
    r.position.x = w / 4 + o * (w / 2 - 0.04);
  });
  return g;
}

export function securityCam(ctx: SetContext, id: string, pos: THREE.Vector3, target: THREE.Vector3, fov = 55, range = 9) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mount = box(0.06, 0.12, 0.06, M.plastic('#e8e8e8'), 0, 0.06, 0, { cast: false });
  g.add(mount);
  const head = new THREE.Group();
  const body = box(0.11, 0.1, 0.22, M.plastic('#f0f0f0'), 0, 0, 0, { cast: false });
  head.add(body);
  const lens = cyl(0.035, 0.035, 0.03, M.glassDark(), 16);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.115;
  head.add(lens);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), M.emissive('#ff2a1a', 6));
  led.position.set(0.035, 0.03, 0.11);
  head.add(led);
  g.add(head);
  const dir = target.clone().sub(pos).normalize();
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const cone = coneMesh(range, fov, '#ff3b2a', 0.4);
  cone.position.set(0, 0, 0.12);
  head.add(cone);
  cone.visible = false;
  ctx.name(id, g);
  ctx.dyn(g);
  ctx.securityCams.push({ id, group: g, cone, led });
  return g;
}

export function tree(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const trunk = cyl(0.09, 0.14, 3.2, M.fabric('#4b3b2c'), 8);
  trunk.position.y = 1.6;
  g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4d6b34', roughness: 0.85, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const s = 0.9 + r() * 0.8;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMat);
    blob.position.set((r() - 0.5) * 1.6, 3.6 + r() * 1.6, (r() - 0.5) * 1.6);
    blob.castShadow = true;
    blob.receiveShadow = true;
    g.add(blob);
  }
  const grate = box(1.2, 0.03, 1.2, M.darkMetal(), 0, 0.015, 0, { cast: false });
  g.add(grate);
  return g;
}

export function streetLamp(): THREE.Group {
  const g = new THREE.Group();
  const pole = cyl(0.06, 0.09, 7, M.darkMetal(), 10);
  pole.position.y = 3.5;
  g.add(pole);
  const arm = box(1.4, 0.08, 0.1, M.darkMetal(), 0.65, 6.95, 0);
  g.add(arm);
  g.add(box(0.5, 0.1, 0.25, M.darkMetal(), 1.3, 6.9, 0));
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.8, 0.05, 0.45, M.woodPlain(), 0, 0.45, 0));
  g.add(box(1.8, 0.4, 0.05, M.woodPlain(), 0, 0.72, -0.2));
  for (const sx of [-0.8, 0.8]) g.add(box(0.06, 0.45, 0.45, M.darkMetal(), sx, 0.225, 0));
  return g;
}
