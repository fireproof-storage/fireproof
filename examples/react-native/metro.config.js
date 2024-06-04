const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// All changes in this file are for developing in pnpm monorepo
// i.e. they won't be required in an app using a published version of Fireproof
// TODO: maybe `unstable_enablePackageExports: true` needs to stay?
const d = __dirname;
const pnpmRoot = path.resolve(path.join(d, '..', '..'));
const rnqc = path.resolve(path.join(d, '..', '..', '..', 'react-native-quick-crypto'));
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
    unstable_enablePackageExports: true,
    unstable_enableSymlinks: true,
  },
  watchFolders: [pnpmRoot, rnqc],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
