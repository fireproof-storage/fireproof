import { ps } from "@fireproof/core";

import { WSContextWithId } from "./hono-server.js";
import { ConnItem } from "./msg-dispatch.js";

type QSId = ps.cloud.QSId;
type MsgBase = ps.cloud.MsgBase;
type MsgWithConnAuth<T extends ps.cloud.MsgBase> = ps.cloud.MsgWithConnAuth<T>;

export interface WSRoom {
  // acceptConnection(ws: WebSocket, wse: WSEvents, ctx: CTX): Promise<void>;

  getConns(conn: QSId): ConnItem[];
  removeConn(conn: QSId): void;
  addConn(ws: WSContextWithId<unknown>, conn: QSId): QSId;
  isConnected(msg: MsgBase): msg is MsgWithConnAuth<MsgBase>;
}
