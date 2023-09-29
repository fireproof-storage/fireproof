import typescript from 'rollup-plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import fs from 'fs';

export function customRollupPluginTypescript(options) {
  const originalPlugin = typescript(options);

  return {
    ...originalPlugin,
    resolveId(importee, importer) {
      const resolveHost = {
        directoryExists: dirPath => fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(),
        fileExists: filePath => fs.existsSync(filePath) && fs.statSync(filePath).isFile(),
        readFile: () => {}
      };

      if (typeof originalPlugin.resolveId === 'function') {
        return originalPlugin.resolveId.call(this, importee, importer, resolveHost);
      }
    }
  };
}

export function customRollupPluginCommonjs(options) {
  const originalPlugin = commonjs(options);

  return {
    ...originalPlugin,
    resolveId(importee, importer) {
      const resolveHost = {
        directoryExists: dirPath => fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(),
        fileExists: filePath => fs.existsSync(filePath) && fs.statSync(filePath).isFile(),
        readFile: () => {}
      };

      if (typeof originalPlugin.resolveId === 'function') {
        return originalPlugin.resolveId.call(this, importee, importer, resolveHost);
      }
    }
  };
}