export type ProjectScanResult = {
  path: string;
  name: string;
  language?: string;
  framework?: string;
  isMonorepo: boolean;
  packages?: string[];
  entryPoints?: string[];
  configFiles?: string[];
  fileCount: number;
  languages?: { language: string; fileCount: number; percentage: number }[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  structure?: FileTreeNode[];
  envFiles?: string[];
  docker?: boolean;
  ci?: string[];
  readme?: string;
  license?: string;
};

export type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  size?: number;
};
