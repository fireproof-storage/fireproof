import { exception2Result, Future, Logger, Result } from "@adviser/cement";
import { MsgBase, MsgIsError, buildErrorMsg, ReqOpen, WaitForTid, MsgWithError, RequestOpts, MsgIsTid } from "./msg-types.js";
import { ActiveStream, ExchangedGestalt, MsgerParamsWithEnDe, MsgRawConnection, OnMsgFn, UnReg } from "./msger.js";
import { MsgRawConnectionBase } from "./msg-raw-connection-base.js";
import { SuperThis } from "../../types.js";
import { ensureLogger } from "../../utils.js";

export interface WSReqOpen {
  readonly reqOpen: ReqOpen;
  readonly ws: WebSocket; // this WS is opened with a specific URL-Param
}

export class WSConnection extends MsgRawConnectionBase implements MsgRawConnection {
  readonly logger: Logger;
  readonly msgP: MsgerParamsWithEnDe;
  readonly ws: WebSocket;
  // readonly baseURI: URI;

  readonly #onMsg = new Map<string, OnMsgFn>();
  readonly #onClose = new Map<string, UnReg>();

  readonly waitForTid = new Map<string, WaitForTid>();

  opened = false;

  readonly id: string;

  constructor(sthis: SuperThis, ws: WebSocket, msgP: MsgerParamsWithEnDe, exGestalt: ExchangedGestalt) {
    super(sthis, exGestalt);
    this.id = sthis.nextId().str;
    this.logger = ensureLogger(sthis, "WSConnection");
    this.msgP = msgP;
    this.ws = ws;
    // this.wqs = { ...wsq };
  }

  async start(): Promise<Result<void>> {
    const onOpenFuture: Future<Result<unknown>> = new Future<Result<unknown>>();
    const timer = setTimeout(() => {
      const err = this.logger.Error().Dur("timeout", this.msgP.timeout).Msg("Timeout").AsError();
      this.toMsg(buildErrorMsg(this, {} as MsgBase, err));
      onOpenFuture.resolve(Result.Err(err));
    }, this.msgP.timeout);
    this.ws.onopen = () => {
      onOpenFuture.resolve(Result.Ok(undefined));
      this.opened = true;
    };
    this.ws.onerror = (ierr) => {
      const err = this.logger.Error().Err(ierr).Msg("WS Error").AsError();
      onOpenFuture.resolve(Result.Err(err));
      const res = this.buildErrorMsg(this, {}, err);
      this.toMsg(res);
    };
    this.ws.onmessage = (evt) => {
      if (!this.opened) {
        this.toMsg(buildErrorMsg(this, {} as MsgBase, this.logger.Error().Msg("Received message before onOpen").AsError()));
      }
      this.#wsOnMessage(evt);
    };
    this.ws.onclose = () => {
      this.opened = false;
      // console.log("onclose", this.id);
      this.close().catch((ierr) => {
        const err = this.logger.Error().Err(ierr).Msg("close error").AsError();
        onOpenFuture.resolve(Result.Err(err));
        this.toMsg(buildErrorMsg(this, { tid: "internal" } as MsgBase, err));
      });
    };
    /* wait for onOpen */
    const rOpen = await onOpenFuture.asPromise().finally(() => {
      clearTimeout(timer);
    });
    if (rOpen.isErr()) {
      return rOpen;
    }
    // const resOpen = await this.request(this.wqs.reqOpen, { waitFor: MsgIsResOpen });
    // if (!MsgIsResOpen(resOpen)) {
    //   return Result.Err(this.logger.Error().Any("ErrMsg", resOpen).Msg("Invalid response").AsError());
    // }
    // this.wqs.resOpen = resOpen;
    return Result.Ok(undefined);
  }

  readonly #wsOnMessage = async (event: MessageEvent) => {
    const rMsg = await exception2Result(() => this.msgP.ende.decode(event.data) as MsgBase);
    if (rMsg.isErr()) {
      this.logger.Error().Err(rMsg).Any(event.data).Msg("Invalid message");
      return;
    }
    const msg = rMsg.Ok();
    const waitFor = this.waitForTid.get(msg.tid);
    Array.from(this.#onMsg.values()).forEach((cb) => {
      // console.log("cb-onmessage", this.id, msg, cb.toString());
      cb(msg);
    });
    if (waitFor) {
      if (MsgIsError(msg)) {
        this.waitForTid.delete(msg.tid);
        waitFor.future.resolve(msg);
      } else if (waitFor.waitFor(msg)) {
        // what for a specific type
        this.waitForTid.delete(msg.tid);
        waitFor.future.resolve(msg);
      } else {
        // wild-card
        this.waitForTid.delete(msg.tid);
        waitFor.future.resolve(msg);
      }
    }
  };

  async close(): Promise<Result<void>> {
    this.#onClose.forEach((fn) => fn());
    this.#onClose.clear();
    this.#onMsg.clear();
    this.ws.close();
    return Result.Ok(undefined);
  }

  toMsg<S extends MsgBase>(msg: MsgWithError<S>): MsgWithError<S> {
    this.#onMsg.forEach((fn) => fn(msg));
    return msg;
  }

  send<Q extends MsgBase, S extends MsgBase>(msg: Q): Promise<S> {
    this.ws.send(this.msgP.ende.encode(msg));
    return Promise.resolve(msg as unknown as S);
  }

  onMsg<S extends MsgBase>(fn: OnMsgFn<S>): UnReg {
    const key = this.sthis.nextId().str;
    this.#onMsg.set(key, fn as OnMsgFn);
    return () => this.#onMsg.delete(key);
  }

  onClose(fn: UnReg): UnReg {
    const key = this.sthis.nextId().str;
    this.#onClose.set(key, fn);
    return () => this.#onClose.delete(key);
  }

  readonly activeBinds = new Map<string, ActiveStream<MsgBase, MsgBase>>();
  bind<Q extends MsgBase, S extends MsgBase>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    const state: ActiveStream<S, Q> = {
      id: this.sthis.nextId().str,
      bind: {
        msg: req,
        opts,
      },
      // timeout: undefined,
      // controller: undefined,
    } satisfies ActiveStream<S, Q>;
    this.activeBinds.set(state.id, state);
    return new ReadableStream<MsgWithError<S>>({
      cancel: () => {
        // clearTimeout(state.timeout as number);
        this.activeBinds.delete(state.id);
      },
      start: (controller) => {
        this.onMsg<S>((msg) => {
          if (MsgIsError(msg)) {
            controller.enqueue(msg);
            return;
          }
          if (!MsgIsTid(msg, req.tid)) {
            return;
          }
          if (opts.waitFor && opts.waitFor(msg)) {
            controller.enqueue(msg);
          }
        });
        this.send(req);
        const future = new Future<S>();
        this.waitForTid.set(req.tid, { tid: req.tid, future, waitFor: opts.waitFor, timeout: opts.timeout });
        future.asPromise().then((msg) => {
          if (MsgIsError(msg)) {
            // double err emitting
            controller.enqueue(msg);
            controller.close();
          }
        });
      },
    });
  }

  async request<Q extends MsgBase, S extends MsgBase>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
    if (!this.opened) {
      return buildErrorMsg(this, req, this.logger.Error().Msg("Connection not open").AsError());
    }
    const future = new Future<S>();
    this.waitForTid.set(req.tid, { tid: req.tid, future, waitFor: opts.waitFor, timeout: opts.timeout });
    await this.send(req);
    return future.asPromise();
  }

  // toOnMessage<T extends MsgBase>(msg: WithErrorMsg<T>): Result<WithErrorMsg<T>> {
  //   this.mec.msgFn?.(msg as unknown as MessageEvent<MsgBase>);
  //   return Result.Ok(msg);
  // }
}
