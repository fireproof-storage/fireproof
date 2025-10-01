# Repository Guidelines

## Project Structure & Module Organization
- Core TypeScript sources live under `core/` (library modules) and `use-fireproof/` (React bindings); shared CLI tooling is in `cli/`.
- Cloud services reside in `cloud/` (D1 backend, third-party integrations), while the React dashboard sits in `dashboard/`.
- Tests are colocated in `core/tests/`, `use-fireproof/tests/`, and smoke scripts under `smoke/`. GitHub Actions for releases live in `.github/workflows/` with composite steps in `actions/`.

## Build, Test, and Development Commands
- `pnpm install` — hydrate the workspace (pnpm 10+, Node 22).
- `pnpm run build` — run `core-cli tsc` across packages.
- `pnpm check` - format, lint, build, and test code. always run before push.
- `pnpm run test` — execute Vitest unit suites; rerun automatically in CI on failure.
- `pnpm run test:deno` — Deno-based compatibility tests.
- `pnpm run smoke` / `pnpm run smoke-retry` — end-to-end smoke checks (Node, ESM, React variants).
- `pnpm run build:all` — aggregate package builds plus publish prep, used before tagged releases.

## Coding Style & Naming Conventions
- TypeScript/JavaScript with 2-space indentation, ES module syntax, and explicit exports.
- Maintain package-local naming: hooks as `useThing`, React components in `UpperCamelCase`, utilities in `lowerCamelCase`.
- Formatting via Prettier (`pnpm run format --check`); linting via ESLint (`pnpm run lint`). Fix issues before committing.

## Testing Guidelines
- Prefer `*.test.ts` files colocated with domain suites (see `core/tests/fireproof/`).
- Keep unit tests deterministic; reserve integration coverage for `smoke/` scripts or Playwright helpers in `actions/base`.
- When adding new runtime features, include Deno parity tests where applicable.

## Commit & Pull Request Guidelines
- Follow conventional commit prefixes observed in history (`docs:`, `chore(deps)`, `style:`). Keep subjects imperative and ≤72 chars.
- Pull requests should: describe scope and testing, link issues (e.g., `Fixes #123`), and include screenshots for dashboard/UI changes.
- Ensure CI (`@fireproof/core`) and relevant deploy workflows are green before requesting review.

## Automation & Releases
- Signed tags of the form `core@vX.Y.Z`, `core-cf@…`, or `dashboard@…` trigger the corresponding workflows.
- Before tagging, run `pnpm run build:all` and `pnpm run smoke`. CI will rebuild fresh manifests and publish via `core-cli`.
- Maintain `allowed_signers` for tag verification; ensure your SSH key appears before cutting a release.
