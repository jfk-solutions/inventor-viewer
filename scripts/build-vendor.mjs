import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "scripts", "runtime-entry.mjs");
const outfile = path.join(root, "public", "vendor", "cad-viewer-runtime.min.js");
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

// Keep the LGPL CAD kernel as a separately loaded, replaceable module instead
// of embedding its roughly 50 MiB WASM binary in the main viewer runtime.
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

// Generated template literals can inherit trailing spaces from upstream shader
// sources. Keep the committed browser bundle clean and reproducible.
const bundled = await readFile(outfile, "utf8");
const normalized = bundled.replace(/[\t ]+$/gm, "").replace(/^ +(?=\t)/gm, "");
await writeFile(outfile, normalized, "utf8");

const version = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
await writeFile(versionFile, `// Generated by scripts/build-vendor.mjs.\nexport const CAD_RUNTIME_VERSION = "${version}";\n`, "utf8");

const { size } = await stat(outfile);
console.log(`Bundled CAD runtime: ${(size / 1024 / 1024).toFixed(2)} MiB · ${version}`);
