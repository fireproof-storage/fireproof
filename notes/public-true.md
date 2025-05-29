# Refactoring ensureURIDefaults for `public: true`

## Task Goal

The primary objective is to fully implement the `public: true` feature. This involves:
1.  Refactoring the `ensureURIDefaults` function in `src/utils.ts` so that when `public: true` is specified in its options and no explicit `storeKey` is provided, it sets the `storeKey` to `'insecure'`.
2.  Ensuring that the `public` status, typically originating from `Database` `ConfigOpts`, is propagated through `toStoreURIRuntime` in `src/ledger.ts`.
3.  This propagation will ensure that `ensureURIDefaults` receives the correct `public` flag for all URIs generated for a database's ledger and its indexes, leading to a consistent "no crypto" state for public databases.
This refactoring aims to minimize overall code changes where possible and ensure all relevant tests pass.

## Current Progress

1.  **`ensureURIDefaults` Refactoring (`src/utils.ts`):**
    *   The import for a local `./uri` module (which was causing "Cannot find module" errors) has been removed. The code now relies on `URI` and its builder pattern from `@adviser/cement`.
    *   The explicit `Builder` type annotation in `ensureURIDefaults` is now technically incorrect (as `Builder` was from the removed import) and should be removed or adjusted to align with the type returned by `@adviser/cement`'s `URI.build()`. However, JavaScript execution proceeds as the builder object has the necessary methods.
    *   The function signature accepts an `opts` parameter: `CoerceURI` or `{ uri?: CoerceURI; public?: boolean; storeKey?: string | null }`.
    *   Logic handles `opts`:
        *   If `opts.public` is `true` and `opts.storeKey` is not explicitly provided, `storeKey` is currently set to `'insecure'`.
        *   If `opts.storeKey` is a string, it's used.
        *   If `opts.storeKey` is `null`, the `storeKey` parameter is removed.
        *   If `opts.public` is `false` (or undefined) and `opts.storeKey` is not provided, a default `storeKey` is generated.

2.  **Caller Update (`src/ledger.ts`):**
    *   `toStoreURIRuntime` calls `ensureURIDefaults` with the `{ uri: ... }` structure. The `public` flag is not yet passed through.

3.  **Linting:**
    *   `src/utils.ts` (excluding the `Builder` type annotation) and `src/ledger.ts` are expected to be lint-free.

4.  **Testing (`tests/utils.test.ts`):**
    *   A targeted run of `pnpm test utils.test.ts` now shows **3 failing tests** (down from 9).
    *   The consistent failure is: `AssertionError: expected false to be true` related to `resultUri.pathname.startsWith(optsCuri.pathname)`. This indicates the primary remaining issue: the base URI's path is not correctly preserved when `opts.uri` is provided.

## Implementation Next Steps

1.  **Address Remaining Test Failures in `utils.test.ts`:**
    *   **Pathname Mismatch (`pathname.startsWith` failure):**
        *   **Focus:** This is the primary blocker. Investigate how `URI.build()` (from `@adviser/cement`) and subsequent parameter settings in `ensureURIDefaults` affect the `pathname` when `baseUriSource` is derived from `opts.uri`. Ensure the original pathname from `opts.uri` is the basis for the resulting URI's pathname.
    *   **Cleanup `Builder` Type:** Remove or correct the explicit `Builder` type annotation in `ensureURIDefaults` in `src/utils.ts` to align with TypeScript best practices and the actual type returned by `@adviser/cement`'s `URI.build()`.
    *   **Iterate on Fixes:**
        *   Modify `src/utils.ts`.
        *   Re-run `pnpm test utils.test.ts`.

2.  **Implement `public` Flag Propagation:**
    *   **Modify `toStoreURIRuntime` (`src/ledger.ts`):**
        *   Change its signature to accept a `public` status flag (e.g., `dbIsPublic?: boolean`).
        *   When calling `ensureURIDefaults` internally for data and index URIs, pass this `public` flag in the `opts` object.
    *   **Update Callers of `toStoreURIRuntime`:**
        *   Identify where `toStoreURIRuntime` is called (likely within `Ledger` class or database setup).
        *   Modify these call sites to pass the `public` status from the `Database`'s configuration.
    *   **Testing:** Add or update tests to verify that setting `public: true` on a `Database` correctly results in `'insecure'` storeKeys for its ledger and index URIs.

3.  **Full Test Suite Verification:**
    *   Once `utils.test.ts` (for direct `ensureURIDefaults` behavior) and new/updated tests (for propagation) pass, run the full `pnpm test` suite.
    *   If the "0 tests passed" issue (from the initial full run) reappears, investigate `vite.config.ts` or other Vitest configurations for potential global test discovery or execution problems.
