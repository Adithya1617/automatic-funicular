import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { NotInElectron } from './components/NotInElectron';
import { queryClient } from './lib/queryClient';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// `window.hyprride` is exposed by the Electron preload bridge. If it's missing
// the renderer is running in a plain browser pointed at the Vite dev URL —
// every IPC call would throw a cryptic "Cannot read properties of undefined
// (reading 'X')" the moment the user touches anything. Show a clear page
// instead so the operator opens the Electron window we already launched.
const inElectron = typeof window !== 'undefined' && Boolean(window.hyprride);

createRoot(rootEl).render(
  <StrictMode>
    {inElectron ? (
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    ) : (
      <NotInElectron />
    )}
  </StrictMode>,
);
