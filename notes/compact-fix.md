# Compaction Race Condition Fix

## Challenge Description

During concurrent writes and deletes in Fireproof databases, a race condition occurs in the auto-compaction process that leads to "missing block" errors. This happens when compaction runs while commits are still in-flight, causing block references to become invalid.

## Problem Manifestation

- **Error**: `missing block: bafyreig...` during database operations
- **Context**: Occurs during `allDocs()`, `query()`, and other read operations after heavy write/delete activity
- **Trigger**: Auto-compaction runs concurrently with ongoing commit operations

## Root Cause

The original compaction logic triggered immediately when the car log exceeded the `autoCompact` threshold:

```typescript
// Original problematic code
if (this.ebOpts.autoCompact && this.loader.carLog.length > this.ebOpts.autoCompact) {
  void (async () => {
    await this.compact(); // Runs immediately, racing with commits
  })();
}
```

This created a race condition where:
1. Multiple write operations are queued in the commit queue
2. Auto-compaction threshold is reached
3. Compaction starts immediately while commits are still processing
4. Block references become invalid due to concurrent modifications

## Solution Implemented

Added commit queue synchronization to ensure compaction waits for all in-flight commits:

```typescript
needsCompaction() {
  if (!this.inflightCompaction && this.ebOpts.autoCompact && this.loader.carLog.length > this.ebOpts.autoCompact) {
    this.inflightCompaction = true;
    // Wait until the commit queue is idle before triggering compaction
    this.loader.commitQueue
      .waitIdle()
      .then(() => this.compact())
      .catch((err) => {
        this.logger.Warn().Err(err).Msg("autoCompact scheduling failed");
      })
      .finally(() => {
        this.inflightCompaction = false;
      });
  }
}
```

## Test Strategy

Two complementary tests validate the fix:

### Conservative Test (`repro-blocks.process.test.ts`)
- **Purpose**: Verify basic functionality works correctly
- **Approach**: 10 sequential iterations with fresh database instances
- **Result**: ✅ Passes - confirms core fix works

### Stress Test (`repro-blocks.test.ts`)
- **Purpose**: Detect race conditions under heavy load
- **Approach**: 30 iterations on shared database instance with aggressive auto-compaction
- **Result**: ❌ Still failing - indicates additional edge cases remain

## Current Status

- ✅ Basic race condition fixed for simple scenarios
- ❌ Complex race conditions still occur under heavy concurrent load
- 🔄 Additional investigation needed for remaining edge cases

## Key Learnings

1. **Commit queue synchronization** is essential for safe auto-compaction
2. **Test isolation vs accumulation** reveals different classes of race conditions
3. **Prime number document counts** (101 vs 100) provide better distribution for stress testing
4. **Inflection point protection** prevents multiple concurrent compactions

## Next Steps

Further investigation needed to identify and fix remaining race conditions that occur under the stress test conditions.