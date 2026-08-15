import { build } from "esbuild";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "scripts", "runtime-entry.mjs");
const outfile = path.join(root, "public", "vendor", "cad-viewer-runtime.min.js");

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
  external: ["node:module", "node:fs/promises"],
  loader: { ".wasm": "dataurl" },
});

const { size } = await stat(outfile);
console.log(`Bundled CAD runtime: ${(size / 1024 / 1024).toFixed(2)} MiB`);
