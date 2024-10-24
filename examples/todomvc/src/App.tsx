import React from "react";
import "./App.css";
import { Route, Outlet, RouterProvider, createBrowserRouter, createRoutesFromElements } from "react-router-dom";
import type { LoaderFunctionArgs } from "react-router-dom";
import { LayoutProps, ListLoaderData, ListDoc } from "./interfaces";
import { KeyringProvider } from "@w3ui/react-keyring";

import { Index, Fireproof, FireproofCtx, useFireproof } from "use-fireproof";
import { useUploader, UploaderCtx } from "./hooks/useUploader";
import { makeQueryFunctions } from "./makeQueryFunctions";
import loadFixtures from "./loadFixtures";

import AppHeader from "./components/AppHeader/index.jsx";
import InputArea from "./components/InputArea";
import { List } from "./components/List";
import { AllLists } from "./components/AllLists";

/**
 * A React functional component that renders a list.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered list.
 */
const LoadingView = (): JSX.Element => {
  return (
    <Layout>
      <div>
        <div className="listNav">
          <button>Choose a list.</button>
          <label></label>
        </div>
        <section className="main">
          <ul className="todo-list">
            <li>
              <label>&nbsp;</label>
            </li>
            <li>
              <label>&nbsp;</label>
            </li>
            <li>
              <label>&nbsp;</label>
            </li>
          </ul>
        </section>
        <InputArea placeholder="Create a new list or choose one" />
      </div>
    </Layout>
  );
};

/**
 * A React functional component that wraps around <List/> and <AllLists/>.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered list.
 */
function Layout({ children }: LayoutProps): JSX.Element {
  return (
    <>
      <AppHeader />
      <div>
        <header className="header">{children ? <>{children}</> : <Outlet />}</header>
      </div>
    </>
  );
}

declare global {
  interface Window {
    fireproof: Fireproof;
  }
}
const defineIndexes = (ledger) => {
  ledger.allLists = new Index(
    ledger,
    function (doc, map) {
      if (doc.type === "list") map(doc.type, doc);
    },
    null,
    { name: "allLists" },
  );
  ledger.todosByList = new Index(
    ledger,
    function (doc, map) {
      if (doc.type === "todo" && doc.listId) {
        map([doc.listId, doc.createdAt], doc);
      }
    },
    null,
    { name: "todosByList" },
  );
  window.fireproof = ledger;
  return ledger;
};

/**
 * The root App component
 * @returns {JSX.Element}
 */
function App(): JSX.Element {
  console.log("render App");
  const fp = useFireproof("todomvc", defineIndexes, loadFixtures);
  const { fetchListWithTodos, fetchAllLists } = makeQueryFunctions(fp);
  // const up = useUploader(fp.ledger) // is required to be in a KeyringProvider
  const listLoader = async ({ params: { listId } }: LoaderFunctionArgs): Promise<ListLoaderData> =>
    await fetchListWithTodos(listId);
  const allListLoader = async ({ params }: LoaderFunctionArgs): Promise<ListDoc[]> => await fetchAllLists();
  function defineRouter(): React.ReactNode {
    return (
      <Route element={<Layout />}>
        <Route path="/" loader={allListLoader} element={<AllLists />} />
        <Route path="list">
          <Route path=":listId" loader={listLoader} element={<List />}>
            <Route path=":filter" element={<List />} />
          </Route>
        </Route>
      </Route>
    );
  }

  const pageBase = document.location.pathname.split("/list")[0] || "";
  return (
    <FireproofCtx.Provider value={fp}>
      <KeyringProvider>
        {/* <UploaderCtx.Provider value={up}> */}
        <RouterProvider
          router={createBrowserRouter(createRoutesFromElements(defineRouter()), { basename: pageBase })}
          fallbackElement={<LoadingView />}
        />
        {/* </UploaderCtx.Provider> */}
      </KeyringProvider>
    </FireproofCtx.Provider>
  );
}

export default App;
