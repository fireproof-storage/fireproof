import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';

// encoding
import { polyfill as polyfillEncoding } from 'react-native-polyfill-globals/src/encoding';
polyfillEncoding();

// stream
import { polyfill as polyfillReadableStream } from 'react-native-polyfill-globals/src/readable-stream';
polyfillReadableStream();


// base64
// import { polyfill as polyfillBase64 } from 'react-native-polyfill-globals/src/base64';
// polyfillBase64();
import { btoa, atob } from 'react-native-quick-base64';
polyfillGlobal('atob', () => atob);
polyfillGlobal('btoa', () => btoa);


// buffer
import { Buffer } from "@craftzdog/react-native-buffer";
polyfillGlobal('buffer', () => Buffer);

// events
import { Event as EventShim } from 'event-target-shim';
polyfillGlobal('Event', () => EventShim);
