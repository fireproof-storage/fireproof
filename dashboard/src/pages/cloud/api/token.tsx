import { URI } from "@adviser/cement";
import { AppContext } from "../../../app-context.tsx";
import { Navigate, useSearchParams } from "react-router-dom";
import { useContext, useEffect, useRef, useState } from "react";
import { ps } from "@fireproof/core";
import { LedgerUser } from "../../../../backend/ledgers.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserTenant } from "../../../../backend/api.ts";

import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";

import "highlight.js/styles/github.css";

// Then register the languages you need
hljs.registerLanguage("javascript", javascript);

export function redirectBackUrl() {
  const uri = URI.from(window.location.href);
  if (uri.hasParam("token")) {
    const backUrl = URI.from(uri.getParam("back_url", ""));
    if (backUrl.protocol.startsWith("http")) {
      // console.log("api-RedirectBackUrl", backUrl, window.location.href);
      window.location.href = backUrl.toString();
    }
  }
}

interface TenantLedgerWithName extends ps.cloud.TenantLedger {
  readonly name: string;
}

export function ApiToken() {
  const { cloud } = useContext(AppContext);

  const buri = URI.from(window.location.href);

  const [searchParams, setSearchParams] = useSearchParams();

  // const navigate = useNavigate();

  const [initialParameters, setInitialParameters] = useState(false);

  const [createApiToken, setCreateApiToken] = useState<Partial<TenantLedgerWithName>>({});

  // console.log("createApiToken", searchParams.toString(), createApiToken);

  const couldSelected = !!createApiToken.ledger && !!createApiToken.tenant;

  function selectLedger(param: TenantLedgerWithName) {
    setSearchParams((prev) => {
      // console.log("setSearchParams", prev.toString());
      prev.set("local_ledger_name", param.name);
      prev.set("tenant", param.tenant);
      prev.set("ledger", param.ledger);
      return prev;
    });
    setCreateApiToken(param);
  }

  const {
    data: cloudToken,
    isLoading: isLoadingCloudToken,
    error: errorCloudToken,
  } = useQuery({
    queryKey: [createApiToken.ledger, createApiToken.tenant],
    queryFn: async () => {
      const resultId = searchParams.get("result_id");
      if (!resultId) {
        throw new Error("No result_id");
      }
      const rToken = await cloud.api.getCloudSessionToken({
        resultId,
        selected: createApiToken,
      });
      if (rToken.isErr()) {
        throw rToken.Err();
      }

      return rToken.Ok().token;
    },
    enabled: couldSelected,
  });

  const [redirectCountdown, setRedirectCountdown] = useState({
    state: "waiting", // | "started" | "running",
    countdownSecs: parseInt(searchParams.get("countdownSecs") ?? "3"),
    interval: undefined as unknown | undefined,
  });

  // const back_url = BuildURI.from(buri.getParam("back_url"))
  //   .setParam("fpToken", cloudToken ?? "not-ready")
  //   .URI();
  // const redirectTo = buri.build().setParam("token", "ready").setParam("back_url", back_url.toString()).URI();

  // const [doNavigate, setDoNavigate] = useState(false);

  useEffect(() => {
    if (redirectCountdown.state === "stopped" && redirectCountdown.interval) {
      clearInterval(redirectCountdown.interval as unknown as number);
    }
    if (redirectCountdown.state === "started" && cloudToken) {
      const interval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev.countdownSecs <= 0) {
            clearInterval(interval);

            // setDoNavigate(true);
            return { ...prev, state: "finished" };
          }
          return { ...prev, countdownSecs: prev.countdownSecs - 1 };
        });
      }, 1000);
      setRedirectCountdown((prev) => ({ ...prev, interval }));
      return () => clearInterval(interval);
    }
  }, [redirectCountdown.state, cloudToken]);

  if (cloudToken && redirectCountdown.state === "waiting") {
    setRedirectCountdown({ ...redirectCountdown, state: "started" });
  }

  // if (cloudToken && !redirectCountdown.start) {
  //   setRedirectCountdown({ ...redirectCountdown, start: true});
  // }

  // console.log("ApiToken", buri.asObj());

  // const [showPossibleLedgers, setShowPossibleLedgers] = useState(false);
  // const [ledgerSelected, setLedgerSelected] = useState(false);
  // const [ledgers, setLedgers] = useState<[]>([]);
  const queryClient = useQueryClient();

  const { data: fromApiRows, isLoading: isLoadingLedgers, error: errorLedgers } = cloud.getListTenantsLedgersByUser();

  const tenantsData = fromApiRows?.map((row) => {
    return {
      tenant: {
        ...row.tenant,
        selected: !!row.ledgers.find(
          (l) => l.ledgerId === searchParams.get("ledger") || l.name === searchParams.get("local_ledger_name"),
        ),
      },
      ledgers: row.ledgers.map((l) => {
        return {
          ...l,
          selected: l.ledgerId === searchParams.get("ledger") || l.name === searchParams.get("local_ledger_name"),
        };
      }),
    };
  });

  useEffect(() => {
    if (initialParameters) {
      return;
    }
    if (!tenantsData) {
      return;
    }
    setInitialParameters(true);
    let justOneLedgerSelected = 0;
    let ledgerSelected: (LedgerUser & { selected: boolean }) | undefined = undefined;
    tenantsData.forEach((tenant) => {
      tenant.ledgers.forEach((ledger) => {
        if (ledger.selected) {
          justOneLedgerSelected++;
          ledgerSelected = ledger;
        }
      });
    });
    if (!ledgerSelected || justOneLedgerSelected !== 1) {
      return;
    }
    // typescript o my typescript
    const l = ledgerSelected as LedgerUser;
    const ledgerFromUrl = searchParams.get("ledger");
    if (!ledgerFromUrl && ledgerFromUrl !== l.ledgerId) {
      return;
    }

    selectLedger({
      ledger: l.ledgerId,
      tenant: l.tenantId,
      name: l.name,
    });
  }, [tenantsData, initialParameters]);
  const codeRef = useRef(null);

  const jsCode = `const { database } = useFireproof("${searchParams.get("local_ledger_name")}", {
    attach: toCloud({
      tenant: "${createApiToken.tenant}",
      ledger: "${createApiToken.ledger}",
    }),
  });`;

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, [jsCode]);

  // if (doNavigate) {
  //   navigate(redirectTo.withoutHostAndSchema);
  //   // setDoNavigate(false);
  //   return <>redirecting {redirectTo.withoutHostAndSchema}</>;
  // }

  const result_id = searchParams.get("result_id");
  if (!result_id || result_id.length < 5) {
    return <div>Invalid result_id</div>;
  }

  if (cloud._clerkSession?.isSignedIn === false) {
    const tos = buri
      .build()
      .pathname("/login")
      .cleanParams()
      .setParam("redirect_url", buri.withoutHostAndSchema)
      .URI().withoutHostAndSchema;
    console.log("tos", tos);
    return <Navigate to={tos} />;
    // return <div>Not logged in:{tos}</div>;
  }

  if (isLoadingLedgers) {
    return <div>Loading ledgers...</div>;
  }
  if (errorLedgers) {
    return <div>Error loading ledgers: {errorLedgers.message}</div>;
  }

  return (
    <>
      <div>
        <div>
          {searchParams.get("local_ledger_name") && (
            <div>
              <label>Your local database name is: </label>
              <b>{searchParams.get("local_ledger_name")}</b>
            </div>
          )}
          {searchParams.get("back_url") && (
            <div>
              <label>You are coming from: </label>
              <small>
                <a href={searchParams.get("back_url") ?? ""}>{searchParams.get("back_url")}</a>
              </small>
            </div>
          )}
          {searchParams.get("tenant") && (
            <div>
              <label>Your local tenant preset is: </label>
              <b>{searchParams.get("tenant")}</b>
            </div>
          )}
          {searchParams.get("ledger") && (
            <div>
              <label>Your local ledger preset is: </label>
              <b>{searchParams.get("ledger")}</b>
            </div>
          )}
        </div>
        <h2>Choose Tenants</h2>
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Ledger</th>
            </tr>
          </thead>
          <tbody>
            {tenantsData?.map((row) => (
              <tr key={row.tenant.tenantId}>
                <td>
                  <IfThenBold condition={row.tenant.selected} text={row.tenant.tenant.name ?? ""} />
                  <small>[${row.tenant.tenantId}]</small>
                </td>
                <td>
                  <table>
                    <tbody>
                      {row.ledgers.map((ledger) => (
                        <tr key={ledger.ledgerId}>
                          <td>
                            <IfThenBold condition={ledger.selected} text={ledger.name} />
                            <small>[{ledger.ledgerId}]</small>
                          </td>
                          <td>
                            {!couldSelected && (
                              <SelectLedger
                                ledger={ledger}
                                onSelect={() => {
                                  selectLedger({
                                    ledger: ledger.ledgerId,
                                    tenant: row.tenant.tenantId,
                                    name: ledger.name,
                                  });
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                      {!couldSelected && (
                        <AddIfNotSelectedLedger
                          tenant={row.tenant}
                          urlLedgerName={searchParams.get("local_ledger_name") ?? ""}
                          ledgers={row.ledgers}
                          onAdd={(a) => {
                            queryClient.invalidateQueries({ queryKey: ["listTenantsLedgersByUser"] });
                            selectLedger(a);
                          }}
                        />
                      )}
                    </tbody>
                  </table>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        {isLoadingCloudToken && <div>Loading token...</div>}
        {errorCloudToken && <div>Loading token failed with {errorCloudToken.message}</div>}
        {cloudToken && (
          <div>
            <h2>Code Preset</h2>
            <pre>
              <code ref={codeRef} className="language-js">
                {jsCode}
              </code>
            </pre>
            <h2>Token</h2>
            <b>
              <pre>{cloudToken}</pre>
            </b>
            {/* <h2>Back to Your App</h2>
            <b>
              <Link to={redirectTo.toString()} className="text-fp-p">
                {" "}
                {back_url.build().cleanParams("fpToken").toString()}
              </Link>
            </b> */}
            <div>
              <button
                onClick={() => {
                  setRedirectCountdown({ ...redirectCountdown, state: "stopped" });
                  // setCreateApiToken({} as Partial<TenantLedgerWithName>);
                  // setSearchParams((prev) => {
                  //   prev.delete("tenant");
                  //   prev.delete("ledger");
                  //   return prev;
                  // });
                }}
              >
                Stop
              </button>
            </div>
            <div>Redirecting in {redirectCountdown.countdownSecs} seconds...</div>
          </div>
        )}
      </div>
    </>
  );
}

function AddIfNotSelectedLedger({
  tenant,
  urlLedgerName,
  ledgers,
  onAdd,
}: {
  tenant: UserTenant;
  urlLedgerName: string;
  ledgers: (LedgerUser & { selected: boolean })[];
  onAdd: (ledger: TenantLedgerWithName) => void;
}) {
  const { cloud } = useContext(AppContext);
  const mutation = useMutation({
    mutationFn: async ({ tenant, ledgerName }: { tenant: UserTenant; ledgerName: string }) => {
      const res = await cloud.api.createLedger({
        ledger: {
          tenantId: tenant.tenantId,
          name: ledgerName,
        },
      });
      if (res.isErr()) {
        throw res.Err();
      }
      return res.Ok();
    },
  });

  const ledger = ledgers.find((l) => l.selected);
  if (ledger && urlLedgerName.length > 0) {
    // reset if ledger is selected
    urlLedgerName = "";
  }
  const [localLedgerName, setLocalLedgerName] = useState(urlLedgerName);

  if (mutation.isSuccess) {
    onAdd({
      name: mutation.data.ledger.name,
      ledger: mutation.data.ledger.ledgerId,
      tenant: mutation.data.ledger.tenantId,
    });
    return <></>;
  }
  console.log("mutation", mutation.isPending, ledger);

  // if (ledger && !urlLedgerName?.length) {
  //   return <></>;
  // }
  if (mutation.isError) {
    console.log("mutation.error", mutation.error);
    return <div>Error: {mutation.error.message}</div>;
  }
  if (mutation.isPending) {
    console.log("mutation.isPending", mutation.isPending);
    return <div>Adding ledger...</div>;
  }
  return (
    <tr>
      <td>
        <label>DB-Name</label>
        <input
          type="text"
          value={localLedgerName}
          onChange={(e) => {
            setLocalLedgerName(e.target.value);
          }}
        />
      </td>
      <td>
        <button
          onClick={() => {
            mutation.mutate({ tenant, ledgerName: localLedgerName });
          }}
        >
          <IfThenBold condition={!!localLedgerName.length} text="Add" />
        </button>
      </td>
    </tr>
  );
}

function SelectLedger({
  ledger,
  onSelect,
}: {
  ledger: LedgerUser & { selected: boolean };
  onSelect: (ledger: ps.cloud.TenantLedger) => void;
}) {
  return (
    <button
      onClick={() => {
        onSelect({
          ledger: ledger.ledgerId,
          tenant: ledger.tenantId,
        });
      }}
    >
      <IfThenBold condition={ledger.selected} text="Select" />
    </button>
  );
}

// console.log("is to nav", buri.hasParam("token"));
// if (buri.hasParam("token")) {
//   const url = BuildURI.from(window.location.href).pathname("/fp/cloud/api/token").cleanParams("token").URI().withoutHostAndSchema;
//   console.log("nav-redirectUrl", url);
//   return <Navigate to={url} />;
// }

// return (
//   <>
//     <div>
//       Waiting for Fireproof Backend token for: {buri.getParam("back_url")} - {window.location.href}
//     </div>
//   </>
// );

function IfThenBold({ condition, text }: { condition: boolean; text: string }) {
  if (condition) {
    return <b>{text}</b>;
  }
  return text;
}
