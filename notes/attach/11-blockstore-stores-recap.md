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

These structures control how data is stored, encrypted, and addressed in Fireproof's storage system. They define the relationship between database identifiers, content addresses, and encryption contexts.

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
