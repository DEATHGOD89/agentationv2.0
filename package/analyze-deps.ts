import { Project, SyntaxKind, Node } from "ts-morph";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

const sourceFile = project.getSourceFileOrThrow("src/components/page-toolbar-css/index.tsx");
const comp = sourceFile.getFunction("PageFeedbackToolbarCSS");

if (!comp) {
  console.log("Could not find PageFeedbackToolbarCSS");
  process.exit(1);
}

const vars = comp.getVariableStatements().map(v => v.getDeclarations().map(d => d.getName())).flat();
const funcs = comp.getFunctions().map(f => f.getName());

console.log("Vars:", vars.length);
console.log("Funcs:", funcs.length);

const extractFuncs = ["addAnnotation", "updateAnnotation", "deleteAnnotation", "handleAnnotationMove", "resolveAnnotations", "clearAnnotations"];
for (const fName of extractFuncs) {
  const func = comp.getFunction(fName) || comp.getVariableDeclaration(fName);
  if (func) {
    console.log(`Found: ${fName}`);
  } else {
    console.log(`Not found: ${fName}`);
  }
}

