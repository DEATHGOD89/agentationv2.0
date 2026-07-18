import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/content-script.ts"],
    format: ["iife"],
    outDir: "dist",
    outExtension: () => ({ js: ".js" }),
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: true,
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
  {
    entry: ["src/background.ts"],
    format: ["iife"],
    outDir: "dist",
    outExtension: () => ({ js: ".js" }),
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: true,
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
  {
    entry: ["src/popup.tsx"],
    format: ["iife"],
    outDir: "dist",
    outExtension: () => ({ js: ".js" }),
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: true,
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
  {
    entry: { "toolbar-bundle": "src/toolbar-entry.tsx" },
    format: ["iife"],
    outDir: "dist",
    outExtension: () => ({ js: ".js" }),
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: true,
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
]);
