import React from 'react'
import { useState } from 'react'
import useFireproof from './hooks/useFireproof'
import { FireproofCtx } from './hooks/useFireproof'
import { useKeyring } from '@w3ui/react-keyring'
import './App.css'
import { Route, Outlet, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import AppHeader from './components/AppHeader/index.jsx'
import InputArea from './components/InputArea'
import { W3APIProvider } from './components/W3API'
import { Authenticator, AuthenticationForm, AuthenticationSubmitted } from './components/Authenticator'
import { List } from './List'
import { AllLists } from './AllLists'
import { LayoutProps, ListLoaderData, ListDoc } from './interfaces'

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
          <button>Loading...</button>
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
  )
}

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
  )
}

/**
 * The root App component
 * @returns {JSX.Element}
 */
function App(): JSX.Element {
  const fireproof = useFireproof()
  const { fetchListWithTodos, fetchAllLists } = fireproof

  async function listLoader({ params: { listId } }: LoaderFunctionArgs): Promise<ListLoaderData> {
    return await fetchListWithTodos(listId)
  }

  async function allListLoader({ params }: LoaderFunctionArgs): Promise<ListDoc[]> {
    return await fetchAllLists()
  }

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
    )
  }

  const pageBase = document.location.pathname.split('/list')[0] || ''
  return (
    <FireproofCtx.Provider value={fireproof}>
      <W3APIProvider uploadsListPageSize={20}>
        {/* <Authenticator className='h-full'> */}
        <RouterProvider
          router={createBrowserRouter(createRoutesFromElements(defineRouter()), { basename: pageBase })}
          fallbackElement={<LoadingView />}
        />
        {/* </Authenticator> */}
      </W3APIProvider>
    </FireproofCtx.Provider>
  )
}

export default App
