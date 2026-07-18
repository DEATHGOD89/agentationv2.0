# Agentation Extension

Chrome browser extension that injects the Agentation toolbar into any website.

## Prerequisites

1. Build the `agentation` package first: `cd package && pnpm build`
2. Add `'extension'` to `pnpm-workspace.yaml` in the monorepo root

## Build

```bash
cd extension
pnpm install
pnpm build
```

## Load in Chrome

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` directory

## Architecture

```
toolbar-entry.tsx  ⟷  window.postMessage  ⟷  content-script.ts  ⟷  chrome.runtime  ⟷  background.ts
  (main world)                             (isolated world)                       (service worker)
```

- `toolbar-entry.tsx` — bundles into `toolbar-bundle.js`, runs in page context via web-accessible script injection. Mounts the `Agentation` React component inside a shadow DOM container.
- `content-script.ts` — runs in isolated world, creates shadow DOM host, injects toolbar-bundle script, relays messages.
- `background.ts` — service worker, manages extension state and MCP server health checks.
- `popup.tsx` — popup UI for enable/disable toggle and server status.

## Build Output

| Entry | Output | Format |
|-------|--------|--------|
| `src/content-script.ts` | `dist/content-script.js` | IIFE |
| `src/background.ts` | `dist/background.js` | IIFE (loaded as module in manifest) |
| `src/popup.tsx` | `dist/popup.js` | IIFE |
| `src/toolbar-entry.tsx` | `dist/toolbar-bundle.js` | IIFE (web-accessible) |
