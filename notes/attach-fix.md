# Fireproof Attachment Synchronization Analysis (mabels/peer-tracker branch)

## Issue Overview
Testing the `mabels/peer-tracker` branch reveals a synchronization issue where documents are not correctly propagating between attached databases. The "online sync" test in `tests/fireproof/attachable.test.ts` is failing - each database shows only 1 record when it should contain 2 records (one from each database).

## Failing Test Details
In `tests/fireproof/attachable.test.ts`, the "online sync" test:
- Creates 2 databases and attaches them to a common sync source
- Each database writes one document (ROWS = 1)
- The test expects each database to contain both documents (ROWS * dbs.length = 2)
- But the test shows only 1 document in each database

The test failure occurs at line 478:
```typescript
expect(rows.rows.length).toBe(ROWS * dbs.length); // Expected 1 to be 2
```

## Key Modified Files for Investigation

1. **tests/fireproof/attachable.test.ts** (308 changes)
   - Contains the failing test case and testing framework for attachment

2. **src/blockstore/loader.ts** (689 changes)
   - Central to the peer tracking and synchronization logic
   - Has the most substantial changes in the branch

3. **src/runtime/gateways/memory/gateway.ts** (78 changes)
   - Implements the memory gateway used in testing
   - Critical for understanding how synchronization messages are passed

4. **src/crdt.ts** (85 changes) and **src/crdt-helpers.ts** (71 changes)
   - Contains the CRDT implementation for conflict resolution and data merging

5. **src/blockstore/commitor.ts** (82 changes)
   - Handles committing data changes across peers

6. **src/blockstore/types.ts** (261 changes)
   - Significant type definition changes affecting the entire synchronization system

7. **src/react/create-attach.ts** (88 new lines)
   - New file implementing attachment functionality for synchronization

8. **src/blockstore/attachable-store.ts** (7 changes)
   - Implementation of attachable stores for synchronization

## Observations from Test Output

- Both databases successfully connect to their respective memory gateways
- Metadata is being exchanged between the gateways (multiple "put-meta" operations visible)
- The synchronization events are flowing as evidenced by the debug logs
- But the final document count is wrong, suggesting that:
  - Documents are not being correctly propagated
  - Or there's an issue with the timing/completion of synchronization
  - Or the CRDT merge logic is not correctly applying remote changes

## Next Steps for Diagnosing

1. **Memory Gateway Implementation**:
   - Review the pub/sub mechanism to verify messages are properly distributed
   - Check if there are any race conditions or timing issues

2. **Loader Implementation**:
   - Verify that incoming sync messages are correctly processed
   - Ensure the peer tracking logic works correctly across attached stores

3. **CRDT Merge Logic**:
   - Check that updates from other peers are properly incorporated
   - Verify that merge operations handle conflicts correctly

4. **Timing Issues**:
   - The test may need additional waiting time for synchronization to complete
   - Consider adding more detailed logging around sync completion events
