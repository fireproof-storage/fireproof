## 3. Blockstore - Loader (`src/blockstore/loader.ts`)

The `Loader` orchestrates data loading, committing, and manages interactions between local and remote stores. It's a central point for metadata flow related to database identity, encryption, and remotes.

**Key Metadata Structures & Locus:**

These structures coordinate data flow between local and remote storage systems. They manage encryption contexts, store connections, and maintain database state across synchronization boundaries.

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
