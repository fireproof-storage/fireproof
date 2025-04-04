import { DocWithId, useFireproof, toCloud, ToCloudName, ToCloudCtx } from "use-fireproof";
import { useState, useEffect } from "react";
import "./App.css";
// import { URI } from "@adviser/cement";

function App() {
  const { database, attached } = useFireproof("fireproof-party", {
    attach: toCloud(),
  });
  const [rows, setRows] = useState([] as DocWithId<{ value: string }>[]);
  // const [token, setToken] = useState("");

  useEffect(() => {
    database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
      setRows(rows.rows.map((i) => i.value));
    });
  });

  // useEffect(() => {
  //   const uri = URI.from(window.location.href);
  //   if (uri.hasParam("fpToken")) {
  //     setToken(uri.getParam("fpToken", ""));
  //   }
  // }, [window.location.href]);
  const attach = attached?.ctx().get<ToCloudCtx>(ToCloudName);

  return (
    <>
      <h1>FireProof Party of the 3rd</h1>
      <div>{attached ? "Attached" : "waiting to attach"}</div>
      <div className="card" onClick={() => attach?.resetToken()}>
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
        Add - {attach?.token()}
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
