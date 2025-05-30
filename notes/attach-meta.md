# Metadata Propagation in Fireproof (mabels/dashboard-api Branch)

### Why This Document Exists

Fireproof's power comes from **keeping data portable** while still enforcing encryption, access control, and multi-device synchronization. All of those guarantees rely on _metadata_ travelling alongside the actual user data blocks.  
If you are new to the project, understanding _what_ metadata we keep and _where_ it flows is the fastest path to being productive: nearly every feature (queries, encryption, collaboration, replication) is implemented by _reading_ or _writing_ one of the metadata fields described below.

> **Take-away:** Whenever you touch a Fireproof component, ask yourself _"Which piece of metadata is this code responsible for?"_

### Reading the Codebase – Style Primer

Fireproof is written in modern **TypeScript** with a functional flavour:

* **Result / Option monads** (`Result.Ok`, `Result.Err`, etc.) are preferred over throwing exceptions.  
  Always check `.isErr()` rather than relying on `try/catch`.
* **Async/await everywhere.** You will rarely find raw Promises being chained – keep stack traces clean by awaiting.
* **Immutability first.** Functions avoid mutating arguments; instead they return new objects or update class-private state.
* **Small building blocks.** Large flows (like loading a CAR file) are composed from many tiny helpers – lean on your editor's *go-to-definition*.
* **Structured logging** via `logger.Info().Any({ key: value }).Msg("message")`.  
  Add context objects generously; logs are rendered in Loki/Grafana.

_Code layout conventions_

* Type definitions live next to implementation files (e.g. `blockstore/types.ts`).
* **Feature directories** (e.g. `protocols/cloud`) own everything from transport to codec – no giant `utils/` grab-bags.
* Tests mirror the `src/` tree one-for-one in `tests/`.

> **Tip for IDEs:** enable _TypeScript "strict"_ flags; the codebase compiles with no implicit `any`.

---

## Metadata Flow Map: From UI to Storage

Fireproof's architecture flows from UI components down to persistent storage, with metadata guiding the journey:

```
┌───────────────┐     Authentication & Identity     ┌──────────────┐
│  React Hooks  │─────┐ (JWT, tenant, ledger) ┌─────│ Dashboard API │
└───────────────┘     │                       │     └──────────────┘
        │             ▼                       ▼             
        │      ┌─────────────┐        ┌─────────────┐      
        └─────▶│  WebSocket  │◀───────│    Msger    │      
               └─────────────┘        └─────────────┘      
                      │                     ▲               
                      │   ┌────────────┐   │               
                      └──▶│   Loader   │───┘               
                          └────────────┘                    
                           │         ▲                      
             ┌─────────────┘         │                      
             ▼                       │                      
      ┌────────────┐          ┌────────────┐               
      │ Blockstore │◀─────────│   KeyBag   │               
      └────────────┘          └────────────┘               
```

### Key Components and Their Responsibilities

Fireproof's metadata flow includes these essential components:

- **KeyBag**: Cryptographic key management, resolution, and persistence
- **Blockstore**: Data blocks and metadata storage with encryption support
- **Loader**: Orchestrates data loading, commits, and multi-store coordination
- **WebSocket Protocol**: Cloud communication, authentication, and session handling
- **Dashboard API**: Authentication and account management services
- **React Hooks**: UI integration for cloud attachment and token management

---

## 1. KeyBag (`src/runtime/key-bag.ts`)

### What It Does

The Keybag is Fireproof's **cryptographic keyring**. It manages encryption keys across browser sessions, devices, and storage backends. Think of it as a small secure vault that accompanies your data everywhere.

### Why This Matters

For developers, Keybag is your entry point to Fireproof's encryption system. Every database needs keys, and Keybag provides them consistently regardless of environment (browser, Node.js, etc). When data flows through the system, its identity is tied to these keys.

```typescript
// How you'll typically interact with KeyBag:
const keyBag = await rt.kb.getKeyBag(sthis);
const cryptoKey = await keyBag.getNamedKey('myDatabaseName');
```

### Key Metadata Structures

*   **`KeyBagRuntime`**: The runtime configuration for key management
    *   `url: URI`: ⭐ The **primary identifier** for a Keybag instance (e.g., `indexeddb://fp-keybag`, `file:///path/to/keybag`). This URI's scheme (`indexeddb:`, `file:`) dictates the storage backend. It's derived from options, environment variables (`FP_KEYBAG_URL`), or defaults.
    *   `sthis: SuperThis`: Runtime environment access and ID generation

*   **`KeysByFingerprint` / `KeysItem`**: How keys are persisted
    *   `name: string`: ⭐ A logical **name for a key set** (e.g., a database name) - crucial for retrieving related keys as a group

*   **`KeyWithFingerPrint` / `V2StorageKeyItem`**: Individual key management
    *   `fingerPrint: string`: ⭐ A unique **hash of the key material**, used for content-addressable lookup
    *   `default: boolean`: Indicates if this is the default key in a named set
    *   `key: string`: The key material itself (typically base58btc encoded)

### Metadata Lifecycle

1. **🏁 Initialization**: `KeyBagRuntime.url` determines *where* and *how* keys are stored
   ```typescript
   // URL format influences storage backend selection:
   const keyBag = await getKeyBag({ url: 'indexeddb://fp-keybag-custom' });
   ```

2. **📝 Key Requests**: Components request keys using a `name` 
   ```typescript 
   const cryptoKey = await keyBag.getNamedKey('myDatabase');
   ```

3. **🔍 Resolution**: Keys are located by their `fingerPrint` internally

4. **💾 Persistence**: `KeyBagProvider` implementations store `KeysItem` objects keyed by `name`

5. **🔗 URI Parameters**: The system can extract key material from URIs (e.g., `url.getParam(PARAM.KEY)`)
   ```typescript
   // For debugging only - masterkey in URL params is forbidden for production
   const uri = BuildURI.new().param('key', 'directKey123').URI();
   ```

> **For New Devs**: When designing database operations, think about how you'll identify and retrieve keys. The `name` parameter serves as your primary key grouping mechanism.

---

## 2. Blockstore - Stores (`src/blockstore/store.ts`)

### What It Does

Blockstore is Fireproof's **storage subsystem**. It translates operations like "save this document" into "encrypt these blocks and store them persistently." The `BaseStoreImpl` hierarchy (`MetaStoreImpl`, `DataStoreImpl`, `WALStoreImpl`) provides the foundation for Fireproof's content-addressable storage model.

### Why This Matters

For developers, understanding Blockstore means understanding _where_ data lives. All user content eventually passes through these stores, where encryption happens and persistence choices are made. As you build features on Fireproof, you'll rarely call these APIs directly, but they determine your app's performance characteristics.

```typescript
// Stores are typically created by the Loader, not directly:
const gateway = new IndexedDBGateway(ebOpts);
const dataStore = new DataStoreImpl(url, { loader, gateway });

// But you'll recognize the effects of operations that use them:
await database.put({ _id: "doc1", content: "Hello" });
// ↓↓↓ eventually flows into ↓↓↓
await dataStore.save(block); // encrypted, stored in IndexedDB
```

### Key Metadata Structures

*   **`_url: URI` (in `BaseStoreImpl`)**:  ⭐ **Primary store identifier and configurator**
    *   **Database Identification**: Contains `PARAM.NAME` (e.g., `dbName=myDatabase`) to identify the database
    *   **Store Type**: Uses `PARAM.STORE` (e.g., `store=meta`, `store=data`) to define the store's role
    *   **Encryption Context**: May contain `PARAM.KEY` or `PARAM.KEY_NAME` for crypto configuration
    *   **Gateway Selection**: URI scheme dictates which storage backend is used

*   **`opts.loader: Loadable`**: Provides access to shared resources, especially `KeyBag` via `loader.keyBag()`

*   **`DbMeta` (handled by `MetaStoreImpl`)**: ⭐ The **canonical state record** for your database
    *   `keyName?: string`: ⭐ **Encryption key identifier** - links stored blocks to their encryption key
    *   `branch: string`: The active branch (when using branching)
    *   `writer?: string`: Origin identifier for multi-writer scenarios
    *   `clock`, `cars`, `files`: The database's structural pointers

### Metadata Lifecycle

1. **🏁 Initialization**: Store creation requires two key items:
   ```typescript
   const store = new MetaStoreImpl(
     url, // Contains PARAM.NAME, KEY_NAME/KEY params
     { loader } // Provides access to Keybag for encryption
   );
   ```

2. **🔐 Encryption Setup** (`keyedCrypto()` in `BaseStoreImpl`):
   ```typescript
   // Simplified internal flow:
   const crypto = await keyedCryptoFactory(
     this._url, // Provides key params
     await this.loader.keyBag(), // Resolves key names
     this.sthis
   );
   ```

3. **💾 Metadata Persistence** (`MetaStoreImpl.save(meta: DbMeta)`):
   ```typescript
   // DbMeta includes keyName, linking data to encryption key
   await metaStore.save({ 
     keyName: "dbKey1", 
     branch: "main",
     // ... other metadata
   });
   ```

4. **📑 Data Storage** (`DataStoreImpl.save(block)`):
   - Data is encrypted using key from `DbMeta.keyName` or URL params
   - Content-addressed blocks are stored in the gateway

5. **🔍 Reading Data**: When loading, `MetaStoreImpl` fetches `DbMeta` first
   - `DbMeta.keyName` + `loader.keyBag()` = correct decryption key

> **For New Devs**: When troubleshooting data access issues, remember that both the URL and DbMeta influence encryption. If data can't be decrypted, check both sources to ensure the right key is found.

---

## 3. Blockstore - Loader (`src/blockstore/loader.ts`)

### What It Does

The `Loader` is Fireproof's **data orchestrator**. It coordinates between local storage, remote replicas, and the KeyBag. When your app says "load this database," the Loader handles fetching blocks from appropriate stores, decrypting them, and resolving dependencies.

### Key Metadata Structures

**BlockstoreOpts**  
> `BlockstoreOpts` is the main configuration object for Fireproof's block storage layer. It lets you specify which storage backends to use, how encryption keys are managed, and other advanced options like logging and compaction that affect storage behavior.

### Why This Matters

For developers, the Loader is the gateway to remote synchronization. Every database operation that fetches or saves data must go through the Loader. When building features that involve multi-device or cloud replication, you'll be interacting with the Loader's `attach()` method to connect remote stores.

```typescript
// How attachment flow usually works:
const db = new Database("mydb");
await db.attach({
  name: "cloud",
  url: "wss://fireproof.storage/sync",
  opts: {
    tenant: "my-account",
    ledger: "my-database"
  }
});
```

### Key Metadata Structures

*   **`ebOpts: BlockstoreOpts` (constructor parameter)**: ⭐ **Primary configuration**
    *   `url: URI`: Base URI with crucial parameters:
        *   `PARAM.NAME`: Database name
        *   `PARAM.KEY_NAME` or `PARAM.KEY`: Default encryption settings
        *   `PARAM.TENANT`, `PARAM.LEDGER`: Namespacing for cloud operations
    *   `keybag?: Partial<KeyBagOpts>`: KeyBag configuration

*   **`attachedStores: AttachedStores`**: Manages both local and remote stores
    *   Each `ActiveStore` is initialized with metadata from `ebOpts.url` or `attachable.url`

**DbMeta**  
> `DbMeta` holds runtime metadata about the database, including which encryption key is active, the current writer, and branch information. It ensures that all data operations use the correct context.

*   **`DbMeta`**: ⭐ Runtime state metadata about the database
    *   `keyName?: string`: Encryption key for referenced data blocks
    *   `writer?: string`: Source identifier
    *   `branch?: string`: Branch name for versioned data

**Attachable (used in Loader.attach)**  
> The `Attachable` structure specifies how to connect to a remote store, including the remote endpoint and any relevant metadata such as tenant or ledger identifiers.

*   **`Attachable` (used in `Loader.attach`)**: ⭐ Remote connection specification
    *   `url: URI`: Remote endpoint with potential metadata (tenant, ledger, etc.)
    *   `name: string`: Local alias for the connection

### Metadata Lifecycle

1. **🏁 Initialization**: The Loader configures itself from `BlockstoreOpts`
   ```typescript
   // url with parameters flows through to stores:
   const loader = new Loader({
     url: BuildURI.new()
       .param('dbName', 'my-database')
       .param('keyName', 'db1-key')
       .URI()
   });
   ```

2. **🔑 KeyBag Access**: `loader.keyBag()` provides crypto capabilities to stores
   ```typescript 
   // Internal flow for encryption operations:
   const keyBag = await loader.keyBag();
   const crypto = await keyedCryptoFactory(url, keyBag);
   ```

3. **🔄 Attaching Remotes**: `attachable.url` metadata configures how remote stores connect
   ```typescript
   // Remote connection with tenant/ledger metadata:
   await loader.attach({
     name: "cloud",
     url: BuildURI.from("wss://api.fireproof.host/sync")
       .param('tenant', 'acme-corp')
       .param('ledger', 'inventory-db')
       .URI()
   });
   ```

4. **📦 Loading Data**: `Loader` uses `DbMeta.keyName` to decrypt CARs from the right store
   ```typescript
   // Internally, local and remote stores are checked:
   const car = await loader.loadCar(carCid, preferredStore);
   ```

5. **💾 Committing Data**: `Loader` writes `DbMeta` with the proper `keyName`
   ```typescript
   // During saves, keyName is recorded with the data:
   await loader.commit(blocks, { keyName: 'db1-key' });
   ```

> **For New Devs**: The Loader's attach mechanism is the bridge to multi-device synchronization. Understanding how metadata flows between local and remote stores is key to troubleshooting replication issues.

---

## 6. React Hook - UI Attachment (`src/react/use-attach.ts`)

### What It Does

The `createAttach` hook is Fireproof's **bridge to the UI layer**. It manages the React state for cloud connections, handles authentication tokens, and provides feedback about attachment status to your components. This hook transforms complex cloud synchronization into simple React state that your UI can respond to.

### Why This Matters

For application developers, this hook is your primary integration point with Fireproof's cloud features. It's designed to handle all the token management complexity so your components can focus on core UI concerns. When building multi-device or collaborative apps, you'll use this hook to connect your local database with cloud storage.

```typescript
// How you'll typically use the hook in a React component:
import { useFireproof } from '@fireproof/react';

function MyApp() {
  const { database, attach } = useFireproof('my-database');
  const [cloudStatus, setCloudStatus] = useState('disconnected');
  
  const connectToCloud = async () => {
    // This will trigger the auth flow and handle tokens
    await database.attach({
      name: "cloud",
      url: "wss://fireproof.storage/sync",
      opts: {
        tenant: "acme-corp", 
        ledger: "inventory-db"
      }
    });
  };
  
  // Attach state tells you connection status
  if (attach.state === "attached") {
    setCloudStatus("connected");
  }
}
```

### Key Metadata Structures

*   **`config: UseFPConfig`**: The attachment configuration
    *   `attach?: ToCloudAttachable`: ⭐ **Primary cloud connection spec**
        *   `url: URI`: Cloud service endpoint 
        *   `opts.tenant`, `opts.ledger`: Database namespace identifiers
        *   `opts.context`: Application context with shared services
        *   `opts.strategy`: How to obtain auth tokens (iframe, redirect, etc.)

*   **`WebCtxImpl` (`WebToCloudCtx`)**: ⭐ **Authentication context manager**
    *   `dashboardURI`, `tokenApiURI`: Auth UI endpoints
    *   `keyBag`: Persistent storage for tokens (namespaced by `dbId`)
    *   `_tokenAndClaims`: ⭐ Current JWT and its decoded claims
        *   `token`: The raw JWT string
        *   `claims`: ⭐ Decoded metadata from token including:
            *   Standard JWT fields: `iss`, `sub`, `exp`, `aud`
            *   Fireproof-specific: `tenant`, `ledger`, `session`, `email`

*   **`AttachHook` (React state)**: User-facing connection status
    *   `state`: "initial", "attaching", "attached", or "error"
    *   `ctx.tokenAndClaims`: Token info exposed to UI

### Metadata Lifecycle

1. **🏁 Hook Initialization**: React component triggers hook
   ```typescript
   // In a React component:
   const { attach } = useFireproof('my-database');
   ```

2. **🔑 Token Acquisition & Management**: UI flow or API provides JWT
   ```typescript 
   // Inside WebCtxImpl:
   async setToken(token: TokenAndClaims) {
     this._tokenAndClaims.reset();
     this._tokenAndClaims.once(() => token);
     await this.keyBag?.set({
       name: `${this.dbId}/urlToken`,
       keys: { [this.tokenParam]: { key: token.token, ... } }
     });
   }
   ```

3. **🔄 Database Attachment**: Token and config flow to `ToCloudGateway`
   ```typescript
   // The hook orchestrates this flow:
   webCtx.onTokenChange(token => {
     if (token) {
       setAttachState({ state: "attaching" });
       // Token flows to Msger for auth
       database.attach(attachable);
     }
   });
   ```

4. **📡 UI State Updates**: React components get connection status
   ```typescript
   // UI can respond to attachment state:
   {attachState.state === "attached" && (
     <div>Connected to cloud! 
       User: {attachState.ctx.tokenAndClaims?.claims.email}
     </div>
   )}
   ```

5. **🔒 Token Persistence**: JWTs are stored in KeyBag for future sessions
   ```typescript
   // KeyBag stores token namespaced by database ID:
   await keyBag.set(`${dbId}/urlToken`, { key: token });
   ```

> **For New Devs**: The React hook abstracts away most complexity of cloud connections, but understanding the token flow is important for troubleshooting. If your app can't connect to the cloud, check that the token acquisition strategy is working and examine the JWT claims for correct tenant/ledger values.

---

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

## 5. WebSocket - Messenger (`src/protocols/cloud/msger.ts`)

### What It Does

The `Msger` class is Fireproof's **protocol negotiator** for cloud connections. It manages high-level communication patterns, handling server discovery, authentication, and session establishment. It knows _which_ endpoint to connect to and _how_ to set up a compatible communication session.

### Why This Matters

For developers building cloud-sync features, understanding `Msger` helps you diagnose authentication problems and tenant/ledger configuration issues. This component translates your high-level "connect to cloud" requests into the specific protocols and endpoints needed, while handling retries and connection management.

```typescript
// Msger is typically created by a ToCloudGateway
const msger = new Msger({
  urls: ["https://fireproof.storage/api/v0"],
  conn: { tenant: "acme-corp", ledger: "inventory" },
  initialGestalt: defaultGestalt,
});

// Then you can make authenticated requests
const response = await msger.request(pullRequest, {
  waitFor: (msg) => msg.type === "res_pull"
});
```

### Key Metadata Structures

*   **`opts: MsgerOpts`**: ⭐ **Primary configuration**
    *   `urls: URI[]`: Potential server endpoints to try
    *   `initialGestalt?: Gestalt`: Client capabilities (protocol version, auth type)
    *   `conn?: ReqOpenConn`: ⭐ **Crucial identification metadata**:
        *   `tenant`, `ledger`: Database namespace identifiers
        *   `reqId`, `app`, `appVersion`, `user`, `session`: Context metadata

*   **`ExchangedGestalt` (in `this.exchangedGestalt`)**: Result of capability negotiation
    *   `my: Gestalt`: Client's capabilities
    *   `remote: Gestalt`: ⭐ **Server capabilities** and endpoint information

*   **`virtualConn` (in `this.virtualConn`)**: ⭐ **Established session context**
    *   Server-acknowledged `tenant`, `ledger`, server-assigned `session` ID

*   **`MsgBase.auth?: AuthType`**: ⭐ Authentication metadata (JWT token)

### Metadata Lifecycle

1. **🏁 Initialization**: `MsgerOpts` sets initial configuration
   ```typescript
   const msger = new Msger({
     urls: ["https://api.fireproof.host/api/v0"],
     conn: {
       tenant: "acme-corp", 
       ledger: "inventory-db"
     }
   });
   ```

2. **🔎 Capability Discovery**: Exchange capabilities with server
   ```typescript 
   // Internal flow during connection:
   const gestaltResponse = await httpClient.send(
     buildReqGestalt(sthis, auth, initialGestalt)
   );
   // Server capabilities determine how to connect
   this.exchangedGestalt = { 
     my: initialGestalt,
     remote: gestaltResponse.gestalt
   };
   ```

3. **📰 Protocol Selection**: Choose WebSocket or HTTP based on `remote.protocolCapabilities`
   ```typescript
   // Inside Msger.connect:
   if (remote.protocolCapabilities.includes("stream")) {
     // Use WebSocket with endpoint from remote.wsEndpoints
     connection = await this.openWS(selectedEndpoint);
   } else {
     // Fall back to HTTP with endpoint from remote.httpEndpoints
     connection = await this.openHttp(selectedEndpoint);
   }
   ```

4. **🔐 Session Establishment**: Send `ReqOpen` with tenant/ledger, get session ID
   ```typescript
   // During connection initialization:
   const openResponse = await this.request(
     buildReqOpen(this.sthis, auth, {
       tenant: "acme-corp",
       ledger: "inventory-db"
     }),
     { waitFor: MsgIsResOpen }
   );
   // Store server-issued parameters
   this.virtualConn = openResponse.conn;
   ```

5. **📢 Ongoing Communication**: All messages include auth and session context
   ```typescript
   // For example, when pulling data:
   const response = await this.request({
     type: "req_pull",
     tid: this.sthis.nextId().str,
     auth: this.authToken,
     conn: this.virtualConn, // Contains tenant, ledger, session
     branch: "main"
   });
   ```

> **For New Devs**: The Mesger's `virtualConn` contains your active session information after connection. If sync isn't working, examining this session metadata helps identify mismatched tenant/ledger settings between client and server.

---

## 4. WebSocket - Connection (`src/protocols/cloud/ws-connection.ts`)

This component wraps a raw WebSocket and manages message serialization/deserialization, request/response tracking using transaction IDs (`tid`), and stream binding. It forms the base for communication with the cloud backend.

**Key Metadata Structures & Locus:**

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

## 3. Blockstore - Loader (`src/blockstore/loader.ts`)

The `Loader` orchestrates data loading, committing, and manages interactions between local and remote stores. It's a central point for metadata flow related to database identity, encryption, and remotes.

**Key Metadata Structures & Locus:**

*   **`ebOpts: BlockstoreOpts` (constructor param, stored as `this.ebOpts`)**: The primary source of initial configuration.
    *   `url: URI`: Base URI for the database, expected to contain `PARAM.NAME`, `PARAM.KEY_NAME`/`PARAM.KEY` (for default encryption), `PARAM.TENANT`, `PARAM.LEDGER`.
    *   `keybag?: Partial<KeyBagOpts>`: Configuration for the `KeyBag` (e.g., Keybag's own `url`).
*   **`attachedStores: AttachedStores`**: Manages `ActiveStore` instances (local, remotes).
    *   Each `ActiveStore` (bundling `CarStore`, `MetaStore`, etc.) is initialized with a `URI` derived from `ebOpts.url` or `Attachable.url` (for remotes), carrying metadata like `PARAM.NAME`, `PARAM.KEY_NAME` down to individual stores.
*   **`DbMeta`**: As with `store.ts`, this object carries runtime metadata.
    *   `keyName?: string`: Crucial for specifying the encryption key set (from Keybag) used for associated CAR files. This is used during both load (for decryption) and commit (to record the key used).
*   **`Attachable` (for `Loader.attach`)**: Defines remote store connections.
    *   `url: URI`: URI of the remote store, providing its endpoint and potentially specific `PARAM.KEY_NAME`, `PARAM.TENANT`, `PARAM.LEDGER`.
    *   `name: string`: Local alias for the remote.

**Metadata Propagation & Management:**

1.  **Initialization**: `Loader` gets `ebOpts`. It creates `this.attachedStores`, deriving local store URIs from `ebOpts.url`.
2.  **Keybag Access**: `Loader.keyBag()` initializes and provides access to the `KeyBag` using `ebOpts.keybag` configuration. This shared Keybag is used by all stores managed by the Loader.
3.  **Attaching Remotes**: `Loader.attach(attachable)` uses `attachable.url` to configure a new `ActiveStore` for the remote, embedding remote-specific metadata.
4.  **Loading Data**: When `DbMeta` indicates CARs to load, the `Loader` directs the appropriate `ActiveStore`. The `CarStore` within that `ActiveStore` uses its own `_url` (with `PARAM.KEY_NAME`/`PARAM.KEY` from `ebOpts.url` or `DbMeta.keyName`) and the shared `KeyBag` (via `loader.keyBag()`) to get the `CryptoAction` for decryption. `DbMeta.keyName` is vital here.
5.  **Committing Data**: When committing, a `DbMeta` is created. This `DbMeta` is populated with the correct `keyName` (usually from `this.ebOpts.url`'s `PARAM.KEY_NAME` or a default) to link the new CAR files to their encryption key.

**Summary for `loader.ts` Metadata:** The `Loader` centralizes metadata management. It uses `BlockstoreOpts` (especially `ebOpts.url` and `ebOpts.keybag`) for initial setup and propagates this to its managed stores. It interprets `DbMeta.keyName` for runtime encryption/decryption context and uses `Attachable.url` for remote-specific metadata.

---

## 2. Blockstore - Stores (`src/blockstore/store.ts`)

### What It Does

Blockstore is Fireproof's **storage subsystem**. It translates operations like "save this document" into "encrypt these blocks and store them persistently." The `BaseStoreImpl` hierarchy (`MetaStoreImpl`, `DataStoreImpl`, `WALStoreImpl`) provides the foundation for Fireproof's content-addressable storage model.

### Why This Matters

For developers, understanding Blockstore means understanding _where_ data lives. All user content eventually passes through these stores, where encryption happens and persistence choices are made. As you build features on Fireproof, you'll rarely call these APIs directly, but they determine your app's performance characteristics.

```typescript
// Stores are typically created by the Loader, not directly:
const gateway = new IndexedDBGateway(ebOpts);
const dataStore = new DataStoreImpl(url, { loader, gateway });

// But you'll recognize the effects of operations that use them:
await database.put({ _id: "doc1", content: "Hello" });
// ↓↓↓ eventually flows into ↓↓↓
await dataStore.save(block); // encrypted, stored in IndexedDB
```

### Key Metadata Structures

*   **`_url: URI` (in `BaseStoreImpl`)**:  ⭐ **Primary store identifier and configurator**
    *   **Database Identification**: Contains `PARAM.NAME` (e.g., `dbName=myDatabase`) to identify the database
    *   **Store Type**: Uses `PARAM.STORE` (e.g., `store=meta`, `store=data`) to define the store's role
    *   **Encryption Context**: May contain `PARAM.KEY` or `PARAM.KEY_NAME` for crypto configuration
    *   **Gateway Selection**: URI scheme dictates which storage backend is used

*   **`opts.loader: Loadable`**: Provides access to shared resources, especially `KeyBag` via `loader.keyBag()`

*   **`DbMeta` (handled by `MetaStoreImpl`)**: ⭐ The **canonical state record** for your database
    *   `keyName?: string`: ⭐ **Encryption key identifier** - links stored blocks to their encryption key
    *   `branch: string`: The active branch (when using branching)
    *   `writer?: string`: Origin identifier for multi-writer scenarios
    *   `clock`, `cars`, `files`: The database's structural pointers

### Metadata Lifecycle

1. **🏁 Initialization**: Store creation requires two key items:
   ```typescript
   const store = new MetaStoreImpl(
     url, // Contains PARAM.NAME, KEY_NAME/KEY params
     { loader } // Provides access to Keybag for encryption
   );
   ```

2. **🔐 Encryption Setup** (`keyedCrypto()` in `BaseStoreImpl`):
   ```typescript
   // Simplified internal flow:
   const crypto = await keyedCryptoFactory(
     this._url, // Provides key params
     await this.loader.keyBag(), // Resolves key names
     this.sthis
   );
   ```

3. **💾 Metadata Persistence** (`MetaStoreImpl.save(meta: DbMeta)`):
   ```typescript
   // DbMeta includes keyName, linking data to encryption key
   await metaStore.save({ 
     keyName: "dbKey1", 
     branch: "main",
     // ... other metadata
   });
   ```

4. **📑 Data Storage** (`DataStoreImpl.save(block)`):
   - Data is encrypted using key from `DbMeta.keyName` or URL params
   - Content-addressed blocks are stored in the gateway

5. **🔍 Reading Data**: When loading, `MetaStoreImpl` fetches `DbMeta` first
   - `DbMeta.keyName` + `loader.keyBag()` = correct decryption key

> **For New Devs**: When troubleshooting data access issues, remember that both the URL and DbMeta influence encryption. If data can't be decrypted, check both sources to ensure the right key is found.

---

## 1. Keybag (`src/runtime/key-bag.ts`)

### What It Does

The Keybag is Fireproof's **cryptographic keyring**. It manages encryption keys across browser sessions, devices, and storage backends. Think of it as a small secure vault that accompanies your data everywhere.

### Why This Matters

For developers, Keybag is your entry point to Fireproof's encryption system. Every database needs keys, and Keybag provides them consistently regardless of environment (browser, Node.js, etc). When data flows through the system, its identity is tied to these keys.

```typescript
// How you'll typically interact with KeyBag:
const keyBag = await rt.kb.getKeyBag(sthis);
const cryptoKey = await keyBag.getNamedKey('myDatabaseName');
```

### Key Metadata Structures

*   **`KeyBagRuntime`**: The runtime configuration for key management
    *   `url: URI`: ⭐ The **primary identifier** for a Keybag instance (e.g., `indexeddb://fp-keybag`, `file:///path/to/keybag`). This URI's scheme (`indexeddb:`, `file:`) dictates the storage backend. It's derived from options, environment variables (`FP_KEYBAG_URL`), or defaults.
    *   `sthis: SuperThis`: Runtime environment access and ID generation

*   **`KeysByFingerprint` / `KeysItem`**: How keys are persisted
    *   `name: string`: ⭐ A logical **name for a key set** (e.g., a database name) - crucial for retrieving related keys as a group

*   **`KeyWithFingerPrint` / `V2StorageKeyItem`**: Individual key management
    *   `fingerPrint: string`: ⭐ A unique **hash of the key material**, used for content-addressable lookup
    *   `default: boolean`: Indicates if this is the default key in a named set
    *   `key: string`: The key material itself (typically base58btc encoded)

### Metadata Lifecycle

1. **🏁 Initialization**: `KeyBagRuntime.url` determines *where* and *how* keys are stored
   ```typescript
   // URL format influences storage backend selection:
   const keyBag = await getKeyBag({ url: 'indexeddb://fp-keybag-custom' });
   ```

2. **📝 Key Requests**: Components request keys using a `name` 
   ```typescript 
   const cryptoKey = await keyBag.getNamedKey('myDatabase');
   ```

3. **🔍 Resolution**: Keys are located by their `fingerPrint` internally

4. **💾 Persistence**: `KeyBagProvider` implementations store `KeysItem` objects keyed by `name`

5. **🔗 URI Parameters**: The system can extract key material from URIs (e.g., `url.getParam(PARAM.KEY)`)
   ```typescript
   // For debugging only - masterkey in URL params is forbidden for production
   const uri = BuildURI.new().param('key', 'directKey123').URI();
   ```

> **For New Devs**: When designing database operations, think about how you'll identify and retrieve keys. The `name` parameter serves as your primary key grouping mechanism.

---

---
