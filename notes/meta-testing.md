# Meta Corruption Investigation - Key Changes Analysis

## Critical Changes to Bring Over

### 1. **Enhanced Logging Infrastructure** (Essential for debugging)
- `core/blockstore/loader.ts`: Extensive debug logging for CarLog state tracking, merge operations, and network requests
- `core/base/crdt-clock.ts`: Enhanced logging for block validation, head processing, and queue operations
- `core/gateways/memory/gateway.ts`: Complete rewrite to envelope-based system with detailed logging

### 2. **KeyBag API Changes** (Required for test compatibility)
- `core/keybag/key-bag.ts`: Major API refactor from `KeyBag.create()` to `new KeyBag()` constructor
- `core/tests/runtime/meta-key-hack.test.ts`: Updated test using new KeyBag API and additional types

### 3. **Gateway System Overhaul** (Core to meta corruption investigation)
- `core/gateways/memory/gateway.ts`: Switched from `Uint8Array` to envelope-based (`FPEnvelope<T>`) storage
- This change likely relates to the "Not a Uint8Array" error we saw in the failing tests

### 4. **Investigation-Specific Test Changes**
- `core/tests/fireproof/attachable-subscription.test.ts`: Extensive subscription behavior investigation with detailed documentation

## Root Cause Analysis

The meta corruption appears to stem from:
1. **Data Format Changes**: Gateway system moved from raw `Uint8Array` to structured `FPEnvelope<T>` format
2. **API Breaking Changes**: KeyBag constructor pattern changed, breaking existing tests
3. **Race Conditions**: Enhanced logging suggests investigation of timing issues in meta synchronization

## Recommended Approach

### Phase 1: Core Infrastructure (Required)
1. Bring over the enhanced logging system from loader.ts and crdt-clock.ts
2. Update KeyBag API to use new constructor pattern
3. Implement envelope-based MemoryGateway system

### Phase 2: Test Compatibility (Required)
1. Update meta-key-hack.test.ts to use new KeyBag API
2. Fix test to handle envelope-based data format instead of raw Uint8Array

### Phase 3: Investigation Tools (Optional)
1. Bring over detailed subscription investigation tests
2. Add race condition debugging infrastructure

## Risk Assessment
- **High**: Core gateway changes affect all storage operations
- **Medium**: KeyBag API changes require extensive test updates
- **Low**: Enhanced logging is additive and safe

## Expected Outcome
This will provide the tools needed to debug the meta corruption issue while maintaining compatibility with the investigation branch's test suite.

## Current Status
- **Current Branch**: `next` (clean baseline from `mabels/deps-20250918`)
- **Investigation Branch**: `mabels/meta-corruption` (has failing tests but extensive debugging infrastructure)
- **Key Issue**: Meta tests fail with "Not a Uint8Array" error on investigation branch
- **Test Results**: Meta tests pass on clean branch but fail when trying to use investigation branch test file

## Next Steps
1. Decide which changes to cherry-pick from investigation branch
2. Start with minimal KeyBag API fix to get tests working
3. Gradually add logging infrastructure as needed
4. Investigate the envelope vs Uint8Array format issue