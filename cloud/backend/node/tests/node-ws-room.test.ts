import { describe, it, expect, beforeEach } from "vitest";
import { testSuperThis } from "@fireproof/cloud-base";
import { NodeHonoFactory } from "../node-hono-server.js";
import { QSId, TenantLedger, qsidKey } from "@fireproof/core-types-protocols-cloud";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

describe("NodeWSRoom tenant-ledger tracking", () => {
  const sthis = testSuperThis();

  let factory: NodeHonoFactory;

  beforeEach(() => {
    factory = new NodeHonoFactory(sthis, {
      sql: drizzle(createClient({ url: ":memory:" })),
    });
  });

  function makeConn(reqId: string, resId: string): QSId {
    return { reqId, resId };
  }

  function makeTenant(tenant: string, ledger: string): TenantLedger {
    return { tenant, ledger };
  }

  it("setConnTenantLedger stores and getConnTenantLedger retrieves", () => {
    const wsRoom = factory._wsRoom;
    const conn = makeConn("req1", "res1");
    const tl = makeTenant("tenantA", "ledgerA");

    wsRoom.setConnTenantLedger(conn, tl);
    const result = wsRoom.getConnTenantLedger(conn);

    expect(result).toEqual(tl);
  });

  it("getConnTenantLedger returns undefined for unknown conn", () => {
    const wsRoom = factory._wsRoom;
    const conn = makeConn("unknown-req", "unknown-res");

    expect(wsRoom.getConnTenantLedger(conn)).toBeUndefined();
  });

  it("different connections get different tenant-ledgers", () => {
    const wsRoom = factory._wsRoom;
    const connA = makeConn("reqA", "resA");
    const connB = makeConn("reqB", "resB");
    const tlA = makeTenant("tenantA", "ledgerA");
    const tlB = makeTenant("tenantB", "ledgerB");

    wsRoom.setConnTenantLedger(connA, tlA);
    wsRoom.setConnTenantLedger(connB, tlB);

    expect(wsRoom.getConnTenantLedger(connA)).toEqual(tlA);
    expect(wsRoom.getConnTenantLedger(connB)).toEqual(tlB);
  });

  it("setConnTenantLedger overwrites existing entry", () => {
    const wsRoom = factory._wsRoom;
    const conn = makeConn("req1", "res1");
    const tl1 = makeTenant("tenantOld", "ledgerOld");
    const tl2 = makeTenant("tenantNew", "ledgerNew");

    wsRoom.setConnTenantLedger(conn, tl1);
    expect(wsRoom.getConnTenantLedger(conn)).toEqual(tl1);

    wsRoom.setConnTenantLedger(conn, tl2);
    expect(wsRoom.getConnTenantLedger(conn)).toEqual(tl2);
  });

  it("removeConn also removes tenant-ledger", () => {
    const wsRoom = factory._wsRoom;
    const conn = makeConn("req1", "res1");
    const tl = makeTenant("tenantA", "ledgerA");

    // Add conn to the room so removeConn can find it
    wsRoom.addConn({ wsRoom } as never, undefined as never, conn);
    wsRoom.setConnTenantLedger(conn, tl);
    expect(wsRoom.getConnTenantLedger(conn)).toEqual(tl);

    wsRoom.removeConn(conn);
    expect(wsRoom.getConnTenantLedger(conn)).toBeUndefined();
  });

  it("removeConn does not affect other connections tenant-ledgers", () => {
    const wsRoom = factory._wsRoom;
    const connA = makeConn("reqA", "resA");
    const connB = makeConn("reqB", "resB");
    const tlA = makeTenant("tenantA", "ledgerA");
    const tlB = makeTenant("tenantB", "ledgerB");

    wsRoom.addConn({ wsRoom } as never, undefined as never, connA);
    wsRoom.addConn({ wsRoom } as never, undefined as never, connB);
    wsRoom.setConnTenantLedger(connA, tlA);
    wsRoom.setConnTenantLedger(connB, tlB);

    wsRoom.removeConn(connA);

    expect(wsRoom.getConnTenantLedger(connA)).toBeUndefined();
    expect(wsRoom.getConnTenantLedger(connB)).toEqual(tlB);
  });

  it("internal map key matches qsidKey", () => {
    const wsRoom = factory._wsRoom;
    const conn = makeConn("req-x", "res-y");
    const tl = makeTenant("t", "l");
    const expectedKey = qsidKey(conn);

    wsRoom.setConnTenantLedger(conn, tl);

    expect(wsRoom._connTenantLedgers.has(expectedKey)).toBe(true);
    expect(wsRoom._connTenantLedgers.get(expectedKey)).toEqual(tl);
  });
});
