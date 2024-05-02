import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';

// React-Native polyfills for Fireproof
const log = (polyfill) => {
  console.info(`@fireproof/react-native polyfill: ${polyfill}`);
};

// buffer
import { Buffer } from '@craftzdog/react-native-buffer';
polyfillGlobal('buffer', () => Buffer);
log('buffer');

// crypto
import RNQC from 'react-native-quick-crypto';
polyfillGlobal('crypto', () => RNQC);
log('crypto');

// encoding
import RNFE from 'react-native-fast-encoder';
polyfillGlobal('TextEncoder', () => RNFE);
polyfillGlobal('TextDecoder', () => RNFE);
log('encoding');

// events
import { Event } from 'event-target-shim';
polyfillGlobal('Event', () => Event);
log('event');

// stream
import { Stream } from 'readable-stream';
polyfillGlobal('stream', () => Stream);
log('stream');
