// export * from "./gateway-impl.js";

export * from "./key-bag-indexeddb.js";
import { KeyBagProviderIndexedDB as KeyBagProviderImpl } from "./key-bag-indexeddb.js";

export { KeyBagProviderImpl };

import { IndexedDBGateway as GatewayImpl } from "./gateway-impl.js";
export { GatewayImpl };
