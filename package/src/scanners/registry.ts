import type { FrameworkScanner, FrameworkInfo } from "./types";

const scanners: Map<string, FrameworkScanner> = new Map();
let presentCache: Map<string, boolean> = new Map();

export function registerScanner(scanner: FrameworkScanner): void {
  scanners.set(scanner.id, scanner);
}

export function unregisterScanner(framework: string): void {
  scanners.delete(framework);
}

export function clearCache(): void {
  presentCache = new Map();
}

export function getPresentFrameworks(): FrameworkScanner[] {
  const result: FrameworkScanner[] = [];
  for (const scanner of scanners.values()) {
    if (scanner.isPresent()) {
      result.push(scanner);
    }
  }
  return result;
}

export function scanElement(element: HTMLElement): FrameworkInfo | null {
  const sorted = [...scanners.values()].sort((a, b) => b.priority - a.priority);

  for (const scanner of sorted) {
    try {
      const result = scanner.scan(element);
      if (result) return result;
    } catch {
      continue;
    }
  }

  return null;
}

export function getScanner(framework: string): FrameworkScanner | undefined {
  return scanners.get(framework);
}

export function listScanners(): FrameworkScanner[] {
  return [...scanners.values()];
}
