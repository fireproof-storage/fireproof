import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from "react-router-dom";
import App from './App'
import AppHeader from './components/AppHeader/index.jsx';
// import './index.css'
// import 'todomvc-common/base.css'
// import 'todomvc-app-css/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppHeader />
      <App />
    </BrowserRouter>
  </React.StrictMode >,
)
