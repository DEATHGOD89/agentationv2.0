import * as fs from "fs";
import * as path from "path";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

function parseWorkspaceGlobs(
  content: string | undefined,
  field: string
): string[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    const workspaces = parsed[field];
    if (Array.isArray(workspaces)) return workspaces;
    if (typeof workspaces === "object" && workspaces !== null) {
      const pkgs = workspaces.packages;
      if (Array.isArray(pkgs)) return pkgs;
    }
  } catch {
    // Not JSON
  }
  return [];
}

function extractYamlWorkspaces(content: string): string[] {
  const lines = content.split("\n");
  const inPackages = lines.some(
    (l) => l.trim() === "packages:" || l.trim().startsWith("packages:")
  );
  if (!inPackages) return [];

  const workspaces: string[] = [];
  let found = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      found = true;
      continue;
    }
    if (found && trimmed.startsWith("- ")) {
      workspaces.push(trimmed.slice(2).trim());
    } else if (found && trimmed !== "" && !trimmed.startsWith("#")) {
      break;
    }
  }
  return workspaces;
}

async function expandGlob(
  basePath: string,
  globPattern: string
): Promise<string[]> {
  const parts = globPattern.split("/");
  const starIndex = parts.findIndex((p) => p.includes("*"));
  if (starIndex === -1) {
    const pkgPath = path.join(basePath, globPattern, "package.json");
    if (await fileExists(pkgPath)) {
      return [path.join(basePath, globPattern)];
    }
    return [];
  }

  const prefix = path.join(basePath, ...parts.slice(0, starIndex));
  const suffix = parts.slice(starIndex + 1).join("/");

  try {
    const entries = await fs.promises.readdir(prefix, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pattern = parts[starIndex];
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      if (!regex.test(entry.name)) continue;

      if (suffix) {
        const subResults = await expandGlob(
          path.join(prefix, entry.name),
          suffix
        );
        results.push(...subResults);
      } else {
        const pkgPath = path.join(prefix, entry.name, "package.json");
        if (await fileExists(pkgPath)) {
          results.push(path.join(prefix, entry.name));
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function detectMonorepo(
  projectPath: string
): Promise<{
  isMonorepo: boolean;
  packages: string[];
  type?: string;
}> {
  const resolved = path.resolve(projectPath);
  const checks: Array<{
    file: string;
    type: string;
    extract: (content: string) => string[];
  }> = [
    {
      file: "pnpm-workspace.yaml",
      type: "pnpm",
      extract: (content) => extractYamlWorkspaces(content),
    },
    {
      file: "lerna.json",
      type: "lerna",
      extract: (content) => parseWorkspaceGlobs(content, "packages"),
    },
    {
      file: "nx.json",
      type: "nx",
      extract: () => [],
    },
    {
      file: "turbo.json",
      type: "turbo",
      extract: () => [],
    },
  ];

  let allWorkspaceGlobs: string[] = [];
  let detectedType: string | undefined;

  for (const check of checks) {
    const checkPath = path.join(resolved, check.file);
    if (await fileExists(checkPath)) {
      const content = await readFile(checkPath);
      if (content) {
        const globs = check.extract(content);
        allWorkspaceGlobs.push(...globs);
      }
      detectedType = check.type;
    }
  }

  // Check package.json workspaces
  const pkgContent = await readFile(path.join(resolved, "package.json"));
  if (pkgContent) {
    const ws = parseWorkspaceGlobs(pkgContent, "workspaces");
    allWorkspaceGlobs.push(...ws);
    if (ws.length > 0 && !detectedType) {
      detectedType = "npm/yarn";
    }
  }

  // Expand workspace globs to find actual packages
  let packages: string[] = [];
  if (allWorkspaceGlobs.length > 0) {
    const expanded = await Promise.all(
      allWorkspaceGlobs.map((g) => expandGlob(resolved, g))
    );
    packages = [...new Set(expanded.flat())];
  }

  return {
    isMonorepo: allWorkspaceGlobs.length > 0,
    packages: packages.map((p) => path.relative(resolved, p).replace(/\\/g, "/")),
    type: detectedType,
  };
}
