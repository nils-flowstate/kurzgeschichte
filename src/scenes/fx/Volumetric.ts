import * as THREE from 'three';

/**
 * Günstiges „volumetrisches“ Licht: additive Lichtkegel/-schächte mit
 * weichem Rand (Fresnel) und Abfall entlang der Strahlrichtung (+Z lokal).
 */
export function beamMaterial(color: THREE.ColorRepresentation, intensity = 0.5, length = 10) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uLength: { value: length },
      uNoise: { value: 0.35 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vWorld;
      void main() {
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * normal);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uLength;
      uniform float uNoise;
      varying vec3 vLocal;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vWorld;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float vnoise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        float n = mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
        return n;
      }
      void main() {
        float along = clamp(vLocal.z / uLength, 0.0, 1.0);
        float fall = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.04, along);
        float edge = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
        edge = pow(edge, 1.4);
        float n = mix(1.0, vnoise(vWorld * 1.7) * 1.4, uNoise);
        float a = uIntensity * fall * edge * n;
        gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: true,
    fog: false,
  });
}

/** Kegel mit Spitze im Ursprung, geöffnet entlang +Z. */
export function coneMesh(length: number, angleDeg: number, color: THREE.ColorRepresentation, intensity: number) {
  const r = Math.tan((angleDeg * Math.PI) / 360) * length;
  const g = new THREE.ConeGeometry(r, length, 32, 1, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, beamMaterial(color, intensity, length));
  m.renderOrder = 10;
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  return m;
}

/** Lichtschacht (z. B. Sonne durchs Fenster): Quader, entlang +Z ausgerichtet. */
export function shaftMesh(w: number, h: number, length: number, color: THREE.ColorRepresentation, intensity: number) {
  const g = new THREE.CylinderGeometry(0.5, 0.5, length, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.scale(w * 1.41, 1, h * 1.41);
  g.translate(0, length / 2, 0);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, beamMaterial(color, intensity, length));
  m.renderOrder = 9;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** Schwebender Staub im Licht, Bewegung rein aus t berechnet. */
export class DustMotes {
  readonly points: THREE.Points;
  private base: Float32Array;
  private seeds: Float32Array;
  constructor(count: number, center: THREE.Vector3, size: THREE.Vector3, color = '#fff3dc') {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.seeds = new Float32Array(count);
    let s = 1234;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      this.base[i * 3] = center.x + (r() - 0.5) * size.x;
      this.base[i * 3 + 1] = center.y + (r() - 0.5) * size.y;
      this.base[i * 3 + 2] = center.z + (r() - 0.5) * size.z;
      this.seeds[i] = r() * 100;
    }
    pos.set(this.base);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.012,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }
  update(t: number) {
    const a = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    for (let i = 0; i < this.seeds.length; i++) {
      const sd = this.seeds[i];
      arr[i * 3] = this.base[i * 3] + Math.sin(t * 0.13 + sd) * 0.25;
      arr[i * 3 + 1] = this.base[i * 3 + 1] + Math.sin(t * 0.09 + sd * 1.7) * 0.2;
      arr[i * 3 + 2] = this.base[i * 3 + 2] + Math.cos(t * 0.11 + sd * 0.7) * 0.25;
    }
    a.needsUpdate = true;
  }
}
