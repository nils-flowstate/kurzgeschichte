import * as THREE from 'three';
import type { ScreenEvent } from '../../timeline/types';

/**
 * Bildschirm des CEO-Rechners: wird aus dem aktuellen Screen-Ereignis der
 * Timeline gezeichnet (Explorer-Suche, Mails, Morse-Seite …).
 */
export class ScreenTexture {
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshStandardMaterial;
  private ctx: CanvasRenderingContext2D;
  private lastKey = '';
  constructor(
    private w = 1024,
    private h = 608,
  ) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    this.ctx = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshStandardMaterial({
      color: '#000',
      emissive: '#ffffff',
      emissiveMap: this.texture,
      emissiveIntensity: 0.55,
      roughness: 0.25,
    });
  }

  render(e: ScreenEvent | null, t: number, clockText = '') {
    const view = e?.view ?? 'desktop';
    const typed = e?.query ? Math.min(e.query.length, Math.floor((t - e.t) * (e.typing ?? 9))) : 0;
    const q = e?.query ? e.query.slice(0, typed) : '';
    const done = !e?.query || typed >= e.query.length;
    const showResult = done && e?.result && t - e.t > (e.query?.length ?? 0) / (e.typing ?? 9) + 0.6;
    const blink = Math.floor(t * 2) % 2 === 0;
    const progress = view === 'copy' && e ? Math.min(1, (t - e.t) / 2.5) : 0;
    const key = [view, q, showResult ? 1 : 0, !done && blink ? 1 : 0, Math.round(progress * 20), clockText].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const c = this.ctx;
    const { w, h } = this;
    if (view === 'off') {
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);
      this.texture.needsUpdate = true;
      return;
    }
    // Hintergrund
    const grd = c.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#16324f');
    grd.addColorStop(1, '#0d1b2a');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);
    // Viele offene Fenster
    const win = (x: number, y: number, ww: number, hh: number, title: string, body?: (x: number, y: number) => void) => {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(x + 6, y + 8, ww, hh);
      c.fillStyle = '#f3f4f6';
      c.fillRect(x, y, ww, hh);
      c.fillStyle = '#d9dde3';
      c.fillRect(x, y, ww, 26);
      c.fillStyle = '#333';
      c.font = '15px system-ui, sans-serif';
      c.fillText(title, x + 10, y + 18);
      body?.(x, y + 26);
    };
    win(40, 40, 420, 260, 'Quartalszahlen.xlsx', (x, y) => {
      c.strokeStyle = '#c9ced6';
      for (let i = 0; i < 9; i++) c.strokeRect(x + 8, y + 8 + i * 24, 400, 24);
    });
    win(300, 90, 460, 300, 'Präsentation_Board_v7.pptx');
    win(560, 60, 420, 240, 'Kalender – Montag', (x, y) => {
      c.fillStyle = '#3b82f6';
      c.fillRect(x + 20, y + 40, 200, 30);
      c.fillStyle = '#10b981';
      c.fillRect(x + 20, y + 110, 260, 30);
    });
    win(120, 250, 380, 250, 'morse-code-uebersetzer.de', (x, y) => {
      c.fillStyle = '#555';
      c.font = '16px monospace';
      c.fillText(view === 'morse' ? '' : '· − · ·  − − ·', x + 20, y + 60);
    });

    const big = (title: string, body: (x: number, y: number) => void) => win(170, 120, 690, 380, title, body);
    const searchBox = (x: number, y: number, label: string) => {
      c.fillStyle = '#fff';
      c.strokeStyle = '#2563eb';
      c.lineWidth = 2;
      c.fillRect(x + 20, y + 20, 640, 40);
      c.strokeRect(x + 20, y + 20, 640, 40);
      c.fillStyle = '#111';
      c.font = '22px system-ui, sans-serif';
      c.fillText(`${label}  ${q}${!done && blink ? '|' : ''}`, x + 32, y + 48);
    };
    if (view === 'explorer') {
      big('Datei-Explorer', (x, y) => {
        searchBox(x, y, '🔍');
        if (showResult) {
          c.fillStyle = '#b91c1c';
          c.font = 'bold 26px system-ui, sans-serif';
          c.fillText(e!.result!, x + 30, y + 130);
        }
      });
    } else if (view === 'mail') {
      big('Posteingang – Outlook', (x, y) => {
        searchBox(x, y, 'Suchen:');
        const hit = showResult && e!.result === 'TREFFER';
        if (showResult && !hit) {
          c.fillStyle = '#b91c1c';
          c.font = 'bold 26px system-ui, sans-serif';
          c.fillText(e!.result!, x + 30, y + 130);
        }
        if (hit) {
          c.fillStyle = '#fef3c7';
          c.fillRect(x + 20, y + 90, 640, 70);
          c.fillStyle = '#111';
          c.font = 'bold 20px system-ui, sans-serif';
          c.fillText('AW: Lieferung Q3 – ImmunSafe AG', x + 34, y + 120);
          c.font = '17px monospace';
          c.fillText('-.. . .-.  .. -- -- ..- -. ... .- ..-. .', x + 34, y + 148);
          c.fillStyle = '#15803d';
          c.font = 'bold 38px system-ui, sans-serif';
          c.fillText('TREFFER', x + 34, y + 230);
        }
      });
    } else if (view === 'morse') {
      big('morse-code-uebersetzer.de', (x, y) => {
        c.fillStyle = '#9ca3af';
        c.font = 'italic 22px system-ui, sans-serif';
        c.fillText('(leer)', x + 30, y + 80);
        if (q) {
          c.fillStyle = '#111';
          c.font = '22px monospace';
          c.fillText(q, x + 30, y + 140);
        }
        if (showResult) {
          c.fillStyle = '#b91c1c';
          c.font = 'bold 24px system-ui, sans-serif';
          c.fillText(e!.result!, x + 30, y + 200);
        }
      });
    } else if (view === 'copy' || view === 'eject') {
      big('USB-Laufwerk (E:)', (x, y) => {
        c.fillStyle = '#111';
        c.font = '22px system-ui, sans-serif';
        c.fillText(view === 'copy' ? 'Kopiere „AW: Lieferung Q3“ …' : 'Hardware kann jetzt sicher entfernt werden.', x + 30, y + 60);
        if (view === 'copy') {
          c.fillStyle = '#e5e7eb';
          c.fillRect(x + 30, y + 90, 600, 26);
          c.fillStyle = '#22c55e';
          c.fillRect(x + 30, y + 90, 600 * progress, 26);
        }
      });
    }
    // Taskleiste mit Uhr
    c.fillStyle = 'rgba(10,15,25,0.92)';
    c.fillRect(0, h - 36, w, 36);
    c.fillStyle = '#e5e7eb';
    c.font = '16px system-ui, sans-serif';
    for (let i = 0; i < 9; i++) c.fillRect(14 + i * 40, h - 28, 24, 20);
    c.fillText(clockText, w - 92, h - 13);
    this.texture.needsUpdate = true;
  }
}

/** Kleine Text-Anzeige (z. B. Stockwerk über dem Aufzug). */
export class LabelTexture {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private last = '';
  constructor(
    private w = 128,
    private h = 64,
    private color = '#ff8a3d',
  ) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    this.ctx = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }
  set(text: string) {
    if (text === this.last) return;
    this.last = text;
    const c = this.ctx;
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.w, this.h);
    c.fillStyle = this.color;
    c.font = `bold ${Math.floor(this.h * 0.7)}px monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, this.w / 2, this.h / 2 + 2);
    this.texture.needsUpdate = true;
  }
}
