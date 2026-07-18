import { Project, SyntaxKind, Node } from "ts-morph";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

const sourceFile = project.getSourceFileOrThrow("src/components/page-toolbar-css/index.tsx");

console.log("Analyzing file:", sourceFile.getFilePath());

const component = sourceFile.getVariableDeclaration("PageToolbarCSS") || sourceFile.getFunction("PageToolbarCSS");
if (!component) {
  console.log("Could not find PageToolbarCSS component");
  process.exit(1);
}

console.log("Found component.");

// Let's list the top-level functions/variables inside the component
if (Node.isVariableDeclaration(component)) {
  const init = component.getInitializer();
  if (Node.isArrowFunction(init)) {
    const body = init.getBody();
    if (Node.isBlock(body)) {
      body.getStatements().forEach(stmt => {
        if (Node.isVariableStatement(stmt)) {
          const decls = stmt.getDeclarations();
          decls.forEach(d => console.log("VAR:", d.getName()));
        } else if (Node.isFunctionDeclaration(stmt)) {
          console.log("FUNC:", stmt.getName());
        }
      });
    }
  }
}

