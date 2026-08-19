import { parseStepBytes, tessellateStep } from "../../step-file-format/dist/index.js";

const scope = globalThis;

function postProgress(id, status, progress) {
  scope.postMessage({ type: "progress", id, status, progress });
}

scope.addEventListener("message", (event) => {
  const request = event.data;
  if (!request || request.type !== "load") return;

  try {
    const timings = {};
    let started = performance.now();
    postProgress(request.id, "Parsing STEP entities…", 44);
    const document = parseStepBytes(request.input, {
      progressInterval: 2_000,
      onProgress(progress) {
        const fraction = progress.totalBytes ? progress.offset / progress.totalBytes : 0;
        postProgress(request.id, `Parsing ${progress.entities.toLocaleString()} STEP entities…`, 44 + Math.min(1, fraction) * 18);
      },
    });
    timings.parse = performance.now() - started;

    started = performance.now();
    postProgress(request.id, "Tessellating STEP surfaces…", 64);
    const largeFile = request.input.byteLength >= 8 * 1024 * 1024;
    const scene = tessellateStep(document, {
      curveSegments: largeFile ? 20 : 32,
      surfaceSegments: largeFile ? 12 : 24,
      subdivisionDepth: largeFile ? 0 : 1,
      onProgress(progress) {
        const fraction = progress.totalFaces ? progress.completedFaces / progress.totalFaces : 0;
        postProgress(request.id, `Tessellating ${progress.completedFaces.toLocaleString()} / ${progress.totalFaces.toLocaleString()} STEP faces…`, 64 + Math.min(1, fraction) * 28);
      },
    });
    timings.tessellate = performance.now() - started;

    if (!scene.meshes.length) {
      const firstDiagnostic = scene.diagnostics[0]?.message;
      throw new Error(firstDiagnostic ? `STEP contains no renderable faces: ${firstDiagnostic}` : "STEP contains no renderable faces.");
    }

    const transfers = scene.meshes.flatMap((mesh) => [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer]);
    scope.postMessage({ type: "result", id: request.id, scene, timings }, transfers);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    scope.postMessage({ type: "error", id: request.id, message: failure.message, stack: failure.stack });
  }
});
