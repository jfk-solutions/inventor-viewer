# Third-party notices

## JFK Solutions proprietary components

The minified browser runtime includes the following unpublished JFK Solutions libraries. Their final license terms have not yet been selected. Unless separate terms are provided, they are proprietary, confidential and all rights are reserved.

| Package | Version | License |
| --- | ---: | --- |
| `@jfk-solutions/inventor-file-format` | 0.1.0 | Proprietary (final license pending) |
| `@jfk-solutions/creo-file-format` | 0.1.0 | Proprietary (final license pending) |
| `@jfk-solutions/solidedge-file-format` | 0.1.0 | Proprietary (final license pending) |
| `@jfk-solutions/simaticnx-file-format` | 0.1.0 | Proprietary (final license pending) |
| `@jfk-solutions/fusion-file-format` | 0.1.0 | Proprietary (final license pending) |
| `@jfk-solutions/catia-file-format` | 0.1.0 | Proprietary (final license pending) |
| `@jfk-solutions/solidworks-file-format` | 0.1.0 | Proprietary (final license pending) |
| `@jfk-solutions/step-file-format` | 0.1.0 | Proprietary (final license pending) |

## Third-party open-source components

The browser runtime and application build also include the following third-party open-source software:

| Package | Version | License |
| --- | ---: | --- |
| `@node-projects/acad-ts` | 2.4.2 | MIT |
| `@jfk-solutions/demo3d-file-format` | 1.8.0 | MIT |
| `three` | 0.185.1 | MIT |
| `earcut` | 3.2.3 | ISC |
| `fzstd` | 0.1.1 | MIT |
| `@digitaldefiance/bzip2-wasm` | 1.1.1 | bzip2 1.0.6 license |
| `opencascade.js` | 2.0.0-beta.b5ff984 | LGPL-2.1-only |
| `rhino3dm` | 8.17.0 | MIT |
| `web-ifc` | 0.0.77 | MPL-2.0 |
| `fflate` | 0.8.3 | MIT |
| Online3DViewer importer algorithms | d025663 | MIT |
| `react` / `react-dom` | 19.2.x | MIT |
| `lucide-react` | 0.468.x | ISC |

License texts and copyright notices for the source packages are available in their respective upstream repositories and installed package distributions. Legal comments emitted by the bundler are retained at the end of `public/vendor/cad-viewer-runtime.min.js`.

The proprietary SolidWorks reader includes decoding logic derived from the MIT-licensed OpenSWX project and the Apache-2.0-licensed cadmpeg project. The applicable third-party license texts and full attribution are distributed at `public/vendor/licenses/solidworks-file-format-NOTICES.md`.

The proprietary CATIA reader uses CC BY 4.0 cadmpeg format documentation. The applicable attribution is distributed at `public/vendor/licenses/catia-file-format-NOTICES.md`.

The proprietary Fusion reader's notices for its `fzstd` and `earcut` dependencies are distributed at `public/vendor/licenses/fusion-file-format-NOTICES.md`.

The proprietary PTC Creo reader's applicable third-party notices are distributed at `public/vendor/licenses/creo-file-format-NOTICES.md`.

The Siemens Solid Edge reader is proprietary; its final license terms are pending.

The proprietary Siemens NX reader's attribution for the JT decoder implementation is distributed at `public/vendor/licenses/simaticnx-file-format-NOTICES.md`.

The proprietary, unpublished STEP reader and tessellator is distributed as the dedicated minified `public/vendor/step-file-format.worker.min.js` browser worker. Its final license terms are pending.

The optional OpenCascade.js CAD kernel used for IGES, BREP and embedded FreeCAD shapes remains a separately loaded and replaceable module; its complete LGPL 2.1 license is distributed at `public/vendor/opencascade/LICENSE`, and its corresponding source is available from https://github.com/donalffons/opencascade.js. The Rhino and IFC runtimes are likewise loaded only after their respective formats are selected. Their licenses are distributed at `public/vendor/rhino3dm/LICENSE` and `public/vendor/web-ifc/LICENSE.md`; the corresponding sources are available from https://github.com/mcneel/rhino3dm and https://github.com/ThatOpen/engine_web-ifc. The IFC JavaScript/WASM files remain governed by MPL-2.0 and are not relicensed under the viewer's proprietary license.

The OFF, DotBIM and FreeCAD archive import algorithms were adapted from Online3DViewer. Its MIT license and copyright notice are distributed at `public/vendor/licenses/Online3DViewer-LICENSE.md`.
