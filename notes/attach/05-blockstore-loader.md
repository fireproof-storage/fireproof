## 3. Blockstore - Loader (`src/blockstore/loader.ts`)

### What It Does

The `Loader` is Fireproof's **data orchestrator**. It coordinates between local storage, remote replicas, and the KeyBag. When your app says "load this database," the Loader handles fetching blocks from appropriate stores, decrypting them, and resolving dependencies.

### Key Metadata Structures

These structures coordinate how data flows between local and remote stores while maintaining cryptographic consistency. They define the configuration, connection parameters, and runtime state needed for multi-device synchronization.

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

These structures define how the Loader orchestrates data operations across local and remote stores, ensuring consistent encryption and synchronization between devices.

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

## Additional Details

### BlockstoreOpts
> `BlockstoreOpts` is the main configuration object for Fireproof's block storage layer. It lets you specify which storage backends to use, how encryption keys are managed, and other advanced options like logging and compaction that affect storage behavior.

*   **`ebOpts: BlockstoreRuntime`**: ⭐ **Blockstore configuration**
    *   `autoCompact: number`: Maximum number of CARs before automatic compaction
    *   `keyBag?: Partial<KeyBagOpts>`: KeyBag configuration

### attachedStores: AttachedStores
*   **`attachedStores: AttachedStores`**: Manages both local and remote stores
    *   Each `ActiveStore` is initialized with metadata from `ebOpts.url` or `attachable.url`

### DbMeta
> `DbMeta` holds runtime metadata about the database, including which encryption key is active, the current writer, and branch information. It ensures that all data operations use the correct context.

*   **`DbMeta`**: ⭐ Runtime state metadata about the database
    *   `keyName?: string`: Encryption key for referenced data blocks
    *   `writer?: string`: Source identifier
    *   `branch?: string`: Branch name for versioned data

### Attachable (used in Loader.attach)
> The `Attachable` structure specifies how to connect to a remote store, including the remote endpoint and any relevant metadata such as tenant or ledger identifiers.

*   **`Attachable` (used in `Loader.attach`)**: ⭐ Remote connection specification
    *   `url: URI`: Remote endpoint with potential metadata (tenant, ledger, etc.)
    *   `name: string`: Local alias for the connection

### Metadata Lifecycle (Expanded)

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

