## 4. WebSocket - Connection (`src/protocols/cloud/ws-connection.ts`)

This component wraps a raw WebSocket and manages message serialization/deserialization, request/response tracking using transaction IDs (`tid`), and stream binding. It forms the base for communication with the cloud backend.

**Key Metadata Structures & Locus:**

These structures enable reliable communication between clients and cloud servers through the WebSocket transport layer. They handle message framing, transaction tracking, and protocol-specific encoding/decoding.

*   **`ws: WebSocket` (constructor parameter)**: The underlying WebSocket instance. The **URL** used to create this WebSocket (externally, before passing to `WSConnection`) is critical initial metadata. This URL would contain:
    *   The WebSocket server endpoint (e.g., `wss://fireproof.storage/api/v0/...`).
    *   Potentially, query parameters carrying `tenant`, `ledger`, or an initial `token`.
*   **`msgP: MsgerParamsWithEnDe` (constructor parameter)**:
    *   `ende: MsgEnDe`: Specifies the encoder/decoder, implying a defined message protocol.
    *   `timeout: number`: Default operation timeout.
*   **`ReqOpen` (from `./msg-types.js`)**: Defines the structure for the initial message sent by the client to establish a session. This is where primary session metadata is likely exchanged:
    *   `token: string` (authentication token)
    *   `tenant: string` (tenant ID)
    *   `ledger: string` (ledger ID)
    *   `protocolVersion: string`, `clientType: string`, etc.
*   **`MsgBase` (from `./msg-types.js`) & derivatives**:
    *   `tid: string`: Transaction ID, generated client-side and included in all messages for request/response correlation. Managed by `WaitForTids`.

**Metadata Propagation & Management:**

1.  **Connection Establishment (External)**: The WebSocket URL (metadata itself) is used. Query parameters or headers during the HTTP upgrade can carry initial metadata.
2.  **Initialization (`WSConnection.constructor`)**: Receives an already connected `WebSocket` and `MsgerParamsWithEnDe` (for message protocol).
3.  **Sending/Receiving Messages**: All messages include a `tid`. The *content* of specific messages (e.g., `ReqOpen`) carries operational and session metadata (token, tenant, ledger). Incoming messages are decoded, and `tid` is used for matching.

**Inferred Metadata (Likely in `ReqOpen` or initial connection setup):**

*   **Authentication Token**: Essential for authorizing the client.
*   **Tenant/Ledger IDs**: Provide namespacing and context for server operations.
*   **Server-Side Session ID**: The server might issue its own session ID in response to `ReqOpen`.

**Summary for `ws-connection.ts`:** `WSConnection` is a transport wrapper. The WebSocket URL and the `ReqOpen` message are the primary carriers for initial and session-level metadata. `tid` is used for per-message tracking. The actual structure of messages (defined by `MsgEnDe` and types in `msg-types.js`) dictates how other operational metadata is embedded.

---
