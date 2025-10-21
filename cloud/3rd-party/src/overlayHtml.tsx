import { renderToString } from "preact-render-to-string";
import { h as React } from "preact";

export function overlayHtml(url: string) {
  return renderToString(
    <div class="fpOverlayContent">
      <div class="fpCloseButton">&times;</div>
      Fireproof Dashboard
      <br />
      Sign in to Fireproof Dashboard
      <a href={url} target="_blank">
        Redirect to Fireproof
      </a>
    </div>,
  );
}
