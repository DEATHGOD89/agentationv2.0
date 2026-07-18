import type { Annotation, OutputDetailLevel, ReactComponentMode } from "../types";

export const OUTPUT_TO_REACT_MODE: Record<
  OutputDetailLevel,
  ReactComponentMode
> = {
  compact: "off",
  standard: "filtered",
  detailed: "smart",
  forensic: "all",
};

export const OUTPUT_DETAIL_OPTIONS: {
  value: OutputDetailLevel;
  label: string;
}[] = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
  { value: "forensic", label: "Forensic" },
];

function formatCompact(a: Annotation, i: number): string {
  let output = `${i + 1}. **${a.element}**${a.sourceFile ? ` (${a.sourceFile})` : ""}: ${a.comment}`;
  if (a.selectedText) {
    output += ` (re: "${a.selectedText.slice(0, 30)}${a.selectedText.length > 30 ? "..." : ""}")`;
  }
  return output + "\n";
}

function formatForensic(a: Annotation, i: number): string {
  let output = `### ${i + 1}. ${a.element}\n`;
  if (a.isMultiSelect && a.fullPath) {
    output += `*Forensic data shown for first element of selection*\n`;
  }
  if (a.fullPath) output += `**Full DOM Path:** ${a.fullPath}\n`;
  if (a.cssClasses) output += `**CSS Classes:** ${a.cssClasses}\n`;
  if (a.boundingBox) {
    output += `**Position:** x:${Math.round(a.boundingBox.x)}, y:${Math.round(a.boundingBox.y)} (${Math.round(a.boundingBox.width)}×${Math.round(a.boundingBox.height)}px)\n`;
  }
  output += `**Annotation at:** ${a.x.toFixed(1)}% from left, ${Math.round(a.y)}px from top\n`;
  if (a.selectedText) output += `**Selected text:** "${a.selectedText}"\n`;
  if (a.nearbyText && !a.selectedText) output += `**Context:** ${a.nearbyText.slice(0, 100)}\n`;
  if (a.computedStyles) output += `**Computed Styles:** ${a.computedStyles}\n`;
  if (a.accessibility) output += `**Accessibility:** ${a.accessibility}\n`;
  if (a.nearbyElements) output += `**Nearby Elements:** ${a.nearbyElements}\n`;
  if (a.sourceFile) output += `**Source:** ${a.sourceFile}\n`;
  if (a.reactComponents) output += `**React:** ${a.reactComponents}\n`;
  
  if (a.context) {
    if (a.context.console && a.context.console.length > 0) {
      const errors = a.context.console.filter((c) => c.level === "error");
      if (errors.length > 0) {
        output += `**Console Errors:**\n`;
        errors.slice(0, 3).forEach((e) => {
          output += `  - \`${e.message.slice(0, 200)}\`\n`;
        });
      }
    }
    if (a.context.network && a.context.network.length > 0) {
      const failures = a.context.network.filter((n) => n.status >= 400 || n.error);
      if (failures.length > 0) {
        output += `**Network Errors:**\n`;
        failures.slice(0, 3).forEach((n) => {
          output += `  - \`${n.method} ${n.url}\` → ${n.error || n.status}\n`;
        });
      }
    }
    if (a.context.state && a.context.state.length > 0) {
      output += `**State (${a.context.state[0].storeType}):** \`${JSON.stringify(a.context.state[0].state).slice(0, 300)}\`\n`;
    }
  }
  output += `**Feedback:** ${a.comment}\n\n`;
  return output;
}

function formatStandard(a: Annotation, i: number, detailLevel: OutputDetailLevel): string {
  let output = `### ${i + 1}. ${a.element}\n`;
  output += `**Location:** ${a.elementPath}\n`;
  if (a.sourceFile) output += `**Source:** ${a.sourceFile}\n`;
  if (a.reactComponents) output += `**React:** ${a.reactComponents}\n`;
  
  if (detailLevel === "detailed") {
    if (a.cssClasses) output += `**Classes:** ${a.cssClasses}\n`;
    if (a.boundingBox) {
      output += `**Position:** ${Math.round(a.boundingBox.x)}px, ${Math.round(a.boundingBox.y)}px (${Math.round(a.boundingBox.width)}×${Math.round(a.boundingBox.height)}px)\n`;
    }
  }
  
  if (a.selectedText) output += `**Selected text:** "${a.selectedText}"\n`;
  if (detailLevel === "detailed" && a.nearbyText && !a.selectedText) {
    output += `**Context:** ${a.nearbyText.slice(0, 100)}\n`;
  }
  
  if (a.context && detailLevel !== "compact") {
    if (a.context.console && a.context.console.filter(c => c.level === "error").length > 0) {
      output += `**Console Errors:** `;
      output += a.context.console.filter(c => c.level === "error").slice(0, 2).map(e => `\`${e.message.slice(0, 100)}\``).join(", ");
      output += `\n`;
    }
    if (a.context.network && a.context.network.filter(n => n.status >= 400 || n.error).length > 0) {
      output += `**Network Errors:** `;
      output += a.context.network.filter(n => n.status >= 400 || n.error).slice(0, 2).map(n => `\`${n.method} ${n.url.split("?")[0].slice(0, 50)} → ${n.error || n.status}\``).join(", ");
      output += `\n`;
    }
  }
  output += `**Feedback:** ${a.comment}\n\n`;
  return output;
}

export function generateOutput(
  annotations: Annotation[],
  pathname: string,
  detailLevel: OutputDetailLevel = "standard",
): string {
  if (annotations.length === 0) return "";

  const viewport =
    typeof window !== "undefined"
      ? `${window.innerWidth}×${window.innerHeight}`
      : "unknown";

  let output = `## Page Feedback: ${pathname}\n`;

  if (detailLevel === "forensic") {
    output += `\n**Environment:**\n`;
    output += `- Viewport: ${viewport}\n`;
    if (typeof window !== "undefined") {
      output += `- URL: ${window.location.href}\n`;
      output += `- User Agent: ${navigator.userAgent}\n`;
      output += `- Timestamp: ${new Date().toISOString()}\n`;
      output += `- Device Pixel Ratio: ${window.devicePixelRatio}\n`;
    }
    output += `\n---\n`;
  } else if (detailLevel !== "compact") {
    output += `**Viewport:** ${viewport}\n`;
  }
  output += "\n";

  annotations.forEach((a, i) => {
    if (detailLevel === "compact") {
      output += formatCompact(a, i);
    } else if (detailLevel === "forensic") {
      output += formatForensic(a, i);
    } else {
      output += formatStandard(a, i, detailLevel);
    }
  });

  return output.trim();
}
