import { Outlet, RouterProvider, createBrowserRouter } from "react-router-dom";
import Todo from "./routes/Todo";
import Home from "./routes/Home";
import ErrorPage from "./ErrorPage";
import Navbar from "./Navbar";

function RootLayout() {
  return (
    <div id="app">
      <Navbar />
      <main className="app-main-content">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "todo",
        element: <Todo />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} fallbackElement={<p>Loading...</p>} />;
}

export default App;
