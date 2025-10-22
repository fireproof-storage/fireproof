import { DocWithId, useFireproof, toCloud, FPCloudConnectStrategy } from "use-fireproof";
import React, { useState, useEffect } from "react";
import "./App.css";
import { overlayHtml } from "./overlayHtml.js";
// import { URI } from "@adviser/cement";

function App() {
  const { database, attach } = useFireproof("fireproof-5-party", {
    attach: toCloud({
      strategy: new FPCloudConnectStrategy({
        //   overlayCss: defaultOverlayCss,
        overlayHtml,
      }),
      // dashboardURI: "http://localhost:7370/fp/cloud/api/token",
      // tokenApiURI: "http://localhost:7370/api",
      // urls: { base: "fpcloud://localhost:8787?protocol=ws" },
      // tenant: "3rd-party",
      // ledger: "vibes",
    }),
  });
  const [rows, setRows] = useState([] as DocWithId<{ value: string }>[]);
  // const [token, setToken] = useState("");

  useEffect(() => {
    database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
      setRows(rows.rows.map((i) => i.value));
    });
  });

  // attach.state === "attached" ? attach.attached.ctx().get<WebToCloudCtx>(WebCtx)?.hook()

  return (
    <>
      <h1>FireProof Party of the 3rd</h1>
      <div>
        {attach.state}:[{attach.ctx.tokenAndClaims.state === "ready" ? attach.ctx.tokenAndClaims.tokenAndClaims.token : ""}]
        {attach.state === "error" ? attach.error.message : ""}
      </div>
      <div
        className="card"
        onClick={() => {
          if (attach.ctx.tokenAndClaims.state === "ready") {
            attach.ctx.tokenAndClaims.reset();
          }
        }}
      >
        Reset Token
      </div>
      <div
        className="card"
        onClick={() => {
          database.put({ value: `3rd-${rows.length}` }).then(() => {
            // console.log("added", rows.length);
            database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
              // console.log("rows", rows);
              setRows(rows.rows.map((i) => i.value));
            });
          });
        }}
      >
        Add
      </div>
      <div className="read-the-docs">
        {rows.map((row) => {
          return <div key={row._id}>{row.value}</div>;
        })}
      </div>

      {/* <iframe src="http://localhost:3002" title="3rd-party" id="fp-dashboard" /> */}
    </>
  );
}

export default App;
