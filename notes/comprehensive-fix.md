# Comprehensive Fix: React Hooks

## Background

The React Hooks implementation in Fireproof violates the Rules of Hooks because hook implementation functions are created during render, breaking stable hook identity. This causes test failures and potential race conditions with async operations in the returned handler functions.

## Objectives

1. Fix the React hooks implementation to:
   - Follow React's Rules of Hooks
   - Maintain stable identities across renders
2. **Guarantee complete public API compatibility** for existing applications.
3. Eliminate the `save`/`reset` race condition naturally.
4. Ensure all existing tests pass without new React warnings or errors.
5. Keep code quality: formatting, linting, tests, CI.

## Architecture Overview

1. **Module-Level Hook Implementations**:
   - `useFireproofDocument<T>(database, initialDoc)`
   - `useFireproofQuery<T>(database, mapFn, query, initialRows)`
2. **Hook Factory**:
   - `createFireproofHooks(database)` returns `{ useDocument, useLiveQuery, ... }`
3. **Maintaining Existing API**:
   - All current exports will be preserved for backward compatibility
   - `createUseDocument`, `createUseLiveQuery`, etc. remain unchanged from a consumer perspective
4. **New Public API Hook** (additive, not replacing):
   ```ts
   export function useFireproof(name = "default", config = {}) {
     const database = useFireproofDatabase(name, config);
     const hooks = useMemo(() => createFireproofHooks(database), [database]);
     return { database, ...hooks };
   }
   ```
5. **Tests** will primarily continue to use existing API imports, with new tests demonstrating the additional API.

## Implementation Steps

### Phase 1: Core Refactor (Maintaining API Compatibility)

1. Extract `useFireproofDocument` from current `createUseDocument` into its own file.
2. Change `createUseDocument` to a thin wrapper that calls `useFireproofDocument(database, initialDoc)`, ensuring it returns exactly the same API shape.
3. Ensure all hook calls are at the top level of `useFireproofDocument`.
4. Verify that all existing exports maintain the same signatures and behavior.

### Phase 2: Hook Factory & Public API (Additive Only)

1. Implement `createFireproofHooks(database)` in module scope.
2. Create `useFireproof` as an additional API option, not replacing existing patterns.
3. Ensure all existing API entry points remain fully functional.

### Phase 3: Tests & Compatibility

1. Audit existing tests to ensure they still work with existing imports.
2. Add new tests for the additional `useFireproof` API while maintaining original tests.
3. Run tests and fix any failures, ensuring backward compatibility.
4. Verify the public API by testing actual consumer use cases where possible.

### Phase 4: Quality Assurance

1. Run `pnpm format --write` and `pnpm format --check`.
2. Run `pnpm run lint` and resolve issues.
3. Run `pnpm run test` and ensure 0 failures.
4. Run `pnpm run build` to verify production build.

## CI Integration

- Ensure CI runs `pnpm format --check`, `pnpm run lint`, `pnpm run test`, and `pnpm run build`.
- No React warnings/errors permitted.

## Risks & Mitigations

- **API Compatibility**: Maintain 100% backward compatibility with the existing API. No deprecation needed since no API will be removed.
- **Test Integrity**: Keep existing tests as-is to verify compatibility, add new tests for the improved patterns.
- **Unknown Side Effects**: Manual smoke tests in sample apps using both existing and new patterns.
- **Documentation**: Update documentation to show both patterns, emphasizing that existing code will continue to work without changes.

---

**Next Steps**: Execute Phase 1 and validate local development tests before proceeding.
