import * as fs from "fs";
import * as path from "path";

type ScanConfig = {
  maxFiles: number;
  maxSizeBytes: number;
};

const DEFAULT_CONFIG: ScanConfig = {
  maxFiles: 100,
  maxSizeBytes: 1024 * 100,
};

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
];

const ROUTE_PATTERNS = [
  /router\.(get|post|put|delete|patch|all)\(['"`]\/([^'"`]+)['"`]/g,
  /Route::(get|post|put|delete|patch|any)\(['"`]\/([^'"`]+)['"`]/g,
  /@(Get|Post|Put|Delete|Patch)\(['"`]\/([^'"`]+)['"`]/g,
  /app\.(get|post|put|delete|patch)\(['"`]\/([^'"`]+)['"`]/g,
  /\.route\(['"`]\/([^'"`]+)['"`]/g,
  /routes\s*[=:]\s*\[/g,
  /def\s+\w+\(.*request.*\)/g,
];

const DATABASE_PATTERNS = [
  /(?:prisma|typeorm|drizzle|sequelize|mongoose|knex|sqlalchemy|gorm|entity|database|db)\s*[:=]/gi,
  /(?:createPool|createConnection|connect|pg\.Pool|mysql|sqlite3|better-sqlite3)/g,
  /(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\s/gi,
  /DATABASE_URL|DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD/g,
  /"dependencies"\s*:\s*\{[^}]*"(?:pg|mysql|sqlite3|mongodb|redis|prisma|typeorm|drizzle-orm|sequelize|mongoose)"/g,
];

const EXPORT_PATTERNS = [
  /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
  /module\.exports\s*=\s*\{/g,
  /exports\.(\w+)\s*=/g,
  /pub\s+(?:fn|struct|enum|trait|mod|type|const|use)\s+(\w+)/g,
  /def\s+(\w+)/g,
  /func\s+(\w+)/g,
  /public\s+(?:class|interface|enum|abstract\s+class|static\s+class)\s+(\w+)/g,
];

const CI_FILE_PATTERNS = [
  ".github/workflows",
  ".gitlab-ci.yml",
  ".circleci/config.yml",
  "Jenkinsfile",
  "bitbucket-pipelines.yml",
  ".drone.yml",
  "azure-pipelines.yml",
  ".travis.yml",
  "appveyor.yml",
];

function detectRoutes(content: string): string[] {
  const routes: string[] = [];
  for (const pattern of ROUTE_PATTERNS) {
    const regex =
      pattern instanceof RegExp
        ? new RegExp(pattern.source, "g" + (pattern.flags.includes("i") ? "" : ""))
        : pattern;
    const matches = content.matchAll(regex);
    for (const m of matches) {
      const route = m[2] || m[1] || m[0];
      if (route && route.length < 200) {
        routes.push(route.trim());
      }
    }
  }
  return [...new Set(routes)];
}

function detectDatabaseReferences(content: string): string[] {
  const refs: string[] = [];
  for (const pattern of DATABASE_PATTERNS) {
    const matches = content.matchAll(
      typeof pattern === "string"
        ? new RegExp(pattern, "gi")
        : new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g")
    );
    for (const m of matches) {
      refs.push(m[0].substring(0, 80));
    }
  }
  return [...new Set(refs)];
}

function detectExports(content: string, ext: string): string[] {
  const exports: string[] = [];
  for (const pattern of EXPORT_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const m of matches) {
      const name = m[1] || m[0];
      if (name && name.length < 100) {
        exports.push(name.trim());
      }
    }
  }
  return [...new Set(exports)];
}

async function walkCodeFiles(
  dirPath: string,
  relPath: string,
  ignorePatterns: string[],
  config: ScanConfig,
  files: { filePath: string; relPath: string; content?: string }[]
): Promise<void> {
  if (files.length >= config.maxFiles) return;

  let entries: fs.Dirent[];
  try {
    const dir = await fs.promises.opendir(dirPath);
    entries = [];
    for await (const entry of dir) {
      entries.push(entry);
    }
  } catch {
    return;
  }

  for (const entry of entries) {
    if (files.length >= config.maxFiles) break;
    const name = entry.name;
    const entryRelPath = relPath ? `${relPath}/${name}` : name;

    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build" || entry.name === ".git" || entry.name === "target" || entry.name === "__pycache__") {
        continue;
      }
      await walkCodeFiles(path.join(dirPath, name), entryRelPath, ignorePatterns, config, files);
    } else if (entry.isFile()) {
      const ext = path.extname(name).toLowerCase();
      const codeExts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".cs", ".cpp", ".c", ".rb", ".php", ".vue", ".svelte", ".astro", ".ex", ".exs", ".scala", ".dart", ".lua"];
      if (!codeExts.includes(ext)) continue;

      const fullPath = path.join(dirPath, name);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > config.maxSizeBytes) continue;

        const content = await fs.promises.readFile(fullPath, "utf-8");
        files.push({ filePath: fullPath, relPath: entryRelPath, content });
      } catch {
        // Skip unreadable files
      }
    }
  }
}

export async function scanCode(
  projectPath: string,
  ignorePatterns: string[] = []
): Promise<{
  entryPoints: string[];
  routes: string[];
  databaseRefs: string[];
  exports: Record<string, string[]>;
  ci: string[];
}> {
  const resolved = path.resolve(projectPath);

  // Scan for CI files
  const ci: string[] = [];
  for (const ciPattern of CI_FILE_PATTERNS) {
    const ciPath = path.join(resolved, ciPattern.replace(/\//g, path.sep));
    try {
      await fs.promises.access(ciPath);
      ci.push(ciPattern);
    } catch {
      // Check parent directories for CI
      const parentPath = path.join(resolved, "..", ciPattern.replace(/\//g, path.sep));
      try {
        await fs.promises.access(parentPath);
        ci.push(`../${ciPattern}`);
      } catch {
        // Not found
      }
    }
  }

  // Walk files and scan code
  const codeFiles: { filePath: string; relPath: string; content?: string }[] = [];
  await walkCodeFiles(resolved, "", ignorePatterns, DEFAULT_CONFIG, codeFiles);

  const entryPoints: string[] = [];
  const routes: string[] = [];
  const databaseRefs: string[] = [];
  const exports: Record<string, string[]> = {};

  for (const file of codeFiles) {
    if (!file.content) continue;

    // Detect entry points from path
    const baseName = path.basename(file.filePath);
    if (ENTRY_POINT_PATTERNS.includes(baseName)) {
      entryPoints.push(file.relPath);
    }

    // Detect routes
    const fileRoutes = detectRoutes(file.content);
    routes.push(...fileRoutes);

    // Detect database references
    const dbRefs = detectDatabaseReferences(file.content);
    databaseRefs.push(...dbRefs);

    // Detect exports
    const ext = path.extname(file.filePath).toLowerCase();
    const fileExports = detectExports(file.content, ext);
    if (fileExports.length > 0) {
      exports[file.relPath] = fileExports;
    }
  }

  return {
    entryPoints: [...new Set(entryPoints)],
    routes: [...new Set(routes)],
    databaseRefs: [...new Set(databaseRefs)],
    exports,
    ci: [...new Set(ci)],
  };
}
