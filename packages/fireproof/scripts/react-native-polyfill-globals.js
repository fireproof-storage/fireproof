import { polyfill as polyfillEncoding } from 'react-native-polyfill-globals/src/encoding';
import { polyfill as polyfillReadableStream } from 'react-native-polyfill-globals/src/readable-stream';
polyfillEncoding();
polyfillReadableStream();

// import { polyfill as polyfillBase64 } from 'react-native-polyfill-globals/src/base64';
// polyfillBase64();


// import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';
import { btoa, atob } from 'react-native-quick-base64';
// base64 (react-native-quick-base64)
globalThis.atob = atob;
globalThis.btoa = btoa;


// buffer
import { Buffer } from "@craftzdog/react-native-buffer";
globalThis.buffer = Buffer;

// // events
// import events from 'events';
// export {
//   events,
// };
