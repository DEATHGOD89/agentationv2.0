import * as fs from "fs";
import * as path from "path";
import type { ProjectScanResult } from "./types.js";
import { detectLanguages } from "./language-detector.js";
import { detectFramework } from "./framework-detector.js";
import { scanStructure } from "./structure-scanner.js";
import { detectMonorepo } from "./monorepo-detector.js";
import { scanCode } from "./code-scanner.js";
import { generateMarkdown, generateJson } from "./output-generator.js";

export type { ProjectScanResult, FileTreeNode } from "./types.js";

async function getPackageJson(
  projectPath: string
): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.promises.readFile(
      path.join(projectPath, "package.json"),
      "utf-8"
    );
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function findReadme(projectPath: string): Promise<string | undefined> {
  const candidates = [
    "README.md",
    "README.txt",
    "README",
    "Readme.md",
    "readme.md",
  ];
  for (const name of candidates) {
    try {
      await fs.promises.access(path.join(projectPath, name));
      return name;
    } catch {
      // not found
    }
  }
  return undefined;
}

async function detectLicense(projectPath: string): Promise<string | undefined> {
  const candidates = [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "LICENSE-MIT",
    "LICENSE-APACHE",
    "LICENSE-MIT.txt",
    "License",
  ];
  for (const name of candidates) {
    try {
      const content = await fs.promises.readFile(
        path.join(projectPath, name),
        "utf-8"
      );
      // Try to detect license type from first line
      const firstLine = content.split("\n")[0].trim();
      if (
        firstLine.includes("MIT") ||
        firstLine.includes("MIT License")
      )
        return "MIT";
      if (firstLine.includes("Apache")) return "Apache-2.0";
      if (firstLine.includes("GPL") || firstLine.includes("General Public License"))
        return "GPL";
      if (firstLine.includes("BSD")) return "BSD";
      if (firstLine.includes("ISC")) return "ISC";
      if (firstLine.includes("MPL") || firstLine.includes("Mozilla"))
        return "MPL-2.0";
      if (firstLine.includes("PolyForm") || firstLine.includes("Polyform"))
        return "PolyForm";
      if (firstLine.includes("UNLICENSED") || firstLine.includes("UNLICENSE"))
        return "Unlicense";
      return "Custom";
    } catch {
      // not found
    }
  }
  return undefined;
}

async function readFileContent(
  filePath: string
): Promise<string | undefined> {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

interface LanguageFile {
  filePath: string;
  content?: string;
}

async function collectLanguageFiles(
  projectPath: string
): Promise<LanguageFile[]> {
  const files: LanguageFile[] = [];
  const maxFiles = 500;

  async function walk(dir: string, depth: number) {
    if (depth > 5 || files.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      const d = await fs.promises.opendir(dir);
      entries = [];
      for await (const e of d) entries.push(e);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build" || entry.name === ".git" || entry.name === "target" || entry.name === "__pycache__" || entry.name === "vendor") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const langExts = new Set([
          ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
          ".py", ".go", ".rs", ".java", ".kt", ".kts", ".swift", ".cs",
          ".cpp", ".cxx", ".cc", ".c", ".h", ".hpp", ".rb", ".php",
          ".sh", ".bash", ".zsh", ".ps1", ".dart", ".lua", ".scala",
          ".ex", ".exs", ".erl", ".hs", ".r", ".sql", ".pl",
          ".vue", ".svelte", ".astro", ".zig",
          ".json", ".yaml", ".yml", ".toml", ".md", ".css", ".scss",
          ".html", ".xml", ".graphql", ".proto",
        ]);
        if (langExts.has(ext) || entry.name.toLowerCase() === "dockerfile") {
          const content = await readFileContent(fullPath);
          files.push({ filePath: fullPath, content });
        }
      }
    }
  }

  await walk(projectPath, 0);
  return files;
}

export async function scanProject(
  projectPath: string
): Promise<ProjectScanResult> {
  const resolvedPath = path.resolve(projectPath);
  const name = path.basename(resolvedPath);

  const [structure, monoResult, pkgJson, readme, license] = await Promise.all([
    scanStructure(resolvedPath),
    detectMonorepo(resolvedPath),
    getPackageJson(resolvedPath),
    findReadme(resolvedPath),
    detectLicense(resolvedPath),
  ]);

  // Collect files for language detection
  const langFiles = await collectLanguageFiles(resolvedPath);
  const languages = detectLanguages(
    langFiles.map((f) => ({ filePath: f.filePath, content: f.content }))
  );

  // Detect framework
  const configFileContents: Record<string, string | undefined> = {};
  for (const cf of structure.configFiles) {
    const cfPath = path.join(resolvedPath, cf);
    const content = await readFileContent(cfPath);
    configFileContents[cf] = content;
  }

  // Also read go.mod, Cargo.toml, Gemfile, etc.
  const extraFiles = [
    "go.mod",
    "go.sum",
    "Cargo.toml",
    "Gemfile",
    "Gemfile.lock",
    "pyproject.toml",
    "Pipfile",
    "composer.json",
    "build.gradle",
    "build.gradle.kts",
    "pom.xml",
  ];
  for (const ef of extraFiles) {
    if (!(ef in configFileContents)) {
      const efPath = path.join(resolvedPath, ef);
      const content = await readFileContent(efPath);
      if (content !== undefined) configFileContents[ef] = content;
    }
  }

  const frameworkResult = detectFramework(configFileContents);

  // Detect Docker
  let docker = false;
  try {
    await fs.promises.access(path.join(resolvedPath, "Dockerfile"));
    docker = true;
  } catch {
    try {
      const entries = await fs.promises.readdir(resolvedPath);
      if (entries.some((e) => e.startsWith("docker-compose"))) docker = true;
    } catch {
      // no docker
    }
  }

  // Scan code for entry points, routes, exports, CI
  const codeResult = await scanCode(resolvedPath);

  // Combine entry points from structure and code scan
  const allEntryPoints = [
    ...new Set([...structure.entryPoints, ...codeResult.entryPoints]),
  ];

  // Determine primary language
  const primaryLanguage =
    languages.length > 0 ? languages[0].language : undefined;

  // Dependencies from package.json
  let dependencies: Record<string, string> | undefined;
  let devDependencies: Record<string, string> | undefined;
  let scripts: Record<string, string> | undefined;

  if (pkgJson) {
    dependencies = (pkgJson.dependencies as Record<string, string>) || undefined;
    devDependencies =
      (pkgJson.devDependencies as Record<string, string>) || undefined;
    scripts = (pkgJson.scripts as Record<string, string>) || undefined;
  }

  // Check if scripts are empty
  if (scripts && Object.keys(scripts).length === 0) scripts = undefined;

  const result: ProjectScanResult = {
    path: resolvedPath,
    name,
    language: primaryLanguage,
    framework: frameworkResult.framework,
    isMonorepo: monoResult.isMonorepo,
    packages: monoResult.packages.length > 0 ? monoResult.packages : undefined,
    entryPoints: allEntryPoints.length > 0 ? allEntryPoints : undefined,
    configFiles: structure.configFiles.length > 0 ? structure.configFiles : undefined,
    fileCount: structure.fileCount,
    languages: languages.length > 0 ? languages : undefined,
    dependencies,
    devDependencies,
    scripts,
    structure: structure.tree.length > 0 ? structure.tree : undefined,
    envFiles: structure.envFiles.length > 0 ? structure.envFiles : undefined,
    docker,
    ci: codeResult.ci.length > 0 ? codeResult.ci : undefined,
    readme: readme || undefined,
    license: license || undefined,
  };

  return result;
}

export { generateMarkdown, generateJson } from "./output-generator.js";
