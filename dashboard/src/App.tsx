import './App.css'

import { Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'
import { Home } from './pages/Home'
import { Databases } from './pages/Databases'
import { Sidebar } from './components/Sidebar'
import { Database } from './pages/Database'
import { Changes } from './pages/Changes'
import { DocPage } from './pages/DocPage'

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="MainContent flex-1 p-4 ">{children}</div>
    </div>
  )
}

function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route
          path="/about"
          element={
            <Layout>
              <div>About</div>
            </Layout>
          }
        />
        <Route
          path="/databases"
          element={
            <Layout>
              <Databases />
            </Layout>
          }
        />
        <Route
          path="/db/:dbName"
          element={
            <Layout>
              <Database />
            </Layout>
          }
        />
        <Route
          path="/changes/:dbName"
          element={
            <Layout>
              <Changes />
            </Layout>
          }
        />
        <Route
          path="/doc/:dbName/:docId"
          element={
            <Layout>
              <DocPage />
            </Layout>
          }
        />
        <Route
          path="/doc/:dbName"
          element={
            <Layout>
              <DocPage />
            </Layout>
          }
        />
        <Route
          path="/"
          element={
            <Layout>
              <Home />
            </Layout>
          }
        />
      </Routes>
    </>
  )
}

export default App
