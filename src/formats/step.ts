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
  indices: Uint16Array | Uint32Array;
  color: readonly [number, number, number, number];
  material?: StepRenderMaterial;
  backColor?: readonly [number, number, number, number];
  backMaterial?: StepRenderMaterial | null;
};

type StepRenderMaterial = {
  shading?: "flat" | "smooth";
  ambient?: number;
  diffuse?: number;
  specular?: number;
  shininess?: number;
  specularColor?: readonly [number, number, number];
};

type StepRenderPolyline = {
  name: string;
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  color: readonly [number, number, number, number];
  width?: number;
  pattern?: readonly number[];
};

type StepRenderPointSet = {
  name: string;
  positions: Float32Array;
  color: readonly [number, number, number, number];
  marker: "dot" | "x" | "plus" | "asterisk" | "ring" | "square" | "triangle";
  size: number;
};

type StepRenderText = {
  name: string;
  text: string;
  origin: readonly [number, number, number];
  xAxis: readonly [number, number, number];
  yAxis: readonly [number, number, number];
  color: readonly [number, number, number, number];
  height: number;
  characterWidth: number;
  alignment: string;
  path: "right" | "left" | "up" | "down";
  font?: string;
};

type StepRenderView = {
  name: string;
  isDefault?: boolean;
  projection: "parallel" | "central";
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  up: readonly [number, number, number];
  viewWindowWidth: number;
  viewWindowHeight: number;
  viewPlaneDistance: number;
  frontPlaneDistance?: number;
  backPlaneDistance?: number;
  sideClipping: boolean;
  hiddenLineSurfaceRemoval?: boolean;
  backgroundColor?: readonly [number, number, number];
  sourceEntityId: number;
  sourceRepresentationIds: readonly number[];
  meshIndices: readonly number[];
  polylineIndices: readonly number[];
  pointSetIndices: readonly number[];
  textIndices: readonly number[];
};

type StepRenderNode = {
  name: string;
  meshIndices: readonly number[];
  polylineIndices: readonly number[];
  pointSetIndices: readonly number[];
  textIndices: readonly number[];
  children: readonly StepRenderNode[];
  sourceRepresentationId?: number;
  sourceSemanticIds?: readonly number[];
  sourceRelationshipId?: number;
  sourceMappedItemId?: number;
};

type StepRenderScene = {
  unit: "millimeter";
  sourceUnitScaleToMillimeter: number;
  meshes: readonly StepRenderMesh[];
  polylines: readonly StepRenderPolyline[];
  pointSets: readonly StepRenderPointSet[];
  texts: readonly StepRenderText[];
  views: readonly StepRenderView[];
  nodes: readonly StepRenderNode[];
  diagnostics: readonly StepDiagnostic[];
  statistics: {
    sourceEntities: number;
    totalFaces: number;
    renderedFaces: number;
    skippedFaces: number;
    triangles: number;
    lineSegments: number;
    points?: number;
    texts?: number;
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

async function parseStep(file: File, onProgress?: CadLoadProgress, selectedFiles: readonly File[] = [file]) {
  const selected = file as File & { webkitRelativePath?: string; stepContainerName?: string };
  const catalogFiles = selectedFiles.filter((candidate) => ["step", "stp", "zip"].includes(extension(candidate.name)));
  const useCatalog = Boolean(selected.stepContainerName || catalogFiles.some((candidate) => extension(candidate.name) === "zip") || catalogFiles.length > 1);
  const input = useCatalog ? undefined : await file.arrayBuffer();
  const largeFile = file.size >= 8 * 1024 * 1024;
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
        const primitiveCount = message.scene.meshes.length + message.scene.polylines.length + message.scene.pointSets.length + message.scene.texts.length;
        if (!primitiveCount) {
          const detail = message.scene.diagnostics[0]?.message;
          finish(() => reject(new Error(detail ? `STEP contains no renderable geometry: ${detail}` : "STEP contains no renderable geometry.")));
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
      const tessellation = {
        curveSegments: largeFile ? 20 : 32,
        surfaceSegments: largeFile ? 12 : 24,
        subdivisionDepth: largeFile ? 0 : 1,
        geometryCacheSize: 65_536,
      };
      if (useCatalog) {
        onProgress?.("Cataloging STEP files and external references…", 43);
        worker.postMessage({
          type: "catalog",
          inputs: catalogFiles.map((candidate) => ({
            file: candidate,
            path: (candidate as File & { webkitRelativePath?: string }).webkitRelativePath || candidate.name,
          })),
          selectedPath: selected.webkitRelativePath || file.name,
          selectedName: file.name,
          selectedContainerName: selected.stepContainerName,
          parse: { progressInterval: 2_000 },
          tessellation,
        });
      } else {
        worker.postMessage({
          type: "load",
          bytes: input,
          parse: { progressInterval: 2_000 },
          tessellation,
        }, [input!]);
      }
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
    lineSegments: scene.statistics.lineSegments,
    points: scene.statistics.points ?? 0,
    texts: scene.statistics.texts ?? 0,
    savedViews: scene.views.map((view) => `${view.isDefault ? "Default: " : ""}${view.name}`),
    skippedFaces: scene.statistics.skippedFaces,
    diagnostics: scene.diagnostics.map((item) => `${item.code}${item.entityId == null ? "" : ` #${item.entityId}`}: ${item.message}`),
  };

  model.userData.stepViews = scene.views;

  const materials = new Map<string, any>();
  const surfaceMaterial = (
    color: readonly [number, number, number, number],
    appearance: StepRenderMaterial | null | undefined,
    side: number,
  ) => {
    const materialKey = JSON.stringify([color, appearance, side]);
    let material = materials.get(materialKey);
    if (material) return material;
    const specular = appearance?.specularColor ?? [appearance?.specular ?? 0.18, appearance?.specular ?? 0.18, appearance?.specular ?? 0.18];
    material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      opacity: color[3],
      transparent: color[3] < 1,
      flatShading: appearance?.shading === "flat",
      shininess: appearance?.shininess ?? 24,
      specular: new THREE.Color(specular[0], specular[1], specular[2]),
      side,
    });
    material.name = "STEP surface material";
    materials.set(materialKey, material);
    return material;
  };

  const meshes = scene.meshes.map((source) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const frontMaterial = surfaceMaterial(source.color, source.material, THREE.FrontSide);
    const meshMaterials = source.backColor
      ? [frontMaterial, surfaceMaterial(source.backColor, source.backMaterial, THREE.BackSide)]
      : frontMaterial;
    if (Array.isArray(meshMaterials)) {
      geometry.addGroup(0, source.indices.length, 0);
      geometry.addGroup(0, source.indices.length, 1);
    }

    const mesh = new THREE.Mesh(geometry, meshMaterials);
    mesh.name = source.name || "STEP body";
    mesh.userData.inventor = {
      kind: "STEP body",
      sourcePath: fileName,
      triangles: source.indices.length / 3,
    };
    return mesh;
  });

  const lineMaterials = new Map<string, any>();
  const polylines = scene.polylines.map((source) => {
    const geometry = new THREE.BufferGeometry();
    const dashed = Boolean(source.pattern?.length);
    if (dashed) {
      const positions = new Float32Array(source.indices.length * 3);
      source.indices.forEach((sourceIndex, destinationIndex) => {
        positions[destinationIndex * 3] = source.positions[sourceIndex * 3] ?? 0;
        positions[destinationIndex * 3 + 1] = source.positions[sourceIndex * 3 + 1] ?? 0;
        positions[destinationIndex * 3 + 2] = source.positions[sourceIndex * 3 + 2] ?? 0;
      });
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    } else {
      geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const materialKey = JSON.stringify([source.color, source.width, source.pattern]);
    let material = lineMaterials.get(materialKey);
    if (!material) {
      const shared = {
        color: new THREE.Color(source.color[0], source.color[1], source.color[2]),
        opacity: source.color[3],
        transparent: source.color[3] < 1,
        linewidth: source.width ?? 1,
      };
      const dashSize = source.pattern?.filter((_, index) => index % 2 === 0).reduce((sum, value) => sum + value, 0) ?? 0;
      const gapSize = source.pattern?.filter((_, index) => index % 2 === 1).reduce((sum, value) => sum + value, 0) ?? 0;
      material = dashed
        ? new THREE.LineDashedMaterial({ ...shared, dashSize: Math.max(dashSize, 1e-6), gapSize: Math.max(gapSize, 1e-6) })
        : new THREE.LineBasicMaterial(shared);
      material.name = "STEP curve material";
      lineMaterials.set(materialKey, material);
    }
    const line = new THREE.LineSegments(geometry, material);
    if (dashed) line.computeLineDistances();
    line.name = source.name || "STEP curve";
    line.userData.inventor = {
      kind: "STEP curve",
      sourcePath: fileName,
      segments: source.indices.length / 2,
      widthMillimeter: source.width,
    };
    return line;
  });

  const pointSets = scene.pointSets.map((source) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = new THREE.PointsMaterial({
      color: new THREE.Color(source.color[0], source.color[1], source.color[2]),
      opacity: source.color[3],
      transparent: source.color[3] < 1,
      size: Math.max(source.size, 1),
      sizeAttenuation: false,
    });
    material.name = "STEP point material";
    const points = new THREE.Points(geometry, material);
    points.name = source.name || "STEP points";
    points.userData.inventor = { kind: `STEP ${source.marker} points`, sourcePath: fileName, points: source.positions.length / 3 };
    points.userData.stepPointSize = source.size;
    return points;
  });

  const texts = scene.texts.map((source) => {
    const displayText = source.text.slice(0, 1024);
    const fontSize = 64;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const font = (source.font || "sans-serif").replace(/["'\\]/g, "");
    if (context) context.font = `${fontSize}px ${font}`;
    canvas.width = Math.max(32, Math.min(4096, Math.ceil(context?.measureText(displayText).width ?? displayText.length * fontSize * 0.6) + 12));
    canvas.height = fontSize + 16;
    const drawing = canvas.getContext("2d");
    if (drawing) {
      drawing.clearRect(0, 0, canvas.width, canvas.height);
      drawing.font = `${fontSize}px ${font}`;
      drawing.textBaseline = "middle";
      drawing.fillStyle = "white";
      drawing.fillText(displayText, 6, canvas.height / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(source.color[0], source.color[1], source.color[2]),
      opacity: source.color[3],
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.name = "STEP annotation text material";
    const width = Math.max(source.characterWidth * Math.max(displayText.length, 1), source.height * canvas.width / canvas.height);
    const text = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.max(source.height, 1e-6)), material);
    text.name = source.name || displayText || "STEP text";
    text.position.fromArray(source.origin);
    const xAxis = new THREE.Vector3().fromArray(source.xAxis).normalize();
    const yAxis = new THREE.Vector3().fromArray(source.yAxis).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    if (zAxis.lengthSq() > 0) text.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    text.userData.inventor = { kind: "STEP annotation text", sourcePath: fileName, text: source.text, font: source.font };
    return text;
  });

  const claimedMeshes = new Set<number>();
  const claimedPolylines = new Set<number>();
  const claimedPointSets = new Set<number>();
  const claimedTexts = new Set<number>();
  const createNode = (source: StepRenderNode): any => {
    const node = new THREE.Group();
    node.name = source.name || "STEP occurrence";
    node.userData.inventor = {
      kind: source.children.length ? "STEP assembly" : "STEP occurrence",
      name: node.name,
      sourcePath: fileName,
      ...(source.sourceRepresentationId === undefined ? {} : { representationId: source.sourceRepresentationId }),
      ...(source.sourceSemanticIds === undefined ? {} : { semanticIds: source.sourceSemanticIds }),
      ...(source.sourceRelationshipId === undefined ? {} : { relationshipId: source.sourceRelationshipId }),
      ...(source.sourceMappedItemId === undefined ? {} : { mappedItemId: source.sourceMappedItemId }),
    };
    for (const meshIndex of source.meshIndices) {
      const mesh = meshes[meshIndex];
      if (!mesh || claimedMeshes.has(meshIndex)) continue;
      claimedMeshes.add(meshIndex);
      node.add(mesh);
    }
    for (const polylineIndex of source.polylineIndices) {
      const polyline = polylines[polylineIndex];
      if (!polyline || claimedPolylines.has(polylineIndex)) continue;
      claimedPolylines.add(polylineIndex);
      node.add(polyline);
    }
    for (const pointSetIndex of source.pointSetIndices) {
      const pointSet = pointSets[pointSetIndex];
      if (!pointSet || claimedPointSets.has(pointSetIndex)) continue;
      claimedPointSets.add(pointSetIndex);
      node.add(pointSet);
    }
    for (const textIndex of source.textIndices) {
      const text = texts[textIndex];
      if (!text || claimedTexts.has(textIndex)) continue;
      claimedTexts.add(textIndex);
      node.add(text);
    }
    for (const child of source.children) node.add(createNode(child));
    return node;
  };
  for (const node of scene.nodes) model.add(createNode(node));
  for (let index = 0; index < meshes.length; index += 1) {
    if (!claimedMeshes.has(index)) model.add(meshes[index]);
  }
  for (let index = 0; index < polylines.length; index += 1) if (!claimedPolylines.has(index)) model.add(polylines[index]);
  for (let index = 0; index < pointSets.length; index += 1) if (!claimedPointSets.has(index)) model.add(pointSets[index]);
  for (let index = 0; index < texts.length; index += 1) if (!claimedTexts.has(index)) model.add(texts[index]);

  const defaultView = scene.views.find((view) => view.isDefault);
  if (defaultView) {
    const visibleMeshes = new Set(defaultView.meshIndices);
    const visiblePolylines = new Set(defaultView.polylineIndices);
    const visiblePointSets = new Set(defaultView.pointSetIndices);
    const visibleTexts = new Set(defaultView.textIndices);
    meshes.forEach((object, index) => { object.visible = visibleMeshes.has(index); });
    polylines.forEach((object, index) => { object.visible = visiblePolylines.has(index); });
    pointSets.forEach((object, index) => { object.visible = visiblePointSets.has(index); });
    texts.forEach((object, index) => { object.visible = visibleTexts.has(index); });
    model.userData.stepDefaultView = defaultView;
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
  selectedFiles: readonly File[] = [file],
) {
  const format = extension(file.name);
  if (format === "step" || format === "stp") {
    onProgress?.("Preparing STEP file…", 42);
    const scene = await parseStep(file, onProgress, selectedFiles);
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

export function loadStepModel(runtime: CadRuntime, file: File, manager: any, onProgress?: CadLoadProgress, selectedFiles: readonly File[] = [file]) {
  return loadOcctModel(runtime, file, manager, onProgress, selectedFiles);
}
