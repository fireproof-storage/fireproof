# Fireproof Bidirectional Sync: Cryptographic Key Exchange Issue

## Executive Summary

Our investigation into bidirectional sync failures has identified a fundamental issue with the cryptographic key exchange mechanism in Fireproof. The current implementation creates an asymmetric trust relationship between databases, preventing reliable bidirectional synchronization.

**Root Cause**: Databases cannot properly exchange cryptographic trust credentials in a bidirectional manner.

**Key Evidence**: When using explicitly shared keys, bidirectional sync works properly. This confirms the issue lies in the key exchange mechanism rather than in the sync protocol itself.

## Technical Details

### Observed Behavior

1. **One-way sync (A→B)**: Unreliable but sometimes works
2. **Bidirectional sync (A↔B)**: Consistently fails
3. **Key error pattern**: Recurring `keysbyfingerprint:get: not found` errors during sync attempts

### Error Signature

```json
{
  "fpr": "z3vDYXpCwxWAyUk2kP6DJdh3M3r3WXcU1ZcSP3w8GH1B1",
  "fprs": ["zxKYi1AEzvtpqi5sjjV29wHRHkqUDGVRc1LgF5svryz7", "*"],
  "level": "error",
  "module": "KeyBag",
  "msg": "keysbyfingerprint:get: not found",
  "name": "@db-b-z25nFRggfK-data@"
}
```

### Reproduction Case

We've created targeted tests in `tests/fireproof/bidirectional-sync.test.ts` that reliably demonstrate:

1. Even basic one-way sync struggles with key exchange
2. Bidirectional sync consistently fails due to key exchange issues
3. Using a shared explicit key (bypassing standard key exchange) enables successful bidirectional sync

```typescript
// Using explicit shared keys enables bidirectional sync
const sharedKey = `explicit-shared-key-${Date.now()}`;

const createSharedKeyAttachable = (name: string): Attachable => {
  return {
    name,
    configHash: async () => `sync-joinable-${name}`,
    prepare: () => Promise.resolve({
      car: {
        url: BuildURI.from(`memory://car/${name}`)
          .setParam(PARAM.STORE_KEY, sharedKey)
          .setParam(PARAM.SELF_REFLECT, "x"),
      },
      // Similar for meta and file...
    }),
  };
};
```

## Architectural Implications

### Current Limitations

1. **Default Trust Model**: The current implementation appears to enforce an asymmetric trust model where databases can receive data from others but not necessarily write back to the same shared space.

2. **Security vs. Convenience**: The restrictive key exchange seems to prioritize security over seamless bidirectional operation.

3. **Implementation Complexity**: The key exchange mechanism is sophisticated but not well-documented, making it difficult for developers to understand when bidirectional sync will work.

### User Impact

Applications must adopt a primary/replica architecture rather than peer-to-peer, with designated databases as primary writers and others as readers.

## Potential Solutions

1. **Trust Configuration Option**: Add an explicit option for databases to trust each other bidirectionally.

2. **Automatic Key Exchange Enhancement**: Improve the automatic key exchange mechanism to properly establish bidirectional trust.

3. **Shared Key Mode**: Provide a simplified "shared key" mode for use cases where bidirectional sync is required and the security trade-offs are acceptable.

4. **Documentation Clarification**: Update documentation to explain the current limitations and provide architectural patterns that work with the current implementation.

## Next Steps

1. Determine if the current asymmetric trust model is intentional or an implementation gap
2. If intentional, document the pattern and provide developers with clear guidance
3. If unintentional, prioritize fixes to the key exchange mechanism
4. Implement automated tests that verify bidirectional sync as part of the CI pipeline

## References

- Diagnostic test file: `tests/fireproof/bidirectional-sync.test.ts`
- Documentation: `notes/bidirectional.md`
- Original failing test: `tests/fireproof/attachable.test.ts` (line ~607)
