/**
 * Consumer program that creates an iframe to host a Web Worker
 */

console.log("Consumer: Initializing iframe-based Worker");

/**
 * Gets the iframe wrapper URL from URL parameter or default location
 */
function getIframeWrapperUrl(): string {
  // Check for webWorker URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const webWorkerParam = urlParams.get('webWorker');

  if (webWorkerParam) {
    // Extract base URL and construct iframe-wrapper.html path
    const workerUrl = new URL(webWorkerParam);
    const basePath = workerUrl.pathname.substring(0, workerUrl.pathname.lastIndexOf('/'));
    const iframeUrl = `${workerUrl.origin}${basePath}/iframe-wrapper.html`;
    console.log(`Consumer: Using iframe wrapper from URL parameter: ${iframeUrl}`);
    return iframeUrl;
  }

  // Infer the path to iframe-wrapper.html from the current module's location
  // eslint-disable-next-line no-restricted-globals
  const scriptUrl = new URL(import.meta.url);
  // Get the directory path by removing the filename
  const basePath = scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/'));
  // eslint-disable-next-line no-restricted-globals
  const iframeUrl = `${scriptUrl.origin}${basePath}/iframe-wrapper.html`;

  return iframeUrl;
}

/**
 * Creates an iframe to host the Web Worker
 */
function createIframe(src: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.display = 'none'; // Hidden iframe
  document.body.appendChild(iframe);

  console.log('Consumer: Iframe created with source:', src);

  return iframe;
}

/**
 * Sets up message handling for the iframe
 */
function setupIframeCommunication(iframe: HTMLIFrameElement): void {
  // Listen for messages from the iframe
  window.addEventListener('message', (event) => {
    // Verify the message is from our iframe
    if (event.source === iframe.contentWindow) {
      console.log('Consumer: Received message from iframe:', event.data);
    }
  });

  // Wait for iframe to load before sending initial message
  iframe.addEventListener('load', () => {
    console.log('Consumer: Iframe loaded, sending initial message');

    // Send an initial message to the iframe
    iframe.contentWindow?.postMessage({
      type: 'init',
      message: 'Hello from consumer',
      timestamp: Date.now()
    }, '*');
  });
}

/**
 * Main function to set up the iframe worker
 */
function initializeWorker(): HTMLIFrameElement {
  const iframeUrl = getIframeWrapperUrl();

  console.log(`Consumer: Creating iframe with source: ${iframeUrl}`);
  const iframe = createIframe(iframeUrl);

  setupIframeCommunication(iframe);

  return iframe;
}

// Initialize when script loads
const workerIframe = initializeWorker();

export { createIframe, setupIframeCommunication, initializeWorker, workerIframe };
