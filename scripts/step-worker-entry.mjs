// The unpublished library owns the Worker protocol. Keeping this tiny entry in
// the viewer lets the vendor build emit one self-contained minified asset.
import { installStepWorker } from "../../step-file-format/dist/worker.js";

installStepWorker(globalThis);
