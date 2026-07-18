export type FrameworkType = "react" | "vue" | "svelte" | "angular" | "solid" | "unknown";

export type FrameworkInfo = {
  framework: FrameworkType;
  components: string[];
  path: string | null;
  version?: string;
  confidence: number;
};

export interface FrameworkScanner {
  id: FrameworkType;
  isPresent(): boolean;
  scan(element: HTMLElement): FrameworkInfo | null;
  priority: number;
}
