// const path = require('path');
// const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// // for developing in pnpm monorepo
// const watchFolders = [path.resolve(path.join(__dirname, '..', '..'))];

// // const nodeModulesPaths = [path.resolve(path.join(__dirname, './node_modules'))];

// /**
//  * Metro configuration
//  * https://facebook.github.io/metro/docs/configuration
//  *
//  * @type {import('metro-config').MetroConfig}
//  */
// const config = {
//   transformer: {
//     getTransformOptions: async () => ({
//       transform: {
//         // for developing in pnpm monorepo
//         // experimentalImportSupport: true,
//         // inlineRequires: true,
//       },
//     }),
//   },
//   resolver: {
//     // nodeModulesPaths,
//     // for developing in pnpm monorepo
//     unstable_enableSymlinks: true,
//     unstable_enablePackageExports: true,
//   },
//   watchFolders,
// };

// module.exports = mergeConfig(getDefaultConfig(__dirname), config);

const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// All changes in this file are for developing in pnpm monorepo
// i.e. they won't be required in an app using a published version of Fireproof
const d = __dirname;
const pnpmRoot = path.resolve(path.join(d, '..', '..'));
const nodeModulesPath = [path.resolve(path.join(d, './node_modules'))];

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    nodeModulesPath,
    unstable_enableSymlinks: true,
    // resolveRequest: (context, moduleName, platform) => {
    //   if (moduleName === 'crypto') {
    //     // when importing crypto, resolve to react-native-quick-crypto
    //     return context.resolveRequest(
    //       context,
    //       'react-native-quick-crypto',
    //       platform,
    //     );
    //   }
    //   // otherwise chain to the standard Metro resolver.
    //   return context.resolveRequest(context, moduleName, platform);
    // },
  },
  watchFolders: [
    pnpmRoot,
    // path.resolve(path.join(pnpmRoot, 'node_modules')),
    // path.resolve(path.join(pnpmRoot, 'packages', 'react-native')),
    // path.resolve(path.join(pnpmRoot, 'packages', 'react')),
    // path.resolve(path.join(pnpmRoot, 'packages', 'fireproof')),
  ],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
