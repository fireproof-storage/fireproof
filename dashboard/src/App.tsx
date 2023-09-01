import './App.css'

import { Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'

function App() {
  return (
    <>
      <Header />
      <div className="App flex min-h-screen">
        <div className="Sidebar w-1/4 dark:bg-gray-700 bg-slate-400 p-4">
          {/* Sidebar content */}
          <div>Sidebar</div>
        </div>
        <div className="MainContent flex-1 p-4">
          <Routes>
            <Route path="/about" element={<div>About</div>} />
            <Route path="/contact" element={<div>Contact</div>} />
            <Route path="/" element={<div>Home</div>} />
          </Routes>
        </div>
      </div>
    </>
  )
}

export default App
