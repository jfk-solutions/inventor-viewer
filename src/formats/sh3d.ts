import type { CadRuntime } from "../runtime";

type Progress = (status: string, progress: number) => void;

type LoadedSweetHome = {
  model: any;
  objectUrls: string[];
};

function normalizePath(value: string) {
  let path = value.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  try { path = decodeURIComponent(path); } catch { /* Keep malformed URI text as-is. */ }
  if (/^[a-z]+:\/\//i.test(path)) {
    try { path = new URL(path).pathname; } catch { /* Treat it as an archive path. */ }
  }
  const parts: string[] = [];
  for (const part of path.replace(/^\.?\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/").toLocaleLowerCase();
}

function directoryOf(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash + 1) : "";
}

function extension(path: string) {
  return path.split(".").pop()?.toLocaleLowerCase() ?? "";
}

function numberAttribute(element: Element, name: string, fallback = 0) {
  const attribute = element.getAttribute(name);
  if (attribute === null || attribute.trim() === "") return fallback;
  const value = Number(attribute);
  return Number.isFinite(value) ? value : fallback;
}

function isVisible(element: Element) {
  return element.getAttribute("visible") !== "false";
}

function directChildren(element: Element, name?: string) {
  return Array.from(element.children).filter((child) => !name || child.tagName === name);
}

function elementAttributes(element: Element) {
  return Object.fromEntries(Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value]));
}

function colorValue(value: string | null, fallback: number) {
  if (!value) return { color: fallback, opacity: 1 };
  const normalized = value.replace(/^#/, "").padStart(8, "F").slice(-8);
  const color = Number.parseInt(normalized.slice(-6), 16);
  const alpha = Number.parseInt(normalized.slice(0, 2), 16);
  return {
    color: Number.isFinite(color) ? color : fallback,
    opacity: Number.isFinite(alpha) && alpha > 0 ? alpha / 255 : 1,
  };
}

function mimeType(path: string, bytes: Uint8Array) {
  const format = extension(path);
  if (format === "png" || (bytes[0] === 0x89 && bytes[1] === 0x50)) return "image/png";
  if (["jpg", "jpeg"].includes(format) || (bytes[0] === 0xff && bytes[1] === 0xd8)) return "image/jpeg";
  if (format === "gif" || String.fromCharCode(...bytes.subarray(0, 3)) === "GIF") return "image/gif";
  if (format === "webp") return "image/webp";
  if (["obj", "mtl", "dae", "gltf", "xml"].includes(format)) return "text/plain";
  return "application/octet-stream";
}

function archiveFiles(runtime: CadRuntime, entries: Record<string, Uint8Array>) {
  const manager = new runtime.THREE.LoadingManager();
  const byPath = new Map<string, File>();
  const objectUrls = new Map<File, string>();

  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith("/")) continue;
    const file = new File([bytes.slice().buffer], path.split("/").pop() || "archive-entry", { type: mimeType(path, bytes) });
    Object.defineProperty(file, "webkitRelativePath", { configurable: true, value: path });
    const normalized = normalizePath(path);
    byPath.set(normalized, file);
    const baseName = normalized.split("/").pop();
    if (baseName && !byPath.has(baseName)) byPath.set(baseName, file);
  }

  manager.setURLModifier((url: string) => {
    if (/^(blob:|data:)/i.test(url)) return url;
    const requested = normalizePath(url);
    let file = byPath.get(requested);
    if (!file) {
      for (const [candidate, candidateFile] of byPath) {
        if (candidate.includes("/") && (requested.endsWith(`/${candidate}`) || candidate.endsWith(`/${requested}`))) {
          file = candidateFile;
          break;
        }
      }
    }
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

  return { manager, byPath, objectUrls };
}

function textEntry(entries: Record<string, Uint8Array>, path: string) {
  const wanted = normalizePath(path);
  const match = Object.entries(entries).find(([candidate]) => normalizePath(candidate) === wanted);
  return match ? new TextDecoder().decode(match[1]) : undefined;
}

function findEntry(entries: Record<string, Uint8Array>, path: string) {
  const wanted = normalizePath(path);
  return Object.keys(entries).find((candidate) => normalizePath(candidate) === wanted);
}

async function loadEmbeddedModel(
  runtime: CadRuntime,
  entries: Record<string, Uint8Array>,
  manager: any,
  modelPath: string,
) {
  const format = extension(modelPath);
  const directory = directoryOf(modelPath);
  if (format === "obj") {
    const source = textEntry(entries, modelPath);
    if (source === undefined) throw new Error(`Missing embedded model ${modelPath}.`);
    const loader = new runtime.OBJLoader(manager);
    const declaredMtl = /^\s*mtllib\s+(.+)$/im.exec(source)?.[1]?.trim();
    const desiredMtl = declaredMtl ? `${directory}${declaredMtl}` : "";
    const mtlPath = (desiredMtl && findEntry(entries, desiredMtl))
      || Object.keys(entries).find((candidate) => normalizePath(candidate).startsWith(normalizePath(directory)) && extension(candidate) === "mtl");
    if (mtlPath) {
      const materials = new runtime.MTLLoader(manager).parse(textEntry(entries, mtlPath) ?? "", directoryOf(mtlPath));
      materials.preload();
      loader.setMaterials(materials);
    }
    return loader.parse(source);
  }
  if (format === "dae") {
    const source = textEntry(entries, modelPath);
    if (source === undefined) throw new Error(`Missing embedded model ${modelPath}.`);
    return new runtime.ColladaLoader(manager).parse(source, directory).scene;
  }
  if (format === "3ds") {
    const path = findEntry(entries, modelPath);
    if (!path) throw new Error(`Missing embedded model ${modelPath}.`);
    const bytes = entries[path];
    return new runtime.TDSLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), directory);
  }
  if (format === "glb" || format === "gltf") {
    const loader = new runtime.GLTFLoader(manager);
    loader.setMeshoptDecoder(runtime.MeshoptDecoder);
    return (await loader.loadAsync(modelPath)).scene;
  }
  throw new Error(`Embedded .${format || "unknown"} furniture models are not supported.`);
}

function cloneModel(model: any) {
  const clone = model.clone(true);
  clone.traverse((object: any) => {
    if (!object.material) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material: any) => material?.clone?.() ?? material)
      : object.material.clone?.() ?? object.material;
  });
  return clone;
}

function textureFromElement(runtime: CadRuntime, manager: any, element?: Element) {
  const path = element?.getAttribute("image");
  if (!path) return undefined;
  const texture = new runtime.THREE.TextureLoader(manager).load(path);
  texture.colorSpace = runtime.THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = runtime.THREE.RepeatWrapping;
  return texture;
}

function applyPieceMaterials(runtime: CadRuntime, manager: any, model: any, element: Element) {
  const overall = colorValue(element.getAttribute("color"), 0xffffff);
  const overallTexture = textureFromElement(runtime, manager, directChildren(element, "texture")[0]);
  const shininess = numberAttribute(element, "shininess", 0);
  const materialOverrides = new Map(directChildren(element, "material").map((material) => [material.getAttribute("name") ?? "", material]));

  model.traverse((object: any) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const override = materialOverrides.get(material.name ?? "");
      const specifiedColor = override?.getAttribute("color") ?? element.getAttribute("color");
      if (specifiedColor && material.color) {
        const parsed = colorValue(specifiedColor, overall.color);
        material.color.setHex(parsed.color);
        material.opacity = parsed.opacity;
        material.transparent = parsed.opacity < 1;
      }
      const textureElement = override ? directChildren(override, "texture")[0] : undefined;
      const texture = textureFromElement(runtime, manager, textureElement) ?? overallTexture;
      if (texture && "map" in material) material.map = texture;
      const materialShininess = override ? numberAttribute(override, "shininess", shininess) : shininess;
      if ("roughness" in material && materialShininess > 0) material.roughness = Math.max(0.05, 1 - materialShininess);
      material.side = element.getAttribute("backFaceShown") === "true" ? runtime.THREE.DoubleSide : material.side;
      material.needsUpdate = true;
    }
  });
}

function orientAndSizePiece(runtime: CadRuntime, model: any, element: Element, levelElevation: number) {
  const { THREE } = runtime;
  const oriented = new THREE.Group();
  oriented.add(model);
  oriented.updateWorldMatrix(true, true);
  let bounds = new THREE.Box3().setFromObject(oriented);
  const center = bounds.getCenter(new THREE.Vector3());
  model.applyMatrix4(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));

  const rotationValues = (element.getAttribute("modelRotation") ?? "1 0 0 0 1 0 0 0 1")
    .trim().split(/\s+/).map(Number);
  if (rotationValues.length === 9 && rotationValues.every(Number.isFinite)) {
    model.applyMatrix4(new THREE.Matrix4().set(
      rotationValues[0], rotationValues[1], rotationValues[2], 0,
      rotationValues[3], rotationValues[4], rotationValues[5], 0,
      rotationValues[6], rotationValues[7], rotationValues[8], 0,
      0, 0, 0, 1,
    ));
  }
  oriented.updateWorldMatrix(true, true);
  bounds = new THREE.Box3().setFromObject(oriented);
  if (element.getAttribute("modelCenteredAtOrigin") !== "false") {
    bounds.getCenter(center);
    model.applyMatrix4(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    oriented.updateWorldMatrix(true, true);
    bounds = new THREE.Box3().setFromObject(oriented);
  }
  const size = bounds.getSize(new THREE.Vector3());
  const width = Math.max(numberAttribute(element, "width", 1), 0.001);
  const height = Math.max(numberAttribute(element, "height", 1), 0.001);
  const depth = Math.max(numberAttribute(element, "depth", 1), 0.001);
  oriented.scale.set(
    (element.getAttribute("modelMirrored") === "true" ? -1 : 1) * width / Math.max(size.x, 0.001),
    height / Math.max(size.y, 0.001),
    depth / Math.max(size.z, 0.001),
  );
  oriented.rotation.x = -numberAttribute(element, "pitch", 0);
  oriented.rotation.z = -numberAttribute(element, "roll", 0);

  const placed = new THREE.Group();
  placed.position.set(
    numberAttribute(element, "x"),
    levelElevation + numberAttribute(element, "elevation") + height / 2,
    numberAttribute(element, "y"),
  );
  placed.rotation.y = -numberAttribute(element, "angle");
  placed.add(oriented);
  return placed;
}

function wallOpenings(home: Element, wall: Element, levelElevation: number) {
  const x0 = numberAttribute(wall, "xStart");
  const y0 = numberAttribute(wall, "yStart");
  const dx = numberAttribute(wall, "xEnd") - x0;
  const dy = numberAttribute(wall, "yEnd") - y0;
  const length = Math.hypot(dx, dy);
  const ux = dx / Math.max(length, 0.001);
  const uy = dy / Math.max(length, 0.001);
  const nx = -uy;
  const ny = ux;
  const thickness = numberAttribute(wall, "thickness", 10);
  const wallLevel = wall.getAttribute("level") ?? "";
  const openings: { start: number; end: number; bottom: number; top: number }[] = [];
  for (const door of Array.from(home.querySelectorAll("doorOrWindow"))) {
    if (!isVisible(door) || (door.getAttribute("level") ?? "") !== wallLevel || door.getAttribute("boundToWall") === "false") continue;
    const rx = numberAttribute(door, "x") - x0;
    const ry = numberAttribute(door, "y") - y0;
    const along = rx * ux + ry * uy;
    const distance = Math.abs(rx * nx + ry * ny);
    const width = numberAttribute(door, "width");
    const depth = numberAttribute(door, "depth");
    if (distance > Math.max(thickness, depth) * 0.75 + 2 || along + width / 2 <= 0 || along - width / 2 >= length) continue;
    const bottom = Math.max(0.01, numberAttribute(door, "elevation") + levelElevation - levelElevation);
    openings.push({
      start: Math.max(0.01, along - width / 2),
      end: Math.min(length - 0.01, along + width / 2),
      bottom,
      top: bottom + numberAttribute(door, "height"),
    });
  }
  return openings;
}

function wallMaterial(runtime: CadRuntime, manager: any, wall: Element) {
  const { THREE } = runtime;
  const parsed = colorValue(wall.getAttribute("leftSideColor") ?? wall.getAttribute("rightSideColor") ?? wall.getAttribute("topColor"), 0xd5d1c8);
  const textureElement = directChildren(wall, "texture")[0];
  return new THREE.MeshStandardMaterial({
    color: parsed.color,
    opacity: parsed.opacity,
    transparent: parsed.opacity < 1,
    roughness: 0.82,
    metalness: 0.01,
    map: textureFromElement(runtime, manager, textureElement),
    side: THREE.DoubleSide,
  });
}

function buildStraightWall(runtime: CadRuntime, manager: any, home: Element, wall: Element, levelElevation: number, defaultHeight: number) {
  const { THREE } = runtime;
  const x0 = numberAttribute(wall, "xStart");
  const y0 = numberAttribute(wall, "yStart");
  const dx = numberAttribute(wall, "xEnd") - x0;
  const dy = numberAttribute(wall, "yEnd") - y0;
  const length = Math.hypot(dx, dy);
  const startHeight = numberAttribute(wall, "height", defaultHeight);
  const endHeight = numberAttribute(wall, "heightAtEnd", startHeight);
  const thickness = numberAttribute(wall, "thickness", 10);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, endHeight);
  shape.lineTo(0, startHeight);
  shape.closePath();
  for (const opening of wallOpenings(home, wall, levelElevation)) {
    const topAtStart = startHeight + (endHeight - startHeight) * opening.start / Math.max(length, 0.001);
    const topAtEnd = startHeight + (endHeight - startHeight) * opening.end / Math.max(length, 0.001);
    const top = Math.min(opening.top, topAtStart, topAtEnd) - 0.01;
    if (top <= opening.bottom) continue;
    const hole = new THREE.Path();
    hole.moveTo(opening.start, opening.bottom);
    hole.lineTo(opening.start, top);
    hole.lineTo(opening.end, top);
    hole.lineTo(opening.end, opening.bottom);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -thickness / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, wallMaterial(runtime, manager, wall));
  mesh.position.set(x0, levelElevation, y0);
  mesh.rotation.y = -Math.atan2(dy, dx);
  return mesh;
}

function buildCurvedWall(runtime: CadRuntime, manager: any, wall: Element, levelElevation: number, defaultHeight: number) {
  const { THREE } = runtime;
  const x0 = numberAttribute(wall, "xStart");
  const y0 = numberAttribute(wall, "yStart");
  const x1 = numberAttribute(wall, "xEnd");
  const y1 = numberAttribute(wall, "yEnd");
  const theta = numberAttribute(wall, "arcExtent");
  const chord = Math.hypot(x1 - x0, y1 - y0);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const nx = -(y1 - y0) / Math.max(chord, 0.001);
  const ny = (x1 - x0) / Math.max(chord, 0.001);
  const offset = chord / (2 * Math.tan(theta / 2));
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  const radius = Math.hypot(x0 - cx, y0 - cy);
  const startAngle = Math.atan2(y0 - cy, x0 - cx);
  const segments = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 18)));
  const group = new THREE.Group();
  const material = wallMaterial(runtime, manager, wall);
  const startHeight = numberAttribute(wall, "height", defaultHeight);
  const endHeight = numberAttribute(wall, "heightAtEnd", startHeight);
  for (let index = 0; index < segments; index += 1) {
    const a0 = startAngle + theta * index / segments;
    const a1 = startAngle + theta * (index + 1) / segments;
    const sx = cx + Math.cos(a0) * radius;
    const sy = cy + Math.sin(a0) * radius;
    const ex = cx + Math.cos(a1) * radius;
    const ey = cy + Math.sin(a1) * radius;
    const segmentLength = Math.hypot(ex - sx, ey - sy);
    const height = (startHeight + (endHeight - startHeight) * (index + 0.5) / segments);
    const geometry = new THREE.BoxGeometry(segmentLength, height, numberAttribute(wall, "thickness", 10));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((sx + ex) / 2, levelElevation + height / 2, (sy + ey) / 2);
    mesh.rotation.y = -Math.atan2(ey - sy, ex - sx);
    group.add(mesh);
  }
  return group;
}

function buildRoom(runtime: CadRuntime, manager: any, room: Element, levelElevation: number) {
  if (room.getAttribute("floorVisible") === "false") return undefined;
  const { THREE } = runtime;
  const points = directChildren(room, "point");
  if (points.length < 3) return undefined;
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const x = numberAttribute(point, "x");
    const y = -numberAttribute(point, "y");
    if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const parsed = colorValue(room.getAttribute("floorColor"), 0xb9b3a7);
  const textureElement = directChildren(room, "texture").find((texture) => texture.getAttribute("attribute") === "floorTexture");
  const material = new THREE.MeshStandardMaterial({
    color: parsed.color,
    opacity: parsed.opacity,
    transparent: parsed.opacity < 1,
    roughness: 0.9,
    metalness: 0,
    map: textureFromElement(runtime, manager, textureElement),
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = levelElevation + 0.02;
  return mesh;
}

export async function loadSweetHome3dModel(
  runtime: CadRuntime,
  file: File,
  onProgress?: Progress,
): Promise<LoadedSweetHome> {
  onProgress?.("Extracting Sweet Home 3D project…", 40);
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const homeXmlEntry = Object.keys(entries).find((path) => normalizePath(path) === "home.xml");
  if (!homeXmlEntry) {
    throw new Error("This Sweet Home 3D project has no Home.xml entry. Files saved before Sweet Home 3D 5.3 use Java serialization and are not supported yet.");
  }
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(entries[homeXmlEntry]), "application/xml");
  const parseError = xml.querySelector("parsererror");
  const home = xml.documentElement;
  if (parseError || home.tagName !== "home") throw new Error("The Sweet Home 3D Home.xml scene description is invalid.");

  const { manager, objectUrls } = archiveFiles(runtime, entries);
  const { THREE } = runtime;
  const root = new THREE.Group();
  root.name = home.getAttribute("name") || file.name;
  const structure = new THREE.Group();
  structure.name = "Building structure";
  structure.userData.sweethome3d = { kind: "building structure" };
  const furniture = new THREE.Group();
  furniture.name = "Furniture";
  furniture.userData.sweethome3d = { kind: "furniture collection" };
  root.add(structure, furniture);

  const levels = new Map<string, { elevation: number; height: number; visible: boolean; name: string }>();
  for (const level of directChildren(home, "level")) {
    levels.set(level.getAttribute("id") ?? "", {
      elevation: numberAttribute(level, "elevation"),
      height: numberAttribute(level, "height", numberAttribute(home, "wallHeight", 250)),
      visible: isVisible(level) && level.getAttribute("viewable") !== "false",
      name: level.getAttribute("name") || "Level",
    });
  }
  const levelFor = (element: Element) => levels.get(element.getAttribute("level") ?? "") ?? {
    elevation: 0,
    height: numberAttribute(home, "wallHeight", 250),
    visible: true,
    name: "Ground level",
  };

  onProgress?.("Building rooms and walls…", 54);
  for (const room of directChildren(home, "room")) {
    const level = levelFor(room);
    const mesh = buildRoom(runtime, manager, room, level.elevation);
    if (!mesh) continue;
    mesh.name = room.getAttribute("name") || "Room";
    mesh.visible = level.visible;
    mesh.userData.sweethome3d = { kind: "room floor", level: level.name, ...elementAttributes(room) };
    structure.add(mesh);
  }
  for (const wall of directChildren(home, "wall")) {
    const level = levelFor(wall);
    const object = wall.hasAttribute("arcExtent")
      ? buildCurvedWall(runtime, manager, wall, level.elevation, level.height)
      : buildStraightWall(runtime, manager, home, wall, level.elevation, level.height);
    object.name = wall.getAttribute("id") || "Wall";
    object.visible = level.visible;
    object.userData.sweethome3d = { kind: wall.hasAttribute("arcExtent") ? "curved wall" : "wall", level: level.name, ...elementAttributes(wall) };
    structure.add(object);
  }

  const pieceElements = Array.from(home.querySelectorAll("pieceOfFurniture, doorOrWindow, light"));
  const modelCache = new Map<string, Promise<any>>();
  let fallbackCount = 0;
  let builtPieces = 0;
  const getBaseModel = (path: string) => {
    const key = normalizePath(path);
    let pending = modelCache.get(key);
    if (!pending) {
      pending = loadEmbeddedModel(runtime, entries, manager, path);
      modelCache.set(key, pending);
    }
    return pending;
  };

  const buildPiece = async (element: Element): Promise<any> => {
    const level = levelFor(element);
    const modelPath = element.getAttribute("model");
    let model: any;
    if (modelPath) {
      try { model = cloneModel(await getBaseModel(modelPath)); }
      catch (error) {
        console.warn(`Could not load Sweet Home 3D furniture model ${modelPath}`, error);
        fallbackCount += 1;
      }
    }
    if (!model) {
      model = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xc58b55, roughness: 0.85, transparent: true, opacity: 0.72 }),
      );
    }
    applyPieceMaterials(runtime, manager, model, element);
    const placed = orientAndSizePiece(runtime, model, element, level.elevation);
    placed.name = element.getAttribute("name") || (element.tagName === "doorOrWindow" ? "Door or window" : "Furniture");
    placed.visible = isVisible(element) && level.visible;
    placed.userData.sweethome3d = {
      kind: element.tagName === "doorOrWindow" ? "door or window" : element.tagName === "light" ? "light" : "piece of furniture",
      level: level.name,
      sourcePath: modelPath,
      ...elementAttributes(element),
    };
    builtPieces += 1;
    onProgress?.(`Loading furniture ${builtPieces} of ${pieceElements.length}…`, 58 + builtPieces / Math.max(pieceElements.length, 1) * 27);
    return placed;
  };

  const buildFurnitureChildren = async (parentElement: Element, parentGroup: any) => {
    for (const child of directChildren(parentElement).filter((element) => ["pieceOfFurniture", "doorOrWindow", "light", "furnitureGroup"].includes(element.tagName))) {
      if (child.tagName === "furnitureGroup") {
        const group = new THREE.Group();
        group.name = child.getAttribute("name") || "Furniture group";
        group.visible = isVisible(child);
        group.userData.sweethome3d = { kind: "furniture group", ...elementAttributes(child) };
        parentGroup.add(group);
        await buildFurnitureChildren(child, group);
      } else {
        parentGroup.add(await buildPiece(child));
      }
    }
  };
  await buildFurnitureChildren(home, furniture);

  root.userData.sweethome3d = {
    kind: "Sweet Home 3D project",
    sourcePath: file.name,
    version: home.getAttribute("version"),
    levels: levels.size || 1,
    rooms: directChildren(home, "room").length,
    walls: directChildren(home, "wall").length,
    furniture: pieceElements.length,
    distinctModels: modelCache.size,
    fallbackModels: fallbackCount,
  };
  root.updateWorldMatrix(true, true);
  if (new THREE.Box3().setFromObject(root).isEmpty()) {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    throw new Error("No visible 3D geometry was found in this Sweet Home 3D project.");
  }
  onProgress?.("Preparing Sweet Home 3D scene…", 88);
  return { model: root, objectUrls: [...objectUrls.values()] };
}
