import { isUint8Array, Logger, OnFunc, Result } from "@adviser/cement";
import { MsgType } from "./database-protocol.zod.js";
import { SuperThis } from "@fireproof/core-types-base";
import { ensureLogger } from "@fireproof/core-runtime";
import { decode, encode } from "cborg";

export interface FPTransportOriginCTX {
  readonly origin: string;
}

export interface FPTransportTargetCTX extends FPTransportOriginCTX {
  readonly target: string;
}

export interface FPTransport {
  start(): Promise<Result<void>>;
  send<R extends MsgType>(msg: R, ctx: FPTransportTargetCTX): Promise<Result<R>>;
  recv(fn: (msg: MsgType, ctx: FPTransportOriginCTX) => Promise<Result<void>>): () => void;

  onSend(fn: (msg: MsgType, ctx: FPTransportTargetCTX) => Promise<void>): () => void;
  onRecv(fn: (msg: MsgType, ctx: FPTransportOriginCTX) => Promise<void>): () => void;
}

export interface FPWebWindow {
  // readonly postMessage: Window["postMessage"];
  postMessage(message: unknown, options?: string): void;
  // readonly addEventListener: Window["addEventListener"];
  addEventListener<T>(type: string, listener: (evt: T) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<T>(type: string, listener: (evt: T) => void, options?: boolean | EventListenerOptions): void;
}
export interface FPApiTransportCtx {
  readonly transport: FPTransport;
  readonly webWindow: FPWebWindow;
}

export class FPApiPostMessageTransport implements FPTransport {
  readonly logger: Logger;
  readonly webWindow: FPWebWindow;

  readonly onSend = OnFunc<(msg: MsgType, ctx: FPTransportTargetCTX) => Promise<void>>();
  readonly onRecv = OnFunc<(msg: MsgType, ctx: FPTransportOriginCTX) => void>();

  constructor(sthis: SuperThis, fpWindow: FPWebWindow) {
    this.logger = ensureLogger(sthis, "FPApiTransport");
    this.webWindow = fpWindow;
  }

  start() {
    return Promise.resolve(Result.Ok());
  }

  recv(fn: (msg: MsgType, ctx: FPTransportOriginCTX) => Promise<Result<void>>): () => void {
    const handleMessage = (event: MessageEvent) => {
      const msgCbor = event.data;
      if (!isUint8Array(msgCbor)) {
        return this.logger.Warn().Msg("Received non-Uint8Array message in FPApiPostMessageTransport").ResultError();
      }
      const msg = decode(msgCbor);
      const ctx: FPTransportOriginCTX = {
        origin: event.origin,
      };
      this.onRecv.invoke(msg, ctx);
      // console.log("FPApiPostMessageTransport received message", event, msg, ctx, fn.toString());
      fn(msg, ctx);
    };
    // console.log("FPApiPostMessageTransport adding message listener");

    this.webWindow.addEventListener("message", handleMessage);
    return () => {
      this.webWindow.removeEventListener("message", handleMessage);
    };
  }

  async send<T extends MsgType>(msg: T, ctx: FPTransportTargetCTX): Promise<Result<T>> {
    // console.log("FPApiPostMessageTransport:1 sending message", msg, ctx.target);
    const cborMsg = encode(msg);
    // console.log("FPApiPostMessageTransport:2 sending message", msg, ctx.target);
    this.webWindow.postMessage(
      {
        origin: ctx.origin,
        data: cborMsg,
      },
      ctx.target,
    );
    this.onSend.invoke(msg, ctx);
    return Result.Ok(msg);
  }
}
