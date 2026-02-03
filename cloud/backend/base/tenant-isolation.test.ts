import { URI } from "@adviser/cement";
import { testSuperThis } from "@fireproof/cloud-base";
import * as ps from "@fireproof/core-types-protocols-cloud";
import { defaultMsgParams, Msger, VirtualConnected } from "@fireproof/core-protocols-cloud";
import { describe, beforeAll, afterAll, it, expect, assert } from "vitest";
import { mockJWK, MockJWK } from "./test-helper.js";
import { sleep } from "@fireproof/core-runtime";

const {
  buildReqOpen,
  buildReqClose,
  buildReqChat,
  buildBindGetMeta,
  buildReqPutMeta,
  MsgIsResOpen,
  MsgIsResPutMeta,
  MsgIsEventGetMeta,
  MsgIsResChat,
  MsgIsError,
  defaultGestalt,
} = ps;

type EventGetMeta = ps.EventGetMeta;
type BindGetMeta = ps.BindGetMeta;
type GwCtx = ps.GwCtx;
type ReqSignedUrlParam = ps.ReqSignedUrlParam;
type MethodSignedUrlParam = ps.MethodSignedUrlParam;

describe("cross-tenant broadcast isolation", () => {
  const sthis = testSuperThis();
  const fpUrl = URI.from(sthis.env.get("FP_ENDPOINT"));
  const msgP = defaultMsgParams(sthis, { hasPersistent: true });

  // Two distinct tenants with separate claims
  const tenantIdA = `tenant-iso-A-${sthis.nextId(6).str}`;
  const tenantIdB = `tenant-iso-B-${sthis.nextId(6).str}`;
  const ledgerId = `ledger-iso-${sthis.nextId(6).str}`;

  let authA: MockJWK;
  let authB: MockJWK;

  beforeAll(async () => {
    authA = await mockJWK(sthis, {
      tenants: [{ id: tenantIdA, role: "admin" }],
      ledgers: [{ id: ledgerId, role: "admin", right: "write" }],
      selected: { tenant: tenantIdA, ledger: ledgerId },
    });
    authB = await mockJWK(sthis, {
      tenants: [{ id: tenantIdB, role: "admin" }],
      ledgers: [{ id: ledgerId, role: "admin", right: "write" }],
      selected: { tenant: tenantIdB, ledger: ledgerId },
    });
  });

  function wsUrl(): URI {
    return fpUrl
      .build()
      .pathname("fp")
      .setParam("protocol", fpUrl.protocol.startsWith("https") ? "wss" : "ws")
      .setParam("random", `tenant-iso-${sthis.nextId(12).str}`)
      .URI();
  }

  function sup(auth: MockJWK, mp: MethodSignedUrlParam): ReqSignedUrlParam {
    return {
      auth: auth.authType,
      methodParam: mp,
      urlParam: {
        path: "test/tenant-iso",
        key: "key-tenant-iso",
      },
    };
  }

  it("tenant A does not receive meta broadcasts from tenant B", async () => {
    // Connect two clients: one for tenant A, one for tenant B
    const rConnA = await Msger.connect(sthis, wsUrl(), {
      msgerParam: msgP,
      conn: { reqId: `iso-connA-${sthis.nextId().str}` },
    });
    expect(rConnA.isOk()).toBeTruthy();
    const connA = rConnA.Ok();

    const rConnB = await Msger.connect(sthis, wsUrl(), {
      msgerParam: msgP,
      conn: { reqId: `iso-connB-${sthis.nextId().str}` },
    });
    expect(rConnB.isOk()).toBeTruthy();
    const connB = rConnB.Ok();

    try {
      // Verify connections are open
      const chatA = await connA.request(buildReqChat(sthis, authA.authType, {}, "ping"), {
        waitFor: MsgIsResChat,
      });
      expect(MsgIsResChat(chatA)).toBeTruthy();

      const chatB = await connB.request(buildReqChat(sthis, authB.authType, {}, "ping"), {
        waitFor: MsgIsResChat,
      });
      expect(MsgIsResChat(chatB)).toBeTruthy();

      const gwCtxA: GwCtx = {
        conn: connA.conn,
        tenant: { tenant: tenantIdA, ledger: ledgerId },
      };
      const gwCtxB: GwCtx = {
        conn: connB.conn,
        tenant: { tenant: tenantIdB, ledger: ledgerId },
      };

      // Bind tenant A to listen for meta events
      const spGet = sup(authA, { method: "GET", store: "meta" });
      const streamA = connA.bind<EventGetMeta, BindGetMeta>(
        buildBindGetMeta(sthis, authA.authType, spGet, gwCtxA),
        { waitFor: MsgIsEventGetMeta },
      );

      // Bind tenant B to listen for meta events
      const spGetB = sup(authB, { method: "GET", store: "meta" });
      const streamB = connB.bind<EventGetMeta, BindGetMeta>(
        buildBindGetMeta(sthis, authB.authType, spGetB, gwCtxB),
        { waitFor: MsgIsEventGetMeta },
      );

      // Consume the initial bind responses before testing broadcast
      const readerA = streamA.getReader();
      const readerB = streamB.getReader();
      const initA = await readerA.read();
      expect(initA.done).toBe(false);
      const initB = await readerB.read();
      expect(initB.done).toBe(false);

      // Tenant B puts meta -- tenant A should NOT receive it
      const spPut = sup(authB, { method: "PUT", store: "meta" });
      const metas = {
        metas: [{ cid: sthis.timeOrderedNextId().str, parents: [], data: "MomRkYXRho" }],
        keys: [sthis.timeOrderedNextId().str],
      };
      const putRes = await connB.request(
        buildReqPutMeta(sthis, authB.authType, spPut.urlParam, metas, gwCtxB),
        { waitFor: MsgIsResPutMeta },
      );
      if (!MsgIsResPutMeta(putRes)) {
        assert.fail(`expected ResPutMeta, got: ${JSON.stringify(putRes)}`);
      }

      // Try to read a second event from tenant A's stream -- should timeout (no broadcast)
      let receivedByA = false;
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 1000),
      );
      const readResult = await Promise.race([readerA.read(), timeoutPromise]);
      if (!readResult.done && readResult.value) {
        if (MsgIsEventGetMeta(readResult.value)) {
          receivedByA = true;
        }
      }
      await readerA.cancel();
      await readerB.cancel();

      expect(receivedByA).toBe(false);
    } finally {
      await connA.close(buildReqClose(sthis, authA.authType, connA.conn));
      await connB.close(buildReqClose(sthis, authB.authType, connB.conn));
    }
  });

  it("same tenant receives meta broadcasts", async () => {
    // Two connections for the same tenant
    const rConn1 = await Msger.connect(sthis, wsUrl(), {
      msgerParam: msgP,
      conn: { reqId: `iso-same1-${sthis.nextId().str}` },
    });
    expect(rConn1.isOk()).toBeTruthy();
    const conn1 = rConn1.Ok();

    const rConn2 = await Msger.connect(sthis, wsUrl(), {
      msgerParam: msgP,
      conn: { reqId: `iso-same2-${sthis.nextId().str}` },
    });
    expect(rConn2.isOk()).toBeTruthy();
    const conn2 = rConn2.Ok();

    try {
      // Verify connections
      const chat1 = await conn1.request(buildReqChat(sthis, authA.authType, {}, "ping"), {
        waitFor: MsgIsResChat,
      });
      expect(MsgIsResChat(chat1)).toBeTruthy();

      const chat2 = await conn2.request(buildReqChat(sthis, authA.authType, {}, "ping"), {
        waitFor: MsgIsResChat,
      });
      expect(MsgIsResChat(chat2)).toBeTruthy();

      const gwCtx1: GwCtx = {
        conn: conn1.conn,
        tenant: { tenant: tenantIdA, ledger: ledgerId },
      };
      const gwCtx2: GwCtx = {
        conn: conn2.conn,
        tenant: { tenant: tenantIdA, ledger: ledgerId },
      };

      // Bind conn1 to listen for meta events
      const spGet = sup(authA, { method: "GET", store: "meta" });
      const stream1 = conn1.bind<EventGetMeta, BindGetMeta>(
        buildBindGetMeta(sthis, authA.authType, spGet, gwCtx1),
        { waitFor: MsgIsEventGetMeta },
      );

      // Consume the initial bind response
      const reader1 = stream1.getReader();
      const init1 = await reader1.read();
      expect(init1.done).toBe(false);

      // Conn2 also needs to bind so its tenant is registered on the server
      const spGet2 = sup(authA, { method: "GET", store: "meta" });
      const stream2 = conn2.bind<EventGetMeta, BindGetMeta>(
        buildBindGetMeta(sthis, authA.authType, spGet2, gwCtx2),
        { waitFor: MsgIsEventGetMeta },
      );
      const reader2 = stream2.getReader();
      const init2 = await reader2.read();
      expect(init2.done).toBe(false);

      // Conn2 puts meta -- conn1 (same tenant) SHOULD receive it
      const spPut = sup(authA, { method: "PUT", store: "meta" });
      const metas = {
        metas: [{ cid: sthis.timeOrderedNextId().str, parents: [], data: "MomRkYXRho" }],
        keys: [sthis.timeOrderedNextId().str],
      };
      const putRes = await conn2.request(
        buildReqPutMeta(sthis, authA.authType, spPut.urlParam, metas, gwCtx2),
        { waitFor: MsgIsResPutMeta },
      );
      if (!MsgIsResPutMeta(putRes)) {
        assert.fail(`expected ResPutMeta, got: ${JSON.stringify(putRes)}`);
      }

      // Read the broadcast event from stream1
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 3000),
      );
      const readResult = await Promise.race([reader1.read(), timeoutPromise]);
      await reader1.cancel();
      await reader2.cancel();

      if (readResult.done || !readResult.value) {
        assert.fail("expected EventGetMeta from same-tenant broadcast but got nothing");
      }
      expect(MsgIsEventGetMeta(readResult.value)).toBe(true);
    } finally {
      await conn1.close(buildReqClose(sthis, authA.authType, conn1.conn));
      await conn2.close(buildReqClose(sthis, authA.authType, conn2.conn));
    }
  });
});
