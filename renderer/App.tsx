import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { LiveOrdersPage } from './pages/LiveOrdersPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { MenuPage } from './pages/MenuPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { StockTakePage } from './pages/StockTakePage';
import { CsvImportPage } from './pages/CsvImportPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="orders/live" element={<LiveOrdersPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="stock-take" element={<StockTakePage />} />
        <Route path="import" element={<CsvImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
