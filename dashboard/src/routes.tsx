import { createRoutesFromElements, Route } from "react-router-dom";

import ReactDOM from "react-dom/client";
import { createBrowserRouter, createMemoryRouter, RouterProvider } from "react-router-dom";
import DatabasesHistory from "./pages/databases/history.tsx";
import DatabasesIndex from "./pages/databases/index.tsx";
import DatabasesNew, { Action as newDatabaseAction } from "./pages/databases/new.tsx";
import DatabasesQuery from "./pages/databases/query.tsx";
import DatabasesShow from "./pages/databases/show.tsx";
import { Databases, databaseLoader } from "./pages/databases.tsx";
import DocsShow from "./pages/docs/show.tsx";
import { Index, indexLoader } from "./pages/index.tsx";

import DatabasesConnect, { loader as connectLoader } from "./pages/databases/connect.tsx";
import { Login, loginLoader } from "./pages/login.tsx";
import "./styles/tailwind.css";
import { ClerkProvider } from "@clerk/clerk-react";
import { Cloud, cloudLoader } from "./pages/cloud.tsx";
import { AppContextProvider } from "./app-context.tsx";
import { WithoutSidebar } from "./layouts/without-sidebar.tsx";
import { TenantShow } from "./pages/cloud/tenant-show.tsx";

const routes = createRoutesFromElements(
  <Route>
    <Route path="/" element={<WithoutSidebar />}>
      <Route index element={<Index />} loader={indexLoader} />
      <Route path="/login" element={<Login />} loader={loginLoader} />
    </Route>
    <Route path="/fp/cloud" element={<Cloud />} loader={cloudLoader}>
      <Route index element={<DatabasesIndex />} />
      <Route path=":tenantId" element={<TenantShow />} />
    </Route>
    <Route path="/fp/databases" element={<Databases />} loader={databaseLoader}>
      <Route index element={<DatabasesIndex />} />
      <Route path="new" element={<DatabasesNew />} action={newDatabaseAction} />
      <Route path="connect" element={<DatabasesConnect />} loader={connectLoader} />
      <Route path=":name" element={<DatabasesShow />} />
      <Route path=":name/history" element={<DatabasesHistory />} />
      <Route path=":name/query/:id?" element={<DatabasesQuery />} />
      <Route path=":name/docs/:id" element={<DocsShow />} />
    </Route>
  </Route>,
);

const router = import.meta.env.VITE_CHROME_EXTENSION ? createMemoryRouter(routes) : createBrowserRouter(routes);

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
        <RouterProvider router={router} />
      </ClerkProvider>
      ,
    </AppContextProvider>,
  );
} else {
  console.error("Root element not found");
}
