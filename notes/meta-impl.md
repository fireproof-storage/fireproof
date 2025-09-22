# Meta Corruption Branch - Implementation Analysis

## Branch Overview

- **Branch**: `mabels/meta-corruption`
- **Latest Commit**: `63bf7583` - "wip: store all changes [skip ci]"
- **Key Investigation Commits**:
  - `bd19ef5b` - feat: enable block validation and enhance logging for CRDT sync operations
  - `54d2b779` - feat: add debug logging and assertions for CID validation in blockstore operations
  - `9289c676` - WIP: Enhanced logging for meta-corruption race condition investigation

## Core Implementation Changes

### 1. **FP Envelope System** (`core/types/blockstore/fp-envelope.ts`)

- **Added**: Subscription support with `FPEnvelopeSubscriptions`
- **Added**: Type guard functions (`isFPEnvelopeCar`, `isFPEnvelopeFile`, `isFPEnvelopeMeta`, `isFPEnvelopeWAL`)
- **Added**: `isFPEnvelopeBlob` for unified blob handling
- **Purpose**: Structured data format replacing raw `Uint8Array`

### 2. **Memory Gateway Overhaul** (`core/gateways/memory/gateway.ts`)

- **Changed**: Storage from `Map<string, Uint8Array>` to `Map<string, FPEnvelope<unknown>>`
- **Added**: Built-in subscription system with callback management
- **Added**: Detailed logging for all operations (put-car, put-meta, put-wal, get operations)
- **Added**: `getPlain()` method with envelope-to-bytes conversion
- **Critical**: This is likely the root cause of the "Not a Uint8Array" error

### 3. **KeyBag API Changes** (`core/keybag/key-bag.ts`)

- **Changed**: Constructor from `await KeyBag.create(rt)` to `new KeyBag(rt)`
- **Changed**: Method signatures - `upsert(key, { def: false })` becomes `upsert(key, false)`
- **Changed**: `asV2StorageKeyItem()` becomes `asV2KeysItem()`
- **Added**: Complete rewrite with fingerprint-based key management

### 4. **Enhanced Logging Infrastructure**

#### Loader (`core/blockstore/loader.ts`)

- **Added**: CarLog state tracking before/after merge operations
- **Added**: Network request/response logging for CAR loading
- **Added**: CID validation logging with prefix checks
- **Added**: LoaderCarContent debug logging for loaded blocks
- **Changed**: `this.currentMeta` to `this.XXXcurrentMeta` (debugging marker)

#### CRDT Clock (`core/base/crdt-clock.ts`)

- **Added**: Pre/post applyMeta logging with head state
- **Added**: Block validation error details with CID information
- **Added**: Queue processing debug information
- **Added**: CarLog state logging before block validation

#### CRDT (`core/base/crdt.ts`)

- **Added**: Detailed applyMeta logging with incoming vs current head comparison
- **Added**: Blockstore ready state progression logging

### 5. **Meta Key Hack Changes** (`core/gateways/base/meta-key-hack.ts`)

- **Fixed**: KeyBag API compatibility (`{ def: false }` → `false`)
- **Fixed**: Method name changes (`asV2StorageKeyItem()` → `asV2KeysItem()`)
- **Changed**: Constructor parameter from `Gateway` to `SerdeGateway`

### 6. **Database Error Handling** (`core/base/database.ts`)

- **Added**: Better error differentiation in `get()` method
- **Added**: `isNotFoundError()` check to avoid double-wrapping exceptions

### 7. **Test Updates** (`core/tests/fireproof/attachable-subscription.test.ts`)

- **Changed**: Store key from `"@fireproof:attach@"` to `"insecure"`
- **Reduced**: Database count from 2 to 1 for focused testing
- **Added**: Debug assertion `expect(res.rows).toEqual({})` (appears to be debugging code)

## Key Issues Identified

### The "Not a Uint8Array" Problem

The root cause appears to be in the MemoryGateway changes:

1. **Old System**:
   - Stored raw `Uint8Array` data
   - `get()` returned `Uint8Array` directly
   - Tests could call `txt.decode(rawBytes)`

2. **New System**:
   - Stores structured `FPEnvelope<T>` objects
   - `get()` returns envelope with `.payload` property
   - Tests now need to call `txt.decode(envelope.payload)`

### Test Compatibility Break

The meta-key-hack.test.ts expects:

```typescript
const rGet = await memGw.get(rUrl.Ok(), sthis);
const metas = JSON.parse(ctx.loader.sthis.txt.decode(rGet.Ok())); // ❌ Fails - rGet.Ok() is envelope
```

Should be:

```typescript
const rGet = await memGw.get<Uint8Array>(ctx, rUrl.Ok());
const metas = JSON.parse(ctx.loader.sthis.txt.decode(rGet.Ok().payload)); // ✅ Correct
```

## Implementation Strategy

### Phase 1: Core Infrastructure

1. Implement envelope system with type guards
2. Update MemoryGateway to envelope-based storage
3. Add subscription management infrastructure

### Phase 2: KeyBag Compatibility

1. Implement new KeyBag constructor pattern
2. Update method signatures and return types
3. Fix meta-key-hack gateway integration

### Phase 3: Enhanced Logging

1. Add detailed CarLog state tracking in loader
2. Implement CRDT clock debug logging
3. Add network request/response logging

### Phase 4: Test Updates

1. Update meta-key-hack.test.ts for envelope format
2. Fix API calls to use new KeyBag pattern
3. Add SerdeGatewayCtx parameter where needed

## Risk Assessment

- **Critical**: MemoryGateway changes affect all in-memory testing
- **High**: KeyBag API changes require extensive updates
- **Medium**: Logging changes are mostly additive but may affect performance
- **Low**: Test updates are isolated to specific test files
