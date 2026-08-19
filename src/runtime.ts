import { CAD_RUNTIME_VERSION } from "./runtime-version";

export type CadRuntime = {
  THREE: any;
  OrbitControls: any;
  GLTFExporter: any;
  OBJExporter: any;
  PLYExporter: any;
  STLExporter: any;
  USDZExporter: any;
  AMFLoader: any;
  BVHLoader: any;
  ColladaLoader: any;
  DDSLoader: any;
  FBXLoader: any;
  GCodeLoader: any;
  GLTFLoader: any;
  LDrawLoader: any;
  LDrawConditionalLineMaterial: any;
  MD2Loader: any;
  MTLLoader: any;
  OBJLoader: any;
  PCDLoader: any;
  PLYLoader: any;
  Rhino3dmLoader: any;
  STLLoader: any;
  TDSLoader: any;
  TGALoader: any;
  ThreeMFLoader: any;
  USDLoader: any;
  VOXLoader: any;
  buildVOXMesh: any;
  VRMLLoader: any;
  VTKLoader: any;
  XYZLoader: any;
  MeshoptDecoder: any;
  Inventor: any;
  InventorThree: any;
  InventorStep: any;
  Nx: any;
  Catia: any;
  CatiaV4: any;
  Fusion: any;
  FusionThree: any;
  Creo: any;
  SolidEdge: any;
  SolidWorks: any;
  SolidWorksThree: any;
  Acad: any;
  loadOpenCascade: () => Promise<any>;
};

let runtimePromise: Promise<CadRuntime> | undefined;

export function loadCadRuntime(): Promise<CadRuntime> {
  const url = new URL(`${import.meta.env.BASE_URL}vendor/cad-viewer-runtime.min.js`, window.location.href);
  url.searchParams.set("v", CAD_RUNTIME_VERSION);
  runtimePromise ??= import(/* @vite-ignore */ url.href) as Promise<CadRuntime>;
  return runtimePromise;
}
