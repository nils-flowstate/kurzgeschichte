// Datenformat der zentralen Timeline-Datei (public/timeline/story.json).
// Alles, was in der Welt passiert, steht hier – der Player berechnet daraus
// für jeden Zeitpunkt t den kompletten Zustand (Zeit rein -> Zustand raus).

export type Vec3 = [number, number, number];

/** Position: entweder Name eines Wegpunkts oder [x, y, z] in Metern. */
export type PosRef = string | Vec3;

export interface Chapter {
  id: string;
  title: string;
  t: number;
  /** optionale Kurzbeschreibung für die UI */
  summary?: string;
}

export interface ActorDef {
  name: string;
  /** human | dog | car | object (bewegt ein benanntes Set-Objekt, look.target) */
  kind: 'human' | 'dog' | 'car' | 'object';
  /** Platzhalter-Aussehen */
  look?: Record<string, string | number | boolean>;
  /** Pfad zu einem glTF/GLB (relativ zu /public), null = Platzhalter */
  model?: string | null;
  /** Skalierung des Modells */
  modelScale?: number;
  /** Rotation des Modells um Y in Grad (falls es nicht nach +Z schaut) */
  modelYaw?: number;
  /** Zuordnung Pose-Name -> Clip-Name im GLB */
  animations?: Record<string, string>;
  /** Knochen-Namen für Kopf/Hände (Ego-Kamera, Requisiten) */
  bones?: { head?: string; handR?: string; handL?: string };
  /** In Kamera-Auswahl (Ego/Third Person) anbieten */
  selectable?: boolean;
}

/** Ein Schlüsselpunkt einer Figur (oder eines Fahrzeugs). */
export interface ActorKey {
  t: number;
  /** Position zu diesem Zeitpunkt */
  at: PosRef;
  /** Pose/Animation ab diesem Zeitpunkt (z. B. walk, run, idle, read …) */
  pose?: string;
  /** Blickrichtung im Stand: Grad (0 = +Z) oder Ziel (Wegpunkt/Figur-ID) */
  face?: number | string;
  /** Kopf schaut auf … (Wegpunkt, Figur-ID oder [x,y,z]) */
  look?: PosRef;
  /** Bewegung bis zum nächsten Key: linear | ease */
  ease?: 'linear' | 'ease' | 'in' | 'out';
  /** Freitext für dich – wird nicht ausgewertet */
  note?: string;
}

export interface PropKey {
  t: number;
  /** "figur.socket" (socket: handR, handL, head, chest, pocket) oder null */
  attach?: string | null;
  /** Weltposition (wenn nicht angehängt) bzw. Offset (wenn angehängt) */
  at?: PosRef;
  /** Rotation in Grad [x,y,z] */
  rot?: Vec3;
  visible?: boolean;
  /** Flug von `from` nach `at` (Wurf, Fallen) */
  fly?: { from: PosRef; dur: number; arc?: number; spin?: number };
}

export interface PropDef {
  /** Platzhalter-Form */
  shape: 'letter' | 'usb' | 'phone' | 'mug' | 'glass' | 'papers' | 'box' | 'leash';
  color?: string;
  model?: string | null;
  keys: PropKey[];
}

export type SubtitleStyle = 'dialog' | 'thought' | 'letter' | 'narration' | 'sfx';

export interface SubtitleEvent {
  type: 'subtitle';
  t: number;
  dur: number;
  style: SubtitleStyle;
  speaker?: string;
  text: string;
}
export interface LightEvent {
  type: 'light';
  t: number;
  preset: string;
  /** Überblendzeit in Sekunden */
  blend?: number;
}
export interface SoundEvent {
  type: 'sound';
  t: number;
  id: string;
  /** Datei in /public/audio – fehlt sie, wird ein synthetischer Platzhalter erzeugt */
  file?: string;
  /** Platzhalter-Synth: city | office | drone | heartbeat | bark | ding | beep | spill | thud | car | music */
  synth?: string;
  dur: number;
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  /** music | ambience | sfx | voice (für Lautstärke-Gruppen) */
  bus?: 'music' | 'ambience' | 'sfx' | 'voice';
}
export interface DoorEvent {
  type: 'door';
  t: number;
  id: string;
  /** 0 = zu, 1 = offen */
  open: number;
  dur?: number;
}
export interface StateEvent {
  type: 'state';
  t: number;
  key: string;
  value: string | number | boolean;
}
export interface ScreenEvent {
  type: 'screen';
  t: number;
  id: string;
  /** desktop | explorer | mail | morse | phone_search | copy | eject | off */
  view: string;
  query?: string;
  result?: string;
  /** Tippgeschwindigkeit Zeichen/s */
  typing?: number;
}
export interface FxEvent {
  type: 'fx';
  t: number;
  fx: 'papers' | 'spill' | 'letterGlow' | 'flash';
  at?: PosRef;
  dur?: number;
}
export type TimelineEvent =
  | SubtitleEvent
  | LightEvent
  | SoundEvent
  | DoorEvent
  | StateEvent
  | ScreenEvent
  | FxEvent;

/** Zielangabe für Kameras: Wegpunkt, [x,y,z], "figur" oder "figur.socket" */
export type CamTarget = PosRef | { actor: string; socket?: string; offset?: Vec3 };

/**
 * Kamera-Position: Welt, oder relativ zu einer Figur (Offset im lokalen Raum
 * der Figur; mit socket relativ zu Kopf/Brust/Hand, world = Offset in Weltachsen)
 */
export type CamPos = PosRef | { rel: string; offset: Vec3; socket?: string; world?: boolean };

export interface Shot {
  t: number;
  /** Bezeichnung (Totale, Halbnah, Nah, Insert …) */
  name?: string;
  from: CamPos;
  to?: CamPos;
  look: CamTarget;
  lookTo?: CamTarget;
  /** Brennweite in mm (Vollformat) */
  lens: number;
  lensTo?: number;
  /** Fokus-Ziel für Tiefenunschärfe (Standard: look) */
  focus?: CamTarget;
  /** Blende-Faktor für DOF (größer = weniger Schärfe) */
  aperture?: number;
  /** Handkamera-Wackeln 0..1 */
  shake?: number;
  ease?: 'linear' | 'ease' | 'in' | 'out';
  /** Kamera-Rollwinkel in Grad */
  roll?: number;
}

export interface StoryClockKey {
  t: number;
  /** "HH:MM:SS" */
  clock: string;
}

export interface TimelineData {
  meta: {
    title: string;
    author?: string;
    duration: number;
    version?: number;
  };
  assets?: {
    hdri?: { exterior?: string | null; interior?: string | null };
  };
  storyClock: StoryClockKey[];
  chapters: Chapter[];
  waypoints: Record<string, Vec3>;
  actors: Record<string, ActorDef>;
  tracks: Record<string, ActorKey[]>;
  props: Record<string, PropDef>;
  initialState?: Record<string, string | number | boolean>;
  events: TimelineEvent[];
  shots: Shot[];
  /** Hinweise für den Cinema-Regisseur: wichtige Momente für Schnittbilder */
  inserts?: { t: number; dur: number; target: CamTarget; name?: string; lens?: number }[];
}
