import { ps, SuperThis } from "@fireproof/core";
import { Result, URI } from "@adviser/cement";
// import { HonoServer } from "./hono-server.js";
// import { Hono } from "hono";
import { calculatePreSignedUrl } from "./pre-signed-url.js";
import { httpStyle, mockJWK, MockJWK, wsStyle } from "./node/test-helper.js";
import { testSuperThis } from "../test-super-this.js";

const {
  buildReqGestalt,
  buildReqOpen,
  MsgIsError,
  MsgIsResGestalt,
  MsgIsResOpen,
  defaultGestalt,
  MsgIsResGetData,
  MsgIsResPutData,
  MsgIsResDelData,
  buildReqPutData,
  buildReqDelData,
  buildReqGetData,
  buildReqGetWAL,
  buildReqPutWAL,
  buildReqDelWAL,
  MsgIsResGetWAL,
  MsgIsResPutWAL,
  MsgIsResDelWAL,
  applyStart,
  defaultMsgParams,
  Msger,
  buildReqDelMeta,
  buildBindGetMeta,
  buildReqPutMeta,
  MsgIsResDelMeta,
  MsgIsEventGetMeta,
  MsgIsResPutMeta,
  MsgConnected,
} = ps.cloud;
type MsgBase = ps.cloud.MsgBase;
type MsgWithError<T extends MsgBase> = ps.cloud.MsgWithError<T>;
type ReqSignedUrlParam = ps.cloud.ReqSignedUrlParam;
type GwCtx = ps.cloud.GwCtx;
type ResOptionalSignedUrl = ps.cloud.ResOptionalSignedUrl;
type ReqOpen = ps.cloud.ReqOpen;
type MethodSignedUrlParam = ps.cloud.MethodSignedUrlParam;
type ResDelMeta = ps.cloud.ResDelMeta;
type ReqDelMeta = ps.cloud.ReqDelMeta;
type BindGetMeta = ps.cloud.BindGetMeta;
type EventGetMeta = ps.cloud.EventGetMeta;
type MsgConnectedAuth = ps.cloud.MsgConnectedAuth;

async function refURL(sthis: SuperThis, sp: ResOptionalSignedUrl) {
  return (
    await calculatePreSignedUrl(sp, {
      storageUrl: URI.from(sthis.env.get("STORAGE_URL")),
      aws: {
        accessKeyId: sthis.env.get("ACCESS_KEY_ID") as string,
        secretAccessKey: sthis.env.get("SECRET_ACCESS_KEY") as string,
        region: sthis.env.get("REGION"),
      },
      test: {
        amzDate: URI.from(sp.signedUrl).getParam("X-Amz-Date"),
      },
    })
  )
    .Ok()
    .asObj();
}

describe("Connection", () => {
  const sthis = testSuperThis();
  const msgP = defaultMsgParams(sthis, { hasPersistent: true });
  let auth: MockJWK;
  // let privEnvJWK: string
  const honoServer = {
    // port: parseInt(URI.from(sthis.env.get("FP_STORAGE_URL")).port, 10),
    name: "HoneServer",
  };

  beforeAll(async () => {
    // sthis.env.sets((await resolveToml()).env as unknown as Record<string, string>);
    auth = await mockJWK(sthis);
    // privEnvJWK = await jwk2env(keyPair.privateKey, sthis);
  });

  // describe.each([
  //   // force multiple lines
  //   NodeHonoServerFactory(sthis),
  // ])("$name - Connection", (honoServer) => {
  // const port = honoServer.port;
  // const port = +(process.env.FP_WRANGLER_PORT || 0) || 1024 + Math.floor(Math.random() * (65536 - 1024));
  const my = defaultGestalt(msgP, { id: "FP-Universal-Client" });

  const endpoint = sthis.env.get("FP_ENDPOINT") as string;
  const styles: { name: string; action: () => ReturnType<typeof wsStyle> | ReturnType<typeof httpStyle> }[] =
    // honoServer.name === "NodeHonoServer"
    [
      // force multiple lines
      { name: "http", action: () => httpStyle(sthis, auth.applyAuthToURI, endpoint, msgP, my) },
      { name: "ws", action: () => wsStyle(sthis, auth.applyAuthToURI, endpoint, msgP, my) },
    ];
  // : [];

  describe.each(styles)(`${honoServer.name} - $name`, (styleFn) => {
    let style: ReturnType<typeof wsStyle> | ReturnType<typeof httpStyle>;
    // let server: HonoServer;
    let qOpen: ReqOpen;
    beforeAll(async () => {
      style = styleFn.action();
      // const app = new Hono();
      qOpen = buildReqOpen(sthis, auth.authType, { reqId: `req-open-test-${sthis.nextId().str}` });
      // server = await honoServer
      //   .factory(sthis, msgP, style.remoteGestalt, port, auth.keys.strings.publicKey)
      //   .then((srv) => srv.once(app, port));
    });
    afterAll(async () => {
      // console.log("closing server");
      // await server.close();
    });

    it(`conn refused`, async () => {
      const rC = await applyStart(style.connRefused.open());
      expect(rC.isErr()).toBeTruthy();
      expect(rC.Err().message).toMatch(/ECONNREFUSED/);
    });

    it(`timeout`, async () => {
      const rC = await applyStart(style.timeout.open());
      expect(rC.isErr()).toBeTruthy();
      expect(rC.Err().message).toMatch(/Timeout/i);
    });

    describe(`connection`, () => {
      let c: MsgConnectedAuth;
      beforeEach(async () => {
        const rC = await style.ok.open().then((r) => MsgConnected.connect(auth.authType, r, { reqId: "req-open-testx" }));
        expect(rC.isOk()).toBeTruthy();
        c = rC.Ok().attachAuth(() => Promise.resolve(Result.Ok(auth.authType)));
        expect(c.conn).toEqual({
          reqId: "req-open-testx",
          resId: c.conn.resId,
        });
      });
      afterEach(async () => {
        await c.close((await c.msgConnAuth()).Ok());
      });

      it("kaputt url http", async () => {
        const r = await c.raw.request(
          {
            tid: "test",
            auth: auth.authType,
            type: "kaputt",
            version: "FP-MSG-1.0",
          },
          { waitFor: () => true },
        );
        if (!MsgIsError(r)) {
          assert.fail("expected MsgError");
          return;
        }
        expect(r).toEqual({
          message: "unexpected message",
          auth: auth.authType,
          tid: "test",
          type: "error",
          version: "FP-MSG-1.0",
          src: {
            tid: "test",
            auth: auth.authType,
            type: "kaputt",
            version: "FP-MSG-1.0",
          },
        });
      });
      it("gestalt url http", async () => {
        const msgP = defaultMsgParams(sthis, {});
        const req = buildReqGestalt(sthis, auth.authType, defaultGestalt(msgP, { id: "test" }));
        const r = await c.raw.request(req, { waitFor: MsgIsResGestalt });
        if (!MsgIsResGestalt(r)) {
          assert.fail("expected MsgError", JSON.stringify(r));
        }
        expect(r.gestalt).toEqual({
          ...c.exchangedGestalt?.remote,
          id: r.gestalt.id,
        });
      });

      it("openConnection", async () => {
        const req = buildReqOpen(sthis, auth.authType, { ...c.conn });
        const r = await c.raw.request(req, { waitFor: MsgIsResOpen });
        if (!MsgIsResOpen(r)) {
          assert.fail(JSON.stringify(r));
        }
        expect(r).toEqual({
          conn: { ...c.conn, resId: r.conn?.resId },
          auth: auth.authType,
          tid: req.tid,
          type: "resOpen",
          version: "FP-MSG-1.0",
        });
      });
    });

    it("open", async () => {
      const rC = await Msger.connect(sthis, auth.authType, style.ok.url(), msgP, {
        reqId: "req-open-testy",
      });
      expect(rC.isOk()).toBeTruthy();
      const c = rC.Ok().attachAuth(() => Promise.resolve(Result.Ok(auth.authType)));
      expect(c.conn).toEqual({
        reqId: "req-open-testy",
        resId: c.conn.resId,
      });
      expect(c.raw).toBeInstanceOf(style.cInstance);
      expect(c.exchangedGestalt).toEqual({
        my,
        remote: { ...style.remoteGestalt, id: c.exchangedGestalt.remote.id },
      });
      await c.close((await c.msgConnAuth()).Ok());
    });
    describe(`${honoServer.name} - Msgs`, () => {
      let gwCtx: GwCtx;
      let conn: MsgConnectedAuth;
      beforeAll(async () => {
        const rC = await Msger.connect(sthis, auth.authType, style.ok.url(), msgP, qOpen.conn);
        expect(rC.isOk()).toBeTruthy();
        conn = rC.Ok().attachAuth(() => Promise.resolve(Result.Ok(auth.authType)));
        gwCtx = {
          conn: conn.conn,
          tenant: {
            tenant: `Tenant-${sthis.nextId(12).str}`,
            ledger: "Ledger",
          },
        };
      });
      afterAll(async () => {
        await conn.close((await conn.msgConnAuth()).Ok());
      });
      it("Open", async () => {
        const res = await conn.raw.request(buildReqOpen(sthis, auth.authType, conn.conn), {
          waitFor: MsgIsResOpen,
        });
        if (!MsgIsResOpen(res)) {
          assert.fail("expected MsgResOpen", JSON.stringify(res));
        }
        expect(MsgIsResOpen(res)).toBeTruthy();
        expect(res.conn).toEqual({ ...qOpen.conn, resId: res.conn.resId });
      });

      function sup(mp: MethodSignedUrlParam) {
        return {
          auth: auth.authType,
          methodParam: mp,
          urlParam: {
            path: "test/me",
            key: "key-test",
          },
        } satisfies ReqSignedUrlParam;
      }
      describe("Data", async () => {
        it("Get", async () => {
          const sp = sup({ method: "GET", store: "file" });
          const res = await conn.request(buildReqGetData(sthis, sp, gwCtx), { waitFor: MsgIsResGetData });
          if (MsgIsResGetData(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgResGetData", JSON.stringify(res));
          }
        });
        it("Put", async () => {
          const sp = sup({ method: "PUT", store: "file" });
          const res = await conn.request(buildReqPutData(sthis, sp, gwCtx), { waitFor: MsgIsResPutData });
          if (MsgIsResPutData(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgResPutData", JSON.stringify(res));
          }
        });
        it("Del", async () => {
          const sp = sup({ method: "DELETE", store: "file" });
          const res = await conn.request(buildReqDelData(sthis, sp, gwCtx), { waitFor: MsgIsResDelData });
          if (MsgIsResDelData(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgResDelData", JSON.stringify(res));
          }
        });
      });

      describe("Meta", async () => {
        it("bind stop", async () => {
          const sp = sup({ method: "GET", store: "meta" });
          expect(conn.raw.activeBinds.size).toBe(0);
          const streams: ReadableStream<MsgWithError<EventGetMeta>>[] = Array(5)
            .fill(0)
            .map(() => {
              return conn.bind<EventGetMeta, BindGetMeta>(buildBindGetMeta(sthis, auth.authType, sp, gwCtx), {
                waitFor: MsgIsEventGetMeta,
              });
            });
          for await (const stream of streams) {
            const reader = stream.getReader();
            while (true) {
              const { done, value: msg } = await reader.read();
              if (done) {
                break;
              }
              if (MsgIsEventGetMeta(msg)) {
                // expect(msg.params).toEqual(sp);
                expect(URI.from(msg.signedUrl).asObj()).toEqual(await refURL(sthis, msg));
              } else {
                assert.fail("expected MsgEventGetMeta", JSON.stringify(msg));
              }
              await reader.cancel();
            }
          }
          expect(conn.raw.activeBinds.size).toBe(0);
          // await Promise.all(streams.map((s) => s.cancel()));
        });

        it("Get", async () => {
          const sp = sup({ method: "GET", store: "meta" });
          const res = await conn.request(buildBindGetMeta(sthis, auth.authType, sp, gwCtx), {
            waitFor: MsgIsEventGetMeta,
          });
          if (MsgIsEventGetMeta(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgIsEventGetMeta", JSON.stringify(res));
          }
        });
        it("Put", async () => {
          const sp = sup({ method: "PUT", store: "meta" });
          const metas = {
            metas: Array(5)
              .fill({ cid: "x", parents: [], data: "MomRkYXRho" })
              .map((data) => {
                return { ...data, cid: sthis.timeOrderedNextId().str };
              }),
            keys: Array(5)
              .fill("")
              .map(() => sthis.timeOrderedNextId().str),
          };
          const res = await conn.request(buildReqPutMeta(sthis, auth.authType, sp.urlParam, metas, gwCtx), {
            waitFor: MsgIsResPutMeta,
          });
          if (MsgIsResPutMeta(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgIsResPutMeta", JSON.stringify(res));
          }
        });
        it("Del", async () => {
          const sp = sup({ method: "DELETE", store: "meta" });
          const res = await conn.request<ResDelMeta, ReqDelMeta>(buildReqDelMeta(sthis, auth.authType, sp.urlParam, gwCtx), {
            waitFor: MsgIsResDelMeta,
          });
          if (MsgIsResDelMeta(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgResDelWAL", JSON.stringify(res));
          }
        });
      });
      describe("WAL", async () => {
        it("Get", async () => {
          const sp = sup({ method: "GET", store: "wal" });
          const res = await conn.request(buildReqGetWAL(sthis, sp, gwCtx), { waitFor: MsgIsResGetWAL });
          if (MsgIsResGetWAL(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgResGetWAL", JSON.stringify(res));
          }
        });
        it("Put", async () => {
          const sp = sup({ method: "PUT", store: "wal" });
          const res = await conn.request(buildReqPutWAL(sthis, sp, gwCtx), { waitFor: MsgIsResPutWAL });
          if (MsgIsResPutWAL(res)) {
            // expect(res.params).toEqual(sp);
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgResPutWAL", JSON.stringify(res));
          }
        });
        it("Del", async () => {
          const sp = sup({ method: "DELETE", store: "wal" });
          const res = await conn.request(buildReqDelWAL(sthis, sp, gwCtx), { waitFor: MsgIsResDelWAL });
          if (MsgIsResDelWAL(res)) {
            expect(URI.from(res.signedUrl).asObj()).toEqual(await refURL(sthis, res));
          } else {
            assert.fail("expected MsgResDelWAL", JSON.stringify(res));
          }
        });
      });
    });
  });
  // });
});
