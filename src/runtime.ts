import { CAD_RUNTIME_VERSION } from "./runtime-version";

export type CadRuntime = {
  THREE: any;
  OrbitControls: any;
  Inventor: any;
  InventorThree: any;
  Acad: any;
};

let runtimePromise: Promise<CadRuntime> | undefined;

export function loadCadRuntime(): Promise<CadRuntime> {
  const url = new URL(`${import.meta.env.BASE_URL}vendor/cad-viewer-runtime.min.js`, window.location.href);
  url.searchParams.set("v", CAD_RUNTIME_VERSION);
  runtimePromise ??= import(/* @vite-ignore */ url.href) as Promise<CadRuntime>;
  return runtimePromise;
}
