import { ensureSuperThis } from "@fireproof/core-runtime";
import { Lazy } from "@adviser/cement";
import { FPCCMessage } from "./protocol-fp-cloud-conn.js";
import { IframeFPCCProtocol } from "./iframe-fpcc-protocol.js";

export const postMessager = Lazy(() => {
  (globalThis as Record<symbol, unknown>)[Symbol.for("FP_PRESET_ENV")] = {
    FP_DEBUG: "*",
  };
  const sthis = ensureSuperThis();
  const protocol = new IframeFPCCProtocol(sthis);
  window.addEventListener("message", protocol.handleMessage);
  protocol.injectSend((event: FPCCMessage, srcEvent: MessageEvent<unknown>) => {
    (event as { src: string }).src = event.src ?? window.location.href;
    // console.log("postMessager sending message", event);
    srcEvent.source?.postMessage(event, { targetOrigin: srcEvent.origin });
    return event;
  });
  return protocol;
});
