type OcctFormat = "step" | "iges" | "brep";

type LoadRequest = {
  type: "load";
  id: number;
  format: OcctFormat;
  input: ArrayBuffer;
  moduleUrl: string;
  wasmUrl: string;
};

type WorkerResponse =
  | { type: "progress"; id: number; status: string; progress: number }
  | { type: "result"; id: number; output: ArrayBuffer; timings: Record<string, number> }
  | { type: "error"; id: number; message: string; stack?: string };

type WorkerScope = {
  addEventListener(type: "message", listener: (event: MessageEvent<LoadRequest>) => void): void;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

const scope = globalThis as unknown as WorkerScope;
let openCascadePromise: Promise<any> | undefined;
let loadedModuleUrl = "";
let loadedWasmUrl = "";

function own<T>(resources: any[], value: T): T {
  if (value && typeof (value as any).delete === "function") resources.push(value);
  return value;
}

function statusDone(oc: any, status: any) {
  const done = oc.IFSelect_ReturnStatus.IFSelect_RetDone;
  return status === done || status?.value === done?.value;
}

function sendProgress(id: number, status: string, progress: number) {
  scope.postMessage({ type: "progress", id, status, progress });
}

function loadOpenCascade(moduleUrl: string, wasmUrl: string) {
  if (openCascadePromise && (moduleUrl !== loadedModuleUrl || wasmUrl !== loadedWasmUrl)) {
    throw new Error("The OpenCascade worker cannot switch kernels while it is running.");
  }
  if (!openCascadePromise) {
    loadedModuleUrl = moduleUrl;
    loadedWasmUrl = wasmUrl;
    openCascadePromise = import(/* @vite-ignore */ moduleUrl).then(({ default: initialize }) => new initialize({
      locateFile(path: string) {
        return path.endsWith(".wasm") ? wasmUrl : path;
      },
    }));
  }
  return openCascadePromise;
}

function createDocument(oc: any, resources: any[]) {
  const storageFormat = own(resources, new oc.TCollection_ExtendedString_1());
  const document = own(resources, new oc.TDocStd_Document(storageFormat));
  const handle = own(resources, new oc.Handle_TDocStd_Document_2(document));
  return { document, handle };
}

function configureReader(reader: any) {
  // Names and colors are displayed by the viewer. Layers, validation
  // properties, materials, PMI and views are not, and can make transfer of a
  // large AP242 assembly substantially more expensive.
  reader.SetColorMode?.(true);
  reader.SetNameMode?.(true);
  reader.SetLayerMode?.(false);
  reader.SetPropsMode?.(false);
  reader.SetMatMode?.(false);
  reader.SetSHUOMode?.(false);
  reader.SetGDTMode?.(false);
  reader.SetViewMode?.(false);
}

function readDocument(
  oc: any,
  id: number,
  format: OcctFormat,
  inputPath: string,
  document: any,
  documentHandle: any,
  progressRange: any,
  resources: any[],
  timings: Record<string, number>,
) {
  if (format === "step") {
    oc.STEPControl_Controller.Init();
    oc.STEPCAFControl_Controller.Init();
    const reader = own(resources, new oc.STEPCAFControl_Reader_1());
    configureReader(reader);
    sendProgress(id, "Reading STEP entities…", 52);
    let started = performance.now();
    if (!statusDone(oc, reader.ReadFile(inputPath))) throw new Error("OpenCascade could not read this STEP file.");
    timings.read = performance.now() - started;
    sendProgress(id, "Building STEP assembly…", 61);
    started = performance.now();
    if (!reader.Transfer_1(documentHandle, progressRange)) throw new Error("OpenCascade could not transfer the STEP assembly.");
    timings.transfer = performance.now() - started;
    return;
  }

  if (format === "iges") {
    oc.IGESControl_Controller.Init();
    const reader = own(resources, new oc.IGESCAFControl_Reader_1());
    configureReader(reader);
    sendProgress(id, "Reading IGES entities…", 52);
    let started = performance.now();
    if (!statusDone(oc, reader.ReadFile(inputPath))) throw new Error("OpenCascade could not read this IGES file.");
    timings.read = performance.now() - started;
    sendProgress(id, "Building IGES document…", 61);
    started = performance.now();
    if (!reader.Transfer(documentHandle, progressRange)) throw new Error("OpenCascade could not transfer the IGES model.");
    timings.transfer = performance.now() - started;
    return;
  }

  sendProgress(id, "Reading BREP geometry…", 54);
  const started = performance.now();
  const shape = own(resources, new oc.TopoDS_Shape());
  const builder = own(resources, new oc.BRep_Builder());
  if (!oc.BRepTools.Read_2(shape, inputPath, builder, progressRange) || shape.IsNull()) {
    throw new Error("OpenCascade could not read this BREP file.");
  }
  const shapeToolHandle = own(resources, oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()));
  own(resources, shapeToolHandle.get().AddShape(shape, false, true));
  timings.read = performance.now() - started;
}

function modelDeflection(oc: any, shapes: any[], resources: any[]) {
  const bounds = own(resources, new oc.Bnd_Box_1());
  for (const shape of shapes) oc.BRepBndLib.Add(shape, bounds, false);
  if (bounds.IsVoid() || bounds.IsOpen()) return 0.25;
  const minimum = own(resources, bounds.CornerMin());
  const maximum = own(resources, bounds.CornerMax());
  const diagonal = Math.hypot(
    maximum.X() - minimum.X(),
    maximum.Y() - minimum.Y(),
    maximum.Z() - minimum.Z(),
  );
  // Target roughly one thousand segments across the model while preventing
  // pathological sub-edge deflections and overly coarse large-plant meshes.
  return Math.min(1, Math.max(0.01, diagonal * 0.001));
}

function tessellateDocument(oc: any, document: any, resources: any[]) {
  const shapeToolHandle = own(resources, oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()));
  const shapeTool = shapeToolHandle.get();
  const freeShapes = own(resources, new oc.TDF_LabelSequence_1());
  shapeTool.GetFreeShapes(freeShapes);
  if (freeShapes.Length() === 0) throw new Error("The CAD file contains no displayable shapes.");

  const shapes = [];
  for (let index = 1; index <= freeShapes.Length(); index += 1) {
    shapes.push(own(resources, oc.XCAFDoc_ShapeTool.GetShape_2(freeShapes.Value(index))));
  }
  const deflection = modelDeflection(oc, shapes, resources);
  for (const shape of shapes) {
    // Absolute deflection avoids extremely dense meshes on short assembly
    // edges. OpenCascade's WASM build can parallelize internally where the
    // browser supports it; the worker keeps this synchronous call off the UI.
    own(resources, new oc.BRepMesh_IncrementalMesh_2(shape, deflection, false, 0.5, true));
  }
}

async function loadModel(request: LoadRequest) {
  const { id, format } = request;
  const displayName = format === "step" ? "STEP" : format === "iges" ? "IGES" : "BREP";
  const timings: Record<string, number> = {};
  sendProgress(id, `Loading ${displayName} engine…`, 44);
  let started = performance.now();
  const oc = await loadOpenCascade(request.moduleUrl, request.wasmUrl);
  timings.kernel = performance.now() - started;

  const resources: any[] = [];
  const inputPath = `/cad-viewer-${id}.${format}`;
  const outputPath = `/cad-viewer-${id}.glb`;
  try {
    started = performance.now();
    oc.FS.writeFile(inputPath, new Uint8Array(request.input));
    timings.copyIn = performance.now() - started;
    const { document, handle } = createDocument(oc, resources);
    const progressRange = own(resources, new oc.Message_ProgressRange_1());
    readDocument(oc, id, format, inputPath, document, handle, progressRange, resources, timings);

    sendProgress(id, `Tessellating ${displayName} surfaces…`, 72);
    started = performance.now();
    tessellateDocument(oc, document, resources);
    timings.tessellate = performance.now() - started;

    sendProgress(id, `Building ${displayName} scene…`, 86);
    started = performance.now();
    const outputName = own(resources, new oc.TCollection_AsciiString_2(outputPath));
    const writer = own(resources, new oc.RWGltf_CafWriter(outputName, true));
    writer.SetToEmbedTexturesInGlb(true);
    writer.SetMergeFaces(true);
    const fileInfo = own(resources, new oc.TColStd_IndexedDataMapOfStringString_1());
    if (!writer.Perform_2(handle, fileInfo, progressRange)) {
      throw new Error(`OpenCascade could not build a scene from this ${displayName} file.`);
    }
    const wasmBytes = oc.FS.readFile(outputPath, { encoding: "binary" }) as Uint8Array;
    const output = new Uint8Array(wasmBytes.byteLength);
    output.set(wasmBytes);
    timings.write = performance.now() - started;
    return { output: output.buffer, timings };
  } finally {
    try { oc.FS.unlink(inputPath); } catch { /* The read may fail before creating it. */ }
    try { oc.FS.unlink(outputPath); } catch { /* The write may fail before creating it. */ }
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      try { resources[index].delete(); } catch { /* Best-effort cleanup after kernel errors. */ }
    }
  }
}

scope.addEventListener("message", (event) => {
  const request = event.data;
  if (!request || request.type !== "load") return;
  void loadModel(request).then(
    ({ output, timings }) => scope.postMessage({ type: "result", id: request.id, output, timings }, [output]),
    (error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      scope.postMessage({ type: "error", id: request.id, message: failure.message, stack: failure.stack });
    },
  );
});

export {};
