import { ImportDeclaration, API, FileInfo, Options } from "jscodeshift";

const nodeExternals = new Set(["path", "fs", "fs/promises"]);

const replace = {
  /*
  "cborg": "@fireproof/vendor/cborg",
  "cborg/utils": "@fireproof/vendor/cborg/utils",
  "cborg/json": "@fireproof/vendor/cborg/json",
  "cborg/length": "@fireproof/vendor/cborg/length",
  "cborg/taglib": "@fireproof/vendor/cborg/taglib",
  "@ipld/dag-json": "@fireproof/vendor/@ipld/dag-json",
  "@ipld/dag-cbor": "@fireproof/vendor/@ipld/dag-cbor",
*/
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function (fileInfo: FileInfo, api: API, options: Options) {
  return api
    .jscodeshift(fileInfo.source)
    .find(ImportDeclaration)
    .map((path) => {
      const sourceValue = path.node.source.value;
      if (!sourceValue) {
        return path;
      }
      const val = sourceValue.toString();
      if (nodeExternals.has(val)) {
        return path;
      } else if (replace[val]) {
        path.node.source.value = replace[val];
      }
      // else if (/^[^.].*/.test(val)) {
      //  // eslint-disable-next-line no-console
      //  // console.log(path.node.source)
      //  path.node.source.value = `https://esm.sh/${path.node.source.value}`;
      // }
      return path; //.node as unknown as ASTPath<ASTNode>;
    })
    .toSource();
  //return orig;
}
