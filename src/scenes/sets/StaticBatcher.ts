import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Fasst alle unbeweglichen, undurchsichtigen Meshes eines Sets pro Material zu
 * einem Mesh zusammen (weniger Draw-Calls -> stabile 60 FPS auf dem M1).
 * Objekte, die sich bewegen (Türen, Aufzug, Autos …), sind über `dynamic`
 * markiert und bleiben unangetastet. Die Original-Meshes werden zurückgegeben
 * (für Kollisions-Raycasts der Kameras).
 */
export function batchStatic(root: THREE.Object3D, dynamic: Set<THREE.Object3D>): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; meshes: THREE.Mesh[] }>();
  const visit = (o: THREE.Object3D) => {
    if (dynamic.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && o.visible) {
      const mat = m.material as THREE.Material;
      if (!mat.transparent && mat.depthWrite !== false && !(mat as THREE.ShaderMaterial).isShaderMaterial) {
        const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { mat, cast: m.castShadow, receive: m.receiveShadow, meshes: [] }));
        g.meshes.push(m);
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);

  const originals: THREE.Mesh[] = [];
  const tmp = new THREE.Matrix4();
  for (const g of groups.values()) {
    if (g.meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const m of g.meshes) {
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) {
        const n = geo.attributes.position.count;
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.morphAttributes = {};
      tmp.multiplyMatrices(rootInv, m.matrixWorld);
      geo.applyMatrix4(tmp);
      geo.clearGroups();
      geos.push(geo);
    }
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.name = `batch.${g.mat.name || g.mat.type}`;
    mesh.userData.batched = g.meshes.length;
    for (const m of g.meshes) {
      m.updateMatrixWorld();
      m.parent?.remove(m);
      originals.push(m);
    }
    root.add(mesh);
  }
  return originals;
}
