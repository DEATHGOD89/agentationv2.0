import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
const sourceFile = project.addSourceFileAtPath("c:/Users/Death_God/Downloads/agentation/package/src/components/page-toolbar-css/index.tsx");

const component = sourceFile.getFunction("PageFeedbackToolbarCSS") || sourceFile.getVariableDeclaration("PageFeedbackToolbarCSS")?.getInitializerIfKind(SyntaxKind.ArrowFunction);

if (!component) {
    console.log("Component not found");
    process.exit(1);
}

const statements = component.getBody()?.asKind(SyntaxKind.Block)?.getStatements() || [];

const stateVars = [];
for (const stmt of statements) {
    if (stmt.getKind() === SyntaxKind.VariableStatement) {
        const text = stmt.getText();
        if (text.includes("useState") || text.includes("useRef") || text.includes("useCallback")) {
            stateVars.push(text.split("\n")[0].substring(0, 80));
        }
    }
}

console.log("Found state variables (first 20):");
stateVars.slice(0, 20).forEach(s => console.log(s));
