import * as THREE from 'three';
import type {
  ActorKey,
  CamTarget,
  DoorEvent,
  FxEvent,
  LightEvent,
  PosRef,
  PropKey,
  ScreenEvent,
  Shot,
  SoundEvent,
  StateEvent,
  SubtitleEvent,
  TimelineData,
  TimelineEvent,
  Vec3,
} from './types';

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (u: number) => u * u * (3 - 2 * u);
export function easeFn(kind: string | undefined, u: number): number {
  u = clamp(u);
  switch (kind) {
    case 'linear':
      return u;
    case 'in':
      return u * u;
    case 'out':
      return 1 - (1 - u) * (1 - u);
    default:
      return smooth(u);
  }
}
export function angleLerp(a: number, b: number, u: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}

/** Zustand einer Figur zu einem Zeitpunkt – rein aus der Timeline berechnet. */
export interface ActorSample {
  pos: THREE.Vector3;
  heading: number;
  pose: string;
  prevPose: string;
  /** 0..1 Überblendung prevPose -> pose */
  blend: number;
  /** Sekunden seit Beginn der aktuellen Pose */
  poseTime: number;
  /** Sekunden seit Beginn der vorherigen Pose (für deren Zyklus) */
  prevPoseTime: number;
  /** zurückgelegte Strecke (für Schrittzyklus) */
  distance: number;
  speed: number;
  look: THREE.Vector3 | null;
  visible: boolean;
}

interface ActorTrackCache {
  keys: ActorKey[];
  positions: THREE.Vector3[];
  cumDist: number[];
  segHeading: number[];
  segPose: string[];
  poseStart: number[];
}

const TURN_TIME = 0.45;
const POSE_BLEND = 0.35;

export class Timeline {
  readonly data: TimelineData;
  readonly duration: number;
  private tracks = new Map<string, ActorTrackCache>();
  private byType = new Map<string, TimelineEvent[]>();
  private propKeys = new Map<string, PropKey[]>();
  private clockKeys: { t: number; s: number }[];

  constructor(data: TimelineData) {
    this.data = data;
    this.duration = data.meta.duration;
    data.chapters.sort((a, b) => a.t - b.t);
    data.shots.sort((a, b) => a.t - b.t);
    for (const e of data.events) {
      if (!this.byType.has(e.type)) this.byType.set(e.type, []);
      this.byType.get(e.type)!.push(e);
    }
    for (const list of this.byType.values()) list.sort((a, b) => a.t - b.t);
    for (const [id, p] of Object.entries(data.props)) {
      this.propKeys.set(id, [...p.keys].sort((a, b) => a.t - b.t));
    }
    this.clockKeys = data.storyClock
      .map((k) => {
        const [h, m, s] = k.clock.split(':').map(Number);
        return { t: k.t, s: h * 3600 + m * 60 + (s || 0) };
      })
      .sort((a, b) => a.t - b.t);
    for (const id of Object.keys(data.tracks)) this.buildTrack(id);
  }

  // ---------- Positionen ----------
  resolve(ref: PosRef | undefined, fallback?: THREE.Vector3): THREE.Vector3 {
    if (ref === undefined) return fallback ? fallback.clone() : new THREE.Vector3();
    if (Array.isArray(ref)) return new THREE.Vector3(ref[0], ref[1], ref[2]);
    const wp = this.data.waypoints[ref];
    if (wp) return new THREE.Vector3(wp[0], wp[1], wp[2]);
    if (this.tracks.has(ref)) return this.actorPosition(ref, 0);
    console.warn(`[timeline] Unbekannter Wegpunkt "${ref}"`);
    return fallback ? fallback.clone() : new THREE.Vector3();
  }

  private buildTrack(id: string) {
    const keys = [...this.data.tracks[id]].sort((a, b) => a.t - b.t);
    const positions = keys.map((k) => this.resolve(k.at));
    const cumDist = [0];
    for (let i = 1; i < keys.length; i++) {
      cumDist.push(cumDist[i - 1] + positions[i].distanceTo(positions[i - 1]));
    }
    const segHeading: number[] = [];
    const segPose: string[] = [];
    const poseStart: number[] = [];
    let lastHeading = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const next = keys[i + 1];
      const p = positions[i];
      let heading = lastHeading;
      let moving = false;
      let speed = 0;
      if (next) {
        const q = positions[i + 1];
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d = Math.hypot(dx, dz);
        speed = d / Math.max(0.001, next.t - k.t);
        if (d > 0.05) {
          moving = true;
          heading = Math.atan2(dx, dz);
        }
      }
      if (!moving && k.face !== undefined) {
        if (typeof k.face === 'number') heading = (k.face * Math.PI) / 180;
        else {
          const target = this.data.waypoints[k.face]
            ? this.resolve(k.face)
            : this.tracks.has(k.face)
              ? this.actorPosition(k.face, k.t)
              : this.resolve(k.face);
          heading = Math.atan2(target.x - p.x, target.z - p.z);
        }
      }
      // Bewegung mit Blickrichtungs-Angabe: rückwärts/seitwärts gehen
      if (moving && typeof k.face === 'number') heading = (k.face * Math.PI) / 180;
      lastHeading = heading;
      segHeading.push(heading);
      const pose = k.pose ?? (moving ? (speed > 3.2 ? 'run' : 'walk') : i > 0 ? segPose[i - 1] : 'idle');
      segPose.push(pose);
      poseStart.push(i > 0 && segPose[i - 1] === pose ? poseStart[i - 1] : k.t);
    }
    this.tracks.set(id, { keys, positions, cumDist, segHeading, segPose, poseStart });
  }

  private segIndex(keys: { t: number }[], t: number): number {
    // letzter Index mit keys[i].t <= t (binäre Suche)
    let lo = 0;
    let hi = keys.length - 1;
    if (t < keys[0].t) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (keys[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  actorPosition(id: string, t: number): THREE.Vector3 {
    const tr = this.tracks.get(id);
    if (!tr) return new THREE.Vector3();
    const i = Math.max(0, this.segIndex(tr.keys, t));
    const k = tr.keys[i];
    const next = tr.keys[i + 1];
    if (!next || t < k.t) return tr.positions[i].clone();
    const u = easeFn(k.ease ?? 'linear', (t - k.t) / (next.t - k.t));
    return tr.positions[i].clone().lerp(tr.positions[i + 1], u);
  }

  hasActorTrack(id: string) {
    return this.tracks.has(id);
  }

  sampleActor(id: string, t: number): ActorSample | null {
    const tr = this.tracks.get(id);
    if (!tr || tr.keys.length === 0) return null;
    let i = this.segIndex(tr.keys, t);
    const before = i < 0;
    if (before) i = 0;
    const k = tr.keys[i];
    const next = tr.keys[i + 1];
    let u = 0;
    let segLen = 0;
    let speed = 0;
    const pos = tr.positions[i].clone();
    if (next && !before) {
      const lin = clamp((t - k.t) / (next.t - k.t));
      u = easeFn(k.ease ?? 'linear', lin);
      pos.lerp(tr.positions[i + 1], u);
      segLen = tr.positions[i].distanceTo(tr.positions[i + 1]);
      speed = segLen / Math.max(0.001, next.t - k.t);
    }
    const prevHeading = i > 0 ? tr.segHeading[i - 1] : tr.segHeading[i];
    const turnU = before ? 1 : smooth(clamp((t - k.t) / TURN_TIME));
    const heading = angleLerp(prevHeading, tr.segHeading[i], turnU);
    const pose = tr.segPose[i];
    const prevPose = i > 0 ? tr.segPose[i - 1] : pose;
    const poseStart = tr.poseStart[i];
    const blend = pose === prevPose ? 1 : smooth(clamp((t - k.t) / POSE_BLEND));
    const prevStart = i > 0 ? tr.poseStart[i - 1] : poseStart;
    let look: THREE.Vector3 | null = null;
    if (k.look !== undefined) {
      look =
        typeof k.look === 'string' && this.tracks.has(k.look) && !this.data.waypoints[k.look]
          ? this.actorPosition(k.look, t).add(new THREE.Vector3(0, 1.6, 0))
          : this.resolve(k.look);
    }
    return {
      pos,
      heading,
      pose,
      prevPose,
      blend,
      poseTime: Math.max(0, t - poseStart),
      prevPoseTime: Math.max(0, t - prevStart),
      distance: tr.cumDist[i] + segLen * u,
      speed,
      look,
      visible: pose !== 'hidden',
    };
  }

  // ---------- Requisiten ----------
  sampleProp(id: string, t: number): { key: PropKey | null; prev: PropKey | null; flyU: number } {
    const keys = this.propKeys.get(id);
    if (!keys || keys.length === 0) return { key: null, prev: null, flyU: 1 };
    const i = this.segIndex(keys, t);
    if (i < 0) return { key: keys[0], prev: null, flyU: 1 };
    const key = keys[i];
    let flyU = 1;
    if (key.fly) flyU = clamp((t - key.t) / key.fly.dur);
    return { key, prev: i > 0 ? keys[i - 1] : null, flyU };
  }

  // ---------- Ereignisse ----------
  events<T extends TimelineEvent>(type: T['type']): T[] {
    return (this.byType.get(type) ?? []) as T[];
  }

  activeSubtitles(t: number): SubtitleEvent[] {
    return this.events<SubtitleEvent>('subtitle').filter((e) => t >= e.t && t < e.t + e.dur);
  }

  activeSounds(t: number): SoundEvent[] {
    return this.events<SoundEvent>('sound').filter((e) => t >= e.t && t < e.t + e.dur);
  }

  activeFx(t: number): FxEvent[] {
    return this.events<FxEvent>('fx').filter((e) => t >= e.t && t < e.t + (e.dur ?? 3));
  }

  /** Lichtstimmung: [vorher, aktuell, Überblendung 0..1] */
  light(t: number): { from: string; to: string; u: number } {
    const list = this.events<LightEvent>('light');
    if (list.length === 0) return { from: 'street_morning', to: 'street_morning', u: 1 };
    const i = this.segIndex(list, t);
    if (i < 0) return { from: list[0].preset, to: list[0].preset, u: 1 };
    const cur = list[i];
    const prev = i > 0 ? list[i - 1] : cur;
    const u = cur.blend ? smooth(clamp((t - cur.t) / cur.blend)) : 1;
    return { from: prev.preset, to: cur.preset, u };
  }

  door(id: string, t: number): number {
    const list = this.events<DoorEvent>('door').filter((e) => e.id === id);
    let v = 0;
    for (const e of list) {
      if (e.t > t) break;
      const u = smooth(clamp((t - e.t) / (e.dur ?? 0.9)));
      v = v + (e.open - v) * u;
    }
    return v;
  }

  state(key: string, t: number): string | number | boolean | undefined {
    let v = this.data.initialState?.[key];
    for (const e of this.events<StateEvent>('state')) {
      if (e.t > t) break;
      if (e.key === key) v = e.value;
    }
    return v;
  }

  screen(id: string, t: number): ScreenEvent | null {
    let cur: ScreenEvent | null = null;
    for (const e of this.events<ScreenEvent>('screen')) {
      if (e.t > t) break;
      if (e.id === id) cur = e;
    }
    return cur;
  }

  // ---------- Kamera ----------
  shotIndex(t: number): number {
    return Math.max(0, this.segIndex(this.data.shots, t));
  }
  shot(i: number): Shot | undefined {
    return this.data.shots[i];
  }
  shotEnd(i: number): number {
    return this.data.shots[i + 1]?.t ?? this.duration;
  }

  // ---------- Kapitel & Uhr ----------
  chapterIndex(t: number): number {
    return Math.max(0, this.segIndex(this.data.chapters, t));
  }

  storyClock(t: number): string {
    const ks = this.clockKeys;
    if (ks.length === 0) return '';
    let s: number;
    if (t <= ks[0].t) s = ks[0].s;
    else if (t >= ks[ks.length - 1].t) s = ks[ks.length - 1].s + (t - ks[ks.length - 1].t);
    else {
      const i = this.segIndex(ks, t);
      const a = ks[i];
      const b = ks[i + 1];
      s = a.s + ((b.s - a.s) * (t - a.t)) / (b.t - a.t);
    }
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(sec)}`;
  }

  isCamTargetActor(target: CamTarget): target is { actor: string; socket?: string; offset?: Vec3 } {
    return typeof target === 'object' && !Array.isArray(target) && 'actor' in target;
  }
}

export async function loadTimeline(url: string): Promise<Timeline> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Timeline konnte nicht geladen werden: ${url} (${res.status})`);
  const data = (await res.json()) as TimelineData;
  return new Timeline(data);
}
