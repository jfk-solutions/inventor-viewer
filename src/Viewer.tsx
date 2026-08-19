import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileBox,
  FolderOpen,
  Hand,
  Home,
  Layers3,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Ruler,
  Search,
  X,
} from "lucide-react";
import { BrandIcon } from "./Brand";
import { disposeDemo3DModel, loadDemo3DFile } from "./formats/demo3d";
import { loadCadRuntime, type CadRuntime } from "./runtime";
import { ACCEPTED_FILE_TYPES, fileExtension, isDirectModelFile, isResourceFile } from "./formats";
import { loadOcctModel } from "./formats/step";
import { createCatiaThreeGroup, disposeCatiaThreeGroup } from "./formats/catia";
import { createFusionThreeFaceHighlight, createFusionThreeGroup, disposeFusionThreeGroup, resolveFusionThreeFaceHit } from "./formats/fusion";
import { createNxThreeGroup, disposeNxThreeGroup } from "./formats/nx";

type ViewerProps = {
  files: File[];
  onClose: () => void;
  onOpenFiles: (files: File[]) => void;
};

type RootOption = { path: string; label: string; kind: string };
type ViewMode = "linear" | "perspective";
type ToolMode = "move" | "select";
type TreeItem = { id: string; label: string; kind: string; object: any; children: TreeItem[] };
type PropertySection = { title: string; rows: { name: string; value: string }[] };
type ExportFormat = "step" | "glb" | "gltf" | "obj" | "stl" | "ply" | "usdz";

const EXPORT_FORMATS: { format: ExportFormat; label: string; description: string }[] = [
  { format: "step", label: "STEP", description: "Exact AP242 CAD solids and assemblies" },
  { format: "glb", label: "GLB", description: "Binary glTF with materials and textures" },
  { format: "gltf", label: "glTF", description: "JSON glTF with embedded resources" },
  { format: "obj", label: "OBJ", description: "Mesh and line geometry" },
  { format: "stl", label: "STL", description: "Binary triangle mesh for 3D printing" },
  { format: "ply", label: "PLY", description: "Binary mesh or point cloud" },
  { format: "usdz", label: "USDZ", description: "Packaged model for Apple AR" },
];

const IMPRINT_URL = "https://github.com/jfk-solutions/.github/blob/main/profile/imprint.md";
const PRIVACY_URL = `${import.meta.env.BASE_URL}datenschutz.html`;

const STEP_PHASE_LABELS: Record<string, string> = {
  "resolving-documents": "Resolving components",
  "locating-payloads": "Locating exact geometry",
  "decoding-asm": "Decoding CAD solids",
  "loading-kernel": "Loading STEP engine",
  "building-geometry": "Building exact surfaces",
  "building-topology": "Building solid topology",
  "validating-shapes": "Validating solids",
  "building-assembly": "Building assembly",
  "writing-step": "Writing STEP file",
};

function extension(path: string) {
  return fileExtension(path);
}

function kindFor(path: string) {
  return ({
    iam: "Assembly", ipt: "Part", idw: "Drawing", ipn: "Presentation", ide: "iFeature",
    prt: "Siemens NX part or assembly", xzip: "Siemens NX archive",
    catproduct: "CATIA assembly", catpart: "CATIA part", catshape: "CATIA shape", cgr: "CATIA graphical representation", model: "CATIA V4 MODEL",
    f3d: "Fusion design", f3z: "Fusion distributed design",
    sldasm: "SolidWorks assembly", sldprt: "SolidWorks part", slddrw: "SolidWorks drawing",
    dwg: "AutoCAD drawing", dxf: "DXF drawing", glb: "Binary glTF", gltf: "glTF model",
    obj: "Wavefront model", stl: "STL mesh", ply: "PLY model", fbx: "FBX model",
    "3mf": "3MF model", amf: "AMF model", dae: "Collada model", "3ds": "3DS model",
    wrl: "VRML model", vrml: "VRML model", vtk: "VTK model", vtp: "VTK PolyData",
    pcd: "Point cloud", xyz: "XYZ point cloud", vox: "MagicaVoxel model", usd: "USD model",
    usda: "USD ASCII model", usdc: "USD binary model", usdz: "USDZ model", json: "Three.js scene",
    bvh: "BVH motion capture", gcode: "G-code toolpath", ldr: "LDraw model", mpd: "LDraw multipart model",
    md2: "Quake II model",
    step: "STEP model", stp: "STEP model", iges: "IGES model", igs: "IGES model",
    brep: "OpenCascade BREP", brp: "OpenCascade BREP", "3dm": "Rhino 3DM model",
    bim: "DotBIM model", fcstd: "FreeCAD document", ifc: "IFC building model", off: "OFF mesh",
    sh3d: "Sweet Home 3D project",
    demo3d: "Demo3D project", raw3d: "RAW3D scene",
  } as Record<string, string>)[extension(path)] ?? "3D model";
}

function readableBytes(value: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function exportBaseName(path: string) {
  const fileName = path.split(/[\\/]/).pop() || "cad-model";
  return fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "cad-model";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function cleanName(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summary(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumSignificantDigits: 8 }) : String(value);
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.length <= 4 && value.every((item) => typeof item !== "object") ? value.map(summary).join(", ") : `${value.length} items`;
  if (ArrayBuffer.isView(value)) return `${value.constructor.name} · ${readableBytes(value.byteLength)}`;
  if (value instanceof ArrayBuffer) return readableBytes(value.byteLength);
  if (value instanceof Date) return value.toLocaleString();
  const object = value as Record<string, unknown>;
  if (typeof object.toArray === "function") return summary((object.toArray as () => unknown[])());
  if (object.name && typeof object.name === "string") return object.name;
  return value?.constructor?.name ?? "Object";
}

function objectProperties(object: any, hit?: any): PropertySection[] {
  if (!object) return [];
  object.updateWorldMatrix?.(true, false);
  const position = object.getWorldPosition ? object.getWorldPosition(object.position.clone()) : object.position;
  const metadata = object.userData?.inventor ?? object.userData?.nx ?? object.userData?.solidworks ?? object.userData?.catia ?? object.userData?.fusion ?? object.userData?.sweethome3d ?? object.userData?.raw3d ?? object.userData?.demo3d ?? {};
  const metadataTitle = object.userData?.inventor ? "Inventor metadata" : object.userData?.nx ? "Siemens NX metadata" : object.userData?.solidworks ? "SolidWorks metadata" : object.userData?.catia ? "CATIA metadata" : object.userData?.fusion ? "Fusion metadata" : object.userData?.sweethome3d ? "Sweet Home 3D metadata" : object.userData?.raw3d ? "RAW3D metadata" : "Demo3D metadata";
  const primary = [
    { name: "Name", value: object.name || metadata.name || "Unnamed object" },
    { name: "Type", value: metadata.kind ? cleanName(metadata.kind) : object.type },
    { name: "Source", value: metadata.sourcePath ?? "Current document" },
    { name: "Visible", value: object.visible ? "Yes" : "No" },
  ];
  const metadataRows = Object.entries(metadata)
    .filter(([key, value]) => !["kind", "sourcePath", "stats"].includes(key) && typeof value !== "function")
    .slice(0, 18)
    .map(([name, value]) => ({ name: cleanName(name), value: summary(value) }));
  const geometry = object.geometry;
  if (geometry && !geometry.boundingBox) geometry.computeBoundingBox?.();
  const geometryRows = [
    { name: "Geometry", value: geometry?.type ?? "Group" },
    { name: "Vertices", value: geometry?.attributes?.position?.count?.toLocaleString() ?? "—" },
    { name: "Triangles", value: geometry?.index?.count ? Math.floor(geometry.index.count / 3).toLocaleString() : "—" },
    { name: "Material", value: Array.isArray(object.material) ? `${object.material.length} materials` : object.material?.name || object.material?.type || "—" },
  ];
  const transform = [
    { name: "Position X", value: summary(position?.x) },
    { name: "Position Y", value: summary(position?.y) },
    { name: "Position Z", value: summary(position?.z) },
    { name: "Scale", value: summary(object.scale?.toArray?.()) },
  ];
  const selection = hit ? [
    { name: "Distance", value: summary(hit.distance) },
    { name: "Face index", value: summary(hit.faceIndex) },
    ...(hit.fusionFace ? [
      { name: "Native face", value: summary(hit.fusionFace.nativeFace) },
      { name: "Native surface", value: summary(hit.fusionFace.nativeSurface) },
      { name: "Surface type", value: summary(hit.fusionFace.geometry) },
      { name: "Material ID", value: summary(hit.fusionFace.materialId) },
    ] : []),
    { name: "Point", value: summary(hit.point?.toArray?.()) },
  ] : [];
  return [
    { title: "Object", rows: primary },
    ...(metadataRows.length ? [{ title: metadataTitle, rows: metadataRows }] : []),
    { title: "Geometry", rows: geometryRows },
    { title: "Transform", rows: transform },
    ...(selection.length ? [{ title: "Selection", rows: selection }] : []),
  ];
}

function IconForKind({ kind }: { kind: string }) {
  if (/assembly/i.test(kind)) return <Boxes size={15} />;
  if (/drawing|line/i.test(kind)) return <Layers3 size={15} />;
  return <Box size={15} />;
}

function buildTree(object: any, prefix = "root", depth = 0): TreeItem {
  const kind = cleanName(object.userData?.inventor?.kind ?? object.userData?.nx?.kind ?? object.userData?.solidworks?.kind ?? object.userData?.catia?.kind ?? object.userData?.sweethome3d?.kind ?? object.userData?.raw3d?.kind ?? object.userData?.demo3d?.kind ?? object.type ?? "Object");
  return {
    id: `${prefix}-${object.id}`,
    label: object.name || object.userData?.inventor?.name || object.userData?.nx?.name || object.userData?.solidworks?.name || object.userData?.catia?.name || object.userData?.sweethome3d?.name || object.userData?.raw3d?.name || object.userData?.demo3d?.name || kind,
    kind,
    object,
    children: depth > 7 ? [] : (object.children ?? [])
      .filter((child: any) => child.type !== "BoxHelper")
      .map((child: any, index: number) => buildTree(child, `${prefix}-${index}`, depth + 1)),
  };
}

function TreeNode({ item, level, selected, onSelect, onToggleVisibility }: { item: TreeItem; level: number; selected: any; onSelect: (object: any) => void; onToggleVisibility: (object: any) => void }) {
  const [open, setOpen] = useState(level < 2);
  const hasChildren = item.children.length > 0;
  return (
    <div className="tree-branch">
      <div className={`tree-row ${selected === item.object ? "selected" : ""} ${item.object.visible ? "" : "hidden"}`} style={{ paddingLeft: 10 + level * 14 }}>
        <button type="button" className="tree-toggle" onClick={() => setOpen(!open)} aria-label={open ? "Collapse" : "Expand"} disabled={!hasChildren}>
          {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span />}
        </button>
        <button type="button" className="tree-label" onClick={() => onSelect(item.object)} title={`${item.label} · ${item.kind}`}>
          <IconForKind kind={item.kind} /><span>{item.label}</span>
        </button>
        <button type="button" className="tree-visibility" onClick={() => onToggleVisibility(item.object)} aria-label={`${item.object.visible ? "Hide" : "Show"} ${item.label}`} title={`${item.object.visible ? "Hide" : "Show"} ${item.label}`}>
          {item.object.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
      {open && item.children.map((child) => <TreeNode key={child.id} item={child} level={level + 1} selected={selected} onSelect={onSelect} onToggleVisibility={onToggleVisibility} />)}
    </div>
  );
}

function PropertyGrid({ sections }: { sections: PropertySection[] }) {
  if (!sections.length) {
    return <div className="property-empty"><Crosshair size={24} /><strong>Select an object</strong><span>Choose Select mode, then click a face or item in the model tree.</span></div>;
  }
  return <div className="property-sections">{sections.map((section, index) => (
    <section key={`${section.title}-${index}`}>
      <h3>{section.title}</h3>
      <div className="property-table">{section.rows.map((row) => (
        <div className="property-row" key={row.name}><span>{row.name}</span><strong title={row.value}>{row.value}</strong></div>
      ))}</div>
    </section>
  ))}</div>;
}

function pointArray(point: any): [number, number, number] {
  return [Number(point?.x ?? 0), Number(point?.y ?? 0), Number(point?.z ?? 0)];
}

function buildDxfGroup(runtime: CadRuntime, bytes: Uint8Array) {
  const { THREE, Acad } = runtime;
  const document = Acad.DxfReader.readFromStream(bytes);
  const group = new THREE.Group();
  group.name = "DXF model space";
  group.userData.inventor = { kind: "dxf drawing", entityCount: document.modelSpace?.entities?.length ?? 0 };
  const material = new THREE.LineBasicMaterial({ color: 0xd8e0e4 });
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x82929a, roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide });

  const addLine = (name: string, points: any[], entity: any, closed = false) => {
    if (points.length < 2) return;
    const values = points.map(pointArray);
    if (closed) values.push(values[0]);
    const geometry = new THREE.BufferGeometry().setFromPoints(values.map((value: number[]) => new THREE.Vector3(...value)));
    const line = new THREE.Line(geometry, material);
    line.name = name;
    line.userData.inventor = { kind: entity.objectName ?? name, layer: entity.layer?.name, colorIndex: entity.color?.index, handle: entity.handle };
    group.add(line);
  };

  for (const entity of document.modelSpace?.entities ?? []) {
    const name = entity.objectName ?? entity.constructor?.name ?? "Entity";
    try {
      if (entity.startPoint && entity.endPoint) addLine(name, [entity.startPoint, entity.endPoint], entity);
      else if (typeof entity.polygonalVertexes === "function") addLine(name, entity.polygonalVertexes(/circle/i.test(name) ? 96 : 64), entity, /circle/i.test(name));
      else if (typeof entity.getPoints === "function") addLine(name, entity.getPoints(192), entity, Boolean(entity.isClosed));
      else if (entity.firstCorner && entity.thirdCorner) {
        const points = [entity.firstCorner, entity.secondCorner, entity.thirdCorner, entity.fourthCorner];
        const vertices = points.flatMap(pointArray);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, faceMaterial);
        mesh.name = name;
        mesh.userData.inventor = { kind: name, layer: entity.layer?.name, handle: entity.handle };
        group.add(mesh);
      } else if (entity.location) {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...pointArray(entity.location))]);
        const point = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xf3a61d, size: 2 }));
        point.name = name;
        point.userData.inventor = { kind: name, layer: entity.layer?.name, handle: entity.handle };
        group.add(point);
      }
    } catch (error) {
      console.warn(`Skipped DXF ${name}`, error);
    }
  }
  return { group, document };
}

type LoadedThreeModel = { model: any; objectUrls: string[] };

function filePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function normalizedAssetPath(value: string) {
  let path = value.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  try { path = decodeURIComponent(path); } catch { /* Keep the original URL if it is not valid URI text. */ }
  if (/^[a-z]+:\/\//i.test(path)) {
    try { path = new URL(path).pathname; } catch { /* Treat it as a relative path below. */ }
  }
  return path.replace(/^\.?\//, "").toLocaleLowerCase();
}

function createLocalLoadingManager(runtime: CadRuntime, files: File[]) {
  const manager = new runtime.THREE.LoadingManager();
  const byPath = new Map<string, File>();
  const objectUrls = new Map<File, string>();
  for (const file of files) {
    const path = normalizedAssetPath(filePath(file));
    byPath.set(path, file);
    byPath.set(path.split("/").pop() || path, file);
  }
  manager.setURLModifier((url: string) => {
    if (/^(blob:|data:)/i.test(url)) return url;
    const path = normalizedAssetPath(url);
    const file = byPath.get(path) ?? [...byPath.entries()].find(([candidate]) => candidate.endsWith(`/${path}`) || path.endsWith(`/${candidate}`))?.[1];
    if (!file) return url;
    let objectUrl = objectUrls.get(file);
    if (!objectUrl) {
      objectUrl = URL.createObjectURL(file);
      objectUrls.set(file, objectUrl);
    }
    return objectUrl;
  });
  manager.addHandler(/\.tga$/i, new runtime.TGALoader(manager));
  manager.addHandler(/\.dds$/i, new runtime.DDSLoader(manager));
  return { manager, objectUrls };
}

function meshFromGeometry(runtime: CadRuntime, geometry: any, name: string) {
  const { THREE } = runtime;
  if (!geometry.getAttribute?.("normal")) geometry.computeVertexNormals?.();
  const vertexColors = Boolean(geometry.getAttribute?.("color") || geometry.hasColors);
  const opacity = typeof geometry.alpha === "number" ? geometry.alpha : 1;
  const material = new THREE.MeshStandardMaterial({
    color: vertexColors ? 0xffffff : 0x91a1a6,
    roughness: 0.78,
    metalness: 0.04,
    vertexColors,
    opacity,
    transparent: opacity < 1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function pointsFromGeometry(runtime: CadRuntime, geometry: any, name: string) {
  const { THREE } = runtime;
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: geometry.getAttribute?.("color") ? 0xffffff : 0x78c6ba,
    vertexColors: Boolean(geometry.getAttribute?.("color")),
    size: 0.01,
    sizeAttenuation: true,
  }));
  points.name = name;
  return points;
}

async function decompressGzipText(file: File) {
  const decompressed = file.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressed).text();
}

async function loadThreeModel(
  runtime: CadRuntime,
  file: File,
  files: File[],
  onProgress?: (status: string, progress: number) => void,
): Promise<LoadedThreeModel> {
  const { THREE } = runtime;
  const path = filePath(file).replace(/\\/g, "/");
  const format = extension(path);
  const { manager, objectUrls } = createLocalLoadingManager(runtime, files);
  let model: any;
  let animations: any[] = [];

  try {
    if (["step", "stp", "iges", "igs", "brep", "brp"].includes(format)) {
      const result = await loadOcctModel(runtime, file, manager, onProgress);
      model = result.model;
      animations = result.animations;
    } else if (format === "3dm") {
      onProgress?.("Loading Rhino 3DM engine…", 44);
      const loader = new runtime.Rhino3dmLoader(manager);
      loader.setLibraryPath(new URL(`${import.meta.env.BASE_URL}vendor/rhino3dm/`, window.location.href).href);
      loader.setWorkerLimit(Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)));
      try { model = await loader.loadAsync(path); } finally { loader.dispose(); }
    } else if (format === "off") {
      const { loadOffModel } = await import("./formats/off");
      model = await loadOffModel(runtime, file);
    } else if (format === "bim") {
      const { loadBimModel } = await import("./formats/bim");
      model = await loadBimModel(runtime, file);
    } else if (format === "fcstd") {
      const { loadFcstdModel } = await import("./formats/fcstd");
      model = await loadFcstdModel(runtime, file, manager, onProgress);
    } else if (format === "ifc") {
      const { loadIfcModel } = await import("./formats/ifc");
      model = await loadIfcModel(runtime, file, onProgress);
    } else if (format === "sh3d") {
      const { loadSweetHome3dModel } = await import("./formats/sh3d");
      const result = await loadSweetHome3dModel(runtime, file, onProgress);
      model = result.model;
      for (const url of result.objectUrls) objectUrls.set(new File([], url), url);
    } else if (format === "demo3d" || format === "raw3d") {
      model = await loadDemo3DFile(file, THREE);
    } else if (format === "glb" || format === "gltf") {
      const loader = new runtime.GLTFLoader(manager);
      loader.setMeshoptDecoder(runtime.MeshoptDecoder);
      const result = await loader.loadAsync(path);
      model = result.scene;
      animations = result.animations ?? [];
    } else if (format === "obj") {
      const loader = new runtime.OBJLoader(manager);
      const stem = file.name.replace(/\.[^.]+$/, "").toLocaleLowerCase();
      const materialFile = files.find((candidate) => extension(candidate.name) === "mtl" && candidate.name.replace(/\.[^.]+$/, "").toLocaleLowerCase() === stem)
        ?? files.find((candidate) => extension(candidate.name) === "mtl");
      if (materialFile) {
        const materials = await new runtime.MTLLoader(manager).loadAsync(filePath(materialFile).replace(/\\/g, "/"));
        materials.preload();
        loader.setMaterials(materials);
      }
      model = await loader.loadAsync(path);
    } else if (format === "stl") {
      model = meshFromGeometry(runtime, await new runtime.STLLoader(manager).loadAsync(path), file.name);
    } else if (format === "ply") {
      const geometry = await new runtime.PLYLoader(manager).loadAsync(path);
      const header = await file.slice(0, Math.min(file.size, 65_536)).text();
      const faceCount = Number(/^element\s+face\s+(\d+)/im.exec(header)?.[1] ?? 0);
      model = faceCount > 0 ? meshFromGeometry(runtime, geometry, file.name) : pointsFromGeometry(runtime, geometry, file.name);
    } else if (format === "fbx") {
      model = await new runtime.FBXLoader(manager).loadAsync(path);
      animations = model.animations ?? [];
    } else if (format === "bvh") {
      const result = await new runtime.BVHLoader(manager).loadAsync(path);
      model = new THREE.Group();
      const rootBone = result.skeleton.bones[0];
      rootBone.name ||= file.name;
      const skeletonHelper = new THREE.SkeletonHelper(rootBone);
      model.add(rootBone, skeletonHelper);
      rootBone.updateMatrixWorld(true);
      skeletonHelper.updateMatrixWorld(true);
      animations = result.clip ? [result.clip] : [];
    } else if (format === "gcode") {
      model = await new runtime.GCodeLoader(manager).loadAsync(path);
    } else if (format === "ldr" || format === "mpd") {
      const loader = new runtime.LDrawLoader(manager);
      loader.setConditionalLineMaterial(runtime.LDrawConditionalLineMaterial);
      model = await loader.loadAsync(path);
    } else if (format === "md2") {
      const geometry = await new runtime.MD2Loader(manager).loadAsync(path);
      model = meshFromGeometry(runtime, geometry, file.name);
      animations = geometry.animations ?? [];
    } else if (format === "3mf") {
      model = await new runtime.ThreeMFLoader(manager).loadAsync(path);
    } else if (format === "amf") {
      model = await new runtime.AMFLoader(manager).loadAsync(path);
    } else if (format === "dae") {
      const result = await new runtime.ColladaLoader(manager).loadAsync(path);
      model = result.scene;
      animations = result.animations ?? model.animations ?? [];
    } else if (format === "3ds") {
      model = await new runtime.TDSLoader(manager).loadAsync(path);
    } else if (format === "wrl" || format === "vrml") {
      model = await new runtime.VRMLLoader(manager).loadAsync(path);
    } else if (format === "wrz") {
      const basePath = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      model = new runtime.VRMLLoader(manager).parse(await decompressGzipText(file), basePath);
    } else if (format === "vtk" || format === "vtp") {
      model = meshFromGeometry(runtime, await new runtime.VTKLoader(manager).loadAsync(path), file.name);
    } else if (format === "pcd") {
      model = await new runtime.PCDLoader(manager).loadAsync(path);
    } else if (format === "xyz") {
      model = pointsFromGeometry(runtime, await new runtime.XYZLoader(manager).loadAsync(path), file.name);
    } else if (format === "vox") {
      const result = await new runtime.VOXLoader(manager).loadAsync(path);
      if (result.scene) model = result.scene;
      else {
        model = new THREE.Group();
        for (const chunk of result.chunks ?? []) model.add(runtime.buildVOXMesh(chunk));
      }
    } else if (["usd", "usda", "usdc", "usdz"].includes(format)) {
      model = await new runtime.USDLoader(manager).loadAsync(path);
    } else if (format === "json") {
      model = await new THREE.ObjectLoader(manager).loadAsync(path);
      animations = model.animations ?? [];
    } else {
      throw new Error(`No Three.js loader is registered for .${format}.`);
    }

    if (!model) throw new Error(`Three.js did not return a scene for ${file.name}.`);
    model.name ||= file.name;
    model.animations = animations.length ? animations : model.animations ?? [];
    model.userData ||= {};
    if (format === "raw3d") {
      model.userData.raw3d = { ...model.userData.raw3d, kind: kindFor(path), sourcePath: path };
    } else if (format === "demo3d") {
      model.userData.demo3d = { ...model.userData.demo3d, kind: kindFor(path), sourcePath: path };
    } else if (format === "sh3d") {
      model.userData.sweethome3d = { ...model.userData.sweethome3d, kind: kindFor(path), sourcePath: path };
    } else {
      model.userData.inventor ||= { kind: kindFor(path), sourcePath: path };
    }
    return { model, objectUrls: [...objectUrls.values()] };
  } catch (error) {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    throw error;
  }
}

function setModelTwoSided(model: any, enabled: boolean, THREE: any, originalSides: WeakMap<object, number>) {
  const visited = new Set<object>();
  model?.traverse?.((object: any) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.isMaterial || visited.has(material)) continue;
      visited.add(material);
      if (!originalSides.has(material)) originalSides.set(material, material.side);
      const nextSide = enabled ? THREE.DoubleSide : originalSides.get(material);
      if (typeof nextSide === "number" && material.side !== nextSide) {
        material.side = nextSide;
        material.needsUpdate = true;
      }
    }
  });
}

async function createSolidWorksModel(runtime: CadRuntime, document: any, renderScene?: any) {
  const { THREE, SolidWorksThree } = runtime;
  const model = SolidWorksThree.createSolidWorksThreeGroup(renderScene ?? document, { mergeFaces: true });
  const configuration = document.configurations?.[0];
  const displaySummary = document.displayListSummary;
  const triangleCount = renderScene?.triangleCount ?? (document.displayMeshes ?? []).reduce((total: number, mesh: any) => total + (mesh.indices?.length ?? 0) / 3, 0);
  model.userData.solidworksDocument = true;
  model.userData.solidworks = {
    ...document.globalProperties,
    ...configuration?.properties,
    kind: `${document.type} document`,
    sourcePath: document.path,
    storage: document.storage,
    version: document.version || "Unknown",
    configurations: document.configurations?.length ?? 0,
    sheets: document.sheets?.length ?? 0,
    displayMeshes: document.displayMeshes?.length ?? 0,
    triangles: triangleCount,
    materials: renderScene?.materials?.length ?? document.visualMaterials?.length ?? 0,
    diagnostics: renderScene?.diagnostics?.length ?? document.diagnostics?.length ?? 0,
    ...(displaySummary ? {
      geometryFingerprint: displaySummary.geometryHash,
      storedTriangles: displaySummary.storedTriangleCount,
      discardedDegenerateTriangles: displaySummary.discardedDegenerateTriangleCount,
      tessellationBlocks: `${displaySummary.decodedBlockCount} decoded · ${displaySummary.rejectedBlockCount} rejected`,
      normalCoverage: `${displaySummary.savedNormalMeshCount} saved · ${displaySummary.missingNormalMeshCount} missing · ${displaySummary.discardedNormalMeshCount} discarded`,
    } : {}),
  };
  if (triangleCount) return { model, objectUrls: [] as string[] };

  const preview = configuration?.previewPng ?? document.previewPng ?? document.sheets?.[0]?.previewPng;
  if (!preview) return { model, objectUrls: [] as string[] };
  const objectUrl = URL.createObjectURL(new Blob([preview], { type: "image/png" }));
  try {
    const texture = await new THREE.TextureLoader().loadAsync(objectUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    const width = Number(texture.image?.naturalWidth ?? texture.image?.width ?? 1);
    const height = Number(texture.image?.naturalHeight ?? texture.image?.height ?? 1);
    const aspect = Math.max(width / Math.max(height, 1), 0.01);
    const geometry = new THREE.PlaneGeometry(aspect, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true });
    const previewMesh = new THREE.Mesh(geometry, material);
    previewMesh.name = `${document.name} saved preview`;
    previewMesh.userData.solidworks = { kind: "saved preview", sourcePath: document.path, width, height };
    model.add(previewMesh);
    model.userData.solidworksOwnedMaterials ??= [];
    model.userData.solidworksOwnedMaterials.push(material);
    model.userData.solidworksPreviewTexture = texture;
    return { model, objectUrls: [objectUrl] };
  } catch (cause) {
    URL.revokeObjectURL(objectUrl);
    throw cause;
  }
}

export function Viewer({ files, onClose, onOpenFiles }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<any>(null);
  const rootLoaderRef = useRef<((path: string) => Promise<void>) | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("Preparing viewer…");
  const [progress, setProgress] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<RootOption[]>([]);
  const [activeRoot, setActiveRoot] = useState("");
  const [tree, setTree] = useState<TreeItem | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [properties, setProperties] = useState<PropertySection[]>([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("perspective");
  const [twoSided, setTwoSided] = useState(false);
  const twoSidedRef = useRef(twoSided);
  twoSidedRef.current = twoSided;
  const [toolMode, setToolMode] = useState<ToolMode>("move");
  const [openMenu, setOpenMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [rootQuery, setRootQuery] = useState("");
  const [rootType, setRootType] = useState("all");
  const [, refreshVisibility] = useState(0);
  const [stats, setStats] = useState({ objects: 0, triangles: 0 });

  const title = activeRoot || files[0]?.name || "CAD workspace";
  const fileSize = useMemo(() => files.reduce((total, file) => total + file.size, 0), [files]);
  const rootTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const root of roots) {
      const type = extension(root.path).toLowerCase() || "other";
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  }, [roots]);
  const filteredRoots = useMemo(() => {
    const query = rootQuery.trim().toLocaleLowerCase();
    return roots.filter((root) => (rootType === "all" || extension(root.path).toLowerCase() === rootType)
      && (!query || `${root.path} ${root.kind}`.toLocaleLowerCase().includes(query)));
  }, [rootQuery, rootType, roots]);

  const selectObject = useCallback((object: any, hit?: any) => {
    const engine = engineRef.current;
    if (!engine || !object) return;
    if (engine.helper) {
      engine.scene.remove(engine.helper);
      engine.helper.geometry?.dispose?.();
      engine.helper.material?.dispose?.();
    }
    const fusionFaceHit = hit ? resolveFusionThreeFaceHit(hit) : undefined;
    engine.helper = fusionFaceHit ? createFusionThreeFaceHighlight(engine, hit) : undefined;
    engine.helper ??= new engine.THREE.BoxHelper(object, 0xf2a900);
    engine.helper.renderOrder = fusionFaceHit ? 10_000 : 20;
    engine.scene.add(engine.helper);
    setSelected(object);
    setProperties(objectProperties(object, fusionFaceHit ? { ...hit, fusionFace: fusionFaceHit.face } : hit));
  }, []);

  const clearSelection = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.helper) {
      engine.scene.remove(engine.helper);
      engine.helper.geometry?.dispose?.();
      engine.helper.material?.dispose?.();
      engine.helper = null;
    }
    setSelected(null);
    setProperties([]);
  }, []);

  const toggleObjectVisibility = useCallback((object: any) => {
    object.visible = !object.visible;
    refreshVisibility((revision) => revision + 1);
  }, []);

  useEffect(() => {
    let disposed = false;
    let animation = 0;
    let resizeObserver: ResizeObserver | undefined;
    let workspace: any;
    const fusionSnapshots: any[] = [];
    let rootController: AbortController | undefined;
    let rootGeneration = 0;

    const start = async () => {
      try {
        setError(null);
        setStatus("Loading the private 3D engine…");
        setProgress(10);
        const runtime = await loadCadRuntime();
        if (disposed) return;
        const { THREE, OrbitControls, Inventor, InventorThree, Nx, Catia, CatiaV4, Fusion, SolidWorks, SolidWorksThree } = runtime;
        const canvas = canvasRef.current!;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0x111719, 1);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111719);
        scene.fog = new THREE.FogExp2(0x111719, 0.00035);
        const perspective = new THREE.PerspectiveCamera(42, 1, 0.001, 1e8);
        const linear = new THREE.OrthographicCamera(-5, 5, 5, -5, -1e7, 1e7);
        perspective.position.set(6, 4.5, 7);
        linear.position.copy(perspective.position);
        const controls = new OrbitControls(perspective, canvas);
        const clock = new THREE.Clock();
        controls.enableDamping = true;
        controls.dampingFactor = 0.075;
        controls.screenSpacePanning = true;
        controls.zoomToCursor = true;
        controls.zoomSpeed = 2;
        controls.minDistance = 0;
        controls.maxDistance = Infinity;
        controls.minZoom = 0;
        controls.maxZoom = Infinity;
        const hemisphere = new THREE.HemisphereLight(0xeaf3f3, 0x263033, 2.2);
        const key = new THREE.DirectionalLight(0xffffff, 3.2);
        key.position.set(8, 12, 7);
        const rim = new THREE.DirectionalLight(0xa7d5d0, 1.25);
        rim.position.set(-8, 5, -7);
        scene.add(hemisphere, key, rim);
        const grid = new THREE.GridHelper(20, 20, 0x425052, 0x252f31);
        grid.material.transparent = true;
        grid.material.opacity = 0.55;
        scene.add(grid);
        const engine: any = {
          runtime,
          THREE,
          renderer,
          scene,
          perspective,
          linear,
          camera: perspective,
          controls,
          grid,
          model: null,
          helper: null,
          bounds: null,
          boundsCenter: new THREE.Vector3(),
          cameraDirection: new THREE.Vector3(),
          centerOffset: new THREE.Vector3(),
          modelSize: 10,
          originalMaterialSides: new WeakMap<object, number>(),
        };
        engineRef.current = engine;

        const resize = () => {
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          renderer.setSize(rect.width, rect.height, false);
          perspective.aspect = rect.width / rect.height;
          perspective.updateProjectionMatrix();
          const height = engine.orthoHeight ?? 10;
          linear.left = -height * rect.width / rect.height / 2;
          linear.right = height * rect.width / rect.height / 2;
          linear.top = height / 2;
          linear.bottom = -height / 2;
          linear.updateProjectionMatrix();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();

        const animate = () => {
          if (disposed) return;
          engine.mixer?.update(Math.min(clock.getDelta(), 0.1));
          controls.update();
          if (engine.model && engine.camera === perspective) {
            const surfaceDistance = engine.bounds.distanceToPoint(perspective.position);
            const centerDistance = perspective.position.distanceTo(engine.bounds.getCenter(engine.boundsCenter));
            const { near, far } = InventorThree.computeInventorPerspectiveClipPlanes(
              engine.modelSize,
              surfaceDistance,
              centerDistance,
            );
            if (perspective.near !== near || perspective.far !== far) {
              perspective.near = near;
              perspective.far = far;
              perspective.updateProjectionMatrix();
            }
          } else if (engine.model && engine.camera === linear) {
            // Orthographic depth is linear, so the enormous symmetric range
            // previously used here discarded most of the depth buffer's
            // precision. Keep the complete model and grid in front of the
            // camera while tightly bounding the useful depth interval.
            linear.getWorldDirection(engine.cameraDirection);
            engine.centerOffset.copy(engine.bounds.getCenter(engine.boundsCenter)).sub(linear.position);
            const centerDepth = engine.centerOffset.dot(engine.cameraDirection);
            const depthRadius = engine.modelSize * 0.75;
            const near = Math.max(0, centerDepth - depthRadius);
            const far = Math.max(centerDepth + depthRadius, near + engine.modelSize * 0.01, 1e-6);
            if (linear.near !== near || linear.far !== far) {
              linear.near = near;
              linear.far = far;
              linear.updateProjectionMatrix();
            }
          }
          engine.helper?.update?.();
          renderer.render(scene, engine.camera);
          animation = requestAnimationFrame(animate);
        };
        animate();

        const visibleGeometryBounds = (object: any) => {
          object.updateWorldMatrix(true, true);
          const bounds = new THREE.Box3();
          const objectBounds = new THREE.Box3();
          object.traverseVisible((child: any) => {
            const geometry = child.geometry;
            const materialVisible = Array.isArray(child.material)
              ? child.material.some((material: any) => material?.visible !== false)
              : child.material?.visible !== false;
            if (!geometry?.attributes?.position?.count || !materialVisible) return;
            // VRMLLoader represents Background nodes as radius-10,000 sky/ground
            // spheres beneath a renderOrder=-Infinity group. They are scenery,
            // not model geometry, and including them makes the camera frame the
            // background sphere instead of the actual model.
            for (let ancestor = child; ancestor && ancestor !== object; ancestor = ancestor.parent) {
              if (ancestor.renderOrder === -Infinity) return;
            }
            geometry.computeBoundingBox?.();
            if (!geometry.boundingBox?.isEmpty()) {
              objectBounds.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld);
              bounds.union(objectBounds);
            }
          });
          return bounds;
        };

        const frameObject = (object = engine.model) => {
          if (!object) return;
          // Adapter objects can carry conservative/native bounds. Frame from the
          // actual rendered geometry so scaled Factory/Vault assemblies fit tightly.
          const bounds = visibleGeometryBounds(object);
          if (bounds.isEmpty()) return;
          const center = bounds.getCenter(new THREE.Vector3());
          const sizeVector = bounds.getSize(new THREE.Vector3());
          const size = Math.max(sizeVector.length(), 1e-9);
          const radius = Math.max(size / 2, 1e-9);
          engine.bounds = bounds;
          engine.modelSize = size;
          if (scene.fog?.isFogExp2) scene.fog.density = Math.min(0.002, 0.25 / size);
          controls.target.copy(center);
          const direction = new THREE.Vector3(1, 0.72, 1).normalize();
          const rect = canvas.getBoundingClientRect();
          const aspect = rect.width / Math.max(rect.height, 1);
          const verticalFov = THREE.MathUtils.degToRad(perspective.fov);
          const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
          const fitFov = Math.min(verticalFov, horizontalFov);
          const distance = radius / Math.max(Math.sin(fitFov / 2), 0.01) * 1.08;
          perspective.position.copy(center).addScaledVector(direction, distance);
          const perspectiveClip = InventorThree.computeInventorPerspectiveClipPlanes(size, distance - radius, distance);
          perspective.near = perspectiveClip.near;
          perspective.far = perspectiveClip.far;
          perspective.updateProjectionMatrix();
          linear.position.copy(perspective.position);
          linear.near = 0;
          linear.far = Math.max(distance + size * 0.75, 1e-6);
          linear.zoom = 1;
          engine.orthoHeight = radius * 2.16;
          linear.left = -engine.orthoHeight * rect.width / Math.max(rect.height, 1) / 2;
          linear.right = engine.orthoHeight * rect.width / Math.max(rect.height, 1) / 2;
          linear.top = engine.orthoHeight / 2;
          linear.bottom = -engine.orthoHeight / 2;
          linear.updateProjectionMatrix();
          grid.position.set(center.x, bounds.min.y, center.z);
          grid.scale.setScalar(Math.max(size / 20, 0.001));
          controls.update();
        };
        engine.frame = frameObject;

        const releaseModel = () => {
          engine.stepSource = null;
          if (!engine.model) return;
          if (engine.mixer) {
            engine.mixer.stopAllAction();
            engine.mixer.uncacheRoot(engine.model);
            engine.mixer = null;
          }
          scene.remove(engine.model);
          if (engine.model.userData?.solidworksDocument) {
            engine.model.userData.solidworksPreviewTexture?.dispose?.();
            SolidWorksThree.disposeSolidWorksThreeGroup?.(engine.model);
          } else if (!disposeNxThreeGroup(engine.model) && !disposeCatiaThreeGroup(engine.model) && !disposeFusionThreeGroup(engine.model) && !disposeDemo3DModel(engine.model)) InventorThree.disposeInventorThreeGroup?.(engine.model);
          for (const url of engine.objectUrls ?? []) URL.revokeObjectURL(url);
          engine.objectUrls = [];
          engine.model = null;
        };
        engine.releaseModel = releaseModel;

        const presentModel = (model: any, objectUrls: string[] = [], stepSource: { workspace: any; path: string } | null = null) => {
          releaseModel();
          engine.model = model;
          engine.objectUrls = objectUrls;
          engine.stepSource = stepSource;
          scene.add(model);
          if (model.animations?.length) {
            engine.mixer = new THREE.AnimationMixer(model);
            engine.mixer.clipAction(model.animations[0]).play();
            clock.start();
          }
          setModelTwoSided(model, twoSidedRef.current, THREE, engine.originalMaterialSides);
          frameObject(model);
          model.traverse((object: any) => {
            if (object.isPoints && object.material?.isPointsMaterial) {
              object.material.size = Math.max(engine.modelSize * 0.002, 1e-6);
              object.material.needsUpdate = true;
            }
          });
          setTree(buildTree(model));
          let objectCount = 0;
          let triangles = 0;
          model.traverse((object: any) => {
            objectCount += 1;
            if (object.isMesh && object.geometry?.index?.count) triangles += Math.floor(object.geometry.index.count / 3);
            else if (object.isMesh && object.geometry?.attributes?.position?.count) triangles += Math.floor(object.geometry.attributes.position.count / 3);
          });
          setStats({ objects: objectCount, triangles });
          setProgress(100);
          setStatus("Ready");
        };

        const isZipWorkspace = files.length === 1 && /\.zip$/i.test(files[0].name);
        let sharedZipProvider: any;
        let sharedZipInventory: readonly any[] = [];
        if (isZipWorkspace) {
          setStatus("Indexing packaged workspace…");
          setProgress(18);
          sharedZipProvider = await Inventor.ZipFileProvider.open(new Inventor.BlobByteSource(files[0]));
          sharedZipInventory = await sharedZipProvider.list();
          // The Inventor workspace takes ownership of this provider below when
          // applicable. Otherwise retain it here so cleanup still closes it.
          workspace = sharedZipProvider;
        }

        const readSharedZipEntry = async (path: string) => {
          const source = await sharedZipProvider?.open(path);
          if (!source) throw new Error(`Could not read ${path} from the packaged workspace.`);
          try { return await source.read(0, source.size); }
          finally { await source.close?.(); }
        };

        const readSharedZipEntryPrefix = async (path: string, maximumBytes: number) => {
          const source = await sharedZipProvider?.open(path);
          if (!source) throw new Error(`Could not read ${path} from the packaged workspace.`);
          try { return await source.read(0, Math.min(source.size, maximumBytes)); }
          finally { await source.close?.(); }
        };

        const nxFiles = files.filter((file) => /\.(?:prt|xzip)$/i.test(file.name));
        const nxArchiveEntries = sharedZipInventory.filter((item: any) => /\.prt$/i.test(item.path));
        let nxArchive: any;
        if (nxFiles.length || nxArchiveEntries.length) {
          setStatus("Reading Siemens NX workspace…");
          setProgress(22);
          if (nxFiles.length) {
            nxArchive = await Nx.openNxFiles(nxFiles);
          } else {
            const sources = [];
            for (const entry of nxArchiveEntries) sources.push({ name: entry.path, source: await readSharedZipEntry(entry.path) });
            nxArchive = await Nx.openNxFiles(sources);
          }
        }

        const nxDocumentsByPath = new Map<string, any>();
        const nxRootOptions: RootOption[] = [];
        for (const item of nxArchive?.documents ?? []) {
          let path = item.path.replace(/\\/g, "/");
          let suffix = 2;
          while (nxDocumentsByPath.has(path.toLocaleLowerCase())) path = `${suffix++}/${item.path.replace(/\\/g, "/")}`;
          nxDocumentsByPath.set(path.toLocaleLowerCase(), item.document);
          nxRootOptions.push({ path, label: path, kind: `Siemens NX ${item.document.kind}` });
        }
        nxRootOptions.sort((left, right) => {
          const priority = (item: RootOption) => /assembly/i.test(item.kind) ? 0 : /part/i.test(item.kind) ? 1 : /drawing/i.test(item.kind) ? 2 : 3;
          return priority(left) - priority(right) || left.path.localeCompare(right.path, undefined, { numeric: true });
        });

        let openNxRoot: ((path: string) => Promise<void>) | undefined;
        if (nxRootOptions.length) {
          openNxRoot = async (path: string) => {
            if (disposed) return;
            const generation = ++rootGeneration;
            rootController?.abort();
            const controller = new AbortController();
            rootController = controller;
            const isCurrent = () => !disposed && !controller.signal.aborted && generation === rootGeneration;
            const document = nxDocumentsByPath.get(path.toLocaleLowerCase());
            if (!document) throw new Error(`The Siemens NX document ${path} is unavailable.`);
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Preparing Siemens NX geometry for ${path}…`);
            setProgress(72);
            releaseModel();
            const triangleCount = document.meshes.reduce((total: number, mesh: any) => total + mesh.indices.length / 3, 0);
            if (!triangleCount && !document.preview) {
              const detail = document.diagnostics?.[0]?.message;
              throw new Error(detail ?? `No supported embedded JT display geometry was decoded from ${path}.`);
            }
            const loaded = await createNxThreeGroup(runtime, document, path);
            if (!isCurrent()) {
              disposeNxThreeGroup(loaded.model);
              for (const url of loaded.objectUrls) URL.revokeObjectURL(url);
              return;
            }
            setProgress(88);
            presentModel(loaded.model, loaded.objectUrls);
          };
        }

        const solidWorksFiles = files.filter((file) => /\.(?:sldprt|sldasm|slddrw)$/i.test(file.name));
        let solidWorksWorkspace: any;
        if (solidWorksFiles.length) {
          setStatus("Reading SolidWorks workspace…");
          setProgress(22);
          solidWorksWorkspace = await SolidWorks.openSolidWorksWorkspace(solidWorksFiles.map((file) => ({ path: filePath(file), data: file })));
        } else if (sharedZipProvider) {
          const entries = sharedZipInventory.filter((item: any) => /\.(?:sldprt|sldasm|slddrw)$/i.test(item.path));
          if (entries.length) {
            setStatus("Reading SolidWorks documents…");
            setProgress(22);
            const workspaceFiles = [];
            for (const entry of entries) workspaceFiles.push({ path: entry.path, data: await readSharedZipEntry(entry.path) });
            solidWorksWorkspace = await SolidWorks.openSolidWorksWorkspace(workspaceFiles);
          }
        }

        let solidWorksRootOptions: RootOption[] = [];
        let openSolidWorksRoot: ((path: string) => Promise<void>) | undefined;
        if (solidWorksWorkspace) {
          setStatus("Finding SolidWorks documents…");
          setProgress(34);
          const candidates = await solidWorksWorkspace.findRootCandidates();
          const candidatePaths = new Set(candidates.map((item: any) => item.path.toLocaleLowerCase()));
          solidWorksRootOptions = [...solidWorksWorkspace.entries]
            .sort((left: any, right: any) => Number(!candidatePaths.has(left.path.toLocaleLowerCase())) - Number(!candidatePaths.has(right.path.toLocaleLowerCase()))
              || left.path.localeCompare(right.path, undefined, { numeric: true }))
            .map((item: any) => ({ path: item.path, label: item.path, kind: kindFor(item.path) }));

          openSolidWorksRoot = async (path: string) => {
            if (disposed) return;
            const generation = ++rootGeneration;
            rootController?.abort();
            const controller = new AbortController();
            rootController = controller;
            const isCurrent = () => !disposed && !controller.signal.aborted && generation === rootGeneration;
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Parsing ${path}…`);
            setProgress(58);
            releaseModel();
            const document = await solidWorksWorkspace.openDocument(path);
            if (!isCurrent()) return;
            let renderScene: any;
            if (document.type === "assembly") {
              setStatus("Resolving linked SolidWorks components…");
              setProgress(70);
              renderScene = await solidWorksWorkspace.buildRenderScene(path, { signal: controller.signal });
              if (!isCurrent()) return;
            }
            const hasGeometry = renderScene?.triangleCount || document.displayMeshes?.length;
            setStatus(hasGeometry ? "Preparing SolidWorks geometry…" : "Loading saved SolidWorks preview…");
            setProgress(82);
            const loaded = await createSolidWorksModel(runtime, document, renderScene);
            if (!isCurrent()) {
              loaded.model.userData.solidworksPreviewTexture?.dispose?.();
              SolidWorksThree.disposeSolidWorksThreeGroup?.(loaded.model);
              for (const url of loaded.objectUrls) URL.revokeObjectURL(url);
              return;
            }
            presentModel(loaded.model, loaded.objectUrls);
          };
        }

        const catiaFiles = files.filter((file) => /\.(?:catpart|catproduct|catshape|cgr)$/i.test(file.name));
        let catiaWorkspace: any;
        if (catiaFiles.length) {
          setStatus("Reading CATIA workspace…");
          setProgress(22);
          catiaWorkspace = await Catia.openCatiaWorkspace(files);
        } else if (sharedZipProvider && sharedZipInventory.some((item: any) => /\.(?:catpart|catproduct|catshape|cgr)$/i.test(item.path))) {
          setStatus("Reading CATIA workspace…");
          setProgress(36);
          catiaWorkspace = await Catia.openCatiaWorkspace({
            list: async () => sharedZipInventory,
            read: readSharedZipEntry,
          });
        }

        let catiaRootOptions: RootOption[] = [];
        let openCatiaRoot: ((path: string) => Promise<void>) | undefined;
        if (catiaWorkspace) {
          setStatus("Finding CATIA documents…");
          setProgress(40);
          catiaRootOptions = catiaWorkspace.rootPaths.map((path: string) => ({ path, label: path, kind: kindFor(path) }));

          openCatiaRoot = async (path: string) => {
            if (disposed) return;
            const generation = ++rootGeneration;
            rootController?.abort();
            const controller = new AbortController();
            rootController = controller;
            const isCurrent = () => !disposed && !controller.signal.aborted && generation === rootGeneration;
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Parsing ${path}…`);
            setProgress(58);
            releaseModel();
            const document = await catiaWorkspace.openDocument(path);
            if (!isCurrent()) return;
            setStatus(document.kind === "product" ? "Resolving linked CATIA components…" : "Decoding CATIA geometry…");
            setProgress(70);
            const renderScene = await Catia.createCatiaRenderScene(catiaWorkspace, document, { resolveReferences: true });
            if (!isCurrent()) return;
            if (!renderScene.meshes.length && !renderScene.lineSets.length) {
              const detail = renderScene.diagnostics.find((item: any) => item.severity === "warning")?.message;
              throw new Error(detail ?? `No supported 3D geometry was decoded from ${path}. For CATProduct assemblies, select or ZIP the referenced CATPart files too.`);
            }
            setStatus("Preparing CATIA materials and geometry…");
            setProgress(84);
            const model = createCatiaThreeGroup(runtime, renderScene, document);
            if (!isCurrent()) {
              disposeCatiaThreeGroup(model);
              return;
            }
            presentModel(model);
          };
        }

        const catiaV4Files = files.filter((file) => /\.model$/i.test(file.name));
        let catiaV4Workspace: any;
        if (catiaV4Files.length) {
          setStatus("Reading CATIA V4 workspace…");
          setProgress(22);
          catiaV4Workspace = await CatiaV4.openCatiaV4Workspace(files);
        } else if (sharedZipProvider && sharedZipInventory.some((item: any) => /\.model$/i.test(item.path))) {
          setStatus("Reading CATIA V4 workspace…");
          setProgress(36);
          catiaV4Workspace = await CatiaV4.openCatiaV4Workspace({
            list: async () => sharedZipInventory,
            read: readSharedZipEntry,
            readPrefix: readSharedZipEntryPrefix,
          });
        }

        let catiaV4RootOptions: RootOption[] = [];
        let openCatiaV4Root: ((path: string) => Promise<void>) | undefined;
        if (catiaV4Workspace) {
          setStatus("Finding CATIA V4 MODEL documents…");
          setProgress(40);
          catiaV4RootOptions = catiaV4Workspace.rootPaths.map((path: string) => ({ path, label: path, kind: kindFor(path) }));

          openCatiaV4Root = async (path: string) => {
            if (disposed) return;
            const generation = ++rootGeneration;
            rootController?.abort();
            const controller = new AbortController();
            rootController = controller;
            const isCurrent = () => !disposed && !controller.signal.aborted && generation === rootGeneration;
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Parsing ${path}…`);
            setProgress(58);
            releaseModel();
            const document = await catiaV4Workspace.openDocument(path);
            if (!isCurrent()) return;
            setStatus("Decoding CATIA V4 STEP companion geometry…");
            setProgress(70);
            const renderScene = await CatiaV4.createCatiaV4RenderScene(catiaV4Workspace, document);
            if (!isCurrent()) return;
            if (!renderScene.meshes.length && !renderScene.lineSets.length) {
              const detail = renderScene.diagnostics.find((item: any) => item.severity === "warning")?.message;
              throw new Error(detail ?? `No supported 3D geometry was decoded from ${path}. Select or ZIP its same-name .stp or .step companion too.`);
            }
            setStatus("Preparing CATIA V4 geometry…");
            setProgress(84);
            const model = createCatiaThreeGroup(runtime, renderScene, document);
            if (!isCurrent()) {
              disposeCatiaThreeGroup(model);
              return;
            }
            presentModel(model);
          };
        }

        const fusionRootOpeners = new Map<string, () => Promise<any>>();
        const addFusionRoot = (preferredPath: string, scope: string, open: () => Promise<any>) => {
          let path = preferredPath.replace(/\\/g, "/");
          if (fusionRootOpeners.has(path.toLocaleLowerCase())) path = `${scope.replace(/\\/g, "/")}/${path}`;
          let suffix = 2;
          const basePath = path;
          while (fusionRootOpeners.has(path.toLocaleLowerCase())) path = `${basePath} (${suffix++})`;
          fusionRootOpeners.set(path.toLocaleLowerCase(), open);
          return path;
        };
        const fusionRootOptions: RootOption[] = [];
        const fusionFiles = files.filter((file) => /\.(?:f3d|f3z)$/i.test(file.name));
        for (const file of fusionFiles) {
          const path = filePath(file);
          if (/\.f3d$/i.test(file.name)) {
            const rootPath = addFusionRoot(path, path, () => Fusion.parseFusionDocument(file, { name: path }));
            fusionRootOptions.push({ path: rootPath, label: rootPath, kind: kindFor(rootPath) });
            continue;
          }

          setStatus(`Indexing ${path}…`);
          setProgress(30);
          const opened = await Fusion.openFusion(file, { name: path });
          if (opened.kind === "document") {
            await opened.document.close();
            const rootPath = addFusionRoot(path, path, async () => {
              const next = await Fusion.openFusion(file, { name: path });
              if (next.kind !== "document") throw new Error(`${path} is not a Fusion design document.`);
              return next.document;
            });
            fusionRootOptions.push({ path: rootPath, label: rootPath, kind: kindFor(rootPath) });
          } else if (opened.kind === "snapshot") {
            fusionSnapshots.push(opened.snapshot);
            for (const entry of opened.snapshot.entries.filter((item: any) => item.category === "fusion")) {
              const rootPath = addFusionRoot(entry.name, path, async () => {
                const nested = await opened.snapshot.open(entry.name);
                if (nested.kind !== "document") throw new Error(`${entry.name} is not a Fusion design document.`);
                return nested.document;
              });
              fusionRootOptions.push({ path: rootPath, label: rootPath, kind: kindFor(rootPath) });
            }
          }
        }
        if (sharedZipProvider) {
          for (const entry of sharedZipInventory.filter((item: any) => /\.f3d$/i.test(item.path))) {
            const rootPath = addFusionRoot(entry.path, files[0].name, async () => Fusion.parseFusionDocument(
              await readSharedZipEntry(entry.path),
              { name: entry.path },
            ));
            fusionRootOptions.push({ path: rootPath, label: rootPath, kind: kindFor(rootPath) });
          }
        }

        let openFusionRoot: ((path: string) => Promise<void>) | undefined;
        if (fusionRootOptions.length) {
          openFusionRoot = async (path: string) => {
            if (disposed) return;
            const generation = ++rootGeneration;
            rootController?.abort();
            const controller = new AbortController();
            rootController = controller;
            const isCurrent = () => !disposed && !controller.signal.aborted && generation === rootGeneration;
            const openDocument = fusionRootOpeners.get(path.toLocaleLowerCase());
            if (!openDocument) throw new Error(`The Fusion document ${path} is unavailable.`);
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Parsing ${path}…`);
            setProgress(58);
            releaseModel();
            const document = await openDocument();
            try {
              if (!isCurrent()) return;
              setStatus("Decoding Fusion ShapeManager geometry…");
              setProgress(70);
              const renderScene = await Fusion.createFusionRenderScene(document);
              if (!isCurrent()) return;
              if (!renderScene.meshes.length) {
                const detail = renderScene.diagnostics.find((item: any) => item.severity === "warning")?.message;
                throw new Error(detail ?? `No supported 3D geometry was decoded from ${path}.`);
              }
              setStatus("Preparing Fusion materials and geometry…");
              setProgress(84);
              const model = createFusionThreeGroup(runtime, renderScene, document, path);
              if (!isCurrent()) {
                disposeFusionThreeGroup(model);
                return;
              }
              presentModel(model);
            } finally {
              await document.close?.();
            }
          };
        }

        const directFiles = files.filter((file) => isDirectModelFile(file.name));
        const directFilesByPath = new Map(directFiles.map((file) => [filePath(file).toLocaleLowerCase(), file]));
        const directRootOptions = directFiles.map((file) => ({ path: filePath(file), label: filePath(file), kind: kindFor(file.name) }));
        let openDirectRoot: ((path: string) => Promise<void>) | undefined;
        if (directFiles.length) {
          openDirectRoot = async (path: string) => {
            const generation = ++rootGeneration;
            rootController?.abort();
            const controller = new AbortController();
            rootController = controller;
            const isCurrent = () => !disposed && !controller.signal.aborted && generation === rootGeneration;
            const file = directFilesByPath.get(path.toLocaleLowerCase());
            if (!file) throw new Error(`Could not find ${path} in the selected files.`);
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Opening ${path}…`);
            setProgress(35);
            releaseModel();
            const loaded = await loadThreeModel(runtime, file, files, (nextStatus, nextProgress) => {
              if (!isCurrent()) return;
              setStatus(nextStatus);
              setProgress(nextProgress);
            });
            if (!isCurrent()) {
              if (!disposeCatiaThreeGroup(loaded.model) && !disposeDemo3DModel(loaded.model)) InventorThree.disposeInventorThreeGroup?.(loaded.model);
              for (const url of loaded.objectUrls) URL.revokeObjectURL(url);
              return;
            }
            setProgress(86);
            presentModel(loaded.model, loaded.objectUrls);
          };
        }

        const archiveDirectEntries = sharedZipInventory.filter((item: any) => isDirectModelFile(item.path));
        const archiveDirectEntriesByPath = new Map(archiveDirectEntries.map((item: any) => [item.path.toLocaleLowerCase(), item]));
        const archiveDirectRootOptions = archiveDirectEntries.map((item: any) => ({ path: item.path, label: item.path, kind: kindFor(item.path) }));
        const archiveFileCache = new Map<string, Promise<File>>();
        const extractArchiveFile = (entry: any) => {
          const key = entry.path.toLocaleLowerCase();
          let pending = archiveFileCache.get(key);
          if (!pending) {
            pending = readSharedZipEntry(entry.path).then((bytes) => {
              const name = entry.path.replace(/\\/g, "/").split("/").pop() || "archive-entry";
              const file = new File([bytes], name);
              Object.defineProperty(file, "webkitRelativePath", { configurable: true, value: entry.path.replace(/\\/g, "/") });
              return file;
            });
            archiveFileCache.set(key, pending);
          }
          return pending;
        };
        let openArchiveDirectRoot: ((path: string) => Promise<void>) | undefined;
        if (archiveDirectEntries.length) {
          openArchiveDirectRoot = async (path: string) => {
            const generation = ++rootGeneration;
            rootController?.abort();
            const controller = new AbortController();
            rootController = controller;
            const isCurrent = () => !disposed && !controller.signal.aborted && generation === rootGeneration;
            const entry = archiveDirectEntriesByPath.get(path.toLocaleLowerCase());
            if (!entry) throw new Error(`Could not find ${path} in the packaged workspace.`);
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Extracting ${path}…`);
            setProgress(35);
            releaseModel();
            const normalizedPath = path.replace(/\\/g, "/");
            const directory = normalizedPath.includes("/") ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/") + 1).toLocaleLowerCase() : "";
            const companionEntries = sharedZipInventory.filter((item: any) => isResourceFile(item.path)
              && (!directory || item.path.replace(/\\/g, "/").toLocaleLowerCase().startsWith(directory)));
            const modelFile = await extractArchiveFile(entry);
            const companionFiles = await Promise.all(companionEntries.map(extractArchiveFile));
            if (!isCurrent()) return;
            const loaded = await loadThreeModel(runtime, modelFile, [modelFile, ...companionFiles], (nextStatus, nextProgress) => {
              if (!isCurrent()) return;
              setStatus(nextStatus);
              setProgress(nextProgress);
            });
            if (!isCurrent()) {
              if (!disposeCatiaThreeGroup(loaded.model) && !disposeDemo3DModel(loaded.model)) InventorThree.disposeInventorThreeGroup?.(loaded.model);
              for (const url of loaded.objectUrls) URL.revokeObjectURL(url);
              return;
            }
            setProgress(86);
            presentModel(loaded.model, loaded.objectUrls);
          };
        }

        setStatus("Reading Inventor workspace…");
        setProgress(42);
        const first = files[0];
        const firstName = first.name.toLowerCase();
        const provider = sharedZipProvider
          ?? (files.length === 1 && firstName.endsWith(".zip")
            ? await Inventor.ZipFileProvider.open(new Inventor.BlobByteSource(first))
          : files.length === 1 && firstName.endsWith(".faf")
            ? await Inventor.FactoryAssetFileProvider.open(new Inventor.BlobByteSource(first))
            : new Inventor.MemoryFileProvider(Object.fromEntries(files.map((file) => [(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, file]))));
        workspace ??= provider;
        const inventory = sharedZipProvider ? sharedZipInventory : await provider.list();
        const hasInventorDocuments = inventory.some((item: any) => /\.(?:ipt|iam|idw|ipn|ide|dwg|dxf)$/i.test(item.path));
        let inventorWorkspace: any;
        if (hasInventorDocuments) {
          inventorWorkspace = await Inventor.openInventorWorkspace(provider, {
            decodeLevel: "render",
            discoverAppearanceLibraries: true,
            onProgress: (event: any) => {
              const ratio = event.total ? event.completed / event.total : 0;
              setProgress(Math.min(56, 42 + ratio * 14));
              setStatus(event.path ? `Reading ${event.path}…` : "Reading Inventor workspace…");
            },
          });
          workspace = inventorWorkspace;
          const dwgDecoder = Inventor.createAcadTsDwgDecoder({ unitScaleToCentimetres: 0.1, layout: "model" });
          inventorWorkspace.registerExternalDecoder(dwgDecoder);
        }
        const rootMap = new Map<string, RootOption>();
        for (const item of inventorWorkspace?.rootCandidates ?? []) rootMap.set(item.path.toLowerCase(), { path: item.path, label: item.path, kind: kindFor(item.path) });
        for (const item of inventory) if (/\.(dwg|dxf)$/i.test(item.path)) rootMap.set(item.path.toLowerCase(), { path: item.path, label: item.path, kind: kindFor(item.path) });
        const inventorRootOptions = [...rootMap.values()].sort((left, right) => {
          const priority = (item: RootOption) => extension(item.path) === "iam" ? 0 : extension(item.path) === "ipt" ? 1 : 2;
          return priority(left) - priority(right) || left.path.localeCompare(right.path, undefined, { numeric: true });
        });

        const openInventorRoot = async (path: string) => {
          if (disposed) return;
          const generation = ++rootGeneration;
          rootController?.abort();
          const controller = new AbortController();
          rootController = controller;
          const { signal } = controller;
          const isCurrent = () => !disposed && !signal.aborted && generation === rootGeneration;
          let model: any;

          try {
            setActiveRoot(path);
            setTree(null);
            clearSelection();
            setError(null);
            setStatus(`Opening ${path}…`);
            setProgress(58);
            releaseModel();
            if (/\.dxf$/i.test(path)) {
              const source = await inventorWorkspace.provider.open(path);
              if (!source) throw new Error(`Could not read ${path}.`);
              const bytes = await source.read(0, source.size);
              await source.close?.();
              if (!isCurrent()) return;
              setStatus("Building DXF geometry…");
              setProgress(72);
              model = buildDxfGroup(runtime, bytes).group;
            } else {
              const isDwg = /\.dwg$/i.test(path);
              const document = isDwg ? undefined : await inventorWorkspace.openDocument(path, { signal });
              if (!isCurrent()) return;
              setStatus(isDwg ? "Decoding AutoCAD geometry…" : "Resolving linked components…");
              setProgress(68);
              const renderScene = isDwg
                ? await Inventor.createInventorExternalRenderScene(inventorWorkspace, path)
                : await Inventor.createInventorRenderScene(inventorWorkspace, document, { resolveReferences: true, showWireframeFallback: true, signal });
              if (!isCurrent()) return;
              setStatus("Preparing materials and geometry…");
              setProgress(82);
              let textures: any[] = [];
              if (!isDwg) {
                const appearance = await InventorThree.loadInventorAppearanceTextures(renderScene, inventorWorkspace, {
                  signal,
                  onProgress: (event: any) => isCurrent() && event.total && setProgress(82 + (event.completed / event.total) * 8),
                });
                textures = appearance.textures;
              }
              if (!isCurrent()) return;
              model = await InventorThree.createInventorThreeGroup(renderScene, {
                three: THREE,
                unitScale: 0.01,
                enhancedMaterials: true,
                appearanceTextures: textures,
                signal,
              });
            }
            if (!isCurrent()) {
              InventorThree.disposeInventorThreeGroup?.(model);
              return;
            }
            presentModel(model, [], /\.(?:ipt|iam)$/i.test(path) ? { workspace: inventorWorkspace, path } : null);
          } catch (cause) {
            if (!isCurrent()) return;
            throw cause;
          }
        };

        const rootOptions = [...inventorRootOptions, ...nxRootOptions, ...fusionRootOptions, ...solidWorksRootOptions, ...catiaRootOptions, ...catiaV4RootOptions, ...directRootOptions, ...archiveDirectRootOptions];
        if (!rootOptions.length) throw new Error("No supported CAD document was found in this selection.");
        setRoots(rootOptions);
        const openWorkspaceRoot = async (path: string) => {
          if (nxDocumentsByPath.has(path.toLocaleLowerCase())) {
            if (!openNxRoot) throw new Error(`The Siemens NX workspace for ${path} is unavailable.`);
            return openNxRoot(path);
          }
          if (/\.(?:sldprt|sldasm|slddrw)$/i.test(path)) {
            if (!openSolidWorksRoot) throw new Error(`The SolidWorks workspace for ${path} is unavailable.`);
            return openSolidWorksRoot(path);
          }
          if (/\.(?:catpart|catproduct|catshape|cgr)$/i.test(path)) {
            if (!openCatiaRoot) throw new Error(`The CATIA workspace for ${path} is unavailable.`);
            return openCatiaRoot(path);
          }
          if (/\.model$/i.test(path)) {
            if (!openCatiaV4Root) throw new Error(`The CATIA V4 workspace for ${path} is unavailable.`);
            return openCatiaV4Root(path);
          }
          if (/\.f3d$/i.test(path) || fusionRootOpeners.has(path.toLocaleLowerCase())) {
            if (!openFusionRoot) throw new Error(`The Fusion workspace for ${path} is unavailable.`);
            return openFusionRoot(path);
          }
          if (archiveDirectEntriesByPath.has(path.toLocaleLowerCase())) {
            if (!openArchiveDirectRoot) throw new Error(`The packaged model loader for ${path} is unavailable.`);
            return openArchiveDirectRoot(path);
          }
          if (directFilesByPath.has(path.toLocaleLowerCase())) {
            if (!openDirectRoot) throw new Error(`The model loader for ${path} is unavailable.`);
            return openDirectRoot(path);
          }
          if (!inventorWorkspace) throw new Error(`The Inventor workspace for ${path} is unavailable.`);
          return openInventorRoot(path);
        };
        rootLoaderRef.current = openWorkspaceRoot;
        await openWorkspaceRoot(rootOptions[0].path);
      } catch (cause) {
        console.error(cause);
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setStatus("Could not open this model");
          setProgress(100);
        }
      }
    };

    start();
    return () => {
      disposed = true;
      exportControllerRef.current?.abort();
      rootController?.abort();
      rootLoaderRef.current = null;
      cancelAnimationFrame(animation);
      resizeObserver?.disconnect();
      workspace?.close?.().catch(console.warn);
      for (const snapshot of fusionSnapshots) snapshot.close?.().catch(console.warn);
      const engine = engineRef.current;
      if (engine) {
        engine.controls?.dispose?.();
        engine.renderer?.dispose?.();
        engine.releaseModel?.();
      }
      engineRef.current = null;
    };
  }, [files, clearSelection]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.model) return;
    setModelTwoSided(engine.model, twoSided, engine.THREE, engine.originalMaterialSides);
  }, [twoSided]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const previous = engine.camera;
    const next = viewMode === "linear" ? engine.linear : engine.perspective;
    if (previous !== next) {
      next.position.copy(previous.position);
      next.quaternion.copy(previous.quaternion);
      next.up.copy(previous.up);
      engine.camera = next;
      engine.controls.object = next;
      engine.controls.update();
    }
  }, [viewMode, status]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const { THREE, controls } = engine;
    controls.mouseButtons.LEFT = toolMode === "move" ? THREE.MOUSE.ROTATE : undefined;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = toolMode === "move" ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  }, [toolMode, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onPointer = (event: PointerEvent) => {
      if (toolMode !== "select" || event.button !== 0) return;
      const engine = engineRef.current;
      if (!engine?.model) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new engine.THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      const raycaster = new engine.THREE.Raycaster();
      raycaster.params.Line.threshold = Math.max(engine.modelSize * 0.002, 0.01);
      raycaster.setFromCamera(pointer, engine.camera);
      const hit = raycaster.intersectObject(engine.model, true).find((item: any) => item.object.visible);
      if (hit) selectObject(hit.object, hit); else clearSelection();
    };
    const onDoubleClick = (event: MouseEvent) => {
      const engine = engineRef.current;
      if (!engine?.model) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new engine.THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      const raycaster = new engine.THREE.Raycaster();
      raycaster.setFromCamera(pointer, engine.camera);
      const hit = raycaster.intersectObject(engine.model, true)[0];
      if (hit) engine.controls.target.copy(hit.point);
    };
    canvas.addEventListener("pointerup", onPointer);
    canvas.addEventListener("dblclick", onDoubleClick);
    return () => { canvas.removeEventListener("pointerup", onPointer); canvas.removeEventListener("dblclick", onDoubleClick); };
  }, [toolMode, selectObject, clearSelection]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("input, select, textarea")) return;
      if (event.key === "1") setViewMode("linear");
      if (event.key === "2") setViewMode("perspective");
      if (event.key.toLowerCase() === "m") setToolMode("move");
      if (event.key.toLowerCase() === "s") setToolMode("select");
      if (event.key.toLowerCase() === "f") engineRef.current?.frame?.();
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [clearSelection]);

  const setPreset = (preset: "front" | "top" | "right" | "iso") => {
    const engine = engineRef.current;
    if (!engine?.model) return;
    const center = engine.bounds.getCenter(new engine.THREE.Vector3());
    const distance = engine.modelSize * 1.25;
    const directions = {
      front: new engine.THREE.Vector3(0, 0, 1),
      top: new engine.THREE.Vector3(0, 1, 0.001),
      right: new engine.THREE.Vector3(1, 0, 0),
      iso: new engine.THREE.Vector3(1, 0.75, 1).normalize(),
    };
    engine.camera.position.copy(center).addScaledVector(directions[preset], distance);
    engine.camera.up.set(0, 1, 0);
    engine.controls.target.copy(center);
    engine.controls.update();
  };

  const goHome = () => {
    engineRef.current?.frame?.();
  };

  const switchRoot = async (path: string) => {
    exportControllerRef.current?.abort();
    try { await rootLoaderRef.current?.(path); }
    catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Could not open this document");
    }
  };

  const exportModel = async (format: ExportFormat) => {
    const engine = engineRef.current;
    if (!engine?.model || exporting) return;
    setExportMenu(false);
    setExporting(format);
    setExportNotice(null);
    const exportController = format === "step" ? new AbortController() : null;
    if (exportController) exportControllerRef.current = exportController;
    try {
      engine.model.updateMatrixWorld(true);
      const runtime = engine.runtime as CadRuntime;
      let data: string | ArrayBuffer | ArrayBufferView | null;
      let mimeType: string;
      let downloadName = `${exportBaseName(title)}.${format}`;

      if (format === "step") {
        const source = engine.stepSource;
        if (!source) throw new Error("Exact STEP export is available only for Inventor parts and assemblies.");
        const result = await runtime.InventorStep.exportInventorWorkspaceToStep(source.workspace, source.path, {
          schema: "AP242",
          assemblyMode: "preserve",
          signal: exportController!.signal,
          onProgress: (event: { phase: string; completed: number; total: number; path?: string }) => {
            const label = STEP_PHASE_LABELS[event.phase] ?? cleanName(event.phase);
            const count = event.total > 1 ? ` · ${event.completed.toLocaleString()}/${event.total.toLocaleString()}` : "";
            setExportNotice(`${label}${count}`);
          },
        });
        data = result.bytes;
        mimeType = "model/step";
        downloadName = result.fileName;
        const { solids, occurrences } = result.statistics;
        setExportNotice(`STEP download created · ${solids.toLocaleString()} solid${solids === 1 ? "" : "s"}${occurrences ? ` · ${occurrences.toLocaleString()} occurrences` : ""}`);
      } else if (format === "glb" || format === "gltf") {
        const gltfData = await new runtime.GLTFExporter().parseAsync(engine.model, {
          binary: format === "glb",
          onlyVisible: false,
          maxTextureSize: 4096,
          animations: engine.model.animations ?? [],
        });
        data = format === "gltf" && typeof gltfData !== "string" ? JSON.stringify(gltfData, null, 2) : gltfData;
        mimeType = format === "glb" ? "model/gltf-binary" : "model/gltf+json";
      } else if (format === "obj") {
        data = new runtime.OBJExporter().parse(engine.model);
        mimeType = "text/plain;charset=utf-8";
      } else if (format === "stl") {
        data = new runtime.STLExporter().parse(engine.model, { binary: true });
        mimeType = "model/stl";
      } else if (format === "ply") {
        data = new runtime.PLYExporter().parse(engine.model, undefined, { binary: true, littleEndian: true });
        mimeType = "application/octet-stream";
      } else {
        data = await new runtime.USDZExporter().parseAsync(engine.model, { onlyVisible: false, maxTextureSize: 2048, animations: engine.model.animations ?? [] });
        mimeType = "model/vnd.usdz+zip";
      }

      if (data == null) throw new Error(`The model contains no geometry supported by ${format.toUpperCase()}.`);
      downloadBlob(new Blob([data as BlobPart], { type: mimeType }), downloadName);
      if (format !== "step") setExportNotice(`${format === "gltf" ? "glTF" : format.toUpperCase()} download created`);
    } catch (cause) {
      console.error(cause);
      setExportNotice(exportController?.signal.aborted
        ? "STEP export cancelled"
        : `Export failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      if (exportControllerRef.current === exportController) exportControllerRef.current = null;
      setExporting(null);
    }
  };

  return (
    <main className={`viewer-shell ${leftOpen ? "left-open" : ""} ${rightOpen ? "right-open" : ""}`}>
      <header className="viewer-header">
        <button className="viewer-brand" onClick={onClose} type="button" aria-label="Back to Native CAD Viewer homepage"><BrandIcon className="viewer-brand-logo" /><span className="viewer-brand-copy">Native CAD Viewer</span></button>
        <div className="document-title">
          <FileBox size={17} />
          <button type="button" onClick={() => { if (roots.length > 1) { setRootQuery(""); setRootType("all"); setOpenMenu(!openMenu); } }} disabled={roots.length < 2} aria-haspopup="dialog" aria-expanded={openMenu}>
            <span>{title.split(/[\\/]/).pop()}</span>{roots.length > 1 && <ChevronDown size={14} />}
          </button>
          <span className="file-meta">{kindFor(title)} · {readableBytes(fileSize)}</span>
          {openMenu && <div className="root-menu" role="dialog" aria-label="Open a model from this selection">
            <div className="root-menu-search">
              <Search size={15} />
              <input
                autoFocus
                value={rootQuery}
                onChange={(event) => setRootQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape") setOpenMenu(false); }}
                placeholder="Filter models and documents…"
                aria-label="Filter available models"
              />
              {rootQuery && <button type="button" onClick={() => setRootQuery("")} aria-label="Clear document filter"><X size={14} /></button>}
            </div>
            <div className="root-type-filters" aria-label="Filter by file type">
              <button type="button" className={rootType === "all" ? "active" : ""} onClick={() => setRootType("all")}>All <b>{roots.length.toLocaleString()}</b></button>
              {rootTypes.map(([type, count]) => <button key={type} type="button" className={rootType === type ? "active" : ""} onClick={() => setRootType(type)} title={`Show only .${type} documents`}>{type.toUpperCase()} <b>{count.toLocaleString()}</b></button>)}
            </div>
            <div className="root-menu-summary"><span>Available models</span><b>{filteredRoots.length.toLocaleString()} / {roots.length.toLocaleString()}</b></div>
            <div className="root-menu-list" role="listbox">
              {filteredRoots.map((root) => <button key={root.path} type="button" role="option" aria-selected={activeRoot === root.path} title={root.path} className={`root-option ${activeRoot === root.path ? "active" : ""}`} onClick={() => { setOpenMenu(false); setRootQuery(""); setRootType("all"); switchRoot(root.path); }}><IconForKind kind={root.kind} /><span><strong title={root.path}>{root.label}</strong><small>{root.kind} · .{extension(root.path).toUpperCase()}</small></span></button>)}
              {!filteredRoots.length && <div className="root-menu-empty"><Search size={19} /><span>No matching models</span><button type="button" onClick={() => setRootQuery("")}>Clear filter</button></div>}
            </div>
          </div>}
        </div>
        <div className="viewer-actions">
          <button className="open-file-button" type="button" onClick={() => { setOpenMenu(false); setExportMenu(false); }}><FolderOpen size={16} /> Open <input type="file" multiple accept={ACCEPTED_FILE_TYPES} onChange={(event) => event.target.files?.length && onOpenFiles([...event.target.files])} /></button>
          <div className="export-control">
            <button className="export-button" type="button" disabled={!engineRef.current?.model || Boolean(exporting)} aria-haspopup="menu" aria-expanded={exportMenu} onClick={() => { setOpenMenu(false); setExportMenu(!exportMenu); }}>
              {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}<span>{exporting ? `Exporting ${exporting === "gltf" ? "glTF" : exporting.toUpperCase()}…` : "Export"}</span><ChevronDown size={13} />
            </button>
            {exportMenu && <div className="export-menu" role="menu" aria-label="Export model">
              <div className="export-menu-heading"><strong>Export loaded model</strong><span>STEP preserves exact CAD units; mesh formats use viewer units</span></div>
              {EXPORT_FORMATS.filter((option) => option.format !== "step" || Boolean(engineRef.current?.stepSource)).map((option) => <button key={option.format} type="button" role="menuitem" onClick={() => exportModel(option.format)}>
                <b>{option.label}</b><span>{option.description}</span>
              </button>)}
              <div className="export-menu-note">Exact STEP export is available for Inventor IPT and IAM documents with native B-Rep geometry. It runs locally in this browser.</div>
            </div>}
          </div>
          {exportNotice && <div className={`export-notice ${exportNotice.startsWith("Export failed") ? "error" : ""}`} role="status"><span>{exportNotice}</span><button type="button" onClick={() => { if (exporting === "step") exportControllerRef.current?.abort(); else setExportNotice(null); }} aria-label={exporting === "step" ? "Cancel STEP export" : "Dismiss export message"}><X size={13} /></button></div>}
          <a className="viewer-imprint" href={PRIVACY_URL} target="_blank" rel="noreferrer">Datenschutz</a>
          <a className="viewer-imprint" href={IMPRINT_URL} target="_blank" rel="noreferrer">Impressum</a>
          <span className="header-separator" />
          <button type="button" title="Close viewer" onClick={onClose}><X size={19} /></button>
        </div>
      </header>

      <aside className={`model-panel ${leftOpen ? "" : "closed"}`}>
        <div className="panel-heading"><div><span>Model</span><small>{roots.length > 1 ? `${roots.length} models` : kindFor(title)}</small></div><button type="button" onClick={() => setLeftOpen(false)} aria-label="Close model panel"><PanelLeftClose size={17} /></button></div>
        <div className="tree-search"><Search size={14} /><input placeholder="Filter model" aria-label="Filter model" /></div>
        <div className="model-tree">{tree ? <TreeNode item={tree} level={0} selected={selected} onSelect={selectObject} onToggleVisibility={toggleObjectVisibility} /> : <div className="tree-loading"><LoaderCircle className="spin" size={18} /> Reading model…</div>}</div>
        <div className="model-stats"><span><strong>{stats.objects.toLocaleString()}</strong> objects</span><span><strong>{stats.triangles.toLocaleString()}</strong> triangles</span></div>
      </aside>

      <section className="viewport">
        <canvas ref={canvasRef} className={toolMode === "select" ? "select-cursor" : "move-cursor"} />
        {!leftOpen && <button className="panel-reopen left" type="button" onClick={() => setLeftOpen(true)} title="Show model tree"><PanelLeftOpen size={18} /></button>}
        {!rightOpen && <button className="panel-reopen right" type="button" onClick={() => setRightOpen(true)} title="Show properties"><PanelRightOpen size={18} /></button>}

        <div className="viewer-toolbar" role="toolbar" aria-label="Viewer tools">
          <div className="segmented">
            <button type="button" className={toolMode === "move" ? "active" : ""} onClick={() => setToolMode("move")} title="Move model (M)"><Hand size={17} /><span>Move</span></button>
            <button type="button" className={toolMode === "select" ? "active" : ""} onClick={() => setToolMode("select")} title="Select object (S)"><MousePointer2 size={17} /><span>Select</span></button>
          </div>
          <span className="toolbar-divider" />
          <button type="button" onClick={() => engineRef.current?.frame?.()} title="Fit model (F)" aria-label="Fit model"><Maximize2 size={17} /></button>
          <button className="home-fit-button" type="button" onClick={goHome} title="Home: isometric view and fit model" aria-label="Home: isometric view and fit model"><Home size={17} /><span>Home</span></button>
          <span className="toolbar-divider" />
          <div className="segmented view-switch">
            <button type="button" className={viewMode === "linear" ? "active" : ""} onClick={() => setViewMode("linear")}><Ruler size={16} />Linear</button>
            <button type="button" className={viewMode === "perspective" ? "active" : ""} onClick={() => setViewMode("perspective")}><Box size={16} />Perspective</button>
          </div>
          <span className="toolbar-divider" />
          <div className="segmented surface-switch">
            <button type="button" className={twoSided ? "active" : ""} aria-pressed={twoSided} onClick={() => setTwoSided((enabled) => !enabled)} title="Render front and back faces for interior inspection">
              <Layers3 size={16} /><span>Two-sided</span>
            </button>
          </div>
        </div>

        <div className="view-cube" aria-label="Standard views">
          <div className="view-cube-body">
            <button className="cube-top" type="button" onClick={() => setPreset("top")} title="Top view">Top</button>
            <button className="cube-front" type="button" onClick={() => setPreset("front")} title="Front view">Front</button>
            <button className="cube-right" type="button" onClick={() => setPreset("right")} title="Right view">Right</button>
          </div>
          <span className="cube-axis cube-axis-x">X</span>
          <span className="cube-axis cube-axis-y">Y</span>
          <span className="cube-axis cube-axis-z">Z</span>
        </div>

        {status !== "Ready" && <div className={`loading-card ${error ? "error" : ""}`}>
          <div className="loading-icon">{error ? <X /> : <LoaderCircle className="spin" />}</div>
          <div><strong>{status}</strong><span>{error ?? "Large assemblies can take a moment — all processing stays on this device."}</span></div>
          {!error && <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>}
          {error && <button className="loading-dismiss" type="button" onClick={() => { setError(null); setStatus("Ready"); setProgress(100); }} aria-label="Close message" title="Close message"><X size={16} /></button>}
        </div>}

        <div className="camera-hint"><span><b>Left drag</b> orbit</span><span><b>Right drag</b> pan</span><span><b>Scroll</b> zoom</span><span><b>Double-click</b> focus</span></div>
        <div className="viewport-status"><span className="ready-dot" /> {status === "Ready" ? "Local session" : status}<span>WebGL</span></div>
      </section>

      <aside className={`property-panel ${rightOpen ? "" : "closed"}`}>
        <div className="panel-heading"><div><span>Properties</span><small>{selected ? selected.name || selected.type : "Nothing selected"}</small></div><button type="button" onClick={() => setRightOpen(false)} aria-label="Close properties"><PanelRightClose size={17} /></button></div>
        <PropertyGrid sections={properties} />
      </aside>
    </main>
  );
}
