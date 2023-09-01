import './App.css'

import { Route, Routes } from 'react-router-dom'

function App() {
  return (
    <div className="App bg-blue-500 text-white">
      <Routes>
      <Route path="/about" element={<div>About</div>} />
        <Route path="/contact" element={<div>Contact</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </div>
  )
}

export default App
