/* eslint-disable no-console */
import { array, command, flag, multioption, option, string } from "cmd-ts";
import fs from "fs-extra";
import { glob } from "zx";
import { SuperThis } from "@fireproof/core-types-base";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setDependenciesCmd(sthis: SuperThis) {
  const cmd = command({
    name: "fireproof set dependencies",
    description: "helps to set dependencies in package.json files",
    version: "1.0.0",
    args: {
      packageJsons: multioption({
        long: "packageJsons",
        short: "p",
        type: array(string),
        defaultValue: () => ["**/package.json"],
        defaultValueIsSerializable: true,
        description: "List of package.json files to patch, defaults to ['**/package.json'].",
      }),
      depName: option({
        long: "depName",
        short: "n",
        type: string,
        description: "The dependency name to set in package.json files.",
      }),
      depVersion: option({
        long: "depVersion",
        short: "v",
        type: string,
        defaultValue: () => "",
        description: "The version of the dependency to set in package.json files.",
      }),
      devDependency: flag({
        long: "devDependency",
        short: "D",
        description: "If set, the dependency will be added to devDependencies instead of dependencies.",
      }),
      peerDependency: flag({
        long: "peerDependency",
        short: "P",
        description: "If set, the dependency will be added to peerDependencies instead of dependencies.",
      }),
    },
    handler: async (args) => {
      const packagesJsonFiles = await glob(args.packageJsons, {
        gitignore: true, // Respect .gitignore
        dot: false, // Don't include hidden files
        ignore: [
          // Additional ignores
          "node_modules/**",
          "**/node_modules/**",
          "dist/**",
          "build/**",
          ".next/**",
          "coverage/**",
        ],
        onlyFiles: true, // Only return files, not directories
        absolute: false, // Return relative paths
        caseSensitiveMatch: false,
      });
      console.log(`Found ${packagesJsonFiles.length} package.json files to patch.`);
      for (const packageJsonPath of packagesJsonFiles) {
        const packageJson = await fs.readJSON(packageJsonPath);
        if (args.devDependency) {
          packageJson.devDependencies = packageJson.devDependencies || {};
          packageJson.devDependencies[args.depName] = args.depVersion;
          console.log(`Setting devDependency ${args.depName} to "${args.depVersion}" in ${packageJsonPath}`);
        } else if (args.peerDependency) {
          packageJson.peerDependencies = packageJson.peerDependencies || {};
          packageJson.peerDependencies[args.depName] = args.depVersion;
          console.log(`Setting peerDependency ${args.depName} to "${args.depVersion}" in ${packageJsonPath}`);
        } else {
          packageJson.dependencies = packageJson.dependencies || {};
          packageJson.dependencies[args.depName] = args.depVersion;
          console.log(`Setting dependency ${args.depName} to "${args.depVersion}" in ${packageJsonPath}`);
        }
        await fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
      }
    },
  });
  return cmd;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setScriptsCmd(sthis: SuperThis) {
  const cmd = command({
    name: "fireproof build cli",
    description: "helps to build fp",
    version: "1.0.0",
    args: {
      packageJsons: multioption({
        long: "packageJsons",
        short: "p",
        type: array(string),
        defaultValue: () => ["**/package.json"],
        defaultValueIsSerializable: true,
        description: "List of package.json files to patch, defaults to ['**/package.json'].",
      }),
      scriptName: option({
        long: "scriptName",
        short: "s",
        type: string,
        description: "The script name to set in package.json files.",
      }),
      scriptAction: option({
        long: "scriptAction",
        short: "a",
        type: string,
        defaultValue: () => "",
        description: "The script action to set in package.json files.",
      }),
      scriptDelete: flag({
        long: "scriptDelete",
        short: "d",
        description: "If set, the script will be deleted instead of set.",
      }),
    },
    handler: async (args) => {
      const packagesJsonFiles = await glob(args.packageJsons, {
        gitignore: true, // Respect .gitignore
        dot: false, // Don't include hidden files
        ignore: [
          // Additional ignores
          "node_modules/**",
          "**/node_modules/**",
          "dist/**",
          "build/**",
          ".next/**",
          "coverage/**",
        ],
        onlyFiles: true, // Only return files, not directories
        absolute: false, // Return relative paths
        caseSensitiveMatch: false,
      });
      console.log(`Found ${packagesJsonFiles.length} package.json files to patch.`);
      for (const packageJsonPath of packagesJsonFiles) {
        const packageJson = await fs.readJSON(packageJsonPath);
        if (args.scriptDelete || !args.scriptAction) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete packageJson.scripts[args.scriptName];
          console.log(`Deleting script ${args.scriptName} from ${packageJsonPath}`);
        } else {
          packageJson.scripts[args.scriptName] = args.scriptAction;
          console.log(`Setting script ${args.scriptName} to "${args.scriptAction}" in ${packageJsonPath}`);
        }
        await fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
      }
    },
  });
  return cmd;
}
