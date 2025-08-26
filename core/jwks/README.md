# @fireproof/core-jwks

JWKS (JSON Web Key Set) validation and fetching for Fireproof.

## Features

- ✅ Fetch JWKS from URLs with retry logic and error handling
- ✅ Validate individual keys and entire key sets
- ✅ Support for Clerk authentication URLs
- ✅ Check if keys are current and active
- ✅ Comprehensive error handling and reporting
- ✅ TypeScript support with full type definitions

## Usage

```typescript
import { fetchAndValidateJWKS } from "@fireproof/core-jwks";

// Fetch and validate Clerk JWKS
const result = await fetchAndValidateJWKS("trusted-glowworm-5", {
  allowedKeyTypes: ["RSA"],
  allowedUse: ["sig"],
  requireKeyId: true,
  maxKeys: 5,
});

if (result.is_ok()) {
  const { jwks, validation } = result.unwrap();
  console.log(`Found ${validation.currentKeysCount} current keys`);
} else {
  console.error("JWKS validation failed:", result.unwrap_err().message);
}
```

## API

### Main Functions

- `fetchJWKS(config, options?)` - Fetch JWKS with retry logic
- `validateJWKS(jwks, options?)` - Validate a JWKS object
- `fetchAndValidateJWKS(config, validationOptions?, fetchOptions?)` - Combined fetch and validate
- `buildJWKSUrl(config)` - Build JWKS URL from configuration

### Utility Functions

- `getCurrentKeys(validationResult)` - Get only current/active keys
- `findKeyById(jwks, keyId)` - Find specific key by ID

### Legacy Compatibility

- `fetchJwks(url)` - Legacy function (deprecated). **Note: this API throws `JWKSFetchError` on failure**, whereas `fetchJWKS`/`fetchAndValidateJWKS` return a `Result`. Adjust your error handling accordingly.

```typescript
// Legacy (throws)
try {
  const jwks = await fetchJwks("https://example.com/.well-known/jwks.json");
} catch (error) {
  console.error(error.message);
}

// New (Result)
const res = await fetchJWKS("https://example.com/.well-known/jwks.json");
if (res.is_err()) {
  console.error(res.unwrap_err().message);
} else {
  console.log(res.unwrap());
}
```

## Configuration

Supports multiple input formats:

- Direct URLs, e.g., `"https://example.com/.well-known/jwks.json"`.
- Clerk tenant shortcuts, e.g., `"trusted-glowworm-5"`.
- Clerk domain hostnames, e.g., `"trusted-glowworm-5.clerk.accounts.dev"`.

## Error Handling

The package uses Result types from `@adviser/cement` for comprehensive error handling:

- `JWKSFetchError` - Network and fetch-related errors
- `JWKSValidationError` - Key validation errors

## Testing

Run tests locally:

```bash
# Basic unit tests
npx vitest run tests/basic.test.ts

# Integration tests (with live Clerk endpoint)
npx vitest run tests/integration.test.ts

# All tests
./test-all.sh
```

## Structure

```text
src/
├── validator.ts    # Core JWKS validation logic
├── fetcher.ts      # Legacy compatibility layer
└── index.ts        # Package exports
tests/
├── basic.test.ts        # Unit tests
└── integration.test.ts  # Integration tests with live endpoints
```
