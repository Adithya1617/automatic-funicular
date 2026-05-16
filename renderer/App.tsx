import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { LiveOrdersPage } from './pages/LiveOrdersPage';
import { ManualOrderPage } from './pages/ManualOrderPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { BikesPage } from './pages/BikesPage';
import { ServiceTemplatesPage } from './pages/ServiceTemplatesPage';
import { ServiceTemplateEditorPage } from './pages/ServiceTemplateEditorPage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceEventEditorPage } from './pages/ServiceEventEditorPage';
import { MenuPage } from './pages/MenuPage';
import { MenuEditorPage } from './pages/MenuEditorPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { InvoiceEditorPage } from './pages/InvoiceEditorPage';
import { StockTakePage } from './pages/StockTakePage';
import { CsvImportPage } from './pages/CsvImportPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="orders/live" element={<LiveOrdersPage />} />
        <Route path="orders/new" element={<ManualOrderPage />} />
        <Route path="parts" element={<IngredientsPage />} />
        <Route path="bikes" element={<BikesPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="services/:id/edit" element={<ServiceEventEditorPage />} />
        <Route path="services/templates" element={<ServiceTemplatesPage />} />
        <Route path="services/templates/new" element={<ServiceTemplateEditorPage />} />
        <Route path="services/templates/:id/edit" element={<ServiceTemplateEditorPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="menu/new" element={<MenuEditorPage />} />
        <Route path="menu/:id/edit" element={<MenuEditorPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/new" element={<InvoiceEditorPage />} />
        <Route path="invoices/:id/edit" element={<InvoiceEditorPage />} />
        <Route path="stock-take" element={<StockTakePage />} />
        <Route path="import" element={<CsvImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
