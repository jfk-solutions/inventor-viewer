import type { CadRuntime } from "../runtime";

type CatiaScene = {
  nodes: CatiaNode[];
  meshes: CatiaMesh[];
  materials: CatiaMaterial[];
  lineSets: CatiaLineSet[];
  diagnostics: { severity: string; code: string; message: string; path?: string }[];
};

type CatiaNode = {
  name: string;
  transform: readonly number[];
  visible: boolean;
  meshIndices: readonly number[];
  lineSetIndices: readonly number[];
  children: readonly CatiaNode[];
  sourcePath?: string;
};

type CatiaMesh = {
  name?: string;
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  materialIndex?: number;
  sourcePath?: string;
};

type CatiaMaterial = {
  name?: string;
  color: readonly [number, number, number, number];
  doubleSided?: boolean;
  metallic?: number;
  roughness?: number;
};

type CatiaLineSet = {
  name?: string;
  positions: Float32Array;
  color: readonly [number, number, number, number];
  sourcePath?: string;
};

function nodeMetadata(node: CatiaNode) {
  return {
    kind: node.children.length ? "CATIA assembly" : node.meshIndices.length ? "CATIA body" : "CATIA node",
    name: node.name,
    sourcePath: node.sourcePath,
    meshes: node.meshIndices.length,
    lineSets: node.lineSetIndices.length,
  };
}

export function createCatiaThreeGroup(runtime: CadRuntime, scene: CatiaScene, document: any) {
  const { THREE } = runtime;
  const isV4 = document.format === "catia-v4-model";
  const materials = scene.materials.map((source) => {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(source.color[0], source.color[1], source.color[2]),
      opacity: source.color[3],
      transparent: source.color[3] < 1,
      metalness: source.metallic ?? 0.05,
      roughness: source.roughness ?? 0.62,
      side: source.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    material.name = source.name ?? "CATIA material";
    return material;
  });
  const meshGeometries = scene.meshes.map((source) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    if (source.normals?.length === source.positions.length) geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    else geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  });
  const lineGeometries = scene.lineSets.map((source) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  });
  const lineMaterials = scene.lineSets.map((source) => new THREE.LineBasicMaterial({
    color: new THREE.Color(source.color[0], source.color[1], source.color[2]),
    opacity: source.color[3],
    transparent: source.color[3] < 1,
  }));

  const buildNode = (node: CatiaNode): any => {
    const group = new THREE.Group();
    group.name = node.name;
    group.visible = node.visible;
    group.userData.catia = nodeMetadata(node);
    if (node.transform.length === 16 && node.transform.every(Number.isFinite)) {
      group.matrix.fromArray(node.transform);
      group.matrix.decompose(group.position, group.quaternion, group.scale);
    }
    for (const index of node.meshIndices) {
      const source = scene.meshes[index];
      const geometry = meshGeometries[index];
      if (!source || !geometry) continue;
      const material = materials[source.materialIndex ?? 0] ?? new THREE.MeshStandardMaterial({ color: 0xb7c8c6, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = source.name ?? node.name;
      mesh.userData.catia = { kind: "CATIA mesh", name: mesh.name, sourcePath: source.sourcePath ?? node.sourcePath };
      group.add(mesh);
    }
    for (const index of node.lineSetIndices) {
      const source = scene.lineSets[index];
      const geometry = lineGeometries[index];
      const material = lineMaterials[index];
      if (!source || !geometry || !material) continue;
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = source.name ?? `${node.name} edges`;
      lines.userData.catia = { kind: "CATIA edges", name: lines.name, sourcePath: source.sourcePath ?? node.sourcePath };
      group.add(lines);
    }
    for (const child of node.children) group.add(buildNode(child));
    return group;
  };

  const model = new THREE.Group();
  model.name = document.name;
  model.userData.catiaDocument = true;
  model.userData.catia = {
    kind: isV4 ? "CATIA V4 MODEL" : document.kind === "product" ? "CATIA assembly" : `CATIA ${document.kind}`,
    name: document.name,
    sourcePath: document.path,
    saveVersion: isV4 ? document.versionText ?? "CATIA V4" : document.saveVersion?.displayName,
    nativeName: document.nativeName,
    release: document.saveVersion?.release,
    servicePack: document.saveVersion?.servicePack,
    hotFix: document.saveVersion?.hotFix,
    byteLength: document.byteLength,
    references: document.externalReferences?.length ?? 0,
    diagnostics: scene.diagnostics.map((item) => `${item.code}: ${item.message}`),
  };
  for (const node of scene.nodes) model.add(buildNode(node));

  // CATIA's render scene is millimetre-based and Z-up. The viewer uses metres
  // and Y-up, matching the other native CAD adapters.
  model.scale.setScalar(0.001);
  model.rotation.x = -Math.PI / 2;
  return model;
}

export function disposeCatiaThreeGroup(model: any) {
  if (!model?.userData?.catiaDocument) return false;
  const geometries = new Set<any>();
  const materials = new Set<any>();
  model.traverse?.((object: any) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of objectMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  return true;
}
