import * as path from "path";

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".swift": "Swift",
  ".cs": "C#",
  ".cpp": "C++",
  ".cxx": "C++",
  ".cc": "C++",
  ".c": "C",
  ".h": "C/C++",
  ".hpp": "C++",
  ".rb": "Ruby",
  ".php": "PHP",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".fish": "Shell",
  ".ps1": "PowerShell",
  ".psm1": "PowerShell",
  ".dart": "Dart",
  ".lua": "Lua",
  ".scala": "Scala",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".hs": "Haskell",
  ".ml": "OCaml",
  ".clj": "Clojure",
  ".cljs": "ClojureScript",
  ".r": "R",
  ".sql": "SQL",
  ".pl": "Perl",
  ".pm": "Perl",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".astro": "Astro",
  ".zig": "Zig",
  ".nim": "Nim",
  ".crystal": "Crystal",
  ".elm": "Elm",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "Less",
  ".html": "HTML",
  ".xml": "XML",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".proto": "Protocol Buffers",
  ".dockerfile": "Dockerfile",
};

const SHEBANG_MAP: Record<string, string> = {
  "/usr/bin/node": "JavaScript",
  "/usr/local/bin/node": "JavaScript",
  "/usr/bin/python": "Python",
  "/usr/bin/python3": "Python",
  "/usr/bin/env python": "Python",
  "/usr/bin/env python3": "Python",
  "/usr/bin/env node": "JavaScript",
  "/bin/bash": "Shell",
  "/usr/bin/bash": "Shell",
  "/bin/sh": "Shell",
  "/usr/bin/env bash": "Shell",
  "/usr/bin/env sh": "Shell",
  "/usr/bin/env zsh": "Shell",
};

function detectLanguageFromShebang(filePath: string, content: string): string | undefined {
  const firstLine = content.split("\n")[0];
  if (!firstLine.startsWith("#!")) return undefined;

  const shebang = firstLine.slice(2).trim();
  for (const [key, lang] of Object.entries(SHEBANG_MAP)) {
    if (shebang.includes(key)) return lang;
  }
  return undefined;
}

function getExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === "" || ext === ".") {
    const basename = path.basename(filePath).toLowerCase();
    if (basename === "dockerfile") return ".dockerfile";
    if (basename.startsWith("dockerfile")) {
      const parts = basename.split(".");
      if (parts.length > 1) return `.dockerfile.${parts.slice(1).join(".")}`;
      return ".dockerfile";
    }
    if (basename === "makefile") return ".makefile";
    if (basename === "gemfile") return ".gemfile";
  }
  return ext;
}

export function detectLanguage(filePath: string, content?: string): string | undefined {
  if (content) {
    const shebang = detectLanguageFromShebang(filePath, content);
    if (shebang) return shebang;
  }

  const ext = getExtension(filePath);
  return EXTENSION_MAP[ext];
}

export function detectLanguages(
  files: { filePath: string; content?: string }[]
): { language: string; fileCount: number; percentage: number }[] {
  const counts: Record<string, number> = {};
  let total = 0;

  for (const file of files) {
    const lang = detectLanguage(file.filePath, file.content);
    if (lang) {
      counts[lang] = (counts[lang] || 0) + 1;
      total++;
    }
  }

  if (total === 0) return [];

  return Object.entries(counts)
    .map(([language, fileCount]) => ({
      language,
      fileCount,
      percentage: Math.round((fileCount / total) * 10000) / 100,
    }))
    .sort((a, b) => b.fileCount - a.fileCount);
}
