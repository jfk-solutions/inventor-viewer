export const CAD_MODEL_EXTENSIONS = ["ipt", "iam", "idw", "ipn", "ide", "dwg", "dxf", "zip", "faf"] as const;

export const THREE_MODEL_EXTENSIONS = [
  "glb", "gltf", "obj", "stl", "ply", "fbx", "3mf", "amf", "dae", "3ds",
  "wrl", "vrml", "vtk", "vtp", "pcd", "xyz", "vox", "usd", "usda", "usdc",
  "usdz", "json",
] as const;

// Sidecar files may be selected alongside a model. The LoadingManager resolves
// these from local object URLs, so nothing is uploaded to fetch dependencies.
export const THREE_RESOURCE_EXTENSIONS = [
  "bin", "mtl", "png", "jpg", "jpeg", "webp", "avif", "bmp", "gif", "tga", "dds",
] as const;

const modelExtensions = new Set<string>([...CAD_MODEL_EXTENSIONS, ...THREE_MODEL_EXTENSIONS]);
const acceptedExtensions = new Set<string>([...modelExtensions, ...THREE_RESOURCE_EXTENSIONS]);
const threeModelExtensions = new Set<string>(THREE_MODEL_EXTENSIONS);

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
