import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "scripts", "runtime-entry.mjs");
const outfile = path.join(root, "public", "vendor", "cad-viewer-runtime.min.js");
const stepWorkerEntry = path.join(root, "scripts", "step-worker-entry.mjs");
const stepWorkerOutfile = path.join(root, "public", "vendor", "step-file-format.worker.min.js");
const stepFileFormatRoot = process.env.STEP_FILE_FORMAT_ROOT
  ? path.resolve(process.env.STEP_FILE_FORMAT_ROOT)
  : path.join(root, "..", "step-file-format");
const versionFile = path.join(root, "src", "runtime-version.ts");
const bzipSource = path.join(root, "..", "inventor-file-format", "node_modules", "@digitaldefiance", "bzip2-wasm", "bzip2-1.0.8");
const bzipTarget = path.join(root, "public", "vendor", "bzip2-wasm", "bzip2-1.0.8");
const openCascadePackage = path.join(root, "..", "inventor-file-format", "node_modules", "opencascade.js");
const openCascadeTarget = path.join(root, "public", "vendor", "opencascade");
const rhinoPackage = path.join(root, "node_modules", "rhino3dm");
const rhinoTarget = path.join(root, "public", "vendor", "rhino3dm");
const webIfcPackage = path.join(root, "node_modules", "web-ifc");
const webIfcTarget = path.join(root, "public", "vendor", "web-ifc");
const fflatePackage = path.join(root, "node_modules", "fflate");
const fflateTarget = path.join(root, "public", "vendor", "fflate");
const solidWorksLicense = path.join(root, "..", "solidworks-file-format", "LICENSE");
const solidWorksNotices = path.join(root, "..", "solidworks-file-format", "THIRD_PARTY_NOTICES.md");
const catiaLicense = path.join(root, "..", "catia-file-format", "LICENSE");
const catiaNotices = path.join(root, "..", "catia-file-format", "THIRD_PARTY_NOTICES.md");
const fusionLicense = path.join(root, "..", "fusion-file-format", "LICENSE");
const fusionNotices = path.join(root, "..", "fusion-file-format", "THIRD_PARTY_NOTICES.md");
const creoLicense = path.join(root, "..", "creo-file-format", "LICENSE");
const creoNotices = path.join(root, "..", "creo-file-format", "THIRD_PARTY_NOTICES.md");
const solidEdgeLicense = path.join(root, "..", "solidedge-file-format", "LICENSE");
const stepFileFormatLicense = path.join(stepFileFormatRoot, "LICENSE");
const nxLicense = path.join(root, "..", "simaticnx-file-format", "LICENSE");
const nxNotices = path.join(root, "..", "simaticnx-file-format", "THIRD_PARTY_NOTICES.md");
const licenseTarget = path.join(root, "public", "vendor", "licenses");

await mkdir(path.dirname(outfile), { recursive: true });
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "eof",
  external: ["node:module", "node:fs/promises", "opencascade.js", "opencascade.js/*"],
  loader: { ".wasm": "dataurl" },
});

// STEP parsing and tessellation run in a dedicated worker so large files do
// not block interaction. Bundle the unpublished sibling library into a small,
// committed browser asset; production builds never depend on that repository.
await build({
  entryPoints: [stepWorkerEntry],
  outfile: stepWorkerOutfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "eof",
  plugins: [{
    name: "step-file-format-root",
    setup(build) {
      build.onResolve({ filter: /^\.\.\/\.\.\/step-file-format\/dist\/(?:index|worker)\.js$/ }, (args) => ({
        path: path.join(stepFileFormatRoot, "dist", path.basename(args.path)),
      }));
      build.onLoad({ filter: /[\\/]geometry\.js$/ }, async (args) => {
        if (path.resolve(args.path) !== path.resolve(stepFileFormatRoot, "dist", "geometry.js")) return undefined;
        let contents = await readFile(args.path, "utf8");
        if (contents.includes("shape-relationship-${entity.id}")) return { contents, loader: "js" };

        // Solid Edge exports the occurrence transform on a generic
        // SHAPE_REPRESENTATION and links its B-Rep through an identity
        // SHAPE_REPRESENTATION_RELATIONSHIP. The unreleased package currently
        // stops at that identity bridge, leaving every part definition at its
        // source placement and causing coincident surfaces to flicker.
        const replacements = [
          [
            "    const itemOwners = new Map(), mappedItemParents = new Map(), representationNames = new Map();\n    const tileSymbolRepresentations",
            "    const itemOwners = new Map(), mappedItemParents = new Map(), representationNames = new Map();\n    const representationsWithRenderItems = new Set();\n    const tileSymbolRepresentations",
          ],
          [
            "        for (const occurrence of renderItemOccurrencesBelow(document, entity.id)) {\n            const owners",
            "        for (const occurrence of renderItemOccurrencesBelow(document, entity.id)) {\n            representationsWithRenderItems.add(entity.id);\n            const owners",
          ],
          [
            "    const parentEdges = new Map();\n    for (const entity of document.ofType(\"REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION\")) {",
            `    const parentEdges = new Map();
    for (const entity of document.ofType("SHAPE_REPRESENTATION_RELATIONSHIP")) {
        if (document.component(entity, "REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION"))
            continue;
        const relationship = document.component(entity, "SHAPE_REPRESENTATION_RELATIONSHIP");
        const first = asStepReferenceId(relationship.parameters[2]), second = asStepReferenceId(relationship.parameters[3]);
        if (first === undefined || second === undefined)
            continue;
        const firstHasItems = representationsWithRenderItems.has(first), secondHasItems = representationsWithRenderItems.has(second);
        if (firstHasItems === secondHasItems)
            continue;
        const child = firstHasItems ? first : second, parent = firstHasItems ? second : first;
        const edges = parentEdges.get(child) ?? [];
        edges.push({ parent, key: \`shape-relationship-\${entity.id}\`, relationshipId: entity.id, matrix: identityMatrix() });
        parentEdges.set(child, edges);
    }
    for (const entity of document.ofType("REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION")) {`,
          ],
        ];
        for (const [before, after] of replacements) {
          if (!contents.includes(before)) throw new Error("The temporary Solid Edge STEP assembly fix no longer matches step-file-format.");
          contents = contents.replace(before, after);
        }
        return { contents, loader: "js" };
      });
    },
  }],
});

await mkdir(bzipTarget, { recursive: true });
await build({
  entryPoints: [path.join(bzipSource, "bzip2.mjs")],
  outfile: path.join(bzipTarget, "bzip2.mjs"),
  bundle: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "eof",
});
await copyFile(path.join(bzipSource, "bzip2.wasm"), path.join(bzipTarget, "bzip2.wasm"));

// Keep the LGPL CAD kernel used by IGES, BREP and FreeCAD as a separately
// loaded, replaceable module instead of embedding its roughly 50 MiB WASM
// binary in the main viewer runtime.
await mkdir(openCascadeTarget, { recursive: true });
await copyFile(path.join(openCascadePackage, "dist", "opencascade.full.js"), path.join(openCascadeTarget, "opencascade.full.js"));
await copyFile(path.join(openCascadePackage, "dist", "opencascade.full.wasm"), path.join(openCascadeTarget, "opencascade.full.wasm"));
await copyFile(path.join(openCascadePackage, "LICENSE"), path.join(openCascadeTarget, "LICENSE"));

// The Three.js 3DM loader fetches these only after a Rhino file is selected.
await mkdir(rhinoTarget, { recursive: true });
await copyFile(path.join(rhinoPackage, "rhino3dm.js"), path.join(rhinoTarget, "rhino3dm.js"));
await copyFile(path.join(rhinoPackage, "rhino3dm.wasm"), path.join(rhinoTarget, "rhino3dm.wasm"));
// The npm tarball omits the repository license, so its exact versioned MIT
// text is committed at public/vendor/rhino3dm/LICENSE.

// web-ifc itself is emitted as a Vite lazy chunk. Its single-threaded WASM
// kernel remains a separately loaded, replaceable file next to its license.
await mkdir(webIfcTarget, { recursive: true });
await copyFile(path.join(webIfcPackage, "web-ifc.wasm"), path.join(webIfcTarget, "web-ifc.wasm"));
await copyFile(path.join(webIfcPackage, "LICENSE.md"), path.join(webIfcTarget, "LICENSE.md"));

await mkdir(fflateTarget, { recursive: true });
await copyFile(path.join(fflatePackage, "LICENSE"), path.join(fflateTarget, "LICENSE"));

await mkdir(licenseTarget, { recursive: true });
await copyFile(solidWorksLicense, path.join(licenseTarget, "solidworks-file-format-LICENSE"));
await copyFile(solidWorksNotices, path.join(licenseTarget, "solidworks-file-format-NOTICES.md"));
await copyFile(catiaLicense, path.join(licenseTarget, "catia-file-format-LICENSE"));
await copyFile(catiaNotices, path.join(licenseTarget, "catia-file-format-NOTICES.md"));
await copyFile(fusionLicense, path.join(licenseTarget, "fusion-file-format-LICENSE"));
await copyFile(fusionNotices, path.join(licenseTarget, "fusion-file-format-NOTICES.md"));
await copyFile(creoLicense, path.join(licenseTarget, "creo-file-format-LICENSE"));
await copyFile(creoNotices, path.join(licenseTarget, "creo-file-format-NOTICES.md"));
await copyFile(solidEdgeLicense, path.join(licenseTarget, "solidedge-file-format-LICENSE"));
await copyFile(stepFileFormatLicense, path.join(licenseTarget, "step-file-format-LICENSE"));
await copyFile(nxLicense, path.join(licenseTarget, "simaticnx-file-format-LICENSE"));
await copyFile(nxNotices, path.join(licenseTarget, "simaticnx-file-format-NOTICES.md"));

// Generated template literals can inherit trailing spaces from upstream shader
// sources. Keep the committed browser bundle clean and reproducible.
const bundled = await readFile(outfile, "utf8");
const normalized = bundled.replace(/[\t ]+$/gm, "").replace(/^ +(?=\t)/gm, "");
await writeFile(outfile, normalized, "utf8");
const stepWorkerBundled = await readFile(stepWorkerOutfile, "utf8");
const normalizedStepWorker = stepWorkerBundled.replace(/[\t ]+$/gm, "").replace(/^ +(?=\t)/gm, "");
await writeFile(stepWorkerOutfile, normalizedStepWorker, "utf8");

const version = createHash("sha256").update(normalized).update(normalizedStepWorker).digest("hex").slice(0, 16);
await writeFile(versionFile, `// Generated by scripts/build-vendor.mjs.\nexport const CAD_RUNTIME_VERSION = "${version}";\n`, "utf8");

const { size } = await stat(outfile);
const { size: stepWorkerSize } = await stat(stepWorkerOutfile);
console.log(`Bundled CAD runtime: ${(size / 1024 / 1024).toFixed(2)} MiB · STEP worker: ${(stepWorkerSize / 1024).toFixed(1)} KiB · ${version}`);
