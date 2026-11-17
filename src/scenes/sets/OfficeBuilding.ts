import * as THREE from 'three';
import { M, box, worldBox } from '../materials';
import { F8, FLOOR_H, L } from '../layout';
import {
  ceilingPanel,
  dartboard,
  desk,
  hingedDoor,
  kicker,
  monitor,
  mug,
  officeChair,
  plant,
  securityCam,
  shelf,
  slidingDoors,
  sofa,
  tvWall,
  workstation,
  bench,
} from './furniture';
import type { SetContext } from './SetContext';
import { LabelTexture, ScreenTexture } from '../fx/Screens';
import { DustMotes, shaftMesh } from '../fx/Volumetric';

const B = L.building;
const E = L.elevator;

interface Opening {
  c: number;
  w: number;
  h: number;
}

/** Wand entlang X (bei festem z), mit Öffnungen. */
function wallX(g: THREE.Group, x0: number, x1: number, z: number, y0: number, h: number, mat: THREE.Material, open: Opening[] = [], t = 0.12) {
  const ops = [...open].sort((a, b) => a.c - b.c);
  let cur = x0;
  for (const o of ops) {
    const a = o.c - o.w / 2;
    const b = o.c + o.w / 2;
    if (a > cur) g.add(worldBox(a - cur, h, t, mat, (cur + a) / 2, y0 + h / 2, z, 2));
    if (o.h < h) g.add(worldBox(o.w, h - o.h, t, mat, o.c, y0 + o.h + (h - o.h) / 2, z, 2));
    cur = b;
  }
  if (x1 > cur) g.add(worldBox(x1 - cur, h, t, mat, (cur + x1) / 2, y0 + h / 2, z, 2));
}
/** Wand entlang Z (bei festem x). */
function wallZ(g: THREE.Group, z0: number, z1: number, x: number, y0: number, h: number, mat: THREE.Material, open: Opening[] = [], t = 0.12) {
  const ops = [...open].sort((a, b) => a.c - b.c);
  let cur = z0;
  for (const o of ops) {
    const a = o.c - o.w / 2;
    const b = o.c + o.w / 2;
    if (a > cur) g.add(worldBox(t, h, a - cur, mat, x, y0 + h / 2, (cur + a) / 2, 2));
    if (o.h < h) g.add(worldBox(t, h - o.h, o.w, mat, x, y0 + o.h + (h - o.h) / 2, o.c, 2));
    cur = b;
  }
  if (z1 > cur) g.add(worldBox(t, h, z1 - cur, mat, x, y0 + h / 2, (cur + z1) / 2, 2));
}

/** Glasfassade mit Pfosten. axis: 'x' = Fassade entlang X bei z, 'z' = entlang Z bei x */
function curtain(g: THREE.Group, axis: 'x' | 'z', a0: number, a1: number, at: number, y0: number, h: number, skip: [number, number][] = []) {
  const len = a1 - a0;
  const pane = axis === 'x' ? new THREE.Mesh(new THREE.PlaneGeometry(len, h), M.glass()) : new THREE.Mesh(new THREE.PlaneGeometry(len, h), M.glass());
  if (axis === 'x') pane.position.set((a0 + a1) / 2, y0 + h / 2, at);
  else {
    pane.position.set(at, y0 + h / 2, (a0 + a1) / 2);
    pane.rotation.y = Math.PI / 2;
  }
  pane.material = M.glass();
  (pane.material as THREE.Material).side = THREE.DoubleSide;
  pane.renderOrder = 5;
  pane.castShadow = false;
  if (skip.length === 0) g.add(pane);
  else {
    // in Stücke teilen (für Türöffnungen)
    let cur = a0;
    const parts = [...skip].sort((p, q) => p[0] - q[0]);
    for (const [s0, s1] of parts) {
      if (s0 > cur) addPane(cur, s0);
      cur = s1;
    }
    if (a1 > cur) addPane(cur, a1);
  }
  function addPane(p0: number, p1: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p1 - p0, h), M.glass());
    if (axis === 'x') m.position.set((p0 + p1) / 2, y0 + h / 2, at);
    else {
      m.position.set(at, y0 + h / 2, (p0 + p1) / 2);
      m.rotation.y = Math.PI / 2;
    }
    m.renderOrder = 5;
    g.add(m);
  }
  for (let a = a0; a <= a1 + 0.001; a += 1.5) {
    if (skip.some(([s0, s1]) => a > s0 + 0.01 && a < s1 - 0.01)) continue;
    const mull = axis === 'x' ? box(0.06, h, 0.14, M.darkMetal(), a, y0 + h / 2, at) : box(0.14, h, 0.06, M.darkMetal(), at, y0 + h / 2, a);
    g.add(mull);
  }
}

export function buildOfficeBuilding(ctx: SetContext): THREE.Group {
  const g = new THREE.Group();
  g.name = 'set.office';
  const tl = ctx.timeline;
  const W = B.x1 - B.x0;
  const D = B.z1 - B.z0;
  const cx = (B.x0 + B.x1) / 2;
  const cz = (B.z0 + B.z1) / 2;
  const curtainMat = M.facade(42, '#3a4752');

  // Massive Geschosse (1–7 und 9–11) als Fassadenblöcke
  const lowH = F8 - FLOOR_H;
  g.add(worldBox(W, lowH, D, curtainMat, cx, FLOOR_H + lowH / 2, cz, 18, 28.8));
  const topY = F8 + FLOOR_H;
  const topH = B.floors * FLOOR_H - topY;
  g.add(worldBox(W, topH, D, curtainMat, cx, topY + topH / 2, cz, 18, 28.8));
  g.add(box(W + 0.6, 0.6, D + 0.6, M.concrete(), cx, B.floors * FLOOR_H + 0.3, cz));
  // Brüstungsbänder
  for (const y of [FLOOR_H - 0.2, F8 + 3.0, F8 - 0.15]) {
    g.add(box(W + 0.08, y === F8 - 0.15 ? 0.3 : 0.6, D + 0.08, M.darkMetal(), cx, y + (y === F8 - 0.15 ? 0 : 0.3), cz));
  }

  buildLobby(ctx, g);
  buildFloor8(ctx, g);
  buildElevator(ctx, g);

  // Vordach über dem Eingang
  g.add(box(7, 0.18, 2.6, M.darkMetal(), 0, 3.9, B.z1 + 1.2));
  // Hausnummer / Logo
  const logo = new LabelTexture(512, 96, '#e9e4da');
  logo.set('HAUS AM RING 8');
  const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshStandardMaterial({ map: logo.texture, roughness: 0.5, metalness: 0.4 }));
  logoMesh.position.set(0, 4.35, B.z1 + 0.02);
  g.add(logoMesh);
  void tl;
  return g;
}

function buildLobby(ctx: SetContext, g: THREE.Group) {
  const y0 = 0;
  const h = 3.4;
  const lob = new THREE.Group();
  lob.name = 'set.lobby';
  lob.add(worldBox(B.x1 - B.x0, 0.04, B.z1 - B.z0, M.lobbyFloor(), 0, y0 - 0.02, (B.z0 + B.z1) / 2, 1.5));
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0), M.ceiling());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, h, (B.z0 + B.z1) / 2);
  lob.add(ceil);
  for (let x = -12; x <= 12; x += 4)
    for (let z = -38; z <= -14; z += 4) {
      const p = ceilingPanel(1.2, 1.2);
      p.position.set(x, h - 0.01, z);
      lob.add(p);
    }
  // Seiten-/Rückwände
  wallZ(lob, B.z0, B.z1, B.x0 + 0.06, y0, h, M.wallWarm());
  wallZ(lob, B.z0, B.z1, B.x1 - 0.06, y0, h, M.wallWarm());
  wallX(lob, B.x0, B.x1, B.z0 + 0.06, y0, h, M.wallWarm());
  // Holzwand hinter dem Empfang
  lob.add(worldBox(7, h, 0.1, M.wood(), -9, h / 2, -21.5, 3.5, 3.4));
  // Glasfront mit Eingang
  curtain(lob, 'x', B.x0, B.x1, B.z1, y0, h + 0.2, [[-1.6, 1.6]]);
  const entrance = slidingDoors(ctx, 'door.entrance', 3.2, 2.6, M.glass());
  entrance.position.set(0, 0, B.z1);
  lob.add(entrance);
  lob.add(box(3.4, h - 2.6 + 0.2, 0.14, M.darkMetal(), 0, 2.6 + (h + 0.2 - 2.6) / 2, B.z1));
  // Kern + Aufzugtüren
  buildCoreFront(ctx, lob, y0, h, 'elevator.lobby', 0);
  // Drehkreuze
  const tz = L.lobby.turnstileZ;
  for (const x of [-2.4, -0.8, 0.8, 2.4]) {
    lob.add(box(0.22, 1.0, 1.5, M.metal(), x, 0.5, tz));
    lob.add(box(0.2, 0.02, 1.3, M.glassDark(), x, 1.01, tz));
  }
  for (const x of [-1.6, 0, 1.6]) {
    const id = x === 0 ? 'turnstile.mid' : `turnstile.${x}`;
    for (const side of [-1, 1]) {
      const flapPivot = new THREE.Group();
      flapPivot.position.set(x + side * 0.69, 0, tz);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.02), M.glass());
      flap.position.set(-side * 0.25, 0.75, 0);
      flapPivot.add(flap);
      ctx.dyn(flapPivot);
      lob.add(flapPivot);
      ctx.door(`${id}.${side}`, (o) => (flapPivot.rotation.y = side * o * 1.4));
      // gemeinsamer Zustand: beide Flügel folgen "turnstile.mid"
      if (x === 0) ctx.onUpdate((t) => (flapPivot.rotation.y = side * ctx.timeline.door('turnstile.mid', t) * 1.4));
    }
  }
  // Empfang Lobby
  const [rx, rz] = L.lobby.reception;
  lob.add(box(3.4, 1.08, 0.6, M.wood(), rx, 0.54, rz));
  lob.add(box(3.6, 0.05, 0.75, M.counterTop(), rx, 1.1, rz));
  lob.add(desk(2.6, 0.7, 0.74, M.graphite()).translateX(rx).translateZ(rz - 0.9));
  const ch = officeChair();
  ch.position.set(rx, 0, rz - 1.3);
  lob.add(ch);
  const m = monitor();
  m.group.position.set(rx + 0.6, 0.76, rz - 0.75);
  m.group.rotation.y = Math.PI;
  lob.add(m.group);
  // Pflanzen & Sitzbänke
  for (const [x, z, s] of [
    [-14.5, -12.5, 1],
    [14.5, -12.5, 2],
    [-14.5, -29, 3],
    [14.5, -29, 4],
    [5.5, -30.2, 5],
  ] as [number, number, number][]) {
    const p = plant(s, 1.8, 0.32);
    p.position.set(x, 0, z);
    lob.add(p);
  }
  const b = bench();
  b.position.set(9, 0, -13);
  lob.add(b);
  // Überwachung Lobby
  lob.add(securityCam(ctx, 'cam.lobby.entrance', new THREE.Vector3(-14, 3.25, -12.2), new THREE.Vector3(-1, 0, -20), 60, 14));
  lob.add(securityCam(ctx, 'cam.lobby.elevator', new THREE.Vector3(8, 3.25, -30.6), new THREE.Vector3(-1, 0, -24), 55, 12));
  g.add(lob);
}

function buildCoreFront(ctx: SetContext, g: THREE.Group, y0: number, h: number, doorId: string, floor: number) {
  const z = E.zDoor;
  const coreMat = M.graphite();
  const op = 1.2;
  wallX(g, L.core.x0, L.core.x1, z, y0, h, coreMat, [
    { c: E.x, w: op, h: 2.3 },
    { c: -E.x, w: op, h: 2.3 },
  ], 0.2);
  // Rahmen
  for (const x of [E.x, -E.x]) {
    g.add(box(op + 0.16, 0.08, 0.26, M.metal(), x, y0 + 2.34, z));
    for (const s of [-1, 1]) g.add(box(0.08, 2.3, 0.26, M.metal(), x + s * (op / 2 + 0.04), y0 + 1.15, z));
  }
  const doors = slidingDoors(ctx, doorId, op, 2.3, M.metal());
  doors.position.set(E.x, y0, z + 0.06);
  g.add(doors);
  const doors2 = slidingDoors(ctx, doorId + '.b', op, 2.3, M.metal());
  doors2.position.set(-E.x, y0, z + 0.06);
  g.add(doors2);
  // Stockwerksanzeige
  const lbl = new LabelTexture(128, 64);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: lbl.texture, toneMapped: false }));
  disp.position.set(E.x, y0 + 2.62, z + 0.11);
  g.add(disp);
  ctx.onUpdate((t) => {
    const cab = ctx.named.get('elevator.cabin');
    const fl = cab ? Math.round(cab.position.y / FLOOR_H) : floor;
    const moving = cab ? Math.abs(cab.position.y - fl * FLOOR_H) > 0.05 : false;
    lbl.set(`${fl === 0 ? 'E' : fl}${moving ? (Math.floor(t * 2) % 2 ? ' ' : '·') : ''}`);
  });
  // Ruftaster
  const btn = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), M.emissive('#9fd3ff', 2));
  btn.position.set(E.x + 0.95, y0 + 1.1, z + 0.105);
  g.add(btn);
  g.add(box(0.12, 0.22, 0.02, M.metal(), E.x + 0.95, y0 + 1.1, z + 0.1));
}

function buildElevator(ctx: SetContext, g: THREE.Group) {
  const cab = new THREE.Group();
  ctx.name('elevator.cabin', cab);
  ctx.dyn(cab);
  const w = E.w;
  const d = E.d;
  const h = E.h;
  // Kabine: Boden bei y=0, Front bei +z (Türseite)
  cab.add(box(w, 0.05, d, M.lobbyFloor(), 0, -0.025, 0));
  cab.add(box(w, 0.05, d, M.metal(), 0, h + 0.025, 0));
  cab.add(box(0.04, h, d, M.metal(), -w / 2, h / 2, 0));
  cab.add(box(0.04, h, d, M.metal(), w / 2, h / 2, 0));
  cab.add(box(w, h, 0.04, M.wood(), 0, h / 2, -d / 2));
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, d - 0.3, 8), M.metal());
    rail.rotation.x = Math.PI / 2;
    rail.position.set(s * (w / 2 - 0.06), 0.95, 0);
    cab.add(rail);
  }
  const light = ceilingPanel(w - 0.4, d - 0.4);
  light.position.y = h - 0.01;
  cab.add(light);
  // Frontwand mit Kabinentür
  cab.add(box((w - 1.2) / 2, h, 0.05, M.metal(), -w / 2 + (w - 1.2) / 4, h / 2, d / 2));
  cab.add(box((w - 1.2) / 2, h, 0.05, M.metal(), w / 2 - (w - 1.2) / 4, h / 2, d / 2));
  cab.add(box(1.2, h - 2.3, 0.05, M.metal(), 0, 2.3 + (h - 2.3) / 2, d / 2));
  const inner = new THREE.Group();
  const l = box(0.6, 2.3, 0.03, M.metal(), -0.3, 1.15, 0);
  const r = box(0.6, 2.3, 0.03, M.metal(), 0.3, 1.15, 0);
  inner.add(l, r);
  inner.position.z = d / 2 - 0.05;
  cab.add(inner);
  // Tastenfeld
  cab.add(box(0.03, 0.5, 0.18, M.darkMetal(), w / 2 - 0.03, 1.2, d / 2 - 0.3));
  cab.position.set(E.x, 0, E.zCab);
  g.add(cab);
  ctx.onUpdate((t) => {
    const o = Math.max(ctx.timeline.door('elevator.lobby', t), ctx.timeline.door('elevator.f8', t));
    l.position.x = -0.3 - o * 0.56;
    r.position.x = 0.3 + o * 0.56;
  });
}

function buildFloor8(ctx: SetContext, g: THREE.Group) {
  const y0 = F8;
  const H = 3.0;
  const f = L.f8;
  const fl = new THREE.Group();
  fl.name = 'set.floor8';
  const cz = (B.z0 + B.z1) / 2;
  // Boden: Parkett im offenen Bereich, Teppich in Büros
  fl.add(worldBox(B.x1 - B.x0, 0.04, B.z1 - B.z0, M.officeFloor(), 0, y0 - 0.02 + 0.001, cz, 4));
  const carpet = worldBox(f.rooms.ceo.x1 - f.rooms.ceo.x0 - 0.1, 0.012, f.partitionZ - f.roomsZ0 - 0.1, M.carpet(), (f.rooms.ceo.x0 + f.rooms.ceo.x1) / 2, y0 + 0.006, (f.partitionZ + f.roomsZ0) / 2, 2);
  carpet.name = 'ceo.carpet';
  fl.add(carpet);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0), M.ceiling());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, y0 + H, cz);
  fl.add(ceil);
  for (let x = -13; x <= 14; x += 3.4)
    for (let z = -38.5; z <= -13; z += 3.2) {
      const p = ceilingPanel(1.4, 0.5);
      p.position.set(x, y0 + H - 0.01, z);
      fl.add(p);
    }
  // Glasfassaden ringsum
  curtain(fl, 'x', B.x0, B.x1, B.z1, y0, H + 0.6);
  curtain(fl, 'x', B.x0, B.x1, B.z0, y0, H + 0.6);
  curtain(fl, 'z', B.z0, B.z1, B.x0, y0, H + 0.6);
  curtain(fl, 'z', B.z0, B.z1, B.x1, y0, H + 0.6);

  // Aufzugskern
  buildCoreFront(ctx, fl, y0, H, 'elevator.f8', 8);
  fl.add(box(L.core.x1 - L.core.x0, H, L.core.z1 - L.core.z0 - 0.2, M.graphite(), 0, y0 + H / 2, (L.core.z0 + L.core.z1) / 2 - 0.1));
  // Vorraum-Wände
  const vb = f.vestibule;
  wallZ(fl, vb.z0, vb.z1, vb.x0, y0, H, M.wallWhite());
  wallZ(fl, L.core.z1, f.partitionZ, vb.x1 + 0.5, y0, H, M.wallWhite(), [], 1.0);
  // Glas-Trennwand mit Doppeltür
  curtain(fl, 'x', vb.x0, vb.x1, f.partitionZ, y0, H, [[f.glassDoorX - 0.95, f.glassDoorX + 0.95]]);
  const gl = hingedDoor(ctx, 'door.glass8.l', 0.9, 2.4, M.glass(), 1.4);
  gl.position.set(f.glassDoorX - 0.92, y0, f.partitionZ);
  fl.add(gl);
  const gr = hingedDoor(ctx, 'door.glass8.r', 0.9, 2.4, M.glass(), -1.4);
  gr.position.set(f.glassDoorX + 0.92, y0, f.partitionZ);
  gr.scale.x = -1;
  fl.add(gr);
  fl.add(box(1.9, H - 2.4, 0.1, M.darkMetal(), f.glassDoorX, y0 + 2.4 + (H - 2.4) / 2, f.partitionZ));
  ctx.onUpdate((t) => {
    const o = ctx.timeline.door('door.glass8', t);
    gl.rotation.y = -o * 1.4;
    gr.rotation.y = o * 1.4;
  });

  // Büro-Reihe Ost: Robert | CFO | CEO
  const R = f.rooms;
  wallX(fl, vb.x1 + 1, B.x1, f.partitionZ, y0, H, M.wallWhite(), [
    { c: R.robert.door, w: 1.0, h: 2.3 },
    { c: R.cfo.door, w: 1.0, h: 2.3 },
    { c: R.ceo.door, w: 1.0, h: 2.3 },
  ]);
  wallZ(fl, f.roomsZ0, f.partitionZ, R.cfo.x0, y0, H, M.wallWhite());
  wallZ(fl, f.roomsZ0, f.partitionZ, R.ceo.x0, y0, H, M.wallWhite());
  const doorMat = M.woodPlain();
  for (const [id, x] of [
    ['door.robert', R.robert.door],
    ['door.cfo', R.cfo.door],
    ['door.ceo', R.ceo.door],
  ] as [string, number][]) {
    const d = hingedDoor(ctx, id, 0.98, 2.28, doorMat, 1.6);
    d.position.set(x - 0.49, y0, f.partitionZ - 0.02);
    // öffnet nach innen (Richtung -Z)
    d.rotation.y = 0;
    fl.add(d);
    const sign = new LabelTexture(256, 48, '#333');
    sign.set(id === 'door.robert' ? 'R. Brandt' : id === 'door.cfo' ? 'CFO' : 'Geschäftsführung');
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.075), new THREE.MeshStandardMaterial({ map: sign.texture }));
    sm.position.set(x + 0.75, y0 + 1.55, f.partitionZ + 0.07);
    fl.add(sm);
  }
  // Räume West: Besprechung (Glas), Abstellraum
  wallX(fl, B.x0, vb.x0, f.partitionZ - 0.0, y0, H, M.wallWhite(), [
    { c: f.closet[0], w: 0.95, h: 2.25 },
    { c: -7.2, w: 3.6, h: 2.6 },
  ]);
  curtain(fl, 'x', -9.0, -5.4, f.partitionZ, y0, 2.6);
  wallZ(fl, f.roomsZ0, f.partitionZ, -9.5, y0, H, M.wallWhite());
  wallZ(fl, -31, f.partitionZ, -13, y0, H, M.wallWhite());
  wallX(fl, -13, -9.5, -31, y0, H, M.wallWhite());
  const closet = hingedDoor(ctx, 'door.closet', 0.93, 2.23, M.wallWhite(), 1.5);
  closet.position.set(f.closet[0] - 0.465, y0, f.partitionZ - 0.02);
  fl.add(closet);
  const meet = desk(3.2, 1.2, 0.74, M.woodPlain());
  meet.position.set(-7.2, y0, -31);
  fl.add(meet);
  for (const [x, z, r] of [
    [-8.2, -30.0, Math.PI],
    [-6.2, -30.0, Math.PI],
    [-8.2, -32.0, 0],
    [-6.2, -32.0, 0],
  ] as [number, number, number][]) {
    const c = officeChair('#4b5563');
    c.position.set(x, y0, z);
    c.rotation.y = r;
    fl.add(c);
  }
  // Regale im Abstellraum (Putzmittel)
  const sh = shelf(1.6, 1.8, 0.4, 4, M.metal());
  sh.position.set(-11.2, y0, -30.6);
  fl.add(sh);
  for (let i = 0; i < 5; i++) fl.add(box(0.18, 0.28, 0.18, M.plastic(['#2563eb', '#16a34a', '#eab308', '#dc2626', '#9333ea'][i]), -11.8 + i * 0.3, y0 + 0.62, -30.6));

  // Empfang 8. Stock (Rebecca)
  const [ex, ez] = f.reception;
  fl.add(box(0.5, 1.1, 2.6, M.wood(), ex + 0.55, y0 + 0.55, ez));
  fl.add(box(0.7, 0.05, 2.8, M.counterTop(), ex + 0.6, y0 + 1.12, ez));
  fl.add(box(2.4, 1.1, 0.5, M.wood(), ex - 0.4, y0 + 0.55, ez + 1.35));
  const rd = desk(1.6, 0.8, 0.74, M.graphite());
  rd.position.set(ex - 0.15, y0, ez);
  rd.rotation.y = Math.PI / 2;
  fl.add(rd);
  const rm = monitor();
  rm.group.position.set(ex - 0.05, y0 + 0.76, ez - 0.3);
  rm.group.rotation.y = -Math.PI / 2;
  fl.add(rm.group);
  const rc = officeChair('#7c2d12');
  rc.position.set(ex - 0.85, y0, ez);
  rc.rotation.y = Math.PI / 2;
  fl.add(rc);
  const rp = plant(31, 1.6, 0.28);
  rp.position.set(ex + 0.4, y0, ez - 1.9);
  fl.add(rp);

  // Arbeitsplätze West
  let seed = 1;
  for (const x of [-14.2, -11.8])
    for (const z of [-23.5, -20.5, -17.5, -14.5]) {
      const ws = workstation(seed++);
      ws.position.set(x, y0, z);
      ws.rotation.y = x < -13 ? Math.PI / 2 : -Math.PI / 2;
      fl.add(ws);
    }

  // Game Space: Holzwand mit Dartscheibe, 2 Kicker, Sofa, TV mit 2 Konsolen
  fl.add(worldBox(0.12, 2.6, 10, M.wood(), 3.2, y0 + 1.3, -19, 3.5, 2.6));
  const dart = dartboard();
  dart.position.set(3.29, y0 + 1.73, -18);
  dart.rotation.y = Math.PI / 2;
  fl.add(dart);
  const k1 = kicker();
  k1.position.set(6.2, y0, -20.2);
  fl.add(k1);
  const k2 = kicker();
  k2.position.set(6.2, y0, -15.6);
  fl.add(k2);
  const tv = tvWall();
  tv.position.set(10, y0, -11.7);
  tv.rotation.y = Math.PI;
  fl.add(tv);
  const so = sofa('#6b7280', 2.2);
  so.position.set(10, y0, -14.6);
  fl.add(so);
  for (const [x, z, s] of [
    [3.8, -24.6, 41],
    [3.8, -13.0, 42],
    [8.4, -12.3, 43],
    [15.4, -12.3, 44],
    [15.5, -15.8, 45],
  ] as [number, number, number][]) {
    const p = plant(s, 1.5, 0.27);
    p.position.set(x, y0, z);
    fl.add(p);
  }

  // Café-Küche (graphit, Holzvertäfelung, Holzregale)
  const kx = f.kitchenX;
  const kz0 = -26.3;
  const kz1 = f.counterEndZ;
  fl.add(worldBox(0.08, H, kz1 - kz0 + 1.2, M.wood(), B.x1 - 0.18, y0 + H / 2, (kz0 + kz1) / 2, 3.0, 3.0));
  fl.add(box(0.65, 0.9, kz1 - kz0, M.graphite(), kx + 0.03, y0 + 0.45, (kz0 + kz1) / 2));
  fl.add(box(0.7, 0.04, kz1 - kz0, M.counterTop(), kx, y0 + 0.92, (kz0 + kz1) / 2));
  // Kaffeemaschine
  const cm = new THREE.Group();
  cm.add(box(0.36, 0.48, 0.4, M.darkMetal(), 0, 0.24, 0));
  cm.add(box(0.3, 0.06, 0.08, M.metal(), -0.2, 0.28, 0));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#30ff70', emissiveIntensity: 5 }));
  led.position.set(-0.185, 0.4, 0.1);
  cm.add(led);
  const cmScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#8fd3ff', emissiveIntensity: 1.5 }));
  cmScreen.position.set(-0.181, 0.4, -0.06);
  cmScreen.rotation.y = -Math.PI / 2;
  cm.add(cmScreen);
  cm.position.set(kx + 0.05, y0 + 0.94, f.coffeeMachineZ);
  ctx.name('kitchen.coffeeMachine', cm);
  fl.add(cm);
  ctx.onUpdate((t) => {
    const on = ctx.timeline.state('coffee.on', t) !== false;
    const rinse = ctx.timeline.state('coffee.rinse', t) === true;
    const lm = led.material as THREE.MeshStandardMaterial;
    lm.emissive.set(on ? '#30ff70' : rinse ? '#ffb020' : '#ff2a1a');
    lm.emissiveIntensity = rinse ? 2 + 3 * (Math.sin(t * 8) * 0.5 + 0.5) : 5;
    (cmScreen.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.5 : rinse ? 0.8 : 0.05;
  });
  // Offenes Holzregal mit Tassen
  const mugShelf = shelf(1.4, 0.7, 0.3, 2, M.woodPlain());
  mugShelf.position.set(B.x1 - 0.35, y0 + 1.35, f.mugShelfZ);
  mugShelf.rotation.y = Math.PI / 2;
  fl.add(mugShelf);
  const colors = ['#e5e7eb', '#1f2937', '#9ca3af', '#c2410c', '#e5e7eb', '#0f766e', '#f5f5f4', '#4b5563'];
  colors.forEach((c, i) => {
    const m = mug(c);
    m.position.set(B.x1 - 0.32, y0 + 1.36 + (i >= 4 ? 0.35 : 0), f.mugShelfZ - 0.5 + (i % 4) * 0.33);
    m.rotation.y = Math.PI;
    fl.add(m);
  });
  // Spüle
  fl.add(box(0.5, 0.05, 0.7, M.darkMetal(), kx - 0.02, y0 + 0.925, f.sinkZ));
  const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 16, Math.PI), M.metal());
  faucet.position.set(kx + 0.22, y0 + 1.05, f.sinkZ);
  faucet.rotation.y = Math.PI / 2;
  fl.add(faucet);
  // zweites Holzregal mit Gläsern
  const glassShelf = shelf(1.0, 0.7, 0.3, 2, M.woodPlain());
  glassShelf.position.set(B.x1 - 0.35, y0 + 1.35, f.glassShelfZ);
  glassShelf.rotation.y = Math.PI / 2;
  fl.add(glassShelf);
  for (let i = 0; i < 6; i++) {
    const gm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 14), M.glass());
    gm.position.set(B.x1 - 0.32, y0 + 1.42 + (i >= 3 ? 0.35 : 0), f.glassShelfZ - 0.3 + (i % 3) * 0.3);
    fl.add(gm);
  }
  // Kühlschrank-Hochschrank
  fl.add(box(0.65, 2.2, 0.7, M.graphite(), kx + 0.03, y0 + 1.1, kz0 - 0.35));
  // Kücheninsel (Tresen) mit Schranktür
  const I = f.island;
  fl.add(box(0.9, 0.92, I.z1 - I.z0, M.graphite(), I.x, y0 + 0.46, (I.z0 + I.z1) / 2));
  fl.add(box(1.05, 0.05, I.z1 - I.z0 + 0.15, M.woodPlain(), I.x, y0 + 0.945, (I.z0 + I.z1) / 2));
  // innen Teller & Tassen
  for (let i = 0; i < 6; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 20), M.ceramic('#f8f8f6'));
    plate.position.set(I.x - 0.15, y0 + 0.2 + i * 0.015, -21.7);
    fl.add(plate);
  }
  const cupsIn = mug('#d6d3d1');
  cupsIn.position.set(I.x - 0.2, y0 + 0.5, -21.2);
  fl.add(cupsIn);
  const cab = new THREE.Group();
  const cabLeaf = box(0.6, 0.78, 0.02, M.graphite(), 0.3, 0.39, 0);
  cab.add(cabLeaf);
  cab.add(box(0.02, 0.18, 0.03, M.metal(), 0.55, 0.62, 0.02));
  cab.position.set(I.x - 0.46, y0 + 0.08, -21.15);
  cab.rotation.y = Math.PI / 2;
  ctx.name('kitchen.islandCabinet', cab);
  ctx.dyn(cab);
  ctx.door('cabinet.island', (o) => (cab.rotation.y = Math.PI / 2 - o * 0.6));
  fl.add(cab);
  // Hocker
  for (const z of [-23.3, -21.9, -20.4]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16), M.woodPlain());
    st.position.set(I.x - 0.75, y0 + 0.72, z);
    fl.add(st);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.7, 8), M.darkMetal());
    leg.position.set(I.x - 0.75, y0 + 0.35, z);
    fl.add(leg);
  }

  // Zimmerpflanze zwischen CFO- und CEO-Tür
  const big = plant(77, 2.0, 0.36);
  big.position.set(f.plant[0], y0, f.plant[1]);
  ctx.name('f8.bigPlant', big);
  fl.add(big);

  // Robert-Büro
  const rdsk = desk(1.6, 0.8);
  rdsk.position.set(5.75, y0, -34);
  fl.add(rdsk);
  fl.add(box(0.5, 0.4, 0.35, M.paper(), 5.4, y0 + 0.95, -34));
  // CFO-Büro
  const cdsk = desk(1.6, 0.8);
  cdsk.position.set(9.25, y0, -34);
  fl.add(cdsk);
  // CEO-Büro
  const [dx, dz] = f.ceoDesk;
  const cd = desk(2.0, 0.9, 0.75, M.graphite());
  cd.position.set(dx, y0, dz);
  fl.add(cd);
  const screen = new ScreenTexture();
  const mon = monitor(screen.material);
  mon.group.position.set(dx, y0 + 0.77, dz + 0.1);
  mon.group.rotation.y = Math.PI;
  mon.group.scale.setScalar(1.15);
  ctx.name('ceo.monitor', mon.group);
  fl.add(mon.group);
  fl.add(box(0.44, 0.02, 0.14, M.plastic('#222'), dx, y0 + 0.77, dz - 0.25));
  const ceoChair = officeChair('#111');
  ceoChair.position.set(dx, y0, dz - 0.95);
  fl.add(ceoChair);
  for (const [x, z] of [
    [dx - 0.7, dz + 1.0],
    [dx + 0.7, dz + 1.0],
  ]) {
    const c = officeChair('#6b7280');
    c.position.set(x, y0, z);
    c.rotation.y = Math.PI;
    fl.add(c);
  }
  const ceoShelf = shelf(1.8, 2.0, 0.35, 5, M.woodPlain());
  ceoShelf.position.set(B.x1 - 0.3, y0, -33);
  ceoShelf.rotation.y = Math.PI / 2;
  fl.add(ceoShelf);
  const cs = sofa('#374151', 2.0);
  cs.position.set(15.1, y0, -29.8);
  cs.rotation.y = -Math.PI / 2;
  fl.add(cs);
  const ceoPlant = plant(91, 1.7, 0.3);
  ceoPlant.position.set(11.6, y0, -40.2);
  fl.add(ceoPlant);
  const monLight = new THREE.PointLight('#9cc8ff', 0.0, 3, 2);
  monLight.position.set(dx, y0 + 1.1, dz - 0.4);
  fl.add(monLight);
  ctx.onUpdate((t) => {
    const e = ctx.timeline.screen('ceo_pc', t);
    const clock = ctx.timeline.storyClock(t).slice(0, 5);
    screen.render(e, t, clock);
    const flash = e && e.result === 'TREFFER' ? Math.max(0, 1 - Math.abs(t - (e.t + (e.query?.length ?? 0) / (e.typing ?? 9) + 0.8)) * 2) : 0;
    screen.material.emissiveIntensity = 0.55 + flash * 0.9;
    monLight.intensity = (e && e.view !== 'off' ? 0.6 : 0.15) + flash * 2;
  });

  // Innenbeleuchtung (ohne Schatten, günstig)
  for (const [x, z, i] of [
    [-6, -19, 6],
    [8, -19, 6],
    [13.5, -33, 4],
    [-1.4, -29, 3],
  ] as [number, number, number][]) {
    const pl = new THREE.PointLight('#ffe9cf', i, 11, 2);
    pl.position.set(x, y0 + 2.75, z);
    pl.userData.baseIntensity = i;
    ctx.interiorLights.push(pl);
    fl.add(pl);
  }

  // Überwachungskameras 8. Stock
  const cy = y0 + 2.9;
  fl.add(securityCam(ctx, 'cam.f8.vestibule', new THREE.Vector3(-4.7, cy, -30.6), new THREE.Vector3(-1.2, y0, -30.3), 50, 6));
  fl.add(securityCam(ctx, 'cam.f8.reception', new THREE.Vector3(-8.6, cy, -26.6), new THREE.Vector3(-2, y0, -24.5), 55, 9));
  fl.add(securityCam(ctx, 'cam.f8.corridor', new THREE.Vector3(3.9, cy, -26.6), new THREE.Vector3(13, y0, -24.4), 40, 11));
  fl.add(securityCam(ctx, 'cam.f8.gamespace', new THREE.Vector3(3.5, cy, -11.6), new THREE.Vector3(11, y0, -19), 55, 10));
  fl.add(securityCam(ctx, 'cam.f8.kitchen', new THREE.Vector3(15.6, cy, -11.8), new THREE.Vector3(13.6, y0, -22.6), 45, 11));

  // Sonnenlicht-Schächte durch die Fenster + Staub
  const shafts = new THREE.Group();
  for (const [x, z] of [
    [6, -11],
    [10.5, -11],
    [14, -11],
    [-8, -11],
  ]) {
    const s = shaftMesh(1.3, 2.6, 9, '#ffe0b0', 0.05);
    s.position.set(x, y0 + 2.1, z + 0.2);
    s.lookAt(x - 2.6, y0 - 1.2, z - 7);
    shafts.add(s);
  }
  for (const z of [-14, -19, -24]) {
    const s = shaftMesh(1.3, 2.6, 8, '#ffe0b0', 0.045);
    s.position.set(B.x1 - 0.2, y0 + 2.1, z);
    s.lookAt(B.x1 - 7, y0 - 1.2, z - 2.8);
    shafts.add(s);
  }
  ctx.name('fx.officeShafts', shafts);
  fl.add(shafts);
  const dust = new DustMotes(700, new THREE.Vector3(9, y0 + 1.5, -18), new THREE.Vector3(14, 2.6, 12));
  fl.add(dust.points);
  ctx.onUpdate((t) => dust.update(t));

  g.add(fl);
}
