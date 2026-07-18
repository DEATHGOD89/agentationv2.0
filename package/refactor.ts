import { Project, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import fs from "fs";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const sourceFile = project.getSourceFileOrThrow("src/components/page-toolbar-css/index.tsx");
const comp = sourceFile.getFunction("PageFeedbackToolbarCSS");

if (!comp) {
  console.log("Could not find PageFeedbackToolbarCSS");
  process.exit(1);
}

// Function to extract nodes based on a predicate
function extractNodes(predicate: (text: string, names: string[]) => boolean) {
  const extracted = [];
  
  // Extract variable statements
  const vars = comp.getVariableStatements();
  for (const v of vars) {
    const text = v.getText();
    const names = v.getDeclarations().map(d => d.getName());
    if (predicate(text, names)) {
      extracted.push(text);
      v.remove();
    }
  }

  // Extract effects
  const statements = comp.getStatements();
  for (const s of statements) {
    if (s.getKind() === SyntaxKind.ExpressionStatement) {
      const text = s.getText();
      if (text.startsWith("useEffect") || text.startsWith("useCallback")) {
        if (predicate(text, [])) {
          extracted.push(text);
          s.remove();
        }
      }
    }
  }
  return extracted;
}

const annotationKeywords = ["Annotation", "Marker", "HoveredMarker", "renumberFrom"];
const designKeywords = ["Design", "Canvas", "Wireframe", "Rearrange", "Stroke", "Draw"];
const serverKeywords = ["Sync", "Webhook", "Server", "Connection", "Session"];

function hasKeyword(text: string, names: string[], keywords: string[]) {
  const lowerText = text.toLowerCase();
  return keywords.some(k => lowerText.includes(k.toLowerCase()));
}

console.log("Extracting annotations...");
const annotationsCode = extractNodes((text, names) => hasKeyword(text, names, annotationKeywords));

console.log("Extracting design...");
const designCode = extractNodes((text, names) => hasKeyword(text, names, designKeywords));

console.log("Extracting server...");
const serverCode = extractNodes((text, names) => hasKeyword(text, names, serverKeywords));

// Create hooks
fs.mkdirSync("src/components/page-toolbar-css/hooks", { recursive: true });

function writeHook(name: string, code: string[]) {
  const content = `import { useState, useEffect, useRef, useCallback } from 'react';\n\nexport function ${name}() {\n  ${code.join("\n  ")}\n\n  return {};\n}\n`;
  fs.writeFileSync(`src/components/page-toolbar-css/hooks/${name}.ts`, content);
}

writeHook("useAnnotations", annotationsCode);
writeHook("useDesignMode", designCode);
writeHook("useServerSync", serverCode);

sourceFile.saveSync();
console.log("Done.");
