import * as THREE from 'three';
import { M, box, rng, worldBox } from '../materials';
import { L } from '../layout';
import { Vehicle } from '../actors/Vehicle';
import { bench, streetLamp, tree } from './furniture';
import type { SetContext } from './SetContext';

const ROAD_Y = -0.12;

/** Straße, Gehwege, Nachbarhäuser, Ampel und fließender Verkehr. */
export function buildCity(ctx: SetContext): THREE.Group {
  const g = new THREE.Group();
  g.name = 'set.city';

  // Boden & Straßen
  const ground = worldBox(600, 0.2, 600, M.concrete(), 0, ROAD_Y - 0.11, 0, 6);
  ground.castShadow = false;
  g.add(ground);
  g.add(worldBox(320, 0.02, L.road.z1 - L.road.z0, M.asphalt(), 0, ROAD_Y - 0.01, 0, 10));
  const sideRoad = worldBox(L.sideStreet.x1 - L.sideStreet.x0, 0.02, 160, M.asphalt(), (L.sideStreet.x0 + L.sideStreet.x1) / 2, ROAD_Y - 0.01, -86, 10);
  g.add(sideRoad);
  g.add(worldBox(L.sideStreet.x1 - L.sideStreet.x0, 0.02, 120, M.asphalt(), (L.sideStreet.x0 + L.sideStreet.x1) / 2, ROAD_Y - 0.01, 66, 10));

  // Gehwege (Oberkante y = 0)
  const sw = (x0: number, x1: number, z0: number, z1: number) => {
    const m = worldBox(x1 - x0, 0.24, z1 - z0, M.sidewalk(), (x0 + x1) / 2, -0.12, (z0 + z1) / 2, 2);
    g.add(m);
    return m;
  };
  const pb = L.parkingBay;
  sw(-28, pb.x0, L.sidewalkN.z0 - 0.5, L.sidewalkN.z1);
  sw(pb.x0, pb.x1, L.sidewalkN.z0 - 0.5, pb.z0);
  sw(pb.x1, 160, L.sidewalkN.z0 - 0.5, L.sidewalkN.z1);
  g.add(worldBox(pb.x1 - pb.x0, 0.02, pb.z1 - pb.z0, M.asphalt(), (pb.x0 + pb.x1) / 2, ROAD_Y - 0.005, (pb.z0 + pb.z1) / 2, 10));
  sw(-160, L.sideStreet.x0, L.sidewalkN.z0 - 40, L.sidewalkN.z1);
  sw(L.sideWalkE.x0, L.sideWalkE.x1, -150, L.sidewalkN.z0 - 0.5);
  sw(-160, 160, L.sidewalkS.z0, L.sidewalkS.z1 + 40);
  // Plätze zwischen den Häusern
  sw(16, 24, -60, L.sidewalkN.z0 - 0.5);
  sw(-40, -36, -150, L.sidewalkN.z0 - 40);

  // Markierungen
  const lineMat = M.roadLine();
  for (let x = -150; x < 150; x += 6) {
    if (Math.abs(x - L.crosswalkX) < 5) continue;
    g.add(box(3, 0.01, 0.14, lineMat, x, ROAD_Y + 0.002, 0, { cast: false }));
  }
  for (const z of [L.road.z0 + 0.25, L.road.z1 - 0.25]) g.add(box(300, 0.01, 0.12, lineMat, 0, ROAD_Y + 0.002, z, { cast: false }));
  // Fußgängerüberweg
  for (let z = L.road.z0 + 0.6; z < L.road.z1 - 0.4; z += 1.0) {
    g.add(box(4, 0.012, 0.5, lineMat, L.crosswalkX, ROAD_Y + 0.003, z, { cast: false }));
  }
  for (const dx of [-3.2, 3.2]) g.add(box(0.3, 0.012, 12, lineMat, L.crosswalkX + dx, ROAD_Y + 0.003, 0, { cast: false }));

  // Gebäude rundherum (Nachbarn & Skyline)
  const r = rng(77);
  const tones = ['#7b7f84', '#8d877d', '#6c737a', '#9a958c', '#5f666e', '#a39b8f'];
  const bldg = (x0: number, x1: number, z0: number, z1: number, h: number, seed: number) => {
    const tone = tones[seed % tones.length];
    const m = worldBox(x1 - x0, h, z1 - z0, M.facade(seed, tone), (x0 + x1) / 2, h / 2, (z0 + z1) / 2, 18, 28.8);
    g.add(m);
    // Erdgeschoss-Sockel
    g.add(box(x1 - x0 + 0.1, 4.2, z1 - z0 + 0.1, M.glassDark(), (x0 + x1) / 2, 2.1, (z0 + z1) / 2));
    g.add(box(x1 - x0 + 0.4, 0.5, z1 - z0 + 0.4, M.concrete(), (x0 + x1) / 2, h + 0.25, (z0 + z1) / 2));
  };
  bldg(L.neighbor.x0, L.neighbor.x1, -41, -11, 24, 1);
  bldg(24, 62, -48, -11, 33, 2);
  bldg(62, 100, -44, -11, 21, 3);
  bldg(-80, -40, -52, -11 - 0.5, 27, 4);
  bldg(-24, 16, -90, -45, 38, 5);
  // Süden (gegenüber)
  bldg(-90, -38, 11.5, 40, 25, 6);
  bldg(-26, -2, 11.5, 36, 31, 7);
  bldg(-2, 14, 11.5, 38, 19, 8);
  bldg(24, 56, 11.5, 42, 28, 9);
  bldg(56, 100, 11.5, 40, 35, 10);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const d = 150 + r() * 80;
    const w = 25 + r() * 25;
    const h = 30 + r() * 70;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const m = worldBox(w, h, w, M.facade(20 + (i % 6), tones[i % tones.length]), x, h / 2, z, 18, 28.8);
    m.castShadow = false;
    g.add(m);
  }

  // Bäume, Laternen, Bänke
  for (let x = -100; x <= 110; x += 13) {
    if (Math.abs(x - L.crosswalkX) < 6) continue;
    const t = tree(Math.abs(x) + 3);
    t.position.set(x, 0, 9.7);
    g.add(t);
  }
  for (const x of [-21, 26, 44, 63]) {
    const t = tree(x + 100);
    t.position.set(x, 0, -6.9);
    g.add(t);
  }
  for (let x = -90; x <= 100; x += 26) {
    const l1 = streetLamp();
    l1.position.set(x, 0, -6.5);
    l1.rotation.y = -Math.PI / 2;
    g.add(l1);
    const l2 = streetLamp();
    l2.position.set(x + 13, 0, 6.5);
    l2.rotation.y = Math.PI / 2;
    g.add(l2);
  }
  const b1 = bench();
  b1.position.set(30, 0, 8.6);
  b1.rotation.y = Math.PI;
  g.add(b1);

  // Ampel am Überweg
  buildTrafficLights(ctx, g);

  // Verkehr
  buildTraffic(ctx, g);
  return g;
}

function buildTrafficLights(ctx: SetContext, g: THREE.Group) {
  const x = L.crosswalkX;
  const mk = (px: number, pz: number, facing: number) => {
    const pole = new THREE.Group();
    pole.position.set(px, 0, pz);
    pole.rotation.y = facing;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 10), M.darkMetal());
    p.position.y = 1.8;
    p.castShadow = true;
    pole.add(p);
    // Auto-Ampel (Richtung Fahrbahn)
    const head = box(0.28, 0.85, 0.22, M.darkMetal(), 0, 3.1, 0.15);
    pole.add(head);
    const lamps: THREE.Mesh[] = [];
    ['#ff2010', '#ffb000', '#20ff60'].forEach((c, i) => {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 10),
        new THREE.MeshStandardMaterial({ color: '#111', emissive: c, emissiveIntensity: 0 }),
      );
      lamp.position.set(0, 3.36 - i * 0.26, 0.27);
      pole.add(lamp);
      lamps.push(lamp);
    });
    // Fußgänger-Ampel (seitlich)
    const ped = box(0.22, 0.5, 0.16, M.darkMetal(), 0.0, 2.2, -0.14);
    pole.add(ped);
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.17), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff2010', emissiveIntensity: 0 }));
    pr.position.set(0, 2.32, -0.225);
    pr.rotation.y = Math.PI;
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.17), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#30ff70', emissiveIntensity: 0 }));
    pg.position.set(0, 2.1, -0.225);
    pg.rotation.y = Math.PI;
    pole.add(pr, pg);
    // Taster
    const btn = box(0.12, 0.16, 0.08, M.plastic('#e8c41a'), 0, 1.1, -0.1);
    pole.add(btn);
    g.add(pole);
    return { lamps, pr, pg };
  };
  // Nordseite schaut nach Westen (Verkehr Richtung -X kommt von Osten) etc.
  const north = mk(x - 2.2, L.road.z0 - 0.6, Math.PI / 2);
  const south = mk(x + 2.2, L.road.z1 + 0.6, -Math.PI / 2);
  ctx.name('street.trafficLight', north.lamps[0].parent!);
  ctx.onUpdate((t) => {
    const ped = ctx.timeline.state('ampel.ped', t) === 'green';
    const yellow = ctx.timeline.state('ampel.car', t) === 'yellow';
    for (const s of [north, south]) {
      (s.lamps[0].material as THREE.MeshStandardMaterial).emissiveIntensity = ped ? 6 : 0;
      (s.lamps[1].material as THREE.MeshStandardMaterial).emissiveIntensity = yellow ? 6 : 0;
      (s.lamps[2].material as THREE.MeshStandardMaterial).emissiveIntensity = !ped && !yellow ? 6 : 0;
      (s.pr.material as THREE.MeshStandardMaterial).emissiveIntensity = ped ? 0 : 4;
      (s.pg.material as THREE.MeshStandardMaterial).emissiveIntensity = ped ? 4 : 0;
    }
  });
}

/**
 * Deterministischer Verkehr: Position = Funktion(t). Der Verkehrsfluss
 * (state "traffic.flow", 0..1) wird über die Zeit integriert, Autos bremsen
 * also weich ab und fahren wieder an. Die Abstände werden beim Laden so
 * verschoben, dass Überweg und Story-Limousine frei bleiben.
 */
function buildTraffic(ctx: SetContext, g: THREE.Group) {
  const tl = ctx.timeline;
  const SPEED = 11;
  const LOOP = 320;
  const DT = 0.05;
  const steps = Math.ceil(tl.duration / DT) + 2;
  const dist = new Float32Array(steps);
  let flow = 1;
  for (let i = 1; i < steps; i++) {
    const t = i * DT;
    const target = Number(tl.state('traffic.flow', t) ?? 1);
    flow += (target - flow) * Math.min(1, DT / 0.9);
    dist[i] = dist[i - 1] + SPEED * flow * DT;
  }
  const D = (t: number) => {
    const f = Math.max(0, Math.min(steps - 1.001, t / DT));
    const i = Math.floor(f);
    return dist[i] + (dist[i + 1] - dist[i]) * (f - i);
  };
  const colors = ['#d8d8d8', '#2b3e5c', '#7a1f1f', '#9aa1a8', '#1e1e1e', '#e6e1d6', '#3c5a3a', '#5b5f63'];
  const lanes = [
    { z: -3, dir: -1, count: 7 },
    { z: 3, dir: 1, count: 7 },
  ];
  const sedanSamples: { t: number; p: THREE.Vector3 }[] = [];
  if (tl.hasActorTrack('black_sedan')) {
    for (let t = 0; t < tl.duration; t += 0.5) sedanSamples.push({ t, p: tl.actorPosition('black_sedan', t) });
  }
  const stopTimes: number[] = [];
  for (let t = 0; t < tl.duration; t += 0.5) if (Number(tl.state('traffic.flow', t) ?? 1) < 0.5) stopTimes.push(t);
  const wrap = (x: number) => ((((x + LOOP / 2) % LOOP) + LOOP) % LOOP) - LOOP / 2;

  for (const lane of lanes) {
    const spacing = LOOP / lane.count;
    const r = rng(lane.z > 0 ? 5 : 9);
    const jitter = Array.from({ length: lane.count }, () => (r() - 0.5) * spacing * 0.4);
    const posAt = (i: number, shift: number, t: number) => wrap(i * spacing + jitter[i] + shift + lane.dir * D(t));
    // beste Verschiebung suchen
    let best = 0;
    let bestCost = Infinity;
    for (let shift = 0; shift < spacing; shift += 0.5) {
      let cost = 0;
      for (let i = 0; i < lane.count; i++) {
        for (const t of stopTimes) {
          const x = posAt(i, shift, t);
          const dx = (x - L.crosswalkX) * lane.dir;
          if (dx > -9 && dx < 4) cost += 10;
        }
        for (const s of sedanSamples) {
          if (Math.abs(s.p.z - lane.z) > 2.5 || Math.abs(s.p.x) > 140) continue;
          const x = posAt(i, shift, s.t);
          if (Math.abs(x - s.p.x) < 14) cost += 3;
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = shift;
      }
    }
    for (let i = 0; i < lane.count; i++) {
      const v = new Vehicle(colors[(i * 3 + (lane.z > 0 ? 1 : 0)) % colors.length]);
      v.group.name = `traffic.${lane.z > 0 ? 'east' : 'west'}.${i}`;
      v.group.rotation.y = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      ctx.dyn(v.group);
      g.add(v.group);
      ctx.onUpdate((t) => {
        const x = posAt(i, best, t);
        v.group.position.set(x, ROAD_Y, lane.z);
        v.setDistance(D(t));
        const f = Number(tl.state('traffic.flow', t) ?? 1);
        v.setBraking(f < 0.9);
      });
    }
  }
}
