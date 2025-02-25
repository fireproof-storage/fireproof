import { useContext } from "react";
import {
  Navigate,
  Route,
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
  createRoutesFromElements,
} from "react-router-dom";
import { AppContext } from "../app-context.tsx";
import { WithoutSidebar } from "../layouts/without-sidebar.tsx";
import { Cloud, cloudLoader } from "../pages/cloud.tsx";
import CloudIndex from "../pages/cloud/index.tsx";
import { CloudTenantAdmin } from "../pages/cloud/tenants/admin.tsx";
import { CloudTenantDelete } from "../pages/cloud/tenants/delete.tsx";
import { CloudTenantLedgers, CloudTenantLedgersIndex } from "../pages/cloud/tenants/ledgers.tsx";
import { LedgerDocuments } from "../pages/cloud/tenants/ledgers/documents.tsx";
import { NewLedgerDocument } from "../pages/cloud/tenants/ledgers/documents/new.tsx";
import { ShowLedgerDocument } from "../pages/cloud/tenants/ledgers/documents/show.tsx";
import { CloudTenantLedgersNew } from "../pages/cloud/tenants/ledgers/new.tsx";
import { LedgerSharing } from "../pages/cloud/tenants/ledgers/sharing.tsx";
import { CloudTenantLedgersShow } from "../pages/cloud/tenants/ledgers/show.tsx";
import { CloudTenantMembers } from "../pages/cloud/tenants/members.tsx";
import { CloudNew, newCloudAction } from "../pages/cloud/tenants/new.tsx";
import { CloudTenantOverview } from "../pages/cloud/tenants/overview.tsx";
import { CloudTenantShow } from "../pages/cloud/tenants/show.tsx";
import { Databases, databaseLoader } from "../pages/databases.tsx";
import { DatabasesConnect, connectDatabasesLoader } from "../pages/databases/connect.tsx";
import { DatabasesHistory } from "../pages/databases/history.tsx";
import { DatabasesIndex } from "../pages/databases/index.tsx";
import { DatabasesNew, newDatabaseAction } from "../pages/databases/new.tsx";
import { DatabasesQuery } from "../pages/databases/query.tsx";
import { DatabasesShow } from "../pages/databases/show.tsx";
import { DocsShow } from "../pages/docs/show.tsx";
import { Index, indexLoader } from "../pages/index.tsx";
import { Login, loginLoader } from "../pages/login.tsx";

export function App() {
  const ctx = useContext(AppContext);
  const routes = createRoutesFromElements(
    <Route>
      <Route path="/login" element={<Login />} loader={loginLoader} />
      <Route path="/" element={<WithoutSidebar />}>
        <Route index element={<Index />} loader={indexLoader} />
      </Route>
      <Route path="/fp/cloud" element={<Cloud />} loader={cloudLoader}>
        <Route index element={<CloudIndex />} />
        <Route path="tenants">
          <Route path="new" element={<CloudNew />} action={newCloudAction(ctx)} />
          <Route path=":tenantId">
            <Route element={<CloudTenantShow />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<CloudTenantOverview />} />
              <Route path="members" element={<CloudTenantMembers />} />
              <Route path="admin" element={<CloudTenantAdmin />} />
            </Route>
            <Route path="delete" element={<CloudTenantDelete />} />
            <Route path="ledgers" element={<CloudTenantLedgers />}>
              <Route index element={<CloudTenantLedgersIndex />} />
              <Route path="new" element={<CloudTenantLedgersNew />} />
              <Route path=":ledgerId" element={<CloudTenantLedgersShow />}>
                <Route index element={<Navigate to="documents" replace />} />
                <Route path="documents">
                  <Route index element={<LedgerDocuments />} />
                  <Route path="new" element={<NewLedgerDocument />} />
                  <Route path=":documentId" element={<ShowLedgerDocument />} />
                </Route>
                <Route path="sharing" element={<LedgerSharing />} />
              </Route>
            </Route>
          </Route>
        </Route>
        {/* <Route path="better" element={<Better />} /> */}
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
