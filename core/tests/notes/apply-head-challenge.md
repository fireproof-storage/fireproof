# ApplyHead Call Path Challenge - Remote Sync Subscription Bug

## The Core Problem

React components using `useLiveQuery` don't update when remote changes sync via `toCloud()`. The subscription system works for local writes but fails for remote sync operations.

## Key Insight: Two ApplyHead Call Paths

The `applyHead()` method in `crdt-clock.ts` is called from **two different paths** in `crdt.ts`:

### Path 1: Local Writes (WORKING ✅)

```
User calls db.put()
→ writeQueue.push()
→ crdt.bulk()
→ clock.applyHead(newHead, prevHead, localUpdates=TRUE)
→ notifyWatchers()
→ subscriptions fire
→ React components update
```

### Path 2: Remote Sync (BROKEN ❌)

```
Remote data arrives
→ applyMeta()
→ clock.applyHead(newHead, prevHead, localUpdates=FALSE)
→ ??? (subscriptions don't fire)
→ React components don't update
```

## The Hypothesis

**The subscription system is only working for the `bulk()` path, not the `applyMeta()` path.**

This would explain:

- ✅ Local writes trigger subscriptions (via `bulk()`)
- ❌ Remote sync data doesn't trigger subscriptions (via `applyMeta()`)
- ❌ React components using `useLiveQuery` don't update on remote changes

## Current Subscription Fix Attempt

We've added manual subscription triggering in `crdt-clock.ts`:

```typescript
// In int_applyHead()
const needsManualNotification = !localUpdates && (this.watchers.size > 0 || this.noPayloadWatchers.size > 0);

if (needsManualNotification) {
  const changes = await clockChangesSince<DocTypes>(this.blockstore, advancedHead, prevHead, {}, this.logger);
  if (changes.result.length > 0) {
    this.notifyWatchers(changes.result);
  } else {
    this.noPayloadWatchers.forEach((fn) => fn());
  }
}
```

However, this fix assumes that:

1. The `applyMeta()` path is reaching `int_applyHead()`
2. The `localUpdates=FALSE` parameter is being set correctly
3. The manual notification logic is executing

## Investigation Needed

We need to add logging to trace the execution flow:

### 1. Log Both Call Sites in `crdt.ts`

**In `bulk()` method:**

```typescript
console.log("🔵 BULK: Calling applyHead for LOCAL write", {
  localUpdates: true,
  newHead: newHead.map((h) => h.toString()),
  subscribers: this.clock.watchers.size + this.clock.noPayloadWatchers.size,
});
await this.clock.applyHead(newHead, prevHead, updates);
```

**In `applyMeta()` method:**

```typescript
console.log("🔴 APPLY_META: Calling applyHead for REMOTE sync", {
  localUpdates: false,
  newHead: newHead.map((h) => h.toString()),
  subscribers: this.clock.watchers.size + this.clock.noPayloadWatchers.size,
});
await this.clock.applyHead(newHead, prevHead, false);
```

### 2. Log Entry Point in `crdt-clock.ts`

**In `int_applyHead()` method:**

```typescript
console.log("⚡ INT_APPLY_HEAD: Entry point", {
  localUpdates,
  watchersCount: this.watchers.size,
  noPayloadWatchersCount: this.noPayloadWatchers.size,
  needsManualNotification: !localUpdates && (this.watchers.size > 0 || this.noPayloadWatchers.size > 0),
});
```

### 3. Log Notification Calls

**In `notifyWatchers()` method:**

```typescript
console.log("🔔 NOTIFY_WATCHERS: Triggering subscriptions", {
  updatesCount: updates.length,
  watchersCount: this.watchers.size,
  noPayloadWatchersCount: this.noPayloadWatchers.size,
  filteredUpdates: updates.map((u) => ({ id: u.id, value: u.value })),
});
```

**In manual notification path:**

```typescript
if (needsManualNotification) {
  console.log("🛠️ MANUAL_NOTIFICATION: Checking for changes", { changes: changes.result.length });
  if (changes.result.length > 0) {
    console.log("🛠️ MANUAL_NOTIFICATION: Calling notifyWatchers with changes");
    this.notifyWatchers(changes.result);
  } else {
    console.log("🛠️ MANUAL_NOTIFICATION: Calling noPayloadWatchers directly");
    this.noPayloadWatchers.forEach((fn) => fn());
  }
}
```

## Expected Log Output Analysis

### For Local Writes (Working Case)

```
🔵 BULK: Calling applyHead for LOCAL write { localUpdates: true, newHead: [...], subscribers: 1 }
⚡ INT_APPLY_HEAD: Entry point { localUpdates: true, watchersCount: 1, noPayloadWatchersCount: 0, needsManualNotification: false }
🔔 NOTIFY_WATCHERS: Triggering subscriptions { updatesCount: 1, watchersCount: 1, noPayloadWatchersCount: 0, ... }
```

### For Remote Sync (Broken Case - What We Should See)

```
🔴 APPLY_META: Calling applyHead for REMOTE sync { localUpdates: false, newHead: [...], subscribers: 1 }
⚡ INT_APPLY_HEAD: Entry point { localUpdates: false, watchersCount: 1, noPayloadWatchersCount: 0, needsManualNotification: true }
🛠️ MANUAL_NOTIFICATION: Checking for changes { changes: 1 }
🛠️ MANUAL_NOTIFICATION: Calling notifyWatchers with changes
🔔 NOTIFY_WATCHERS: Triggering subscriptions { updatesCount: 1, watchersCount: 1, noPayloadWatchersCount: 0, ... }
```

### For Remote Sync (If Broken - What We Might Actually See)

```
🔴 APPLY_META: Calling applyHead for REMOTE sync { localUpdates: false, newHead: [...], subscribers: 1 }
⚡ INT_APPLY_HEAD: Entry point { localUpdates: false, watchersCount: 1, noPayloadWatchersCount: 0, needsManualNotification: true }
🛠️ MANUAL_NOTIFICATION: Checking for changes { changes: 0 }
🛠️ MANUAL_NOTIFICATION: Calling noPayloadWatchers directly
// No NOTIFY_WATCHERS log = bug found!
```

**OR even worse:**

```
🔴 APPLY_META: Calling applyHead for REMOTE sync { localUpdates: false, newHead: [...], subscribers: 0 }
⚡ INT_APPLY_HEAD: Entry point { localUpdates: false, watchersCount: 0, noPayloadWatchersCount: 0, needsManualNotification: false }
// No manual notification = subscriptions not set up yet when applyMeta is called!
```

## Potential Root Causes to Investigate

### 1. Timing Issue

- `applyMeta()` might be called before subscriptions are set up
- Remote sync happens during database initialization
- Subscribers not registered yet when remote data arrives

### 2. Code Path Not Executing

- `applyMeta()` path might not reach `int_applyHead()` at all
- Different parameter passing between bulk and applyMeta
- Early returns preventing execution

### 3. Manual Notification Logic Bug

- Our fix logic might have conditions that don't match real scenarios
- `clockChangesSince()` might return different results for remote sync
- EmptyWatchers vs watchers distinction not working as expected

### 4. Subscription Setup Mismatch

- `use-fireproof` might be using different subscription patterns
- React hooks setup timing vs remote sync timing
- Database ready state vs subscription ready state

## Test Strategy

1. **Run the failing subscription test with logging**
2. **Compare logs between local write test (working) and remote sync test (broken)**
3. **Identify exactly where the execution path diverges**
4. **Fix the root cause based on evidence**

## Success Criteria

The fix is successful when:

1. ✅ Both local writes AND remote sync operations produce similar log patterns
2. ✅ `🔔 NOTIFY_WATCHERS` logs appear for both paths
3. ✅ Subscription tests pass for both `updates: true` and `updates: false` modes
4. ✅ React components using `useLiveQuery` update on remote sync

## File Locations for Investigation

- **Call sites**: `/Users/jchris/code/fp/fireproof/core/base/crdt.ts`
- **Clock implementation**: `/Users/jchris/code/fp/fireproof/core/base/crdt-clock.ts`
- **Test file**: `/Users/jchris/code/fp/fireproof/core/tests/fireproof/attachable-subscription.test.ts`
- **use-fireproof**: `/Users/jchris/code/fp/fireproof/core/tests/node_modules/use-fireproof/react/use-live-query.ts`

---

## Running Targeted Tests

### Existing Tests to Run

**1. Run the comprehensive subscription tests:**

```bash
pnpm test fireproof/attachable-subscription.test.ts --reporter=verbose
```

**2. Run a specific failing test with logs:**

```bash
pnpm test fireproof/attachable-subscription.test.ts -t "should trigger subscriptions on inbound syncing" --reporter=verbose
```

**3. Run database tests that exercise both paths:**

```bash
pnpm test fireproof/database.test.ts -t "basic Ledger with subscription" --reporter=verbose
```

### New Simple Tests to Write

Create these minimal tests in `/Users/jchris/code/fp/fireproof/core/tests/fireproof/apply-head-logging.test.ts`:

#### Test 1: Local Write Path Logging

```typescript
import { fireproof } from "@fireproof/core";
import { describe, expect, it } from "vitest";

describe("ApplyHead Path Logging", () => {
  it("should log BULK path for local writes", async () => {
    const db = fireproof("test-bulk-path");

    // Setup subscription to ensure watchers exist
    let notified = false;
    const unsubscribe = db.subscribe(() => {
      notified = true;
    }, true);

    // Perform local write - should trigger BULK path
    console.log("🧪 TEST: Starting local write");
    await db.put({ _id: "test-local", value: "local-data" });

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(notified).toBe(true);
    unsubscribe();
    await db.close();

    console.log("🧪 TEST: Local write completed");
  });
});
```

#### Test 2: Remote Sync Path Logging

```typescript
it("should log APPLY_META path for remote sync", async () => {
  const set = "test-remote-path";

  // Create source database with data
  const sourceDb = fireproof(`source-${set}`, {
    storeUrls: { base: `memory://source-${set}` },
  });
  await sourceDb.put({ _id: "test-remote", value: "remote-data" });

  // Create target database
  const targetDb = fireproof(`target-${set}`, {
    storeUrls: { base: `memory://target-${set}` },
  });

  // Setup subscription to ensure watchers exist
  let notified = false;
  const unsubscribe = targetDb.subscribe(() => {
    notified = true;
  }, true);

  console.log("🧪 TEST: Starting remote sync");

  // Trigger remote sync - should trigger APPLY_META path
  // (This needs to be implemented based on the actual sync mechanism)
  // await targetDb.attach(someAttachable);

  // Wait for async operations
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("🧪 TEST: Remote sync completed, notified:", notified);

  unsubscribe();
  await sourceDb.close();
  await targetDb.close();
});
```

#### Test 3: Side-by-Side Comparison

```typescript
it("should show log differences between local and remote paths", async () => {
  console.log("\n=== COMPARISON TEST START ===");

  const db = fireproof("test-comparison");

  let localNotified = false;
  let remoteNotified = false;

  const unsubscribe = db.subscribe(() => {
    console.log("📬 SUBSCRIPTION: Notification received");
    localNotified = true; // We'll use this for both for now
  }, true);

  // Phase 1: Local write
  console.log("\n--- PHASE 1: LOCAL WRITE ---");
  await db.put({ _id: "local-test", value: "local" });
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Phase 2: Simulate remote sync scenario
  console.log("\n--- PHASE 2: REMOTE SYNC SIMULATION ---");
  // TODO: Implement actual remote sync trigger
  // For now, just show the logging setup is working
  console.log("🔄 REMOTE: Would trigger applyMeta path here");

  console.log("\n--- RESULTS ---");
  console.log("Local write notified:", localNotified);
  console.log("Remote sync notified:", remoteNotified);

  unsubscribe();
  await db.close();

  console.log("=== COMPARISON TEST END ===\n");
});
```

### Running the New Tests

**Run the new logging tests:**

```bash
pnpm test fireproof/apply-head-logging.test.ts --reporter=verbose
```

**Run with debug output:**

```bash
FP_DEBUG=1 pnpm test fireproof/apply-head-logging.test.ts --reporter=verbose
```

### Expected Log Analysis

When running these tests, look for:

**✅ Successful Local Write Logs:**

```
🧪 TEST: Starting local write
🔵 BULK: Calling applyHead for LOCAL write { localUpdates: true, ... }
⚡ INT_APPLY_HEAD: Entry point { localUpdates: true, needsManualNotification: false }
🔔 NOTIFY_WATCHERS: Triggering subscriptions { updatesCount: 1, ... }
📬 SUBSCRIPTION: Notification received
🧪 TEST: Local write completed
```

**❌ Missing Remote Sync Logs:**

```
🧪 TEST: Starting remote sync
🔄 REMOTE: Would trigger applyMeta path here
// MISSING: 🔴 APPLY_META logs
// MISSING: ⚡ INT_APPLY_HEAD logs
// MISSING: 🔔 NOTIFY_WATCHERS logs
🧪 TEST: Remote sync completed, notified: false
```

This pattern will immediately reveal whether the `applyMeta()` path is:

1. **Not being called at all** (no 🔴 logs)
2. **Not reaching int_applyHead** (🔴 logs but no ⚡ logs)
3. **Not triggering notifications** (🔴 and ⚡ logs but no 🔔 logs)

### Iterative Testing Strategy

1. **Start with existing tests** - Add logging and run attachable-subscription.test.ts
2. **Create minimal reproduction** - Use the simple tests above
3. **Identify the break point** - Follow the missing logs
4. **Fix incrementally** - Address each missing log in sequence
5. **Validate with original tests** - Ensure comprehensive tests pass

---

_This investigation will definitively identify whether the `applyMeta()` → `applyHead()` → `notifyWatchers()` chain is broken and exactly where the execution path diverges from the working `bulk()` case._
