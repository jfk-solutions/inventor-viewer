import type { CadRuntime } from "../runtime";

type NxDiagnostic = { code: string; message: string; path?: string };

type NxTextureCoordinateChannel = {
  channel: number;
  componentCount: 1 | 2 | 3 | 4;
  values: Float32Array;
};

type NxMesh = {
  name: string;
  positions: Float32Array;
  normals?: Float32Array;
  colors?: Float32Array;
  textureCoordinates?: readonly NxTextureCoordinateChannel[];
  indices: Uint32Array;
  faceGroups?: Uint32Array;
};

type NxShapeBinding = {
  meshIndex: number;
  sceneSegmentId?: string;
  shapeNodeObjectId?: number;
  nodePath: readonly number[];
  worldTransform: readonly number[];
  effectiveDiffuse?: readonly [number, number, number, number];
  effectiveBlending?: boolean;
  effectiveOverridesVertexColors?: boolean;
  rangeLodChildIndex?: number;
  shapeLod?: number;
};

type NxDocument = {
  kind: "part" | "assembly" | "drawing" | "unknown";
  name: string;
  nxContainerVersion: string;
  jtVersion?: string;
  unit: "m";
  meshes: readonly NxMesh[];
  materials?: readonly any[];
  jtSceneNodes?: readonly any[];
  jtMeshLods?: readonly any[];
  jtShapeBindings?: readonly NxShapeBinding[];
  jtTextureImages?: readonly any[];
  jtTextureBindings?: readonly any[];
  faceAppearances?: readonly { meshIndex: number; faceGroup: number; rgb: readonly [number, number, number] }[];
  materialTextures?: readonly { path: string; mediaType: string; bytes: Uint8Array }[];
  attributes?: readonly any[];
  physicalProperties?: Record<string, number>;
  images?: readonly any[];
  references: readonly string[];
  streams: readonly string[];
  preview?: { mediaType: "image/png" | "image/jpeg" | "image/bmp"; bytes: Uint8Array };
  diagnostics: readonly NxDiagnostic[];
};

type NxPlacement = { meshIndex: number; binding: NxShapeBinding };

const IDENTITY_TRANSFORM = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const PALETTE = [0x68aeb7, 0xd69752, 0x7da77a, 0xa98bc0, 0x9da9ad, 0xc8b96f];

function activePlacements(runtime: CadRuntime, document: NxDocument): NxPlacement[] {
  const bindings = document.jtShapeBindings ?? [];
  const selectedBindings: NxShapeBinding[] = runtime.Nx.selectJtLodBindings?.(bindings, 0) ?? bindings;
  const boundMeshes = new Set(bindings.map((binding) => binding.meshIndex));
  const activeIndices: number[] = runtime.Nx.selectJtLodMeshIndices?.(
    document.meshes.length,
    bindings,
    document.jtMeshLods ?? [],
    0,
  ) ?? document.meshes.map((_, index) => index);
  const placements = selectedBindings.map((binding) => ({ meshIndex: binding.meshIndex, binding }));
  for (const meshIndex of activeIndices) {
    if (!boundMeshes.has(meshIndex)) placements.push({
      meshIndex,
      binding: { meshIndex, nodePath: [], worldTransform: IDENTITY_TRANSFORM },
    });
  }
  return placements.sort((left, right) => left.meshIndex - right.meshIndex);
}

function lodAlternativeCount(document: NxDocument) {
  const boundMeshes = new Set((document.jtShapeBindings ?? []).map((binding) => binding.meshIndex));
  const streamAlternatives = new Map<number, Set<number>>();
  for (const lod of document.jtMeshLods ?? []) {
    if (boundMeshes.has(lod.meshIndex) || lod.segmentType < 7 || lod.segmentType > 16) continue;
    const values = streamAlternatives.get(lod.jtStreamIndex) ?? new Set<number>();
    values.add(lod.segmentType);
    streamAlternatives.set(lod.jtStreamIndex, values);
  }
  return Math.max(
    1,
    ...(document.jtShapeBindings ?? []).map((binding) => (binding.rangeLodChildIndex ?? -1) + 1),
    ...[...streamAlternatives.values()].map((values) => values.size),
  );
}

function displayColors(THREE: any, document: NxDocument, source: NxMesh, meshIndex: number, binding: NxShapeBinding) {
  const vertexCount = source.positions.length / 3;
  const base = new THREE.Color(PALETTE[meshIndex % PALETTE.length]);
  let rgba: Float32Array | undefined;
  if (source.colors?.length === vertexCount * 4) rgba = source.colors.slice();
  else if (source.colors?.length === vertexCount * 3) {
    rgba = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      rgba.set(source.colors.subarray(vertex * 3, vertex * 3 + 3), vertex * 4);
      rgba[vertex * 4 + 3] = 1;
    }
  }

  const materialColor = binding.effectiveDiffuse && (!rgba || binding.effectiveOverridesVertexColors)
    ? binding.effectiveDiffuse
    : undefined;
  if (materialColor) {
    rgba = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) rgba.set(materialColor, vertex * 4);
  }

  const faceColors = new Map((document.faceAppearances ?? [])
    .filter((appearance) => appearance.meshIndex === meshIndex)
    .map((appearance) => [appearance.faceGroup, appearance.rgb]));
  if (faceColors.size && source.faceGroups?.length === source.indices.length / 3) {
    rgba ??= new Float32Array(vertexCount * 4);
    if (!source.colors && !materialColor) {
      for (let vertex = 0; vertex < vertexCount; vertex += 1) rgba.set([base.r, base.g, base.b, 1], vertex * 4);
    }
    for (let triangle = 0; triangle < source.faceGroups.length; triangle += 1) {
      const color = faceColors.get(source.faceGroups[triangle]);
      if (!color) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = source.indices[triangle * 3 + corner];
        rgba.set([color[0], color[1], color[2], 1], vertex * 4);
      }
    }
  }

  if (!rgba) return { base, colors: undefined, opacity: 1 };
  const colors = new Float32Array(vertexCount * 3);
  let alphaTotal = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    colors.set(rgba.subarray(vertex * 4, vertex * 4 + 3), vertex * 3);
    alphaTotal += rgba[vertex * 4 + 3];
  }
  return { base, colors, opacity: Math.min(1, Math.max(0, alphaTotal / Math.max(vertexCount, 1))) };
}

function textureChoice(document: NxDocument, source: NxMesh, meshIndex: number, binding: NxShapeBinding) {
  const groups = new Map<number, Map<string, any>>();
  for (const candidate of document.jtTextureBindings ?? []) {
    if (candidate.meshIndex !== meshIndex || candidate.textureType !== 2 || candidate.textureChannel < 0) continue;
    if (binding.sceneSegmentId && (
      candidate.sceneSegmentId !== binding.sceneSegmentId
      || candidate.shapeNodeObjectId !== binding.shapeNodeObjectId
      || candidate.nodePath.join(",") !== binding.nodePath.join(",")
    )) continue;
    const channel = source.textureCoordinates?.find((value) => (
      value.channel === candidate.textureCoordinateChannel
      && value.componentCount >= 2
      && value.values.length / value.componentCount === source.positions.length / 3
    ));
    const image = (document.jtTextureImages ?? []).find((value) => (
      value.objectId === candidate.imageObjectId && value.segmentId === candidate.sceneSegmentId
    ));
    const inline = image?.versionData?.at(-1)?.inlineImages?.[0]?.mipmaps?.[0];
    const resolved = candidate.resolvedAssets?.length === 1 ? candidate.resolvedAssets[0] : undefined;
    const asset = (document.materialTextures ?? []).find((value) => value.path === resolved?.assetPath);
    if (!channel || (!inline?.rgba8 && !asset) || asset?.mediaType === "image/tiff") continue;
    const signature = JSON.stringify([
      candidate.sceneSegmentId,
      candidate.imageObjectId,
      resolved?.assetPath,
      candidate.textureCoordinateChannel,
      candidate.sWrapMode,
      candidate.tWrapMode,
      candidate.textureTransform,
    ]);
    const choices = groups.get(candidate.textureChannel) ?? new Map<string, any>();
    choices.set(signature, { binding: candidate, channel, inline, asset });
    groups.set(candidate.textureChannel, choices);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, choices]) => choices.size === 1 ? [...choices.values()] : [])
    .at(-1);
}

async function loadTexture(THREE: any, choice: any, objectUrls: string[], ownedTextures: any[]) {
  if (!choice) return undefined;
  let texture: any;
  if (choice.inline?.rgba8) {
    const pixels = new Uint8Array(choice.inline.rgba8.length);
    pixels.set(choice.inline.rgba8);
    texture = new THREE.DataTexture(pixels, choice.inline.width, choice.inline.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.needsUpdate = true;
  } else {
    const bytes = new Uint8Array(choice.asset.bytes.byteLength);
    bytes.set(choice.asset.bytes);
    const objectUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: choice.asset.mediaType }));
    try {
      texture = await new THREE.TextureLoader().loadAsync(objectUrl);
      objectUrls.push(objectUrl);
    } catch {
      URL.revokeObjectURL(objectUrl);
      return undefined;
    }
  }
  texture.name = choice.asset?.path ?? "Embedded Siemens NX texture";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = choice.binding.sWrapMode === 2 ? THREE.RepeatWrapping : choice.binding.sWrapMode === 3 ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = choice.binding.tWrapMode === 2 ? THREE.RepeatWrapping : choice.binding.tWrapMode === 3 ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = choice.binding.mipmapMagnificationFilter === 1 ? THREE.NearestFilter : THREE.LinearFilter;
  const minFilters = [THREE.LinearFilter, THREE.NearestFilter, THREE.LinearFilter, THREE.NearestMipmapNearestFilter, THREE.LinearMipmapNearestFilter, THREE.NearestMipmapLinearFilter, THREE.LinearMipmapLinearFilter];
  texture.minFilter = minFilters[choice.binding.mipmapMinificationFilter] ?? THREE.LinearFilter;
  const transform = choice.binding.textureTransform;
  if (transform?.length === 16) {
    texture.matrixAutoUpdate = false;
    texture.matrix.set(transform[0], transform[1], transform[3], transform[4], transform[5], transform[7], transform[12], transform[13], transform[15]);
  }
  ownedTextures.push(texture);
  return texture;
}

export async function createNxThreeGroup(runtime: CadRuntime, document: NxDocument, sourcePath: string) {
  const { THREE } = runtime;
  const model = new THREE.Group();
  const placements = activePlacements(runtime, document);
  const triangleCount = placements.reduce((total, placement) => total + (document.meshes[placement.meshIndex]?.indices.length ?? 0) / 3, 0);
  model.name = document.name || sourcePath.split(/[\\/]/).pop() || sourcePath;
  model.userData.nxDocument = true;
  model.userData.nxOwnedTextures = [];
  model.userData.nx = {
    kind: `Siemens NX ${document.kind}`,
    name: document.name,
    sourcePath,
    containerVersion: document.nxContainerVersion,
    jtVersion: document.jtVersion,
    unit: document.unit,
    meshes: document.meshes.length,
    activeMeshes: new Set(placements.map((placement) => placement.meshIndex)).size,
    shapePlacements: placements.length,
    lodAlternatives: lodAlternativeCount(document),
    triangles: triangleCount,
    materials: document.materials?.length ?? 0,
    sceneNodes: document.jtSceneNodes?.length ?? 0,
    textures: (document.jtTextureImages?.length ?? 0) + (document.materialTextures?.length ?? 0),
    images: document.images?.length ?? Number(Boolean(document.preview)),
    attributes: document.attributes?.length ?? 0,
    ...document.physicalProperties,
    references: document.references,
    streams: document.streams.length,
    diagnostics: document.diagnostics.map((item) => `${item.code}: ${item.message}`),
  };

  const objectUrls: string[] = [];
  const occurrences = new Map<number, number>();
  for (const placement of placements) {
    const source = document.meshes[placement.meshIndex];
    if (!source) continue;
    const occurrence = (occurrences.get(placement.meshIndex) ?? 0) + 1;
    occurrences.set(placement.meshIndex, occurrence);
    const color = displayColors(THREE, document, source, placement.meshIndex, placement.binding);
    const choice = textureChoice(document, source, placement.meshIndex, placement.binding);
    const texture = await loadTexture(THREE, choice, objectUrls, model.userData.nxOwnedTextures);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
    if (source.normals?.length === source.positions.length) geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
    else geometry.computeVertexNormals();
    if (color.colors) geometry.setAttribute("color", new THREE.BufferAttribute(color.colors, 3));
    if (choice) {
      const coordinates = new Float32Array(source.positions.length / 3 * 2);
      for (let vertex = 0; vertex < source.positions.length / 3; vertex += 1) {
        coordinates[vertex * 2] = choice.channel.values[vertex * choice.channel.componentCount];
        coordinates[vertex * 2 + 1] = choice.channel.values[vertex * choice.channel.componentCount + 1];
      }
      geometry.setAttribute("uv", new THREE.BufferAttribute(coordinates, 2));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const transparent = color.opacity < 0.999 || placement.binding.effectiveBlending === true;
    const material = new THREE.MeshStandardMaterial({
      color: color.colors ? 0xffffff : color.base,
      vertexColors: Boolean(color.colors),
      map: texture,
      opacity: color.opacity,
      transparent,
      depthWrite: !transparent,
      metalness: 0.08,
      roughness: 0.58,
      side: THREE.FrontSide,
    });
    material.name = "Siemens NX display material";

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = source.name || `NX body ${placement.meshIndex + 1}`;
    if (occurrence > 1) mesh.name = `${mesh.name} [instance ${occurrence}]`;
    if (placement.binding.worldTransform?.length === 16) {
      mesh.matrix.fromArray(placement.binding.worldTransform);
      mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    }
    mesh.userData.nx = {
      kind: "Siemens NX body",
      name: mesh.name,
      sourcePath,
      triangles: source.indices.length / 3,
      faceGroups: source.faceGroups ? new Set(source.faceGroups).size : 0,
      lod: placement.binding.shapeLod ?? placement.binding.rangeLodChildIndex,
      scenePath: placement.binding.nodePath,
      transformed: placement.binding.worldTransform?.some((value, index) => value !== IDENTITY_TRANSFORM[index]) ?? false,
      textured: Boolean(texture),
    };
    model.add(mesh);
  }

  if (!triangleCount && document.preview) {
    const previewBytes = new Uint8Array(document.preview.bytes.byteLength);
    previewBytes.set(document.preview.bytes);
    const objectUrl = URL.createObjectURL(new Blob([previewBytes.buffer], { type: document.preview.mediaType }));
    objectUrls.push(objectUrl);
    try {
      const texture = await new THREE.TextureLoader().loadAsync(objectUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const width = Number(texture.image?.naturalWidth ?? texture.image?.width ?? 1);
      const height = Number(texture.image?.naturalHeight ?? texture.image?.height ?? 1);
      const geometry = new THREE.PlaneGeometry(Math.max(width / Math.max(height, 1), 0.01), 1);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true });
      const preview = new THREE.Mesh(geometry, material);
      preview.name = `${model.name} saved preview`;
      preview.userData.nx = { kind: "Siemens NX saved preview", sourcePath, width, height };
      model.userData.nxOwnedTextures.push(texture);
      model.add(preview);
    } catch (cause) {
      URL.revokeObjectURL(objectUrl);
      throw cause;
    }
  }

  // NX/JT geometry is metre-based and Z-up. Rotate it into the viewer's
  // metre-based, Y-up scene without changing its native scale.
  model.rotation.x = -Math.PI / 2;
  return { model, objectUrls };
}

export function disposeNxThreeGroup(model: any) {
  if (!model?.userData?.nxDocument) return false;
  const geometries = new Set<any>();
  const materials = new Set<any>();
  model.traverse?.((object: any) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of objectMaterials) materials.add(material);
  });
  for (const texture of model.userData.nxOwnedTextures ?? []) texture.dispose?.();
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  return true;
}
