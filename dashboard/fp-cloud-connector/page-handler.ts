/**
 * Consumer program that creates and inserts an iframe with in-iframe.ts
 */

import { CoerceURI, URI } from "@adviser/cement";
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

/**
 * Main function to set up the iframe
 */
function initializeIframe(
  {
    iframeSrc,
  }: {
    iframeSrc: CoerceURI;
  } = {
    iframeSrc: "./injected-iframe.html",
  },
): void {
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
  const iframe = createIframe(iframeHref.toString());
  // Add load event listener
  const sthis = ensureSuperThis();
  const pageProtocol = new PageFPCCProtocol(sthis);
  console.log("Initializing FPCC iframe with src:", iframeHref.toString());
  iframe.addEventListener("load", () => {
    window.addEventListener("message", pageProtocol.handleMessage);
    pageProtocol.start((event: FPCCMessage) => {
      console.log("Sending PageFPCCProtocol", event, iframe.src);
      iframe.contentWindow?.postMessage(event, iframe.src);
    });
  });
  // Add error event listener
  iframe.addEventListener("error", pageProtocol.handleError);

  insertIframeAsLastElement(iframe);
}

// Initialize when script loads
initializeIframe();

export { createIframe, insertIframeAsLastElement, initializeIframe };
