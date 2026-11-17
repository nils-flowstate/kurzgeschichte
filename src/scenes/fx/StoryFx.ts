import * as THREE from 'three';
import type { Timeline } from '../../timeline/Timeline';
import type { FxEvent } from '../../timeline/types';
import type { Actor } from '../actors/Actor';
import type { Props } from '../Props';
import { rng } from '../materials';

const tmpO = new THREE.Object3D();

/** Effekte, die aus Ereignissen der Timeline berechnet werden (deterministisch). */
export class StoryFx {
  readonly group = new THREE.Group();
  private papers: THREE.InstancedMesh;
  private paperSeeds: { v: THREE.Vector3; rz: number; spin: number }[] = [];
  private spill: THREE.Mesh;
  private droplets: THREE.InstancedMesh;
  private glow: THREE.Points;
  private leash: THREE.Mesh;
  private leashCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);

  constructor(
    private tl: Timeline,
    private actors: Map<string, Actor>,
    private props: Props,
  ) {
    this.group.name = 'fx.story';
    const N = 26;
    const pg = new THREE.PlaneGeometry(0.21, 0.297);
    this.papers = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: '#f5f3ee', roughness: 0.9, side: THREE.DoubleSide }), N);
    this.papers.castShadow = true;
    this.papers.receiveShadow = true;
    this.papers.frustumCulled = false;
    const r = rng(404);
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2;
      const s = 0.6 + r() * 1.8;
      this.paperSeeds.push({ v: new THREE.Vector3(Math.cos(a) * s, 0.8 + r() * 1.6, Math.sin(a) * s), rz: r() * Math.PI * 2, spin: (r() - 0.5) * 14 });
    }
    this.group.add(this.papers);

    const spillGeo = new THREE.CircleGeometry(0.32, 28);
    const pos = spillGeo.attributes.position as THREE.BufferAttribute;
    const r2 = rng(9);
    for (let i = 1; i < pos.count; i++) {
      const f = 0.7 + r2() * 0.5;
      pos.setXY(i, pos.getX(i) * f * 1.3, pos.getY(i) * f);
    }
    spillGeo.rotateX(-Math.PI / 2);
    this.spill = new THREE.Mesh(spillGeo, new THREE.MeshStandardMaterial({ color: '#2a160b', roughness: 0.12, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.spill.receiveShadow = true;
    this.group.add(this.spill);
    this.droplets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshStandardMaterial({ color: '#3a1f0e', roughness: 0.1 }), 30);
    this.droplets.frustumCulled = false;
    this.group.add(this.droplets);

    // „Datenstrom“ um den Brief
    const G = 220;
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(G * 3), 3));
    this.glow = new THREE.Points(
      gg,
      new THREE.PointsMaterial({ color: '#7fe3ff', size: 0.012, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.glow.frustumCulled = false;
    this.group.add(this.glow);

    this.leash = new THREE.Mesh(new THREE.TubeGeometry(this.leashCurve, 16, 0.008, 5), new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.6 }));
    this.leash.castShadow = true;
    this.leash.frustumCulled = false;
    this.group.add(this.leash);
  }

  private last(fx: FxEvent['fx'], t: number): FxEvent | null {
    let cur: FxEvent | null = null;
    for (const e of this.tl.events<FxEvent>('fx')) {
      if (e.t > t) break;
      if (e.fx === fx) cur = e;
    }
    return cur;
  }

  update(t: number) {
    // Papiere
    const pe = this.last('papers', t);
    if (pe && t < pe.t + (pe.dur ?? 20)) {
      this.papers.visible = true;
      const p0 = this.tl.resolve(pe.at);
      const tau = t - pe.t;
      const dur = pe.dur ?? 20;
      const floorY = Math.floor(p0.y / 3.6 + 0.05) * 3.6 + 0.004;
      const k = 2.6;
      const g = 9.81;
      const remaining = tau > dur * 0.55 ? 1 - (tau - dur * 0.55) / (dur * 0.45) : 1;
      this.paperSeeds.forEach((s, i) => {
        const e = 1 - Math.exp(-k * tau);
        let x = p0.x + (s.v.x * e) / k;
        let z = p0.z + (s.v.z * e) / k;
        let y = p0.y + ((s.v.y + g / (k * 4)) * e) / k - (g / (k * 4)) * tau;
        const landed = y <= floorY + i * 0.0006;
        if (landed) y = floorY + i * 0.0006;
        x += landed ? 0 : Math.sin(tau * 3 + i) * 0.05;
        z += landed ? 0 : Math.cos(tau * 2.6 + i) * 0.05;
        tmpO.position.set(x, y, z);
        if (landed) tmpO.rotation.set(-Math.PI / 2, 0, s.rz);
        else tmpO.rotation.set(-Math.PI / 2 + Math.sin(tau * 4 + i) * 0.9, tau * s.spin * 0.2, s.rz + tau * s.spin);
        const vis = i / this.paperSeeds.length < remaining;
        tmpO.scale.setScalar(vis ? 1 : 0);
        tmpO.updateMatrix();
        this.papers.setMatrixAt(i, tmpO.matrix);
      });
      this.papers.instanceMatrix.needsUpdate = true;
    } else this.papers.visible = false;

    // Kaffee
    const se = this.last('spill', t);
    if (se && t < se.t + (se.dur ?? 400)) {
      const p = this.tl.resolve(se.at);
      const tau = t - se.t;
      this.spill.visible = true;
      this.spill.position.set(p.x, p.y + 0.014, p.z);
      const sc = Math.min(1, tau / 0.5);
      this.spill.scale.setScalar(0.2 + 0.8 * Math.sqrt(sc));
      if (tau < 0.7) {
        this.droplets.visible = true;
        const r = rng(77);
        for (let i = 0; i < 30; i++) {
          const a = r() * Math.PI * 2;
          const sp = 0.6 + r() * 1.4;
          const vy = 0.5 + r() * 1.5;
          const y = Math.max(p.y + 0.01, p.y + 1.0 + vy * tau - 4.9 * tau * tau);
          tmpO.position.set(p.x + Math.cos(a) * sp * tau * 0.5, y, p.z + Math.sin(a) * sp * tau * 0.5);
          tmpO.scale.setScalar(1);
          tmpO.rotation.set(0, 0, 0);
          tmpO.updateMatrix();
          this.droplets.setMatrixAt(i, tmpO.matrix);
        }
        this.droplets.instanceMatrix.needsUpdate = true;
      } else this.droplets.visible = false;
    } else {
      this.spill.visible = false;
      this.droplets.visible = false;
    }

    // Datenstrom
    const ge = this.last('letterGlow', t);
    const letter = this.props.get('letter');
    if (ge && letter && letter.visible && t < ge.t + (ge.dur ?? 10)) {
      const tau = t - ge.t;
      const dur = ge.dur ?? 10;
      const fade = Math.min(1, tau / 1.5, (dur - tau) / 1.5);
      (this.glow.material as THREE.PointsMaterial).opacity = 0.85 * Math.max(0, fade);
      this.glow.visible = true;
      const c = new THREE.Vector3().setFromMatrixPosition(letter.matrixWorld);
      const arr = (this.glow.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const r = rng(31);
      for (let i = 0; i < arr.length / 3; i++) {
        const sd = r() * 100;
        const speed = 0.25 + r() * 0.4;
        const ph = (tau * speed + sd) % 1;
        const ang = sd * 6.28 + tau * (0.6 + r());
        const rad = 0.08 + ph * 0.35 + r() * 0.05;
        arr[i * 3] = c.x + Math.cos(ang) * rad;
        arr[i * 3 + 1] = c.y - 0.1 + ph * 0.6;
        arr[i * 3 + 2] = c.z + Math.sin(ang) * rad;
      }
      this.glow.geometry.attributes.position.needsUpdate = true;
    } else this.glow.visible = false;

    // Leine
    const leashState = this.tl.state('leash', t);
    const woman = this.actors.get('woman_red_coat');
    const dog = this.actors.get('husky');
    if (leashState && leashState !== 'none' && woman && dog && dog.object.visible) {
      const a = new THREE.Vector3();
      dog.socket('collar').getWorldPosition(a);
      const b = new THREE.Vector3();
      if (leashState === 'held' && woman.object.visible) {
        woman.socket('handL').getWorldPosition(b);
      } else {
        const back = new THREE.Vector3(0, 0, -1).applyQuaternion(dog.object.quaternion);
        b.copy(dog.object.position).addScaledVector(back, 1.5);
        b.y = dog.object.position.y + 0.02;
      }
      const d = a.distanceTo(b);
      const sag = Math.max(0.03, (1.9 - d) * 0.35);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const p = a.clone().lerp(b, u);
        p.y -= Math.sin(u * Math.PI) * sag;
        p.y = Math.max(p.y, Math.min(a.y, b.y, dog.object.position.y) + 0.01);
        pts.push(p);
      }
      this.leashCurve.points = pts;
      this.leash.geometry.dispose();
      this.leash.geometry = new THREE.TubeGeometry(this.leashCurve, 16, 0.008, 5);
      this.leash.visible = true;
    } else this.leash.visible = false;
  }
}
