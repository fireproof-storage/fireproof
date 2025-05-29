import { ps } from "@fireproof/core";

import { WSContextWithId } from "./hono-server.js";
import { ConnItem } from "./msg-dispatch.js";

type QSId = ps.cloud.QSId;
type MsgBase = ps.cloud.MsgBase;
type MsgWithConn<T extends ps.cloud.MsgBase> = ps.cloud.MsgWithConn<T>;

export interface WSRoom {
  // acceptConnection(ws: WebSocket, wse: WSEvents, ctx: CTX): Promise<void>;

  getConns(conn: QSId): ConnItem[];
  removeConn(...conns: QSId[]): void;
  addConn(ws: WSContextWithId<unknown>, conn: QSId): QSId;
  isConnected(msg: MsgBase): msg is MsgWithConn<MsgBase>;
}
