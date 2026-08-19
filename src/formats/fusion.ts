import type { FusionRenderScene } from "../../../fusion-file-format/dist/index.js";
import {
  createFusionThreeGroup as createLibraryFusionThreeGroup,
  disposeFusionThreeGroup as disposeLibraryFusionThreeGroup,
} from "../../../fusion-file-format/dist/three/index.js";
import type { CadRuntime } from "../runtime";

export function createFusionThreeGroup(
  runtime: CadRuntime,
  scene: FusionRenderScene,
  document: any,
  sourcePath = document.name,
) {
  const model = createLibraryFusionThreeGroup(scene, {
    three: runtime.THREE,
    name: document.name,
    useMaterials: true,
  });
  model.userData.fusionDocument = true;
  model.userData.fusion = {
    ...model.userData.fusion,
    kind: "Fusion design",
    name: document.name,
    sourcePath,
    version: document.manifest?.version,
    documentType: document.manifest?.documentType,
    description: document.manifest?.description,
    documentId: document.manifest?.documentId,
    assetId: document.manifest?.assetId,
    assetType: document.manifest?.assetType,
    breps: document.breps?.length ?? 0,
    designSegments: document.designSegments?.length ?? 0,
    triangles: scene.triangleCount,
    materials: scene.materials?.length ?? 0,
    textures: scene.textures?.length ?? 0,
    unresolvedMaterialIds: [...(scene.unresolvedMaterialIds ?? [])],
    unresolvedTextureIds: [...(scene.unresolvedTextureIds ?? [])],
    diagnostics: scene.diagnostics.map((item) => `${item.code}: ${item.message}`),
  };
  return model;
}

export function disposeFusionThreeGroup(model: object) {
  if (!(model as any)?.userData?.fusionDocument) return false;
  return disposeLibraryFusionThreeGroup(model);
}
