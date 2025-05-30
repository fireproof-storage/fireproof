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
