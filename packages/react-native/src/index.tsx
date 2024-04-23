// React-Native polyfills for Fireproof
// buffer
import { Buffer } from '@craftzdog/react-native-buffer';
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';
polyfillGlobal('buffer', () => Buffer);
console.log('polyfill: buffer');

// crypto
import Crypto from 'react-native-quick-crypto';
polyfillGlobal('crypto', () => Crypto);
console.log('polyfill: crypto');

// encoding
import { TextDecoder, TextEncoder } from '@zxing/text-encoding';
polyfillGlobal('TextEncoder', () => TextEncoder);
polyfillGlobal('TextDecoder', () => TextDecoder);
console.log('polyfill: encoding');

// events
import { Event as EventShim } from 'event-target-shim';
polyfillGlobal('Event', () => EventShim);
console.log('polyfill: events');

// stream
import { Stream } from 'readable-stream';
polyfillGlobal('stream', () => Stream);
console.log('polyfill: stream');

export * from 'use-fireproof';
