import { Future, Lazy, OnFunc, KeyedResolvOnce, timeouted, isTimeout, isError } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import type {
  QSGet,
  QSPut,
  QSReqGet,
  QSReqPut,
  QSReqQuery,
  QSReqRegisterSubscribe,
  QSReqUnregisterSubscribe,
  QSResGet,
  QSResGetNotFound,
  QSResPut,
  QSResErr,
  QSResRegisterSubscribe,
  QSEvtSubscribe,
  QSResQueryBegin,
  QSResQueryRow,
  QSResQueryEnd,
  QSMsg,
  QSCloudAuth,
} from "@fireproof/cloud-quick-silver-types";
import {
  isQSMsg,
  isQSResGet,
  isQSResGetNotFound,
  isQSResPut,
  isQSResErr,
  isQSResQueryEnd,
  isQSResRegisterSubscribe,
  isQSEvtSubscribe,
} from "@fireproof/cloud-quick-silver-types";

const sthis = ensureSuperThis();

const DEFAULT_TIMEOUT_MS = 30_000;

export interface QSSubscribeHandle {
  readonly events: ReadableStream<QSResRegisterSubscribe | QSEvtSubscribe | QSResErr>;
  readonly close: () => void;
}

export interface QSApiOpts {
  readonly url: string;
  readonly db: string;
  readonly auth: () => QSCloudAuth;
  readonly timeoutMs?: number;
}

const connections = new KeyedResolvOnce<QSApiImpl>();

export function QSApi(opts: QSApiOpts): Promise<QSApiImpl> {
  return connections.get(opts.url).once(() => new QSApiImpl(opts));
}

class QSApiImpl {
  private readonly opts: QSApiOpts;

  constructor(opts: QSApiOpts) {
    this.opts = opts;
  }

  readonly connect = Lazy(() => {
    const ws = new WebSocket(this.opts.url);
    const opened = new Future<WebSocket>();
    ws.binaryType = "arraybuffer";
    ws.onopen = () => { opened.resolve(ws); };
    ws.onerror = (e) => opened.reject(new Error(String(e)));
    ws.onmessage = (evt) => {
      const decoded = sthis.ende.cbor.decodeUint8<QSMsg>(new Uint8Array(evt.data as ArrayBuffer));
      if (decoded.isErr()) return;
      const msg = decoded.Ok();
      if (isQSMsg(msg)) {
        this.onMessage.invoke(msg);
      }
    };
    return opened.asPromise();
  });

  private onMessage = OnFunc<(msg: QSMsg) => void>();

  private withTimeout(
    done: Future<void>,
    unreg: () => void,
    writer: WritableStreamDefaultWriter<unknown>,
  ): void {
    timeouted(done.asPromise(), { timeout: this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS })
      .then((result) => {
        if (isTimeout(result) || isError(result)) {
          unreg();
          writer.abort(new Error(isTimeout(result) ? "request timeout" : result.error?.message));
        }
      });
  }

  get(ops: QSGet[]): ReadableStream<QSResGet | QSResGetNotFound | QSResErr> {
    const tids = ops.map(() => sthis.nextId().str);
    const pending = new Set(tids);
    const { readable, writable } = new TransformStream<
      QSResGet | QSResGetNotFound | QSResErr,
      QSResGet | QSResGetNotFound | QSResErr
    >();
    const writer = writable.getWriter();
    const done = new Future<void>();

    const unreg = this.onMessage((msg) => {
      if (!pending.has(msg.tid)) return;
      if (!isQSResGet(msg) && !isQSResGetNotFound(msg) && !isQSResErr(msg)) return;
      pending.delete(msg.tid);
      writer.write(msg);
      if (pending.size === 0) { unreg(); done.resolve(); writer.close(); }
    });

    this.withTimeout(done, unreg, writer);

    this.connect()
      .then((ws) => {
        for (let i = 0; i < ops.length; i++) {
          ws.send(sthis.ende.cbor.encodeToUint8({
            type: "QSReqGet",
            tid: tids[i],
            arg: 0,
            db: this.opts.db,
            auth: this.opts.auth(),
            ...ops[i],
          } satisfies QSReqGet));
        }
      })
      .catch((e) => { unreg(); done.reject(e); writer.abort(e); });

    return readable;
  }

  put(ops: QSPut[]): ReadableStream<QSResPut | QSResErr> {
    const tids = ops.map(() => sthis.nextId().str);
    const pending = new Set(tids);
    const { readable, writable } = new TransformStream<QSResPut | QSResErr, QSResPut | QSResErr>();
    const writer = writable.getWriter();
    const done = new Future<void>();

    const unreg = this.onMessage((msg) => {
      if (!pending.has(msg.tid)) return;
      if (!isQSResPut(msg) && !isQSResErr(msg)) return;
      pending.delete(msg.tid);
      writer.write(msg);
      if (pending.size === 0) { unreg(); done.resolve(); writer.close(); }
    });

    this.withTimeout(done, unreg, writer);

    this.connect()
      .then((ws) => {
        for (let i = 0; i < ops.length; i++) {
          ws.send(sthis.ende.cbor.encodeToUint8({
            type: "QSReqPut",
            tid: tids[i],
            arg: 0,
            db: this.opts.db,
            auth: this.opts.auth(),
            ...ops[i],
          } satisfies QSReqPut));
        }
      })
      .catch((e) => { unreg(); done.reject(e); writer.abort(e); });

    return readable;
  }

  query(_pred?: (data: unknown) => boolean): ReadableStream<QSResQueryBegin | QSResQueryRow | QSResQueryEnd | QSResErr> {
    // pred is coming later
    const tid = sthis.nextId().str;
    const { readable, writable } = new TransformStream<
      QSResQueryBegin | QSResQueryRow | QSResQueryEnd | QSResErr,
      QSResQueryBegin | QSResQueryRow | QSResQueryEnd | QSResErr
    >();
    const writer = writable.getWriter();
    const done = new Future<void>();

    const unreg = this.onMessage((msg) => {
      if (msg.tid !== tid) return;
      writer.write(msg as QSResQueryBegin | QSResQueryRow | QSResQueryEnd | QSResErr);
      if (isQSResQueryEnd(msg) || isQSResErr(msg)) { unreg(); done.resolve(); writer.close(); }
    });

    this.withTimeout(done, unreg, writer);

    this.connect()
      .then((ws) => {
        ws.send(sthis.ende.cbor.encodeToUint8({
          type: "QSReqQuery",
          tid,
          arg: 0,
          db: this.opts.db,
          auth: this.opts.auth(),
        } satisfies QSReqQuery));
      })
      .catch((e) => { unreg(); done.reject(e); writer.abort(e); });

    return readable;
  }

  subscribe(): QSSubscribeHandle {
    const tid = sthis.nextId().str;
    const { readable, writable } = new TransformStream<
      QSResRegisterSubscribe | QSEvtSubscribe | QSResErr,
      QSResRegisterSubscribe | QSEvtSubscribe | QSResErr
    >();
    const writer = writable.getWriter();

    const unreg = this.onMessage((msg) => {
      if (msg.tid !== tid) return;
      if (!isQSResRegisterSubscribe(msg) && !isQSEvtSubscribe(msg) && !isQSResErr(msg)) return;
      writer.write(msg);
      if (isQSResErr(msg)) { unreg(); writer.close(); }
    });

    this.connect()
      .then((ws) => {
        ws.send(sthis.ende.cbor.encodeToUint8({
          type: "QSReqRegisterSubscribe",
          tid,
          arg: 0,
          db: this.opts.db,
          auth: this.opts.auth(),
        } satisfies QSReqRegisterSubscribe));
      })
      .catch((e) => { unreg(); writer.abort(e); });

    return {
      events: readable,
      close: () => {
        unreg();
        writer.close().catch(() => { /* ignore if already closed */ });
        this.connect()
          .then((ws) => {
            ws.send(sthis.ende.cbor.encodeToUint8({
              type: "QSReqUnregisterSubscribe",
              tid,
              arg: 0,
              db: this.opts.db,
              auth: this.opts.auth(),
            } satisfies QSReqUnregisterSubscribe));
          })
          .catch(() => { /* ignore */ });
      },
    };
  }

  close(): Promise<void> {
    return this.connect()
      .then((ws) => { ws.close(); })
      .catch(() => { /* ignore */ });
  }
}
