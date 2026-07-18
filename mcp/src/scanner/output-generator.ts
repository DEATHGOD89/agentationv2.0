import type { ProjectScanResult, FileTreeNode } from "./types.js";

function flattenTree(node: FileTreeNode, prefix: string = ""): string {
  const icon = node.type === "directory" ? "📁" : "📄";
  let line = `${prefix}${icon} ${node.name}`;
  if (node.type === "file" && node.size !== undefined) {
    line += ` (${formatSize(node.size)})`;
  }
  if (node.children) {
    const childPrefix = prefix + "  ";
    for (const child of node.children) {
      line += "\n" + flattenTree(child, childPrefix);
    }
  }
  return line;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLanguages(
  languages?: { language: string; fileCount: number; percentage: number }[]
): string {
  if (!languages || languages.length === 0) return "None detected";
  return languages
    .map((l) => `  - ${l.language}: ${l.fileCount} files (${l.percentage}%)`)
    .join("\n");
}

function formatDeps(
  deps?: Record<string, string>,
  label: string = "Dependencies"
): string {
  if (!deps || Object.keys(deps).length === 0) return "";
  const entries = Object.entries(deps)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 30)
    .map(([name, version]) => `  - ${name}: ${version}`);
  if (Object.keys(deps).length > 30) {
    entries.push(`  - ... and ${Object.keys(deps).length - 30} more`);
  }
  return `### ${label}\n${entries.join("\n")}\n`;
}

function formatArray(
  items: string[] | undefined,
  label: string
): string {
  if (!items || items.length === 0) return "";
  return `### ${label}\n${items.map((i) => `  - ${i}`).join("\n")}\n`;
}

export function generateMarkdown(result: ProjectScanResult): string {
  const lines: string[] = [];

  lines.push(`# Project Scan: ${result.name}`);
  lines.push(``);
  lines.push(`**Path:** \`${result.path}\``);
  lines.push(`**Language:** ${result.language || "Unknown"}`);
  lines.push(`**Framework:** ${result.framework || "None detected"}`);
  lines.push(`**Monorepo:** ${result.isMonorepo ? "Yes" : "No"}`);
  lines.push(`**Total Files:** ${result.fileCount}`);
  lines.push(``);

  if (result.languages && result.languages.length > 0) {
    lines.push(`## Languages`);
    lines.push(``);
    lines.push(formatLanguages(result.languages));
    lines.push(``);
  }

  if (result.dependencies && Object.keys(result.dependencies).length > 0) {
    lines.push(formatDeps(result.dependencies, "Dependencies"));
    lines.push(``);
  }

  if (result.devDependencies && Object.keys(result.devDependencies).length > 0) {
    lines.push(formatDeps(result.devDependencies, "Dev Dependencies"));
    lines.push(``);
  }

  if (result.scripts && Object.keys(result.scripts).length > 0) {
    lines.push(`## Scripts`);
    lines.push(``);
    for (const [name, script] of Object.entries(result.scripts)) {
      lines.push(`  - \`${name}\`: \`${script}\``);
    }
    lines.push(``);
  }

  if (result.entryPoints && result.entryPoints.length > 0) {
    lines.push(formatArray(result.entryPoints, "Entry Points"));
    lines.push(``);
  }

  if (result.configFiles && result.configFiles.length > 0) {
    lines.push(formatArray(result.configFiles, "Config Files"));
    lines.push(``);
  }

  if (result.packages && result.packages.length > 0) {
    lines.push(formatArray(result.packages, "Packages"));
    lines.push(``);
  }

  if (result.envFiles && result.envFiles.length > 0) {
    lines.push(formatArray(result.envFiles, "Environment Files"));
    lines.push(``);
  }

  if (result.docker) {
    lines.push(`## Docker\n  - Docker support detected\n`);
  }

  if (result.ci && result.ci.length > 0) {
    lines.push(formatArray(result.ci, "CI/CD"));
    lines.push(``);
  }

  if (result.readme) {
    lines.push(`## README\n  - Found: \`${result.readme}\`\n`);
  }

  if (result.license) {
    lines.push(`## License\n  - ${result.license}\n`);
  }

  if (result.structure && result.structure.length > 0) {
    lines.push(`## Project Structure`);
    lines.push(``);
    lines.push("```");
    for (const node of result.structure) {
      lines.push(flattenTree(node));
    }
    lines.push("```");
    lines.push(``);
  }

  return lines.join("\n");
}

export function generateJson(result: ProjectScanResult): string {
  return JSON.stringify(result, null, 2);
}
