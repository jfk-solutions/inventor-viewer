import type { CadRuntime } from "../runtime";

export function createFusionThreeGroup(
  runtime: CadRuntime,
  scene: any,
  document: any,
  sourcePath = document.name,
) {
  const model = runtime.FusionThree.createFusionThreeGroup(scene, {
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
    diagnostics: scene.diagnostics.map((item: any) => `${item.code}: ${item.message}`),
  };
  return model;
}

export function disposeFusionThreeGroup(runtime: CadRuntime, model: object) {
  if (!(model as any)?.userData?.fusionDocument) return false;
  return runtime.FusionThree.disposeFusionThreeGroup(model);
}

export function resolveFusionThreeFaceHit(runtime: CadRuntime, intersection: { object?: any; faceIndex?: number }) {
  return runtime.FusionThree.resolveFusionThreeFaceHit(intersection);
}

export function createFusionThreeFaceHighlight(runtime: CadRuntime, intersection: { object?: any; faceIndex?: number }) {
  return runtime.FusionThree.createFusionThreeFaceHighlight(intersection, { three: runtime.THREE });
}
