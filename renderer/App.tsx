import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { BikesPage } from './pages/BikesPage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceEventEditorPage } from './pages/ServiceEventEditorPage';
import { BuyPartsPage } from './pages/BuyPartsPage';
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
        <Route path="buy-parts" element={<BuyPartsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
