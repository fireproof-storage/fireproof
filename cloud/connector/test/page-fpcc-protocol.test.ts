import { describe, expect, it, vi } from "vitest";
import { PageFPCCProtocol } from "@fireproof/cloud-connector-page";
import { SvcFPCCProtocol } from "@fireproof/cloud-connector-svc";
import { FPCCMessage, FPCCPing } from "@fireproof/cloud-connector-base";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { Writable } from "ts-essentials";

describe("FPCC Protocol", () => {
  const sthis = ensureSuperThis();
  const pageProtocol = new PageFPCCProtocol(sthis, {
    iframeHref: "https://example.com/iframe",
    loginWaitTime: 1000,
  });
  const iframeProtocol = new SvcFPCCProtocol(sthis, {
    dashboardURI: "https://example.com/dashboard",
    cloudApiURI: "https://example.com/wait-for-token",
  });

  iframeProtocol.injectSend((evt: Writable<FPCCMessage>) => {
    evt.src = evt.src ?? "iframe";
    // console.log("IframeFPCCProtocol sending message", evt);
    pageProtocol.handleMessage({ data: evt, origin: "iframe" } as MessageEvent<unknown>);
    return evt;
  });

  function protocolStart() {
    return iframeProtocol.ready().then(() => {
      pageProtocol.injectSend((evt: Writable<FPCCMessage>) => {
        evt.src = evt.src ?? "page";
        iframeProtocol.handleMessage({ data: evt, origin: "page" } as MessageEvent<unknown>);
        return evt;
      });
      return pageProtocol.ready();
    });
  }

  it("ping-pong", async () => {
    const pingMessage: FPCCPing = {
      tid: "test-ping-1",
      type: "FPCCPing",
      src: "page",
      dst: "iframe",
      timestamp: Date.now(),
    };
    const fpccFn = vi.fn();
    pageProtocol.onFPCCMessage(fpccFn);
    await protocolStart();
    pageProtocol.sendMessage(pingMessage);
    expect(fpccFn.mock.calls[fpccFn.mock.calls.length - 1]).toEqual([
      {
        dst: "page",
        pingTid: "test-ping-1",
        src: "iframe",
        tid: expect.any(String),
        timestamp: expect.any(Number),
        type: "FPCCPong",
      },
      {
        data: {
          dst: "page",
          pingTid: "test-ping-1",
          src: "iframe",
          tid: expect.any(String),
          timestamp: expect.any(Number),
          type: "FPCCPong",
        },
        origin: "iframe",
      },
    ]);
    pageProtocol.stop();
  });

  // it("registerApp", async () => {
  //   await protocolStart();
  //   const fpccEvtApp = await pageProtocol.registerDatabase("wurst", {
  //     tid: "tid-test-app-1",
  //     appId: "test-app-1",
  //   });
  //   expect(fpccEvtApp.Ok()).toEqual({
  //     tid: "tid-test-app-1",
  //     type: "FPCCEvtApp",
  //     src: "fp-cloud-connector",
  //     dst: "page",
  //     devId: "we-need-to-implement-device-id",
  //     appId: "test-app-1",
  //     appFavIcon: {
  //       defURL: "https://example.com/favicon.ico",
  //     },
  //     env: {},
  //     localDb: {
  //       accessToken: expect.any(String),
  //       // "auth-token-for-test-app-1-wurst-with-fake-auth-token:zMKseTNm6BhLCJNxy6AtXEe:https://dev.connect.fireproof.direct/api",
  //       ledgerId: "ledger-for-test-app-1",
  //       dbName: "wurst",
  //       tenantId: "tenant-for-test-app-1",
  //     },
  //     user: {
  //       email: "test@example.com",
  //       iconURL: "https://example.com/icon.png",
  //       name: "Test User",
  //       provider: "google",
  //     },
  //   });
  //   pageProtocol.stop();
  // });
});
