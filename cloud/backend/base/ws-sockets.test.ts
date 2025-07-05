import { sleep } from "@fireproof/core-runtime";
import * as ps from "@fireproof/core-types/protocols/cloud";
import { Msger } from "@fireproof/core-protocols-cloud";
import { testSuperThis } from "@fireproof/cloud-base";
import { Future, URI } from "@adviser/cement";
import { describe, beforeAll, afterAll, it, expect, assert } from "vitest";
import { mockJWK, MockJWK } from "./test-helper.js";

const { MsgIsResChat, buildReqChat } = ps;

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

  function consumeStream(stream: ReadableStream<ps.MsgWithError<ps.MsgWithConn>>, cb: (msg: ps.MsgBase) => void): void {
    const reader = stream.getReader();
    async function readNext() {
      const { done, value } = await reader.read();
      if (done) return;
      cb(value);
      readNext();
    }
    readNext();
  }

  it("could open multiple connections", async () => {
    const id = sthis.nextId(4).str;
    const conns = await Promise.all(
      Array(connections)
        .fill(0)
        .map((_, i) => {
          const url = fpUrl
            .build()
            .pathname("fp")
            .setParam("protocol", fpUrl.protocol.startsWith("https") ? "wss" : "ws")
            .setParam("random", `multi-conn-${sthis.nextId(12).str}`);
          return Msger.connect(sthis, url, { conn: { reqId: `test-multi-conn-${i}-${id}` } });
        }),
    ); // .then((cs) => cs.map((c) => c.Ok().attachAuth(() => Promise.resolve(Result.Ok(auth.authType)))));

    const ready = new Future<void>();
    let total = (connections * (connections + 1)) / 2;
    // const recvSet = new Set(conns.map((c) => c.conn.reqId));
    const reOpenOk = new Future<void>();
    let waitOpen = 0;
    let i = 0;
    const setResOpen = new Set<string>();
    for (const rC of conns) {
      const c = rC.Ok();
      const reqId = `test-multi-conn-open-${i}-${id}`;
      setResOpen.add(reqId);
      const stream = c.bind(ps.buildReqOpen(sthis, auth.authType, { reqId }), {
        waitFor: () => true, // MsgIsResOpen, // All
      });
      i++;
      // console.log("Sending an open request", c.id, c.conn);

      consumeStream(stream, (m) => {
        if (ps.MsgIsResOpen(m)) {
          if (!setResOpen.has(m.conn.reqId)) {
            return;
          }
          setResOpen.delete(m.conn.reqId);
          waitOpen++;
          if (waitOpen >= conns.length) {
            reOpenOk.resolve();
          }
        }
        if (MsgIsResChat(m)) {
          total--;
          if (total === 0) {
            ready.resolve();
          }
          // recvSet.delete(m.conn.reqId);
          // if (recvSet.size === 0) {
          // ready.resolve();
        }
      });
    }

    await reOpenOk.asPromise();
    await sleep(1000); // wait for the connections to be re-opened

    const rest = [...conns];
    for (const rC of conns) {
      const c = rC.Ok();
      const act = await c.request(buildReqChat(sthis, auth.authType, {}, `Hello ${c.id}`), {
        waitFor: MsgIsResChat,
      });
      if (MsgIsResChat(act)) {
        if (act.targets.length < rest.length) {
          //console.log("Response received", act);
          expect(act).toEqual({
            a: "chat",
          });
        }
        expect(act.targets.length).toBeGreaterThanOrEqual(rest.length);
      } else {
        assert.fail(`Expected a response:${JSON.stringify(act)}`);
      }
      await c.close(ps.buildReqClose(sthis, auth.authType, c.conn));
      rest.shift();
    }

    // await conns[0].send(buildReqGestalt(sthis, my, true));
    await ready.asPromise();
  });
});
// });
