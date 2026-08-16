import type { CadRuntime } from "../runtime";

type FusionDiagnostic = {
  severity: string;
  code: string;
  message: string;
  path?: string;
};

type FusionSceneFace = {
  geometry: string;
  nativeFace: number;
  nativeSurface: number;
  indexOffset: number;
  indexCount: number;
};

type FusionSceneMesh = {
  name: string;
  brepId: string;
  sourcePath: string;
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  color: readonly [number, number, number, number];
  faces: readonly FusionSceneFace[];
};

type FusionRenderScene = {
  units: "centimeter";
  meshes: readonly FusionSceneMesh[];
  triangleCount: number;
  diagnostics: readonly FusionDiagnostic[];
};

export function createFusionThreeGroup(runtime: CadRuntime, scene: FusionRenderScene, document: any, sourcePath = document.name) {
  const { THREE } = runtime;
  const model = new THREE.Group();
  model.name = document.name;
  model.userData.fusionDocument = true;
  model.userData.fusion = {
    kind: "Fusion design",
    name: document.name,
    sourcePath,
    version: document.manifest?.version,
    documentType: document.manifest?.documentType,
    description: document.manifest?.description,
    documentId: document.manifest?.documentId,
    assetId: document.manifest?.assetId,
    assetType: document.manifest?.assetType,
    breps: document.breps?.length ?? 0,
    designSegments: document.designSegments?.length ?? 0,
    triangles: scene.triangleCount,
    diagnostics: scene.diagnostics.map((item) => `${item.code}: ${item.message}`),
  };

  for (const source of scene.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    if (source.normals.length === source.positions.length) geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    else geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(source.color[0], source.color[1], source.color[2]),
      opacity: source.color[3],
      transparent: source.color[3] < 1,
      metalness: 0.08,
      roughness: 0.58,
      side: THREE.FrontSide,
    });
    material.name = "Fusion body material";

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = source.name;
    mesh.userData.fusion = {
      kind: "Fusion body",
      name: source.name,
      sourcePath: source.sourcePath,
      brepId: source.brepId,
      faces: source.faces.length,
      surfaceTypes: [...new Set(source.faces.map((face) => face.geometry))],
      triangles: source.indices.length / 3,
    };
    model.add(mesh);
  }

  // Fusion ShapeManager data is stored in centimetres with Z as the vertical
  // axis. Match the viewer's metre-based, Y-up scene used by native CAD files.
  model.scale.setScalar(0.01);
  model.rotation.x = -Math.PI / 2;
  return model;
}

export function disposeFusionThreeGroup(model: any) {
  if (!model?.userData?.fusionDocument) return false;
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
