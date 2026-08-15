# JFK Solutions CAD Viewer

A modern, static CAD viewer for Autodesk Inventor and AutoCAD files. Files are parsed and rendered entirely in the browser: there is no upload service, no account and no Vault connection.

The repository is designed for GitHub Pages. The complete minimized CAD runtime is checked in at `public/vendor/cad-viewer-runtime.min.js`, so a clean Pages build does not need unpublished packages or the two sibling development repositories.

## Supported files

| Format | Support |
| --- | --- |
| `.ipt` | Inventor parts, saved display geometry, materials and iProperties exposed by the parser |
| `.iam` | Inventor assemblies with recursively resolved part/assembly references |
| `.idw` | Inventor drawings and drawing display geometry |
| `.ipn` | Inventor presentations |
| `.ide` | Inventor iFeature documents |
| `.dwg` | AutoCAD model space through `@node-projects/acad-ts` |
| `.dxf` | ASCII and binary DXF; common line, arc, circle, polyline, point and 3D-face entities |
| `.zip` | Packaged Inventor workspaces, including an IAM and all linked documents, textures and project files |
| `.faf` | Inventor Factory Asset packages |

For assemblies, package the IAM and all referenced documents into one ZIP while retaining their relative paths. The viewer discovers candidate root documents and opens the assembly first. Missing references remain visible in the model metadata; the viewer never attempts to access Autodesk Vault.

`acad-ts` reads DXF versions AC1009 through AC1032 and DWG versions AC1014 through AC1032. Visual coverage depends on the entity types contained in a drawing. Inventor feature-level coverage is evolving; serialized display meshes and wireframe fallbacks provide the broadest viewing support.

## Viewer controls

- **Move** — left-drag to orbit, right-drag to pan and scroll to zoom.
- **Select** — click geometry or an item in the model tree to inspect it in the property grid. Right-drag and scroll remain available.
- **Linear / Perspective** — switch between an orthographic engineering view and a perspective camera.
- **Fit** — frame the complete model. Double-click geometry to move the camera target to that point.
- **View cube** — jump to Top, Front or Right; Home returns to an isometric view.

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
C:\Data\Git\node-projects\acd-ts
```

Build both libraries, then regenerate the browser bundle:

```bash
cd C:/Data/Git/JFK-Solutions/inventor-file-format
npm install
npm run build

cd C:/Data/Git/node-projects/acd-ts
npm install
npm run build

cd C:/Data/Git/JFK-Solutions/inventor-viewer
npm install
npm run bundle:vendor
npm run build
```

`scripts/runtime-entry.mjs` combines Inventor parsing, the Three.js adapter, `acad-ts`, Three.js and OrbitControls. `scripts/build-vendor.mjs` creates the minified runtime, copies the minified BZip2/WASM decoder required by serialized Inventor graphics, and updates `src/runtime-version.ts` with its content hash. Commit the generated runtime, decoder directory, and version file whenever either local library changes; the hash prevents browsers and GitHub Pages from reusing an older CAD runtime.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds and publishes `dist/` after every push to `main`.

In the GitHub repository, open **Settings → Pages** and set **Source** to **GitHub Actions**. The Vite base path is relative, so the same build works at `https://<organization>.github.io/<repository>/` and on a custom domain.

## Privacy and security

- Selected files stay in browser memory and are not uploaded by this application.
- The app has no application backend, authentication or Vault integration. Cloudflare Web Analytics measures site usage; selected CAD files are not included in analytics events.
- The published site links to the dedicated German privacy notice at `datenschutz.html` from both the homepage and viewer.
- Closing or refreshing the tab releases the active workspace.
- Browser memory and GPU capacity still limit very large assemblies. ZIP and parser allocation limits protect against unexpectedly large archive entries.

## Architecture

- React + TypeScript + Vite for the static application
- Three.js for WebGL rendering and camera interaction
- [`inventor-file-format`](https://github.com/JFK-Solutions/inventor-file-format) for Inventor parsing, workspaces, ZIP providers and Three.js scene conversion
- [`acad-ts`](https://github.com/node-projects/acad-ts) for DWG/DXF parsing

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for bundled dependency licenses.

## License

Proprietary and confidential. All rights reserved by JFK Solutions. No license to use, copy, modify, or redistribute the viewer source code is granted. The licenses of bundled third-party components remain unaffected; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
