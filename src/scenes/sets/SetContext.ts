import * as THREE from 'three';
import type { Timeline } from '../../timeline/Timeline';

export interface SecurityCam {
  id: string;
  group: THREE.Group;
  cone: THREE.Mesh;
  led: THREE.Mesh;
}

/** Gemeinsamer Kontext für alle Set-Bauer: registriert alles, was sich mit t ändert. */
export class SetContext {
  readonly doors = new Map<string, (open: number) => void>();
  readonly updaters: ((t: number) => void)[] = [];
  readonly securityCams: SecurityCam[] = [];
  readonly named = new Map<string, THREE.Object3D>();
  readonly interiorLights: THREE.Light[] = [];
  /** bewegliche Objekte (werden nicht zusammengefasst) */
  readonly dynamic = new Set<THREE.Object3D>();
  /** Original-Meshes für Kamera-Kollision (nach dem Zusammenfassen) */
  collision: THREE.Mesh[] = [];
  constructor(readonly timeline: Timeline) {}

  dyn<T extends THREE.Object3D>(obj: T): T {
    this.dynamic.add(obj);
    return obj;
  }
  door(id: string, apply: (open: number) => void) {
    this.doors.set(id, apply);
  }
  onUpdate(fn: (t: number) => void) {
    this.updaters.push(fn);
  }
  name(id: string, obj: THREE.Object3D) {
    obj.name = id;
    this.named.set(id, obj);
    return obj;
  }

  update(t: number) {
    for (const [id, apply] of this.doors) apply(this.timeline.door(id, t));
    for (const fn of this.updaters) fn(t);
  }
}
