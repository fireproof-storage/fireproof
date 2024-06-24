import { ConnectNetlify } from "./connect-netlify.js";
import type { Connectable } from "../../storage-engine/index.js";

const netlifyCxs = new Map<string, ConnectNetlify>();

export { ConnectNetlify };

export const connect = {
  netlify: ({ name, blockstore }: Connectable, refresh = false) => {
    if (!name) throw new Error("database name is required");
    if (!refresh && netlifyCxs.has(name)) {
      return netlifyCxs.get(name);
    }
    const connection = new ConnectNetlify(name);
    connection.connect(blockstore);
    netlifyCxs.set(name, connection);
    return connection;
  },
};
