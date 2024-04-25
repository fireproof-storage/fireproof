import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';

// React-Native polyfills for Fireproof

console.log('hai');

// buffer
import { Buffer } from '@craftzdog/react-native-buffer';
polyfillGlobal('buffer', () => Buffer);
console.log('polyfill: buffer');

// crypto
import RNQC from 'react-native-quick-crypto';
polyfillGlobal('crypto', () => RNQC);
console.log('polyfill: crypto');

// encoding
import RNFE from 'react-native-fast-encoder';
polyfillGlobal('TextEncoder', () => RNFE);
polyfillGlobal('TextDecoder', () => RNFE);
console.log('polyfill: encoding', global.TextEncoder);

// events
import { Event } from 'event-target-shim';
polyfillGlobal('Event', () => Event);
console.log('polyfill: event');

// stream
import { Stream } from 'readable-stream';
polyfillGlobal('stream', () => Stream);
console.log('polyfill: stream');

// React exports for Fireproof

export * from 'use-fireproof';
