import './ui/styles.css';
import * as THREE from 'three';
import { loadTimeline, type Timeline } from './timeline/Timeline';
import { World } from './scenes/World';
import { CameraRig, type CameraId } from './cameras/CameraRig';
import { PostFX } from './engine/PostFX';
import { QUALITY, type QualityLevel } from './engine/Quality';
import { setMaxAnisotropy } from './scenes/materials';
import { AudioEngine } from './audio/AudioEngine';
import { PlayerBar } from './ui/PlayerBar';
import { Hud, Subtitles } from './ui/Hud';

const params = new URLSearchParams(location.search);

class StoryPlayer {
  t = 0;
  playing = false;
  speed = 1;
  cinema = false;
  private wasPlayingBeforeScrub = false;
  private modeBeforeCinema: CameraId = 'film';
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private rig: CameraRig;
  private post: PostFX;
  private audio: AudioEngine;
  private bar: PlayerBar;
  private hud: Hud;
  private subs: Subtitles;
  private quality: QualityLevel;
  private lastFrame = performance.now();
  private frames = 0;
  private fpsTime = 0;
  private cpuMs = 0;
  private letterbox = 0;
  private cinemaAmt = 0;
  private flags = { cones: false, labels: false, subs: true, mute: false };
  private followIds: string[];
  private followIdx = 0;
  private cineEls: HTMLElement[] = [];
  private focus = new THREE.Vector3();
  frameCount = 0;

  constructor(
    private tl: Timeline,
    canvas: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.quality = (params.get('quality') as QualityLevel) || (localStorage.getItem('quality') as QualityLevel) || 'high';
    if (!QUALITY[this.quality]) this.quality = 'high';

    this.world = new World(tl, this.renderer);
    this.rig = new CameraRig(this.world);
    this.post = new PostFX(this.renderer, this.world.scene, this.rig.camera, QUALITY[this.quality]);
    this.audio = new AudioEngine(tl);
    this.applyQuality(this.quality, true);

    this.followIds = Object.entries(tl.data.actors)
      .filter(([, d]) => d.selectable !== false && d.kind !== 'object')
      .map(([id]) => id);
    const selectable = this.followIds.map((id) => ({ id, name: tl.data.actors[id].name }));

    this.hud = new Hud(
      tl,
      {
        setCamera: (id) => this.setCamera(id),
        setActor: (id) => this.setActor(id),
        setQuality: (q) => this.applyQuality(q),
        toggle: (k) => this.toggle(k),
        cinema: () => this.setCinema(!this.cinema),
      },
      selectable,
    );
    this.bar = new PlayerBar(tl, {
      togglePlay: () => this.togglePlay(),
      seek: (t) => this.seek(t),
      setSpeed: (v) => (this.speed = v),
      scrubbing: (on) => {
        if (on) {
          this.wasPlayingBeforeScrub = this.playing;
          this.playing = false;
        } else if (this.wasPlayingBeforeScrub) this.playing = true;
      },
    });
    this.subs = new Subtitles(tl, (id) => tl.data.actors[id]?.name ?? id);
    this.hud.root.appendChild(this.bar.el);
    document.body.appendChild(this.hud.root);
    document.body.appendChild(this.subs.el);
    const cineClock = document.createElement('div');
    cineClock.className = 'cine-clock';
    const cineTitle = document.createElement('div');
    cineTitle.className = 'cine-title';
    const cineHint = document.createElement('div');
    cineHint.className = 'cine-hint';
    cineHint.textContent = 'Cinema-Modus · Esc zum Beenden';
    document.body.append(cineClock, cineTitle, cineHint);
    this.cineEls = [cineClock, cineTitle, cineHint];

    this.rig.onModeChange = (id) => this.hud.setCamera(id === 'director' ? 'film' : id);
    this.rig.attachInput(canvas);
    this.hud.setCamera('film');
    this.hud.setQuality(this.quality);
    this.bindKeys();
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // URL-Parameter (praktisch für Tests/Screenshots)
    if (params.has('t')) this.t = Number(params.get('t'));
    const cam = params.get('cam') as CameraId | null;
    if (params.get('actor')) this.setActor(params.get('actor')!);
    if (cam) this.rig.setMode(cam, true);
    if (params.get('cinema') === '1') this.setCinema(true, true);
    if (params.get('ui') === '0') document.body.classList.add('cinema');
    if (params.get('cones') === '1') this.toggle('cones');
    this.world.evaluate(this.t);
    this.rig.update(this.t, 0);
    this.rig.update(this.t, 1);
  }

  async loadAssets(msg: (s: string) => void) {
    await this.world.loadAssets(msg);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- Steuerung
  togglePlay() {
    this.audio.unlock();
    if (!this.playing && this.t >= this.tl.duration - 0.05) this.t = 0;
    this.playing = !this.playing;
  }
  play() {
    this.audio.unlock();
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  seek(t: number) {
    this.t = Math.max(0, Math.min(this.tl.duration, t));
  }
  setCamera(id: CameraId) {
    if (this.cinema) this.setCinema(false);
    this.rig.setMode(id);
    const labels: Record<string, string> = { film: 'Filmkamera', ego: 'Ego-Perspektive', third: 'Third Person', free: 'Freie Kamera – ins Bild klicken, dann WASD + Maus' };
    this.hud.toast(labels[id] ?? id);
  }
  setActor(id: string) {
    this.followIdx = Math.max(0, this.followIds.indexOf(id));
    this.rig.setFollowActor(id);
    this.hud?.setActor(id);
  }
  setCinema(on: boolean, instant = false) {
    if (on === this.cinema) return;
    this.cinema = on;
    document.body.classList.toggle('cinema', on);
    if (on) {
      this.modeBeforeCinema = this.rig.active.id === 'director' ? 'film' : (this.rig.active.id as CameraId);
      this.rig.setMode('director', instant);
      this.audio.unlock();
      if (!this.playing && !instant) this.playing = true;
      this.cineEls[2].classList.add('show');
      setTimeout(() => this.cineEls[2].classList.remove('show'), 2200);
      if (instant) {
        this.letterbox = 1;
        this.cinemaAmt = 1;
      }
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      this.rig.setMode(this.modeBeforeCinema);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  }
  toggle(k: 'cones' | 'labels' | 'subs' | 'mute') {
    this.flags[k] = !this.flags[k];
    const on = this.flags[k];
    if (k === 'cones') this.world.showCones = on;
    if (k === 'labels') this.world.showLabels(on);
    if (k === 'subs') document.body.classList.toggle('no-subs', !on);
    if (k === 'mute') this.audio.setMuted(on);
    this.hud.setToggle(k, k === 'mute' ? on : on, k === 'mute' ? (on ? '🔇' : '🔊') : undefined);
    const names = { cones: 'Kamera-Sichtkegel', labels: 'Namen', subs: 'Untertitel', mute: 'Ton' };
    this.hud.toast(`${names[k]} ${k === 'mute' ? (on ? 'aus' : 'an') : on ? 'an' : 'aus'}`);
  }
  applyQuality(q: QualityLevel, initial = false) {
    this.quality = q;
    const s = QUALITY[q];
    try {
      localStorage.setItem('quality', q);
    } catch {
      /* egal */
    }
    this.renderer.setPixelRatio(s.pixelRatio);
    this.world.lighting.setShadowMapSize(s.shadowMap);
    this.world.lighting.setShadowSoftness(s.softShadows ? 3.5 : 1);
    this.post.rebuild(s);
    this.resize();
    if (!initial) this.hud.toast(`Qualität: ${s.label}`);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(w * pr, h * pr);
    this.rig.resize(w / h);
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      const freeActive = this.rig.active.id === 'free';
      switch (e.code) {
        case 'Space':
          this.togglePlay();
          e.preventDefault();
          break;
        case 'ArrowLeft':
          this.bar.update(this.t, this.playing);
          if (e.shiftKey) this.bar.jumpChapter(-1);
          else this.seek(this.t - 5);
          e.preventDefault();
          break;
        case 'ArrowRight':
          this.bar.update(this.t, this.playing);
          if (e.shiftKey) this.bar.jumpChapter(1);
          else this.seek(this.t + 5);
          e.preventDefault();
          break;
        case 'Comma':
          this.playing = false;
          this.seek(this.t - 1 / 24);
          break;
        case 'Period':
          this.playing = false;
          this.seek(this.t + 1 / 24);
          break;
        case 'Equal':
        case 'BracketRight':
        case 'NumpadAdd':
          this.stepSpeed(1);
          break;
        case 'Minus':
        case 'Slash':
        case 'NumpadSubtract':
          this.stepSpeed(-1);
          break;
        case 'Digit1':
          this.setCamera('film');
          break;
        case 'Digit2':
          this.setCamera('ego');
          break;
        case 'Digit3':
          this.setCamera('third');
          break;
        case 'Digit4':
          this.setCamera('free');
          break;
        case 'Tab':
          this.followIdx = (this.followIdx + (e.shiftKey ? -1 : 1) + this.followIds.length) % this.followIds.length;
          this.setActor(this.followIds[this.followIdx]);
          this.hud.toast(`Figur: ${this.tl.data.actors[this.followIds[this.followIdx]].name}`);
          e.preventDefault();
          break;
        case 'KeyC':
          this.setCinema(!this.cinema);
          break;
        case 'Escape':
          if (this.cinema) this.setCinema(false);
          this.hud.toggleHelp(false);
          break;
        case 'KeyK':
          this.toggle('cones');
          break;
        case 'KeyN':
          this.toggle('labels');
          break;
        case 'KeyU':
          this.toggle('subs');
          break;
        case 'KeyM':
          this.toggle('mute');
          break;
        case 'KeyH':
          this.hud.toggleHelp();
          break;
        case 'KeyF':
          if (!freeActive) {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen?.();
          }
          break;
      }
    });
  }

  private stepSpeed(dir: number) {
    const steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
    const i = Math.max(0, Math.min(steps.length - 1, steps.indexOf(this.speed) + dir));
    this.speed = steps[i] ?? 1;
    this.bar.setSpeed(this.speed);
    this.hud.toast(`Tempo ${this.speed}×`);
  }

  // ---------------------------------------------------------------- Frame
  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const cpu0 = performance.now();
    if (this.playing) {
      this.t += dt * this.speed;
      if (this.t >= this.tl.duration) {
        this.t = this.tl.duration;
        this.playing = false;
        if (this.cinema) setTimeout(() => this.setCinema(false), 1500);
      }
    }
    this.renderFrame(dt);
    this.audio.sync(this.t, this.playing, this.speed);
    this.bar.update(this.t, this.playing);
    const shotName = this.rig.active.id === 'film' ? this.rig.film.currentShotName(this.t) : this.rig.active.id === 'director' ? this.rig.director.currentShotName(this.t) : '';
    this.hud.update(this.t, shotName);
    this.subs.update(this.t);
    if (this.cinema) {
      this.cineEls[0].textContent = this.tl.storyClock(this.t);
      const ch = this.tl.data.chapters[this.tl.chapterIndex(this.t)];
      this.cineEls[1].textContent = ch?.title ?? '';
    }
    this.cpuMs = this.cpuMs * 0.9 + (performance.now() - cpu0) * 0.1;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime > 0.5) {
      this.hud.setFps(this.frames / this.fpsTime, this.cpuMs);
      this.frames = 0;
      this.fpsTime = 0;
    }
  }

  renderFrame(dt: number) {
    this.world.evaluate(this.t);
    this.rig.update(this.t, dt);
    this.rig.focusPoint(this.focus);
    this.world.lighting.setFocus(this.focus);
    // Cinema-Überblendung
    const target = this.cinema ? 1 : 0;
    this.letterbox += (target - this.letterbox) * Math.min(1, dt * 3);
    this.cinemaAmt += (target - this.cinemaAmt) * Math.min(1, dt * 2);
    this.post.letterbox = this.letterbox;
    this.post.cinema = this.cinemaAmt;
    // Ab-/Aufblende am Anfang und Ende
    const D = this.tl.duration;
    this.post.fade = Math.max(0, 1 - this.t / 1.2, (this.t - (D - 2.5)) / 2.5);
    this.post.update(this.world.lighting.current, performance.now() / 1000, this.rig.pose.focus, this.rig.pose.aperture);
    this.post.draw();
    this.frameCount++;
  }

  /** Standbild (für Screenshots/Tests): Schleife anhalten und genau einen Frame bei t rendern. */
  renderStill(t: number) {
    this.renderer.setAnimationLoop(null);
    this.playing = false;
    this.t = t;
    // Kamera-Überblendungen & Glättung abschließen
    for (let i = 0; i < 6; i++) {
      this.world.evaluate(t);
      this.rig.update(t, 0.5);
    }
    this.letterbox = this.cinema ? 1 : 0;
    this.cinemaAmt = this.cinema ? 1 : 0;
    this.subs.update(t);
    this.hud.update(t, '');
    this.bar.update(t, false);
    this.renderFrame(0);
    if (this.cinema) {
      this.cineEls[0].textContent = this.tl.storyClock(t);
      this.cineEls[1].textContent = this.tl.data.chapters[this.tl.chapterIndex(t)]?.title ?? '';
    }
    return true;
  }

  /** Für automatisierte Tests: Zustand aller Figuren zum aktuellen t */
  snapshot() {
    const out: Record<string, number[]> = {};
    this.world.evaluate(this.t);
    for (const [id, a] of this.world.actors) {
      const p = a.object.position;
      const hand = new THREE.Vector3();
      if (a.human) a.human.handR.getWorldPosition(hand);
      out[id] = a.object.visible ? [p.x, p.y, p.z, a.object.rotation.y, hand.x, hand.y, hand.z].map((v) => Math.round(v * 1e4) / 1e4) : [0];
    }
    for (const id of Object.keys(this.tl.data.props)) {
      const o = this.world.props.get(id)!;
      out[`prop:${id}`] = o.visible ? [...o.matrix.elements.slice(12, 15), 1].map((v) => Math.round(v * 1e4) / 1e4) : [0];
    }
    return out;
  }
  info() {
    const r = this.renderer.info;
    return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, ...this.world.stats() };
  }
}

async function main() {
  const loading = document.getElementById('loading')!;
  const msg = document.getElementById('loading-msg')!;
  try {
    const url = params.get('timeline') ?? 'timeline/story.json';
    const tl = await loadTimeline(url);
    msg.textContent = 'Kulissen, Figuren und Licht werden aufgebaut …';
    await new Promise((r) => setTimeout(r, 30));
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    const player = new StoryPlayer(tl, canvas);
    await player.loadAssets((m) => (msg.textContent = m));
    (window as unknown as { __player: StoryPlayer }).__player = player;
    player.start();
    msg.textContent = `${tl.data.chapters.length} Kapitel · ${Math.round(tl.duration / 60)} Minuten · ${Object.keys(tl.data.actors).length} Figuren`;
    loading.classList.add('ready');
    const go = (play: boolean) => {
      loading.classList.add('done');
      if (play) player.play();
      canvas.focus();
    };
    document.getElementById('start-btn')!.onclick = () => go(true);
    if (params.has('t') || params.get('autostart') === '0' || params.has('capture')) go(params.get('play') === '1');
    (window as unknown as { __ready: boolean }).__ready = true;
  } catch (e) {
    console.error(e);
    msg.textContent = `Fehler: ${(e as Error).message}`;
  }
}

void main();
