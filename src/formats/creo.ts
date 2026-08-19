import type { CadRuntime } from "../runtime";

type CreoScene = {
  unit: "mm" | "cm" | "m" | "inch" | "unknown";
  upAxis: "x" | "y" | "z";
  nodes: CreoNode[];
  meshes: CreoMesh[];
  materials: CreoMaterial[];
  lineSets: CreoLineSet[];
};

type CreoNode = {
  name: string;
  transform: readonly number[];
  visible: boolean;
  meshIndices: readonly number[];
  lineSetIndices: readonly number[];
  children: readonly CreoNode[];
  sourcePath?: string;
};

type CreoMesh = {
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  colors?: Float32Array;
  materialIndex?: number;
  sourceSection?: string;
};

type CreoMaterial = {
  name?: string;
  color: readonly [number, number, number, number];
  metallic?: number;
  roughness?: number;
  doubleSided?: boolean;
};

type CreoLineSet = {
  name?: string;
  positions: Float32Array;
  color: readonly [number, number, number, number];
};

const FALLBACK_COLORS = [0x68aeb7, 0xd69752, 0x7da77a, 0xa98bc0, 0x9da9ad, 0xc8b96f];

function unitScale(unit: CreoScene["unit"]) {
  return unit === "mm" ? 0.001 : unit === "cm" ? 0.01 : unit === "inch" ? 0.0254 : 1;
}

function nodeMetadata(node: CreoNode, sourcePath: string) {
  return {
    kind: node.children.length ? "Creo assembly" : node.meshIndices.length ? "Creo body" : "Creo node",
    name: node.name,
    sourcePath: node.sourcePath ?? sourcePath,
    meshes: node.meshIndices.length,
    lineSets: node.lineSetIndices.length,
  };
}

export async function createCreoThreeGroup(runtime: CadRuntime, scene: CreoScene, document: any, sourcePath: string) {
  const { THREE } = runtime;
  const materials = scene.materials.map((source, index) => {
    const color = source.color ?? [1, 1, 1, 1];
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      opacity: color[3],
      transparent: color[3] < 1,
      metalness: source.metallic ?? 0.08,
      roughness: source.roughness ?? 0.58,
      side: source.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    material.name = source.name ?? `Creo material ${index + 1}`;
    return material;
  });
  const fallbackMaterials = new Map<number, any>();
  const meshGeometries = scene.meshes.map((source) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    if (source.normals?.length === source.positions.length) geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    else geometry.computeVertexNormals();
    const vertexCount = source.positions.length / 3;
    const colorSize = source.colors && vertexCount ? source.colors.length / vertexCount : 0;
    if (source.colors && (colorSize === 3 || colorSize === 4)) geometry.setAttribute("color", new THREE.BufferAttribute(source.colors, colorSize));
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

  const buildNode = (node: CreoNode): any => {
    const group = new THREE.Group();
    group.name = node.name;
    group.visible = node.visible;
    group.userData.creo = nodeMetadata(node, sourcePath);
    if (node.transform.length === 16 && node.transform.every(Number.isFinite)) {
      group.matrix.fromArray(node.transform);
      group.matrix.decompose(group.position, group.quaternion, group.scale);
    }
    for (const index of node.meshIndices) {
      const source = scene.meshes[index];
      const geometry = meshGeometries[index];
      if (!source || !geometry) continue;
      let material = materials[source.materialIndex ?? 0];
      if (!material) {
        material = fallbackMaterials.get(index);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color: FALLBACK_COLORS[index % FALLBACK_COLORS.length], metalness: 0.08, roughness: 0.58 });
          material.name = "Creo display material";
          fallbackMaterials.set(index, material);
        }
      }
      if (geometry.attributes.color) {
        material = material.clone();
        material.color.set(0xffffff);
        material.vertexColors = true;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = source.name || `${node.name} body`;
      mesh.userData.creo = {
        kind: "Creo mesh",
        name: mesh.name,
        sourcePath: node.sourcePath ?? sourcePath,
        sourceSection: source.sourceSection,
        triangles: source.indices.length / 3,
      };
      group.add(mesh);
    }
    for (const index of node.lineSetIndices) {
      const source = scene.lineSets[index];
      const geometry = lineGeometries[index];
      const material = lineMaterials[index];
      if (!source || !geometry || !material) continue;
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = source.name ?? `${node.name} edges`;
      lines.userData.creo = { kind: "Creo edges", name: lines.name, sourcePath: node.sourcePath ?? sourcePath };
      group.add(lines);
    }
    for (const child of node.children) group.add(buildNode(child));
    return group;
  };

  const model = new THREE.Group();
  model.name = document.name || sourcePath.split(/[\\/]/).pop() || sourcePath;
  model.userData.creoDocument = true;
  model.userData.creo = {
    kind: `Creo ${document.kind}`,
    name: document.name,
    sourcePath,
    productVersion: document.productVersion,
    formatVersion: document.formatVersion,
    layout: document.layout,
    unit: scene.unit,
    meshes: scene.meshes.length,
    triangles: scene.meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0),
    references: document.references,
    sections: document.sections?.length ?? 0,
    diagnostics: document.diagnostics?.map((item: any) => `${item.code}: ${item.message}`) ?? [],
  };

  const geometryRoot = new THREE.Group();
  geometryRoot.name = `${model.name} geometry`;
  geometryRoot.scale.setScalar(unitScale(scene.unit));
  if (scene.upAxis === "z") geometryRoot.rotation.x = -Math.PI / 2;
  else if (scene.upAxis === "x") geometryRoot.rotation.z = Math.PI / 2;
  for (const node of scene.nodes) geometryRoot.add(buildNode(node));
  model.add(geometryRoot);

  const objectUrls: string[] = [];
  const hasGeometry = scene.meshes.some((mesh) => mesh.indices.length) || scene.lineSets.some((lines) => lines.positions.length);
  const previewImage = !hasGeometry ? document.images?.[0] : undefined;
  if (previewImage) {
    const bytes = new Uint8Array(previewImage.bytes.byteLength);
    bytes.set(previewImage.bytes);
    const objectUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: previewImage.mediaType }));
    objectUrls.push(objectUrl);
    try {
      const texture = await new THREE.TextureLoader().loadAsync(objectUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const width = Number(texture.image?.naturalWidth ?? texture.image?.width ?? previewImage.width ?? 1);
      const height = Number(texture.image?.naturalHeight ?? texture.image?.height ?? previewImage.height ?? 1);
      const preview = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(width / Math.max(height, 1), 0.01), 1),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true }),
      );
      preview.name = `${model.name} saved preview`;
      preview.userData.creo = { kind: "Creo saved preview", name: previewImage.name, sourcePath, width, height };
      model.userData.creoPreviewTexture = texture;
      model.add(preview);
    } catch (cause) {
      URL.revokeObjectURL(objectUrl);
      throw cause;
    }
  }

  return { model, objectUrls };
}

export function disposeCreoThreeGroup(model: any) {
  if (!model?.userData?.creoDocument) return false;
  const geometries = new Set<any>();
  const materials = new Set<any>();
  model.traverse?.((object: any) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of objectMaterials) materials.add(material);
  });
  model.userData.creoPreviewTexture?.dispose?.();
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  return true;
}
