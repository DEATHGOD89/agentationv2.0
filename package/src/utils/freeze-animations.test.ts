import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initFreezePatches, freeze, unfreeze, originalSetTimeout, originalSetInterval, originalRequestAnimationFrame } from "./freeze-animations";

describe("Freeze Animations", () => {
  let origSetTimeout: any;

  beforeEach(() => {
    origSetTimeout = window.setTimeout;
    // reset installed state between tests
    (window as any).__agentation_freeze = undefined;
  });

  afterEach(() => {
    window.setTimeout = origSetTimeout;
  });

  it("safely installs patches without throwing", () => {
    expect(() => initFreezePatches()).not.toThrow();
    // Subsequent calls should do nothing (installed flag)
    expect(() => initFreezePatches()).not.toThrow();
  });

  it("exports original timing functions", () => {
    initFreezePatches();
    expect(typeof originalSetTimeout).toBe("function");
    expect(typeof originalSetInterval).toBe("function");
    expect(typeof originalRequestAnimationFrame).toBe("function");
  });

  it("freezing and unfreezing works", () => {
    initFreezePatches();
    expect(() => freeze()).not.toThrow();
    expect(() => unfreeze()).not.toThrow();
  });
});
