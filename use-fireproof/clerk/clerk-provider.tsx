import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { ClerkProvider as BaseClerkProvider, useClerk } from "@clerk/clerk-react";
import { clerkDashApi, type DashboardApiImpl } from "@fireproof/core-protocols-dashboard";
import type { ClerkCloudConfig, ClerkContextValue } from "./types.js";

interface ClerkFireproofContextValue extends ClerkContextValue {
  dashApi: DashboardApiImpl<unknown> | null;
}

const ClerkFireproofContext = createContext<ClerkFireproofContextValue | null>(null);

interface InnerProviderProps {
  config: ClerkCloudConfig;
  children: ReactNode;
}

function InnerClerkFireproofProvider({ config, children }: InnerProviderProps) {
  const clerk = useClerk();
  const isSessionReady = clerk.session?.status === "active";

  const dashApi = useMemo(() => {
    if (isSessionReady) {
      return clerkDashApi(clerk as any, { apiUrl: config.apiUrl });
    }
    return null;
  }, [isSessionReady, clerk, config.apiUrl]);

  const value = useMemo(
    () => ({
      config,
      isSessionReady,
      dashApi,
    }),
    [config, isSessionReady, dashApi]
  );

  return (
    <ClerkFireproofContext.Provider value={value}>
      {children}
    </ClerkFireproofContext.Provider>
  );
}

export interface ClerkFireproofProviderProps {
  /** Clerk publishable key */
  publishableKey: string;
  /** Cloud configuration */
  config: ClerkCloudConfig;
  children: ReactNode;
}

/**
 * Provider that wraps ClerkProvider and provides Fireproof cloud configuration.
 * Must wrap any components using useFireproofClerk.
 */
export function ClerkFireproofProvider({
  publishableKey,
  config,
  children,
}: ClerkFireproofProviderProps) {
  return (
    <BaseClerkProvider publishableKey={publishableKey}>
      <InnerClerkFireproofProvider config={config}>
        {children}
      </InnerClerkFireproofProvider>
    </BaseClerkProvider>
  );
}

/**
 * Hook to access Clerk Fireproof context.
 * Must be used within a ClerkFireproofProvider.
 */
export function useClerkFireproofContext(): ClerkFireproofContextValue {
  const context = useContext(ClerkFireproofContext);
  if (!context) {
    throw new Error(
      "useClerkFireproofContext must be used within a ClerkFireproofProvider"
    );
  }
  return context;
}
