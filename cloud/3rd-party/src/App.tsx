import { DocWithId, useFireproof, toCloud, WebToCloudCtx, WebCtx } from "use-fireproof";
import { useState, useEffect } from "react";
import "./App.css";
<<<<<<< HEAD
// import { URI } from "@adviser/cement";
||||||| parent of a6147e8f (chore: added cli)
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
=======
import { BuildURI, ResolveOnce, URI } from "@adviser/cement";

const needsAttach = new ResolveOnce();

function toCloud(): Attachable {
  return {
    name: "toCloud",
    prepare: async () => {
      // console.log("Attaching to cloud");
      const gatewayInterceptor = bs.URIInterceptor.withMapper((uri) => {
        // console.log("Intercepting", uri.toString());
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
>>>>>>> a6147e8f (chore: added cli)

function App() {
  const { database, attach } = useFireproof("fireproof-4-party", {
    attach: toCloud({
      urls: { base: "fpcloud://fireproof-v2-cloud-dev.jchris.workers.dev" },
      tenant: "3rd-party",
      ledger: "have-four-drinks",
    }),
  });
  const [rows, setRows] = useState([] as DocWithId<{ value: string }>[]);
  // const [token, setToken] = useState("");

  useEffect(() => {
    database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
      setRows(rows.rows.map((i) => i.value));
    });
<<<<<<< HEAD
  });
||||||| parent of a6147e8f (chore: added cli)
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
=======
    if (triggerAttach) {
      needsAttach
        .once(async () => {
          try {
            database.attach(toCloud());
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Error attaching", e);
          }
        })
        // eslint-disable-next-line no-console
        .catch(console.error);
    }
  }, [database, triggerAttach]);
>>>>>>> a6147e8f (chore: added cli)

<<<<<<< HEAD
  const webCtx = attach.state === "attached" ? attach.attached.ctx().get<WebToCloudCtx>(WebCtx) : undefined;

||||||| parent of a6147e8f (chore: added cli)
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

=======
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

>>>>>>> a6147e8f (chore: added cli)
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
            console.log("added", rows.length);
            database.allDocs<DocWithId<{ value: string }>>().then((rows) => {
              console.log("rows", rows);
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
