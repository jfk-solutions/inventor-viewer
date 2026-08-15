export type CadRuntime = {
  THREE: any;
  OrbitControls: any;
  Inventor: any;
  InventorThree: any;
  Acad: any;
};

let runtimePromise: Promise<CadRuntime> | undefined;

export function loadCadRuntime(): Promise<CadRuntime> {
  runtimePromise ??= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}vendor/cad-viewer-runtime.min.js`) as Promise<CadRuntime>;
  return runtimePromise;
}
