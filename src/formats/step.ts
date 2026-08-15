import type { CadRuntime } from "../runtime";

type OcctLoadProgress = (status: string, progress: number) => void;
type OcctFormat = "step" | "iges" | "brep";

let temporaryFileId = 0;

function statusDone(oc: any, status: any) {
  const done = oc.IFSelect_ReturnStatus.IFSelect_RetDone;
  return status === done || status?.value === done?.value;
}

function own<T>(resources: any[], value: T): T {
  if (value && typeof (value as any).delete === "function") resources.push(value);
  return value;
}

function formatForFile(name: string): OcctFormat {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "step" || extension === "stp") return "step";
  if (extension === "iges" || extension === "igs") return "iges";
  if (extension === "brep" || extension === "brp") return "brep";
  throw new Error(`OpenCascade does not support .${extension || "unknown"} through this loader.`);
}

function createDocument(oc: any, resources: any[]) {
  const storageFormat = own(resources, new oc.TCollection_ExtendedString_1());
  const document = own(resources, new oc.TDocStd_Document(storageFormat));
  const handle = own(resources, new oc.Handle_TDocStd_Document_2(document));
  return { document, handle };
}

function configureReader(reader: any) {
  reader.SetColorMode?.(true);
  reader.SetNameMode?.(true);
  reader.SetLayerMode?.(true);
  reader.SetPropsMode?.(true);
  reader.SetMatMode?.(true);
}

function readDocument(
  oc: any,
  format: OcctFormat,
  inputPath: string,
  document: any,
  documentHandle: any,
  progress: any,
  resources: any[],
) {
  if (format === "step") {
    oc.STEPControl_Controller.Init();
    oc.STEPCAFControl_Controller.Init();
    const reader = own(resources, new oc.STEPCAFControl_Reader_1());
    configureReader(reader);
    if (!statusDone(oc, reader.ReadFile(inputPath))) throw new Error("OpenCascade could not read this STEP file.");
    if (!reader.Transfer_1(documentHandle, progress)) throw new Error("OpenCascade could not transfer the STEP assembly.");
    return;
  }
  if (format === "iges") {
    oc.IGESControl_Controller.Init();
    const reader = own(resources, new oc.IGESCAFControl_Reader_1());
    configureReader(reader);
    if (!statusDone(oc, reader.ReadFile(inputPath))) throw new Error("OpenCascade could not read this IGES file.");
    if (!reader.Transfer(documentHandle, progress)) throw new Error("OpenCascade could not transfer the IGES model.");
    return;
  }

  const shape = own(resources, new oc.TopoDS_Shape());
  const builder = own(resources, new oc.BRep_Builder());
  if (!oc.BRepTools.Read_2(shape, inputPath, builder, progress) || shape.IsNull()) {
    throw new Error("OpenCascade could not read this BREP file.");
  }
  const shapeToolHandle = own(resources, oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()));
  own(resources, shapeToolHandle.get().AddShape(shape, false, true));
}

function tessellateDocument(oc: any, document: any, resources: any[]) {
  const shapeToolHandle = own(resources, oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()));
  const shapeTool = shapeToolHandle.get();
  const freeShapes = own(resources, new oc.TDF_LabelSequence_1());
  shapeTool.GetFreeShapes(freeShapes);
  if (freeShapes.Length() === 0) throw new Error("The CAD file contains no displayable shapes.");
  for (let index = 1; index <= freeShapes.Length(); index += 1) {
    const shape = own(resources, oc.XCAFDoc_ShapeTool.GetShape_2(freeShapes.Value(index)));
    own(resources, new oc.BRepMesh_IncrementalMesh_2(shape, 0.1, true, 0.5, true));
  }
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
  onProgress?.(`Loading ${displayName} engine…`, 42);
  const oc = await runtime.loadOpenCascade();
  const resources: any[] = [];
  const suffix = `${Date.now()}-${temporaryFileId++}`;
  const inputPath = `/cad-viewer-${suffix}.${format}`;
  const outputPath = `/cad-viewer-${suffix}.glb`;

  try {
    onProgress?.(`Reading ${displayName} geometry…`, 52);
    oc.FS.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
    const { document, handle } = createDocument(oc, resources);
    const progress = own(resources, new oc.Message_ProgressRange_1());
    readDocument(oc, format, inputPath, document, handle, progress, resources);

    onProgress?.(`Tessellating ${displayName} surfaces…`, 66);
    tessellateDocument(oc, document, resources);

    onProgress?.(`Building ${displayName} scene…`, 78);
    const outputName = own(resources, new oc.TCollection_AsciiString_2(outputPath));
    const writer = own(resources, new oc.RWGltf_CafWriter(outputName, true));
    writer.SetToEmbedTexturesInGlb(true);
    const fileInfo = own(resources, new oc.TColStd_IndexedDataMapOfStringString_1());
    if (!writer.Perform_2(handle, fileInfo, progress)) throw new Error(`OpenCascade could not tessellate this ${displayName} file.`);

    const wasmBytes = oc.FS.readFile(outputPath, { encoding: "binary" });
    const glbBytes = new Uint8Array(wasmBytes.byteLength);
    glbBytes.set(wasmBytes);
    const loader = new runtime.GLTFLoader(manager);
    loader.setMeshoptDecoder(runtime.MeshoptDecoder);
    const result = await loader.parseAsync(glbBytes.buffer, "");
    return { model: result.scene, animations: result.animations ?? [] };
  } finally {
    try { oc.FS.unlink(inputPath); } catch { /* Reading may have failed before creating it. */ }
    try { oc.FS.unlink(outputPath); } catch { /* Writing may have failed before creating it. */ }
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      try { resources[index].delete(); } catch { /* Best-effort cleanup after kernel errors. */ }
    }
  }
}

export function loadStepModel(runtime: CadRuntime, file: File, manager: any, onProgress?: OcctLoadProgress) {
  return loadOcctModel(runtime, file, manager, onProgress);
}
