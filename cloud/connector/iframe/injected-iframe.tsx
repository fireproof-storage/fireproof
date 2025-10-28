import { renderToString } from "preact-render-to-string";
import { createElement } from "preact";
// import { BuildURI, loadAsset } from "@adviser/cement";
import type { fpCloudConnector } from "./fp-cloud-connector.js";

export const React = {
  createElement,
};

async function scriptFpCloudConnect() {
  const script = () => {
    let fpccJS;
    // vite does strange things to import
    // in this case the iframe is not running in a vite runtime
    try {
      // eslint-disable-next-line no-restricted-globals
      const url = new URL("fp-cloud-connector.js", window.location.href);

      fpccJS = import(/* @vite-ignore */ url.toString());
      // eslint-disable-next-line no-console
      console.log("loaded -- js", url.toString());
    } catch (e) {
      // eslint-disable-next-line no-restricted-globals
      const url = new URL("fp-cloud-connector.ts", window.location.href);
      fpccJS = import(/* @vite-ignore */ url.toString());
      // eslint-disable-next-line no-console
      console.log("loaded -- ts", url.toString(), fpccJS);
    }
    fpccJS
      .then((fpcc: { fpCloudConnector: typeof fpCloudConnector }) => fpcc.fpCloudConnector(window.location.href))
      // eslint-disable-next-line no-console
      .then(() => console.log("injected-iframe-ready", window.location.href));
  };
  return `(${script.toString().replace(/__vite_ssr_dynamic_import__/, "import")})()`;
}

export async function injectedHtml() {
  return renderToString(
    <html>
      <head>Fireproof Cloud Connector</head>
      <body>
        I'm the Fireproof Cloud Connector
        <script type="module" dangerouslySetInnerHTML={{ __html: await scriptFpCloudConnect() }}></script>
      </body>
    </html>,
  );
}
