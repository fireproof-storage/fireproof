import React, { useContext } from "react";
import {
  Navigate,
  Route,
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
  createRoutesFromElements,
} from "react-router-dom";
import { AppContext } from "../app-context.jsx";
import { WithoutSidebar } from "../layouts/without-sidebar.jsx";
import { Cloud } from "../pages/cloud.jsx";
import CloudIndex from "../pages/cloud/index.jsx";
import { CloudTenantAdmin } from "../pages/cloud/tenants/admin.jsx";
import { CloudTenantDelete } from "../pages/cloud/tenants/delete.jsx";
import { CloudTenantLedgers, CloudTenantLedgersIndex } from "../pages/cloud/tenants/ledgers.jsx";
import { LedgerDocuments } from "../pages/cloud/tenants/ledgers/documents.jsx";
import { NewLedgerDocument } from "../pages/cloud/tenants/ledgers/documents/new.jsx";
import { ShowLedgerDocument } from "../pages/cloud/tenants/ledgers/documents/show.jsx";
import { CloudTenantLedgersNew } from "../pages/cloud/tenants/ledgers/new.jsx";
import { LedgerSharing } from "../pages/cloud/tenants/ledgers/sharing.jsx";
import { CloudTenantLedgersShow } from "../pages/cloud/tenants/ledgers/show.jsx";
import { CloudTenantMembers } from "../pages/cloud/tenants/members.jsx";
import { CloudNew, newCloudAction } from "../pages/cloud/tenants/new.jsx";
// import { CloudTenantOverview } from "../pages/cloud/tenants/overview.jsx";
import { ApiTokenAuto } from "../pages/cloud/api/token-auto.jsx";
import { ApiToken, redirectBackUrl } from "../pages/cloud/api/token.jsx";
import { LedgerAdmin } from "../pages/cloud/tenants/ledgers/admin.jsx";
import { LedgerDelete } from "../pages/cloud/tenants/ledgers/delete.jsx";
import { LedgerOverview } from "../pages/cloud/tenants/ledgers/overview.jsx";
import { CloudTenantShow } from "../pages/cloud/tenants/show.jsx";
import { Databases, databaseLoader } from "../pages/databases.jsx";
import { DatabasesConnect, connectDatabasesLoader } from "../pages/databases/connect.jsx";
import { DatabasesHistory } from "../pages/databases/history.jsx";
import { DatabasesIndex } from "../pages/databases/index.jsx";
import { DatabasesNew, newDatabaseAction } from "../pages/databases/new.jsx";
import { DatabasesQuery } from "../pages/databases/query.jsx";
import { DatabasesShow } from "../pages/databases/show.jsx";
import { DocsShow } from "../pages/docs/show.jsx";
import { Index, indexLoader } from "../pages/index.jsx";
import { Login, loginLoader } from "../pages/login.jsx";
import { SignUpPage, signupLoader } from "../pages/signup.jsx";

export function App() {
  const ctx = useContext(AppContext);
  // console.log(">>>>>>>>>>>>>>", window.location.href);
  const routes = createRoutesFromElements(
    <Route>
      <Route path="/login" element={<Login />} loader={loginLoader} />
      <Route path="/signup" element={<SignUpPage />} loader={signupLoader} />
      <Route path="/" element={<WithoutSidebar />}>
        <Route index element={<Index />} loader={indexLoader} />
      </Route>
      {/* <Route path="/fp/cloud" element={<Cloud />} loader={cloudLoader}> */}

      <Route path="/token" element={<ApiToken />} loader={redirectBackUrl} />
      <Route path="/token-auto" element={<ApiTokenAuto />} />

      <Route path="/fp/cloud" element={<Cloud />}>
        <Route index element={<CloudIndex />} />
        <Route path="api/token" element={<ApiToken />} loader={redirectBackUrl} />
        <Route path="api/token-auto" element={<ApiTokenAuto />} />

        <Route path="tenants">
          <Route path="new" element={<CloudNew />} action={newCloudAction(ctx)} />
          <Route path=":tenantId">
            <Route element={<CloudTenantShow />}>
              <Route index element={<Navigate to="members" replace />} />
              {/* <Route path="overview" element={<CloudTenantOverview />} /> */}
              <Route path="members" element={<CloudTenantMembers />} />
              <Route path="admin" element={<CloudTenantAdmin />} />
            </Route>
            <Route path="delete" element={<CloudTenantDelete />} />
            <Route path="ledgers" element={<CloudTenantLedgers />}>
              <Route index element={<CloudTenantLedgersIndex />} />
              <Route path="new" element={<CloudTenantLedgersNew />} />
              <Route path=":ledgerId" element={<CloudTenantLedgersShow />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<LedgerOverview />} />
                <Route path="documents">
                  <Route index element={<LedgerDocuments />} />
                  <Route path="documents" element={<LedgerDocuments />} />
                  <Route path="new" element={<NewLedgerDocument />} />
                  <Route path=":documentId" element={<ShowLedgerDocument />} />
                </Route>
                <Route path="delete" element={<LedgerDelete />} />
                <Route path="sharing" element={<LedgerSharing />} />
                <Route path="admin" element={<LedgerAdmin />} />
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
