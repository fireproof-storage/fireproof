# Quick-Silver Session Log

## Session 2026-02-21

### What was built
New offline database in `core/quick-silver/` implementing the Fireproof `Database` interface from scratch.

### Files created
- `fireproof.ts` — `fireproof(name, opts?)` factory, singleton per name via `KeyedResolvOnce<Database>`
- `quick-silver.ts` — `QuickSilver` class implementing `Database`
- `types.ts` — `QSConfigOpts { sthis?: SuperThis }`
- `envelope.ts` — arktype schemas `QCDoc`, `QCFile`, `QCEnvelope` + type guards `isQCDoc/isQCFile/isQCEnvelope`
- `fireproof.test.ts` — 12 passing tests
- `package.json` — dependencies: `@adviser/cement`, `@fireproof/core-runtime`, `@fireproof/core-gateways-indexeddb`, `@fireproof/core-types-base`, `arktype`

### Key decisions
- `_baseURL` bakes in `PARAM.STORE = "file"` and `PARAM.NAME` — do NOT add at call sites
- `ready = Lazy(...)` — memoized start, called internally, not required by user
- `onClosed = OnFunc<() => void>()` — field IS callable to register listeners; `close()` calls `.invoke()`
- `bulk` builds `QCDoc` + `QCFile` envelopes, puts via `IndexedDBGateway`, fires `_updateListeners` / `_noUpdateListeners`
- `put` delegates to `bulk([doc])`
- `del` calls `gateway.delete(url)`, `remove` is alias
- `compact` is no-op

### Changes to core packages
- `core/types/base/types.ts` — added `Ende`, `EndeJson`, `EndeCbor` interfaces; added `readonly ende: Ende` to `SuperThis`
- `core/runtime/utils.ts` — implemented `ende` in `SuperThisImpl` using `cborg` + `this.txt`; `decode*` wrapped in `exception2Result`

### Status: 12 tests passing

### TODO next session
- `changes`
- `allDocs` / `allDocuments`
- `query`
- Real file bytes in `QCFile` (currently `new Uint8Array()` placeholder)
- `databasesByName.unget(name)` on close/destroy so instances can be re-created
- `clone()` in `SuperThisImpl` needs `ende` wired in
