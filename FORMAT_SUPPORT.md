# Model format support

This matrix describes the model files that Native CAD Viewer can open directly in the browser. **Yes** means the extension is currently accepted as a standalone model. **No** means there is no direct loader for it yet.

The unsupported section is a practical list of common CAD, BIM, DCC, mesh, animation and point-cloud formats; it is not intended to enumerate every 3D format ever created. An unsupported file may still be usable after conversion to a supported format such as glTF/GLB, STEP, OBJ or STL.

For Siemens files, **NX** and **SIMATIC** are separate product families. NX Mechatronics Concept Designer (NX MCD) can integrate with SIMATIC and SIMIT, but its actual 3D parts and assemblies are NX `.prt` files. SIMIT `.simarc` files are simulation project archives, not standalone 3D models; they are listed for completeness.

For Autodesk Fusion, `.f3d` is the native design archive and `.f3z` packages distributed designs with external references. Fusion drawing, manufacturing and electronics files are included below, but they are not standalone 3D models. Fusion can export several formats that the viewer already opens, including STEP, 3MF, FBX, OBJ, STL, DWG, DXF and USDZ.

For Siemens Solid Edge, `.par`, `.asm`, `.psm`, `.dft` and legacy `.pwd` are native documents. Solid Edge also exchanges JT, Parasolid, STEP, IGES, STL, DWG and DXF files already represented in the matrix.

Onshape is cloud-native and has **no native downloadable model-file extension**. Parts and assemblies are exported to formats such as Parasolid, ACIS, STEP, IGES, PVZ, JT, Rhino 3DM, glTF/GLB, OBJ, 3MF, URDF and STL. Exported files do not retain Onshape feature or parametric history.

For PTC Creo Parametric, `.prt` and `.asm` are the principal 3D part and assembly documents. Creo uses additional proprietary files for drawings, manufacturing, layouts, sections, user-defined features and Family Table accelerators. Creo filename versions such as `part.prt.12` may append a numeric revision after the normal extension.

**Specification** describes the format, not the software used to read it. **Open** means a public specification or openly documented interchange format is available. **Closed** means proprietary, undocumented or only partly documented. **Mixed** is used for a grouped family whose members differ. An open-source reader does not make a closed format open.

Links in **Open-source information or library** are implementation leads, not dependencies already bundled by this viewer unless the row is supported. Their feature coverage, license compatibility, WebAssembly/browser suitability and maintenance status must be evaluated before adding a loader.

| Extension | Format | Common software or ecosystem | Viewer support | Specification | Open-source information or library |
| --- | --- | --- | :---: | :---: | --- |
| `.3dm` | Rhino 3D Model | Rhinoceros 3D; also an Onshape export format | Yes | Closed | Current format-triggered Three.js loader and MIT-licensed [rhino3dm](https://github.com/mcneel/rhino3dm) WASM runtime |
| `.3ds` | 3D Studio mesh | Autodesk 3D Studio / 3ds Max | Yes | Closed | Current [Three.js loaders](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/loaders); also [Assimp](https://github.com/assimp/assimp/blob/master/doc/Fileformats.md) |
| `.3mf` | 3D Manufacturing Format | 3MF Consortium, Autodesk Fusion, Onshape, slicers and CAD tools | Yes | Open | Current Three.js loader; official [lib3mf](https://github.com/3MFConsortium/lib3mf) |
| `.amf` | Additive Manufacturing File Format | Additive-manufacturing and slicer tools | Yes | Open | Current [Three.js AMF loader](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/loaders) |
| `.bim` | DotBIM | Open BIM tools using the dotbim format | Yes | Open | Current built-in parser; public [dotbim specification and libraries](https://github.com/paireks/dotbim) |
| `.brep`, `.brp` | Open CASCADE B-Rep | Open CASCADE and compatible CAD tools | Yes | Open | Current lazy [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT) reader and tessellator |
| `.bvh` | Biovision Hierarchy animation | Motion-capture and animation tools | Yes | Open | Current [Three.js BVHLoader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/BVHLoader.js) |
| `.catpart`, `.catproduct`, `.catshape`, `.cgr` | CATIA V5 part, product, shape and graphical representation | Dassault Systèmes CATIA | Yes | Closed | Current MIT-licensed `catia-file-format` browser reader; native geometry carriers, references and hierarchy are decoded, with explicit diagnostics for approximated surfaces and fallback assembly layout |
| `.dae` | COLLADA | Khronos interchange; Onshape, Blender, Maya and other 3D tools | Yes | Open | Current Three.js loader; [OpenCOLLADA](https://github.com/KhronosGroup/OpenCOLLADA) and [Assimp](https://github.com/assimp/assimp) |
| `.demo3d` | Demo3D project | Emulate3D / Demo3D | Yes | Closed | Current MIT-licensed [demo3d-file-format](https://github.com/JFK-Solutions/demo3d-file-format) reader |
| `.dwg` | AutoCAD Drawing | Autodesk AutoCAD, Fusion and compatible CAD tools | Yes | Closed | Current MIT-licensed [acad-ts](https://github.com/node-projects/acad-ts); GPL [LibreDWG](https://github.com/LibreDWG/libredwg) |
| `.dxf` | Drawing Exchange Format | Autodesk AutoCAD, Fusion and compatible CAD tools | Yes | Open | Current [acad-ts](https://github.com/node-projects/acad-ts); [LibreDWG](https://github.com/LibreDWG/libredwg) and [Assimp](https://github.com/assimp/assimp) |
| `.faf` | Factory Asset package | Autodesk Inventor Factory / Factory Design Utilities | Yes | Closed | Current MIT-licensed [inventor-file-format](https://github.com/JFK-Solutions/inventor-file-format) reader |
| `.f3d` | Fusion design archive | Autodesk Fusion Design | Yes | Closed | Current MIT-licensed `fusion-file-format` browser reader; native ShapeManager planar, cylindrical, conical, toroidal and trimmed NURBS faces are tessellated with explicit diagnostics for unsupported geometry |
| `.f3z` | Fusion distributed-design archive | Autodesk Fusion assemblies and externally referenced designs | Yes | Closed | Current `fusion-file-format` snapshot reader discovers nested F3D documents, including Zstandard-compressed entries, and exposes them as selectable roots |
| `.fbx` | Filmbox interchange | Autodesk Fusion, Maya, 3ds Max and other DCC tools | Yes | Closed | Current Three.js loader; [Assimp](https://github.com/assimp/assimp) has an open-source importer |
| `.fcstd` | FreeCAD document | FreeCAD | Yes | Open | Current format-triggered ZIP/XML reader for BREP shapes, `App::Link` placements, saved appearance and line-segment sketches, plus lazy OpenCascade tessellation; official [FCStd format overview](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/File_Format_FCStd.md) and [FreeCAD source](https://github.com/FreeCAD/FreeCAD) |
| `.glb` | Binary glTF 2.0 | Khronos glTF ecosystem and Onshape | Yes | Open | Current Three.js loader; official [glTF specification and tools](https://github.com/KhronosGroup/glTF) |
| `.gltf` | glTF 2.0 | Khronos glTF ecosystem and Onshape | Yes | Open | Current Three.js loader; official [glTF specification and tools](https://github.com/KhronosGroup/glTF) |
| `.gcode` | Machine toolpath | CNC machines and 3D-printer slicers | Yes | Open | Current [Three.js GCodeLoader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/GCodeLoader.js); dialects vary by machine and slicer |
| `.iam` | Inventor Assembly | Autodesk Inventor | Yes | Closed | Current MIT-licensed [inventor-file-format](https://github.com/JFK-Solutions/inventor-file-format) reader |
| `.ide` | Inventor iFeature | Autodesk Inventor | Yes | Closed | Current MIT-licensed [inventor-file-format](https://github.com/JFK-Solutions/inventor-file-format) reader |
| `.idw` | Inventor Drawing | Autodesk Inventor | Yes | Closed | Current MIT-licensed [inventor-file-format](https://github.com/JFK-Solutions/inventor-file-format) reader |
| `.ifc` | Industry Foundation Classes | buildingSMART BIM ecosystem | Yes | Open | Current format-triggered MPL-2.0 [web-ifc](https://github.com/ThatOpen/engine_web-ifc) reader and WASM tessellator |
| `.iges`, `.igs` | IGES | Mechanical CAD interchange | Yes | Open | Current lazy [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT) reader and tessellator |
| `.ipn` | Inventor Presentation | Autodesk Inventor | Yes | Closed | Current MIT-licensed [inventor-file-format](https://github.com/JFK-Solutions/inventor-file-format) reader |
| `.ipt` | Inventor Part | Autodesk Inventor | Yes | Closed | Current MIT-licensed [inventor-file-format](https://github.com/JFK-Solutions/inventor-file-format) reader |
| `.json` | Three.js Object/Scene JSON | Three.js | Yes | Open | Current [Three.js ObjectLoader](https://threejs.org/docs/#api/en/loaders/ObjectLoader) |
| `.ldr`, `.mpd` | LDraw model / multipart document | LDraw LEGO CAD ecosystem | Yes | Open | Current [Three.js LDrawLoader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/LDrawLoader.js); packed MPD files or locally selected `.dat` parts are supported |
| `.md2` | Quake II model | id Software game tooling | Yes | Open | Current [Three.js MD2Loader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/MD2Loader.js) |
| `.model` | CATIA V4 MODEL | Dassault Systèmes CATIA V4 | Yes | Closed | Current isolated MIT-licensed `catia-file-format/v4` reader validates native MODEL headers and uses a same-name AP214 `.stp`/`.step` companion for provisional renderer geometry; native V4 B-Rep records are not yet decoded |
| `.obj` | Wavefront OBJ | Autodesk Fusion, Onshape and most 3D/DCC tools | Yes | Open | Current Three.js loader; [Assimp](https://github.com/assimp/assimp) |
| `.off` | Object File Format | Geomview and geometry-processing tools | Yes | Open | Current built-in text mesh parser; [Assimp](https://github.com/assimp/assimp/blob/master/doc/Fileformats.md) also provides an importer |
| `.pcd` | Point Cloud Data | Point Cloud Library (PCL) | Yes | Open | Current Three.js loader; [PCL](https://github.com/PointCloudLibrary/pcl) |
| `.ply` | Polygon File Format | Stanford 3D scanning and mesh ecosystem | Yes | Open | Current Three.js loader; [Assimp](https://github.com/assimp/assimp) |
| `.raw3d` | RAW3D scene | Emulate3D / Demo3D | Yes | Closed | Current MIT-licensed [demo3d-file-format](https://github.com/JFK-Solutions/demo3d-file-format) reader |
| `.sldasm`, `.sldprt`, `.slddrw` | SolidWorks assembly, part and drawing | Dassault Systèmes SolidWorks | Yes | Closed | Current MIT-licensed `solidworks-file-format` reader for modern and legacy containers, transformed assembly occurrences, multi-block display tessellation with normal recovery, feature-scoped materials, metadata and previews |
| `.step`, `.stp` | STEP (ISO 10303) | Autodesk Fusion and most mechanical CAD systems | Yes | Open | Current [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT) reader and tessellator |
| `.stl` | Stereolithography mesh | Autodesk Fusion, Onshape, 3D printing, scanning and CAD tools | Yes | Open | Current Three.js loader; [Assimp](https://github.com/assimp/assimp) |
| `.usd` | Universal Scene Description | Pixar USD ecosystem | Yes | Open | Current Three.js loader; official [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD) |
| `.usda` | ASCII Universal Scene Description | Pixar USD ecosystem | Yes | Open | Current Three.js loader; official [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD) |
| `.usdc` | Binary Universal Scene Description | Pixar USD ecosystem | Yes | Open | Current Three.js loader; official [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD) |
| `.usdz` | Packaged Universal Scene Description | Autodesk Fusion, Apple AR and Pixar USD ecosystem | Yes | Open | Current Three.js loader; official [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD) |
| `.vox` | MagicaVoxel model | MagicaVoxel | Yes | Open | Current Three.js loader; public [MagicaVoxel format description](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt) |
| `.vrml`, `.wrl` | VRML / VRML97 | VRML authoring and legacy CAD/DCC tools | Yes | Open | Current Three.js loader; [Assimp](https://github.com/assimp/assimp) |
| `.wrz` | Gzip-compressed VRML | VRML authoring and legacy CAD/DCC tools | Yes | Open | Current Three.js VRML loader plus gzip decompression |
| `.vtk` | VTK legacy dataset | Visualization Toolkit (VTK) | Yes | Open | Current Three.js loader; official [VTK](https://github.com/Kitware/VTK) |
| `.vtp` | VTK XML PolyData | Visualization Toolkit (VTK) | Yes | Open | Current Three.js loader; official [VTK](https://github.com/Kitware/VTK) |
| `.xyz` | XYZ point cloud | Point-cloud and scanning tools | Yes | Open | Current Three.js loader; simple documented text layout with ecosystem-specific variants |
| `.zip` | Packaged or mixed multi-format workspace | Viewer package containing supported model files and dependencies | Yes | Open | Combined discovery for native CAD documents and all supported direct-load model formats, with relative sidecar-resource resolution |
| `.3dxml` | 3DXML | Dassault Systèmes CATIA / 3DEXPERIENCE | No | Closed | No complete open-source reader identified; [Assimp tracks the restrictive format](https://github.com/assimp/assimp/issues/3145) |
| `.abc` | Alembic | Film/VFX DCC tools | No | Open | Official [Alembic](https://github.com/alembic/alembic) library |
| `.asm` | Solid Edge or Creo assembly; extension also used by other CAD systems | Siemens Solid Edge or PTC Creo, depending on file origin | No | Closed | Official [Solid Edge API](https://support.industrysoftware.automation.siemens.com/trainings/se/106/api/SolidEdgeFramework~Application~GetSaveAsFileName.html) and [Creo file-type documentation](https://support.ptc.com/help/creo/creo_pma/r12/usascii/fundamentals/fundamentals/About_File_Types.html); no dependable complete open-source reader identified |
| `.blend` | Blender project | Blender | No | Closed | [Blender](https://github.com/blender/blender) itself is open source; Assimp deprecated its importer because the native format is undocumented and unstable |
| `.c4d` | Cinema 4D project | Maxon Cinema 4D | No | Closed | Assimp documents optional C4D support that depends on a non-free external SDK; no independent complete OSS reader identified |
| `.cam360` | Fusion manufacturing/CAM archive | Autodesk Fusion Manufacture | No | Closed | [Official Autodesk format list](https://help.autodesk.com/view/fusion360/ENU/?guid=TPD-SUPPORTED-FILE-FORMATS); no dependable complete open-source reader identified |
| `.dft` | Solid Edge draft/drawing | Siemens Solid Edge | No | Closed | [Official Solid Edge API information](https://support.industrysoftware.automation.siemens.com/trainings/se/106/api/SolidEdgeFramework~Application~GetSaveAsFileName.html); not a standalone 3D model and no dependable complete open-source reader identified |
| `.drw` | Creo drawing | PTC Creo Parametric | No | Closed | [Official PTC file-type documentation](https://support.ptc.com/help/creo/creo_pma/r12/usascii/fundamentals/fundamentals/About_File_Types.html); not a standalone 3D model and no dependable complete open-source reader identified |
| `.drc` | Draco compressed mesh | Google Draco | No | Open | Official [Draco](https://github.com/google/draco) library; often used inside glTF rather than standalone |
| `.dwf`, `.dwfx` | Design Web Format | Autodesk design-review ecosystem | No | Closed | Some public format information exists, but no maintained complete open-source standalone reader was identified |
| `.e57` | ASTM E57 point cloud | 3D laser-scanning tools | No | Open | [libE57Format](https://github.com/asmaloney/libE57Format) |
| `.f2d` | Fusion drawing archive | Autodesk Fusion Drawings | No | Closed | [Official Autodesk native-format information](https://www.autodesk.com/products/fusion-360/blog/effortless-file-management-in-autodesk-fusion-a-complete-guide/); no dependable complete open-source reader identified |
| `.f2t` | Fusion drawing template | Autodesk Fusion Drawings | No | Closed | [Official Autodesk format list](https://help.autodesk.com/view/fusion360/ENU/?guid=TPD-SUPPORTED-FILE-FORMATS); not a standalone model and no dependable complete open-source reader identified |
| `.fbrd` | Fusion Electronics board | Autodesk Fusion Electronics | No | Closed | [Official Autodesk format list](https://help.autodesk.com/view/fusion360/ENU/?guid=TPD-SUPPORTED-FILE-FORMATS); no dependable complete open-source reader identified |
| `.fem` | Simcenter 3D finite-element model | Siemens NX CAE / Simcenter 3D | No | Closed | No dependable complete open-source reader identified; solver decks referenced by a FEM may use separate documented formats |
| `.flbr` | Fusion Electronics library | Autodesk Fusion Electronics | No | Closed | [Official Autodesk format list](https://help.autodesk.com/view/fusion360/ENU/?guid=TPD-SUPPORTED-FILE-FORMATS); not a standalone model and no dependable complete open-source reader identified |
| `.fprj` | Fusion Electronics project | Autodesk Fusion Electronics | No | Closed | [Official Autodesk Electronics documentation](https://help.autodesk.com/cloudhelp/ENU/Fusion-ECAD/files/ECD-KICAD-IMPORTER.htm); not a standalone model and no dependable complete open-source reader identified |
| `.frm` | Creo drawing format | PTC Creo Parametric | No | Closed | [Official PTC Creo View file list](https://support.ptc.com/help/creo/view/r12.0/en/creo_view/visualization/shared/Opening_Pro_ENGINEER_Files_in_ProductView.html); not a standalone 3D model and no dependable complete open-source reader identified |
| `.fsch` | Fusion Electronics schematic | Autodesk Fusion Electronics | No | Closed | [Official Autodesk format list](https://help.autodesk.com/view/fusion360/ENU/?guid=TPD-SUPPORTED-FILE-FORMATS); not a standalone model and no dependable complete open-source reader identified |
| `.gph` | Creo user-defined feature | PTC Creo Parametric | No | Closed | [Official PTC file-type documentation](https://support.ptc.com/help/creo/creo_pma/r12/usascii/fundamentals/fundamentals/About_File_Types.html); no dependable complete open-source reader identified |
| `.jt` | JT Open | Siemens NX, Solid Edge, Teamcenter, Onshape and the wider JT ecosystem | No | Open | Siemens publishes the format and it is ISO 14306; no mature general-purpose open-source reader suitable for this browser viewer was identified |
| `.las`, `.laz` | LAS / compressed LAZ point cloud | LiDAR and surveying tools | No | Open | [PDAL](https://github.com/PDAL/PDAL), [LASzip](https://github.com/LASzip/LASzip) or browser-oriented [laz-perf](https://github.com/hobuinc/laz-perf) |
| `.lay` | Creo layout | PTC Creo Parametric | No | Closed | [Official PTC Creo View file list](https://support.ptc.com/help/creo/view/r12.0/en/creo_view/visualization/shared/Opening_Pro_ENGINEER_Files_in_ProductView.html); not a standalone 3D model and no dependable complete open-source reader identified |
| `.lwo`, `.lws` | LightWave object / scene | NewTek LightWave 3D | No | Closed | [Assimp](https://github.com/assimp/assimp/blob/master/doc/Fileformats.md) importers |
| `.ma` | Maya ASCII scene | Autodesk Maya | No | Closed | Textual and partly inspectable, but no dependable complete open-source reader identified |
| `.mb` | Maya binary scene | Autodesk Maya | No | Closed | No dependable complete open-source reader identified |
| `.max` | 3ds Max scene | Autodesk 3ds Max | No | Closed | No dependable complete open-source reader; `.max` is distinct from the supported `.3ds` interchange format |
| `.md3` | Quake III model | id Software game tooling | No | Open | [Assimp](https://github.com/assimp/assimp/blob/master/doc/Fileformats.md); current Three.js provides an MD2 loader but no MD3 loader |
| `.mfg` | Creo manufacturing model/process | PTC Creo Parametric Manufacturing | No | Closed | [Official PTC manufacturing naming conventions](https://support.ptc.com/help/creo/creo_pma/r12/usascii/manufacturing/nc/about_naming_conventions.html); no dependable complete open-source reader identified |
| `.neu` | Creo Neutral interchange | PTC Creo / Pro/ENGINEER | No | Closed | Public usage information exists, but no dependable complete open-source reader identified |
| `.nwc`, `.nwd` | Navisworks cache / document | Autodesk Navisworks | No | Closed | No dependable complete open-source reader identified |
| `.ol` | Creo View model data | PTC Creo View | No | Closed | [Official PTC Creo View file list](https://support.ptc.com/help/creo/view/r12.0/en/creo_view/visualization/shared/Opening_Pro_ENGINEER_Files_in_ProductView.html); no dependable complete open-source reader identified |
| `.par` | Solid Edge part | Siemens Solid Edge | No | Closed | [Official Siemens Solid Edge format reference](https://blogs.sw.siemens.com/solidedge/deep-dive-into-2d-nesting/); no dependable complete open-source reader identified |
| `.pmd`, `.pmx` | MikuMikuDance model | MikuMikuDance | No | Open | Three.js removed its MMD modules after r172; the code moved to the external [three-mmd-loader](https://github.com/takahirox/three-mmd-loader) project, and [Assimp](https://github.com/assimp/assimp) supports PMX |
| `.plmxml` | PLM XML product structure | Siemens NX, Teamcenter and Process Simulate | No | Open | Siemens publishes the [PLM XML schemas and documentation](https://media.plm.automation.siemens.com/open/plm-xml/); referenced geometry such as JT must be loaded separately |
| `.prc` | Product Representation Compact | 3D PDF ecosystem | No | Open | ISO-standardized; no mature browser-ready open-source reader identified |
| `.u3d` | Universal 3D | 3D PDF ecosystem | No | Open | ECMA-standardized; open-source tooling exists but is old and would require a separate suitability review |
| `.urdf` | Unified Robot Description Format | ROS robotics ecosystem; also an Onshape assembly export | No | Open | [urdfdom](https://github.com/ros/urdfdom) and browser-oriented [urdf-loaders](https://github.com/gkjohnson/urdf-loaders) |
| `.prt` | NX part or assembly; also an unrelated Creo part format | Siemens NX / NX MCD or PTC Creo, depending on file origin | No | Closed | NX stores both models and assemblies as `.prt`; no complete independent open-source NX or Creo reader identified. The extension alone cannot distinguish NX from Creo |
| `.psm` | Solid Edge sheet-metal part | Siemens Solid Edge | No | Closed | [Official Siemens Solid Edge format reference](https://blogs.sw.siemens.com/solidedge/deep-dive-into-2d-nesting/); no dependable complete open-source reader identified |
| `.pvz` | Creo View packaged visualization | PTC Creo View; also an Onshape export format | No | Closed | A package may contain PVS structure and OL model data; no dependable complete open-source geometry reader identified |
| `.pvs` | Creo View product structure | PTC Creo View | No | Closed | [Official PTC Creo View file list](https://support.ptc.com/help/creo/view/r12.0/en/creo_view/visualization/shared/Opening_Pro_ENGINEER_Files_in_ProductView.html); normally references separate OL model data and has no dependable complete open-source reader |
| `.pwd` | Solid Edge weldment document | Siemens Solid Edge legacy workflows | No | Closed | [Official Solid Edge API information](https://support.industrysoftware.automation.siemens.com/trainings/se/106/api/SolidEdgeFramework~Application~GetSaveAsFileName.html); no dependable complete open-source reader identified |
| `.rfa`, `.rvt` | Revit family / project | Autodesk Revit | No | Closed | Open-source connectors exist but normally require Revit; no independent complete reader identified |
| `.sat`, `.sab` | ACIS text / binary model | Spatial ACIS, Onshape and compatible CAD tools | No | Closed | Partial public information exists; no dependable complete open-source reader identified |
| `.sec` | Creo Sketcher section | PTC Creo Parametric | No | Closed | [Official PTC file-type documentation](https://support.ptc.com/help/creo/creo_pma/r12/usascii/fundamentals/fundamentals/About_File_Types.html); not a standalone 3D model and no dependable complete open-source reader identified |
| `.skp` | SketchUp model | Trimble SketchUp | No | Closed | A proprietary SDK is available, but no dependable complete open-source reader was identified |
| `.sim` | Simcenter 3D simulation definition | Siemens NX CAE / Simcenter 3D | No | Closed | No dependable complete open-source reader identified; normally references an NX/Simcenter FEM model |
| `.simarc` | SIMIT project archive | Siemens SIMIT with SIMATIC / NX MCD virtual commissioning | No | Closed | Not a standalone 3D model; no dependable complete open-source reader identified |
| `.x`, `.xof` | DirectX model | Microsoft DirectX legacy tooling | No | Open | [Assimp](https://github.com/assimp/assimp/blob/master/doc/Fileformats.md) importer |
| `.x3d`, `.x3db`, `.x3dv` | Extensible 3D | Web3D Consortium ecosystem | No | Open | [Assimp](https://github.com/assimp/assimp) and browser-oriented [X3DOM](https://github.com/x3dom/x3dom) |
| `.xas`, `.xpr` | Creo Family Table assembly / part accelerator | PTC Creo Parametric | No | Closed | [Official PTC Creo View file list](https://support.ptc.com/help/creo/view/r12.0/en/creo_view/visualization/shared/Opening_Pro_ENGINEER_Files_in_ProductView.html); dependent on Creo family data and no dependable complete open-source reader identified |
| `.x_b`, `.x_t` | Parasolid binary / text model | Siemens NX, Solid Edge, Onshape, Parasolid and compatible CAD tools | No | Closed | Siemens publishes format information and provides commercial tooling, but no dependable complete open-source reader was identified |

## Companion resource files

These files may be selected alongside a supported model when it references external resources. They are accepted as dependencies, but they cannot be opened as standalone models.

| Extension | Resource type |
| --- | --- |
| `.bin` | Binary glTF buffer |
| `.dat` | LDraw part or primitive referenced by an `.ldr` model |
| `.mtl` | Wavefront OBJ material library |
| `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.bmp`, `.gif`, `.tga`, `.dds` | Texture image |

The source of truth for accepted extensions is [`src/formats/index.ts`](./src/formats/index.ts).
