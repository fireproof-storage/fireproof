import { Result, URI } from "@adviser/cement";
import {
  ExchangedGestalt,
  ActiveStream,
  OnMsgFn,
  defaultMsgParams,
  VirtualConnected,
  Msger,
  MsgerParamsWithEnDe,
} from "@fireproof/core-protocols-cloud";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { SuperThis, UnReg } from "@fireproof/core-types-base";
import {
  MsgRawConnection,
  MsgBase,
  RequestOpts,
  MsgWithError,
  defaultGestalt,
  MsgIsReqGestalt,
  buildResGestalt,
  NotReadyErrorMsg,
  MsgIsReqOpen,
  buildResOpen,
  MsgIsReqChat,
  buildResChat,
  MsgIsError,
} from "@fireproof/core-types-protocols-cloud";
import { vi, it, expect, describe, beforeEach, afterEach, assert } from "vitest";
const sthis = ensureSuperThis();

class TestConnection implements MsgRawConnection {
  readonly sthis: SuperThis;
  readonly exchangedGestalt: ExchangedGestalt;
  readonly activeBinds: Map<string, ActiveStream>;
  readonly id: string;

  isReady = true;

  constructor(sthis: SuperThis, exGestalt: ExchangedGestalt) {
    this.sthis = sthis;
    this.exchangedGestalt = exGestalt;
    this.activeBinds = new Map();
    this.id = this.sthis.nextId().str;
  }

  readonly bindFn = vi.fn();
  bind<S extends MsgBase, Q extends MsgBase>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    this.bindFn(req, opts);
    return new ReadableStream<MsgWithError<S>>({
      start: (ctl) => {
        ctl.enqueue({
          tid: req.tid,
          type: req.type,
          version: req.version,
          auth: {
            type: "error",
          },
        } as S);
      },
    });
  }
  readonly requestFn = vi.fn();
  request<S extends MsgBase, Q extends MsgBase>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
    this.requestFn(req, opts);
    // console.log("request", req);
    return Promise.resolve({
      tid: req.tid,
      type: req.type,
      version: req.version,
      auth: {
        type: "error",
      },
    } as S);
  }
  readonly sendFn = vi.fn();
  send<S extends MsgBase, Q extends MsgBase>(msg: Q): Promise<MsgWithError<S>> {
    this.sendFn(msg);
    // console.log("send", msg);
    return Promise.resolve({
      tid: msg.tid,
      type: msg.type,
      version: msg.version,
      auth: {
        type: "error",
      },
    } as S);
  }
  readonly startFn = vi.fn();
  start(): Promise<Result<void>> {
    this.startFn();
    // console.log("start", this.id); //, this.startFn.mock.calls);
    return Promise.resolve(Result.Ok(undefined));
  }
  readonly closeFn = vi.fn();
  close(o: MsgBase): Promise<Result<void>> {
    this.closeFn(o);
    // console.log("close", this.id); //, o, this.closeFn.mock.calls);
    return Promise.resolve(Result.Ok(undefined));
  }
  readonly onMsgFn = vi.fn();
  onMsg(msg: OnMsgFn): UnReg {
    this.onMsgFn(msg);
    return () => {
      /* no-op */
    };
  }
}

it("queued-raw-connection", async () => {
  const msgP = defaultMsgParams(sthis, { hasPersistent: true });
  const my = defaultGestalt(msgP, { id: "FP-Universal-Client" });
  const realConn = new MockWSConnection(sthis, {
    my,
    remote: defaultGestalt(msgP, { id: "FP-Universal-Server" }),
  });

  const vconn = new VirtualConnected(sthis, {
    curl: "http://localhost:8080",
    msgerParams: msgP,
    openWSorHttp: {
      openHttp: async function (): Promise<Result<MsgRawConnection>> {
        return Result.Ok(
          new MockHttpConnection(sthis, {
            my,
            remote: defaultGestalt(msgP, { id: "FP-Universal-Server" }),
          }),
        );
      },
      openWS: async function (): Promise<Result<MsgRawConnection>> {
        return Result.Ok(realConn);
      },
    },
  });

  await vconn.send({
    tid: "1234",
    type: "test",
    version: "1.0",
    auth: {
      type: "error",
    },
  });

  await vconn.request(
    {
      tid: "1234",
      type: "test",
      version: "1.0",
      auth: {
        type: "error",
      },
    },
    {
      waitFor: (msg) => {
        return msg.type === "test" && msg.tid === "1234";
      },
    },
  );

  await vconn.close({
    tid: "1234",
    type: "test",
    version: "1.0",
    auth: {
      type: "error",
    },
  });

  // await sleep(100);

  expect(realConn.startFn).toHaveBeenCalledTimes(1);
  expect(realConn.sendFn).toHaveBeenCalledTimes(1);
  expect(realConn.closeFn).toHaveBeenCalledTimes(1);
  expect(realConn.requestFn).toHaveBeenCalledTimes(2); // open + test
});

class MockHttpConnection extends TestConnection implements MsgRawConnection {
  sthis: SuperThis;
  exchangedGestalt: ExchangedGestalt;
  activeBinds: Map<string, ActiveStream>;

  readonly isReady = true;

  constructor(sthis: SuperThis, exGestalt: ExchangedGestalt) {
    super(sthis, exGestalt);
    this.sthis = sthis;
    this.exchangedGestalt = exGestalt;
    this.activeBinds = new Map();
  }

  bind<S extends MsgBase, Q extends MsgBase>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    super.bind(req, opts);
    // console.log("http-bind", req, opts);
    return new ReadableStream<MsgWithError<S>>({
      start: (ctl) => {
        ctl.enqueue({
          tid: req.tid,
          type: req.type,
          version: req.version,
          auth: {
            type: "error",
          },
        } as S);
      },
    });
  }
  request<S extends MsgBase, Q extends MsgBase>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
    super.request(req, opts);
    switch (true) {
      case MsgIsReqGestalt(req):
        // console.log("http-request-gestalt", req, opts);
        return Promise.resolve(buildResGestalt(req, this.exchangedGestalt.remote, req.auth) as unknown as S);
    }
    // console.log("http-request", req, opts);
    return Promise.resolve({
      tid: req.tid,
      type: req.type,
      version: req.version,
      auth: {
        type: "error",
      },
    } as S);
  }
  send<S extends MsgBase, Q extends MsgBase>(msg: Q): Promise<MsgWithError<S>> {
    super.send(msg);
    // console.log("http-send", msg);
    return Promise.resolve({
      tid: msg.tid,
      type: msg.type,
      version: msg.version,
      auth: {
        type: "error",
      },
    } as S);
  }
  start(): Promise<Result<void>> {
    super.start();
    // console.log("http-start");
    return Promise.resolve(Result.Ok(undefined));
  }
  close(o: MsgBase): Promise<Result<void>> {
    // console.log("http-close");
    super.close(o);
    return Promise.resolve(Result.Ok(undefined));
  }
  onMsg(msg: OnMsgFn): UnReg {
    super.onMsg(msg);
    // console.log("http-onMsg", msg);
    return () => {
      /* no-op */
    };
  }
}

class MockWSConnection extends TestConnection implements MsgRawConnection {
  sthis: SuperThis;
  exchangedGestalt: ExchangedGestalt;
  activeBinds: Map<string, ActiveStream>;

  isReady = false;

  constructor(sthis: SuperThis, exGestalt: ExchangedGestalt) {
    super(sthis, exGestalt);
    this.sthis = sthis;
    this.exchangedGestalt = exGestalt;
    this.activeBinds = new Map();
  }
  bind<S extends MsgBase, Q extends MsgBase>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    super.bind(req, opts);
    // console.log("ws-bind", req, opts);
    const id = this.sthis.nextId().str;
    return new ReadableStream<MsgWithError<S>>({
      cancel: () => {
        // console.log("ws-bind-close");
        this.activeBinds.delete(id);
      },
      start: (controller) => {
        this.activeBinds.set(id, {
          id,
          bind: {
            msg: req,
            opts,
          },
          controller,
        });
        this.send(req).catch((e) => {
          // eslint-disable-next-line no-console
          console.error("send-error", e);
        });
      },
    });
  }
  request<S extends MsgBase, Q extends MsgBase>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
    super.request(req, opts);
    if (!this.isReady) {
      return Promise.resolve({
        tid: req.tid,
        type: "error",
        version: req.version,
        reason: "not-ready",
        src: "not-ready",
        message: "Not Ready",
        auth: {
          type: "error",
        },
      } satisfies NotReadyErrorMsg);
    }

    switch (true) {
      case MsgIsReqOpen(req):
        // console.log("ws-request-open", req);
        return Promise.resolve(buildResOpen(this.sthis, req) as unknown as S);
    }
    // console.log("ws-request", req, opts);
    return Promise.resolve({
      tid: req.tid,
      type: req.type,
      version: req.version,
      auth: {
        type: "error",
      },
    } as S);
  }
  send<S extends MsgBase, Q extends MsgBase>(msg: Q): Promise<MsgWithError<S>> {
    super.send(msg);
    // console.log("ws-send", msg);
    if (MsgIsReqChat(msg)) {
      const res = buildResChat(msg, msg.conn, `got[${msg.message}]`);

      for (const [_, bind] of this.activeBinds.entries()) {
        // console.log("ws-to-bind", res);
        bind.controller?.enqueue(res);
      }
      return Promise.resolve(msg as unknown as S);
    }
    return Promise.resolve({
      tid: msg.tid,
      type: msg.type,
      version: msg.version,
      auth: {
        type: "error",
      },
    } as S);
  }
  start(): Promise<Result<void>> {
    super.start();
    this.isReady = true;
    return Promise.resolve(Result.Ok(undefined));
  }
  close(o: MsgBase): Promise<Result<void>> {
    super.close(o);

    for (const [_, bind] of this.activeBinds.entries()) {
      try {
        bind.controller?.close();
      } catch (e) {
        this.sthis.logger.Error().Err(e).Msg("Error closing bind controller");
      }
    }
    if (!this.isReady) {
      return Promise.resolve(Result.Err("Not ready"));
    }
    return Promise.resolve(Result.Ok(undefined));
  }
  onMsg(msg: OnMsgFn): UnReg {
    super.onMsg(msg);
    throw new Error("Method not implemented.");
  }
}

describe("retry-connection", () => {
  let wsMock: MockWSConnection;
  let connected: VirtualConnected;
  beforeEach(async () => {
    const rMsc = await Msger.connect(sthis, "http://localhost:8080", {
      mowh: {
        openHttp: async function (
          sthis: SuperThis,
          urls: URI[],
          msgP: MsgerParamsWithEnDe,
          exGestalt: ExchangedGestalt,
        ): Promise<Result<MsgRawConnection>> {
          return Result.Ok(new MockHttpConnection(sthis, exGestalt));
        },
        openWS: async function (
          sthis: SuperThis,
          url: URI,
          msgP: MsgerParamsWithEnDe,
          exGestalt: ExchangedGestalt,
        ): Promise<Result<MsgRawConnection>> {
          // if (wsMock) {
          //   assert.fail("WS connection already created");
          // }
          wsMock = new MockWSConnection(sthis, exGestalt);
          return Result.Ok(wsMock);
        },
      },
    });

    expect(rMsc.isOk()).toBe(true);
    connected = rMsc.unwrap();
  });

  afterEach(async () => {
    await connected.close({
      tid: "1234",
      type: "test",
      version: "1.0",
      auth: {
        type: "error",
      },
    });
  });

  it("bind", async () => {
    const result = connected.bind(
      {
        tid: "1234",
        type: "reqChat",
        version: "1.0",
        message: `ping[i]`,
        auth: {
          type: "error",
        },
      },
      {
        waitFor: (msg) => {
          return msg.type === "resChat";
        },
      },
    );
    const reader = result.getReader();

    const { done, value: msg } = await reader.read();
    expect(done).toBe(false);
    if (msg && !MsgIsError(msg)) {
      expect(msg).toEqual({
        auth: {
          type: "error",
        },
        conn: msg.conn,
        message: "got[ping[i]]",
        targets: undefined,
        tid: "1234",
        type: "resChat",
        version: "FP-MSG-1.0",
      });
    } else {
      assert.fail("msg is error");
    }
    const refConn = msg.conn;

    for (let i = 0; i < 3; i++) {
      await connected.send({
        tid: "1234" + i,
        type: "reqChat",
        version: "1.0",
        message: `ping[${i}]`,
        auth: {
          type: "error",
        },
      });
      wsMock.isReady = false; // trigger not-ready error
      if (i > 0) {
        const { done, value: msgl } = await reader.read();
        expect(done).toBe(false);
        if (msgl && !MsgIsError(msgl)) {
          expect(msgl).toEqual({
            auth: {
              type: "error",
            },
            conn: refConn,
            message: "got[ping[i]]",
            targets: undefined,
            tid: "1234",
            type: "resChat",
            version: "FP-MSG-1.0",
          });
        }
      }
      const { done, value: msgl } = await reader.read();
      expect(done).toBe(false);
      if (msgl && !MsgIsError(msgl)) {
        expect(msgl).toEqual({
          auth: {
            type: "error",
          },
          conn: refConn,
          message: "got[ping[" + i + "]]",
          targets: undefined,
          tid: "1234" + i,
          type: "resChat",
          version: "FP-MSG-1.0",
        });
      }
    }

    await connected.close({
      tid: "1234",
      type: "error",
      version: "1.0",
      message: "Not Happy",
      auth: {
        type: "error",
      },
    } as MsgBase);
  });

  it("request", async () => {
    for (let i = 0; i < 3; i++) {
      const result = await connected.request(
        {
          tid: "1234" + i,
          type: "test",
          version: "1.0",
          auth: {
            type: "error",
          },
        },
        {
          waitFor: (msg) => {
            return msg.type === "test" && msg.tid === "1234";
          },
        },
      );
      expect(result).toEqual({
        tid: "1234" + i,
        type: "test",
        version: "1.0",
        auth: {
          type: "error",
        },
      });
      wsMock.isReady = false; // trigger not-ready error
    }
  });

  it("send", async () => {
    for (let i = 0; i < 3; i++) {
      const result = await connected.send({
        tid: "1234" + i,
        type: "test",
        version: "1.0",
        auth: {
          type: "error",
        },
      });
      expect(result).toEqual({
        tid: "1234" + i,
        type: "test",
        version: "1.0",
        auth: {
          type: "error",
        },
      });
      wsMock.isReady = false; // trigger not-ready error
    }
  });
});
