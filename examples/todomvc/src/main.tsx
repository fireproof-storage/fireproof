import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// import './index.css'
import 'todomvc-common/base.css'
import 'todomvc-app-css/index.css'

import { KeyringProvider } from '@w3ui/react-keyring'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  // <React.StrictMode>
  <KeyringProvider>
    <App />
  </KeyringProvider>
  // </React.StrictMode>
)
