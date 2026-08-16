export const CAD_MODEL_EXTENSIONS = ["ipt", "iam", "idw", "ipn", "ide", "dwg", "dxf", "zip", "faf"] as const;

export const NX_MODEL_EXTENSIONS = ["prt", "xzip"] as const;

export const SOLIDWORKS_MODEL_EXTENSIONS = ["sldprt", "sldasm", "slddrw"] as const;

export const CATIA_MODEL_EXTENSIONS = ["catpart", "catproduct", "catshape", "cgr", "model"] as const;

export const FUSION_MODEL_EXTENSIONS = ["f3d", "f3z"] as const;

export const DEMO3D_MODEL_EXTENSIONS = ["demo3d", "raw3d"] as const;

export const OCCT_MODEL_EXTENSIONS = ["step", "stp", "iges", "igs", "brep", "brp"] as const;

export const SPECIAL_MODEL_EXTENSIONS = ["3dm", "bim", "fcstd", "ifc", "off", "sh3d"] as const;

export const THREE_MODEL_EXTENSIONS = [
  "glb", "gltf", "obj", "stl", "ply", "fbx", "3mf", "amf", "dae", "3ds",
  "wrl", "vrml", "wrz", "vtk", "vtp", "pcd", "xyz", "vox", "usd", "usda", "usdc",
  "usdz", "json", "bvh", "gcode", "ldr", "mpd", "md2",
] as const;

// Sidecar files may be selected alongside a model. The LoadingManager resolves
// these from local object URLs, so nothing is uploaded to fetch dependencies.
export const THREE_RESOURCE_EXTENSIONS = [
  "bin", "mtl", "png", "jpg", "jpeg", "webp", "avif", "bmp", "gif", "tga", "dds",
  "dat",
] as const;

const modelExtensions = new Set<string>([...CAD_MODEL_EXTENSIONS, ...NX_MODEL_EXTENSIONS, ...SOLIDWORKS_MODEL_EXTENSIONS, ...CATIA_MODEL_EXTENSIONS, ...FUSION_MODEL_EXTENSIONS, ...THREE_MODEL_EXTENSIONS, ...DEMO3D_MODEL_EXTENSIONS, ...OCCT_MODEL_EXTENSIONS, ...SPECIAL_MODEL_EXTENSIONS]);
const acceptedExtensions = new Set<string>([...modelExtensions, ...THREE_RESOURCE_EXTENSIONS]);
const threeModelExtensions = new Set<string>(THREE_MODEL_EXTENSIONS);
const directModelExtensions = new Set<string>([...THREE_MODEL_EXTENSIONS, ...DEMO3D_MODEL_EXTENSIONS, ...OCCT_MODEL_EXTENSIONS, ...SPECIAL_MODEL_EXTENSIONS]);
const resourceExtensions = new Set<string>(THREE_RESOURCE_EXTENSIONS);

export const ACCEPTED_FILE_TYPES = [...acceptedExtensions].map((value) => `.${value}`).join(",");

export function fileExtension(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function isAcceptedFile(path: string) {
  return acceptedExtensions.has(fileExtension(path));
}

export function isModelFile(path: string) {
  return modelExtensions.has(fileExtension(path));
}

export function isThreeModelFile(path: string) {
  return threeModelExtensions.has(fileExtension(path));
}

export function isDirectModelFile(path: string) {
  return directModelExtensions.has(fileExtension(path));
}

export function isResourceFile(path: string) {
  return resourceExtensions.has(fileExtension(path));
}
