import { describe, it, expect } from 'vitest';
import { ensureURIDefaults } from '../src/utils.js';
import { BuildURI, Logger } from '@adviser/cement';
import { PARAM, StoreType, SuperThis } from '@fireproof/core'; // Assuming types are here
// import { mockSuperThis } from './helpers'; // We'll need a mock for SuperThis

// A minimal mock for SuperThis, to be expanded as needed
const mockSuperThisMinimal = (): Partial<SuperThis> => {
  // Helper to create a LogBuilder mock part
  // The LogBuilder interface is complex, so we mock only what's used by ensureURIDefaults
  const createLogBuilder = (level: string) => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Msg: (_message: string) => ({ // Using _message for potentially unused parameter
      AsError: () => new Error(`Mock Error from ${level}`),
      // Log: () => { /* no-op */ }
    }),
    With: function() { return this; }, // Fluent interface
    Stv: function() { return this; }    // Fluent interface
  });

  const loggerInstance = {
    Error: () => createLogBuilder('Error'),
    Info: () => createLogBuilder('Info'),
    Warn: () => createLogBuilder('Warn'),
    Debug: () => createLogBuilder('Debug'),
    // Add stubs for other Logger methods/properties if ensureURIDefaults uses them
    // For now, these are the ones that might be expected by the Logger type itself
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Msg: (_message: string) => createLogBuilder('DefaultMsgLevel'), // Top-level Msg
    Flush: async () => { /* no-op */ },
    levelHandler: { /* minimal stub or actual mock if needed */ },
    TxtEnDe: { encode: (s: string) => new Uint8Array(s.length), decode: (b: Uint8Array) => b.toString() }, 
    Child: function() { return this as unknown as Logger; },
    With: function() { return this as unknown as Logger; },
    Stv: function() { return this as unknown as Logger; }
    // ... and potentially other properties from the Logger interface if TS still complains
  };

  return {
    logger: loggerInstance as unknown as Logger, // Using unknown as Logger for partial mock
    // Add other SuperThis properties if ensureURIDefaults accesses them
  };
};

describe('ensureURIDefaults', () => {
  const baseUri = BuildURI.from('fireproof://mydatabase').URI();
  const defaultName = 'testDb';

  it('should set STORE_KEY to insecure and apply store type when opts.public is true', () => {
    const sthis = mockSuperThisMinimal() as SuperThis;
    const names = { name: defaultName };
    const opts = { public: true };
    const store: StoreType = 'car';

    const resultUri = ensureURIDefaults(sthis, names, opts, baseUri, store);

    expect(resultUri.getParam(PARAM.STORE_KEY)).toBe('insecure');
    expect(resultUri.getParam(PARAM.STORE)).toBe('car');
    expect(resultUri.getParam(PARAM.NAME)).toBe(defaultName);
  });

  it('should use opts.storeKey when public is false and storeKey is provided', () => {
    const sthis = mockSuperThisMinimal() as SuperThis;
    const names = { name: defaultName };
    const opts = { public: false, storeKey: 'customKey123' };
    const store: StoreType = 'car';

    const resultUri = ensureURIDefaults(sthis, names, opts, baseUri, store);

    expect(resultUri.getParam(PARAM.STORE_KEY)).toBe('customKey123');
    expect(resultUri.getParam(PARAM.STORE)).toBe('car');
    expect(resultUri.getParam(PARAM.NAME)).toBe(defaultName);
  });

  it('should use STORE_KEY from names.localURI when public is false and opts.storeKey is not set', () => {
    const sthis = mockSuperThisMinimal() as SuperThis;
    const localStoreKey = 'keyFromLocalURI';
    const localUriWithKey = BuildURI.from('file:///another?storekey=' + localStoreKey).URI();
    const names = { name: defaultName, localURI: localUriWithKey };
    const opts = { public: false }; // storeKey is undefined
    const store: StoreType = 'wal';

    const resultUri = ensureURIDefaults(sthis, names, opts, baseUri, store);

    expect(resultUri.getParam(PARAM.STORE_KEY)).toBe(localStoreKey);
    expect(resultUri.getParam(PARAM.STORE)).toBe('wal');
    expect(resultUri.getParam(PARAM.NAME)).toBe(defaultName);
  });

  it('should generate a new STORE_KEY when public is false and no key is provided', () => {
    const sthis = mockSuperThisMinimal() as SuperThis;
    const names = { name: defaultName, localURI: BuildURI.from('file:///clean').URI() }; // No store_key in localURI
    const opts = { public: false }; // No storeKey in opts
    const store: StoreType = 'wal';
    const initialUri = baseUri.clone();

    const resultUri = ensureURIDefaults(sthis, names, opts, initialUri, store);

    const storeKey = resultUri.getParam(PARAM.STORE_KEY);
    expect(storeKey).toBeDefined();
    expect(storeKey).not.toBeNull();
    expect(storeKey).not.toBe('insecure');
    expect(typeof storeKey).toBe('string');
    // Add a direct check to satisfy TypeScript's null/undefined check for storeKey
    if (storeKey) {
      expect(storeKey.length).toBeGreaterThan(0); // Ensure it's not an empty string
    } else {
      // This case should not be reached if the above expects pass, but it satisfies TS
      expect(storeKey).toBe('actually a string'); // This will fail if storeKey is not a string, or null/undefined
    }
    expect(resultUri.getParam(PARAM.STORE)).toBe(store);
  });

  it('should preserve suffix if opts.public is true (and store is not "car")', () => {
    const sthis = mockSuperThisMinimal() as SuperThis;
    const names = { name: defaultName };
    const opts = { public: true };
    const store: StoreType = 'wal';
    const suffixValue = 'somesuffix';
    const initialUriWithSuffix = BuildURI.from(baseUri).setParam(PARAM.SUFFIX, suffixValue).URI();

    const resultUri = ensureURIDefaults(sthis, names, opts, initialUriWithSuffix, store);

    expect(resultUri.hasParam(PARAM.SUFFIX)).toBe(true);
    expect(resultUri.getParam(PARAM.SUFFIX)).toBe(suffixValue);
    expect(resultUri.getParam(PARAM.STORE_KEY)).toBe('insecure');
  });

  it('should preserve suffix if opts.public is false', () => {
    const sthis = mockSuperThisMinimal() as SuperThis;
    const names = { name: defaultName };
    const opts = { public: false, storeKey: 'somekey' }; // Provide a storeKey for private
    const store: StoreType = 'wal';
    const suffixValue = 'keepsuffix';
    const initialUriWithSuffix = BuildURI.from(baseUri).setParam(PARAM.SUFFIX, suffixValue).URI();

    const resultUri = ensureURIDefaults(sthis, names, opts, initialUriWithSuffix, store);

    expect(resultUri.hasParam(PARAM.SUFFIX)).toBe(true);
    expect(resultUri.getParam(PARAM.SUFFIX)).toBe(suffixValue);
    expect(resultUri.getParam(PARAM.STORE_KEY)).toBe('somekey');
  });
});
