# Metadata Propagation in Fireproof (mabels/dashboard-api Branch)

This document outlines how metadata is propagated through key components of the Fireproof system, focusing on the `mabels/dashboard-api` branch.

## Core Components and Metadata Flow

We will examine the following components:
- Keybag
- Blockstore
- Loader
- WebSocket (Cloud Protocol)
- Dashboard API
- `useAttach` (React Hook)

---

## 6. React Hook - UI Attachment (`src/react/use-attach.ts`)

This React hook (`createAttach`) manages attaching a local Fireproof database to a cloud backend. It handles UI state and, crucially, authentication token management via `WebCtxImpl` (`WebToCloudCtx`).

**Key Metadata Structures & Locus:**

*   **`config: UseFPConfig` (parameter to `createAttach`)**: Contains the attachment configuration.
    *   `attach?: ToCloudAttachable`: Primary cloud connection config.
        *   `url: URI`: Base URL for the cloud service (passed to `Msger`).
        *   `opts: ToCloudOptionalOpts`:
            *   `context: AppContext`: Holds shared instances, notably `WebToCloudCtx`.
            *   `strategy?: TokenStrategie`: Defines how tokens are obtained/managed.
            *   `tenant?: string`, `ledger?: string`: Tenant/ledger IDs for `Msger`'s `ReqOpenConn`.
            *   `initialGestalt?: Gestalt`: Client's initial capabilities for `Msger`.
*   **`WebCtxImpl` (implements `WebToCloudCtx`)**: Manages cloud connection context, retrieved from `AppContext`.
    *   `dashboardURI`, `tokenApiURI`: URLs related to token acquisition/management UIs.
    *   `keyBag?: rt.KeyBagProvider`: Used to store the JWT token persistently (namespaced by `dbId`).
    *   `dbId: string`: ID of the local database.
    *   `_tokenAndClaims: ResolveOnce<TokenAndClaims>`: Holds the current JWT and its decoded claims.
        *   `TokenAndClaims`: Contains `token: string` (the JWT) and `claims: FPCloudClaim`.
        *   `FPCloudClaim` (from `msg-types.js`): Decoded JWT claims, including standard JWT fields (`iss`, `sub`, `aud`, `exp`) and Fireproof-specific claims (`tenant`, `ledger`, `session`, `name`, `email`). This is rich metadata from the auth provider.

**Metadata Propagation & Management:**

1.  **Initialization (`createAttach` hook)**:
    *   Retrieves `WebToCloudCtx` (e.g., `WebCtxImpl`) from `config.attach.opts.context`.
    *   `webCtx.ready(database)` initializes `dbId` and `keyBag` in `WebCtxImpl`.
    *   Subscribes to token changes via `webCtx.onTokenChange()`. When a token is available, React state is updated with `TokenAndClaims`, making it available to the UI.
2.  **Token Management (`WebCtxImpl`)**:
    *   `token()`: Loads JWT from `KeyBag` (or `opts.token`), decodes it into `FPCloudClaim`, caches it, and notifies listeners.
    *   `setToken()`: Stores JWT in `KeyBag`, updates cache, notifies listeners.
    *   `resetToken()`: Clears JWT from `KeyBag`, clears cache, notifies listeners.
3.  **Attaching (`database.attach(attachable)`)**: The `ToCloudAttachable` object is passed.
    *   This leads to `ToCloudGateway` instantiation, which receives `opts` from `ToCloudAttachable` (including `tenant`, `ledger`, `context` with `WebToCloudCtx`).
    *   `ToCloudGateway` uses `WebToCloudCtx.token()` to get the JWT. This token becomes the `AuthType` for the `Msger` instance it creates.
    *   `tenant` and `ledger` from `ToCloudAttachable.opts` are passed to `MsgerOpts.conn` for the `ReqOpen` message.

**Summary for `use-attach.ts`:** This hook bridges UI configuration and authentication with the backend connection logic.
It takes `ToCloudAttachable` (with cloud URL, tenant, ledger). `WebCtxImpl` manages the JWT (`TokenAndClaims`), storing it in `KeyBag` and providing decoded `FPCloudClaim` (which includes tenant/ledger from the token). The JWT is passed to `Msger` as `AuthType`. Configured tenant/ledger are passed to `Msger` for `ReqOpen`. The hook exposes token/claims and attachment status to React components.

---

## 5. WebSocket - Messenger (`src/protocols/cloud/msger.ts`)

The `Msger` class is a higher-level abstraction over `WSConnection` (or `HttpConnection`). It manages the full connection lifecycle, including protocol negotiation (`Gestalt` exchange) and establishing a "virtual connection" with the server, which includes tenant and ledger context.

**Key Metadata Structures & Locus:**

*   **`opts: MsgerOpts` (constructor parameter)**: Primary configuration.
    *   `urls: URI[]`: Potential base URLs for the server.
    *   `initialGestalt?: Gestalt`: Client's proposed capabilities (protocol version, ws/http endpoints, auth type).
    *   `conn?: ReqOpenConn`: Initial connection parameters for `ReqOpen`, including `tenant`, `ledger`, `reqId`, `app`, `appVersion`, `user`, `session`.
    *   `imsgP?`: Parameters for message encoding/decoding and timeouts.
*   **`ExchangedGestalt` (stored as `this.exchangedGestalt`)**: Results of negotiation.
    *   `my: Gestalt`: Client's final gestalt.
    *   `remote: Gestalt`: Server's gestalt, confirming protocol features, server endpoints (WS/HTTP), and auth requirements. This is metadata about the server's capabilities.
*   **`virtualConn?: ReqOpenConn` (stored as `this.virtualConn`)**: Populated from `ResOpen` from the server.
    *   Represents the established "virtual connection" with server-acknowledged/assigned metadata (e.g., server-assigned `session` ID, confirmed `tenant`, `ledger`).
*   **`MsgBase.auth?: AuthType`**: Attached to messages, can be `FPJWKCloudAuthType` which includes `token: string`.

**Metadata Propagation & Management:**

1.  **Initialization (`Msger.constructor`)**: Receives `MsgerOpts` (URLs, initial `Gestalt`, initial `ReqOpenConn` params like tenant/ledger).
2.  **Connection (`Msger.connect`)**: Critical for metadata exchange.
    *   Takes `auth: AuthType` (with token) and a `curl` (specific URL to try).
    *   **Gestalt Exchange**: Sends `ReqGestalt` (with client's `initialGestalt` and `auth` token) to the `/gestalt` HTTP endpoint. Receives `ResGestalt`. The `remote` gestalt is stored in `this.exchangedGestalt`, providing server capabilities and correct service endpoints.
    *   **Protocol Selection & Real Connection**: Based on `remote.protocolCapabilities`, connects to the appropriate WS or HTTP endpoint (from `remote.wsEndpoints` or `remote.httpEndpoints`) using `WSConnection` or `HttpConnection`.
3.  **Opening Virtual Connection (`Msger.getQSIdWithSideEffect`)**: After physical connection, sends `ReqOpen`.
    *   `buildReqOpen` uses the `auth` token and `ReqOpenConn` (from `this.opts.conn` and any existing `this.virtualConn`).
    *   Receives `ResOpen`. The `conn` field from `ResOpen` (type `ReqOpenConn`) is stored in `this.virtualConn`, holding server-acknowledged session parameters (session ID, tenant, ledger).
4.  **Subsequent Requests**: Messages carry the `auth` token and often `this.virtualConn` details (tenant, ledger, session ID) as required by the message type (e.g., `MsgWithConn`).

**Summary for `msger.ts`:** `Msger` handles session establishment and protocol negotiation.
It uses `MsgerOpts` for initial config (URLs, client Gestalt, tenant/ledger). `AuthType` (token) is used for authentication. Gestalt exchange negotiates protocols and server endpoints. `ReqOpen`/`ResOpen` establishes a logical session, exchanging tenant, ledger, app info, and obtaining a server session ID, all stored in `virtualConn`. Subsequent messages use this established context.

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

The `BaseStoreImpl` and its derivatives (`MetaStoreImpl`, `DataStoreImpl`, `WALStoreImpl`) manage the persistence of data (blocks) and metadata (database state).

**Key Metadata Structures & Locus:**

*   **`_url: URI` (in `BaseStoreImpl`)**: This is a primary metadata carrier for each store instance.
    *   **Database Identification**: Must contain `PARAM.NAME` (e.g., `dbName=myDatabase`) to identify the database.
    *   **Store Type**: Augmented with `PARAM.STORE` (e.g., `store=meta`, `store=data`) to define the store's role.
    *   **Encryption Context**: Can carry `PARAM.KEY` (raw key material) or `PARAM.KEY_NAME` (a name referencing a key set in the Keybag). This is vital for `keyedCryptoFactory`.
    *   **Gateway Configuration**: The `_url`'s scheme (`file:`, `indexeddb:`, etc.) and path determine the storage backend (`SerdeGateway`) and location.
    *   **Other Context**: May include `PARAM.TENANT`, `PARAM.LEDGER`, `PARAM.VERSION`.
*   **`opts.loader: Loadable` (passed to Store constructor)**: This `loader` instance provides access to shared resources, most importantly the `KeyBag` via `loader.keyBag()`. This allows the store to resolve `PARAM.KEY_NAME` from its `_url` into cryptographic keys.
*   **`DbMeta` (handled by `MetaStoreImpl`)**: A critical metadata object representing database state.
    *   `keyName?: string`: **Crucially**, this stores the name of the key set (from Keybag) used to encrypt the data blocks (CAR files) associated with this database state. This ensures the correct decryption key can be retrieved later.
    *   `branch: string`, `writer?: string`, `clock`, `cars`, `files`: Other structural and contextual metadata.

**Metadata Propagation & Management:**

1.  **Initialization**: A store is created with a base `url` (containing `PARAM.NAME`) and `opts` (providing the `loader`).
2.  **Encryption Setup (`keyedCrypto()` method in `BaseStoreImpl`)**:
    *   Invoked for operations requiring crypto.
    *   Uses `keyedCryptoFactory(this._url, await this.loader.keyBag(), ...)`. The `_url` provides `PARAM.KEY` or `PARAM.KEY_NAME`, and `loader.keyBag()` supplies the Keybag instance to resolve key names or use provided material.
3.  **Saving Metadata (`MetaStoreImpl.save(meta: DbMeta)`)**:
    *   The `DbMeta` object, including its `keyName`, is persisted. This `keyName` is essential for linking the database state to its encryption key.
4.  **Saving Data (`DataStoreImpl.save(block)`)**:
    *   If encryption is active, the block is encrypted using the key derived from `DbMeta.keyName` (or `_url`'s key parameters) via `keyedCrypto`.
5.  **Loading Data/Metadata**: When loading, `MetaStoreImpl` retrieves `DbMeta`. The `DbMeta.keyName` (or `_url`'s key params) is used with `keyedCryptoFactory` and `loader.keyBag()` to obtain the correct decryption key.

**Summary for `store.ts` Metadata:** The `_url` (with `PARAM.NAME`, `PARAM.KEY_NAME`/`PARAM.KEY`) and `DbMeta.keyName` are central. The `_url` sets up the store's identity and initial encryption context. `DbMeta.keyName` explicitly links a database state to its encryption key. The `loader` acts as a bridge to the `KeyBag`.

---

## 1. Keybag (`src/runtime/key-bag.ts`)

The Keybag is responsible for managing cryptographic keys. Metadata here relates to key identification, storage, and grouping.

**Key Metadata Structures:**

*   `KeyBagRuntime`:
    *   `url: URI`: The primary identifier for a Keybag instance (e.g., `indexeddb://fp-keybag`, `file:///path/to/keybag`). This URI's scheme (`indexeddb:`, `file:`) dictates the storage backend, and the path/name specifies the location. It's derived from options, environment variables (`FP_KEYBAG_URL`), or defaults.
    *   `sthis: SuperThis`: Provides access to environment context and ID generation.
*   `KeysByFingerprint` / `KeysItem` (for persistence):
    *   `name: string`: A logical name for a set of keys (e.g., a database name). This is crucial for grouping and retrieving related keys.
*   `KeyWithFingerPrint` / `V2StorageKeyItem` (for persistence):
    *   `fingerPrint: string`: A unique hash of the key material, used for content-addressable lookup within a named set.
    *   `default: boolean`: Indicates if this is the default key in a named set.
    *   `key: string`: The key material itself (e.g., base58btc encoded string in `V2StorageKeyItem`).

**Metadata Propagation & Management:**

1.  **Initialization & Configuration:** The `KeyBagRuntime.url` is the central piece of configuration metadata, determining *where* and *how* keys are stored (e.g., IndexedDB vs. file system).
2.  **Named Key Sets:** External components request keys using a `name` (e.g., `database.getNamedKey('myDB')`). This `name` is persisted with the keys, allowing them to be retrieved as a group.
3.  **Key Identification:** Internally, keys are identified by their `fingerPrint`.
4.  **Persistence:** The `KeyBagProvider` (selected based on the `url`'s scheme) stores `KeysItem` objects, using the `name` as the primary lookup identifier for a collection of keys.
5.  **URI Parameters:** The system can also extract key material or related parameters if they are encoded in URIs (e.g., `url.getParam(PARAM.KEY)`), though `masterkey` in URL params is explicitly disallowed.

**Summary for Keybag Metadata:** The `name` of a key set (often a database name) and the `KeyBagRuntime.url` (defining storage type and location) are the most critical pieces of metadata. These are used to associate keys with their respective databases or purposes and to manage their persistence.

---
