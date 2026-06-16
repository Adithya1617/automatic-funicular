import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthContext';
import { AuthGate } from './features/auth/AuthGate';
import { installWebBridge } from './lib/webBridge';
import { queryClient } from './lib/queryClient';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// In a plain browser the Electron preload bridge (`window.hyprride`) is absent;
// install a fetch-based one that talks to the Hono API. Under Electron the
// preload already provides the bridge, so this is a no-op.
installWebBridge();

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
