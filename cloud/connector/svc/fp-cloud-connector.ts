import { ensureSuperThis } from "@fireproof/core-runtime";
import { BuildURI, Lazy, URI } from "@adviser/cement";
import { FPCCMessage } from "@fireproof/cloud-connector-base";
import { SvcFPCCProtocol, SvcFPCCProtocolOpts } from "./svc-fpcc-protocol.js";

export function defaultFPCloudConnectorOpts(
  opts: Partial<
    SvcFPCCProtocolOpts & {
      readonly loadUrlStr: string;
    }
  >,
): SvcFPCCProtocolOpts {
  const loadUrl = URI.from(opts.loadUrlStr ?? window.location.href);
  const dashboardURI = opts.dashboardURI ?? loadUrl.getParam("dashboard_uri");
  let cloudApiURI = opts.cloudApiURI ?? loadUrl.getParam("cloud_api_uri");
  if (dashboardURI && !cloudApiURI) {
    cloudApiURI = BuildURI.from(dashboardURI).pathname("/api").toString();
  }
  return {
    dashboardURI: dashboardURI ?? "https://dev.connect.fireproof.direct/fp/cloud",
    cloudApiURI: cloudApiURI ?? "https://dev.connect.fireproof.direct/api",
  };
}

export const fpCloudConnector = Lazy((opts: SvcFPCCProtocolOpts) => {
  const sthis = opts.sthis ?? ensureSuperThis();
  const protocol = new SvcFPCCProtocol(sthis, opts);
  window.addEventListener("message", protocol.handleMessage);
  protocol.injectSend((event: FPCCMessage, srcEvent: MessageEvent<unknown> | string) => {
    (event as { src: string }).src = event.src ?? window.location.href;
    if (typeof srcEvent === "string") {
      window.postMessage(event, srcEvent);
      return event;
    } else {
      srcEvent.source?.postMessage(event, { targetOrigin: srcEvent.origin });
    }
    return event;
  });
  return protocol;
});
