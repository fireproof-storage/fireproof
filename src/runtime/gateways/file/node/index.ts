export * from "./key-bag-file.js";

// test needs that
export * from "./get-file-system.js";

import { KeyBagProviderFile as KeyBagProviderImpl } from "./key-bag-file.js";

export { KeyBagProviderImpl };

import { FileGateway as GatewayImpl, FileTestGateway as GatewayTestImpl } from "./gateway-impl.js";
export { GatewayImpl, GatewayTestImpl };
