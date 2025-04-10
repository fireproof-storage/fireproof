import { DocWithId, useFireproof, toCloud, WebToCloudCtx, WebCtx } from "use-fireproof";
import { useState, useEffect } from "react";
import "./App.css";
// import { URI } from "@adviser/cement";

function App() {
  const { database, attach } = useFireproof("fireproof-party", {
    attach: toCloud({
      fpCloud: { base: "fpcloud://fireproof-v2-cloud-dev.jchris.workers.dev?tenant=test-tenant&ledger=test-ledger" },
    }),
  });
  const [rows, setRows] = useState([] as DocWithId<{ value: string }>[]);
  // const [token, setToken] = useState("");

  useEffect(() => {
    database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
      setRows(rows.rows.map((i) => i.value));
    });
  });

  const webCtx = attach.state === "attached" ? attach.attached.ctx().get<WebToCloudCtx>(WebCtx) : undefined;

  return (
    <>
      <h1>FireProof Party of the 3rd</h1>
      <div>{attach.state}</div>
      <div
        className="card"
        onClick={() => {
          console.log("reset", webCtx?.token());
          webCtx?.resetToken();
        }}
      >
        Reset Token
      </div>
      <div
        className="card"
        onClick={() => {
          database.put({ value: `3rd-${rows.length}` }).then(() => {
            database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
              setRows(rows.rows.map((i) => i.value));
            });
          });
        }}
      >
        Add - {webCtx?.token()}
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
