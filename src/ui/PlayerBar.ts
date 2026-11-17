import type { Timeline } from '../timeline/Timeline';

const ICON_PLAY = '<svg viewBox="0 0 16 16"><path d="M3 1.5v13l11-6.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16"><path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" fill="currentColor"/></svg>';

export const fmt = (s: number) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export interface PlayerCallbacks {
  togglePlay(): void;
  seek(t: number): void;
  setSpeed(v: number): void;
  scrubbing(on: boolean): void;
}

/** Untere Player-Leiste: Play/Pause, Zeit, Scrubber mit Kapitel-Markern, Tempo, Kapitel. */
export class PlayerBar {
  readonly el: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private timeEl: HTMLDivElement;
  private fill: HTMLDivElement;
  private knob: HTMLDivElement;
  private scrub: HTMLDivElement;
  private hover: HTMLDivElement;
  private chips: HTMLButtonElement[] = [];
  private markers: HTMLSpanElement[] = [];
  private speedSel: HTMLSelectElement;
  private dragging = false;

  constructor(
    private tl: Timeline,
    private cb: PlayerCallbacks,
  ) {
    const D = tl.duration;
    this.el = document.createElement('div');
    this.el.className = 'player';
    this.el.innerHTML = `
      <div class="row">
        <button class="btn" data-prev title="Vorheriges Kapitel (⇧←)">⏮</button>
        <button class="play" title="Play/Pause (Leertaste)">${ICON_PLAY}</button>
        <button class="btn" data-next title="Nächstes Kapitel (⇧→)">⏭</button>
        <div class="time"><b>0:00</b> / ${fmt(D)}</div>
        <div class="scrub" title="Ziehen zum Scrubben">
          <div class="track"></div><div class="fill"></div>
          ${tl.data.chapters.map((c, i) => `<div class="marker" style="left:${(c.t / D) * 100}%"><span data-i="${i}">${i + 1}. ${c.title}</span></div>`).join('')}
          <div class="knob"></div><div class="hover-time"></div>
        </div>
        <select class="sel" title="Geschwindigkeit">
          ${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${v === 1 ? 'selected' : ''}>${v}×</option>`).join('')}
        </select>
      </div>
      <div class="chapters">${tl.data.chapters.map((c, i) => `<button class="chip" data-i="${i}">${i + 1} · ${c.title}</button>`).join('')}</div>`;
    this.playBtn = this.el.querySelector('.play')!;
    this.timeEl = this.el.querySelector('.time')!;
    this.fill = this.el.querySelector('.fill')!;
    this.knob = this.el.querySelector('.knob')!;
    this.scrub = this.el.querySelector('.scrub')!;
    this.hover = this.el.querySelector('.hover-time')!;
    this.speedSel = this.el.querySelector('select')!;
    this.chips = [...this.el.querySelectorAll<HTMLButtonElement>('.chip')];
    this.markers = [...this.el.querySelectorAll<HTMLSpanElement>('.marker span')];

    this.playBtn.onclick = () => cb.togglePlay();
    this.el.querySelector<HTMLButtonElement>('[data-prev]')!.onclick = () => this.jumpChapter(-1);
    this.el.querySelector<HTMLButtonElement>('[data-next]')!.onclick = () => this.jumpChapter(1);
    this.speedSel.onchange = () => cb.setSpeed(Number(this.speedSel.value));
    this.chips.forEach((c) => (c.onclick = () => cb.seek(tl.data.chapters[Number(c.dataset.i)].t + 0.01)));

    const tAt = (e: PointerEvent) => {
      const r = this.scrub.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * D;
    };
    this.scrub.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.scrub.setPointerCapture(e.pointerId);
      cb.scrubbing(true);
      cb.seek(tAt(e));
    });
    this.scrub.addEventListener('pointermove', (e) => {
      const t = tAt(e);
      const r = this.scrub.getBoundingClientRect();
      this.hover.style.display = 'block';
      this.hover.style.left = `${(t / D) * r.width}px`;
      this.hover.textContent = fmt(t);
      const ci = tl.chapterIndex(t);
      this.markers.forEach((m, i) => m.classList.toggle('near', i === ci));
      if (this.dragging) cb.seek(t);
    });
    this.scrub.addEventListener('pointerleave', () => (this.hover.style.display = 'none'));
    const end = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.scrub.hasPointerCapture(e.pointerId)) this.scrub.releasePointerCapture(e.pointerId);
      cb.scrubbing(false);
    };
    this.scrub.addEventListener('pointerup', end);
    this.scrub.addEventListener('pointercancel', end);
  }

  private currentT = 0;
  jumpChapter(dir: number) {
    const ch = this.tl.data.chapters;
    let i = this.tl.chapterIndex(this.currentT);
    if (dir < 0 && this.currentT - ch[i].t > 2) {
      this.cb.seek(ch[i].t + 0.01);
      return;
    }
    i = Math.max(0, Math.min(ch.length - 1, i + dir));
    this.cb.seek(ch[i].t + 0.01);
  }

  setSpeed(v: number) {
    this.speedSel.value = String(v);
  }

  update(t: number, playing: boolean) {
    this.currentT = t;
    const D = this.tl.duration;
    const pct = (t / D) * 100;
    this.fill.style.width = `${pct}%`;
    this.knob.style.left = `${pct}%`;
    (this.timeEl.firstElementChild as HTMLElement).textContent = fmt(t);
    const icon = playing ? ICON_PAUSE : ICON_PLAY;
    if (this.playBtn.dataset.state !== String(playing)) {
      this.playBtn.innerHTML = icon;
      this.playBtn.dataset.state = String(playing);
    }
    const ci = this.tl.chapterIndex(t);
    this.chips.forEach((c, i) => c.classList.toggle('on', i === ci));
  }
}
