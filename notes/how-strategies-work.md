# How Token Strategies Work in Fireproof

This document explains the different token authentication strategies available in Fireproof and how they implement the `TokenStrategie` interface.

## TokenStrategie Interface

All token strategies implement the `TokenStrategie` interface defined in `core/types/protocols/cloud/gateway-control.ts:19`:

```typescript
export interface TokenStrategie {
  open(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): void;
  tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
  waitForToken(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
  stop(): void;
}
```

### Interface Methods

- **`open()`** - Initialize the strategy and set up authentication UI/flow
- **`tryToken()`** - Attempt to get a token immediately (non-blocking)
- **`waitForToken()`** - Wait for a token, potentially blocking until available
- **`stop()`** - Clean up resources and stop any ongoing processes

## Available Strategies

### 1. SimpleTokenStrategy (`core/gateways/cloud/to-cloud.ts:238`)

**Purpose**: For programmatic/service authentication with pre-configured tokens.

**Implementation**:

- **`open()`**: No-op - token already available
- **`tryToken()`**: Returns pre-configured token immediately
- **`waitForToken()`**: Same as `tryToken()` - returns immediately
- **`stop()`**: No-op - no resources to clean up

**Characteristics**:

- ✅ Immediate token access
- ✅ No user interaction required
- ✅ Works in any environment (browser, Node.js, etc.)
- ✅ Minimal implementation
- ❌ Requires pre-existing valid JWT token

**Use Case**: Server-side applications, automated scripts, or when you already have a valid token.

### 2. RedirectStrategy (`use-fireproof/redirect-strategy.ts:67`)

**Purpose**: Interactive browser authentication with popup-based login flow.

**Implementation**:

- **`open()`**:
  - Creates DOM overlay with login UI
  - Opens popup window to Fireproof Dashboard
  - Sets up `resultId` for tracking auth session
  - Builds redirect URL with parameters (back_url, result_id, ledger, tenant)

- **`tryToken()`**:
  - Returns cached token if available
  - Gets token from WebContext if not cached
  - Non-blocking - returns current state immediately

- **`waitForToken()`**:
  - Polls dashboard API using `resultId`
  - Blocks until user completes authentication or timeout
  - Updates internal token cache when received

- **`stop()`**:
  - Clears polling timeouts
  - Sets wait state to "stopped"
  - Stops async token retrieval

**Characteristics**:

- ✅ Full interactive authentication flow
- ✅ Proper error handling and timeouts
- ✅ Resource cleanup and state management
- ✅ Customizable overlay UI (CSS and HTML)
- ❌ Requires browser environment
- ❌ May be blocked by popup blockers
- ❌ Complex implementation

**Use Case**: End-user authentication in web applications where users need to log in via Fireproof Dashboard.

### 3. IframeStrategy (`use-fireproof/iframe-strategy.ts:7`)

**Purpose**: Embedded browser authentication without popups.

**Implementation**:

- **`open()`**:
  - Creates full-screen overlay with embedded iframe
  - Loads Fireproof Dashboard directly in iframe
  - No popup window - embedded experience

- **`tryToken()`**:
  - Gets token from WebContext
  - Non-blocking immediate return
  - Contains commented legacy URL-based token code

- **`waitForToken()`**:
  - ⚠️ **Currently broken** - returns Promise that never resolves
  - Implementation incomplete

- **`stop()`**:
  - No-op - doesn't clean up created DOM elements

**Characteristics**:

- ✅ No popup blocking issues
- ✅ Integrated in-page experience
- ❌ **Incomplete implementation** - `waitForToken()` doesn't work
- ❌ No resource cleanup
- ❌ Potential cross-origin iframe restrictions
- ❌ Leaves DOM elements after use

**Use Case**: Intended for embedded authentication but currently not production-ready due to incomplete implementation.

## Strategy Comparison

| Feature                   | SimpleTokenStrategy | RedirectStrategy  | IframeStrategy      |
| ------------------------- | ------------------- | ----------------- | ------------------- |
| **User Interaction**      | None                | Popup + overlay   | Embedded iframe     |
| **Implementation Status** | ✅ Complete         | ✅ Complete       | ⚠️ Incomplete       |
| **Resource Cleanup**      | ✅ N/A              | ✅ Yes            | ❌ No               |
| **Cross-Origin Handling** | ✅ N/A              | ✅ Via popup/API  | ⚠️ Potential issues |
| **Popup Blocking**        | ✅ N/A              | ❌ Can be blocked | ✅ No popups        |
| **Error Handling**        | ✅ Simple           | ✅ Comprehensive  | ❌ Minimal          |
| **Environment**           | Any                 | Browser only      | Browser only        |

## Token Lifecycle Patterns

### SimpleTokenStrategy Flow

```
Constructor(token) → open() → tryToken()/waitForToken() → Returns token immediately
```

### RedirectStrategy Flow

```
open() → User sees overlay → User clicks link → Popup opens → User authenticates
      → waitForToken() polls API → Token received → Overlay hidden → Token cached
```

### IframeStrategy Flow (Current)

```
open() → User sees iframe → User authenticates → tryToken() gets from context
waitForToken() → ⚠️ Hangs forever (broken)
```

## Choosing a Strategy

- **Use SimpleTokenStrategy when**:
  - You have a pre-existing valid JWT token
  - Building server-side applications
  - No user authentication flow needed

- **Use RedirectStrategy when**:
  - Building web applications with user authentication
  - Users need to log in via Fireproof Dashboard
  - You can handle popup windows

- **Avoid IframeStrategy currently**:
  - Implementation is incomplete
  - `waitForToken()` doesn't work
  - No proper cleanup

## Implementation Notes

- All strategies work with the `WebToCloudCtx` context for browser-based token management
- RedirectStrategy is the most mature and feature-complete for interactive authentication
- SimpleTokenStrategy is best for programmatic access
- IframeStrategy needs completion before production use

## Future Considerations

- IframeStrategy could be completed to provide popup-free authentication
- Additional strategies could be added (e.g., device code flow, client credentials)
- Better error handling and user feedback across all strategies
- Consistent resource cleanup patterns
