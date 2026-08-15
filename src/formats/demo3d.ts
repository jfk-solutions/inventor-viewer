type Demo3DModules = {
  parser: typeof import("@jfk-solutions/demo3d-file-format");
  adapter: typeof import("@jfk-solutions/demo3d-file-format/three");
};

let modulesPromise: Promise<Demo3DModules> | undefined;
const disposers = new WeakMap<object, () => void>();

function loadModules() {
  modulesPromise ??= Promise.all([
    import("@jfk-solutions/demo3d-file-format"),
    import("@jfk-solutions/demo3d-file-format/three"),
  ]).then(([parser, adapter]) => ({ parser, adapter }));
  return modulesPromise;
}

export async function loadDemo3DFile(file: File, three: any) {
  const { parser, adapter } = await loadModules();
  const bytes = await file.arrayBuffer();
  const isRaw3D = file.name.toLocaleLowerCase().endsWith(".raw3d");
  let group: any;
  if (isRaw3D) {
    const parsed = await parser.parseRaw3D(bytes);
    group = await adapter.createRaw3DThreeGroup(parsed, { three, showAnnotations: true });
  } else {
    const parsed = await parser.parseDemo3D(bytes);
    group = await adapter.createDemo3DThreeGroup(parsed, {
      three,
      renderProceduralBelts: true,
      renderProceduralRacks: true,
      renderProceduralSupportStands: true,
      renderProceduralConveyorSides: true,
      renderProceduralPhotoEyes: true,
      renderProceduralRollers: true,
      renderProceduralMotors: false,
      renderDimensions: true,
      showPlaceholders: false,
    });
  }

  disposers.set(group, () => adapter.disposeDemo3DThreeGroup(group));
  return group;
}

export function disposeDemo3DModel(model: object) {
  const dispose = disposers.get(model);
  if (!dispose) return false;
  disposers.delete(model);
  dispose();
  return true;
}
