// The unpublished library owns the ordinary Worker protocol. This viewer entry
// adds one catalog request for selected companion files and ZIP/ZIP64 entries,
// then emits the same transferable render scene as the package Worker.
import {
  StepInputCatalog,
  parseStepStream,
  resolveStepExternalReferences,
  tessellateStep,
} from "../../step-file-format/dist/index.js";
import { installStepWorker, stepSceneTransferables } from "../../step-file-format/dist/worker.js";

const scope = globalThis;
installStepWorker(scope);
const handlePackageRequest = scope.onmessage;

scope.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== "catalog") {
    handlePackageRequest?.(event);
    return;
  }

  void (async () => {
    try {
      const files = request.inputs.map(({ file, path }) => {
        if (!path || path === file.name) return file;
        const catalogFile = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
        Object.defineProperty(catalogFile, "webkitRelativePath", { value: path });
        return catalogFile;
      });
      const catalog = await StepInputCatalog.open(files);
      const selectedPath = request.selectedPath.replaceAll("\\", "/").replace(/^\/+/, "");
      const selected = request.selectedContainerName
        ? catalog.sources.find((source) => source.kind === "zip-entry"
          && source.containerName === request.selectedContainerName
          && source.label.slice(source.label.indexOf("›") + 1).trim() === selectedPath)
        : catalog.sources.find((source) => source.kind === "file" && source.label === selectedPath);
      const fallback = catalog.sources.find((source) => source.name === request.selectedName);
      const source = selected ?? fallback;
      if (!source) throw new Error(`Could not find ${request.selectedPath} in the selected STEP inputs.`);

      const bytes = await source.read();
      const document = await parseStepStream(new Blob([bytes]).stream(), {
        ...request.parse,
        totalBytes: bytes.byteLength,
        onProgress(progress) {
          scope.postMessage({
            type: "progress",
            progress: { phase: "parse", fraction: progress.offset / Math.max(1, progress.totalBytes), ...progress },
          });
        },
      });
      const resolved = await resolveStepExternalReferences(document, catalog.resolve, { baseUri: source.documentUri });
      const scene = tessellateStep(resolved.document, {
        ...request.tessellation,
        onProgress(progress) {
          scope.postMessage({
            type: "progress",
            progress: { phase: "tessellate", fraction: progress.completedFaces / Math.max(1, progress.totalFaces), ...progress },
          });
        },
      });
      const result = resolved.diagnostics.length
        ? {
          ...scene,
          diagnostics: [
            ...scene.diagnostics,
            ...resolved.diagnostics.map((diagnostic) => ({
              severity: "warning",
              code: diagnostic.code,
              message: diagnostic.message,
              entityId: diagnostic.referenceId,
            })),
          ],
        }
        : scene;
      scope.postMessage({ type: "complete", scene: result }, stepSceneTransferables(result));
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      scope.postMessage({ type: "error", name: failure.name, message: failure.message, ...(failure.stack ? { stack: failure.stack } : {}) });
    }
  })();
};
