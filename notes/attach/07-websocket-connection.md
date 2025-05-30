## 4. WebSocket - Connection (`src/protocols/cloud/ws-connection.ts`)

### What It Does

The `WSConnection` class is Fireproof's **transport layer** for cloud synchronization. It wraps a raw WebSocket connection and manages message serialization/deserialization, request/response tracking, and stream binding. Think of it as the reliable courier that ensures your data packets reach the cloud server and come back intact.

### Why This Matters

For developers, the WebSocket connection is where protocol meets network. While you won't directly instantiate this class (the `Msger` handles that), understanding WebSocket connection metadata helps troubleshoot synchronization issues. The transaction IDs (`tid`) and protocol paths in this layer determine whether messages reach their destination correctly.

```typescript
// WebSockets are typically created by the Msger:
const ws = new WebSocket("wss://fireproof.storage/api/v0/sync");
const wsConn = new WSConnection(sthis, ws, msgParams, exchangedGestalt);

// Then messages flow through it:
await wsConn.send(someMessage); // Serializes and transmits
```

### Key Metadata Structures

*   **`ws: WebSocket`**: ⭐ The underlying browser WebSocket instance
    *   The WebSocket **URL** contains critical initial metadata:
    *   Server endpoint (e.g., `wss://fireproof.storage/api/v0/...`)
    *   Query parameters may include initial `tenant`, `ledger`, or `token`

*   **`msgP: MsgerParamsWithEnDe`**: Message protocol configuration
    *   `ende: MsgEnDe`: Encoder/decoder for serialization
    *   `timeout: number`: Operation timeouts

*   **`MsgBase` & derivatives**: ⭐ Message structure with transaction tracking
    *   `tid: string`: Transaction ID for request/response correlation
    *   Message-specific fields like `ReqOpen` with connection parameters

*   **`WaitForTids`**: Transaction tracking system for async operations

### Metadata Lifecycle

1. **🏁 Connection Establishment**: WebSocket URL carries initial metadata
   ```typescript
   // This happens before WSConnection is created
   const ws = new WebSocket(
     "wss://fireproof.storage/api/v0/sync?tenant=acme&ledger=db1"
   );
   ```

2. **🔑 Initialization**: `WSConnection` construction with encoding setup
   ```typescript
   const conn = new WSConnection(
     sthis,
     ws, // Already-connected WebSocket
     msgParams // Includes ende (encoder/decoder)
   );
   ```

3. **📣 Sending Messages**: Every outgoing message includes a `tid`
   ```typescript
   // Internal message tracking with transaction ID
   await conn.send({
     tid: generateTransactionId(),
     type: "req_pull",
     // ...message contents
   });
   ```

4. **📢 Receiving Messages**: Incoming messages are matched to pending requests by `tid`
   ```typescript
   // Inside WSConnection's message handler:
   this.waitForTid.resolve(msg); // Finds the matching request by tid
   ```

5. **📰 Stream Binding**: For continuous data flow like replication streams
   ```typescript
   // Creates a ReadableStream bound to a specific message type:
   const carStream = conn.bind(requestMessage, {
     waitFor: (msg) => msg.type === "res_car"
   });
   ```

> **For New Devs**: While you won't directly work with WSConnection, examining its logs during debugging reveals important connection state. Look for transaction IDs (`tid`) to trace request/response pairs when troubleshooting synchronization issues.

---
