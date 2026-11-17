// Prozedurale Posen für die Platzhalter-Figuren.
// Jede Pose ist eine reine Funktion von (Zeit seit Posenbeginn, Schrittphase)
// – damit bleibt alles deterministisch und scrubbar.

export type Joint =
  | 'hipsY'
  | 'hipsP'
  | 'hipsYaw'
  | 'hipsR'
  | 'spineP'
  | 'spineY'
  | 'spineR'
  | 'chestP'
  | 'chestY'
  | 'neckP'
  | 'headP'
  | 'headY'
  | 'headR'
  | 'armLP'
  | 'armLA'
  | 'armLT'
  | 'elbowL'
  | 'wristL'
  | 'armRP'
  | 'armRA'
  | 'armRT'
  | 'elbowR'
  | 'wristR'
  | 'legLP'
  | 'legLA'
  | 'kneeL'
  | 'footL'
  | 'legRP'
  | 'legRA'
  | 'kneeR'
  | 'footR';

export type Pose = Partial<Record<Joint, number>>;
export interface PoseInput {
  /** Sekunden seit Beginn der Pose */
  t: number;
  /** zurückgelegte Strecke in Metern */
  dist: number;
  speed: number;
}
type PoseFn = (i: PoseInput) => Pose;

const S = Math.sin;
const C = Math.cos;
const pos = (v: number) => Math.max(0, v);

const REST: Pose = { armLA: 0.07, armRA: 0.07, elbowL: 0.12, elbowR: 0.12 };

function breath(t: number, amt = 1): Pose {
  return { chestP: 0.012 * amt * S(t * 1.7), headP: 0.01 * amt * S(t * 1.7 + 0.6) };
}

function gait(phase: number, amp: number, knee: number, arm: number, elbow: number, bounce: number): Pose {
  const p = phase;
  return {
    legLP: amp * S(p),
    legRP: -amp * S(p),
    kneeL: 0.1 + knee * pos(C(p)) ** 2,
    kneeR: 0.1 + knee * pos(-C(p)) ** 2,
    footL: 0.15 * S(p) * (amp / 0.45),
    footR: -0.15 * S(p) * (amp / 0.45),
    armLP: -arm * S(p),
    armRP: arm * S(p),
    armLA: 0.08,
    armRA: 0.08,
    elbowL: elbow + 0.15 * pos(-S(p)),
    elbowR: elbow + 0.15 * pos(S(p)),
    hipsY: -bounce + bounce * Math.abs(C(p)),
    hipsYaw: 0.07 * S(p),
    chestY: -0.12 * S(p),
  };
}

const walk: PoseFn = ({ dist }) => ({ ...gait((dist / 1.45) * Math.PI * 2, 0.42, 0.75, 0.32, 0.22, 0.03), spineP: 0.03 });
const walkFast: PoseFn = ({ dist }) => ({ ...gait((dist / 1.7) * Math.PI * 2, 0.5, 0.9, 0.45, 0.35, 0.035), spineP: 0.08 });
const jog: PoseFn = ({ dist }) => ({ ...gait((dist / 2.0) * Math.PI * 2, 0.6, 1.2, 0.55, 1.1, 0.04), spineP: 0.12 });
const run: PoseFn = ({ dist }) => ({
  ...gait((dist / 2.6) * Math.PI * 2, 0.78, 1.6, 0.75, 1.45, 0.06),
  spineP: 0.2,
  headP: -0.12,
});
const sneak: PoseFn = ({ dist }) => {
  const g = gait((dist / 1.0) * Math.PI * 2, 0.3, 0.5, 0.1, 0.9, 0.0);
  return {
    ...g,
    hipsY: -0.3,
    legLP: 0.62 + (g.legLP ?? 0),
    legRP: 0.62 + (g.legRP ?? 0),
    kneeL: 1.05 + (g.kneeL ?? 0) * 0.6,
    kneeR: 1.05 + (g.kneeR ?? 0) * 0.6,
    footL: 0.4,
    footR: 0.4,
    spineP: 0.45,
    chestP: 0.1,
    headP: -0.45,
    armLP: 0.3,
    armRP: 0.3,
  };
};

const idle: PoseFn = ({ t }) => ({ ...REST, ...breath(t), hipsYaw: 0.02 * S(t * 0.3) });

const breathe: PoseFn = ({ t }) => ({
  hipsY: -0.08,
  spineP: 0.55 + 0.03 * S(t * 4.2),
  chestP: 0.15 + 0.05 * S(t * 4.2),
  headP: -0.45,
  legLP: 0.35,
  legRP: 0.32,
  legLA: 0.06,
  legRA: 0.06,
  kneeL: 0.55,
  kneeR: 0.5,
  footL: -0.2,
  footR: -0.18,
  armLP: 0.78,
  armRP: 0.78,
  armLA: 0.12,
  armRA: 0.12,
  elbowL: 0.15,
  elbowR: 0.15,
});

const crouchBase: Pose = {
  hipsY: -0.52,
  legLP: 1.45,
  legRP: 1.42,
  legLA: 0.14,
  legRA: 0.14,
  kneeL: 2.3,
  kneeR: 2.28,
  footL: 0.85,
  footR: 0.86,
  spineP: 0.35,
  chestP: 0.08,
  headP: -0.3,
  armLP: 0.55,
  armRP: 0.55,
  elbowL: 0.7,
  elbowR: 0.7,
  armLA: 0.15,
  armRA: 0.15,
};
const crouch: PoseFn = ({ t }) => ({ ...crouchBase, chestP: 0.08 + 0.03 * S(t * 3.2) });
const crouchWatch: PoseFn = ({ t }) => ({ ...crouch({ t, dist: 0, speed: 0 }), armLP: 1.1, armLA: -0.4, elbowL: 1.9, headP: 0.35, headY: 0.25 });
const crouchReach: PoseFn = ({ t }) => ({ ...crouchBase, armRP: 1.0 + 0.05 * S(t * 2), elbowR: 0.4, armRA: -0.1, headP: 0.1, headY: 0.4, spineY: 0.2 });
const crouchPress: PoseFn = ({ t }) => ({ ...crouchBase, spineP: 0.25, headP: -0.1, headY: 0.6 * S(t * 0.7), armLP: 0.2, armRP: 0.2, chestP: 0.1 + 0.05 * S(t * 4) });

const crawl: PoseFn = ({ dist, t }) => {
  const p = (dist / 0.7) * Math.PI * 2 + t * 0.2;
  return {
    hipsP: 1.45,
    hipsY: -0.8,
    headP: -1.15,
    spineP: 0.05,
    armLP: 2.55 + 0.3 * S(p),
    armRP: 2.55 - 0.3 * S(p),
    armLA: 0.45,
    armRA: 0.45,
    elbowL: 1.4 + 0.4 * S(p),
    elbowR: 1.4 - 0.4 * S(p),
    legLP: 0.15 + 0.25 * pos(S(p)),
    legRP: 0.15 + 0.25 * pos(-S(p)),
    legLA: 0.25,
    legRA: 0.25,
    kneeL: 0.3 + 0.9 * pos(S(p)),
    kneeR: 0.3 + 0.9 * pos(-S(p)),
    footL: -0.6,
    footR: -0.6,
  };
};

const read: PoseFn = ({ t }) => ({
  ...breath(t),
  armLP: 0.72,
  armRP: 0.72,
  armLA: -0.12,
  armRA: -0.12,
  elbowL: 1.25,
  elbowR: 1.25,
  wristL: -0.2,
  wristR: -0.2,
  headP: 0.42,
  neckP: 0.12,
  spineP: 0.05,
});
const holdLetter: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 0.55, armRA: -0.05, elbowR: 1.15, headP: 0.38, headY: -0.05 });
const pickUp: PoseFn = ({ t }) => {
  const u = Math.min(1, t / 0.6);
  const down = u < 1 ? S(u * Math.PI * 0.5) : 1;
  return {
    hipsY: -0.32 * down,
    spineP: 0.75 * down,
    headP: 0.2 * down,
    legLP: 0.85 * down,
    legRP: 0.6 * down,
    kneeL: 1.25 * down,
    kneeR: 1.1 * down,
    footL: 0.4 * down,
    footR: 0.45 * down,
    armRP: 1.0 * down,
    elbowR: 0.2,
    armLP: 0.35 * down,
    elbowL: 0.4,
  };
};
const tieShoe: PoseFn = ({ t }) => ({
  hipsY: -0.46,
  legRP: -0.15,
  kneeR: 1.6,
  footR: -0.6,
  legLP: 1.5,
  kneeL: 1.52,
  footL: 0.05,
  spineP: 0.72,
  chestP: 0.2,
  headP: 0.45,
  armLP: 1.15 + 0.05 * S(t * 7),
  armRP: 1.05 + 0.05 * S(t * 7 + 1),
  elbowL: 0.5,
  elbowR: 0.6,
  armLA: -0.15,
  armRA: -0.05,
});
const lookDown: PoseFn = ({ t }) => ({ ...REST, ...breath(t), headP: 0.65, spineP: 0.12, headY: -0.15 * S(t * 0.8) });
const checkWatch: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armLP: 1.15, armLA: -0.45, armLT: 0.4, elbowL: 1.9, headP: 0.45, headY: 0.22 });
const impatient: PoseFn = ({ t }) => ({
  ...REST,
  ...breath(t),
  headP: -0.25,
  footR: 0.25 * pos(S(t * 9)),
  armLP: 0.1,
  armRP: 0.1,
  hipsYaw: 0.05 * S(t * 0.9),
});
const talk: PoseFn = ({ t }) => ({
  ...REST,
  ...breath(t),
  armRP: 0.45 + 0.18 * S(t * 2.3),
  elbowR: 1.0 + 0.25 * S(t * 3.1),
  armRA: 0.1,
  armLP: 0.2 + 0.08 * S(t * 1.9 + 1),
  elbowL: 0.5,
  headP: 0.04 * S(t * 3.4),
  headY: 0.08 * S(t * 1.1),
});
const sitBase: Pose = {
  hipsY: -0.46,
  legLP: 1.5,
  legRP: 1.5,
  legLA: 0.08,
  legRA: 0.08,
  kneeL: 1.5,
  kneeR: 1.5,
  footL: 0.0,
  footR: 0.0,
  spineP: 0.04,
};
const sit: PoseFn = ({ t }) => ({ ...sitBase, ...breath(t), armLP: 0.6, armRP: 0.6, elbowL: 0.9, elbowR: 0.9 });
const sitType: PoseFn = ({ t }) => ({
  ...sitBase,
  ...breath(t),
  spineP: 0.18,
  armLP: 0.85,
  armRP: 0.85,
  armLA: -0.08,
  armRA: -0.08,
  elbowL: 0.95,
  elbowR: 0.95,
  wristL: 0.08 * S(t * 15),
  wristR: 0.08 * S(t * 13 + 1),
  headP: 0.16,
});
const sitHair: PoseFn = ({ t }) => ({
  ...sitBase,
  spineP: 0.35,
  armLP: 2.4,
  armRP: 2.4,
  armLA: 0.55,
  armRA: 0.55,
  elbowL: 2.2 + 0.1 * S(t * 5),
  elbowR: 2.2 + 0.1 * S(t * 5 + 1),
  headP: 0.5,
});
const sitPhone: PoseFn = ({ t }) => ({ ...sitBase, ...breath(t), spineP: 0.15, armRP: 0.95, armRA: -0.15, elbowR: 1.45, armLP: 0.7, elbowL: 1.0, headP: 0.48, wristR: 0.06 * S(t * 6) });
const sitPhoto: PoseFn = ({ t }) => ({ ...sitBase, ...breath(t), armRP: 1.25, armLP: 1.2, armRA: -0.2, armLA: -0.2, elbowR: 0.55, elbowL: 0.55, headP: 0.2 });
const phone: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 0.35, armRA: 0.5, armRT: 0.3, elbowR: 2.45, headR: 0.06, headY: 0.1 * S(t * 0.5), armLP: 0.08 + 0.12 * S(t * 1.3), elbowL: 0.25 + 0.2 * S(t * 1.3) });
const phoneWalk: PoseFn = (i) => ({ ...walk(i), armRP: 0.35, armRA: 0.5, armRT: 0.3, elbowR: 2.45, headR: 0.05 });
const phoneShoulder: PoseFn = ({ t }) => ({ ...REST, ...breath(t), headR: -0.42, headP: 0.1, armRP: 0.25, armRA: 0.35, elbowR: 2.0, armLP: 0.55, elbowL: 1.45 });
const phoneShoulderWalk: PoseFn = (i) => ({ ...walk(i), headR: -0.42, armRP: 0.25, armRA: 0.35, elbowR: 2.0, armLP: 0.55, elbowL: 1.45 });
const startled: PoseFn = ({ t }) => {
  const k = Math.exp(-t * 2.5);
  return {
    spineP: -0.12,
    headP: -0.2 * k + 0.2,
    armLP: 0.55,
    armLA: 0.45,
    elbowL: 0.7,
    armRP: 0.5,
    armRA: 0.45,
    elbowR: 1.4,
    hipsY: -0.04,
    kneeL: 0.2,
    kneeR: 0.2,
    chestP: 0.05 * S(t * 10) * k,
  };
};
const angry: PoseFn = ({ t }) => ({
  ...REST,
  armRP: 0.7 + 0.25 * S(t * 4),
  armRA: 0.25,
  elbowR: 1.2,
  armLP: 0.55,
  elbowL: 1.45,
  headY: 0.25 * S(t * 5),
  spineP: 0.1,
});
const dab: PoseFn = ({ t }) => ({
  spineP: 0.3,
  headP: 0.65,
  armRP: 0.75 + 0.12 * S(t * 7),
  armRA: -0.2,
  elbowR: 1.75,
  armLP: 0.6,
  armLA: 0.25,
  elbowL: 1.3,
  ...breath(t),
});
const reach: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 1.3, armRA: 0.1, elbowR: 0.25, headP: 0.1, spineP: 0.08 });
const reachHigh: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 1.6, armRA: 0.15, elbowR: 0.35, headP: -0.15, spineY: 0.1 });
const elbow: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armLP: 0.55, armLA: 0.35, elbowL: 2.1, spineY: 0.25, headY: -0.4, headP: 0.1 });
const carry: PoseFn = (i) => ({ ...walk(i), armRP: 0.35, elbowR: 1.35, armRA: 0.05 });
const carryIdle: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 0.35, elbowR: 1.35 });
const carryPapers: PoseFn = (i) => ({ ...walk(i), armLP: 0.7, armRP: 0.7, elbowL: 1.35, elbowR: 1.35, armLA: -0.15, armRA: -0.15 });
const fill: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armLP: 0.8, armRP: 0.85, armLA: -0.15, armRA: -0.1, elbowL: 0.9, elbowR: 0.95, headP: 0.5, spineP: 0.12 });
const drink: PoseFn = ({ t }) => {
  const u = Math.min(1, t / 0.5);
  return { ...REST, armRP: 0.45 + 0.35 * u, armRA: 0.15, elbowR: 1.4 + 0.9 * u, headP: -0.3 * u, armLP: 0.1, spineP: -0.05 * u };
};
const press: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 1.05, armRA: 0.15, elbowR: 0.35 + 0.15 * pos(S(t * 6)), headP: 0.2 });
const lookAround: PoseFn = ({ t }) => ({ ...REST, ...breath(t), headY: 1.0 * S(t * 1.4), chestY: 0.25 * S(t * 1.4), armLP: 0.25, elbowL: 0.6 });
const leashWalk: PoseFn = (i) => ({ ...walk(i), armLP: 0.45, armLA: 0.1, elbowL: 0.55 });
const leashIdle: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armLP: 0.4, elbowL: 0.6 });
const leashRun: PoseFn = (i) => ({ ...run(i), armLP: 1.2, elbowL: 0.2, armLA: -0.1 });
const leashPull: PoseFn = ({ t }) => ({ ...REST, spineP: -0.18, armLP: 0.9, elbowL: 0.15, hipsY: -0.08, kneeL: 0.35, kneeR: 0.3, legLP: 0.25, legRP: -0.15, headP: 0.15, armRP: 0.7 + 0.1 * S(t * 3), elbowR: 0.5 });
const wave: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 0.3, armRA: 1.25, elbowR: 1.1 + 0.3 * S(t * 7), armRT: -0.4 });
const walkWave: PoseFn = (i) => ({ ...walk(i), armRP: 0.3, armRA: 1.2, elbowR: 1.1 + 0.3 * S(i.t * 7) });
const handOut: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 1.15, armRA: 0.05, elbowR: 0.25, armRT: 0.5 });
const give: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: 1.0, armRA: 0.0, elbowR: 0.45, headP: 0.12 });
const searchPocket: PoseFn = ({ t }) => ({ ...REST, ...breath(t), armRP: -0.1, armRA: 0.18, elbowR: 0.7 + 0.15 * S(t * 6), headP: 0.5, spineP: 0.1, headY: -0.2 });
const hide: PoseFn = ({ t }) => ({ ...REST, chestP: -0.04 + 0.03 * S(t * 3.6), armLA: 0.02, armRA: 0.02, headY: 0.7, headP: -0.05, elbowL: 0.05, elbowR: 0.05 });
const holdBreath: PoseFn = () => ({ ...REST, chestP: 0.04, armLA: 0.02, armRA: 0.02, headY: 0.55, headP: 0.0 });
const shrug: PoseFn = ({ t }) => ({ ...REST, armLA: 0.25, armRA: 0.25, elbowL: 1.3, elbowR: 1.3, armLP: 0.25, armRP: 0.25, armLT: 0.6, armRT: 0.6, headR: 0.1 * S(t * 2) });
const sitIdle: PoseFn = ({ t }) => ({ ...sitBase, ...breath(t), armLP: 0.85, armRP: 0.85, elbowL: 0.9, elbowR: 0.9, headP: 0.12 });
const sitTalk: PoseFn = ({ t }) => ({ ...sitIdle({ t, dist: 0, speed: 0 }), headY: -0.7 + 0.08 * S(t * 1.3), armRP: 0.9 + 0.15 * S(t * 2.4), elbowR: 1.2, headP: -0.05 });
const pickPapers: PoseFn = ({ t }) => ({ ...crouchBase, spineP: 0.6, headP: 0.4, armRP: 1.0 + 0.3 * S(t * 2.5), elbowR: 0.4, armLP: 0.6, elbowL: 1.2 });
const carryBucket: PoseFn = (i) => ({ ...walk(i), armRP: 0.05, elbowR: 0.1, armRA: 0.12, armLP: 0.6, elbowL: 1.3 });
const standStill: PoseFn = ({ t }) => ({ ...REST, ...breath(t, 0.5) });
const hidden: PoseFn = () => ({});

// --- Hund ---
const dogIdle: PoseFn = ({ t }) => ({ tail: 0.6 * S(t * 6), headP: 0.05 * S(t * 0.9) }) as Pose;
const dogWalk: PoseFn = ({ dist, t }) => ({ phase: (dist / 1.1) * Math.PI * 2, amp: 0.35, tail: 0.4 * S(t * 5), gallop: 0 }) as Pose;
const dogRun: PoseFn = ({ dist, t }) => ({ phase: (dist / 2.4) * Math.PI * 2, amp: 0.8, tail: 0.2 * S(t * 9), gallop: 1 }) as Pose;
const dogSit: PoseFn = ({ t }) => ({ sit: 1, tail: 0.3 * S(t * 3) }) as Pose;
const dogPull: PoseFn = ({ t }) => ({ pull: 1, phase: t * 9, amp: 0.15, tail: 0.1 }) as Pose;

export const POSES: Record<string, PoseFn> = {
  idle,
  stand: standStill,
  walk,
  walk_fast: walkFast,
  jog,
  run,
  sneak,
  crouch_walk: sneak,
  breathe,
  crouch,
  crouch_watch: crouchWatch,
  crouch_reach: crouchReach,
  crouch_press: crouchPress,
  crawl,
  read,
  hold_letter: holdLetter,
  pick_up: pickUp,
  tie_shoe: tieShoe,
  look_down: lookDown,
  check_watch: checkWatch,
  impatient,
  talk,
  sit,
  sit_idle: sitIdle,
  sit_talk: sitTalk,
  sit_type: sitType,
  sit_hair: sitHair,
  sit_phone: sitPhone,
  sit_photo: sitPhoto,
  phone,
  phone_walk: phoneWalk,
  phone_shoulder: phoneShoulder,
  phone_shoulder_walk: phoneShoulderWalk,
  startled,
  angry,
  dab,
  reach,
  reach_high: reachHigh,
  elbow,
  carry,
  carry_idle: carryIdle,
  carry_papers: carryPapers,
  carry_bucket: carryBucket,
  fill,
  drink,
  press,
  look_around: lookAround,
  leash_walk: leashWalk,
  leash_idle: leashIdle,
  leash_run: leashRun,
  leash_pull: leashPull,
  wave,
  walk_wave: walkWave,
  hand_out: handOut,
  give,
  search_pocket: searchPocket,
  hide,
  hold_breath: holdBreath,
  shrug,
  pick_papers: pickPapers,
  hidden,
  dog_idle: dogIdle,
  dog_walk: dogWalk,
  dog_run: dogRun,
  dog_sit: dogSit,
  dog_pull: dogPull,
};

/** Bewegungs-Posen, deren Schrittzyklus an der Strecke hängt */
export const LOCOMOTION = new Set([
  'walk',
  'walk_fast',
  'jog',
  'run',
  'sneak',
  'crouch_walk',
  'crawl',
  'phone_walk',
  'phone_shoulder_walk',
  'carry',
  'carry_papers',
  'carry_bucket',
  'leash_walk',
  'leash_run',
  'walk_wave',
  'dog_walk',
  'dog_run',
]);

export function evalPose(name: string, input: PoseInput): Pose {
  const fn = POSES[name] ?? POSES.idle;
  return fn(input);
}

export function blendPose(a: Pose, b: Pose, u: number): Pose {
  if (u >= 1) return b;
  if (u <= 0) return a;
  const out: Record<string, number> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = (a as Record<string, number>)[k] ?? 0;
    const vb = (b as Record<string, number>)[k] ?? 0;
    out[k] = va + (vb - va) * u;
  }
  return out as Pose;
}
