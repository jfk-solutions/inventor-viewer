import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { PLYExporter } from "three/examples/jsm/exporters/PLYExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { AMFLoader } from "three/examples/jsm/loaders/AMFLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { TDSLoader } from "three/examples/jsm/loaders/TDSLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";
import { VOXLoader, buildMesh as buildVOXMesh } from "three/examples/jsm/loaders/VOXLoader.js";
import { VRMLLoader } from "three/examples/jsm/loaders/VRMLLoader.js";
import { VTKLoader } from "three/examples/jsm/loaders/VTKLoader.js";
import { XYZLoader } from "three/examples/jsm/loaders/XYZLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as Inventor from "../../inventor-file-format/dist/index.js";
import * as InventorThree from "../../inventor-file-format/dist/three/index.js";
import * as InventorStep from "../../inventor-file-format/dist/step/index.js";
import * as Acad from "../../../node-projects/acd-ts/dist/index.js";

let openCascadePromise;

function loadOpenCascade() {
  const moduleUrl = new URL("./opencascade/opencascade.full.js", import.meta.url);
  const wasmUrl = new URL("./opencascade/opencascade.full.wasm", import.meta.url);
  openCascadePromise ??= import(moduleUrl.href).then(({ default: initialize }) => new initialize({
    locateFile(path) {
      return path.endsWith(".wasm") ? wasmUrl.href : path;
    },
  }));
  return openCascadePromise;
}

export {
  THREE, OrbitControls,
  GLTFExporter, OBJExporter, PLYExporter, STLExporter, USDZExporter,
  AMFLoader, ColladaLoader, DDSLoader, FBXLoader, GLTFLoader, MTLLoader, OBJLoader,
  PCDLoader, PLYLoader, Rhino3dmLoader, STLLoader, TDSLoader, TGALoader, ThreeMFLoader, USDLoader,
  VOXLoader, buildVOXMesh, VRMLLoader, VTKLoader, XYZLoader, MeshoptDecoder,
  Inventor, InventorThree, InventorStep, Acad, loadOpenCascade,
};
