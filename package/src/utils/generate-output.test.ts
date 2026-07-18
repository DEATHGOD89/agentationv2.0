import { describe, it, expect } from "vitest";
import { generateOutput } from "./generate-output";
import type { Annotation } from "../types";

describe("generateOutput", () => {
  const dummyAnnotations: Annotation[] = [
    {
      id: "1",
      x: 10,
      y: 20,
      comment: "Fix this button",
      element: "button",
      elementPath: "body > div > button",
      timestamp: Date.now(),
      selectedText: "Click Me",
      sourceFile: "src/Button.tsx",
    },
    {
      id: "2",
      x: 50,
      y: 50,
      comment: "Change color",
      element: "div.header",
      elementPath: "body > div.header",
      timestamp: Date.now(),
      context: {
        console: [{ level: "error", message: "Failed to load resource" }],
        network: [{ method: "GET", url: "/api/data", status: 500, duration: 100 }],
      },
    }
  ];

  it("returns empty string when no annotations", () => {
    expect(generateOutput([], "/")).toBe("");
  });

  it("formats correctly in compact mode", () => {
    const output = generateOutput(dummyAnnotations, "/home", "compact");
    expect(output).toContain("1. **button** (src/Button.tsx): Fix this button (re: \"Click Me\")");
    expect(output).toContain("2. **div.header**: Change color");
  });

  it("formats correctly in standard mode", () => {
    const output = generateOutput(dummyAnnotations, "/home", "standard");
    expect(output).toContain("### 1. button");
    expect(output).toContain("**Source:** src/Button.tsx");
    expect(output).toContain("**Selected text:** \"Click Me\"");
    
    // Check context collection
    expect(output).toContain("**Console Errors:** `Failed to load resource`");
    expect(output).toContain("**Network Errors:** `GET /api/data → 500`");
  });

  it("formats correctly in detailed mode", () => {
    const output = generateOutput(dummyAnnotations, "/home", "detailed");
    expect(output).toContain("### 1. button");
    expect(output).toContain("**Feedback:** Fix this button");
  });

  it("formats correctly in forensic mode", () => {
    const output = generateOutput(dummyAnnotations, "/home", "forensic");
    expect(output).toContain("**Environment:**");
    expect(output).toContain("### 1. button");
    expect(output).toContain("**Annotation at:** 10.0% from left, 20px from top");
    expect(output).toContain("**Console Errors:**");
    expect(output).toContain("`Failed to load resource`");
  });
});
