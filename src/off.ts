import type { CadRuntime } from "./runtime";

type OffColor = [number, number, number];
type OffVertex = { position: [number, number, number]; color?: OffColor };
type OffFace = { indices: number[]; color?: OffColor };

function colorComponent(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return value.includes(".") ? Math.max(0, Math.min(1, number)) : Math.max(0, Math.min(1, number / 255));
}

function parseColor(values: string[]): OffColor | undefined {
  if (values.length < 3) return undefined;
  return [colorComponent(values[0]), colorComponent(values[1]), colorComponent(values[2])];
}

function meaningfulLines(text: string) {
  return text.split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

export function parseOff(text: string) {
  const lines = meaningfulLines(text);
  if (!lines.length) throw new Error("The OFF file is empty.");

  let cursor = 0;
  let header = lines[cursor++].split(/\s+/);
  if (header[0].toUpperCase() !== "OFF") throw new Error("The file does not start with an OFF header.");
  header = header.slice(1);
  if (header.length < 2) header = lines[cursor++]?.split(/\s+/) ?? [];

  const vertexCount = Number.parseInt(header[0], 10);
  const faceCount = Number.parseInt(header[1], 10);
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 0 || !Number.isSafeInteger(faceCount) || faceCount < 0) {
    throw new Error("The OFF vertex or face count is invalid.");
  }

  const vertices: OffVertex[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const values = lines[cursor++]?.split(/\s+/) ?? [];
    const position = values.slice(0, 3).map(Number);
    if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) throw new Error(`OFF vertex ${index + 1} is invalid.`);
    vertices.push({ position: position as [number, number, number], color: parseColor(values.slice(3)) });
  }

  const faces: OffFace[] = [];
  for (let index = 0; index < faceCount; index += 1) {
    const values = lines[cursor++]?.split(/\s+/) ?? [];
    const count = Number.parseInt(values[0], 10);
    if (!Number.isSafeInteger(count) || count < 3 || values.length < count + 1) throw new Error(`OFF face ${index + 1} is invalid.`);
    const indices = values.slice(1, count + 1).map((value) => Number.parseInt(value, 10));
    if (indices.some((value) => !Number.isSafeInteger(value) || value < 0 || value >= vertices.length)) {
      throw new Error(`OFF face ${index + 1} references an invalid vertex.`);
    }
    faces.push({ indices, color: parseColor(values.slice(count + 1)) });
  }
  return { vertices, faces };
}

export async function loadOffModel(runtime: CadRuntime, file: File) {
  const { THREE } = runtime;
  const parsed = parseOff(await file.text());
  const positions: number[] = [];
  const colors: number[] = [];
  let hasColors = false;

  for (const face of parsed.faces) {
    for (let triangle = 1; triangle < face.indices.length - 1; triangle += 1) {
      for (const vertexIndex of [face.indices[0], face.indices[triangle], face.indices[triangle + 1]]) {
        const vertex = parsed.vertices[vertexIndex];
        positions.push(...vertex.position);
        const color = vertex.color ?? face.color ?? [0.568, 0.631, 0.651];
        colors.push(...color);
        hasColors ||= Boolean(vertex.color || face.color);
      }
    }
  }
  if (!positions.length) throw new Error("The OFF file contains no displayable faces.");

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (hasColors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: hasColors ? 0xffffff : 0x91a1a6,
    vertexColors: hasColors,
    roughness: 0.78,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = file.name;
  return mesh;
}
