# Compaction and Meta Block Reference Integrity

## The Core Problem

Meta blocks capture point-in-time snapshots of carLog entries, but compaction completely replaces the carLog, creating dangling references that lead to "missing block" errors.

## Race Condition Sequence

```
T1: Commit A captures carLog snapshot [CAR1, CAR2, CAR3]
T2: waitIdle() resolves, compaction starts reading same snapshot
T3: NEW Commit B arrives, adds CAR4 via carLog.unshift([CAR4])
T4: carLog now = [CAR4, CAR1, CAR2, CAR3]
T5: Commit A persists meta block pointing to [CAR1, CAR2, CAR3]
T6: 🚨 Compaction completes: carLog.update([COMPACTED_CAR])
T7: Meta block references [CAR1, CAR2, CAR3] - ALL GONE!
```

## Why Content Preservation Isn't Sufficient

Even if the compacted CAR contains all blocks from the original carLog entries, **meta blocks still contain dangling references to the eliminated carLog entries**.

```
Before: Meta block says "find my data in CAR1, CAR2, CAR3"
After:  Meta block still says "find my data in CAR1, CAR2, CAR3"
        But carLog only contains [COMPACTED_CAR]
        → System can't locate CAR1, CAR2, CAR3 even though blocks exist in COMPACTED_CAR
```

The invariant that `COMPACTED_CAR` contains all blocks is **necessary but not sufficient** for reference integrity.

## The Real Fix: Append-Aware Compaction

**Key Insight**: Compaction must include concurrent appends that occurred during the compaction process.

### Current Broken Logic

```typescript
// Compaction replaces entire carLog
carLog.update([COMPACTED_CAR]); // Loses CAR4 that arrived during compaction
```

### Fixed Logic

```typescript
// Compaction preserves concurrent appends
const newEntriesSinceStart = getNewEntriesSinceCompactionStart();
carLog.update([COMPACTED_CAR, ...newEntriesSinceStart]);
```

### Complete Sequence with Fix

```
T1: Compaction starts, captures carLog = [CAR1, CAR2, CAR3]
T2: Commit B adds CAR4 → carLog = [CAR4, CAR1, CAR2, CAR3]
T3: Compaction completes with: carLog = [COMPACTED_CAR, CAR4]
T4: Meta block references CAR1-3 → redirect to COMPACTED_CAR ✅
T5: Meta block references CAR4 → still valid ✅
```

## Implementation Requirements

### 1. Two-Phase CarLog Capture

- **Phase 1**: Capture carLog state at compaction start (what to compact)
- **Phase 2**: Capture carLog state at compaction end (what to preserve)

### 2. Atomic CarLog Update with Preservation

```typescript
async updateCarLogWithPreservation(compactedCar: CarGroup, originalSnapshot: CarGroup[], currentState: CarGroup[]) {
  const newEntries = currentState.filter(entry => !originalSnapshot.includes(entry));
  this.carLog.update([compactedCar, ...newEntries]);
}
```

### 3. Reference Redirection

- Meta blocks referencing old entries get redirected to COMPACTED_CAR
- Meta blocks referencing concurrent entries remain valid
- No dangling references possible

## Root Cause Analysis

The fundamental issue is that Fireproof's compaction design assumes:

1. **Static carLog during compaction** - violated by concurrent writes
2. **Complete carLog replacement** - creates dangling references
3. **Point-in-time meta block snapshots** - become invalid after replacement

## Benefits of Append-Aware Compaction

1. **Reference Integrity**: No meta blocks ever have dangling references
2. **Data Integrity**: All blocks remain accessible through valid carLog entries
3. **Concurrent Safety**: Writes during compaction are preserved
4. **Backwards Compatibility**: Existing meta blocks continue to work

## Current Status

- ✅ Basic race condition addressed by `waitIdle()` synchronization
- ❌ Meta block reference integrity still vulnerable to concurrent writes during compaction
- 🔄 Append-aware compaction logic needed for complete fix

The `waitIdle()` fix reduced the race condition window but didn't eliminate the fundamental issue of carLog entry elimination during active references.
