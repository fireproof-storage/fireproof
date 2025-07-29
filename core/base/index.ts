export * from "./ledger.js";
export * from "./database.js";

export * from "./crdt.js";

export * from "./indexer.js";
export * from "./indexer-helpers.js";

export * from "./version.js";

import "./compact-strategies.js";

export { getCompactStrategy, registerCompactStrategy, getCompactStrategyThrow } from "@fireproof/core-runtime";

export { registerStoreProtocol } from "@fireproof/core-blockstore";
