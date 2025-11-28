import { readWantedLockfile } from "@pnpm/lockfile-file";
import { PackageJson } from "./build-cmd.js";
import { findUp } from "find-up";

interface PinVersionOptions {
  readonly includeDevDeps?: boolean;
  readonly workspaceVersion?: string;
}

interface CreateOptions {
  readonly lockfilePath?: string;
}

export interface PackageDependencies {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  transitivePeerDependencies?: string[];
}

export class VersionPinner {
  private allDeps: Record<string, string> = {};

  private constructor(allDeps: Record<string, string>) {
    this.allDeps = allDeps;
  }

  /**
   * Helper function to pin dependencies
   */
  private pinDependencies(deps: Record<string, string> | undefined, workspaceVersion: string): Record<string, string> {
    const pinnedDeps: Record<string, string> = {};

    if (!deps) {
      return pinnedDeps;
    }

    for (const [name, version] of Object.entries(deps)) {
      // Check if version is not pinned (starts with ^ or ~ or *)
      if (version.match(/^[\^~*]/) || version.match(/^[0-9]+-/)) {
        // Look up the exact version in lockfile
        if (this.allDeps[name]) {
          pinnedDeps[name] = this.allDeps[name];
        } else {
          // Keep original version if not found in lockfile
          pinnedDeps[name] = version;
        }
      } else if (version.startsWith("workspace:")) {
        // Replace workspace dependencies with the workspace version
        pinnedDeps[name] = workspaceVersion;
      } else {
        // Already pinned, keep as-is
        pinnedDeps[name] = version;
      }
    }

    return pinnedDeps;
  }

  /**
   * Create a VersionPinner by reading the lockfile from a specific path
   */
  static async fromLockfilePath(lockfilePath: string): Promise<VersionPinner> {
    const projectDir = lockfilePath.replace(/\/[^/]+$/, "");
    const lockfile = await readWantedLockfile(projectDir, { ignoreIncompatible: false });

    if (!lockfile) {
      throw new Error(`No lockfile found at ${lockfilePath}`);
    }

    const allDeps: Record<string, string> = {};

    // Extract all packages from lockfile
    if (lockfile.packages) {
      for (const [key, _pkgInfo] of Object.entries(lockfile.packages)) {
        // key format for lockfile v9: "@babel/core@7.23.0" or "lodash@4.17.21"
        // key format for lockfile v6: "/@babel/core@7.23.0" or "/lodash@4.17.21"
        const match = key.match(/^\/?(@?[^@]+)@(.+?)(?:\(|$)/);
        if (match) {
          const [, name, version] = match;
          allDeps[name] = version;
        }
      }
    }

    return new VersionPinner(allDeps);
  }

  /**
   * Create a VersionPinner by finding pnpm-lock.yaml in parent directories or using provided path
   */
  static async create(options: CreateOptions = {}): Promise<VersionPinner> {
    let lockfilePath = options.lockfilePath;

    if (!lockfilePath) {
      const foundPath = await findUp("pnpm-lock.yaml");
      if (!foundPath) {
        throw new Error("Could not find pnpm-lock.yaml in parent directories");
      }
      lockfilePath = foundPath;
    }

    return VersionPinner.fromLockfilePath(lockfilePath);
  }

  /**
   * Pin the dependencies in a package.json
   */
  pinVersions(pkg: PackageJson, options: PinVersionOptions = {}): PackageJson {
    const workspaceVersion = options.workspaceVersion ?? pkg.version;

    // Pin dependencies
    const pinnedDeps = this.pinDependencies(pkg.dependencies, workspaceVersion);

    // Sort dependencies alphabetically
    const sortedDeps: Record<string, string> = {};
    for (const name of Object.keys(pinnedDeps).sort()) {
      sortedDeps[name] = pinnedDeps[name];
    }

    // Pin devDependencies if includeDevDeps is true
    let sortedDevDeps: Record<string, string> | undefined;
    if (options.includeDevDeps && pkg.devDependencies) {
      const pinnedDevDeps = this.pinDependencies(pkg.devDependencies, workspaceVersion);
      sortedDevDeps = {};
      for (const name of Object.keys(pinnedDevDeps).sort()) {
        sortedDevDeps[name] = pinnedDevDeps[name];
      }
    }

    // Create output package.json
    const output: PackageJson = {
      ...pkg,
      dependencies: sortedDeps,
    };

    // Set or remove devDependencies based on includeDevDeps option
    if (sortedDevDeps) {
      output.devDependencies = sortedDevDeps;
    } else if (!options.includeDevDeps) {
      delete (output as { devDependencies?: unknown }).devDependencies;
    }

    return output;
  }
}

/**
 * Get the dependencies of a specific package from the lockfile
 * @param packageName - Name of the package (e.g., "@adviser/cement")
 * @param lockfilePath - Path to the directory containing pnpm-lock.yaml
 * @returns Package dependencies information or null if not found
 */
export async function getPackageDependencies(packageName: string, lockfilePath: string): Promise<PackageDependencies | null> {
  const projectDir = lockfilePath.replace(/\/[^/]+$/, "");
  const lockfile = await readWantedLockfile(projectDir, { ignoreIncompatible: false });

  if (!lockfile?.packages) {
    throw new Error(`No lockfile found at ${lockfilePath}`);
  }

  // Find the package in the lockfile
  // Key format examples:
  // - "/@adviser/cement@0.5.2"
  // - "/@adviser/cement@0.5.2(typescript@5.9.3)"
  for (const [key, pkgInfo] of Object.entries(lockfile.packages)) {
    const match = key.match(/^\/(@?[^@]+)@(.+?)(?:\(|$)/);
    if (match) {
      const [, name, version] = match;
      if (name === packageName) {
        return {
          name,
          version,
          dependencies: pkgInfo.dependencies || {},
          peerDependencies: pkgInfo.peerDependencies || {},
          transitivePeerDependencies: pkgInfo.transitivePeerDependencies || [],
        };
      }
    }
  }

  return null;
}

/**
 * Get all transitive dependencies recursively for a package
 * @param packageName - Name of the package
 * @param lockfilePath - Path to the directory containing pnpm-lock.yaml
 * @param depth - Maximum depth to traverse (default: Infinity)
 * @returns Map of package name to version
 */
export async function getAllTransitiveDependencies(
  packageName: string,
  lockfilePath: string,
  depth = Infinity,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const visited = new Set<string>();

  async function traverse(pkgName: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(pkgName)) {
      return;
    }
    visited.add(pkgName);

    const pkgInfo = await getPackageDependencies(pkgName, lockfilePath);
    if (!pkgInfo) {
      return;
    }

    result.set(pkgName, pkgInfo.version);

    // Traverse dependencies
    for (const [depName] of Object.entries(pkgInfo.dependencies)) {
      await traverse(depName, currentDepth + 1);
    }
  }

  await traverse(packageName, 0);
  return result;
}
