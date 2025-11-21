import { it, describe, beforeAll, expect, vi } from "vitest";
import { fireproofProxy } from "@fireproof/core-svc-api";
import { FPDatabaseSvc } from "@fireproof/core-svc-host";
import { FPTransport, FPWebWindow, MsgType } from "@fireproof/core-svc-protocol";
import { ensureLogger, ensureSuperThis } from "@fireproof/core-runtime";

class DirectSide implements FPWebWindow {
  // #otherSide?: DirectSide;
  readonly mySide: string;
  readonly recvHandlers: ((msg: unknown) => void)[] = [];
  readonly targetSides: DirectSide[] = [];
  constructor(mySide: string) {
    this.mySide = mySide;
  }
  clone() {
    return new DirectSide(this.mySide);
  }
  attachOtherSide(otherSide: DirectSide) {
    // this.#otherSide = otherSide;
    otherSide.targetSides.push(this);
    this.targetSides.push(otherSide);
    return this;
  }
  postMessage(msg: Event, target: string): void {
    this.targetSides.find((side) => target === side.mySide)?.recvHandlers.forEach((h) => h({ ...msg, origin: this.mySide }));
  }
  addEventListener<T>(type: string, listener: (msg: T) => void, _options?: boolean | AddEventListenerOptions): void {
    this.recvHandlers.push((msg: unknown) => {
      return listener(msg as T);
    });
  }

  removeEventListener<T>(_type: string, _listener: (msg: T) => void, _options?: boolean | EventListenerOptions): void {
    // this.recvHandlers.splice(
    //   this.recvHandlers.indexOf((msg: unknown) => listener(msg as T)),
    //   1,
    // );
  }
}

const svcSide = new DirectSide("svcSide");
// const proxySide = new DirectSide("proxySide");

describe("Full Round Trip Tests", () => {
  const sthis = ensureSuperThis();

  const fpHost = new FPDatabaseSvc({
    sthis,
    logger: ensureLogger(sthis, "FPDatabaseSvcTestHost"),
    webWindow: svcSide,
  });

  const fps = Array(5)
    .fill(0)
    .map((_, i) => {
      const webWindow = new DirectSide(`proxySide-${i}`).attachOtherSide(svcSide);
      const proxy = fireproofProxy(`frt-db-${i}`, {
        target: "svcSide",
        origin: "proxySide",
        webWindow,
      });
      const transport = proxy.ledger.ctx.get("transport") as FPTransport;
      const sendMock = vi.fn((..._args: unknown[]) => Promise.resolve());
      transport.onSend(sendMock);
      const recvMock = vi.fn((..._args: unknown[]) => Promise.resolve());
      transport.onRecv(recvMock);
      return {
        webWindow,
        transport,
        sendMock,
        recvMock,
        proxy: fireproofProxy(`frt-db-${i}`, {
          target: "svcSide",
          origin: "proxySide",
          webWindow,
        }),
      };
    });

  beforeAll(async () => {
    await fpHost.start();
  });

  it("justReady", async () => {
    for (const fp of fps) {
      await fp.proxy.ready();
      expect(fp.sendMock).toHaveBeenCalledTimes(1);
      const send = fp.sendMock.mock.calls[0][0] as MsgType;
      expect(fp.recvMock).toHaveBeenCalledWith(
        {
          dbId: expect.any(String),
          dbName: fp.proxy.name,
          src: expect.any(String),
          tid: send.tid,
          dst: send.src,
          type: "resApplyDatabaseConfig",
        },
        { origin: "svcSide" },
      );
    }
  });

  it.skip("get non-existing doc", async () => {
    for (const fp of fps) {
      await expect(fp.proxy.get("non-existing-doc")).rejects.toThrowError("Document with ID non-existing-doc not found");
    }
  });

  it.skip("bulk insert and get", async () => {
    const now = Date.now();
    for (const fp of fps) {
      const docsToInsert = Array(5)
        .fill(0)
        .map((_, i) => ({
          _id: `doc-${i}`,
          data: {
            value: `value-${i}`,
            timestamp: now,
            // eslint-disable-next-line no-restricted-globals
            binValue: new TextEncoder().encode(`binary-${i}`),
          },
        }));
      const bulkRes = await fp.proxy.bulk(docsToInsert);

      expect(bulkRes.ids).toHaveLength(docsToInsert.length);
      for (const doc of docsToInsert) {
        const gotDoc = await fp.proxy.get(doc._id);
        expect(gotDoc).toEqual(doc);
      }
    }
  });
});
