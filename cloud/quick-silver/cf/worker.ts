/// <reference types="@cloudflare/workers-types" />

import { Env } from "./env.js";
import { QSRoom } from "./qs-room.js";
import { QSDBStore } from "./qs-db-store.js";

export { QSRoom, QSDBStore };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const roomName = url.searchParams.get("room") ?? "default";
    const id = env.QS_ROOM.idFromName(roomName);
    return env.QS_ROOM.get(id).fetch(req);
  },
} satisfies ExportedHandler<Env>;
