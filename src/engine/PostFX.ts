import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { QualitySettings } from './Quality';
import type { LightPreset } from '../scenes/Lighting';

/** Filmlook nach dem Tonemapping: Grading, Korn, Vignette, CA, Letterbox. */
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGrain: { value: 0.05 },
    uVignette: { value: 0.3 },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uTintShadows: { value: new THREE.Color('#1d2a3a') },
    uTintHighlights: { value: new THREE.Color('#ffe6c8') },
    uAberration: { value: 0.0015 },
    uLetterbox: { value: 0 },
    uAspect: { value: 1.6 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uSaturation, uContrast, uAberration, uLetterbox, uAspect, uFade;
    uniform vec3 uTintShadows, uTintHighlights;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime * 61.7) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberration * 8.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      // Grading (Split-Toning)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      vec3 sh = mix(vec3(1.0), uTintShadows * 3.0, 0.12);
      vec3 hi = mix(vec3(1.0), uTintHighlights, 0.18);
      col *= mix(sh, hi, smoothstep(0.1, 0.8, l));
      // Vignette
      float v = smoothstep(0.85, 0.2, length(c * vec2(uAspect * 0.75, 1.0)) );
      col *= mix(1.0, v, uVignette);
      // Filmkorn (luminanzabhängig)
      float g = hash(vUv * vec2(1920.0, 1080.0)) - 0.5;
      col += g * uGrain * (1.0 - l * 0.6);
      // Abblende
      col *= 1.0 - uFade;
      // Letterbox 2.39:1
      float bar = max(0.0, (1.0 - uAspect / 2.39) * 0.5) * uLetterbox;
      if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

/** Transparente Objekte (Glas, Lichtkegel) aus AO-/Tiefen-Durchgängen heraushalten. */
function excludeTransparent(pass: { render: (...a: never[]) => void }, scene: THREE.Scene) {
  const orig = pass.render.bind(pass) as (...a: unknown[]) => void;
  let list: THREE.Object3D[] | null = null;
  let frame = 0;
  (pass as unknown as { render: (...a: unknown[]) => void }).render = (...args: unknown[]) => {
    if (!list || frame++ % 120 === 0) {
      list = [];
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && !Array.isArray(m) && (m.transparent || m.depthWrite === false)) list!.push(o);
      });
    }
    const hidden: THREE.Object3D[] = [];
    for (const o of list) if (o.visible) {
      o.visible = false;
      hidden.push(o);
    }
    orig(...args);
    for (const o of hidden) o.visible = true;
  };
}

export class PostFX {
  readonly composer: EffectComposer;
  private render: RenderPass;
  private gtao?: GTAOPass;
  private bokeh?: BokehPass;
  private bloom?: UnrealBloomPass;
  private film: ShaderPass;
  private output: OutputPass;
  private w = 1;
  private h = 1;
  /** Zusatz-Filmlook im Cinema-Modus (0..1) */
  cinema = 0;
  letterbox = 0;
  fade = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    q: QualitySettings,
  ) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(1);
    this.render = new RenderPass(scene, camera);
    this.film = new ShaderPass(FilmShader);
    this.output = new OutputPass();
    this.rebuild(q);
  }

  rebuild(q: QualitySettings) {
    const c = this.composer;
    while (c.passes.length) c.removePass(c.passes[0]);
    this.gtao?.dispose();
    this.bokeh?.dispose();
    this.bloom?.dispose();
    this.gtao = this.bokeh = this.bloom = undefined;
    c.renderTarget1.samples = q.msaa;
    c.renderTarget2.samples = q.msaa;
    c.addPass(this.render);
    if (q.ao) {
      this.gtao = new GTAOPass(this.scene, this.camera, this.w, this.h);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.5, scale: 1.0, samples: q.aoSamples });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      excludeTransparent(this.gtao as never, this.scene);
      c.addPass(this.gtao);
    }
    if (q.dof) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 5, aperture: 0.002, maxblur: 0.008 });
      excludeTransparent(this.bokeh as never, this.scene);
      c.addPass(this.bokeh);
    }
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w / 2, this.h / 2), 0.25, 0.45, 3.0);
      c.addPass(this.bloom);
    }
    c.addPass(this.output);
    c.addPass(this.film);
    this.setSize(this.w, this.h);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.composer.setSize(w, h);
    this.film.uniforms.uAspect.value = w / h;
  }

  /** Pro Frame: Parameter aus Lichtstimmung & Kamera übernehmen. */
  update(p: LightPreset, realTime: number, focusDist: number, aperture: number) {
    const u = this.film.uniforms;
    const k = this.cinema;
    u.uTime.value = realTime % 100;
    u.uGrain.value = p.grain * (1 + k * 0.8);
    u.uVignette.value = Math.min(0.9, p.vignette * (1 + k * 0.4));
    u.uSaturation.value = p.saturation * (1 - k * 0.06);
    u.uContrast.value = p.contrast * (1 + k * 0.06);
    (u.uTintShadows.value as THREE.Color).set(p.tintShadows);
    (u.uTintHighlights.value as THREE.Color).set(p.tintHighlights);
    u.uAberration.value = 0.0012 + k * 0.0012;
    u.uLetterbox.value = this.letterbox;
    u.uFade.value = this.fade;
    if (this.bloom) {
      this.bloom.strength = p.bloom * 0.8 * (1 + k * 0.25);
    }
    if (this.bokeh) {
      const bu = (this.bokeh as unknown as { uniforms: Record<string, THREE.IUniform> }).uniforms;
      bu.focus.value = focusDist;
      bu.aperture.value = aperture * (1 + k * 0.5);
    }
  }

  draw() {
    this.composer.render();
  }
}
