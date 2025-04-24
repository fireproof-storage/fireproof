# Attachment Synchronization Hypothesis

## Issue Summary

The synchronization between attached databases is not working correctly in the `mabels/peer-tracker` branch. Documents created in one database aren't appearing in the other database, even though they're attached to the same sync source.

## Test Observations

- Each database shows only its own document (rows.rows.length = 1) instead of both documents (expected rows.rows.length = 2)
- The clock head for each database contains only its own CID, not the other database's CID
- Metadata appears to be properly exchanged between databases (we see put-meta, subscribe and new-meta logs)
- The test that closes and reopens databases after sync passes

## Findings from Test Run

After adding extensive logging to the `advanceBlocks` function and running the tests, we've observed several key points:

1. **Metadata is being exchanged successfully**:

   ```
   subscribe z2tacycoDj z3CR8FTZTp sync-outbound-z7uYaE5S3 [ 'baembeig2is4vdgz4gyiadfh5uutxxeiuqtacnesnytrnilpwcu7q5m5tmu' ]
   ```

2. **CIDs are being loaded successfully**:

   ```
   {"module":"Loader","level":"debug","cid":"baembeig2is4vdgz4gyiadfh5uutxxeiuqtacnesnytrnilpwcu7q5m5tmu","msg":"loading car"}
   {"module":"Loader","level":"debug","loadedCar":true,"msg":"loaded"}
   ```

3. **Meta updates are being added to tracking**:

   ```
   new-meta zqS5xZ66v sync-outbound-z7uYaE5S3 undefined [ 'baembeie2jjf3wqz7mhbg6ycexdwedbpvekezlcvsds7tay6agmbdtjljyq' ] [
     'baembeie2jjf3wqz7mhbg6ycexdwedbpvekezlcvsds7tay6agmbdtjljyq',
     'baembeig2is4vdgz4gyiadfh5uutxxeiuqtacnesnytrnilpwcu7q5m5tmu'
   ]
   ```

4. **Test failure is showing document mismatch**:
   From the error output, we can see that:

   - The `outRows` contains 3 documents from `outbound-db`
   - The `inRows` contains 3 documents from `inbound-db`
   - But they are different sets of documents, indicating each database has its own state

5. **Unexpected meta stream end warning**:
   ```
   {"module":"Loader","level":"warn","value":"--Falsy--","done":true,"msg":"unexpected meta stream end"}
   ```
   This suggests the metadata stream may be terminating prematurely.

## Root Cause Analysis

The primary issue appears to be with how the multi-head state is handled in the `advanceBlocks` function. While metadata is correctly being shared between databases (as evidenced by the array of CIDs in the meta updates), there are several possible issues:

1. **Meta Updates without Document Transfer**: The meta CIDs are being tracked, but the document data isn't being properly transferred between databases.

2. **Meta Stream Termination**: The "unexpected meta stream end" warning suggests the metadata synchronization process may be terminating prematurely before complete synchronization.

3. **CRDT Merging Issue**: The advanced head state from `advanceBlocks` may not be properly preserved or used for subsequent operations.

4. **Memory Gateway Communication**: The pub/sub mechanism in the memory gateway implementation may not be properly notifying peers of changes.

## Hypothesized Fix

The most likely solution involves ensuring that:

1. The advanced clock head state from `advanceBlocks` is properly persisted and used for subsequent operations
2. The meta stream stays open long enough to complete synchronization
3. Document data retrieval properly uses the merged clock head state

Specifically, we need to check if the `applyMeta` function is correctly applying the updated clock head to the database state after merging. The success of tests that close and reopen databases suggests that reopening may be triggering a proper initialization process that isn't happening during normal operation.
