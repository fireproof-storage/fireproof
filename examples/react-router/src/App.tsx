import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Home } from './pages/Home';
import { TodoEditor } from './pages/TodoEditor';
function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/edit/:todoId" element={<TodoEditor />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
