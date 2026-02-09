import React from "react";
import "./Box.css";
import { useFPCloudConnectSvc } from "use-fireproof/fp-cloud-connect-strategy.js";

// import { URI } from "@adviser/cement";

function Box() {
  const svc = useFPCloudConnectSvc();
  return (
    <>
      <h1>I'm the Application Box</h1>
      <h2>{svc.fpSvc.hash()}</h2>
      <h2>{svc.state}</h2>
      {/* <iframe src="http://localhost:3002" title="3rd-party" id="fp-dashboard" /> */}
      {svc.state === "ready" && <iframe src="http://localhost:3001"></iframe>}
    </>
  );
}

export default Box;
