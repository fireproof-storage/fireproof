import { renderToString } from "preact-render-to-string";
import { h as React } from "preact";

export function defaultOverlayHtml(redirectLink: string) {
  return renderToString(
    <>
      <div className="fpOverlayContent">
        <div className="fpCloseButton">&times;</div>
        Fireproof Dashboard Sign in to Fireproof Dashboard
        <a href={redirectLink} target="_blank">
          Redirect to Fireproof
        </a>
      </div>
    </>,
  );
}

export function defaultOverlayCss() {
  return `
.fpContainer {
  position: relative; /* Needed for absolute positioning of the overlay */
}

.fpOverlay {
  display: none; /* Initially hidden */
  position: fixed; /* Covers the whole viewport */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent background */
  z-index: 1; /* Ensure it's on top of other content */
}

.fpOverlayContent {
  position: absolute;
  // width: calc(100vw - 50px);
  // height: calc(100vh - 50px);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); /* Center the content */
  // transform: translate(0%, 0%); /* Center the content */
  background-color: white;
  color: black;
  // margin: 10px;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
}

.fpCloseButton {
  position: absolute;
  top: 10px;
  right: 15px;
  font-size: 20px;
  cursor: pointer;
}
`;
}
