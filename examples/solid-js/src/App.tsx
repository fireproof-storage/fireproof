import { ParentComponent, lazy } from "solid-js";
import { Router, Route } from "@solidjs/router";
import Navbar from "./Navbar";

const Home = lazy(() => import("./pages/Home"));
const TodoList = lazy(() => import("./pages/TodoList"));
const TodoListEditor = lazy(() => import("./pages/TodoListEditor"));

const AppLayout: ParentComponent = (props) => {
  return (
    <div id="app">
      <Navbar />
      <main class="app-main-content">{props.children}</main>
    </div>
  );
};

function App() {
  return (
    <Router root={AppLayout}>
      <Route path="/" component={Home} />
      <Route path="/todo" component={TodoList} />
      <Route path="/todoEdit" component={TodoListEditor} />
    </Router>
  );
}

export default App;
