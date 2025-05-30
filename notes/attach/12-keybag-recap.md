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

These structures form the cryptographic foundation of Fireproof's security model. They define how encryption keys are created, stored, retrieved, and associated with specific databases.

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
