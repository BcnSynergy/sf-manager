// Must stay the first import: Zod reads jitless when a schema is built, and
// the schemas are built as soon as App's imports are evaluated (EN-94).
import './zod-config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
