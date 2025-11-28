import { expect, it, describe, beforeAll } from "vitest";
import { VersionPinner } from "./version-pinner.js";
import { PackageJson } from "./build-cmd.js";
import { findUp } from "find-up";
import { $ } from "zx";

// Helper to get installed version from pnpm list
async function getInstalledVersion(packageName: string): Promise<string> {
  // eslint-disable-next-line no-restricted-globals
  const curFileDirectory = new URL(".", import.meta.url).pathname;
  const result = await $`cd ${curFileDirectory} && pnpm list ${packageName} --depth 1 --json`.quiet();
  const json = JSON.parse(result.stdout);
  const version = json[0]?.dependencies?.[packageName]?.version || json[0]?.devDependencies?.[packageName]?.version;
  if (!version) {
    throw new Error(`Could not find installed version for ${packageName}`);
  }
  return version;
}

// Template for test package.json
const pkgTemplate: PackageJson = {
  name: "@fireproof/test-package",
  version: "1.0.0",
  license: "MIT",
  scripts: {},
  exports: {},
  dependencies: {},
  devDependencies: {},
};

describe("VersionPinner", () => {
  let pinner: VersionPinner;
  let cmdTsVersion: string;
  let semverVersion: string;
  let multiformatsVersion: string;

  beforeAll(async () => {
    const lockfilePath = await findUp("pnpm-lock.yaml");
    if (!lockfilePath) {
      throw new Error("Could not find pnpm-lock.yaml");
    }

    pinner = await VersionPinner.create({ lockfilePath });

    // Get actual installed versions from pnpm
    cmdTsVersion = await getInstalledVersion("cmd-ts");
    semverVersion = await getInstalledVersion("semver");
    multiformatsVersion = await getInstalledVersion("multiformats");
  });

  describe("pinVersions", () => {
    it("should pin unpinned dependencies with caret (^)", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          "cmd-ts": `^${cmdTsVersion}`,
        },
      };

      const result = pinner.pinVersions(pkg);

      // Should pin the version
      expect(result.dependencies["cmd-ts"]).toBe(cmdTsVersion);
    });

    it("should pin unpinned dependencies with tilde (~)", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          semver: `~${semverVersion}`,
        },
      };

      const result = pinner.pinVersions(pkg);

      // Should pin the version
      expect(result.dependencies["semver"]).toBe(semverVersion);
    });

    it("should pin unpinned dependencies with asterisk (*)", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          multiformats: "*",
        },
      };

      const result = pinner.pinVersions(pkg);

      // Should pin to the version from lockfile
      expect(result.dependencies["multiformats"]).toBe(multiformatsVersion);
    });

    it("should keep already pinned versions as-is", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          "cmd-ts": cmdTsVersion,
          semver: semverVersion,
        },
      };

      const result = pinner.pinVersions(pkg);

      // Should keep already pinned versions unchanged
      expect(result.dependencies["cmd-ts"]).toBe(cmdTsVersion);
      expect(result.dependencies["semver"]).toBe(semverVersion);
    });

    it("should keep pinned versions as-is without looking in lockfile", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          "fake-package": "1.2.3",
          "another-fake": "4.5.6",
        },
      };

      const result = pinner.pinVersions(pkg);

      // Should keep pinned versions even if they don't exist in lockfile
      expect(result.dependencies["fake-package"]).toBe("1.2.3");
      expect(result.dependencies["another-fake"]).toBe("4.5.6");
    });

    it("should replace workspace: dependencies with package version", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          "@fireproof/vendor": "workspace:0.0.0",
          "@fireproof/core": "workspace:*",
        },
      };

      const result = pinner.pinVersions(pkg);

      // Should replace workspace: with package version
      expect(result.dependencies["@fireproof/vendor"]).toBe("1.0.0");
      expect(result.dependencies["@fireproof/core"]).toBe("1.0.0");
    });

    it("should not include transitive dependencies", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          "cmd-ts": `^${cmdTsVersion}`,
        },
      };

      const result = pinner.pinVersions(pkg);

      // Only cmd-ts should be in the result, not its transitive dependencies
      expect(Object.keys(result.dependencies)).toEqual(["cmd-ts"]);
      expect(result.dependencies["cmd-ts"]).toBe(cmdTsVersion);
    });

    it("should sort dependencies alphabetically", async () => {
      const zxVersion = await getInstalledVersion("zx");

      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          zx: `^${zxVersion}`,
          semver: `^${semverVersion}`,
          "cmd-ts": `^${cmdTsVersion}`,
          multiformats: `^${multiformatsVersion}`,
        },
      };

      const result = pinner.pinVersions(pkg);

      // Dependencies should be sorted alphabetically
      const keys = Object.keys(result.dependencies);
      expect(keys).toEqual(["cmd-ts", "multiformats", "semver", "zx"]);
    });

    it("should handle mixed pinned and unpinned dependencies", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        version: "2.0.0",
        dependencies: {
          "cmd-ts": cmdTsVersion, // already pinned
          semver: `^${semverVersion}`, // needs pinning
          "@fireproof/vendor": "workspace:0.0.0", // workspace
          multiformats: `~${multiformatsVersion}`, // needs pinning
        },
      };

      const result = pinner.pinVersions(pkg);

      expect(result.dependencies["cmd-ts"]).toBe(cmdTsVersion); // kept as-is
      expect(result.dependencies["semver"]).toBe(semverVersion); // pinned
      expect(result.dependencies["@fireproof/vendor"]).toBe("2.0.0"); // workspace replaced
      expect(result.dependencies["multiformats"]).toBe(multiformatsVersion); // pinned
    });

    it("should remove devDependencies by default", async () => {
      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          "cmd-ts": `^${cmdTsVersion}`,
        },
        devDependencies: {
          vitest: "^4.0.8",
        },
      };

      const result = pinner.pinVersions(pkg);

      expect(result.devDependencies).toBeUndefined();
    });

    it("should pin devDependencies when includeDevDeps option is true", async () => {
      const vitestVersion = await getInstalledVersion("vitest");

      const pkg: PackageJson = {
        ...pkgTemplate,
        dependencies: {
          "cmd-ts": `^${cmdTsVersion}`,
        },
        devDependencies: {
          vitest: `^${vitestVersion}`,
        },
      };

      const result = pinner.pinVersions(pkg, { includeDevDeps: true });

      expect(result.devDependencies).toBeDefined();
      // devDependencies should also be pinned
      expect(result.devDependencies?.vitest).toBe(vitestVersion);
    });
  });

  describe("VersionPinner.create", () => {
    it("should create instance with explicit lockfile path", async () => {
      const lockfilePath = await findUp("pnpm-lock.yaml");
      if (!lockfilePath) {
        throw new Error("Could not find pnpm-lock.yaml");
      }

      const pinner = await VersionPinner.create({ lockfilePath });
      expect(pinner).toBeInstanceOf(VersionPinner);
    });

    it("should create instance with auto-discovered lockfile", async () => {
      const pinner = await VersionPinner.create();
      expect(pinner).toBeInstanceOf(VersionPinner);
    });

    it("should throw error if lockfile not found with explicit path", async () => {
      await expect(VersionPinner.create({ lockfilePath: "/non/existent/pnpm-lock.yaml" })).rejects.toThrow("No lockfile found");
    });
  });

  describe("VersionPinner.fromLockfilePath", () => {
    it("should create instance from lockfile path", async () => {
      const lockfilePath = await findUp("pnpm-lock.yaml");
      if (!lockfilePath) {
        throw new Error("Could not find pnpm-lock.yaml");
      }

      const pinner = await VersionPinner.fromLockfilePath(lockfilePath);
      expect(pinner).toBeInstanceOf(VersionPinner);
    });

    it("should throw error if lockfile does not exist", async () => {
      await expect(VersionPinner.fromLockfilePath("/non/existent/pnpm-lock.yaml")).rejects.toThrow("No lockfile found");
    });
  });
});
