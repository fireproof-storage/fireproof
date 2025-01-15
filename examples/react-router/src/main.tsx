import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { DATABASE_CONFIG } from './config/database';

if (false) {
  console.log('Something is broken, resetting');
  indexedDB.deleteDatabase('fp-keybag');
  indexedDB.deleteDatabase('fp.' + DATABASE_CONFIG.name);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
