import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { TodoEditor } from "./pages/TodoEditor";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/edit/:todoId" element={<TodoEditor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
