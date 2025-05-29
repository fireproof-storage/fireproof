# Refactoring ensureURIDefaults for `public: true`

## Task Goal

The primary objective is to fully implement the `public: true` feature. This involves:
1.  Refactoring the `ensureURIDefaults` function in `src/utils.ts` so that when `public: true` is specified in its options and no explicit `storeKey` is provided, it sets the `storeKey` to `'insecure'`.
2.  Ensuring that the `public` status, typically originating from `Database` `ConfigOpts`, is propagated through `toStoreURIRuntime` in `src/ledger.ts`.
3.  This propagation will ensure that `ensureURIDefaults` receives the correct `public` flag for all URIs generated for a database's ledger and its indexes, leading to a consistent "no crypto" state for public databases.
This refactoring aims to minimize overall code changes where possible and ensure all relevant tests pass.

## Current Progress

1.  **`ensureURIDefaults` Refactoring (`src/utils.ts`):**
    *   The function signature was changed to accept an `opts` parameter. This parameter can be a `CoerceURI` directly, or an object of the shape `{ uri?: CoerceURI; public?: boolean; storeKey?: string | null }`.
    *   Logic has been implemented to handle the `opts` object:
        *   If `opts.public` is `true` and `opts.storeKey` is not explicitly provided, the function currently results in `storeKey` being `undefined` (this needs to be changed to `'insecure'`).
        *   If `opts.storeKey` is provided as a string, that value is used.
        *   If `opts.storeKey` is `null`, the `storeKey` parameter is removed from the URI.
        *   If `opts.public` is `false` (or undefined) and `opts.storeKey` is not provided, a default `storeKey` is generated (e.g., `@dbName-data@`).
    *   Environment variable parameters (`FP_VERSION`, `FP_URL_GEN_RUNTIME`) are conditionally added.
    *   Corrected import and usage of `param.OPTIONAL` from `@adviser/cement`.

2.  **Caller Update (`src/ledger.ts`):**
    *   The `toStoreURIRuntime` function, a primary caller of `ensureURIDefaults`, has been updated. Its calls to `ensureURIDefaults` now wrap the URI argument in the new `{ uri: ... }` structure. The `public` flag is not currently passed through `toStoreURIRuntime`.

3.  **Linting:**
    *   `src/utils.ts` and `src/ledger.ts` are currently lint-free after the changes.

4.  **Testing (`tests/utils.test.ts`):**
    *   A targeted run of `pnpm test utils.test.ts` shows **9 failing tests** related to `ensureURIDefaults`.
    *   Key failures include:
        *   `AssertionError: expected undefined to be 'insecure'`: This occurs in tests where `opts.public` is true. The current implementation results in `storeKey` being `undefined`, but the tests (and desired behavior) expect it to be the string `'insecure'`.
        *   `AssertionError: expected false to be true`: This relates to `resultUri.pathname.startsWith(optsCuri.pathname)`, indicating an issue with how the base URI's path is being preserved or modified.

## Implementation Next Steps

1.  **Address Test Failures in `utils.test.ts` (Focus on `ensureURIDefaults` direct behavior):**
    *   **`storeKey` for `public: true`:**
        *   **Desired Behavior Confirmed:** When `opts.public` is `true` and no explicit `opts.storeKey` is provided, `PARAM.STORE_KEY` should be set to `'insecure'`.
        *   **Action:** Modify `ensureURIDefaults` in `src/utils.ts` to set `builder.setParam(PARAM.STORE_KEY, 'insecure')` when `isPublic` is true and `explicitStoreKey` is `undefined`.
    *   **Pathname Mismatch (`pathname.startsWith` failure):**
        *   Investigate why the pathname of the resulting URI is not matching the expectation when `opts.uri` is provided. Check how `URIBuilder` handles path construction from a base URI and parameters.
    *   **Iterate on Fixes:**
        *   Modify `src/utils.ts` based on the decisions above.
        *   Re-run `pnpm test utils.test.ts` to verify fixes.

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
