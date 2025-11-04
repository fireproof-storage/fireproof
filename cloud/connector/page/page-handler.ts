/**
 * Consumer program that creates and inserts an iframe with in-iframe.ts
 */

import { Future } from "@adviser/cement";
import { Writable } from "ts-essentials";
import { PageFPCCProtocol } from "./page-fpcc-protocol.js";
import { FPCCMessage, FPCCProtocolBase } from "@fireproof/cloud-connector-base";

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

/**
 * Main function to set up the iframe
 */
export function initializeIframe(pageProtocol: FPCCProtocolBase, iframeSrc: string): Promise<HTMLIFrameElement> {
  (globalThis as Record<symbol, unknown>)[Symbol.for("FP_PRESET_ENV")] = {
    FP_DEBUG: "*",
  };

  const iframe = createIframe(iframeSrc);
  const waitForLoad = new Future<void>();
  // Add load event listener
  // console.log("Initializing FPCC iframe with src:", iframeHref.toString());
  iframe.addEventListener("load", () => {
    window.addEventListener("message", pageProtocol.handleMessage);
    pageProtocol.injectSend((event: Writable<FPCCMessage>) => {
      // console.log("Sending PageFPCCProtocol", event, iframe.src);
      event.dst = iframe.src;
      event.src = window.location.href;
      iframe.contentWindow?.postMessage(event, iframe.src);
      return event;
    });
    pageProtocol.ready().then(() => {
      waitForLoad.resolve();
    });
  });
  // Add error event listener
  iframe.addEventListener("error", pageProtocol.handleError);
  insertIframeAsLastElement(iframe);
  return waitForLoad.asPromise().then(() => iframe);
}

// Initialize when script loads
// initializeIframe();

// export { createIframe, insertIframeAsLastElement, initializeIframe };
