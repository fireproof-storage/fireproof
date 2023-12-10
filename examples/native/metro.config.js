const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

// // Live refresh when any of our packages are rebuilt
// const fireproofCore = path.resolve(
//   path.join(__dirname, "../../packages/fireproof")
// );
// const useFireproof = path.resolve(
//   path.join(__dirname, "../../packages/react")
// );

// const watchFolders = [fireproofCore, useFireproof];

// const nodeModulesPaths = [
//   path.resolve(path.join(__dirname, "./node_modules")),
// ];

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
  resolver: {
    // resolveRequest: (context, moduleName, platform) => {
    //   if (moduleName.endsWith('./store-browser')) {
    //     console.log('replace browser w native', __dirname, moduleName);
    //     return {
    //       filePath: `${__dirname}/node_modules/@fireproof/core/src/store-native.ts`,
    //       type: 'sourceFile',
    //     }
    //   }
    //   // if (moduleName.startsWith('./')) {
    //   //   console.log('local module ?  ', moduleName);
    //   // }
    //   // Optionally, chain to the standard Metro resolver.
    //   return context.resolveRequest(context, moduleName, platform);
    // },
    //
    // // "Please use our `node_modules` instance of these packages"
    // resolveRequest: (context, moduleName, platform) => {
    //   // React packages
    //   if (
    //     // Add to this list whenever a new React-reliant dependency is added
    //        moduleName.startsWith("react")
    //     || moduleName.startsWith("@react-native")
    //     || moduleName.startsWith("@react-native-community")
    //     // || moduleName.startsWith("@fireproof")
    //     // || moduleName.startsWith("use-fireproof")
    //   ) {
    //     const pathToResolve = path.resolve(
    //       __dirname,
    //       "node_modules",
    //       moduleName,
    //     );
    //     return context.resolveRequest(context, pathToResolve, platform);
    //   }

    //   // // Fireproof packages
    //   // if (moduleName.startsWith('@fireproof/core')) {
    //   //   return {
    //   //     filePath: `${__dirname}/node_modules/@fireproof/core/native/fireproof.esm.js`,
    //   //     type: 'sourceFile',
    //   //   }
    //   // }
    // },
    // nodeModulesPaths,
    resolverMainFields: ['react-native', 'browser', 'module', 'main'],
    sourceExts: ['jsx', 'js', 'ts', 'tsx', 'cjs', 'mjs', 'json', 'd.ts', 'esm.js', 'iife.js'],
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        inlineRequires: true,
      },
    }),
  },
  // watchFolders,
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);