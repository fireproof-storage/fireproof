import { jsx } from "use-fireproof";

const {
  renderToString,
  React 
} = jsx

// function jsxDEV(...args: unknown[]) {
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   return (React as any).call(React, ...args)
// }
export function overlayHtml(url: string) {
  // return renderToString(h("div", {}))
  return renderToString(
    <div className="fpOverlayContent">
      <div className="fpCloseButton">&times;</div>
      Fireproof Dashboard
      <br />
      Sign in to Fireproof Dashboard
      <a href={url} target="_blank">
        Redirect to Fireproof
      </a>
    </div>,
  );
}
