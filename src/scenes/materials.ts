import * as THREE from 'three';

/** Deterministischer Zufall (gleicher Seed = gleiche Welt). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let maxAniso = 8;
export function setMaxAnisotropy(v: number) {
  maxAniso = v;
}

function canvasTex(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void,
  opts: { repeat?: [number, number]; srgb?: boolean } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, s: number, seed: number, amount: number, base: number) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] = clamp255(img.data[i] + n + base);
    img.data[i + 1] = clamp255(img.data[i + 1] + n + base);
    img.data[i + 2] = clamp255(img.data[i + 2] + n + base);
  }
  ctx.putImageData(img, 0, 0);
}
const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

const cache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

export const M = {
  asphalt: () =>
    cached('asphalt', () => {
      const map = canvasTex(512, (ctx, s) => {
        ctx.fillStyle = '#2b2c2e';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 1, 38, 0);
        const r = rng(2);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
          ctx.beginPath();
          ctx.ellipse(r() * s, r() * s, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, 7);
          ctx.fill();
        }
      });
      const rough = canvasTex(256, (ctx, s) => {
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 3, 60, 0);
      }, { srgb: false });
      return new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 0.92, metalness: 0 });
    }),
  sidewalk: () =>
    cached('sidewalk', () => {
      const map = canvasTex(512, (ctx, s) => {
        ctx.fillStyle = '#8f8c86';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 4, 26, 0);
        ctx.strokeStyle = 'rgba(40,38,35,0.55)';
        ctx.lineWidth = 3;
        for (let i = 0; i <= 4; i++) {
          ctx.beginPath();
          ctx.moveTo(0, (i * s) / 4);
          ctx.lineTo(s, (i * s) / 4);
          ctx.moveTo((i * s) / 4, 0);
          ctx.lineTo((i * s) / 4, s);
          ctx.stroke();
        }
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
    }),
  curb: () => cached('curb', () => new THREE.MeshStandardMaterial({ color: '#a9a69f', roughness: 0.8 })),
  roadLine: () =>
    cached('roadLine', () => new THREE.MeshStandardMaterial({ color: '#e8e6dc', roughness: 0.6 })),
  facade: (seed: number, tone = '#6f757c') =>
    cached('facade' + seed + tone, () => {
      const r = rng(seed);
      const cols = 6;
      const rows = 8;
      const draw = (emissive: boolean) => (ctx: CanvasRenderingContext2D, s: number) => {
        ctx.fillStyle = emissive ? '#000' : tone;
        ctx.fillRect(0, 0, s, s);
        if (!emissive) noise(ctx, s, seed, 14, 0);
        const r2 = rng(seed * 7);
        for (let y = 0; y < rows; y++)
          for (let x = 0; x < cols; x++) {
            const lit = r2() < 0.18;
            const shade = 20 + r2() * 30;
            const wx = (x + 0.12) * (s / cols);
            const wy = (y + 0.15) * (s / rows);
            const ww = (s / cols) * 0.76;
            const wh = (s / rows) * 0.66;
            if (emissive) {
              ctx.fillStyle = lit ? `rgb(${170 + r2() * 60},${150 + r2() * 50},${110 + r2() * 40})` : '#000';
            } else {
              ctx.fillStyle = `rgb(${shade + 8},${shade + 18},${shade + 30})`;
            }
            ctx.fillRect(wx, wy, ww, wh);
          }
      };
      const map = canvasTex(512, draw(false));
      const emissiveMap = canvasTex(512, draw(true));
      void r;
      return new THREE.MeshStandardMaterial({
        map,
        emissiveMap,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.0,
        roughness: 0.55,
        metalness: 0.25,
      });
    }),
  glass: () =>
    cached('glass', () =>
      new THREE.MeshStandardMaterial({
        color: '#a8c0cc',
        roughness: 0.04,
        metalness: 0.9,
        transparent: true,
        opacity: 0.22,
        envMapIntensity: 1.4,
        depthWrite: false,
      }),
    ),
  glassDark: () =>
    cached('glassDark', () =>
      new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.06, metalness: 0.9, envMapIntensity: 1.2 }),
    ),
  metal: () => cached('metal', () => new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.32, metalness: 1 })),
  darkMetal: () =>
    cached('darkMetal', () => new THREE.MeshStandardMaterial({ color: '#2d3034', roughness: 0.4, metalness: 0.9 })),
  concrete: () =>
    cached('concrete', () => {
      const map = canvasTex(512, (ctx, s) => {
        ctx.fillStyle = '#b9b6b0';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 9, 18, 0);
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.75 });
    }),
  lobbyFloor: () =>
    cached('lobbyFloor', () => {
      const map = canvasTex(512, (ctx, s) => {
        ctx.fillStyle = '#d8d4cc';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 11, 12, 0);
        ctx.strokeStyle = 'rgba(90,85,80,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, s - 2, s - 2);
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.18, metalness: 0.0 });
    }),
  officeFloor: () =>
    cached('officeFloor', () => {
      const map = canvasTex(512, (ctx, s) => {
        // helles Eichenparkett
        const r = rng(12);
        for (let y = 0; y < 16; y++) {
          let x = -r() * 200;
          while (x < s) {
            const w = 140 + r() * 120;
            const l = 175 + r() * 35;
            ctx.fillStyle = `rgb(${l},${l * 0.82},${l * 0.6})`;
            ctx.fillRect(x, (y * s) / 16, w, s / 16);
            ctx.fillStyle = 'rgba(60,40,20,0.25)';
            ctx.fillRect(x, (y * s) / 16, 2, s / 16);
            x += w;
          }
          ctx.fillStyle = 'rgba(60,40,20,0.3)';
          ctx.fillRect(0, (y * s) / 16, s, 1.5);
        }
        noise(ctx, s, 13, 10, 0);
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.42 });
    }),
  carpet: () =>
    cached('carpet', () => {
      const map = canvasTex(256, (ctx, s) => {
        ctx.fillStyle = '#3b4250';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 14, 30, 0);
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 1 });
    }),
  wallWhite: () => cached('wallWhite', () => new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.9 })),
  wallWarm: () => cached('wallWarm', () => new THREE.MeshStandardMaterial({ color: '#d9d1c4', roughness: 0.9 })),
  ceiling: () => cached('ceiling', () => new THREE.MeshStandardMaterial({ color: '#f2f1ee', roughness: 0.95 })),
  wood: () =>
    cached('wood', () => {
      const map = canvasTex(512, (ctx, s) => {
        // helle Holzvertäfelung, vertikale Lamellen
        for (let x = 0; x < 32; x++) {
          const l = 190 + ((x * 37) % 23);
          ctx.fillStyle = `rgb(${l},${l * 0.8},${l * 0.58})`;
          ctx.fillRect((x * s) / 32, 0, s / 32 - 3, s);
          ctx.fillStyle = 'rgba(40,25,10,0.55)';
          ctx.fillRect(((x + 1) * s) / 32 - 3, 0, 3, s);
        }
        const r = rng(15);
        ctx.strokeStyle = 'rgba(120,80,40,0.12)';
        for (let i = 0; i < 300; i++) {
          const x = r() * s;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(x + r() * 6, s / 3, x - r() * 6, (2 * s) / 3, x, s);
          ctx.stroke();
        }
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.6 });
    }),
  woodPlain: () =>
    cached('woodPlain', () => {
      const map = canvasTex(256, (ctx, s) => {
        ctx.fillStyle = '#c49a6c';
        ctx.fillRect(0, 0, s, s);
        const r = rng(16);
        ctx.strokeStyle = 'rgba(110,70,35,0.18)';
        for (let i = 0; i < 120; i++) {
          const y = r() * s;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(s / 3, y + r() * 8, (2 * s) / 3, y - r() * 8, s, y);
          ctx.stroke();
        }
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.55 });
    }),
  graphite: () =>
    cached('graphite', () => new THREE.MeshStandardMaterial({ color: '#33363a', roughness: 0.38, metalness: 0.15 })),
  counterTop: () =>
    cached('counterTop', () => new THREE.MeshStandardMaterial({ color: '#d9d6d0', roughness: 0.25 })),
  plastic: (color: string) =>
    cached('plastic' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.45 })),
  fabric: (color: string) => cached('fabric' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95 })),
  leaf: () =>
    cached('leaf', () => new THREE.MeshStandardMaterial({ color: '#3f6b35', roughness: 0.7, side: THREE.DoubleSide })),
  leafDark: () =>
    cached('leafDark', () => new THREE.MeshStandardMaterial({ color: '#2c4f28', roughness: 0.75, side: THREE.DoubleSide })),
  pot: () => cached('pot', () => new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.65 })),
  carPaint: (color: string) =>
    cached('carPaint' + color, () =>
      new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.06 }),
    ),
  tire: () => cached('tire', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 })),
  emissive: (color: string, intensity = 2) =>
    cached('em' + color + intensity, () =>
      new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color(color), emissiveIntensity: intensity }),
    ),
  paper: () => cached('paper', () => new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.9, side: THREE.DoubleSide })),
  ceramic: (color: string) =>
    cached('ceramic' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 0.8 })),
  rubber: () => cached('rubber', () => new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.8 })),
};

export function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  opts: { cast?: boolean; receive?: boolean; name?: string } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  if (opts.name) m.name = opts.name;
  return m;
}

/** Box mit UVs in Metern (Texturen wiederholen sich passend zur Größe). */
export function worldBox(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  scale = 1,
  scaleV = scale,
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (ny > 0.5) uv.setXY(i, (u * w) / scale, (v * d) / scale);
    else if (nx > 0.5) uv.setXY(i, (u * d) / scale, (v * h) / scaleV);
    else uv.setXY(i, (u * w) / scale, (v * h) / scaleV);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
