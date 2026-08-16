import type { CadRuntime } from "../runtime";

type OcctLoadProgress = (status: string, progress: number) => void;
type OcctFormat = "step" | "iges" | "brep";

type PendingLoad = {
  resolve: (output: ArrayBuffer) => void;
  reject: (error: Error) => void;
  onProgress?: OcctLoadProgress;
};

type WorkerResponse =
  | { type: "progress"; id: number; status: string; progress: number }
  | { type: "result"; id: number; output: ArrayBuffer; timings: Record<string, number> }
  | { type: "error"; id: number; message: string; stack?: string };

let nextRequestId = 0;
let occtWorker: Worker | undefined;
const pendingLoads = new Map<number, PendingLoad>();

function formatForFile(name: string): OcctFormat {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "step" || extension === "stp") return "step";
  if (extension === "iges" || extension === "igs") return "iges";
  if (extension === "brep" || extension === "brp") return "brep";
  throw new Error(`OpenCascade does not support .${extension || "unknown"} through this loader.`);
}

function rejectPendingLoads(error: Error) {
  for (const pending of pendingLoads.values()) pending.reject(error);
  pendingLoads.clear();
}

function getWorker() {
  if (occtWorker) return occtWorker;
  const worker = new Worker(new URL("./occt.worker.ts", import.meta.url), { type: "module", name: "cad-viewer-open-cascade" });
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const pending = pendingLoads.get(message.id);
    if (!pending) return;
    if (message.type === "progress") {
      pending.onProgress?.(message.status, message.progress);
      return;
    }
    pendingLoads.delete(message.id);
    if (message.type === "result") {
      console.debug("OpenCascade load timings (ms)", JSON.stringify(message.timings));
      pending.resolve(message.output);
    } else {
      const error = new Error(message.message);
      if (message.stack) error.stack = message.stack;
      pending.reject(error);
    }
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "The OpenCascade worker stopped unexpectedly.");
    rejectPendingLoads(error);
    worker.terminate();
    if (occtWorker === worker) occtWorker = undefined;
  });
  occtWorker = worker;
  return worker;
}

async function convertWithWorker(file: File, format: OcctFormat, onProgress?: OcctLoadProgress) {
  const id = nextRequestId++;
  const input = await file.arrayBuffer();
  const moduleUrl = new URL(`${import.meta.env.BASE_URL}vendor/opencascade/opencascade.full.js`, window.location.href).href;
  const wasmUrl = new URL(`${import.meta.env.BASE_URL}vendor/opencascade/opencascade.full.wasm`, window.location.href).href;
  const result = new Promise<ArrayBuffer>((resolve, reject) => {
    pendingLoads.set(id, { resolve, reject, onProgress });
  });
  try {
    getWorker().postMessage({ type: "load", id, format, input, moduleUrl, wasmUrl }, [input]);
  } catch (error) {
    pendingLoads.delete(id);
    throw error;
  }
  return result;
}

/** Reads STEP, IGES, or OpenCascade BREP through the separately loaded kernel. */
export async function loadOcctModel(
  runtime: CadRuntime,
  file: File,
  manager: any,
  onProgress?: OcctLoadProgress,
) {
  const format = formatForFile(file.name);
  const displayName = format === "step" ? "STEP" : format === "iges" ? "IGES" : "BREP";
  onProgress?.(`Preparing ${displayName} file…`, 42);
  const glb = await convertWithWorker(file, format, onProgress);
  onProgress?.(`Preparing ${displayName} display…`, 94);
  const loader = new runtime.GLTFLoader(manager);
  loader.setMeshoptDecoder(runtime.MeshoptDecoder);
  const result = await loader.parseAsync(glb, "");
  return { model: result.scene, animations: result.animations ?? [] };
}

export function loadStepModel(runtime: CadRuntime, file: File, manager: any, onProgress?: OcctLoadProgress) {
  return loadOcctModel(runtime, file, manager, onProgress);
}
