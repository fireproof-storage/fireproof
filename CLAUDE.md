# Fireproof Development Guide

## Development Workflow

Always run after making changes:
```bash
pnpm check
```

This command runs formatting, linting, tests, and build to ensure code quality.

## Workspace Layout

This is a pnpm monorepo with packages organized as follows:

### Core Packages (`core/`)
- **`core/base/`** - Core database logic (CRDT, indexing, querying)  
  - Tests: `tests/fireproof/` (database.test.ts, crdt.test.ts, etc.)
- **`core/blockstore/`** - Storage layer (transactions, loaders, connections)
  - Tests: `tests/blockstore/` (store.test.ts, transaction.test.ts, etc.)
- **`core/runtime/`** - Runtime utilities (crypto, file handling, task management)
  - Tests: `tests/runtime/` (key-bag.test.ts, etc.)
- **`core/gateways/`** - Storage adapters for different environments:
  - `indexeddb/` - Browser IndexedDB storage
  - `file/`, `file-node/`, `file-deno/` - File system storage  
  - `memory/` - In-memory storage
  - `cloud/` - Cloud/remote storage
  - Tests: `tests/gateway/`
- **`core/types/`** - TypeScript type definitions
- **`core/protocols/`** - Communication protocols (dashboard, cloud sync)

### React Integration (`use-fireproof/`)
- **`use-fireproof/react/`** - React hooks (useFireproof, useDocument, useLiveQuery)
- **`use-fireproof/tests/`** - React component tests

### Applications  
- **`dashboard/`** - Web dashboard for managing Fireproof instances
- **`cloud/`** - Cloud backend services
- **`examples/`** - Example applications

### Test Organization
- **`tests/`** - Main test suite (core functionality)
- **`use-fireproof/tests/`** - React-specific tests  
- **`smoke/`** - Integration tests for different environments
- **`tests/__screenshots__/`** - Visual regression test snapshots

## Release Process

### Creating a New Release

To release a new version of Fireproof packages (`@fireproof/core` and `use-fireproof`), simply create and push a git tag with the format `core@v<version>`:

```bash
git tag -a core@v0.23.0 -m "Release v0.23.0"
git push origin core@v0.23.0
```

### What Happens Automatically

The GitHub Actions workflow `.github/workflows/ci-core-publish.yaml` will automatically:

1. **Trigger** on any tag matching `core@*`
2. **Build** the packages using the existing build system
3. **Extract** the version from the tag (e.g., `v0.23.0` → `0.23.0`)
4. **Publish** both packages to npm:
   - `@fireproof/core@0.23.0`
   - `use-fireproof@0.23.0`

### Recent Release Examples

- `core@v0.22.0-keybag` → Published as `0.22.0-keybag`
- `core@v0.22.0-dev-preview-4` → Published as `0.22.0-dev-preview-4`
- `core@v0.22.0-dev-preview-3` → Published as `0.22.0-dev-preview-3`

### Monitoring Release Status

Check the GitHub Actions tab to monitor the release progress:
```bash
gh run list --limit 10
```

The release is successful when you see a "completed success" status for the `@fireproof/core-publish` workflow.

### Version History

Current npm versions can be checked with:
```bash
npm view @fireproof/core versions --json
npm view use-fireproof versions --json
```