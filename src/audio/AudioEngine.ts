import type { SoundEvent } from '../timeline/types';
import type { Timeline } from '../timeline/Timeline';

/**
 * Ton zur Timeline: Jeder Sound-Eintrag läuft genau dann, wenn t in seinem
 * Zeitfenster liegt (inkl. richtigem Offset beim Scrubben). Fehlt die Datei in
 * /public/audio, wird ein synthetischer Platzhalter erzeugt.
 */
interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  startCtx: number;
  startOffset: number;
  rate: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses: Record<string, GainNode> = {};
  private buffers = new Map<string, AudioBuffer | 'loading' | 'failed'>();
  private voices = new Map<SoundEvent, Voice>();
  muted = false;
  volume = 0.8;

  constructor(private tl: Timeline) {}

  /** Muss nach einer Nutzer-Interaktion aufgerufen werden (Autoplay-Regeln). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    for (const b of ['music', 'ambience', 'sfx', 'voice']) {
      const g = this.ctx.createGain();
      g.gain.value = b === 'music' ? 0.55 : b === 'ambience' ? 0.7 : 1;
      g.connect(this.master);
      this.buses[b] = g;
    }
    // Puffer vorbereiten
    for (const e of this.tl.events<SoundEvent>('sound')) void this.buffer(e);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  private key(e: SoundEvent) {
    return e.file ? `file:${e.file}` : `synth:${e.synth ?? e.id}:${Math.min(e.dur, 30)}`;
  }

  private async buffer(e: SoundEvent): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const k = this.key(e);
    const have = this.buffers.get(k);
    if (have instanceof AudioBuffer) return have;
    if (have === 'loading') return null;
    this.buffers.set(k, 'loading');
    if (e.file) {
      try {
        const res = await fetch(`audio/${e.file}`);
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('text/html')) throw new Error(`HTTP ${res.status}`);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(k, buf);
        return buf;
      } catch {
        // Fallback auf Synth
      }
    }
    const buf = synth(this.ctx, e.synth ?? 'beep', Math.min(e.dur, 30));
    this.buffers.set(k, buf);
    return buf;
  }

  /** Pro Frame aufrufen. */
  sync(t: number, playing: boolean, rate: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const active = new Set(playing ? this.tl.activeSounds(t) : []);
    for (const [e, v] of this.voices) {
      if (!active.has(e)) {
        this.stop(e, v);
        continue;
      }
      const expected = v.startOffset + (now - v.startCtx) * v.rate;
      const want = t - e.t;
      const buf = v.src.buffer!;
      const drift = e.loop ? Math.abs(((expected - want) % buf.duration + buf.duration * 1.5) % buf.duration - buf.duration / 2) : Math.abs(expected - want);
      if (drift > 0.3 || Math.abs(v.rate - rate) > 0.01) this.stop(e, v);
      else v.gain.gain.setTargetAtTime(this.gainFor(e, t), now, 0.05);
    }
    for (const e of active) {
      if (this.voices.has(e)) continue;
      const k = this.key(e);
      const buf = this.buffers.get(k);
      if (!(buf instanceof AudioBuffer)) {
        if (buf === undefined) void this.buffer(e);
        continue;
      }
      let off = t - e.t;
      if (e.loop) off = off % buf.duration;
      else if (off >= buf.duration) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = !!e.loop;
      src.playbackRate.value = rate;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(this.gainFor(e, t), now, 0.03);
      src.connect(gain).connect(this.buses[e.bus ?? 'sfx'] ?? this.master);
      src.start(now, Math.max(0, off));
      this.voices.set(e, { src, gain, startCtx: now, startOffset: t - e.t, rate });
    }
  }

  private gainFor(e: SoundEvent, t: number) {
    const v = e.volume ?? 1;
    const local = t - e.t;
    let f = 1;
    if (e.fadeIn) f = Math.min(f, local / e.fadeIn);
    if (e.fadeOut) f = Math.min(f, (e.dur - local) / e.fadeOut);
    return Math.max(0, Math.min(1, f)) * v;
  }

  private stop(e: SoundEvent, v: Voice) {
    try {
      v.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.02);
      v.src.stop(this.ctx!.currentTime + 0.08);
    } catch {
      /* schon gestoppt */
    }
    this.voices.delete(e);
  }

  stopAll() {
    for (const [e, v] of this.voices) this.stop(e, v);
  }
}

// ------------------------------------------------------------------
// Synthetische Platzhalter-Sounds (deterministisch)
function synth(ctx: BaseAudioContext, kind: string, dur: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const loopLen: Record<string, number> = { city: 12, office: 10, drone: 16, music: 24, heartbeat: 1.7, typing: 4, tension: 16, glitch: 6, elevator: 8 };
  const len = Math.max(0.2, Math.min(dur, loopLen[kind] ?? dur));
  const n = Math.floor(len * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let b0 = 0;
  let b1 = 0;
  const brown = () => {
    b0 = (b0 + 0.02 * rnd()) / 1.02;
    return b0 * 3.5;
  };
  const lp = (x: number, a: number) => (b1 = b1 + a * (x - b1));
  const loopFade = (i: number) => Math.min(1, i / (sr * 0.05), (n - i) / (sr * 0.05));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let l = 0;
    let r = 0;
    switch (kind) {
      case 'city': {
        const base = brown() * 0.5;
        const pass = Math.exp(-(((t % 6) - 3) ** 2) * 1.2) * 0.5;
        l = base + lp(rnd(), 0.05) * pass;
        r = base * 0.95 + lp(rnd(), 0.05) * pass * 0.8;
        break;
      }
      case 'office': {
        const hum = Math.sin(2 * Math.PI * 50 * t) * 0.01 + Math.sin(2 * Math.PI * 100 * t) * 0.006;
        const air = brown() * 0.18;
        const murmur = lp(rnd(), 0.02) * (0.3 + 0.3 * Math.sin(t * 1.3) * Math.sin(t * 0.7));
        l = hum + air + murmur * 0.3;
        r = hum + air * 0.9 + murmur * 0.25;
        break;
      }
      case 'elevator': {
        const hum = Math.sin(2 * Math.PI * 90 * t) * 0.04 + brown() * 0.25;
        l = r = hum;
        break;
      }
      case 'drone':
      case 'tension': {
        const sw = 0.5 + 0.5 * Math.sin((t / len) * Math.PI * 2);
        const s = Math.sin(2 * Math.PI * 55 * t) * 0.18 + Math.sin(2 * Math.PI * 58.3 * t) * 0.14 + Math.sin(2 * Math.PI * 110.5 * t) * 0.05 * sw;
        const pulse = kind === 'tension' ? Math.max(0, Math.sin(2 * Math.PI * 1.6 * t)) ** 8 * 0.25 * Math.sin(2 * Math.PI * 70 * t) : 0;
        l = s + brown() * 0.1 * sw + pulse;
        r = s * 0.95 + brown() * 0.1 * sw + pulse;
        break;
      }
      case 'music': {
        const notes = [220, 261.63, 329.63, 392, 493.88];
        const ch = Math.floor((t / len) * 4) % 2;
        let s = 0;
        notes.forEach((f, k) => {
          const ff = ch ? f * 0.89 : f;
          s += Math.sin(2 * Math.PI * ff * t + k) * (0.05 + 0.03 * Math.sin(t * 0.4 + k));
          s += Math.sin(2 * Math.PI * ff * 2.001 * t) * 0.01;
        });
        const env = Math.min(1, ((t / len) * 4) % 1 * 4, (1 - (((t / len) * 4) % 1)) * 4);
        l = s * (0.6 + 0.4 * env);
        r = s * (0.6 + 0.4 * env) * 0.97;
        break;
      }
      case 'heartbeat': {
        const beat = (tt: number) => (tt > 0 ? Math.exp(-tt * 18) * Math.sin(2 * Math.PI * 55 * tt) : 0);
        l = r = (beat(t) + beat(t - 0.28) * 0.7) * 0.9;
        break;
      }
      case 'bark': {
        const bark = (t0: number) => {
          const tt = t - t0;
          if (tt < 0 || tt > 0.25) return 0;
          const f = 520 - tt * 900;
          return Math.sin(2 * Math.PI * f * tt) * Math.sin(Math.PI * (tt / 0.25)) * (0.6 + 0.4 * rnd() * 0.3);
        };
        l = r = (bark(0) + bark(0.35) + bark(0.8)) * 0.6;
        break;
      }
      case 'ding': {
        const e1 = Math.exp(-t * 2.2);
        const e2 = t > 0.45 ? Math.exp(-(t - 0.45) * 2.2) : 0;
        l = r = Math.sin(2 * Math.PI * 1318 * t) * e1 * 0.25 + Math.sin(2 * Math.PI * 1046 * t) * e2 * 0.25;
        break;
      }
      case 'beep':
        l = r = t < 0.12 ? Math.sin(2 * Math.PI * 1200 * t) * 0.2 : 0;
        break;
      case 'spill': {
        const e = Math.exp(-t * 5);
        l = r = lp(rnd(), 0.25) * e * 0.9 + (t < 0.05 ? rnd() * 0.3 : 0);
        break;
      }
      case 'thud':
        l = r = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 14) * 0.9 + lp(rnd(), 0.3) * Math.exp(-t * 30) * 0.6;
        break;
      case 'papers': {
        const e = Math.exp(-t * 1.6);
        l = lp(rnd(), 0.6) * e * 0.5 * (0.5 + 0.5 * Math.sin(t * 60));
        r = l * 0.9;
        break;
      }
      case 'car': {
        const c = len / 2;
        const env = Math.exp(-((t - c) ** 2) * 0.8);
        l = lp(brown() + rnd() * 0.3, 0.08) * env * 1.4 * (t < c ? 0.7 : 1);
        r = l * (t < c ? 1 : 0.7);
        break;
      }
      case 'horn': {
        const on = t < 0.25 || (t > 0.4 && t < 0.9) ? 1 : 0;
        l = r = (Math.sign(Math.sin(2 * Math.PI * 410 * t)) * 0.08 + Math.sign(Math.sin(2 * Math.PI * 515 * t)) * 0.08) * on;
        break;
      }
      case 'typing': {
        const k = Math.floor(t * 9);
        const kt = t * 9 - k;
        seed = 999 + k;
        const on = rnd() > -0.4;
        l = r = on && kt < 0.06 ? rnd() * 0.3 * Math.exp(-kt * 60) : 0;
        break;
      }
      case 'door':
        l = r = (t < 0.04 ? rnd() * 0.4 : 0) + lp(rnd(), 0.05) * Math.exp(-t * 4) * 0.4;
        break;
      case 'click':
        l = r = t < 0.02 ? rnd() * 0.5 : 0;
        break;
      case 'glitch': {
        const k = Math.floor(t * 14);
        seed = 4242 + k;
        const f = 1500 + rnd() * 1500;
        const on = rnd() > 0.2;
        const kt = t * 14 - k;
        l = on ? Math.sin(2 * Math.PI * f * t) * Math.exp(-kt * 10) * 0.06 : 0;
        r = on ? Math.sin(2 * Math.PI * f * 1.01 * t) * Math.exp(-kt * 10) * 0.06 : 0;
        break;
      }
      case 'whoosh': {
        const env = Math.sin(Math.PI * Math.min(1, t / len));
        l = r = lp(rnd(), 0.15) * env * 0.6;
        break;
      }
      default:
        l = r = 0;
    }
    const f = loopFade(i);
    L[i] = l * f;
    R[i] = r * f;
  }
  return buf;
}
