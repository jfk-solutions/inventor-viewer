import type { CadRuntime } from "../runtime";

type DotBimColor = { r?: number; g?: number; b?: number; a?: number };
type DotBimMesh = { mesh_id: number | string; coordinates: number[]; indices: number[] };
type DotBimElement = {
  mesh_id: number | string;
  type?: string;
  guid?: string;
  color?: DotBimColor;
  face_colors?: number[];
  vector?: { x?: number; y?: number; z?: number };
  rotation?: { qx?: number; qy?: number; qz?: number; qw?: number };
  info?: Record<string, unknown>;
};

type DotBimDocument = { schema_version?: string; meshes?: DotBimMesh[]; elements?: DotBimElement[]; info?: Record<string, unknown> };

function byte(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(255, number)) : fallback;
}

function rgba(color?: DotBimColor): [number, number, number, number] {
  return [byte(color?.r, 145), byte(color?.g, 161), byte(color?.b, 166), byte(color?.a, 255)];
}

function materialFor(runtime: CadRuntime, color: [number, number, number, number]) {
  const { THREE } = runtime;
  const opacity = color[3] / 255;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
    opacity,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    roughness: 0.78,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
}

export async function loadBimModel(runtime: CadRuntime, file: File) {
  const { THREE } = runtime;
  let document: DotBimDocument;
  try {
    document = JSON.parse(await file.text());
  } catch {
    throw new Error("The DotBIM JSON is invalid.");
  }
  const sourceMeshes = new Map((document.meshes ?? []).map((mesh) => [String(mesh.mesh_id), mesh]));
  const group = new THREE.Group();
  group.name = file.name;
  group.userData.inventor = { kind: "DotBIM model", schemaVersion: document.schema_version, ...(document.info ?? {}) };

  for (const [elementIndex, element] of (document.elements ?? []).entries()) {
    const source = sourceMeshes.get(String(element.mesh_id));
    if (!source || source.coordinates.length < 9 || source.indices.length < 3) continue;
    if (source.coordinates.some((value) => !Number.isFinite(value)) || source.indices.some((value) => !Number.isSafeInteger(value))) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(source.coordinates, 3));
    geometry.setIndex(source.indices);
    geometry.computeVertexNormals();

    let materials: any;
    const faceColors = element.face_colors;
    if (faceColors && faceColors.length >= Math.floor(source.indices.length / 3) * 4) {
      const cache = new Map<string, number>();
      const values: any[] = [];
      for (let triangle = 0; triangle < Math.floor(source.indices.length / 3); triangle += 1) {
        const color = [
          byte(faceColors[triangle * 4], 145),
          byte(faceColors[triangle * 4 + 1], 161),
          byte(faceColors[triangle * 4 + 2], 166),
          byte(faceColors[triangle * 4 + 3], 255),
        ] as [number, number, number, number];
        const key = color.join(",");
        let materialIndex = cache.get(key);
        if (materialIndex === undefined) {
          materialIndex = values.length;
          cache.set(key, materialIndex);
          values.push(materialFor(runtime, color));
        }
        geometry.addGroup(triangle * 3, 3, materialIndex);
      }
      materials = values;
    } else {
      materials = materialFor(runtime, rgba(element.color));
    }

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = element.type || element.guid || `Element ${elementIndex + 1}`;
    mesh.position.set(Number(element.vector?.x ?? 0), Number(element.vector?.y ?? 0), Number(element.vector?.z ?? 0));
    mesh.quaternion.set(
      Number(element.rotation?.qx ?? 0),
      Number(element.rotation?.qy ?? 0),
      Number(element.rotation?.qz ?? 0),
      Number(element.rotation?.qw ?? 1),
    );
    mesh.userData.inventor = {
      kind: element.type || "DotBIM element",
      guid: element.guid,
      meshId: element.mesh_id,
      ...(element.info ?? {}),
    };
    group.add(mesh);
  }
  if (!group.children.length) throw new Error("The DotBIM file contains no displayable elements.");
  return group;
}
