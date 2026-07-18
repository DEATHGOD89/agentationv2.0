import { registerScanner } from "./registry";
import { reactScanner } from "./react-scanner";
import { vueScanner } from "./vue-scanner";
import { svelteScanner } from "./svelte-scanner";
import { angularScanner } from "./angular-scanner";
import { solidScanner } from "./solid-scanner";

export function initScanners(): void {
  registerScanner(reactScanner);
  registerScanner(vueScanner);
  registerScanner(svelteScanner);
  registerScanner(angularScanner);
  registerScanner(solidScanner);
}

export {
  registerScanner,
  unregisterScanner,
  clearCache,
  getPresentFrameworks,
  scanElement,
  getScanner,
  listScanners,
} from "./registry";

export type { FrameworkScanner, FrameworkInfo, FrameworkType } from "./types";

export { reactScanner } from "./react-scanner";
export { vueScanner } from "./vue-scanner";
export { svelteScanner } from "./svelte-scanner";
export { angularScanner } from "./angular-scanner";
export { solidScanner } from "./solid-scanner";
