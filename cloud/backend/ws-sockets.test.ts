import { ps } from "@fireproof/core";
import { MockJWK, mockJWK } from "./node/test-helper.js";
import { Future, Result, URI } from "@adviser/cement";
import { testSuperThis } from "../test-super-this.js";

const { MsgIsResChat, Msger, buildReqChat } = ps.cloud;

describe("test multiple connections", () => {
  const sthis = testSuperThis();
  const fpUrl = URI.from(sthis.env.get("FP_ENDPOINT"));

  // describe.each([
  //   // dummy
  //   NodeHonoServerFactory(sthis),
  //   // CFHonoServerFactory(sthis),
  // ])("$name - Gateway", ({ port }) => {
  // const msgP = defaultMsgParams(sthis, { hasPersistent: true });

  // const my = defaultGestalt(msgP, { id: "FP-Universal-Client" });
  // let stype;
  const connections = 3;

  // let hserv: HonoServer;

  let auth: MockJWK;

  beforeAll(async () => {
    auth = await mockJWK(sthis);
    //stype = wsStyle(sthis, auth.applyAuthToURI, port, msgP, my);

    // const app = new Hono();
    // hserv = await factory(sthis, msgP, stype.remoteGestalt, port, auth.keys.strings.publicKey).then((srv) => srv.once(app, port));
  });
  afterAll(async () => {
    // await hserv.close();
  });

  it("could open multiple connections", async () => {
    const conns = await Promise.all(
      Array(connections)
        .fill(0)
        .map(() => {
          const url = fpUrl
            .build()
            .pathname("fp")
            .setParam("protocol", fpUrl.protocol.startsWith("https") ? "wss" : "ws")
            .setParam("random", sthis.nextId(12).str);
          return Msger.connect(sthis, auth.authType, url);
        }),
    ).then((cs) => cs.map((c) => c.Ok().attachAuth(() => Promise.resolve(Result.Ok(auth.authType)))));

    const ready = new Future<void>();
    let total = (connections * (connections + 1)) / 2;
    // const recvSet = new Set(conns.map((c) => c.conn.reqId));
    for (const c of conns) {
      c.onMsg((m) => {
        if (MsgIsResChat(m)) {
          // console.log("Got a chat response", total--, qsidKey(m.conn));
          total--;
          if (total === 0) {
            ready.resolve();
          }
          // recvSet.delete(m.conn.reqId);
          // if (recvSet.size === 0) {
          // ready.resolve();
          // }
        }
      });
    }

    const rest = [...conns];
    for (const c of conns) {
      // console.log("Sending a chat request", rest.length, conns.length);
      const act = await c.request(buildReqChat(sthis, auth.authType, c.conn, "Hello"), {
        waitFor: MsgIsResChat,
      });
      if (MsgIsResChat(act)) {
        expect(act.targets.length).toBeGreaterThanOrEqual(rest.length);
      } else {
        assert.fail("Expected a response");
      }
      await c.close((await c.msgConnAuth()).Ok());
      rest.shift();
    }

    // await conns[0].send(buildReqGestalt(sthis, my, true));
    await ready.asPromise();
  });
});
// });
