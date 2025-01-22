import ReactDOM from "react-dom/client";

import "./styles/tailwind.css";
import { ClerkProvider } from "@clerk/clerk-react";
import { AppContextProvider } from "./app-context.tsx";
import { App } from "./components/App.tsx";

const rootElement = import.meta.env.VITE_CHROME_EXTENSION
  ? document.getElementById("fireproof-overlay")?.shadowRoot?.getElementById("root")
  : document.getElementById("root");

/*
    routerPush={(to) => navigate(to)}
    routerReplace={(to) => navigate(to, { replace: true })}
    signInFallbackRedirectUrl={nextUrl}
    */
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <AppContextProvider>
      <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </AppContextProvider>,
  );
} else {
  console.error("Root element not found");
}
