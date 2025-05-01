import { BuildURI, URI } from "@adviser/cement";
import { AppContext } from "../../../app-context.tsx";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useContext, useEffect, useState } from "react";
import { set } from "react-hook-form";
import { build } from "vite";
import { Ledger, ps } from "@fireproof/core";
import { LedgerUser } from "../../../../backend/ledgers.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserTenant } from "../../../../backend/api.ts";
import { is } from "drizzle-orm";

export function redirectBackUrl() {
  const uri = URI.from(window.location.href);
  if (uri.hasParam("token")) {
    const backUrl = URI.from(uri.getParam("back_url", ""));
    if (backUrl.protocol.startsWith("http")) {
      console.log("api-RedirectBackUrl", backUrl, window.location.href);
      window.location.href = backUrl.toString();
    }
  }
}

// function CreateApiToken({ buri }: { buri: URI }) {
//   const { cloud } = useContext(AppContext);
//   const cloudToken = cloud.getCloudToken();
//   const navigate = useNavigate();
//   useEffect(() => {
//     if (cloud._clerkSession?.isSignedIn === true && !buri.hasParam("token")) {
//       if (cloudToken.data) {
//         const back_url = BuildURI.from(buri.getParam("back_url")).setParam("fpToken", cloudToken.data.token).URI();
//         const redirectTo = buri
//           .build()
//           .setParam("token", "ready")
//           .setParam("back_url", back_url.toString())
//           .URI().withoutHostAndSchema;
//         console.log("set-redirectTo", back_url, redirectTo);
//         // window.location.assign(back_url);
//         // window.location.replace(redirectTo);
//         // setRedirectTo(back_url.toString());
//         navigate(redirectTo.toString(), { replace: true });
//       } else {
//         // Show the possible ledgers
//         // setShowPossibleLedgers(true);
//       }
//     }
//   }, [cloudToken.data, cloud._clerkSession?.isSignedIn]);
// }

interface TenantLedgerWithName extends ps.cloud.TenantLedger {
  readonly name: string;
}

export function ApiToken() {
  const { cloud } = useContext(AppContext);

  const buri = URI.from(window.location.href);

  const [localLedgerName, setLocalLedgerName] = useState(buri.getParam("local_ledger_name", ""));

  const navigate = useNavigate();

  const [createApiToken, setCreateApiToken] = useState<Partial<ps.cloud.TenantLedger>>({});

  const isSelected = !!createApiToken.ledger && !!createApiToken.tenant;

  const {
    data: cloudToken,
    isLoading: isLoadingCloudToken,
    error: errorCloudToken,
  } = useQuery({
    queryKey: [createApiToken.ledger, createApiToken.tenant],
    queryFn: async () => {
      const rToken = await cloud.api.getCloudSessionToken({
        selected: createApiToken,
      });
      if (rToken.isErr()) {
        throw rToken.Err();
      }
      return rToken.Ok().token;
    },
    enabled: isSelected,
  });

  const [redirectCountdown, setRedirectCountdown] = useState({
    state: "waiting", // | "started" | "running",
    countdownSecs: parseInt(buri.getParam("countdownSecs", "3")),
  });

  const back_url = BuildURI.from(buri.getParam("back_url"))
    .setParam("fpToken", cloudToken ?? "not-ready")
    .URI();
  const redirectTo = buri.build().setParam("token", "ready").setParam("back_url", back_url.toString()).URI();

  const [doNavigate, setDoNavigate] = useState(false);

  useEffect(() => {
    if (redirectCountdown.state === "started" && cloudToken) {
      const interval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev.countdownSecs <= 0) {
            clearInterval(interval);
            setDoNavigate(true);
            return { ...prev, state: "finished" };
          }
          return { ...prev, countdownSecs: prev.countdownSecs - 1 };
        });
      }, 1000);
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

  const { data: tenantsData, isLoading: isLoadingLedgers, error: errorLedgers } = cloud.getListTenantsLedgersByUser();

  if (doNavigate) {
    navigate(redirectTo.withoutHostAndSchema);
    // setDoNavigate(false);
    return <>redirecting {redirectTo.withoutHostAndSchema}</>;
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
  console.log("ledgersData", buri.asObj());

  // if (localLedgerNameFromUrl.length > 0 && localLedgerName !== localLedgerNameFromUrl) {
  //   const newBuri = buri.build().setParam("local_ledger_name", localLedgerName).URI().toString();
  //   console.log("localLedgerNameFromUrl", newBuri);
  //   return <Navigate to={buri.build().setParam("local_ledger_name", localLedgerName).URI().toString()} replace={true} />;
  // }

  // // window.location.assign(back_url);
  // // window.location.replace(redirectTo);
  // // setRedirectTo(back_url.toString());
  // navigate(redirectTo.toString(), { replace: true });

  return (
    <>
      <div>
        {buri.hasParam("local_ledger_name") && (
          <div>
            Your local database name is: <b>{localLedgerName}</b>
          </div>
        )}
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
                  {row.tenant.tenant.name}[{row.tenant.tenantId}]
                </td>
                <td>
                  <table>
                    <tbody>
                      {row.ledgers.map((ledger) => (
                        <tr key={ledger.ledgerId}>
                          <td>
                            <IfThenBold condition={ledger.name === localLedgerName} text={ledger.name} />[{ledger.ledgerId}]
                          </td>
                          <td>
                            {!isSelected && (
                              <SelectLedger ledger={ledger} localLedgerName={localLedgerName} onSelect={setCreateApiToken} />
                            )}
                          </td>
                        </tr>
                      ))}
                      {!isSelected && (
                        <AddIfNotSelectedLedger
                          tenant={row.tenant}
                          ledgers={row.ledgers}
                          localLedgerName={localLedgerName}
                          onAdd={(a) => {
                            queryClient.invalidateQueries({ queryKey: ["listTenantsLedgersByUser"] });
                            setLocalLedgerName(a.name);
                            setCreateApiToken(a);
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
            <b>
              <pre>
                {`
            const { database } = useFireproof("${localLedgerName}", {
              attach: toCloud({
                tenant: "${createApiToken.tenant}",
                ledger: "${createApiToken.ledger}",
              }),
            });
            `}
              </pre>
            </b>
            <h2>Token</h2>
            <b>
              <pre>{cloudToken}</pre>
            </b>
            <h2>Back to Your App</h2>
            <b>
              <Link to={redirectTo.toString()} className="text-fp-p">
                {" "}
                {back_url.build().cleanParams("fpToken").toString()}
              </Link>
            </b>
            <div>Redirecting in {redirectCountdown.countdownSecs} seconds...</div>
          </div>
        )}
      </div>
    </>
  );

  function AddIfNotSelectedLedger({
    tenant,
    ledgers,
    localLedgerName: lDef,
    onAdd,
  }: {
    tenant: UserTenant;
    ledgers: LedgerUser[];
    localLedgerName: string;
    onAdd: (ledger: TenantLedgerWithName) => void;
  }) {
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

    const [localLedgerName, setLocalLedgerName] = useState(lDef);
    const ledger = ledgers.find((l) => l.name === localLedgerName);

    if (mutation.isSuccess) {
      onAdd({
        name: mutation.data.ledger.name,
        ledger: mutation.data.ledger.ledgerId,
        tenant: mutation.data.ledger.tenantId,
      });
      return <></>;
    }
    console.log("mutation", mutation.isPending, ledger, localLedgerName);

    if (ledger || localLedgerName?.length === 0) {
      return <></>;
    }
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
            <IfThenBold condition={true} text="Add" />
          </button>
        </td>
      </tr>
    );
  }

  function SelectLedger({
    ledger,
    localLedgerName,
    onSelect,
  }: {
    ledger: LedgerUser;
    localLedgerName: string;
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
        <IfThenBold condition={ledger.name === localLedgerName} text="Select" />
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
}

function IfThenBold({ condition, text }: { condition: boolean; text: string }) {
  if (condition) {
    return <b>{text}</b>;
  }
  return text;
}
