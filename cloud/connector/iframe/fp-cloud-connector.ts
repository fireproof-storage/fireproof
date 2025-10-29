import { ensureSuperThis } from "@fireproof/core-runtime";
import { BuildURI, Lazy, URI } from "@adviser/cement";
import { FPCCMessage } from "@fireproof/cloud-connector-base";
import { IframeFPCCProtocol } from "./iframe-fpcc-protocol.js";

export const fpCloudConnector = Lazy(async (loadUrlStr: string) => {
  (globalThis as Record<symbol, unknown>)[Symbol.for("FP_PRESET_ENV")] = {
    FP_DEBUG: "*",
  };
  const sthis = ensureSuperThis();
  const loadUrl = URI.from(loadUrlStr);
  const dashboardURI = loadUrl.getParam("dashboard_uri");
  let cloudApiURI = loadUrl.getParam("cloud_api_uri");
  if (dashboardURI && !cloudApiURI) {
    cloudApiURI = BuildURI.from(dashboardURI).pathname("/api").toString();
  }

  console.log("fpCloudConnector called with", loadUrlStr, { dashboardURI, cloudApiURI });

  const protocol = new IframeFPCCProtocol(sthis, {
    dashboardURI: dashboardURI ?? "https://dev.connect.fireproof.direct/fp/cloud",
    cloudApiURI: cloudApiURI ?? "https://dev.connect.fireproof.direct/api",
  });
  window.addEventListener("message", protocol.handleMessage);
  protocol.injectSend((event: FPCCMessage, srcEvent: MessageEvent<unknown>) => {
    (event as { src: string }).src = event.src ?? window.location.href;
    // console.log("postMessager sending message", event);
    srcEvent.source?.postMessage(event, { targetOrigin: srcEvent.origin });
    return event;
  });
  await protocol.ready();
  return protocol;
});
