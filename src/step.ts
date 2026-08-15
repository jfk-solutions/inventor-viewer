import type { CadRuntime } from "./runtime";

type StepLoadProgress = (status: string, progress: number) => void;

let temporaryFileId = 0;

function statusDone(oc: any, status: any) {
  const done = oc.IFSelect_ReturnStatus.IFSelect_RetDone;
  return status === done || status?.value === done?.value;
}

function own<T>(resources: any[], value: T): T {
  if (value && typeof (value as any).delete === "function") resources.push(value);
  return value;
}

/**
 * Reads STEP through the separately loaded OpenCascade kernel, then uses
 * OpenCascade's XCAF-aware glTF writer to preserve assemblies, names and colors.
 */
export async function loadStepModel(
  runtime: CadRuntime,
  file: File,
  manager: any,
  onProgress?: StepLoadProgress,
) {
  onProgress?.("Loading STEP engine…", 42);
  const oc = await runtime.loadOpenCascade();
  const resources: any[] = [];
  const suffix = `${Date.now()}-${temporaryFileId++}`;
  const inputPath = `/cad-viewer-${suffix}.step`;
  const outputPath = `/cad-viewer-${suffix}.glb`;

  try {
    onProgress?.("Reading STEP geometry…", 52);
    oc.FS.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
    oc.STEPControl_Controller.Init();
    oc.STEPCAFControl_Controller.Init();

    const storageFormat = own(resources, new oc.TCollection_ExtendedString_1());
    const document = own(resources, new oc.TDocStd_Document(storageFormat));
    const documentHandle = own(resources, new oc.Handle_TDocStd_Document_2(document));
    const progress = own(resources, new oc.Message_ProgressRange_1());
    const reader = own(resources, new oc.STEPCAFControl_Reader_1());
    reader.SetColorMode(true);
    reader.SetNameMode(true);
    reader.SetLayerMode(true);
    reader.SetPropsMode(true);
    reader.SetMatMode(true);

    const readStatus = reader.ReadFile(inputPath);
    if (!statusDone(oc, readStatus)) throw new Error("OpenCascade could not read this STEP file.");
    if (!reader.Transfer_1(documentHandle, progress)) throw new Error("OpenCascade could not transfer the STEP assembly.");

    onProgress?.("Tessellating STEP surfaces…", 66);
    const shapeToolHandle = own(resources, oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()));
    const shapeTool = shapeToolHandle.get();
    const freeShapes = own(resources, new oc.TDF_LabelSequence_1());
    shapeTool.GetFreeShapes(freeShapes);
    if (freeShapes.Length() === 0) throw new Error("The STEP file contains no displayable shapes.");
    for (let index = 1; index <= freeShapes.Length(); index += 1) {
      const shape = own(resources, oc.XCAFDoc_ShapeTool.GetShape_2(freeShapes.Value(index)));
      own(resources, new oc.BRepMesh_IncrementalMesh_2(shape, 0.1, true, 0.5, true));
    }

    onProgress?.("Building STEP scene…", 78);
    const outputName = own(resources, new oc.TCollection_AsciiString_2(outputPath));
    const writer = own(resources, new oc.RWGltf_CafWriter(outputName, true));
    writer.SetToEmbedTexturesInGlb(true);
    const fileInfo = own(resources, new oc.TColStd_IndexedDataMapOfStringString_1());
    if (!writer.Perform_2(documentHandle, fileInfo, progress)) throw new Error("OpenCascade could not tessellate this STEP file.");

    const wasmBytes = oc.FS.readFile(outputPath, { encoding: "binary" });
    const glbBytes = new Uint8Array(wasmBytes.byteLength);
    glbBytes.set(wasmBytes);
    const loader = new runtime.GLTFLoader(manager);
    loader.setMeshoptDecoder(runtime.MeshoptDecoder);
    const result = await loader.parseAsync(glbBytes.buffer, "");
    return { model: result.scene, animations: result.animations ?? [] };
  } finally {
    try { oc.FS.unlink(inputPath); } catch { /* The STEP read may have failed before creating it. */ }
    try { oc.FS.unlink(outputPath); } catch { /* The glTF write may have failed before creating it. */ }
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      try { resources[index].delete(); } catch { /* Best-effort cleanup after kernel errors. */ }
    }
  }
}
