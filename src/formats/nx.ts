import type { CadRuntime } from "../runtime";

type NxDiagnostic = { code: string; message: string; path?: string };

type NxMesh = {
  name: string;
  positions: Float32Array;
  normals?: Float32Array;
  colors?: Float32Array;
  indices: Uint32Array;
  faceGroups?: Uint32Array;
};

type NxDocument = {
  kind: "part" | "assembly" | "drawing" | "unknown";
  name: string;
  nxContainerVersion: string;
  jtVersion?: string;
  unit: "m";
  meshes: readonly NxMesh[];
  references: readonly string[];
  streams: readonly string[];
  preview?: { mediaType: "image/png" | "image/jpeg" | "image/bmp"; bytes: Uint8Array };
  diagnostics: readonly NxDiagnostic[];
};

const PALETTE = [0x68aeb7, 0xd69752, 0x7da77a, 0xa98bc0, 0x9da9ad, 0xc8b96f];

export async function createNxThreeGroup(runtime: CadRuntime, document: NxDocument, sourcePath: string) {
  const { THREE } = runtime;
  const model = new THREE.Group();
  const triangleCount = document.meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0);
  model.name = document.name || sourcePath.split(/[\\/]/).pop() || sourcePath;
  model.userData.nxDocument = true;
  model.userData.nx = {
    kind: `Siemens NX ${document.kind}`,
    name: document.name,
    sourcePath,
    containerVersion: document.nxContainerVersion,
    jtVersion: document.jtVersion,
    unit: document.unit,
    meshes: document.meshes.length,
    triangles: triangleCount,
    references: document.references,
    streams: document.streams.length,
    diagnostics: document.diagnostics.map((item) => `${item.code}: ${item.message}`),
  };

  for (let index = 0; index < document.meshes.length; index += 1) {
    const source = document.meshes[index];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    if (source.normals?.length === source.positions.length) geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    else geometry.computeVertexNormals();
    const hasVertexColors = source.colors?.length === source.positions.length;
    if (hasVertexColors) geometry.setAttribute("color", new THREE.BufferAttribute(source.colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: hasVertexColors ? 0xffffff : PALETTE[index % PALETTE.length],
      vertexColors: hasVertexColors,
      metalness: 0.08,
      roughness: 0.58,
      side: THREE.FrontSide,
    });
    material.name = "Siemens NX display material";

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = source.name || `NX body ${index + 1}`;
    mesh.userData.nx = {
      kind: "Siemens NX body",
      name: mesh.name,
      sourcePath,
      triangles: source.indices.length / 3,
      faceGroups: source.faceGroups ? new Set(source.faceGroups).size : 0,
    };
    model.add(mesh);
  }

  const objectUrls: string[] = [];
  if (!triangleCount && document.preview) {
    const previewBytes = new Uint8Array(document.preview.bytes.byteLength);
    previewBytes.set(document.preview.bytes);
    const objectUrl = URL.createObjectURL(new Blob([previewBytes.buffer], { type: document.preview.mediaType }));
    objectUrls.push(objectUrl);
    try {
      const texture = await new THREE.TextureLoader().loadAsync(objectUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const width = Number(texture.image?.naturalWidth ?? texture.image?.width ?? 1);
      const height = Number(texture.image?.naturalHeight ?? texture.image?.height ?? 1);
      const geometry = new THREE.PlaneGeometry(Math.max(width / Math.max(height, 1), 0.01), 1);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true });
      const preview = new THREE.Mesh(geometry, material);
      preview.name = `${model.name} saved preview`;
      preview.userData.nx = { kind: "Siemens NX saved preview", sourcePath, width, height };
      model.userData.nxPreviewTexture = texture;
      model.add(preview);
    } catch (cause) {
      URL.revokeObjectURL(objectUrl);
      throw cause;
    }
  }

  // NX/JT geometry is metre-based and Z-up. Rotate it into the viewer's
  // metre-based, Y-up scene without changing its native scale.
  model.rotation.x = -Math.PI / 2;
  return { model, objectUrls };
}

export function disposeNxThreeGroup(model: any) {
  if (!model?.userData?.nxDocument) return false;
  const geometries = new Set<any>();
  const materials = new Set<any>();
  model.traverse?.((object: any) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of objectMaterials) materials.add(material);
  });
  model.userData.nxPreviewTexture?.dispose?.();
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  return true;
}
