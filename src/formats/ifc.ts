import type { CadRuntime } from "../runtime";

let ifcModulePromise: Promise<any> | undefined;
let ifcApiPromise: Promise<any> | undefined;

function loadIfcModule() {
  ifcModulePromise ??= import("web-ifc");
  return ifcModulePromise;
}

async function loadIfcApi() {
  ifcApiPromise ??= loadIfcModule().then(async ({ IfcAPI }) => {
    const api = new IfcAPI();
    const wasmUrl = new URL(`${import.meta.env.BASE_URL}vendor/web-ifc/web-ifc.wasm`, window.location.href);
    await api.Init((path: string) => path.endsWith(".wasm") ? wasmUrl.href : path, true);
    return api;
  });
  return ifcApiPromise;
}

function ifcValue(value: any) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export async function loadIfcModel(runtime: CadRuntime, file: File, onProgress?: (status: string, progress: number) => void) {
  const { THREE } = runtime;
  onProgress?.("Loading IFC engine…", 44);
  const api = await loadIfcApi();
  onProgress?.("Reading IFC model…", 56);
  const modelID = api.OpenModel(new Uint8Array(await file.arrayBuffer()), { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0) throw new Error("web-ifc could not open this IFC file.");

  const group = new THREE.Group();
  group.name = file.name;
  group.userData.inventor = { kind: "IFC building model", schema: api.GetModelSchema(modelID) };
  const materials = new Map<string, any>();
  let flatMeshes: any;

  try {
    onProgress?.("Tessellating IFC elements…", 68);
    flatMeshes = api.LoadAllGeometry(modelID);
    for (let meshIndex = 0; meshIndex < flatMeshes.size(); meshIndex += 1) {
      const flatMesh = flatMeshes.get(meshIndex);
      const element = new THREE.Group();
      let line: any;
      try { line = api.GetLine(modelID, flatMesh.expressID); } catch { line = undefined; }
      const type = line?.type ? api.GetNameFromTypeCode(line.type) : "IFC element";
      element.name = String(ifcValue(line?.Name) || ifcValue(line?.ObjectType) || `${type} ${flatMesh.expressID}`);
      element.userData.inventor = {
        kind: type,
        expressId: flatMesh.expressID,
        globalId: ifcValue(line?.GlobalId),
        description: ifcValue(line?.Description),
        tag: ifcValue(line?.Tag),
      };

      for (let geometryIndex = 0; geometryIndex < flatMesh.geometries.size(); geometryIndex += 1) {
        const placed = flatMesh.geometries.get(geometryIndex);
        const ifcGeometry = api.GetGeometry(modelID, placed.geometryExpressID);
        try {
          const sourceVertices = api.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
          const sourceIndices = api.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize());
          const positions = new Float32Array(sourceVertices.length / 2);
          const normals = new Float32Array(sourceVertices.length / 2);
          for (let source = 0, target = 0; source < sourceVertices.length; source += 6, target += 3) {
            positions[target] = sourceVertices[source];
            positions[target + 1] = sourceVertices[source + 1];
            positions[target + 2] = sourceVertices[source + 2];
            normals[target] = sourceVertices[source + 3];
            normals[target + 1] = sourceVertices[source + 4];
            normals[target + 2] = sourceVertices[source + 5];
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(sourceIndices), 1));

          const rgba = placed.color;
          const key = [rgba.x, rgba.y, rgba.z, rgba.w].map((value: number) => value.toFixed(5)).join(",");
          let material = materials.get(key);
          if (!material) {
            material = new THREE.MeshStandardMaterial({
              color: new THREE.Color(rgba.x, rgba.y, rgba.z),
              opacity: rgba.w,
              transparent: rgba.w < 1,
              depthWrite: rgba.w >= 1,
              roughness: 0.78,
              metalness: 0.04,
              side: THREE.DoubleSide,
            });
            materials.set(key, material);
          }
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = element.name;
          mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
          element.add(mesh);
        } finally {
          ifcGeometry.delete?.();
        }
      }
      if (element.children.length) group.add(element);
      flatMesh.delete?.();
    }
    if (!group.children.length) throw new Error("The IFC file contains no displayable geometry.");
    onProgress?.("Building IFC scene…", 82);
    return group;
  } finally {
    try { flatMeshes?.delete?.(); } catch { /* Some web-ifc vector builds do not expose delete. */ }
    api.CloseModel(modelID);
  }
}
