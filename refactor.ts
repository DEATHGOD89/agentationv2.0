import * as ts from "typescript";
import * as fs from "fs";

function extractEffects(filePath: string): string[] {
  const code = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const effects: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        if (expr.text === "useEffect" || expr.text === "useLayoutEffect") {
          // If it's inside a hook, its parent is an ExpressionStatement
          if (ts.isExpressionStatement(node.parent)) {
             effects.push(node.parent.getText(sourceFile));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return effects;
}

const ann = extractEffects("package/src/components/page-toolbar-css/hooks/temp_annotations2.ts.bak");
const des = extractEffects("package/src/components/page-toolbar-css/hooks/temp_design2.ts.bak");
const srv = extractEffects("package/src/components/page-toolbar-css/hooks/temp_server2.ts.bak");

const allEffects = [...ann, ...des, ...srv];
fs.writeFileSync("effects_clean.txt", allEffects.join("\n\n"));
console.log("Successfully extracted " + allEffects.length + " effects.");
