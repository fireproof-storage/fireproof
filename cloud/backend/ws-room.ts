import { ps } from "@fireproof/core";

import { ExposeCtxItem, WSContextWithId } from "./hono-server.js";
import { ConnItem } from "./msg-dispatch.js";

type QSId = ps.cloud.QSId;
type MsgBase = ps.cloud.MsgBase;
type MsgWithConn<T extends ps.cloud.MsgBase> = ps.cloud.MsgWithConn<T>;

export interface WSRoom {
  // acceptConnection(ws: WebSocket, wse: WSEvents, ctx: CTX): Promise<void>;

  getConns(conn: QSId): ConnItem[];
  removeConn(...conns: QSId[]): void;
  // addConn<T extends WSRoom, W extends WSContextInit<S>, S>(ctx: ExposeCtxItem<T>, ws: WSContextWithId<W>, conn: QSId): QSId;
  addConn<T extends WSRoom, WS>(ctx: ExposeCtxItem<T>, ws: WSContextWithId<WS> | undefined, conn: QSId): QSId;
  isConnected(msg: MsgBase): msg is MsgWithConn<MsgBase>;
}
