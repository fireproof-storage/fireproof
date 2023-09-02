import './App.css'

import { Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'
import { Home } from './pages/Home'
import { Databases } from './pages/Databases'
import { Sidebar } from './components/Sidebar'
import { Database } from './pages/Database'
import { Changes } from './pages/Changes'
import { DocPage } from './pages/DocPage'
import { Import } from './pages/Import'
import React from 'react'
import { AllDocs } from './pages/AllDocs'

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="MainContent flex-1 p-4 ">{children}</div>
    </div>
  )
}

function App() {
  const routes = [
    { path: '/import', component: Import },
    { path: '/databases', component: Databases },
    { path: '/db/:dbName', component: Database },
    { path: '/all/:dbName', component: AllDocs },
    { path: '/changes/:dbName', component: Changes },
    { path: '/doc/:dbName/:docId', component: DocPage },
    { path: '/doc/:dbName', component: DocPage },
    { path: '/', component: Home }
  ]

  return (
    <>
      <Header />
      <Routes>
        {routes.map(({ path, component }, index) => (
          <Route
            key={index}
            path={path}
            element={<Layout>{React.createElement(component)}</Layout>}
          />
        ))}
      </Routes>
    </>
  )
}

export default App
