import './App.css'

import { Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'
import { Home } from './pages/Home'
import { Databases } from './pages/Databases'
import { Sidebar } from './components/Sidebar'

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="MainContent flex-1 p-4 dark:bg-gray-700 bg-slate-200">
        {children}
      </div>
    </div>
  );
}

function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/about" element={
          <Layout>
            <div>About</div>
          </Layout>
        } />
        <Route path="/databases" element={
          <Layout>
            <Databases />
          </Layout>
        } />
        <Route path="/db/:dbName" element={
          <Layout>
            <div>Database</div>
          </Layout>
        } />
        <Route path="/" element={
          <Layout>
            <Home />
          </Layout>
        } />
      </Routes>
    </>
  );
}


export default App
