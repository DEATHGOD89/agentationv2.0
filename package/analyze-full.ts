import { Project, SyntaxKind, Node } from "ts-morph";
import fs from "fs";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

const sourceFile = project.getSourceFileOrThrow("src/components/page-toolbar-css/index.tsx");
const comp = sourceFile.getFunction("PageFeedbackToolbarCSS");

if (!comp) {
  console.log("Could not find PageFeedbackToolbarCSS");
  process.exit(1);
}

const vars = comp.getVariableStatements().map(vs => ({
  text: vs.getText(),
  names: vs.getDeclarations().map(d => d.getName())
}));

const funcs = comp.getFunctions().map(f => ({
  name: f.getName(),
  text: f.getText(),
}));

const effects = comp.getStatements()
  .filter(s => Node.isExpressionStatement(s) && s.getText().startsWith("useEffect"))
  .map(s => s.getText());

const data = { vars, funcs, effects };
fs.writeFileSync("analysis.json", JSON.stringify(data, null, 2));
console.log("Wrote analysis.json");
