/**
 * Consumer program that creates and inserts an iframe with in-iframe.ts
 */

import { CoerceURI, KeyedResolvOnce, URI } from "@adviser/cement";
import { PageFPCCProtocol } from "./page-fpcc-protocol.js";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { FPCCMessage } from "./protocol-fp-cloud-conn.js";

/**
 * Creates an iframe element with the specified source
 */
function createIframe(src: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.id = "fireproof-connector-iframe";

  // Set iframe attributes - make it invisible
  iframe.style.display = "none";

  return iframe;
}

/**
 * Inserts the iframe as the last element in the document body
 */
function insertIframeAsLastElement(iframe: HTMLIFrameElement): void {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(iframe);
    });
  } else {
    // DOM is already ready
    document.body.appendChild(iframe);
  }
}

const pageProtocolInstance = new KeyedResolvOnce<PageFPCCProtocol>();
/**
 * Main function to set up the iframe
 */
export function initializeIframe(
  {
    iframeSrc,
  }: {
    iframeSrc: CoerceURI;
  } = {
    iframeSrc: "./injected-iframe.html",
  },
) {
  (globalThis as Record<symbol, unknown>)[Symbol.for("FP_PRESET_ENV")] = {
    FP_DEBUG: "*",
  };
  let iframeHref: URI;
  if (typeof iframeSrc === "string" && iframeSrc.match(/^[./]/)) {
    // Infer the path to in-iframe.js from the current module's location
    // eslint-disable-next-line no-restricted-globals
    const scriptUrl = new URL(import.meta.url);
    // eslint-disable-next-line no-restricted-globals
    iframeHref = URI.from(new URL(iframeSrc, scriptUrl).href);
  } else {
    iframeHref = URI.from(iframeSrc);
  }

  return pageProtocolInstance.get(iframeHref.toString()).once(() => {
    const iframe = createIframe(iframeHref.toString());
    // Add load event listener
    const sthis = ensureSuperThis();
    const pageProtocol = new PageFPCCProtocol(sthis, { iframeHref });
    // console.log("Initializing FPCC iframe with src:", iframeHref.toString());
    iframe.addEventListener("load", () => {
      window.addEventListener("message", pageProtocol.handleMessage);
      pageProtocol.start((event: FPCCMessage) => {
        // console.log("Sending PageFPCCProtocol", event, iframe.src);
        (event as { dst: string }).dst = iframe.src;
        (event as { src: string }).src = window.location.href;
        iframe.contentWindow?.postMessage(event, iframe.src);
        return event;
      });
    });
    // Add error event listener
    iframe.addEventListener("error", pageProtocol.handleError);

    insertIframeAsLastElement(iframe);

    return pageProtocol.connected().then(() => pageProtocol);
  });
}

// Initialize when script loads
// initializeIframe();

// export { createIframe, insertIframeAsLastElement, initializeIframe };
