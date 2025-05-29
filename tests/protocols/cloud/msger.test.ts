import { Result, URI } from "@adviser/cement";
import { ensureSuperThis, ps, SuperThis } from "@fireproof/core";

const sthis = ensureSuperThis();

class TestConnection implements ps.cloud.MsgRawConnection {
  readonly sthis: SuperThis;
  readonly exchangedGestalt: ps.cloud.ExchangedGestalt;
  readonly activeBinds: Map<string, ps.cloud.ActiveStream>;
  readonly id: string;

  isReady = true;

  constructor(sthis: SuperThis, exGestalt: ps.cloud.ExchangedGestalt) {
    this.sthis = sthis;
    this.exchangedGestalt = exGestalt;
    this.activeBinds = new Map();
    this.id = this.sthis.nextId().str;
  }

  readonly bindFn = vi.fn();
  bind<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(
    req: Q,
    opts: ps.cloud.RequestOpts,
  ): ReadableStream<ps.cloud.MsgWithError<S>> {
    this.bindFn(req, opts);
    return new ReadableStream<ps.cloud.MsgWithError<S>>({
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
  request<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(
    req: Q,
    opts: ps.cloud.RequestOpts,
  ): Promise<ps.cloud.MsgWithError<S>> {
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
  send<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(msg: Q): Promise<ps.cloud.MsgWithError<S>> {
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
  close(o: ps.cloud.MsgBase): Promise<Result<void>> {
    this.closeFn(o);
    // console.log("close", this.id); //, o, this.closeFn.mock.calls);
    return Promise.resolve(Result.Ok(undefined));
  }
  readonly onMsgFn = vi.fn();
  onMsg(msg: ps.cloud.OnMsgFn<ps.cloud.MsgBase>): ps.cloud.UnReg {
    this.onMsgFn(msg);
    return () => {
      /* no-op */
    };
  }
}

it("queued-raw-connection", async () => {
  const msgP = ps.cloud.defaultMsgParams(sthis, { hasPersistent: true });
  const my = ps.cloud.defaultGestalt(msgP, { id: "FP-Universal-Client" });
  const realConn = new MockWSConnection(sthis, {
    my,
    remote: ps.cloud.defaultGestalt(msgP, { id: "FP-Universal-Server" }),
  });

  const vconn = new ps.cloud.VirtualConnected(sthis, {
    curl: "http://localhost:8080",
    imsgP: msgP,
    openWSorHttp: {
      openHttp: async function (): Promise<Result<ps.cloud.MsgRawConnection>> {
        return Result.Ok(
          new MockHttpConnection(sthis, {
            my,
            remote: ps.cloud.defaultGestalt(msgP, { id: "FP-Universal-Server" }),
          }),
        );
      },
      openWS: async function (): Promise<Result<ps.cloud.MsgRawConnection>> {
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

class MockHttpConnection extends TestConnection implements ps.cloud.MsgRawConnection {
  sthis: SuperThis;
  exchangedGestalt: ps.cloud.ExchangedGestalt;
  activeBinds: Map<string, ps.cloud.ActiveStream>;

  readonly isReady = true;

  constructor(sthis: SuperThis, exGestalt: ps.cloud.ExchangedGestalt) {
    super(sthis, exGestalt);
    this.sthis = sthis;
    this.exchangedGestalt = exGestalt;
    this.activeBinds = new Map();
  }

  bind<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(
    req: Q,
    opts: ps.cloud.RequestOpts,
  ): ReadableStream<ps.cloud.MsgWithError<S>> {
    super.bind(req, opts);
    // console.log("http-bind", req, opts);
    return new ReadableStream<ps.cloud.MsgWithError<S>>({
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
  request<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(
    req: Q,
    opts: ps.cloud.RequestOpts,
  ): Promise<ps.cloud.MsgWithError<S>> {
    super.request(req, opts);
    switch (true) {
      case ps.cloud.MsgIsReqGestalt(req):
        // console.log("http-request-gestalt", req, opts);
        return Promise.resolve(ps.cloud.buildResGestalt(req, this.exchangedGestalt.remote, req.auth) as unknown as S);
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
  send<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(msg: Q): Promise<ps.cloud.MsgWithError<S>> {
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
  close(o: ps.cloud.MsgBase): Promise<Result<void>> {
    // console.log("http-close");
    super.close(o);
    return Promise.resolve(Result.Ok(undefined));
  }
  onMsg(msg: ps.cloud.OnMsgFn<ps.cloud.MsgBase>): ps.cloud.UnReg {
    super.onMsg(msg);
    // console.log("http-onMsg", msg);
    return () => {
      /* no-op */
    };
  }
}

class MockWSConnection extends TestConnection implements ps.cloud.MsgRawConnection {
  sthis: SuperThis;
  exchangedGestalt: ps.cloud.ExchangedGestalt;
  activeBinds: Map<string, ps.cloud.ActiveStream>;

  isReady = false;

  constructor(sthis: SuperThis, exGestalt: ps.cloud.ExchangedGestalt) {
    super(sthis, exGestalt);
    this.sthis = sthis;
    this.exchangedGestalt = exGestalt;
    this.activeBinds = new Map();
  }
  bind<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(
    req: Q,
    opts: ps.cloud.RequestOpts,
  ): ReadableStream<ps.cloud.MsgWithError<S>> {
    super.bind(req, opts);
    // console.log("ws-bind", req, opts);
    const id = this.sthis.nextId().str;
    return new ReadableStream<ps.cloud.MsgWithError<S>>({
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
  request<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(
    req: Q,
    opts: ps.cloud.RequestOpts,
  ): Promise<ps.cloud.MsgWithError<S>> {
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
      } satisfies ps.cloud.NotReadyErrorMsg);
    }

    switch (true) {
      case ps.cloud.MsgIsReqOpen(req):
        // console.log("ws-request-open", req);
        return Promise.resolve(ps.cloud.buildResOpen(this.sthis, req) as unknown as S);
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
  send<S extends ps.cloud.MsgBase, Q extends ps.cloud.MsgBase>(msg: Q): Promise<ps.cloud.MsgWithError<S>> {
    super.send(msg);
    // console.log("ws-send", msg);
    if (ps.cloud.MsgIsReqChat(msg)) {
      const res = ps.cloud.buildResChat(msg, msg.conn, `got[${msg.message}]`);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  close(o: ps.cloud.MsgBase): Promise<Result<void>> {
    super.close(o);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, bind] of this.activeBinds.entries()) {
      bind.controller?.close();
    }
    if (!this.isReady) {
      return Promise.resolve(Result.Err("Not ready"));
    }
    return Promise.resolve(Result.Ok(undefined));
  }
  onMsg(msg: ps.cloud.OnMsgFn<ps.cloud.MsgBase>): ps.cloud.UnReg {
    super.onMsg(msg);
    throw new Error("Method not implemented.");
  }
}

describe("retry-connection", () => {
  let wsMock: MockWSConnection;
  let connected: ps.cloud.VirtualConnected;
  beforeEach(async () => {
    const rMsc = await ps.cloud.Msger.connect(
      sthis,
      "http://localhost:8080",
      {},
      {},
      {
        openHttp: async function (
          sthis: SuperThis,
          urls: URI[],
          msgP: ps.cloud.MsgerParamsWithEnDe,
          exGestalt: ps.cloud.ExchangedGestalt,
        ): Promise<Result<ps.cloud.MsgRawConnection>> {
          return Result.Ok(new MockHttpConnection(sthis, exGestalt));
        },
        openWS: async function (
          sthis: SuperThis,
          url: URI,
          msgP: ps.cloud.MsgerParamsWithEnDe,
          exGestalt: ps.cloud.ExchangedGestalt,
        ): Promise<Result<ps.cloud.MsgRawConnection>> {
          // if (wsMock) {
          //   assert.fail("WS connection already created");
          // }
          wsMock = new MockWSConnection(sthis, exGestalt);
          return Result.Ok(wsMock);
        },
      },
    );

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
    if (msg && !ps.cloud.MsgIsError(msg)) {
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
        if (msgl && !ps.cloud.MsgIsError(msgl)) {
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
      if (msgl && !ps.cloud.MsgIsError(msgl)) {
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

    connected.close({
      tid: "1234",
      type: "error",
      version: "1.0",
      message: "Not Happy",
      auth: {
        type: "error",
      },
    } as ps.cloud.MsgBase);
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
