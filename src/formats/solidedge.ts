import type { CadRuntime } from "../runtime";

type SolidEdgeDocument = {
  kind: "part" | "sheet-metal" | "assembly" | "draft" | "unknown";
  path: string;
  meshes: readonly { indices: Uint32Array }[];
  occurrences: readonly { resolvedPath?: string }[];
  references: readonly { resolvedPath?: string }[];
  assemblySiteTable?: { sites: readonly { resolvedPath?: string }[] };
  assemblyLinkTable?: { links: readonly { resolvedPath?: string }[] };
  assemblyIotData?: { streams: readonly { records: readonly unknown[] }[] };
  parasolidPayloads: readonly unknown[];
  partsLiteData?: {
    savedViews: readonly unknown[];
    featureTable?: { features: readonly unknown[] };
  };
  sheetMetal?: {
    thickness?: number;
    bendRadius?: number;
    neutralFactor?: number;
    gauge?: string;
  };
  pmi?: { designDimensions: readonly unknown[] };
  properties: Readonly<Record<string, unknown>>;
  propertySets: readonly unknown[];
  displayStyleLibrary?: { styles: readonly unknown[] };
  diagnostics: readonly { code: string; message: string }[];
};

export async function createSolidEdgeThreeGroup(runtime: CadRuntime, document: SolidEdgeDocument, sourcePath: string) {
  const model = await runtime.SolidEdgeThree.createSolidEdgeThreeGroup(document, {
    three: runtime.THREE,
    sourcePath,
    unitScale: 1,
    applyDisplayOrientation: true,
  });
  const metadata = model.userData.solidedge ?? {};
  const { properties: _nestedProperties, diagnostics: _diagnostics, ...baseMetadata } = metadata;
  const assemblySites = document.assemblySiteTable?.sites ?? [];
  const assemblyLinks = document.assemblyLinkTable?.links ?? [];
  const iotStreams = document.assemblyIotData?.streams ?? [];
  model.userData.solidedge = {
    ...baseMetadata,
    resolvedReferences: document.references.filter((reference) => reference.resolvedPath).length,
    assemblySites: assemblySites.length,
    resolvedAssemblySites: assemblySites.filter((site) => site.resolvedPath).length,
    assemblyLinks: assemblyLinks.length,
    resolvedAssemblyLinks: assemblyLinks.filter((link) => link.resolvedPath).length,
    assemblyIotRecords: iotStreams.reduce((total, stream) => total + stream.records.length, 0),
    savedViews: document.partsLiteData?.savedViews.length ?? 0,
    features: document.partsLiteData?.featureTable?.features.length ?? 0,
    pmiDimensions: document.pmi?.designDimensions.length ?? 0,
    sheetThickness: document.sheetMetal?.thickness,
    bendRadius: document.sheetMetal?.bendRadius,
    neutralFactor: document.sheetMetal?.neutralFactor,
    gauge: document.sheetMetal?.gauge,
    displayStyles: document.displayStyleLibrary?.styles.length ?? 0,
    propertySets: document.propertySets.length,
    ...document.properties,
    diagnostics: document.diagnostics.map((item) => `${item.code}: ${item.message}`),
  };
  return model;
}

export function disposeSolidEdgeThreeGroup(runtime: CadRuntime, model: any) {
  return runtime.SolidEdgeThree.disposeSolidEdgeThreeGroup(model);
}

export function resolveSolidEdgeThreeHit(runtime: CadRuntime, intersection: any) {
  return runtime.SolidEdgeThree.findSolidEdgeThreeIntersectionHit(intersection);
}
