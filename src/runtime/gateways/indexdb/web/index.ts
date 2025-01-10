// export * from "./gateway-impl.js";

export * from "./key-bag-indexdb.js";
import { KeyBagProviderIndexDB as KeyBagProviderImpl } from "./key-bag-indexdb.js";

export { KeyBagProviderImpl };

import { IndexDBGateway as GatewayImpl } from "./gateway-impl.js";
export { GatewayImpl };
