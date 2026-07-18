import * as fs from "fs";
import * as path from "path";
import type { FileTreeNode } from "./types.js";

const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "target",
  "vendor",
  ".cache",
  "coverage",
  ".nyc_output",
  "logs",
  "*.log",
  ".env",
  ".env.*",
  "*.pyc",
  "__pycache__",
  ".DS_Store",
  "Thumbs.db",
  "*.swp",
  "*.swo",
  ".idea",
  ".vscode",
  "*.tsbuildinfo",
  ".pnpm-store",
  "jspm_packages",
  "bower_components",
];

const CONFIG_FILE_PATTERNS = [
  "package.json",
  "tsconfig.json",
  "tsconfig.*.json",
  ".eslintrc*",
  ".prettierrc*",
  "babel.config.*",
  "webpack.config.*",
  "vite.config.*",
  "rollup.config.*",
  "next.config.*",
  "nuxt.config.*",
  "tailwind.config.*",
  "postcss.config.*",
  "jest.config.*",
  "vitest.config.*",
  "playwright.config.*",
  "cypress.config.*",
  ".gitignore",
  ".dockerignore",
  "Dockerfile",
  "docker-compose.*",
  ".env*",
  "Makefile",
  "Cargo.toml",
  "go.mod",
  "go.sum",
  "Gemfile",
  "Gemfile.lock",
  "pyproject.toml",
  "Pipfile",
  "Pipfile.lock",
  "poetry.lock",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
  "composer.json",
  "composer.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  "package-lock.json",
  ".nvmrc",
  ".node-version",
  ".python-version",
  ".ruby-version",
  "Dockerfile.*",
  "*.example",
  "lerna.json",
  "nx.json",
  "turbo.json",
  "pnpm-workspace.yaml",
  "bun.lockb",
  "deno.json",
  "deno.jsonc",
  "biome.json",
  "rome.json",
];

async function readGitignore(root: string): Promise<string[]> {
  const gitignorePath = path.join(root, ".gitignore");
  try {
    const content = await fs.promises.readFile(gitignorePath, "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

function patternToRegex(pattern: string): RegExp {
  let parts = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "__GLOBSTAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__GLOBSTAR__/g, ".*")
    .replace(/\?/g, "[^/]");

  if (pattern.startsWith("/")) {
    return new RegExp(`^${parts.slice(1)}$`);
  }
  if (pattern.endsWith("/")) {
    return new RegExp(`(^|/)${parts.slice(0, -1)}(/|$)`);
  }
  return new RegExp(`(^|/)${parts}$`);
}

function isIgnored(
  relPath: string,
  patterns: string[],
  isDir: boolean
): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  for (const p of patterns) {
    const negate = p.startsWith("!");
    const pat = negate ? p.slice(1) : p;
    if (pat.endsWith("/") && !isDir) continue;

    try {
      const regex = patternToRegex(pat);
      if (regex.test(normalized) || regex.test(normalized + "/")) {
        return !negate;
      }
    } catch {
      if (normalized === pat || normalized.startsWith(pat + "/") || normalized === pat + "/") {
        return !negate;
      }
    }
  }
  return false;
}

const ENV_FILE_PATTERNS = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.staging",
  ".env.example",
];

function isConfigFile(name: string): boolean {
  for (const pattern of CONFIG_FILE_PATTERNS) {
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/\./g, "\\.")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".") +
        "$"
    );
    if (regex.test(name)) return true;
  }
  return false;
}

function isEnvFile(name: string): boolean {
  return ENV_FILE_PATTERNS.includes(name) || name.startsWith(".env.");
}

const ENTRY_POINT_PATTERNS = [
  "main.ts",
  "main.tsx",
  "main.js",
  "main.jsx",
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  "app.ts",
  "app.tsx",
  "app.js",
  "app.jsx",
  "App.tsx",
  "App.jsx",
  "cli.ts",
  "cli.js",
  "server.ts",
  "server.js",
  "main.py",
  "app.py",
  "index.py",
  "main.go",
  "main.rs",
  "main.c",
  "main.cpp",
  "main.java",
  "Program.cs",
  "main.kt",
  "main.swift",
  "lib.rs",
  "bin/main.rs",
  "cmd/main.go",
];

async function scanDirectory(
  dirPath: string,
  relPath: string,
  ignorePatterns: string[],
  depth: number
): Promise<{ nodes: FileTreeNode[]; fileCount: number; configFiles: string[]; entryPoints: string[]; envFiles: string[] }> {
  if (depth > 10) return { nodes: [], fileCount: 0, configFiles: [], entryPoints: [], envFiles: [] };

  const entries: fs.Dirent[] = [];
  try {
    const dir = await fs.promises.opendir(dirPath);
    for await (const entry of dir) {
      entries.push(entry);
    }
  } catch {
    return { nodes: [], fileCount: 0, configFiles: [], entryPoints: [], envFiles: [] };
  }

  const nodes: FileTreeNode[] = [];
  let fileCount = 0;
  let configFiles: string[] = [];
  let entryPoints: string[] = [];
  let envFiles: string[] = [];

  for (const entry of entries) {
    const name = entry.name;
    const entryRelPath = relPath ? `${relPath}/${name}` : name;

    if (isIgnored(entryRelPath, ignorePatterns, entry.isDirectory())) {
      continue;
    }

    const fullPath = path.join(dirPath, name);
    let stats: fs.Stats | undefined;
    try {
      stats = await fs.promises.stat(fullPath);
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      const sub = await scanDirectory(fullPath, entryRelPath, ignorePatterns, depth + 1);
      if (sub.nodes.length > 0 || sub.fileCount > 0) {
        nodes.push({
          name,
          path: fullPath,
          type: "directory",
          children: sub.nodes,
        });
        fileCount += sub.fileCount;
        configFiles = configFiles.concat(sub.configFiles);
        entryPoints = entryPoints.concat(sub.entryPoints);
        envFiles = envFiles.concat(sub.envFiles);
      }
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      nodes.push({
        name,
        path: fullPath,
        type: "file",
        size: stats?.size,
      });
      fileCount++;

      if (isConfigFile(name)) {
        configFiles.push(entryRelPath);
      }
      if (isEnvFile(name)) {
        envFiles.push(entryRelPath);
      }
      if (ENTRY_POINT_PATTERNS.includes(name)) {
        entryPoints.push(entryRelPath);
      }
    }
  }

  return { nodes, fileCount, configFiles, entryPoints, envFiles };
}

export async function scanStructure(
  projectPath: string
): Promise<{
  tree: FileTreeNode[];
  fileCount: number;
  configFiles: string[];
  entryPoints: string[];
  envFiles: string[];
}> {
  const resolvedPath = path.resolve(projectPath);
  const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...(await readGitignore(resolvedPath))];

  const result = await scanDirectory(resolvedPath, "", ignorePatterns, 0);

  return {
    tree: result.nodes,
    fileCount: result.fileCount,
    configFiles: result.configFiles,
    entryPoints: result.entryPoints,
    envFiles: result.envFiles,
  };
}
