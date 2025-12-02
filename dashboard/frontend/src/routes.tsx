/// <reference types="vite/client" />

import React from "react";
import ReactDOM from "react-dom/client";

import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppContextProvider } from "./app-context.jsx";
import { App } from "./components/App.jsx";
import "./styles/tailwind.css";

const rootElement = import.meta.env.VITE_CHROME_EXTENSION
  ? document.getElementById("fireproof-overlay")?.shadowRoot?.getElementById("root")
  : document.getElementById("root");

const queryClient = new QueryClient();

/*
    routerPush={(to) => navigate(to)}
    routerReplace={(to) => navigate(to, { replace: true })}
    signInFallbackRedirectUrl={nextUrl}
    */

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <AppContextProvider>
          <App />
        </AppContextProvider>
      </QueryClientProvider>
    </ClerkProvider>,
  );
} else {
  // eslint-disable-next-line no-console
  console.error("Root element not found");
}
