import * as ps from "@fireproof/core-types-protocols-cloud";

import { ExposeCtxItem, WSContextWithId } from "./types.js";
import { ConnItem } from "./msg-dispatch.js";

type QSId = ps.QSId;
type TenantLedger = ps.TenantLedger;
type MsgBase = ps.MsgBase;
type MsgWithConn<T extends ps.MsgBase> = ps.MsgWithConn<T>;

export interface WSRoom {
  // acceptConnection(ws: WebSocket, wse: WSEvents, ctx: CTX): Promise<void>;

  getConns(conn: QSId): ConnItem[];
  removeConn(...conns: QSId[]): void;
  setConnTenantLedger(conn: QSId, tl: TenantLedger): void;
  getConnTenantLedger(conn: QSId): TenantLedger | undefined;
  // addConn<T extends WSRoom, W extends WSContextInit<S>, S>(ctx: ExposeCtxItem<T>, ws: WSContextWithId<W>, conn: QSId): QSId;
  addConn<T extends WSRoom, WS>(ctx: ExposeCtxItem<T>, ws: WSContextWithId<WS> | undefined, conn: QSId): QSId;
  isConnected(msg: MsgBase): msg is MsgWithConn<MsgBase>;
}
