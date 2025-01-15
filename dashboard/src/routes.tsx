import * as React from "react";
import { createRoutesFromElements, Route } from "react-router-dom";

import ReactDOM from "react-dom/client";
import { createBrowserRouter, createMemoryRouter, RouterProvider } from "react-router-dom";
import App, { loader as appLoader } from "./layouts/app";
import DatabasesHistory from "./pages/databases/history";
import DatabasesIndex from "./pages/databases/index";
import DatabasesNew, { Action as newDatabaseAction } from "./pages/databases/new";
import DatabasesQuery from "./pages/databases/query";
import DatabasesShow from "./pages/databases/show";
import DocsShow from "./pages/docs/show";
import Index, { loader as indexLoader } from "./pages/index";

import DatabasesConnect, { loader as connectLoader } from "./pages/databases/connect";
import Login, { loader as loginLoader } from "./pages/login";
import "./styles/tailwind.css";

const routes = createRoutesFromElements(
  <Route>
    <Route path="/" element={<Index />} loader={indexLoader} />
    <Route path="/login" element={<Login />} loader={loginLoader} />
    <Route path="/fp/databases" element={<App />} loader={appLoader}>
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

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />);
} else {
  console.error("Root element not found");
}
