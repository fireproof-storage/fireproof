import './App.css'

import { Route, Routes } from 'react-router-dom'

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/about">
          {/* Your About component */}
          {'About'}
        </Route>
        <Route path="/contact">
          {/* Your Contact component */}
          {'Contact'}
        </Route>
        <Route path="/">
          {/* Your Home component */}
          {'Home'}
        </Route>
      </Routes>
    </div>
  )
}

export default App
