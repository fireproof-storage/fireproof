import { createRoutesFromElements, Route, createMemoryRouter, createBrowserRouter, RouterProvider } from "react-router-dom";
import { WithoutSidebar } from "../layouts/without-sidebar.tsx";
import { Cloud, cloudLoader } from "../pages/cloud.tsx";
import CloudIndex from "../pages/cloud/index.tsx";
import { CloudNew, newCloudAction } from "../pages/cloud/new.tsx";
import { CloudTenantShow } from "../pages/cloud/tenant/show.tsx";
import { Databases, databaseLoader } from "../pages/databases.tsx";
import { connectDatabasesLoader, DatabasesConnect } from "../pages/databases/connect.tsx";
import { DatabasesNew, newDatabaseAction } from "../pages/databases/new.tsx";
import { Index, indexLoader } from "../pages/index.tsx";
import { Login, loginLoader } from "../pages/login.tsx";
import { DatabasesShow } from "../pages/databases/show.tsx";
import { DatabasesIndex } from "../pages/databases/index.tsx";
import { DatabasesHistory } from "../pages/databases/history.tsx";
import { DatabasesQuery } from "../pages/databases/query.tsx";
import { DocsShow } from "../pages/docs/show.tsx";
import { CloudTenantDelete } from "../pages/cloud/tenant/delete.tsx";
import { useContext } from "react";
import { AppContext } from "../app-context.tsx";

export function App() {
  const ctx = useContext(AppContext);
  const routes = createRoutesFromElements(
    <Route>
      <Route path="/" element={<WithoutSidebar />}>
        <Route index element={<Index />} loader={indexLoader} />
        <Route path="/login" element={<Login />} loader={loginLoader} />
      </Route>
      <Route path="/fp/cloud" element={<Cloud />} loader={cloudLoader(ctx)}>
        <Route index element={<CloudIndex />} />
        <Route path=":tenantId/delete" element={<CloudTenantDelete />} />
        <Route path=":tenantId" element={<CloudTenantShow />} />
        <Route path="new" element={<CloudNew />} action={newCloudAction(ctx)} />
      </Route>
      <Route path="/fp/databases" element={<Databases />} loader={databaseLoader}>
        <Route index element={<DatabasesIndex />} />
        <Route path="new" element={<DatabasesNew />} action={newDatabaseAction} />
        <Route path="connect" element={<DatabasesConnect />} loader={connectDatabasesLoader} />
        <Route path=":name" element={<DatabasesShow />} />
        <Route path=":name/history" element={<DatabasesHistory />} />
        <Route path=":name/query/:id?" element={<DatabasesQuery />} />
        <Route path=":name/docs/:id" element={<DocsShow />} />
      </Route>
    </Route>,
  );

  const router = import.meta.env.VITE_CHROME_EXTENSION ? createMemoryRouter(routes) : createBrowserRouter(routes);
  return <RouterProvider router={router} />;
}
