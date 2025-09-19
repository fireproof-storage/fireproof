// import type { SelectedFields } from "drizzle-orm
// import type { drizzle as doDrizzle } from 'drizzle-orm/durable-sqlite';

import { HttpHeader, Result, URI, Logger } from "@adviser/cement";
import { D1Result } from "@cloudflare/workers-types";
import { SuperThis } from "@fireproof/core-types-base";
import {
  EnDeCoder,
  Gestalt,
  AuthType,
  FPCloudAuthType,
  MsgTypesCtx,
  BindGetMeta,
  MsgWithError,
  EventGetMeta,
  ReqPutMeta,
  ResPutMeta,
  ReqDelMeta,
  ResDelMeta,
} from "@fireproof/core-types-protocols-cloud";
import { ResultSet } from "@libsql/client";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { WSContext, WSContextInit } from "hono/ws";
import { WSConnectionPair, MsgDispatcherCtx } from "./msg-dispatch.js";
import { PreSignedMsg } from "./pre-signed-url.js";
import { WSRoom } from "./ws-room.js";
import { Context, Next } from "hono";
import { sts } from "@fireproof/core-runtime";

// export interface RunTimeParams {
//   readonly sthis: SuperThis;
//   readonly logger: Logger;
//   readonly ende: EnDeCoder;
//   readonly impl: HonoServerImpl;
//   readonly wsRoom: WSRoom;
// }

export class WSContextWithId<T> extends WSContext<T> {
  readonly id: string;
  constructor(id: string, ws: WSContextInit<T>) {
    super(ws);
    this.id = id;
  }
}

export type DrizzleDatebase = BaseSQLiteDatabase<"async", ResultSet | D1Result>; //, ResultSet, TSchema>
// export type x = LibSQLDatabase | ReturnType<typeof d1Drizzle/* | typeof doDrizzle*/>;

export interface ExposeCtxItem<T extends WSRoom> {
  readonly sthis: SuperThis;
  readonly port: number;
  readonly wsRoom: T;
  readonly logger: Logger;
  readonly ende: EnDeCoder;
  readonly sts: sts.SessionTokenService;
  readonly gestalt: Gestalt;
  readonly dbFactory: () => DrizzleDatebase;
  readonly req: {
    readonly method: string;
    readonly url: string;
    readonly headers: HttpHeader;
  };
  // readonly metaMerger: MetaMerger;
  readonly id: string;
}

export type ExposeCtxItemWithImpl<T extends WSRoom> = ExposeCtxItem<T> & { impl: HonoServerImpl };

export interface WSEventsConnId<T> {
  readonly onOpen: (evt: Event, ws: WSContextWithId<T>) => void;
  readonly onMessage: (evt: MessageEvent, ws: WSContextWithId<T>) => void;
  readonly onClose: (evt: CloseEvent, ws: WSContextWithId<T>) => void;
  readonly onError: (evt: Event, ws: WSContextWithId<T>) => void;
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type ConnMiddleware = (conn: WSConnectionPair, c: Context, next: Next) => Promise<Response | void>;
export interface HonoServerImpl {
  validateAuth(ctx: MsgDispatcherCtx, auth: AuthType): Promise<Result<FPCloudAuthType>>;

  start<T extends WSRoom>(ctx: ExposeCtxItem<T>): Promise<HonoServerImpl>;
  // gestalt(): Gestalt;
  // getConnected(): Connected[];
  calculatePreSignedUrl(msgCtx: MsgTypesCtx, p: PreSignedMsg): Promise<Result<URI>>;
  upgradeWebSocket(createEvents: (c: Context) => WSEventsConnId<unknown> | Promise<WSEventsConnId<unknown>>): ConnMiddleware;
  handleBindGetMeta(ctx: MsgDispatcherCtx, msg: BindGetMeta): Promise<MsgWithError<EventGetMeta>>;
  handleReqPutMeta(ctx: MsgDispatcherCtx, msg: ReqPutMeta): Promise<MsgWithError<ResPutMeta>>;
  handleReqDelMeta(ctx: MsgDispatcherCtx, msg: ReqDelMeta): Promise<MsgWithError<ResDelMeta>>;
  // readonly headers: HttpHeader;
}
