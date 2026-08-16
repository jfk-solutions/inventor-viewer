import type { CadRuntime } from "../runtime";
import { loadOcctModel } from "./step";

type ScalarProperty = string | number | boolean;
type Vec3 = [number, number, number];
type Quaternion = [number, number, number, number];

type FreeCadPlacement = {
  position: Vec3;
  quaternion: Quaternion;
  scale: Vec3;
};

type FreeCadObject = {
  name: string;
  type: string;
  label: string;
  visible: boolean;
  properties: Record<string, ScalarProperty>;
  linkTargets: string[];
  incomingShapeLinks: number;
  fileName?: string;
  linkedObject?: string;
  placement?: FreeCadPlacement;
  color?: Vec3;
  lineColor?: Vec3;
  transparency?: number;
  appearanceFile?: string;
  sketchPositions?: number[];
};

const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_SHAPE_BYTES = 256 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024;

function directChildren(element: Element, tagName: string) {
  return [...element.children].filter((child) => child.tagName === tagName);
}

function directChild(element: Element, tagName: string) {
  return directChildren(element, tagName)[0];
}

function firstAttribute(element: Element, tagName: string, attribute: string) {
  return element.getElementsByTagName(tagName)[0]?.getAttribute(attribute) ?? undefined;
}

function readProperties(element: Element) {
  const result: Record<string, ScalarProperty> = {};
  const properties = directChild(element, "Properties");
  if (!properties) return result;
  for (const property of directChildren(properties, "Property")) {
    const name = property.getAttribute("name");
    if (!name) continue;
    const type = property.getAttribute("type") ?? "";
    const raw = firstAttribute(property, "String", "value")
      ?? firstAttribute(property, "Bool", "value")
      ?? firstAttribute(property, "Integer", "value")
      ?? firstAttribute(property, "Float", "value")
      ?? firstAttribute(property, "Uuid", "value")
      ?? firstAttribute(property, "Link", "value")
      ?? firstAttribute(property, "XLink", "name");
    if (raw === undefined) continue;
    if (/Bool/.test(type)) result[name] = raw === "true";
    else if (/Integer|Enumeration|Percent/.test(type)) {
      const value = Number.parseInt(raw, 10);
      if (Number.isFinite(value)) result[name] = value;
    } else if (/Float|Length|Distance|Angle|Area|Volume/.test(type)) {
      const value = Number.parseFloat(raw);
      if (Number.isFinite(value)) result[name] = value;
    } else result[name] = raw;
  }
  return result;
}

function parseXml(bytes: Uint8Array | undefined, name: string) {
  if (!bytes) return undefined;
  const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "text/xml");
  if (document.getElementsByTagName("parsererror")[0]) {
    throw new Error(`The FCStd archive contains invalid ${name}.`);
  }
  return document;
}

function numberAttribute(element: Element, name: string, fallback: number) {
  const value = Number.parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function identityPlacement(): FreeCadPlacement {
  return { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function readPlacement(property: Element): FreeCadPlacement | undefined {
  const value = property.getElementsByTagName("PropertyPlacement")[0];
  if (!value) return undefined;
  return {
    position: [numberAttribute(value, "Px", 0), numberAttribute(value, "Py", 0), numberAttribute(value, "Pz", 0)],
    quaternion: [
      numberAttribute(value, "Q0", 0),
      numberAttribute(value, "Q1", 0),
      numberAttribute(value, "Q2", 0),
      numberAttribute(value, "Q3", 1),
    ],
    scale: [1, 1, 1],
  };
}

function unpackColor(encoded: number): Vec3 {
  return [(encoded >>> 24) & 255, (encoded >>> 16) & 255, (encoded >>> 8) & 255];
}

function readPackedColor(property: Element) {
  const encoded = Number.parseInt(firstAttribute(property, "PropertyColor", "value") ?? "", 10);
  return Number.isFinite(encoded) ? unpackColor(encoded) : undefined;
}

function readLinkTarget(property: Element) {
  const xlink = property.getElementsByTagName("XLink")[0];
  if (xlink && !xlink.getAttribute("file")) return xlink.getAttribute("name") || undefined;
  return firstAttribute(property, "Link", "value");
}

function readSketchPositions(property: Element) {
  const positions: number[] = [];
  for (const geometry of property.getElementsByTagName("Geometry")) {
    if (firstAttribute(geometry, "Construction", "value") === "1") continue;
    const line = geometry.getElementsByTagName("LineSegment")[0];
    if (!line) continue;
    positions.push(
      numberAttribute(line, "StartX", 0), numberAttribute(line, "StartY", 0), numberAttribute(line, "StartZ", 0),
      numberAttribute(line, "EndX", 0), numberAttribute(line, "EndY", 0), numberAttribute(line, "EndZ", 0),
    );
  }
  return positions;
}

function shapeTypeIsDisplayable(type: string) {
  return /^(?:Part|PartDesign)::/.test(type)
    && !/(?:Part2D|Plane|Line|Point|CoordinateSystem)/.test(type);
}

function parseFreeCadObjects(metadataFiles: Record<string, Uint8Array>) {
  const document = parseXml(metadataFiles["Document.xml"], "Document.xml");
  if (!document) throw new Error("The FCStd archive does not contain Document.xml.");
  const guiDocument = parseXml(metadataFiles["GuiDocument.xml"], "GuiDocument.xml");
  const objects = new Map<string, FreeCadObject>();

  const objectList = document.getElementsByTagName("Objects")[0];
  for (const element of objectList ? directChildren(objectList, "Object") : []) {
    const name = element.getAttribute("name") ?? "";
    if (!name) continue;
    objects.set(name, {
      name,
      type: element.getAttribute("type") ?? "",
      label: name,
      visible: true,
      properties: {},
      linkTargets: [],
      incomingShapeLinks: 0,
    });
  }

  const objectData = document.getElementsByTagName("ObjectData")[0];
  for (const element of objectData ? directChildren(objectData, "Object") : []) {
    const current = objects.get(element.getAttribute("name") ?? "");
    if (!current) continue;
    current.properties = readProperties(element);
    const properties = directChild(element, "Properties");
    for (const property of properties ? directChildren(properties, "Property") : []) {
      const name = property.getAttribute("name");
      if (name === "Label") current.label = firstAttribute(property, "String", "value") ?? current.label;
      else if (name === "Visibility" || name === "Visible") {
        current.visible = firstAttribute(property, "Bool", "value") !== "false";
      } else if (name === "Shape") {
        const fileName = firstAttribute(property, "Part", "file");
        if (fileName && /\.(?:brp|brep)$/i.test(fileName)) current.fileName = fileName;
      } else if (name === "Geometry" && current.type === "Sketcher::SketchObject") {
        current.sketchPositions = readSketchPositions(property);
      } else if (name === "LinkedObject") current.linkedObject = readLinkTarget(property);
      else if (name === "Placement") current.placement = readPlacement(property) ?? current.placement;
      else if (name === "LinkPlacement" && !current.placement) current.placement = readPlacement(property);
      else if (name === "Scale") {
        const scale = Number.parseFloat(firstAttribute(property, "Float", "value") ?? "");
        if (Number.isFinite(scale)) {
          const placement = current.placement ?? identityPlacement();
          placement.scale = [scale, scale, scale];
          current.placement = placement;
        }
      } else if (name === "ScaleVector") {
        const vector = property.getElementsByTagName("PropertyVector")[0];
        if (vector) {
          const placement = current.placement ?? identityPlacement();
          placement.scale = [
            placement.scale[0] * numberAttribute(vector, "valueX", 1),
            placement.scale[1] * numberAttribute(vector, "valueY", 1),
            placement.scale[2] * numberAttribute(vector, "valueZ", 1),
          ];
          current.placement = placement;
        }
      }
      for (const link of property.getElementsByTagName("Link")) {
        const target = link.getAttribute("value");
        if (target) current.linkTargets.push(target);
      }
      for (const link of property.getElementsByTagName("XLink")) {
        if (link.getAttribute("file")) continue;
        const target = link.getAttribute("name");
        if (target) current.linkTargets.push(target);
      }
    }
  }

  for (const current of objects.values()) {
    if (!current.fileName || !shapeTypeIsDisplayable(current.type)) continue;
    for (const targetName of current.linkTargets) {
      const target = objects.get(targetName);
      if (target?.fileName && shapeTypeIsDisplayable(target.type)) target.incomingShapeLinks += 1;
    }
  }

  if (guiDocument) {
    for (const provider of guiDocument.getElementsByTagName("ViewProvider")) {
      const current = objects.get(provider.getAttribute("name") ?? "");
      if (!current) continue;
      const properties = directChild(provider, "Properties");
      for (const property of properties ? directChildren(properties, "Property") : []) {
        const name = property.getAttribute("name");
        if (name === "Visibility") current.visible = firstAttribute(property, "Bool", "value") !== "false";
        else if (name === "ShapeColor") current.color = readPackedColor(property) ?? current.color;
        else if (name === "LineColor") current.lineColor = readPackedColor(property) ?? current.lineColor;
        else if (name === "Transparency") {
          const value = Number.parseInt(firstAttribute(property, "Integer", "value") ?? "", 10);
          if (Number.isFinite(value)) current.transparency = Math.min(100, Math.max(0, value));
        } else if (name === "ShapeAppearance") {
          const fileName = property.getElementsByTagName("MaterialList")[0]?.getAttribute("file");
          if (fileName) current.appearanceFile = fileName;
        }
      }
    }
  }
  return objects;
}

function addMaterialAppearance(object: FreeCadObject, bytes: Uint8Array | undefined) {
  if (!bytes || bytes.byteLength < 28) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  if (!count || count > Math.floor((bytes.byteLength - 4) / 24)) return;
  object.color = unpackColor(view.getUint32(8, true));
  if (object.transparency === undefined) {
    const transparency = view.getFloat32(24, true);
    if (Number.isFinite(transparency)) object.transparency = Math.min(100, Math.max(0, transparency * 100));
  }
}

function resolveShape(objects: Map<string, FreeCadObject>, object: FreeCadObject, visited = new Set<string>()): FreeCadObject | undefined {
  if (object.fileName && shapeTypeIsDisplayable(object.type)) return object;
  if (!object.linkedObject || visited.has(object.name)) return undefined;
  visited.add(object.name);
  const target = objects.get(object.linkedObject);
  return target ? resolveShape(objects, target, visited) : undefined;
}

function extractMetadata(archive: Uint8Array, unzipSync: typeof import("fflate").unzipSync) {
  let extractedSize = 0;
  return unzipSync(archive, {
    filter(entry) {
      const wanted = entry.name === "Document.xml" || entry.name === "GuiDocument.xml";
      if (!wanted) return false;
      if (entry.originalSize > MAX_METADATA_BYTES) throw new Error(`${entry.name} is too large to be a valid FCStd metadata file.`);
      extractedSize += entry.originalSize;
      if (extractedSize > MAX_METADATA_BYTES * 2) throw new Error("The FCStd metadata exceeds the browser safety limit.");
      return true;
    },
  });
}

function extractAssets(
  archive: Uint8Array,
  wantedNames: Iterable<string>,
  unzipSync: typeof import("fflate").unzipSync,
) {
  const namesByLowerCase = new Map([...wantedNames].map((name) => [name.toLocaleLowerCase(), name]));
  let extractedSize = 0;
  const extracted = unzipSync(archive, {
    filter(entry) {
      if (!namesByLowerCase.has(entry.name.toLocaleLowerCase())) return false;
      if (entry.originalSize > MAX_SHAPE_BYTES) throw new Error(`${entry.name} exceeds the FCStd per-shape safety limit.`);
      extractedSize += entry.originalSize;
      if (extractedSize > MAX_EXTRACTED_BYTES) throw new Error("The FCStd display geometry exceeds the browser safety limit.");
      return true;
    },
  });
  const result: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(extracted)) {
    const canonicalName = namesByLowerCase.get(name.toLocaleLowerCase());
    if (canonicalName) result[canonicalName] = bytes;
  }
  return result;
}

function applyPlacement(object3d: any, placement?: FreeCadPlacement) {
  if (!placement) return;
  object3d.position.set(...placement.position);
  object3d.quaternion.set(...placement.quaternion).normalize();
  object3d.scale.set(...placement.scale);
}

function applyAppearance(scene: any, object: FreeCadObject) {
  if (!object.color && object.transparency === undefined) return;
  const opacity = object.transparency === undefined ? undefined : 1 - object.transparency / 100;
  scene.traverse((child: any) => {
    if (!child.isMesh || !child.material) return;
    const apply = (material: any) => {
      const copy = material.clone();
      if (object.color) copy.color?.setRGB(object.color[0] / 255, object.color[1] / 255, object.color[2] / 255);
      if (opacity !== undefined) {
        copy.opacity = opacity;
        copy.transparent = opacity < 1;
        if (opacity < 1) copy.depthWrite = false;
      }
      return copy;
    };
    child.material = Array.isArray(child.material) ? child.material.map(apply) : apply(child.material);
  });
}

function objectMetadata(object: FreeCadObject) {
  return { kind: object.type, freeCadName: object.name, ...object.properties };
}

function createSketchScene(THREE: any, object: FreeCadObject) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(object.sketchPositions, 3));
  const color = object.lineColor ?? [51, 255, 255];
  const material = new THREE.LineBasicMaterial({ color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255) });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = object.label || object.name;
  lines.userData.inventor = objectMetadata(object);
  applyPlacement(lines, object.placement);
  return lines;
}

function createLinkInstance(
  THREE: any,
  object: FreeCadObject,
  objects: Map<string, FreeCadObject>,
  geometryScenes: Map<string, any>,
) {
  const buildTarget = (targetName: string, visited: Set<string>): any => {
    if (visited.has(targetName)) throw new Error(`The FCStd document contains a cyclic App::Link at ${targetName}.`);
    const target = objects.get(targetName);
    if (!target) throw new Error(`The FCStd link ${object.name} refers to missing object ${targetName}.`);
    const shapeScene = geometryScenes.get(target.name);
    if (shapeScene) return shapeScene.clone(true);
    if (!target.linkedObject) throw new Error(`The FCStd link ${object.name} does not resolve to display geometry.`);
    const wrapper = new THREE.Group();
    wrapper.name = target.label || target.name;
    wrapper.userData.inventor = objectMetadata(target);
    applyPlacement(wrapper, target.placement);
    wrapper.add(buildTarget(target.linkedObject, new Set(visited).add(targetName)));
    applyAppearance(wrapper, target);
    return wrapper;
  };

  if (!object.linkedObject) throw new Error(`The FCStd App::Link ${object.name} has no linked object.`);
  const instance = new THREE.Group();
  instance.name = object.label || object.name;
  instance.userData.inventor = objectMetadata(object);
  applyPlacement(instance, object.placement);
  instance.add(buildTarget(object.linkedObject, new Set([object.name])));
  applyAppearance(instance, object);
  return instance;
}

export async function loadFcstdModel(
  runtime: CadRuntime,
  file: File,
  manager: any,
  onProgress?: (status: string, progress: number) => void,
) {
  const { THREE } = runtime;
  onProgress?.("Loading FreeCAD archive engine…", 43);
  const { unzipSync } = await import("fflate");
  const archive = new Uint8Array(await file.arrayBuffer());
  const objects = parseFreeCadObjects(extractMetadata(archive, unzipSync));

  const directShapes = [...objects.values()].filter((object) => (
    object.visible && Boolean(object.fileName) && shapeTypeIsDisplayable(object.type) && object.incomingShapeLinks === 0
  ));
  const sketches = [...objects.values()].filter((object) => object.visible && Boolean(object.sketchPositions?.length));
  const links = [...objects.values()].filter((object) => object.visible && object.type === "App::Link" && Boolean(resolveShape(objects, object)));
  const geometryObjects = new Map<string, FreeCadObject>();
  for (const object of directShapes) geometryObjects.set(object.name, object);
  for (const link of links) {
    const shape = resolveShape(objects, link);
    if (shape) geometryObjects.set(shape.name, shape);
  }
  if (!directShapes.length && !sketches.length && !links.length) {
    throw new Error("The FCStd file contains no visible BREP, App::Link, or line-segment sketch objects.");
  }

  const wantedAssets = new Set<string>();
  for (const object of geometryObjects.values()) if (object.fileName) wantedAssets.add(object.fileName);
  for (const object of objects.values()) if (object.appearanceFile) wantedAssets.add(object.appearanceFile);
  const assets = extractAssets(archive, wantedAssets, unzipSync);
  for (const object of objects.values()) addMaterialAppearance(object, object.appearanceFile ? assets[object.appearanceFile] : undefined);

  const geometryScenes = new Map<string, any>();
  const geometryList = [...geometryObjects.values()];
  for (const [index, object] of geometryList.entries()) {
    const fileContent = object.fileName ? assets[object.fileName] : undefined;
    if (!object.fileName || !fileContent) throw new Error(`The FCStd archive is missing ${object.fileName || `the shape for ${object.name}`}.`);
    onProgress?.(`Tessellating FreeCAD shape ${index + 1} of ${geometryList.length}…`, 50 + (index / Math.max(geometryList.length, 1)) * 28);
    const embeddedBytes = new Uint8Array(fileContent.byteLength);
    embeddedBytes.set(fileContent);
    const result = await loadOcctModel(runtime, new File([embeddedBytes.buffer], object.fileName), manager);
    const scene = result.model;
    scene.name = object.label || object.name;
    scene.userData.inventor = objectMetadata(object);
    applyAppearance(scene, object);
    geometryScenes.set(object.name, scene);
  }

  const group = new THREE.Group();
  group.name = file.name;
  group.userData.inventor = {
    kind: "FreeCAD document",
    objectCount: directShapes.length + sketches.length + links.length,
    shapeCount: geometryScenes.size,
    sketchCount: sketches.length,
    linkCount: links.length,
  };
  for (const object of directShapes) {
    const scene = geometryScenes.get(object.name);
    if (scene) group.add(scene);
  }
  for (const sketch of sketches) group.add(createSketchScene(THREE, sketch));
  for (const link of links) group.add(createLinkInstance(THREE, link, objects, geometryScenes));
  return group;
}
