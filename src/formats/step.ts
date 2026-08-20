import type { CadRuntime } from "../runtime";
import { CAD_RUNTIME_VERSION } from "../runtime-version";

type CadLoadProgress = (status: string, progress: number) => void;
type OcctFormat = "iges" | "brep";

type StepDiagnostic = {
  severity: "warning" | "error";
  code: string;
  message: string;
  entityId?: number;
};

type StepRenderMesh = {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  color: readonly [number, number, number, number];
};

type StepRenderNode = {
  name: string;
  meshIndices: readonly number[];
  children: readonly StepRenderNode[];
  sourceRepresentationId?: number;
  sourceRelationshipId?: number;
};

type StepRenderScene = {
  unit: "millimeter";
  sourceUnitScaleToMillimeter: number;
  meshes: readonly StepRenderMesh[];
  nodes: readonly StepRenderNode[];
  diagnostics: readonly StepDiagnostic[];
  statistics: {
    sourceEntities: number;
    totalFaces: number;
    renderedFaces: number;
    skippedFaces: number;
    triangles: number;
  };
};

type PendingOcctLoad = {
  resolve: (output: ArrayBuffer) => void;
  reject: (error: Error) => void;
  onProgress?: CadLoadProgress;
};

type OcctWorkerResponse =
  | { type: "progress"; id: number; status: string; progress: number }
  | { type: "result"; id: number; output: ArrayBuffer; timings: Record<string, number> }
  | { type: "error"; id: number; message: string; stack?: string };

type StepWorkerResponse =
  | { type: "progress"; progress: { phase: "parse"; fraction: number; entities: number } | { phase: "tessellate"; fraction: number; completedFaces: number; totalFaces: number } }
  | { type: "complete"; scene: StepRenderScene }
  | { type: "error"; name: string; message: string; stack?: string };

let nextRequestId = 0;
let occtWorker: Worker | undefined;
const pendingOcctLoads = new Map<number, PendingOcctLoad>();

function extension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function rejectPending<T extends { reject: (error: Error) => void }>(pending: Map<number, T>, error: Error) {
  for (const load of pending.values()) load.reject(error);
  pending.clear();
}

function workerError(message: { message: string; stack?: string }) {
  const error = new Error(message.message);
  if (message.stack) error.stack = message.stack;
  return error;
}

function getOcctWorker() {
  if (occtWorker) return occtWorker;
  const worker = new Worker(new URL("./occt.worker.ts", import.meta.url), { type: "module", name: "cad-viewer-open-cascade" });
  worker.addEventListener("message", (event: MessageEvent<OcctWorkerResponse>) => {
    const message = event.data;
    const pending = pendingOcctLoads.get(message.id);
    if (!pending) return;
    if (message.type === "progress") {
      pending.onProgress?.(message.status, message.progress);
      return;
    }
    pendingOcctLoads.delete(message.id);
    if (message.type === "result") {
      console.debug("OpenCascade load timings (ms)", JSON.stringify(message.timings));
      pending.resolve(message.output);
    } else pending.reject(workerError(message));
  });
  worker.addEventListener("error", (event) => {
    rejectPending(pendingOcctLoads, new Error(event.message || "The OpenCascade worker stopped unexpectedly."));
    worker.terminate();
    if (occtWorker === worker) occtWorker = undefined;
  });
  occtWorker = worker;
  return worker;
}

function createStepWorker() {
  const url = new URL(`${import.meta.env.BASE_URL}vendor/step-file-format.worker.min.js`, window.location.href);
  url.searchParams.set("v", CAD_RUNTIME_VERSION);
  return new Worker(url, { type: "module", name: "cad-viewer-step-file-format" });
}

async function convertWithOcct(file: File, format: OcctFormat, onProgress?: CadLoadProgress) {
  const id = nextRequestId++;
  const input = await file.arrayBuffer();
  const moduleUrl = new URL(`${import.meta.env.BASE_URL}vendor/opencascade/opencascade.full.js`, window.location.href).href;
  const wasmUrl = new URL(`${import.meta.env.BASE_URL}vendor/opencascade/opencascade.full.wasm`, window.location.href).href;
  const result = new Promise<ArrayBuffer>((resolve, reject) => {
    pendingOcctLoads.set(id, { resolve, reject, onProgress });
  });
  try {
    getOcctWorker().postMessage({ type: "load", id, format, input, moduleUrl, wasmUrl }, [input]);
  } catch (error) {
    pendingOcctLoads.delete(id);
    throw error;
  }
  return result;
}

async function parseStep(file: File, onProgress?: CadLoadProgress) {
  const input = await file.arrayBuffer();
  const largeFile = input.byteLength >= 8 * 1024 * 1024;
  const worker = createStepWorker();
  const started = performance.now();
  return new Promise<StepRenderScene>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      action();
    };
    worker.onmessage = (event: MessageEvent<StepWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        const progress = message.progress;
        if (progress.phase === "parse") {
          onProgress?.(`Parsing ${progress.entities.toLocaleString()} STEP entities…`, 44 + Math.min(1, progress.fraction) * 18);
        } else {
          onProgress?.(`Tessellating ${progress.completedFaces.toLocaleString()} / ${progress.totalFaces.toLocaleString()} STEP faces…`, 64 + Math.min(1, progress.fraction) * 28);
        }
      } else if (message.type === "complete") {
        if (!message.scene.meshes.length) {
          const detail = message.scene.diagnostics[0]?.message;
          finish(() => reject(new Error(detail ? `STEP contains no renderable faces: ${detail}` : "STEP contains no renderable faces.")));
          return;
        }
        console.debug(`STEP load timing (ms) ${(performance.now() - started).toFixed(1)}`);
        finish(() => resolve(message.scene));
      } else {
        const error = workerError(message);
        error.name = message.name;
        finish(() => reject(error));
      }
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || "The STEP worker stopped unexpectedly.")));
    try {
      worker.postMessage({
        type: "load",
        bytes: input,
        parse: { progressInterval: 2_000 },
        tessellation: {
          curveSegments: largeFile ? 20 : 32,
          surfaceSegments: largeFile ? 12 : 24,
          subdivisionDepth: largeFile ? 0 : 1,
        },
      }, [input]);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function createStepModel(runtime: CadRuntime, scene: StepRenderScene, fileName: string) {
  const { THREE } = runtime;
  const model = new THREE.Group();
  model.name = fileName;
  model.userData.inventor = {
    kind: "STEP model",
    sourcePath: fileName,
    parser: "step-file-format",
    sourceUnit: scene.unit,
    sourceUnitScaleToMillimeter: scene.sourceUnitScaleToMillimeter,
    entities: scene.statistics.sourceEntities,
    faces: `${scene.statistics.renderedFaces.toLocaleString()} / ${scene.statistics.totalFaces.toLocaleString()}`,
    triangles: scene.statistics.triangles,
    skippedFaces: scene.statistics.skippedFaces,
    diagnostics: scene.diagnostics.map((item) => `${item.code}${item.entityId == null ? "" : ` #${item.entityId}`}: ${item.message}`),
  };

  const materials = new Map<string, any>();
  const meshes = scene.meshes.map((source) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const materialKey = source.color.join(",");
    let material = materials.get(materialKey);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(source.color[0], source.color[1], source.color[2]),
        opacity: source.color[3],
        transparent: source.color[3] < 1,
        metalness: 0.04,
        roughness: 0.68,
        side: THREE.FrontSide,
      });
      material.name = "STEP surface material";
      materials.set(materialKey, material);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = source.name || "STEP body";
    mesh.userData.inventor = {
      kind: "STEP body",
      sourcePath: fileName,
      triangles: source.indices.length / 3,
    };
    return mesh;
  });

  const claimedMeshes = new Set<number>();
  const createNode = (source: StepRenderNode): any => {
    const node = new THREE.Group();
    node.name = source.name || "STEP occurrence";
    node.userData.inventor = {
      kind: source.children.length ? "STEP assembly" : "STEP occurrence",
      name: node.name,
      sourcePath: fileName,
      ...(source.sourceRepresentationId === undefined ? {} : { representationId: source.sourceRepresentationId }),
      ...(source.sourceRelationshipId === undefined ? {} : { relationshipId: source.sourceRelationshipId }),
    };
    for (const meshIndex of source.meshIndices) {
      const mesh = meshes[meshIndex];
      if (!mesh || claimedMeshes.has(meshIndex)) continue;
      claimedMeshes.add(meshIndex);
      node.add(mesh);
    }
    for (const child of source.children) node.add(createNode(child));
    return node;
  };
  for (const node of scene.nodes) model.add(createNode(node));
  for (let index = 0; index < meshes.length; index += 1) {
    if (!claimedMeshes.has(index)) model.add(meshes[index]);
  }

  // step-file-format returns millimetres in the STEP model's conventional
  // Z-up coordinates. The viewer's native model space is metres with Y up.
  model.scale.setScalar(0.001);
  model.rotation.x = -Math.PI / 2;
  return model;
}

/** Reads STEP natively, while IGES and OpenCascade BREP retain the lazy CAD kernel. */
export async function loadOcctModel(
  runtime: CadRuntime,
  file: File,
  manager: any,
  onProgress?: CadLoadProgress,
) {
  const format = extension(file.name);
  if (format === "step" || format === "stp") {
    onProgress?.("Preparing STEP file…", 42);
    const scene = await parseStep(file, onProgress);
    onProgress?.("Preparing STEP display…", 94);
    return { model: createStepModel(runtime, scene, file.name), animations: [] };
  }

  const occtFormat = format === "iges" || format === "igs" ? "iges" : format === "brep" || format === "brp" ? "brep" : undefined;
  if (!occtFormat) throw new Error(`No CAD exchange loader is registered for .${format || "unknown"}.`);
  const displayName = occtFormat === "iges" ? "IGES" : "BREP";
  onProgress?.(`Preparing ${displayName} file…`, 42);
  const glb = await convertWithOcct(file, occtFormat, onProgress);
  onProgress?.(`Preparing ${displayName} display…`, 94);
  const loader = new runtime.GLTFLoader(manager);
  loader.setMeshoptDecoder(runtime.MeshoptDecoder);
  const result = await loader.parseAsync(glb, "");
  return { model: result.scene, animations: result.animations ?? [] };
}

export function loadStepModel(runtime: CadRuntime, file: File, manager: any, onProgress?: CadLoadProgress) {
  return loadOcctModel(runtime, file, manager, onProgress);
}
