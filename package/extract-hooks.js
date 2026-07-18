const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

async function main() {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json'
  });

  const sourceFile = project.getSourceFile('src/components/page-toolbar-css/index.tsx');
  if (!sourceFile) {
    console.error('File not found');
    return;
  }

  const component = sourceFile.getFunction('PageFeedbackToolbarCSS');
  if (!component) {
    console.error('Component not found');
    return;
  }

  // We will leave AST manipulations for now and just print what states are there
  const variableStatements = component.getVariableStatements();
  
  for (const stmt of variableStatements) {
    const text = stmt.getText();
    if (text.includes('useState') || text.includes('useEffect') || text.includes('useCallback')) {
      console.log(text.substring(0, 100));
    }
  }
}

main().catch(console.error);
