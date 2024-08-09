import { Project, SyntaxKind, Node } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.ts");

// src/blockstore/loader.ts
// const sourceFile = project.getSourceFileOrThrow("./src/blockstore/loader.ts")

project.getSourceFiles().map((sourceFile) => {
  const foundDebug: Node[] = [];

  sourceFile.forEachDescendant((node, traversal) => {
    // sourceFile.forEachChild(node => {
    //  console.log(node.getKind());
    switch (node.getKind()) {
      case SyntaxKind.CallExpression:
        {
          let found = false;
          node.forEachDescendant((child) => {
            switch (child.getKind()) {
              case SyntaxKind.Identifier:
                if (child.getText() === "Debug") {
                  found = true;
                }
                break;
            }
          });
          const txt = node.getFirstChild()?.getText();
          if (found && node.getKind() === SyntaxKind.CallExpression && txt?.includes("logger.Debug()")) {
            // eslint-disable-next-line no-console
            console.log(">>>>>>>>>>>>>>>", sourceFile.getFilePath(), txt);
            // node.forEachDescendant(child => {
            //   console.log(child.getKindName(), child.getText());
            // })
          }
        }
        traversal.up();
        break;

      // case SyntaxKind.Identifier:
      //   if (node.getText() === 'Debug') {
      //     const parent = node.getParent();
      //     // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      //     foundDebug.push(parent!);

      //   }
      //   break;
    }
    if (foundDebug) {
      //    console.log(node, node.getText());
    }
    // traversal
    // return node;
    // console.log(node.getText());
  });
});
// foundDebug.map(node => {
// node.forEachChild(child => {
//   // eslint-disable-next-line no-console
//   console.log(child.getKindName(), child.getText());
// })
// })
