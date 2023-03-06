import React from 'react'
import { useState } from 'react'
import { Index } from '@fireproof/core'
import { useFireproof, FireproofCtx } from './hooks/useFireproof'
import { makeQueryFunctions } from './makeQueryFunctions'
import './App.css'
import { Route, Outlet, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import AppHeader from './components/AppHeader/index.jsx'
import InputArea from './components/InputArea'

import { List } from './components/List'
import { AllLists } from './components/AllLists'
import { LayoutProps, ListLoaderData, ListDoc } from './interfaces'
import loadFixtures from './loadFixtures'
import { useUploader, UploaderCtx } from './hooks/useUploader'

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

const defineIndexes = (database) => {
  database.allLists = new Index(database, function (doc, map) {
    if (doc.type === 'list') map(doc.type, doc)
  })
  database.todosByList = new Index(database, function (doc, map) {
    if (doc.type === 'todo' && doc.listId) {
      map([doc.listId, doc.createdAt], doc)
    }
  })
  window.fireproof = database
  return database
}

/**
 * The root App component
 * @returns {JSX.Element}
 */
function App(): JSX.Element {
  const fp = useFireproof(defineIndexes, loadFixtures)
  const { fetchListWithTodos, fetchAllLists } = makeQueryFunctions(fp)
  const up = useUploader(fp.database) // is required to be in a KeyringProvider, see main.tsx
  const listLoader = async ({ params: { listId } }: LoaderFunctionArgs): Promise<ListLoaderData> =>
    await fetchListWithTodos(listId)
  const allListLoader = async ({ params }: LoaderFunctionArgs): Promise<ListDoc[]> => await fetchAllLists()
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
    <FireproofCtx.Provider value={fp}>
      <UploaderCtx.Provider value={up}>
        <RouterProvider
          router={createBrowserRouter(createRoutesFromElements(defineRouter()), { basename: pageBase })}
          fallbackElement={<LoadingView />}
        />
      </UploaderCtx.Provider>
    </FireproofCtx.Provider>
  )
}

export default App
