import { Lazy, Logger, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { ToCloudOpts, TokenAndSelectedTenantAndLedger, TokenStrategie } from "@fireproof/core-types-protocols-cloud";
import { hashObjectSync } from "@fireproof/core-runtime";

import { defaultFPCloudConnectorOpts, fpCloudConnector } from "../cloud/connector/svc/fp-cloud-connector.js";
import { SvcFPCCProtocol } from "../cloud/connector/svc/index.js";

class IframeFPCloudConnectStrategy implements TokenStrategie {
  waitState: "started" | "stopped" = "stopped";
  readonly svc: SvcFPCCProtocol;
  readonly hash: () => string;

  constructor(opts: Partial<FPCloudConnectOpts> = {}) {
    this.svc = fpCloudConnector(defaultFPCloudConnectorOpts(opts));
    this.hash = Lazy(() => hashObjectSync(opts));
  }

  readonly waitForIframes = Lazy((callback: (iframe: HTMLIFrameElement) => void) => {
        // Check existing iframes first
        document.querySelectorAll("iframe").forEach((iframe) => {
          callback(iframe as HTMLIFrameElement);
        });

        // Watch for new iframes
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeName === "IFRAME") {
                callback(node as HTMLIFrameElement);
              }

              // Check if added node contains iframes
              if (node instanceof Element) {
                node.querySelectorAll("iframe").forEach((iframe) => {
                  callback(iframe as HTMLIFrameElement);
                });
              }
            });
          });
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        return observer; // Return so you can disconnect later
      });

  ready(): Promise<void> {
    return this.svc.ready().then(() => {
      this.waitForIframes((iframe) => {
        this.svc.serveIframe(iframe);
      });
      this.waitState = "started";
    });
  }

  open(_sthis: SuperThis, _logger: Logger, _localDbName: string, _opts: ToCloudOpts): void {
    throw new Error("Method not implemented.");
  }
  waitForToken(
    _sthis: SuperThis,
    _logger: Logger,
    _localDbName: string,
    _opts: ToCloudOpts,
  ): Promise<Result<TokenAndSelectedTenantAndLedger>> {
    throw new Error("Method not implemented.");
  }
  stop(): void {
    throw new Error("Method not implemented.");
  }
}
