import type { Timeline } from '../timeline/Timeline';
import type { SubtitleEvent } from '../timeline/types';
import type { CameraId } from '../cameras/CameraRig';
import type { QualityLevel } from '../engine/Quality';

export interface HudCallbacks {
  setCamera(id: CameraId): void;
  setActor(id: string): void;
  setQuality(q: QualityLevel): void;
  toggle(key: 'cones' | 'labels' | 'subs' | 'mute'): void;
  cinema(): void;
}

/** Kopfzeile (Titel, Kapitel, Story-Uhr) + Steuerung oben rechts + Hilfe. */
export class Hud {
  readonly root: HTMLDivElement;
  private chapterEl: HTMLDivElement;
  private clockEl: HTMLElement;
  private shotEl: HTMLDivElement;
  private camBtns: Record<string, HTMLButtonElement> = {};
  private toggles: Record<string, HTMLButtonElement> = {};
  private actorSel: HTMLSelectElement;
  private qualitySel: HTMLSelectElement;
  private fpsEl: HTMLDivElement;
  private help: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private toastTimer = 0;

  constructor(
    private tl: Timeline,
    cb: HudCallbacks,
    selectable: { id: string; name: string }[],
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ui';
    this.root.innerHTML = `
      <div class="top-left">
        <div class="title">${tl.data.meta.title}</div>
        <div class="chapter"></div>
        <div class="clock">Story-Zeit <b>10:24:00</b></div>
        <div class="shotname"></div>
      </div>
      <div class="top-right">
        <div class="group">
          <button class="btn" data-cam="film" title="Filmkamera – Kamerafahrten laut Timeline">🎬 Film <kbd>1</kbd></button>
          <button class="btn" data-cam="ego" title="Ego-Perspektive – aus den Augen der Figur (Maus ziehen = umsehen)">👁 Ego <kbd>2</kbd></button>
          <button class="btn" data-cam="third" title="Third Person – Schulterkamera (ziehen = drehen, Rad = Abstand)">🧍 Third <kbd>3</kbd></button>
          <button class="btn" data-cam="free" title="Frei – Klick ins Bild, dann WASD + Maus, Shift schneller, Q/E runter/hoch">🕹 Frei <kbd>4</kbd></button>
          <span class="lbl">Figur</span>
          <select class="sel" data-actor title="Figur für Ego/Third Person">
            ${selectable.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>
        <div class="group">
          <button class="btn" data-cinema title="Cinema-Modus: Letterbox, Regie-Schnitt, keine UI (Esc beendet)">🎞 Cinema <kbd>C</kbd></button>
          <button class="btn" data-t="cones" title="Sichtkegel der Überwachungskameras">📹 Kameras <kbd>K</kbd></button>
          <button class="btn" data-t="labels" title="Namen der Figuren">🏷 Namen <kbd>N</kbd></button>
          <button class="btn on" data-t="subs" title="Untertitel">💬 Text <kbd>U</kbd></button>
          <button class="btn" data-t="mute" title="Ton an/aus">🔊 <kbd>M</kbd></button>
        </div>
        <div class="group">
          <span class="lbl">Qualität</span>
          <select class="sel" data-quality title="Grafikqualität">
            <option value="high">Hoch</option><option value="medium">Mittel</option><option value="low">Niedrig</option>
          </select>
          <div class="fps">– fps</div>
          <button class="btn" data-help title="Tastenkürzel">? <kbd>H</kbd></button>
        </div>
      </div>`;
    this.chapterEl = this.root.querySelector('.chapter')!;
    this.clockEl = this.root.querySelector('.clock b')!;
    this.shotEl = this.root.querySelector('.shotname')!;
    this.fpsEl = this.root.querySelector('.fps')!;
    this.actorSel = this.root.querySelector('[data-actor]')!;
    this.qualitySel = this.root.querySelector('[data-quality]')!;
    this.root.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
      this.camBtns[b.dataset.cam!] = b;
      b.onclick = () => cb.setCamera(b.dataset.cam as CameraId);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      this.toggles[b.dataset.t!] = b;
      b.onclick = () => cb.toggle(b.dataset.t as 'cones');
    });
    this.root.querySelector<HTMLButtonElement>('[data-cinema]')!.onclick = () => cb.cinema();
    this.actorSel.onchange = () => cb.setActor(this.actorSel.value);
    this.qualitySel.onchange = () => cb.setQuality(this.qualitySel.value as QualityLevel);

    this.help = document.createElement('div');
    this.help.className = 'help';
    this.help.innerHTML = `<div class="card"><h2>Steuerung</h2><table>
      <tr><td>Leertaste</td><td>Play / Pause</td></tr>
      <tr><td>← / →</td><td>5 s zurück / vor (⇧ = Kapitel)</td></tr>
      <tr><td>, / .</td><td>Einzelbild zurück / vor (bei Pause)</td></tr>
      <tr><td>+ / −</td><td>Geschwindigkeit</td></tr>
      <tr><td>1 2 3 4</td><td>Film · Ego · Third Person · Frei</td></tr>
      <tr><td>Tab</td><td>Nächste Figur (Ego/Third)</td></tr>
      <tr><td>C / Esc</td><td>Cinema-Modus an / aus</td></tr>
      <tr><td>WASD, Maus</td><td>Freie Kamera (erst ins Bild klicken)</td></tr>
      <tr><td>Shift / Q / E</td><td>schneller / runter / hoch</td></tr>
      <tr><td>Maus ziehen</td><td>Ego: umsehen · Third: Kamera drehen</td></tr>
      <tr><td>Mausrad</td><td>Third: Abstand · Frei: Brennweite</td></tr>
      <tr><td>K · N · U · M</td><td>Kamerakegel · Namen · Untertitel · Ton</td></tr>
      <tr><td>F</td><td>Vollbild</td></tr>
      <tr><td>H</td><td>diese Hilfe</td></tr></table></div>`;
    this.help.onclick = () => this.toggleHelp(false);
    this.root.querySelector<HTMLButtonElement>('[data-help]')!.onclick = () => this.toggleHelp();
    document.body.appendChild(this.help);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    document.body.appendChild(this.toastEl);
  }

  toggleHelp(force?: boolean) {
    this.help.classList.toggle('show', force);
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1600);
  }

  setCamera(id: CameraId) {
    for (const [k, b] of Object.entries(this.camBtns)) b.classList.toggle('on', k === id);
  }
  setActor(id: string) {
    this.actorSel.value = id;
  }
  setQuality(q: QualityLevel) {
    this.qualitySel.value = q;
  }
  setToggle(key: string, on: boolean, label?: string) {
    const b = this.toggles[key];
    if (!b) return;
    b.classList.toggle('on', on);
    if (label) b.firstChild!.textContent = label + ' ';
  }
  setFps(fps: number, ms: number) {
    this.fpsEl.textContent = `${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms`;
  }

  update(t: number, shotName: string) {
    const ch = this.tl.data.chapters[this.tl.chapterIndex(t)];
    this.chapterEl.textContent = ch ? `Kapitel ${this.tl.data.chapters.indexOf(ch) + 1} · ${ch.title}` : '';
    this.clockEl.textContent = this.tl.storyClock(t);
    this.shotEl.textContent = shotName ? `Einstellung: ${shotName}` : '';
  }
}

/** Untertitel / Erzähltext / Brief */
export class Subtitles {
  readonly el: HTMLDivElement;
  private shown = new Map<SubtitleEvent, HTMLDivElement>();
  constructor(
    private tl: Timeline,
    private speakerName: (id: string) => string,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'subs';
  }
  update(t: number) {
    const active = this.tl.activeSubtitles(t);
    const set = new Set(active);
    for (const [e, node] of this.shown)
      if (!set.has(e)) {
        node.remove();
        this.shown.delete(e);
      }
    for (const e of active) {
      if (this.shown.has(e)) continue;
      const d = document.createElement('div');
      d.className = `sub ${e.style}`;
      const who = e.style === 'dialog' && e.speaker ? `<span class="who">${this.speakerName(e.speaker)}</span>` : '';
      d.innerHTML = `${who}${escapeHtml(e.text)}`;
      this.el.appendChild(d);
      this.shown.set(e, d);
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
