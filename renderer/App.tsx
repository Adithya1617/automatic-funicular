import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { BikesPage } from './pages/BikesPage';
import { ServiceTemplatesPage } from './pages/ServiceTemplatesPage';
import { ServiceTemplateEditorPage } from './pages/ServiceTemplateEditorPage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceEventEditorPage } from './pages/ServiceEventEditorPage';
import { BuyPartsPage } from './pages/BuyPartsPage';
import { CsvImportPage } from './pages/CsvImportPage';
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
        <Route path="services/templates" element={<ServiceTemplatesPage />} />
        <Route path="services/templates/new" element={<ServiceTemplateEditorPage />} />
        <Route path="services/templates/:id/edit" element={<ServiceTemplateEditorPage />} />
        <Route path="buy-parts" element={<BuyPartsPage />} />
        <Route path="import" element={<CsvImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
