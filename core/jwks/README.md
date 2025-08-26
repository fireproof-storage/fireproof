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
  maxKeys: 5
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

- `fetchJwks(url)` - Legacy function (deprecated, use fetchJWKS instead)

## Configuration

Supports multiple input formats:
- Direct URLs: `"https://example.com/.well-known/jwks.json"`
- Clerk shortcuts: `"trusted-glowworm-5"` 
- Clerk domains: `"trusted-glowworm-5.clerk.accounts.dev"`

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

```
src/
├── validator.ts    # Core JWKS validation logic
├── fetcher.ts      # Legacy compatibility layer
└── index.ts        # Package exports
tests/
├── basic.test.ts        # Unit tests
└── integration.test.ts  # Integration tests with live endpoints
```
