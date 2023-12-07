const path = require('path');

const {
  exclusionList,
  makeMetroConfig,
  resolveUniqueModule,
} = require("@rnx-kit/metro-config");

// const local = path.resolve(path.join(__dirname, './node_modules'));
// const pnpm = path.resolve(path.join(__dirname, '../../node_modules/.pnpm'));
const fireproofCore = path.resolve(path.join(__dirname, '../../packages/fireproof'));
const useFireproof = path.resolve(path.join(__dirname, '../../packages/react'));

// to ensure only one instance of a package
const [reactPath, reactExcludePattern] = resolveUniqueModule("react");
const [rnPath, rnExcludePattern] = resolveUniqueModule("react-native");
const additionalExclusions = [reactExcludePattern];
const blockList = exclusionList(additionalExclusions);
console.log({reactPath, rnPath});

module.exports = makeMetroConfig({
  resolver: {
    blockList,
    extraNodeModules: {
      "react": reactPath,
      "react-native": rnPath,
    },
    // nodeModulesPaths: [
    //   local,
    //   pnpm,
    // ],
    sourceExts: ['jsx', 'js', 'ts', 'tsx', 'cjs', 'json', 'd.ts', 'esm.js'],
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: true,
        inlineRequires: true,
      },
    }),
  },
  watchFolders: [
    // local,
    // pnpm,
    fireproofCore,
    useFireproof,
  ],
});