import type { CadRuntime } from "./runtime";
import { loadOcctModel } from "./step";

type FreeCadObject = {
  name: string;
  type: string;
  label: string;
  fileName: string;
  fileContent: Uint8Array;
  color?: [number, number, number];
  properties: Record<string, string | number | boolean>;
};

function firstAttribute(element: Element, tagName: string, attribute: string) {
  return element.getElementsByTagName(tagName)[0]?.getAttribute(attribute) ?? undefined;
}

function readProperties(element: Element) {
  const result: Record<string, string | number | boolean> = {};
  for (const property of element.querySelectorAll(":scope > Properties > Property")) {
    const name = property.getAttribute("name");
    if (!name) continue;
    const type = property.getAttribute("type") ?? "";
    const raw = firstAttribute(property, "String", "value")
      ?? firstAttribute(property, "String", "bool")
      ?? firstAttribute(property, "Bool", "value")
      ?? firstAttribute(property, "Integer", "value")
      ?? firstAttribute(property, "Float", "value")
      ?? firstAttribute(property, "Uuid", "value");
    if (raw === undefined) continue;
    if (/Bool/.test(type)) result[name] = raw === "true";
    else if (/Integer/.test(type)) result[name] = Number.parseInt(raw, 10);
    else if (/Float|Length|Distance|Area|Volume/.test(type)) result[name] = Number.parseFloat(raw);
    else result[name] = raw;
  }
  return result;
}

function parseXml(files: Record<string, Uint8Array>, name: string) {
  const bytes = files[name];
  if (!bytes) return undefined;
  return new DOMParser().parseFromString(new TextDecoder().decode(bytes), "text/xml");
}

function parseFreeCadObjects(files: Record<string, Uint8Array>) {
  const document = parseXml(files, "Document.xml");
  if (!document) throw new Error("The FCStd archive does not contain Document.xml.");
  const guiDocument = parseXml(files, "GuiDocument.xml");
  const objects = new Map<string, Omit<FreeCadObject, "fileName" | "fileContent"> & { fileName?: string; fileContent?: Uint8Array; visible: boolean; incomingLinks: number }>();

  for (const element of document.querySelectorAll("Objects > Object")) {
    const name = element.getAttribute("name") ?? "";
    const type = element.getAttribute("type") ?? "";
    if (name && (/^(Part|PartDesign)::/.test(type)) && !type.includes("Part2D")) {
      objects.set(name, { name, type, label: name, visible: false, incomingLinks: 0, properties: {} });
    }
  }
  for (const element of document.querySelectorAll("ObjectData > Object")) {
    const current = objects.get(element.getAttribute("name") ?? "");
    if (!current) continue;
    current.properties = readProperties(element);
    for (const property of element.getElementsByTagName("Property")) {
      const name = property.getAttribute("name");
      if (name === "Label") current.label = firstAttribute(property, "String", "value") ?? current.label;
      else if (name === "Visibility" || name === "Visible") current.visible = firstAttribute(property, "Bool", "value") === "true";
      else if (name === "Shape") {
        const fileName = firstAttribute(property, "Part", "file");
        if (fileName && /\.(?:brp|brep)$/i.test(fileName) && files[fileName]) {
          current.fileName = fileName;
          current.fileContent = files[fileName];
        }
      }
    }
    for (const link of element.getElementsByTagName("Link")) {
      const linked = objects.get(link.getAttribute("value") ?? "");
      if (linked) linked.incomingLinks += 1;
    }
  }
  if (guiDocument) {
    for (const provider of guiDocument.getElementsByTagName("ViewProvider")) {
      const current = objects.get(provider.getAttribute("name") ?? "");
      if (!current) continue;
      for (const property of provider.getElementsByTagName("Property")) {
        const name = property.getAttribute("name");
        if (name === "Visibility") current.visible = firstAttribute(property, "Bool", "value") === "true";
        else if (name === "ShapeColor") {
          const encoded = Number.parseInt(firstAttribute(property, "PropertyColor", "value") ?? "", 10);
          if (Number.isFinite(encoded)) current.color = [(encoded >>> 24) & 255, (encoded >>> 16) & 255, (encoded >>> 8) & 255];
        }
      }
    }
  }
  return [...objects.values()].filter((object): object is FreeCadObject & { visible: boolean; incomingLinks: number } => (
    object.visible && object.incomingLinks === 0 && Boolean(object.fileName && object.fileContent)
  ));
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
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const objects = parseFreeCadObjects(files);
  if (!objects.length) throw new Error("The FCStd file contains no visible Part or PartDesign BREP objects.");

  const group = new THREE.Group();
  group.name = file.name;
  group.userData.inventor = { kind: "FreeCAD document", objectCount: objects.length };
  for (const [index, object] of objects.entries()) {
    onProgress?.(`Tessellating FreeCAD object ${index + 1} of ${objects.length}…`, 50 + (index / objects.length) * 30);
    const embeddedBytes = new Uint8Array(object.fileContent.byteLength);
    embeddedBytes.set(object.fileContent);
    const embedded = new File([embeddedBytes.buffer], object.fileName, { type: "application/octet-stream" });
    const result = await loadOcctModel(runtime, embedded, manager);
    const scene = result.model;
    scene.name = object.label || object.name;
    scene.userData.inventor = { kind: object.type, freeCadName: object.name, ...object.properties };
    if (object.color) {
      scene.traverse((child: any) => {
        if (!child.isMesh || !child.material) return;
        const apply = (material: any) => {
          const copy = material.clone();
          copy.color?.setRGB(object.color![0] / 255, object.color![1] / 255, object.color![2] / 255);
          return copy;
        };
        child.material = Array.isArray(child.material) ? child.material.map(apply) : apply(child.material);
      });
    }
    group.add(scene);
  }
  return group;
}
