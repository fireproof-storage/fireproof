import React, { useContext, useEffect, useState } from "react";
import { URI } from "@adviser/cement";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base64url } from "jose";
import { Navigate, useSearchParams } from "react-router-dom";
import { AppContext } from "../../../app-context.jsx";
import { TenantLedger } from "@fireproof/core-types-protocols-cloud";
import { ListTenantsLedgersByUser } from "../../../cloud-context.jsx";

interface TenantLedgerWithName {
  readonly tenant: string;
  readonly ledger: string;
  readonly name: string;
}

export function ApiTokenAuto() {
  const { cloud } = useContext(AppContext);
  const buri = URI.from(window.location.href);
  const [searchParams] = useSearchParams();

  const [ledgerInfo, setLedgerInfo] = useState<TenantLedgerWithName | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // Get parameters from URL
  const resultId = searchParams.get("result_id");
  const ledgerName = searchParams.get("local_ledger_name") || searchParams.get("ledger_name") || "default";
  const tenantId = searchParams.get("tenant");
  const ledgerId = searchParams.get("ledger");
  const backUrl = searchParams.get("back_url");
  const countdownSecs = parseInt(searchParams.get("countdownSecs") ?? "3");

  // Check if user is signed in
  if (cloud._clerkSession?.isSignedIn === false) {
    const tos = buri.build().pathname("/login").cleanParams().setParam("redirect_url", base64url.encode(buri.toString()));

    const fromApp = buri.getParam("fromApp");
    if (fromApp) {
      tos.setParam("fromApp", fromApp);
    }

    return <Navigate to={tos.withoutHostAndSchema} />;
  }

  if (!resultId || resultId.length < 5) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>Invalid Request</h2>
        <p>The authentication request is missing required information.</p>
        <p style={{ fontSize: "14px", color: "#666" }}>Please try again from your application.</p>
      </div>
    );
  }

  // Get user's tenants and ledgers
  const { data: tenantsData, error: tenantsError } = cloud.getListTenantsLedgersByUser();

  // Create ledger mutation
  const createLedgerMutation = useMutation({
    mutationFn: async ({ tenantId, name }: { tenantId: string; name: string }) => {
      const res = await cloud.api.createLedger({
        ledger: {
          tenantId,
          name,
        },
      });
      if (res.isErr()) {
        throw res.Err();
      }
      return res.Ok();
    },
  });

  // Process ledger data when tenants are loaded
  useEffect(() => {
    if (!tenantsData || tenantsData.length === 0 || ledgerInfo) {
      return;
    }

    // If we have both tenant and ledger IDs, use them directly
    if (tenantId && ledgerId) {
      setLedgerInfo({
        tenant: tenantId,
        ledger: ledgerId,
        name: ledgerName,
      });
      return;
    }

    // Look for existing ledger by name or ID
    let foundLedger: TenantLedgerWithName | null = null;

    for (const tenant of tenantsData) {
      for (const ledger of tenant.ledgers) {
        if (ledger.name === ledgerName || (ledgerId && ledger.ledgerId === ledgerId)) {
          foundLedger = {
            tenant: tenant.tenant.tenantId,
            ledger: ledger.ledgerId,
            name: ledger.name,
          };
          break;
        }
      }
      if (foundLedger) break;
    }

    if (foundLedger) {
      setLedgerInfo(foundLedger);
    } else {
      // Need to create a new ledger
      const targetTenant = tenantId
        ? tenantsData.find((t: ListTenantsLedgersByUser) => t.tenant.tenantId === tenantId)?.tenant
        : tenantsData[0]?.tenant;

      if (targetTenant && !createLedgerMutation.isPending && !createLedgerMutation.isSuccess) {
        createLedgerMutation.mutate({
          tenantId: targetTenant.tenantId,
          name: ledgerName,
        });
      }
    }
  }, [tenantsData, tenantId, ledgerId, ledgerName, ledgerInfo, createLedgerMutation]);

  // Handle successful ledger creation
  useEffect(() => {
    if (createLedgerMutation.isSuccess && createLedgerMutation.data) {
      const created = createLedgerMutation.data;
      setLedgerInfo({
        tenant: created.ledger.tenantId,
        ledger: created.ledger.ledgerId,
        name: created.ledger.name,
      });
    }
  }, [createLedgerMutation.isSuccess, createLedgerMutation.data]);

  // Get cloud session token
  const { data: cloudToken, error: errorToken } = useQuery({
    queryKey: ["cloudToken", ledgerInfo?.ledger, ledgerInfo?.tenant, resultId],
    queryFn: async () => {
      if (!ledgerInfo || !resultId) {
        throw new Error("No ledger selected or result_id missing");
      }

      const rToken = await cloud.api.getCloudSessionToken({
        resultId: resultId,
        selected: {
          tenant: ledgerInfo.tenant,
          ledger: ledgerInfo.ledger,
        } as TenantLedger,
      });

      if (rToken.isErr()) {
        throw rToken.Err();
      }

      return rToken.Ok().token;
    },
    enabled: !!ledgerInfo && !!resultId,
  });

  // Handle redirect countdown and auto-close
  useEffect(() => {
    if (cloudToken && backUrl) {
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Close the current window
            window.open("", "_self")?.close();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else if (cloudToken && !backUrl) {
      // If no back URL, try to close the window
      setTimeout(() => {
        window.open("", "_self")?.close();
      }, countdownSecs * 1000);
    }
  }, [cloudToken, backUrl, countdownSecs]);

  // Show errors
  const error = tenantsError || createLedgerMutation.error || errorToken;
  if (error) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p>Something went wrong. Please try again.</p>
        <details style={{ marginTop: "10px" }}>
          <summary style={{ cursor: "pointer" }}>Details</summary>
          <pre style={{ fontSize: "12px", marginTop: "10px" }}>{(error as Error).message}</pre>
        </details>
      </div>
    );
  }

  // Success state
  if (cloudToken) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p>All set! This window will close in {redirectCountdown}...</p>
      </div>
    );
  }

  // Loading state - single message for all loading states
  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <div
        style={{
          display: "inline-block",
          width: "20px",
          height: "20px",
          border: "2px solid #f3f3f3",
          borderTop: "2px solid #333",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      ></div>
      <p style={{ marginTop: "20px" }}>Setting things up...</p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
