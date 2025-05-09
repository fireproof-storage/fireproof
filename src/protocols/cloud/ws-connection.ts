import { exception2Result, Future, Logger, Result, top_uint8 } from "@adviser/cement";
import { MsgBase, MsgIsError, buildErrorMsg, ReqOpen, WaitForTid, MsgWithError, RequestOpts } from "./msg-types.js";
import { ActiveStream, ExchangedGestalt, MsgerParamsWithEnDe, MsgRawConnection, OnMsgFn, UnReg } from "./msger.js";
import { MsgRawConnectionBase } from "./msg-raw-connection-base.js";
import { SuperThis } from "../../types.js";
import { ensureLogger } from "../../utils.js";

export interface WSReqOpen {
  readonly reqOpen: ReqOpen;
  readonly ws: WebSocket; // this WS is opened with a specific URL-Param
}

interface WaitForTidItem {
  readonly opts: WaitForTid;
  readonly timeout?: ReturnType<typeof setTimeout>;
}

class WaitForTids {
  readonly waitForTids = new Map<string, WaitForTidItem>();

  start(sthis: SuperThis, logger: Logger, waitFor: WaitForTid) {
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
    if (typeof waitFor.timeout === "number" && waitFor.timeout > 0) {
      timeout = setTimeout(() => {
        this.waitForTids.delete(waitFor.tid);
        waitFor.future.resolve(
          buildErrorMsg(
            { logger, sthis },
            {
              tid: waitFor.tid,
            } as MsgBase,
            logger.Error().Any({ tid: waitFor }).Msg("Timeout").AsError(),
          ),
        );
      }, waitFor.timeout);
    }
    // console.log("waitForTids", waitFor.tid, waitFor.timeout);
    this.waitForTids.set(waitFor.tid, {
      opts: waitFor,
      timeout,
    });
  }

  stop(tid: string) {
    const item = this.waitForTids.get(tid);
    if (!item) {
      return;
    }
    if (item.timeout) {
      clearTimeout(item.timeout);
    }
    this.waitForTids.delete(tid);
  }

  resolve(msg: MsgBase): WaitForTidItem | undefined {
    const item = this.waitForTids.get(msg.tid);
    if (!item) {
      return undefined;
    }
    if (item.opts.waitFor(msg)) {
      if (item.timeout) {
        clearTimeout(item.timeout);
      }
      item.opts.future.resolve(msg);
    }
    return item;
  }
}

const DefaultRoundTripTime = 1000;

export class WSConnection extends MsgRawConnectionBase implements MsgRawConnection {
  readonly logger: Logger;
  readonly msgP: MsgerParamsWithEnDe;
  readonly ws: WebSocket;
  // readonly baseURI: URI;

  readonly #onMsg = new Map<string, OnMsgFn>();
  readonly #onClose = new Map<string, UnReg>();

  readonly waitForTid = new WaitForTids();

  readonly id: string;

  isReady = false;

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
      this.isReady = true;
    };
    this.ws.onerror = (ierr) => {
      // console.log("onerror", this.id, ierr);
      const err = this.logger.Error().Err(ierr).Msg("WS Error").AsError();
      onOpenFuture.resolve(Result.Err(err));
      const res = this.buildErrorMsg(this, {}, err);
      this.toMsg(res);
    };
    this.ws.onmessage = (evt) => {
      if (!this.isReady) {
        this.toMsg(buildErrorMsg(this, {} as MsgBase, this.logger.Error().Msg("Received message before onOpen").AsError()));
      }
      this.#wsOnMessage(evt);
    };
    this.ws.onclose = () => {
      this.isReady = false;
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
    const rMsg = await exception2Result(async () => {
      const msg = this.msgP.ende.decode(await top_uint8(event.data)) as MsgBase;
      return msg;
    });
    if (rMsg.isErr()) {
      this.logger.Error().Err(rMsg).Any({ event }).Msg("Invalid message");
      return;
    }
    const msg = rMsg.Ok();
    this.waitForTid.resolve(msg);
    // console.log("wsOnMessage", msg, this.#onMsg.size);
    Array.from(this.#onMsg.values()).forEach((cb) => {
      // console.log("cb-onmessage", this.id, msg, cb.toString());
      cb(msg);
    });
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
    // console.log("send", msg);
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

  readonly activeBinds = new Map<string, ActiveStream>();
  bind<Q extends MsgBase, S extends MsgBase>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    const state: ActiveStream = {
      id: this.sthis.nextId().str,
      bind: {
        msg: req,
        opts,
      },
      // timeout: undefined,
      controller: undefined,
    } satisfies ActiveStream;
    this.activeBinds.set(state.id, state);
    return new ReadableStream<MsgWithError<S>>({
      cancel: () => {
        // clearTimeout(state.timeout as number);
        this.activeBinds.delete(state.id);
      },
      start: (controller) => {
        state.controller = controller; // set controller in ActiveStream
        this.onMsg<S>((msg) => {
          try {
            if (MsgIsError(msg)) {
              controller.enqueue(msg);
              return;
            }
            if (!opts.waitFor) {
              controller.enqueue(msg);
            } else if (opts.waitFor(msg)) {
              controller.enqueue(msg);
            }
          } catch (err) {
            this.logger.Error().Err(err).Any({ msg }).Msg("Error in onMsg callback[ignored]");
          }
        });
        this.send(req);
        const future = new Future<S>();
        this.waitForTid.start(this.sthis, this.logger, { tid: req.tid, future, waitFor: opts.waitFor });
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
    const future = new Future<S>();
    this.waitForTid.start(this.sthis, this.logger, {
      tid: req.tid,
      future,
      waitFor: opts.waitFor,
      timeout: opts.timeout ?? DefaultRoundTripTime,
    });
    await this.send(req);
    return future.asPromise();
  }

  // toOnMessage<T extends MsgBase>(msg: WithErrorMsg<T>): Result<WithErrorMsg<T>> {
  //   this.mec.msgFn?.(msg as unknown as MessageEvent<MsgBase>);
  //   return Result.Ok(msg);
  // }
}
