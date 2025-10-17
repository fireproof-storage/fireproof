import { describe, expect, it, vi } from "vitest";
import { PageFPCCProtocol } from "./page-fpcc-protocol.js";
import { IframeFPCCProtocol } from "./iframe-fpcc-protocol.js";
import { FPCCMessage, FPCCPing } from "./protocol-fp-cloud-conn.js";
import { ensureSuperThis } from "@fireproof/core-runtime";

describe("FPCC Protocol", () => {
  const sthis = ensureSuperThis();
  const pageProtocol = new PageFPCCProtocol(sthis);
  const iframeProtocol = new IframeFPCCProtocol(sthis);

  iframeProtocol.start((evt: FPCCMessage) => {
    pageProtocol.handleMessage({ data: evt, origin: "page" } as MessageEvent<unknown>);
  });

  function pageProtocolStart() {
    pageProtocol.start((evt: FPCCMessage) => {
      iframeProtocol.handleMessage({ data: evt, origin: "iframe" } as MessageEvent<unknown>);
    });
  }

  it("ping-pong", () => {
    const pingMessage: FPCCPing = {
      tid: "test-ping-1",
      type: "FPCCPing",
      src: "page",
      dst: "iframe",
      timestamp: Date.now(),
    };
    const fpccFn = vi.fn();
    pageProtocol.onFPCCMessage(fpccFn);
    pageProtocolStart();
    pageProtocol.sendMessage(pingMessage, {} as MessageEvent<unknown>);
    expect(fpccFn.mock.calls[fpccFn.mock.calls.length - 1]).toEqual([
      {
        dst: "page",
        pingTid: "test-ping-1",
        src: "iframe",
        tid: expect.any(String),
        timestamp: expect.any(Number),
        type: "FPCCPong",
      },
    ]);
  });
});
