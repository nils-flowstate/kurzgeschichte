import * as THREE from 'three';
import type { Timeline } from '../timeline/Timeline';
import { Actor } from './actors/Actor';
import { Lighting } from './Lighting';
import { Props } from './Props';
import { SetContext } from './sets/SetContext';
import { buildCity } from './sets/City';
import { buildOfficeBuilding } from './sets/OfficeBuilding';
import { StoryFx } from './fx/StoryFx';
import { batchStatic } from './sets/StaticBatcher';

/**
 * Die komplette Welt. `evaluate(t)` setzt ALLES (Figuren, Requisiten, Türen,
 * Licht, Effekte) allein aus der Timeline – Zeit rein, Zustand raus.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly lighting: Lighting;
  readonly actors = new Map<string, Actor>();
  readonly props: Props;
  readonly fx: StoryFx;
  readonly sets: SetContext;
  private objectTracks: { id: string; obj: THREE.Object3D }[] = [];
  private streetShafts?: THREE.Object3D;
  private officeShafts?: THREE.Object3D;
  showCones = false;
  t = 0;

  constructor(
    readonly timeline: Timeline,
    renderer: THREE.WebGLRenderer,
  ) {
    this.scene.name = 'world';
    this.lighting = new Lighting(renderer, this.scene);
    this.sets = new SetContext(timeline);
    const city = buildCity(this.sets);
    const office = buildOfficeBuilding(this.sets);
    this.scene.add(city, office);
    // Unbewegliches zusammenfassen (Draw-Calls sparen)
    if (!new URLSearchParams(location.search).has('nobatch')) {
      this.sets.collision = [...batchStatic(city, this.sets.dynamic), ...batchStatic(office, this.sets.dynamic)];
    }
    this.streetShafts = this.sets.named.get('fx.streetShafts');
    this.officeShafts = this.sets.named.get('fx.officeShafts');

    for (const [id, def] of Object.entries(timeline.data.actors)) {
      if (def.kind === 'object') {
        const obj = this.sets.named.get(String(def.look?.target ?? id));
        if (obj) this.objectTracks.push({ id, obj });
        else console.warn(`[welt] Objekt "${def.look?.target ?? id}" für Spur "${id}" nicht gefunden`);
        continue;
      }
      const a = new Actor(id, def);
      this.actors.set(id, a);
      this.scene.add(a.object);
    }
    this.props = new Props(timeline, this.actors);
    this.scene.add(this.props.group);
    this.fx = new StoryFx(timeline, this.actors, this.props);
    this.scene.add(this.fx.group);
  }

  async loadAssets(onProgress?: (msg: string) => void) {
    await this.lighting.loadHdri(this.timeline.data.assets?.hdri);
    const jobs = [...this.actors.values()].filter((a) => a.def.model).map((a) => a.loadModel());
    if (jobs.length) onProgress?.(`Lade ${jobs.length} Modell(e) …`);
    await Promise.all(jobs);
  }

  evaluate(t: number) {
    this.t = t;
    const tl = this.timeline;
    for (const { id, obj } of this.objectTracks) {
      const s = tl.sampleActor(id, t);
      if (s) obj.position.copy(s.pos);
    }
    for (const [id, a] of this.actors) a.update(tl.sampleActor(id, t), t, tl);
    this.scene.updateMatrixWorld();
    this.sets.update(t);
    this.props.update(t);
    this.fx.update(t);
    const L = tl.light(t);
    this.lighting.apply(L.from, L.to, L.u, this.sets.interiorLights);
    const sh = this.lighting.current.shafts;
    this.setShafts(this.streetShafts, sh);
    this.setShafts(this.officeShafts, sh);
    for (const c of this.sets.securityCams) {
      c.cone.visible = this.showCones;
      const m = c.led.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = Math.floor(t * 1.2) % 2 === 0 ? 6 : 1.5;
    }
  }

  private setShafts(group: THREE.Object3D | undefined, k: number) {
    if (!group) return;
    group.visible = k > 0.01;
    group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (m?.uniforms?.uIntensity) {
        if (m.userData.base === undefined) m.userData.base = m.uniforms.uIntensity.value;
        m.uniforms.uIntensity.value = m.userData.base * k;
      }
    });
  }

  showLabels(on: boolean) {
    for (const a of this.actors.values()) a.showLabel(on);
  }

  /** Bewegtes Set-Objekt (z. B. Aufzugskabine) nach Spur-ID */
  objectTrack(id: string): THREE.Object3D | undefined {
    return this.objectTracks.find((o) => o.id === id)?.obj;
  }

  /** Welt-Position eines Ziels (für Kameras) */
  actorPoint(id: string, socket?: string, out = new THREE.Vector3()): THREE.Vector3 {
    const a = this.actors.get(id);
    if (!a) return out.set(0, 0, 0);
    if (socket) {
      a.socket(socket).getWorldPosition(out);
      return out;
    }
    out.copy(a.object.position);
    out.y += a.chestHeight;
    return out;
  }

  /** Statistik für die Debug-Anzeige */
  stats() {
    let meshes = 0;
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    return { meshes };
  }
}
