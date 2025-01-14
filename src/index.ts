import { installIntoGlobal } from "iterator-helpers-polyfill";

// Polyfill for (async) iterator helpers (eg. map)
// https://github.com/tc39/proposal-iterator-helpers
// TODO: Not entirely sure yet we need this, may delete when finishing PR.
//       See `allDocs().snapshot()` function
installIntoGlobal();

export * from "./ledger.js";
export * from "./types.js";

export * from "./crdt.js";

export * from "./indexer.js";

export { defaultWriteQueueOpts } from "./write-queue.js";

export * as bs from "./blockstore/index.js";
export * as blockstore from "./blockstore/index.js";

export * as rt from "./runtime/index.js";
export * as runtime from "./runtime/index.js";

export * from "./utils.js";

export * from "./version.js";
