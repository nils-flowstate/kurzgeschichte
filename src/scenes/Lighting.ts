import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/** Eine Lichtstimmung. Werte werden beim Überblenden linear gemischt. */
export interface LightPreset {
  /** Sonnenhöhe/-richtung in Grad */
  sunElevation: number;
  sunAzimuth: number;
  sunColor: string;
  sunIntensity: number;
  env: 'sky' | 'room';
  envIntensity: number;
  hemiIntensity: number;
  exposure: number;
  fogColor: string;
  fogDensity: number;
  interior: number;
  /** Stärke der volumetrischen Lichtschächte */
  shafts: number;
  bloom: number;
  vignette: number;
  grain: number;
  saturation: number;
  contrast: number;
  /** Farbstich Schatten/Lichter */
  tintShadows: string;
  tintHighlights: string;
  turbidity: number;
}

const base: LightPreset = {
  sunElevation: 24,
  sunAzimuth: 128,
  sunColor: '#ffe2bd',
  sunIntensity: 2.6,
  env: 'sky',
  envIntensity: 0.42,
  hemiIntensity: 0.18,
  exposure: 0.72,
  fogColor: '#c6cfd8',
  fogDensity: 0.0026,
  interior: 0.25,
  shafts: 1,
  bloom: 0.32,
  vignette: 0.32,
  grain: 0.045,
  saturation: 1.0,
  contrast: 1.08,
  tintShadows: '#1d2a3a',
  tintHighlights: '#ffe6c8',
  turbidity: 3.5,
};

export const PRESETS: Record<string, LightPreset> = {
  street_morning: { ...base },
  street_letter: { ...base, exposure: 0.9, saturation: 0.92, vignette: 0.42, bloom: 0.38, tintShadows: '#13233a' },
  street_show: { ...base, exposure: 0.88, contrast: 1.12, saturation: 0.9, vignette: 0.48, tintShadows: '#0f1d33' },
  lobby: { ...base, env: 'room', envIntensity: 0.45, interior: 1, exposure: 0.95, fogDensity: 0.006, fogColor: '#d8d2c8', shafts: 0.6 },
  elevator: { ...base, env: 'room', envIntensity: 0.55, interior: 1, exposure: 1.0, fogDensity: 0.0, sunIntensity: 2.0, vignette: 0.5, shafts: 0 },
  office_morning: { ...base, env: 'room', envIntensity: 0.42, interior: 1, exposure: 1.0, fogDensity: 0.012, fogColor: '#e6dccd', shafts: 1, bloom: 0.36 },
  office_tension: {
    ...base,
    env: 'room',
    envIntensity: 0.34,
    interior: 0.75,
    exposure: 0.9,
    fogDensity: 0.014,
    fogColor: '#d8cfc2',
    shafts: 1.1,
    contrast: 1.14,
    saturation: 0.86,
    vignette: 0.5,
    tintShadows: '#0f2236',
  },
  ceo_office: {
    ...base,
    env: 'room',
    envIntensity: 0.26,
    interior: 0.5,
    exposure: 0.85,
    fogDensity: 0.01,
    fogColor: '#9fb0c2',
    shafts: 0.7,
    contrast: 1.16,
    saturation: 0.8,
    vignette: 0.55,
    tintShadows: '#0b1c33',
    tintHighlights: '#d9ecff',
  },
  hiding: {
    ...base,
    env: 'room',
    envIntensity: 0.3,
    interior: 0.6,
    exposure: 0.85,
    fogDensity: 0.013,
    contrast: 1.18,
    saturation: 0.78,
    vignette: 0.62,
    tintShadows: '#0d1a2c',
  },
  relief: { ...base, env: 'room', envIntensity: 0.48, interior: 1.05, exposure: 1.05, fogDensity: 0.012, fogColor: '#efe1cc', saturation: 1.05, vignette: 0.3, tintHighlights: '#ffdcae' },
  street_finale: {
    ...base,
    sunElevation: 28,
    sunIntensity: 2.9,
    sunColor: '#ffd9a8',
    exposure: 0.76,
    bloom: 0.4,
    saturation: 1.02,
    vignette: 0.36,
    tintHighlights: '#ffd7a0',
  },
};

function mixPreset(a: LightPreset, b: LightPreset, u: number): LightPreset {
  const out = { ...b } as LightPreset;
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  for (const k of Object.keys(b) as (keyof LightPreset)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') (out as unknown as Record<string, number>)[k] = va + (vb - va) * u;
    else if (typeof va === 'string' && typeof vb === 'string' && va.startsWith('#')) {
      ca.set(va);
      cb.set(vb);
      (out as unknown as Record<string, string>)[k] = '#' + ca.lerp(cb, u).getHexString();
    }
  }
  out.env = u < 0.5 ? a.env : b.env;
  return out;
}

export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: Sky;
  current: LightPreset = PRESETS.street_morning;
  private pmrem: THREE.PMREMGenerator;
  private envCache = new Map<string, THREE.Texture>();
  private roomEnv: THREE.Texture;
  private hdri: { exterior?: THREE.Texture; interior?: THREE.Texture } = {};
  private focus = new THREE.Vector3();

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sun = new THREE.DirectionalLight('#ffe2bd', 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -20;
    cam.right = cam.top = 20;
    cam.near = 1;
    cam.far = 160;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#cfe0ff', '#6b5a48', 0.25);
    scene.add(this.hemi);
    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.rayleigh.value = 1.3;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    if (u.cloudCoverage) u.cloudCoverage.value = 0.35;
    scene.add(this.sky);
    scene.fog = new THREE.FogExp2('#c6cfd8', 0.004);
    this.roomEnv = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }

  async loadHdri(paths: { exterior?: string | null; interior?: string | null } | undefined) {
    if (!paths) return;
    const loader = new HDRLoader();
    for (const key of ['exterior', 'interior'] as const) {
      const p = paths[key];
      if (!p) continue;
      try {
        const tex = await loader.loadAsync(p);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        this.hdri[key] = this.pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
      } catch (e) {
        console.warn(`[licht] HDRI ${p} konnte nicht geladen werden – nutze prozedurale Umgebung.`, e);
      }
    }
  }

  setShadowMapSize(size: number) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
  }

  setShadowSoftness(radius: number) {
    this.sun.shadow.radius = radius;
  }

  private sunDir(p: LightPreset) {
    const el = THREE.MathUtils.degToRad(p.sunElevation);
    const az = THREE.MathUtils.degToRad(p.sunAzimuth);
    // Azimut 0 = +Z (Süden/Straße), 90 = +X (Osten)
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }

  private skyEnv(p: LightPreset): THREE.Texture {
    if (this.hdri.exterior) return this.hdri.exterior;
    const key = `${p.sunElevation.toFixed(0)}|${p.sunAzimuth.toFixed(0)}|${p.turbidity.toFixed(1)}`;
    let tex = this.envCache.get(key);
    if (!tex) {
      const s = new THREE.Scene();
      const sky = new Sky();
      sky.scale.setScalar(1000);
      const u = sky.material.uniforms;
      u.turbidity.value = p.turbidity;
      u.rayleigh.value = 1.3;
      u.mieCoefficient.value = 0.004;
      u.sunPosition.value.copy(this.sunDir(p));
      s.add(sky);
      tex = this.pmrem.fromScene(s).texture;
      this.envCache.set(key, tex);
    }
    return tex;
  }

  /** Lichtstimmung für Zeitpunkt t setzen (Überblendung von -> zu). */
  apply(from: string, to: string, u: number, interiorLights: THREE.Light[]) {
    const a = PRESETS[from] ?? PRESETS.street_morning;
    const b = PRESETS[to] ?? PRESETS.street_morning;
    const p = u >= 1 ? b : mixPreset(a, b, u);
    this.current = p;
    const dir = this.sunDir(p);
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sun.position.copy(this.focus).addScaledVector(dir, 80);
    this.sun.target.position.copy(this.focus);
    this.hemi.intensity = p.hemiIntensity;
    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(dir);
    su.turbidity.value = p.turbidity;
    const env = p.env === 'room' ? (this.hdri.interior ?? this.roomEnv) : this.skyEnv(p);
    if (this.scene.environment !== env) this.scene.environment = env;
    this.scene.environmentIntensity = p.envIntensity;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(p.fogColor);
    fog.density = p.fogDensity;
    this.renderer.toneMappingExposure = p.exposure;
    for (const l of interiorLights) l.intensity = (l.userData.baseIntensity ?? 1) * p.interior;
  }

  /** Schattenkamera folgt dem Geschehen (auf Texelraster eingerastet gegen Flimmern). */
  setFocus(v: THREE.Vector3) {
    const size = this.sun.shadow.mapSize.x || 2048;
    const texel = 40 / size;
    this.focus.set(Math.round(v.x / texel) * texel, Math.round(v.y / texel) * texel, Math.round(v.z / texel) * texel);
  }
}
