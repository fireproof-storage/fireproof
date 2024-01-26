import "fake-indexeddb/auto";

import { Buffer } from "buffer";
import { TextEncoder } from "util";

global.TextEncoder = TextEncoder;
global.Buffer = Buffer;
