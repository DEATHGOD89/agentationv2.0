import type { FrameworkScanner, FrameworkInfo } from "./types";
import { getReactComponentName } from "../utils/react-detection";
import { isReactPage } from "../utils/react-detection";

export const reactScanner: FrameworkScanner = {
  id: "react",
  priority: 100,

  isPresent(): boolean {
    try {
      return isReactPage();
    } catch {
      return false;
    }
  },

  scan(element: HTMLElement): FrameworkInfo | null {
    try {
      const result = getReactComponentName(element, { mode: "filtered" });
      if (result.path && result.components.length > 0) {
        return {
          framework: "react",
          components: result.components,
          path: result.path,
          confidence: 1,
        };
      }
      return null;
    } catch {
      return null;
    }
  },
};
