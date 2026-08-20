# Native CAD Viewer

A modern, static 3D viewer by JFK Solutions for Autodesk Inventor, Siemens Solid Edge, PTC Creo, Siemens NX, Fusion, CATIA V4/V5, SolidWorks, AutoCAD, Sweet Home 3D, Demo3D and common Three.js model formats. Files are parsed and rendered entirely in the browser: there is no upload service, no account and no Vault connection.

The repository is designed for GitHub Pages. The complete minified CAD runtime is checked in at `public/vendor/cad-viewer-runtime.min.js`, so a clean Pages build does not need unpublished packages or the sibling development repositories.

## Supported files

See the [complete model format support matrix](./FORMAT_SUPPORT.md) for all accepted model extensions, companion resource files and common formats that do not yet have a loader.

| Format | Support |
| --- | --- |
| `.ipt` | Inventor parts, saved display geometry, materials and iProperties exposed by the parser |
| `.iam` | Inventor assemblies with recursively resolved part/assembly references |
| `.idw` | Inventor drawings and drawing display geometry |
| `.ipn` | Inventor presentations |
| `.ide` | Inventor iFeature documents |
| `.prt` | PTC Creo parts with persisted display strips or saved-preview fallback, and Siemens NX parts, assemblies and drawings with embedded JT 9.x scene geometry, highest-detail LOD selection, transforms, colors, materials, textures and metadata; byte signatures select the correct reader |
| `.par`, `.psm` | Solid Edge parts and sheet-metal parts with native display-cache tessellation, styles, properties, saved views, feature names, model bounds and Parasolid payload metadata |
| `.asm` | Solid Edge or Creo assemblies; native CFB/PSB signatures select the reader, with Solid Edge occurrence transforms, references and native child appearances resolved from the workspace |
| `.dft` | Solid Edge draft documents with saved display geometry where present and explicit diagnostics otherwise |
| `.drw`, `.sec` | Creo drawings and Sketcher sections in the native `#UGC:2` PSB container, including numeric filename revisions |
| `.xzip` | Siemens NX ZIP/XZIP collections with discoverable PRT documents and sibling-reference resolution |
| `.f3d` | Fusion design archives with validated native ShapeManager face tessellation and model metadata |
| `.f3z` | Fusion distributed-design archives with discoverable nested F3D documents |
| `.model` | CATIA V4 MODEL headers and metadata; renderer geometry comes from a same-name AP214 `.stp` or `.step` companion selected alongside it or contained in the same ZIP |
| `.CATPart` | CATIA V5 parts with decoded native geometry carriers, hierarchy and metadata |
| `.CATProduct` | CATIA V5 products with recursively resolved CATPart/CATShape/CGR references and an explicitly diagnosed fallback layout where occurrence transforms are unavailable |
| `.CATShape`, `.cgr` | CATIA V5 shape and graphical-representation documents |
| `.sldprt` | SolidWorks parts with resilient saved display-list tessellation, feature-scoped materials, previews, configurations and custom properties |
| `.sldasm` | SolidWorks assemblies with recursively resolved, transformed occurrences, native materials and saved display-list tessellation |
| `.slddrw` | SolidWorks drawings with saved display geometry or embedded preview fallback |
| `.dwg` | AutoCAD model space through `@node-projects/acad-ts` |
| `.dxf` | ASCII and binary DXF; common line, arc, circle, polyline, point and 3D-face entities |
| `.step`, `.stp` | STEP parts and assemblies parsed and tessellated locally through the bundled dependency-free `step-file-format` Worker protocol, including colors, opacity and occurrence hierarchy |
| `.iges`, `.igs`, `.brep`, `.brp` | IGES exchange models and OpenCascade BREP geometry through the lazy-loaded OpenCascade kernel |
| `.3dm` | Rhino models through Three.js and the format-triggered `rhino3dm` worker/WASM runtime |
| `.fcstd` | FreeCAD Part/PartDesign BREP objects, placed `App::Link` instances, saved colors/transparency and visible line-segment sketches; archive decoding and OpenCascade are loaded only for FCStd files |
| `.ifc` | IFC building geometry and element metadata through format-triggered `web-ifc` and its local WASM runtime |
| `.bim`, `.off` | DotBIM scenes and OFF polygon meshes through lightweight built-in parsers |
| `.sh3d` | Sweet Home 3D 5.3+ projects, including XML-defined levels, rooms, straight/curved walls, wall openings, embedded OBJ/DAE/3DS furniture, materials and textures |
| `.zip` | Packaged or mixed workspaces containing native CAD and supported direct-load model documents, with linked files and relative paths preserved |
| `.faf` | Inventor Factory Asset packages |
| `.glb`, `.gltf` | glTF 2.0 scenes, materials, textures and animations; local sidecar resources can be selected together |
| `.obj` | Wavefront geometry, with optional `.mtl` and local texture files selected alongside it |
| `.stl`, `.ply` | Triangle meshes and PLY point clouds in ASCII or binary form |
| `.fbx`, `.dae`, `.3ds` | FBX, Collada and 3D Studio interchange models |
| `.3mf`, `.amf` | 3D manufacturing models |
| `.usd`, `.usda`, `.usdc`, `.usdz` | Universal Scene Description models and packages |
| `.wrl`, `.vrml`, `.wrz`, `.vtk`, `.vtp` | VRML/VRML97 (including gzip-compressed WRZ) and VTK PolyData models |
| `.pcd`, `.xyz` | Point-cloud data |
| `.vox` | MagicaVoxel models |
| `.json` | Three.js Object/Scene JSON |
| `.bvh` | Biovision Hierarchy skeletons and motion-capture animation clips |
| `.gcode` | CNC and 3D-printer toolpaths |
| `.ldr`, `.mpd` | LDraw models and packed multipart documents; local `.dat` parts can be selected alongside them |
| `.md2` | Quake II models with morph-target animation clips |
| `.demo3d`, `.raw3d` | Demo3D/Emulate3D projects and render-ready RAW3D scenes, loaded through the lazy `@jfk-solutions/demo3d-file-format` integration |

For assemblies, package the IAM, Solid Edge ASM/PAR/PSM, Creo ASM/PRT, NX PRT, CATProduct or SLDASM and all referenced documents into one ZIP while retaining their relative paths. The viewer detects the workspace type, discovers candidate root documents and opens the assembly first. Solid Edge, Creo, NX, CATIA and other workspace files may also be selected together. Missing references remain visible through model metadata and diagnostics; the viewer never attempts to access Autodesk Vault.

Creo support reads native Creo Parametric and legacy Pro/ENGINEER `#UGC:2` PSB files through the browser-first `creo-file-format` reader. Complete persisted display strips render as 3D meshes; when those are unavailable, the explicit saved preview is shown and parser diagnostics explain the missing analytic geometry. Creo and Siemens NX `.prt` files are routed by their native byte signatures rather than by extension.

Solid Edge support reads native Compound File Binary `.par`, `.psm`, `.asm` and `.dft` documents through the browser-first `solidedge-file-format` reader. The current workspace API resolves assembly references and exact saved occurrence transforms, applies native document and record-level display styles, and exposes properties, saved views, feature names, cache records, persistent IDs and parser diagnostics. Native triangle selections retain their display-record and persistent-ID provenance. Exact Parasolid B-Rep and DFT sheet graphics are not yet decoded; documents without a supported saved display mesh report that limitation instead of substituting invented geometry. Solid Edge and Creo `.asm` files are routed by native container signatures.

Siemens NX support reads modern SPLM and legacy Compound File Binary PRT containers and decodes embedded JT 9.x display scenes locally. The viewer selects the highest-detail Range LOD alternative, preserves repeated scene paths and geometric transforms, and applies JT vertex colors, materials, native face colors and browser-decodable base textures. Part attributes, physical properties, previews and detailed diagnostics are exposed as metadata. Reference-only assemblies resolve against sibling PRT files; until native NX assembly occurrence transforms are decoded, those components use the reader's explicitly diagnosed surrogate layout. JT 10.x and exact Parasolid B-Rep are not currently supported.

Fusion F3D and F3Z files are decoded by the browser-first `fusion-file-format` reader. The viewer renders validated planar, cylindrical, conical, toroidal and trimmed NURBS faces from native ShapeManager payloads. Unsupported faces are reported in diagnostics and are not replaced with invented geometry; F3Z and generic ZIP snapshots expose each nested F3D document as a selectable root.

CATIA V5 geometry support follows the current `catia-file-format` decoder. Native point and segment carriers are rendered in 3D; surfaces may use a diagnosed convex-hull approximation while exact concave trims and analytic/NURBS tessellation remain under development. Embedded preview images are metadata only and are never substituted for decoded 3D geometry.

CATIA V4 support is intentionally isolated from V5 parsing. The viewer validates the native `.model` header, exposes its name/version metadata, and renders faces and edges from a same-name AP214 STEP companion. Diagnostics preserve that provenance: companion STEP geometry is never described as decoded native V4 B-Rep data, and archive preview images are never used as 3D geometry.

`acad-ts` reads DXF versions AC1009 through AC1032 and DWG versions AC1014 through AC1032. Visual coverage depends on the entity types contained in a drawing. Inventor feature-level coverage is evolving; serialized display meshes and wireframe fallbacks provide the broadest viewing support.

## Viewer controls

- **Move** — left-drag to orbit, right-drag to pan and scroll to zoom.
- **Select** — click geometry or an item in the model tree to inspect it in the property grid. Right-drag and scroll remain available.
- **Linear / Perspective** — switch between an orthographic engineering view and a perspective camera.
- **Two-sided** — render both sides of mesh surfaces for interior inspection, while preserving each format's original material settings when disabled.
- **Fit** — frame the complete model. Double-click geometry to move the camera target to that point.
- **View cube** — jump to Top, Front or Right; Home returns to an isometric view.
- **Export** — download the loaded model as GLB, glTF, OBJ, binary STL, binary PLY or USDZ. Inventor IPT and IAM documents with native B-Rep geometry can also be exported as exact AP242 STEP through the library's local direct writer; no CAD kernel or upload service is required for export.

Keyboard shortcuts: `M` Move, `S` Select, `1` Linear, `2` Perspective, `F` Fit, and `Escape` clear selection.

## Local development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run typecheck
npm run build
npm run preview
```

The finished static site is written to `dist/`.

## Updating the minimized CAD runtime

Normal application builds use the committed runtime and therefore work from a standalone checkout. Rebuilding that runtime requires these sibling repositories:

```text
C:\Data\Git\JFK-Solutions\inventor-file-format
C:\Data\Git\JFK-Solutions\step-file-format
C:\Data\Git\JFK-Solutions\creo-file-format
C:\Data\Git\JFK-Solutions\solidedge-file-format
C:\Data\Git\JFK-Solutions\simaticnx-file-format
C:\Data\Git\JFK-Solutions\catia-file-format
C:\Data\Git\JFK-Solutions\solidworks-file-format
```

Build the native CAD libraries, then regenerate the browser bundle:

```bash
cd C:/Data/Git/JFK-Solutions/inventor-file-format
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/step-file-format
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/creo-file-format
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/solidedge-file-format
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/simaticnx-file-format
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/catia-file-format
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/solidworks-file-format
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/inventor-viewer
npm install
npm run bundle:vendor
npm run build
```

`scripts/runtime-entry.mjs` combines Inventor, Solid Edge, PTC Creo, Siemens NX, Fusion, CATIA and SolidWorks parsing, their viewer adapters, the npm-hosted `@node-projects/acad-ts` package, Three.js, OrbitControls, model loaders and exporters. `scripts/build-vendor.mjs` creates the minified runtime and dedicated minified STEP worker, copies their license notices and the BZip2, OpenCascade, Rhino and IFC browser assets, and updates `src/runtime-version.ts` with their combined content hash. The unpublished STEP, Solid Edge, Creo, Siemens NX, Fusion and CATIA libraries are compiled directly from sibling repositories into committed minified assets, so production builds remain standalone. OpenCascade, Rhino, IFC and FCStd archive code remain format-triggered rather than entering the initial application payload. Commit the generated runtime, STEP worker, decoder directories and version file whenever their source packages change; the hash prevents browsers and GitHub Pages from reusing older CAD code.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds and publishes `dist/` after every push to `main`.

In the GitHub repository, open **Settings → Pages** and set **Source** to **GitHub Actions**. The Vite base path is relative, so the same build works at `https://<organization>.github.io/<repository>/` and on a custom domain.

## Privacy and security

- Selected files stay in browser memory and are not uploaded by this application.
- The app has no application backend, authentication or Vault integration. Cloudflare Web Analytics measures site usage; selected model files are not included in analytics events.
- The published site links to the dedicated German privacy notice at `datenschutz.html` from both the homepage and viewer.
- Closing or refreshing the tab releases the active workspace.
- Browser memory and GPU capacity still limit very large assemblies. ZIP and parser allocation limits protect against unexpectedly large archive entries.

## Architecture

- React + TypeScript + Vite for the static application
- Three.js for WebGL rendering and camera interaction
- [`inventor-file-format`](https://github.com/JFK-Solutions/inventor-file-format) for Inventor parsing, workspaces, ZIP providers and Three.js scene conversion
- `creo-file-format` for PTC Creo / Pro/ENGINEER PSB detection, parsing, display meshes, previews and ZIP workspaces
- `solidedge-file-format` and its optional Three.js adapter for Solid Edge CFB parsing, transformed assembly previews, reference resolution, native styles, saved display-cache meshes, selection provenance, document metadata and ZIP workspaces
- `simaticnx-file-format` for Siemens NX PRT/SPLM/CFB parsing, JT scene graphs, LODs, placements, materials, colors, textures, metadata and multi-file reference resolution
- `fusion-file-format` for F3D/F3Z parsing, native ShapeManager tessellation and snapshot discovery
- `catia-file-format` for isolated CATIA V4 MODEL/STEP-companion support plus CATIA V5 parsing, ZIP/multi-file workspaces, renderer-neutral scene creation and local Three.js conversion
- `solidworks-file-format` for browser-native SolidWorks parsing, ZIP workspaces, saved tessellation and Three.js scene conversion
- [`acad-ts`](https://github.com/node-projects/acad-ts) for DWG/DXF parsing
- [`demo3d-file-format`](https://github.com/JFK-Solutions/demo3d-file-format) for lazily loaded Demo3D/RAW3D parsing and Three.js scene conversion
- `step-file-format` for dependency-free STEP parsing and tessellation through its transferable Worker protocol, including AP203/AP214/AP242 colors, opacity and occurrence hierarchy
- OpenCascade.js for lazily tessellated IGES, BREP and embedded FreeCAD shapes
- `rhino3dm`, `web-ifc` and `fflate` as isolated format-triggered runtimes for 3DM, IFC and FCStd respectively

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for bundled dependency licenses.

## License

Proprietary and confidential. All rights reserved by JFK Solutions. No license to use, copy, modify, or redistribute the viewer source code is granted. The licenses of bundled third-party components remain unaffected; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
