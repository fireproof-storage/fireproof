import { HttpHeader, Logger, Result, URI, exception2Result } from "@adviser/cement";
import { ensureLogger } from "../../utils.js";
import { MsgBase, buildErrorMsg, MsgWithError, RequestOpts, MsgIsError } from "./msg-types.js";
import {
  ActiveStream,
  ExchangedGestalt,
  MsgerParamsWithEnDe,
  MsgRawConnection,
  OnMsgFn,
  selectRandom,
  timeout,
  UnReg,
} from "./msger.js";
import { MsgRawConnectionBase } from "./msg-raw-connection-base.js";
import { SuperThis } from "../../types.js";

function toHttpProtocol(uri: URI): URI {
  const protocol = (uri.getParam("protocol") ?? uri.protocol).replace(/:$/, "");
  const toFix = uri.build();
  switch (protocol) {
    case "ws":
    case "http":
      toFix.protocol("http");
      break;
    case "https":
    case "wss":
    default:
      toFix.protocol("https");
      break;
  }
  return toFix.URI();
}

export function ensurePath(uri: URI, fp: string): string {
  const path = uri.pathname.replace(/\/$/, "").replace(/^\//, "");
  const buri = uri.build();
  if (path === "") {
    buri.appendRelative(fp);
  }
  return buri.toString();
}

export class HttpConnection extends MsgRawConnectionBase implements MsgRawConnection {
  readonly logger: Logger;
  readonly msgP: MsgerParamsWithEnDe;

  readonly baseURIs: { in: URI; cleaned: URI }[];

  readonly #onMsg = new Map<string, OnMsgFn>();

  constructor(sthis: SuperThis, uris: URI[], msgP: MsgerParamsWithEnDe, exGestalt: ExchangedGestalt) {
    super(sthis, exGestalt);
    this.logger = ensureLogger(sthis, "HttpConnection");
    // this.msgParam = msgP;
    this.baseURIs = uris.map((uri) => ({
      in: uri,
      cleaned: toHttpProtocol(uri),
    }));
    this.msgP = msgP;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  send<S extends MsgBase, Q extends MsgBase>(_msg: Q): Promise<MsgWithError<S>> {
    throw new Error("Method not implemented.");
  }

  async start(): Promise<Result<void>> {
    // if (this._qsOpen.req) {
    //   const sOpen = await this.request(this._qsOpen.req, { waitFor: MsgIsResOpen });
    //   if (!MsgIsResOpen(sOpen)) {
    //     return Result.Err(this.logger.Error().Any("Err", sOpen).Msg("unexpected response").AsError());
    //   }
    //   this._qsOpen.res = sOpen;
    // }
    return Result.Ok(undefined);
  }

  async close(): Promise<Result<void>> {
    await Promise.all(Array.from(this.activeBinds.values()).map((state) => state.controller?.close()));
    this.#onMsg.clear();
    return Result.Ok(undefined);
  }

  toMsg<S extends MsgBase>(msg: MsgWithError<S>): MsgWithError<S> {
    this.#onMsg.forEach((fn) => fn(msg));
    return msg;
  }

  onMsg(fn: OnMsgFn): UnReg {
    const key = this.sthis.nextId().str;
    this.#onMsg.set(key, fn);
    return () => this.#onMsg.delete(key);
  }

  #poll(state: ActiveStream<MsgBase, MsgBase>): void {
    this.request(state.bind.msg, state.bind.opts)
      .then((msg) => {
        try {
          state.controller?.enqueue(msg);
          if (MsgIsError(msg)) {
            state.controller?.close();
          } else {
            state.timeout = setTimeout(() => this.#poll(state), state.bind.opts.pollInterval ?? 1000);
          }
        } catch (err) {
          state.controller?.error(err);
          state.controller?.close();
        }
      })
      .catch((err) => {
        state.controller?.error(err);
        // state.controller?.close();
      });
  }

  readonly activeBinds = new Map<string, ActiveStream<MsgBase, MsgBase>>();
  bind<Q extends MsgBase, S extends MsgBase>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    const state: ActiveStream<S, Q> = {
      id: this.sthis.nextId().str,
      bind: {
        msg: req,
        opts,
      },
    } satisfies ActiveStream<S, Q>;
    this.activeBinds.set(state.id, state);
    return new ReadableStream<MsgWithError<S>>({
      cancel: () => {
        clearTimeout(state.timeout as number);
        this.activeBinds.delete(state.id);
      },
      start: (controller) => {
        state.controller = controller;
        this.#poll(state);
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async request<Q extends MsgBase, S extends MsgBase>(req: Q, _opts: RequestOpts): Promise<MsgWithError<S>> {
    const headers = HttpHeader.from();
    headers.Set("Content-Type", this.msgP.mime);
    headers.Set("Accept", this.msgP.mime);

    const rReqBody = exception2Result(() => this.msgP.ende.encode(req));
    if (rReqBody.isErr()) {
      return this.toMsg(
        buildErrorMsg(this, req, this.logger.Error().Err(rReqBody.Err()).Any("req", req).Msg("encode error").AsError()),
      );
    }
    headers.Set("Content-Length", rReqBody.Ok().byteLength.toString());
    const url = selectRandom(this.baseURIs);
    // console.log("request", url.cleaned.toString(), url.in.toString(), req);
    this.logger.Debug().Any(url).Any("body", req).Msg("request");
    const rRes = await exception2Result(() =>
      timeout(
        this.msgP.timeout,
        fetch(ensurePath(url.cleaned, "fp"), {
          method: "PUT",
          headers: headers.AsHeaderInit(),
          body: rReqBody.Ok(),
        }),
      ),
    );
    this.logger.Debug().Any(url).Any("body", rRes).Msg("response");
    if (rRes.isErr()) {
      return this.toMsg(buildErrorMsg(this, req, this.logger.Error().Err(rRes).Any(url).Msg("fetch error").AsError()));
    }
    const res = rRes.Ok();
    if (!res.ok) {
      const data = new Uint8Array(await res.arrayBuffer());
      const ret = await exception2Result(async () => this.msgP.ende.decode(data) as S);
      if (ret.isErr() || !MsgIsError(ret.Ok())) {
        return this.toMsg(
          buildErrorMsg(
            this,
            req,
            this.logger
              .Error()
              .Any(url)
              .Str("status", res.status.toString())
              .Str("statusText", res.statusText)
              .Msg("HTTP Error")
              .AsError(),
            await res.text(),
          ),
        );
      }
      return this.toMsg(ret.Ok());
    }
    const data = new Uint8Array(await res.arrayBuffer());
    const ret = await exception2Result(async () => this.msgP.ende.decode(data) as S);
    if (ret.isErr()) {
      return this.toMsg(
        buildErrorMsg(this, req, this.logger.Error().Err(ret.Err()).Msg("decode error").AsError(), this.sthis.txt.decode(data)),
      );
    }
    return this.toMsg(ret.Ok());
  }

  // toOnMessage<T extends MsgBase>(msg: WithErrorMsg<T>): Result<WithErrorMsg<T>> {
  //   this.mec.msgFn?.(msg as unknown as MessageEvent<MsgBase>);
  //   return Result.Ok(msg);
  // }
}
