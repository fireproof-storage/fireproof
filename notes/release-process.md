# Release Process Overview

## Tag-Driven Automation

- Creating a git tag that matches `core@*` triggers the `@fireproof/core-publish` workflow.
  - The workflow checks out the repo and runs the shared `./actions/base` composite action (install, lint, build, test, Deno tests, smoke tests) before publishing.
  - Environment selection (dev / staging / production) is inferred from the tag prefix (`core@s…`, `core@p…`).
- Tagging `core-cf@*` runs the Cloudflare deployment workflow for the backend.
- Tagging `dashboard@*` kicks off the dashboard build and deploy workflow, reusing the dashboard composites.

## Package Rebuild & Publish

- `./actions/core-publish` verifies the signed tag, installs the npm token, and invokes `pnpm run publish --registry https://registry.npmjs.org/`.
- The root `package.json` wires `prepack`/`prepublish` to `core-cli build --prepare-version`, which writes the resolved version (derived from `GITHUB_REF`) into `dist/fp-version.txt`.
- Each workspace package exposes a `publish` script that calls `core-cli build`, ensuring every package.json is regenerated just-in-time:
  - copies sources to `dist/jsr`, patches the manifest with the computed version, rewrites any `workspace:` dependency ranges, drops `pack`/`publish` scripts, and mirrors artifacts into `dist/npm`.
  - executes the package build from the clean directory and publishes directly via `pnpm publish --access public --no-git-checks`, using the npmrc prepared by the action.
- Shared assets (`README.md`, `LICENSE.md`, `tsconfig` adjustments) are copied into the release directory so published tarballs are self-contained.

## Practical Steps

1. Prepare and sign a tag (`core@vX.Y.Z`, `core-cf@s...`, `dashboard@p...`, etc.).
2. Push the tag to GitHub; the corresponding workflow will run automatically.
3. Monitor the workflow run to confirm tests, rebuild, and publish/deploy complete successfully.
