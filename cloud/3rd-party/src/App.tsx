import { Attachable, DocWithId, useFireproof, bs } from "use-fireproof";
import { useState, useEffect } from "react";
import "./App.css";
import { BuildURI, ResolveOnce, URI } from "@adviser/cement";
import { ne } from "drizzle-orm";

const needsAttach = new ResolveOnce();

function toCloud(): Attachable {
  return {
    name: "toCloud",
    prepare: async () => {
      console.log("Attaching to cloud");
      const gatewayInterceptor = bs.URIInterceptor.withMapper((uri) => {
        console.log("Intercepting", uri.toString());
        return uri.build().setParam("authJWK", "the-token").URI();
      });
      return {
        car: { url: "memory://car", gatewayInterceptor },
        file: { url: "memory://file", gatewayInterceptor },
        meta: { url: "memory://meta", gatewayInterceptor },
        // wal: { url: "memory://wal" },
      };
    },
  };
}

function App() {
  const { database } = useFireproof("fireproof-party");
  const [rows, setRows] = useState([] as DocWithId<{ value: string }>[]);

  const [token, setToken] = useState("");

  const [triggerAttach, setTriggerAttach] = useState(false);

  useEffect(() => {
    database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
      setRows(rows.rows.map((i) => i.value));
    });
    if (triggerAttach) {
      needsAttach
        .once(async () => {
          try {
            database.attach(toCloud());
          } catch (e) {
            console.error("Error attaching", e);
          }
        })
        .catch(console.error);
    }
  }, [database, triggerAttach]);

  useEffect(() => {
    const uri = URI.from(window.location.href);
    if (uri.hasParam("fpToken")) {
      setToken(uri.getParam("fpToken", ""));
    }
  }, [window.location.href]);

  if (triggerAttach) {
    const uri = URI.from(window.location.href);
    if (!uri.hasParam("fpToken")) {
      // window.location.href = BuildURI.from("http://localhost:3002/fp/cloud/api/token")
      window.location.href = BuildURI.from("https://dev.connect.fireproof.direct/fp/cloud/api/token")
        .setParam("back_url", window.location.href)
        .toString();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

  return (
    <>
      <h1>FireProof Party of the 3rd</h1>
      <div
        className="card"
        onClick={() => {
          setTriggerAttach(true);
        }}
      >
        Do Attach
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
        Add - {token}
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
