import type { CadRuntime } from "../runtime";

type SolidEdgeBounds = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

type SolidEdgeRecord = {
  triangleCount: number;
};

type SolidEdgeMesh = {
  name: string;
  sourceStream: string;
  levelOfDetail: 0 | 1 | 2;
  positions: Float64Array;
  normals: Float32Array;
  textureCoordinates: Float32Array;
  indices: Uint32Array;
  bounds: SolidEdgeBounds;
  records: readonly SolidEdgeRecord[];
};

type SolidEdgeDocument = {
  kind: "part" | "sheet-metal" | "assembly" | "draft" | "unknown";
  path: string;
  rootClsid: string;
  meshes: readonly SolidEdgeMesh[];
  parasolidPayloads: readonly { stream: string; size: number; format: string; schema?: string; application?: string }[];
  diagnostics: readonly { severity: string; code: string; message: string; stream?: string }[];
  bounds?: SolidEdgeBounds;
  databaseLengthUnit: "m";
};

const PALETTE = [0x68aeb7, 0xd69752, 0x7da77a, 0xa98bc0, 0x9da9ad, 0xc8b96f];

function displayKind(kind: SolidEdgeDocument["kind"]) {
  return kind === "sheet-metal" ? "sheet-metal part" : kind;
}

export function createSolidEdgeThreeGroup(runtime: CadRuntime, document: SolidEdgeDocument, sourcePath: string) {
  const { THREE } = runtime;
  const model = new THREE.Group();
  const triangleCount = document.meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0);
  model.name = sourcePath.split(/[\\/]/).pop() || sourcePath;
  model.userData.solidEdgeDocument = true;
  model.userData.solidedge = {
    kind: `Solid Edge ${displayKind(document.kind)}`,
    name: model.name,
    sourcePath,
    storage: "Compound File Binary",
    rootClsid: document.rootClsid,
    unit: document.databaseLengthUnit,
    displayMeshes: document.meshes.length,
    triangles: triangleCount,
    parasolidPayloads: document.parasolidPayloads.length,
    parasolidFormats: [...new Set(document.parasolidPayloads.map((payload) => payload.format))],
    diagnostics: document.diagnostics.map((item) => `${item.code}: ${item.message}`),
  };

  for (let index = 0; index < document.meshes.length; index += 1) {
    const source = document.meshes[index];
    const geometry = new THREE.BufferGeometry();
    // Three.js uploads positions as 32-bit vertex attributes. Convert the
    // parser's high-precision model coordinates explicitly instead of relying
    // on an implicit WebGL conversion of Float64Array data.
    geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(source.positions), 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    if (source.normals.length === source.positions.length) geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    else geometry.computeVertexNormals();
    if (source.textureCoordinates.length === source.positions.length / 3 * 2) geometry.setAttribute("uv", new THREE.BufferAttribute(source.textureCoordinates, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: PALETTE[index % PALETTE.length],
      metalness: 0.08,
      roughness: 0.58,
      side: THREE.FrontSide,
    });
    material.name = "Solid Edge display material";

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = source.name || `Solid Edge body ${index + 1}`;
    mesh.userData.solidedge = {
      kind: "Solid Edge display body",
      name: mesh.name,
      sourcePath,
      sourceStream: source.sourceStream,
      levelOfDetail: source.levelOfDetail,
      records: source.records.length,
      triangles: source.indices.length / 3,
    };
    model.add(mesh);
  }

  // Solid Edge model space is metre-based and Z-up. The viewer uses metres
  // with Y up for native CAD sources.
  model.rotation.x = -Math.PI / 2;
  return model;
}

export function disposeSolidEdgeThreeGroup(model: any) {
  if (!model?.userData?.solidEdgeDocument) return false;
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
