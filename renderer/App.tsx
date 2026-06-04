import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { BikesPage } from './pages/BikesPage';
import { ServicesPage } from './pages/ServicesPage';
import { RepairsPage } from './pages/RepairsPage';
import { WashPage } from './pages/WashPage';
import { ServiceEventEditorPage } from './pages/ServiceEventEditorPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="parts" element={<IngredientsPage />} />
        <Route path="bikes" element={<BikesPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="services/:id/edit" element={<ServiceEventEditorPage />} />
        <Route path="repairs" element={<RepairsPage />} />
        <Route path="wash" element={<WashPage />} />
        {/* Buy Parts now lives as a tab inside Parts; keep the old URL working. */}
        <Route path="buy-parts" element={<Navigate to="/parts?tab=buy" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
