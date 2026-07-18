import * as ts from "typescript";
import * as fs from "fs";

function extractFuncsAndEffects(filePath: string, funcNames: string[]): { funcs: string, effects: string } {
  const code = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  let extractedFuncs = "";
  let extractedEffects = "";
  
  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      const decls = node.declarationList.declarations;
      for (const decl of decls) {
        if (ts.isIdentifier(decl.name) && funcNames.includes(decl.name.text)) {
          extractedFuncs += node.getText(sourceFile) + "\n\n";
        }
      }
    }
    
    // Check for useEffect calls
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      if (ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'useEffect') {
        extractedEffects += node.getText(sourceFile) + "\n\n";
      }
    }
    
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { funcs: extractedFuncs, effects: extractedEffects };
}

const funcsToExtractAnnotations = [
  'createMultiSelectPendingAnnotation',
  'startEditAnnotation',
  'addAnnotation',
  'cancelAnnotation',
  'deleteAnnotation',
  'handleMarkerHover',
  'updateAnnotation',
  'cancelEditAnnotation',
  'clearAll',
  'copyOutput',
  'sendToWebhook'
];

const funcsToExtractDesign = ['closeDesignMode', 'deactivate'];
const funcsToExtractServer = ['handleControlsMouseEnter', 'handleControlsMouseLeave', 'fireWebhook'];

let extractedFuncs = "";
let extractedEffects = "";

const resServer = extractFuncsAndEffects("src/components/page-toolbar-css/hooks/temp_server2.ts.bak", funcsToExtractServer);
const resAnnotations = extractFuncsAndEffects("src/components/page-toolbar-css/hooks/temp_annotations2.ts.bak", funcsToExtractAnnotations);
const resDesign = extractFuncsAndEffects("src/components/page-toolbar-css/hooks/temp_design2.ts.bak", funcsToExtractDesign);

extractedFuncs = resServer.funcs + resAnnotations.funcs + resDesign.funcs;
extractedEffects = resServer.effects + resAnnotations.effects + resDesign.effects;

const stateVars = `
  const popupRef = useRef<AnnotationPopupCSSHandle>(null);
  const editPopupRef = useRef<AnnotationPopupCSSHandle>(null);
  const visibleAnnotations = annotations.filter(
    (a) => !exitingMarkers.has(a.id) && a.kind !== "placement" && a.kind !== "rearrange",
  );
  const hasVisibleAnnotations = visibleAnnotations.length > 0;
  const hasAnnotations = annotations.length > 0;
  const exitingAnnotationsList = annotations.filter((a) =>
    exitingMarkers.has(a.id),
  );
  const shouldShowMarkers =
    isActive && !isDesignMode && !tooltipsHidden && !showSettings;

  const closestCrossingShadow = (el: HTMLElement | null, sel: string): HTMLElement | null => {
    if (!el) return null;
    let curr: HTMLElement | null = el;
    while (curr) {
      const match = curr.closest(sel) as HTMLElement | null;
      if (match) return match;
      const root = curr.getRootNode();
      if (root instanceof ShadowRoot) {
        curr = root.host as HTMLElement;
      } else {
        break;
      }
    }
    return null;
  };

  const getTooltipPosition = (a: any) => {
    const rect = a.rect || a;
    let top = rect.top - 10;
    let placement = "top";
    if (top < 80) {
      top = rect.bottom + 10;
      placement = "bottom";
    }
    return {
      top: Math.max(10, Math.min(window.innerHeight - 80, top)),
      left: Math.max(10, Math.min(window.innerWidth - 300, rect.left + rect.width / 2 - 140)),
      placement,
    };
  };
`;

let indexBuf = fs.readFileSync('src/components/page-toolbar-css/index.tsx');
let indexCode = indexBuf.toString('utf16le'); // Read as UTF-16
if (!indexCode.includes('PageFeedbackToolbarCSS')) {
    // Fallback if it was actually UTF-8
    indexCode = indexBuf.toString('utf8');
}
indexCode = indexCode.replace(/\r\n/g, '\n'); 

// Fix TS errors in the JSX
indexCode = indexCode.replace(/\.filter\(\(el\) => document\.contains\(el\)\)/g, '.filter((el: any) => document.contains(el))');
indexCode = indexCode.replace(/\.map\(\(el, index\) => \{/g, '.map((el: any, index: number) => {');
extractedFuncs = extractedFuncs.replace(/stroke\.points\.map\(p => \(\{ x: p\.x, y: p\.y - scrollY \}\)\)/g, 'stroke.points.map((p: any) => ({ x: p.x, y: p.y - scrollY }))');

const replaceStart = indexCode.indexOf('// Fire webhook');
const replaceEnd = indexCode.indexOf('// Handle toolbar drag start');

if (replaceStart === -1 || replaceEnd === -1) {
    console.error("COULD NOT FIND INJECT LOCATION!", { replaceStart, replaceEnd });
    process.exit(1);
}

// Find the start of the line for replaceStart
let startOfLine = replaceStart;
while (startOfLine > 0 && indexCode[startOfLine - 1] !== '\n') startOfLine--;

// Find the start of the line for replaceEnd
let endOfLine = replaceEnd;
while (endOfLine > 0 && indexCode[endOfLine - 1] !== '\n') endOfLine--;

indexCode = indexCode.substring(0, startOfLine) + '\n' + stateVars + '\n\n' + extractedFuncs + '\n\n' + indexCode.substring(endOfLine);

const returnStr = 'return createPortal(';
const returnIdx = indexCode.indexOf(returnStr);
if (returnIdx === -1) {
    console.error("COULD NOT FIND RETURN STATEMENT!");
    process.exit(1);
}

// Find start of line for return
let returnStartOfLine = returnIdx;
while (returnStartOfLine > 0 && indexCode[returnStartOfLine - 1] !== '\n') returnStartOfLine--;

indexCode = indexCode.substring(0, returnStartOfLine) + '\n\n' + extractedEffects + '\n' + indexCode.substring(returnStartOfLine);

fs.writeFileSync('src/components/page-toolbar-css/index.tsx', indexCode, 'utf8'); // Write back as UTF-8
console.log('Successfully AST-extracted and applied all fixes to index.tsx!');
