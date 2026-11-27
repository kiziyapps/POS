import React, { useState } from 'react';
import { AuthProvider, useAuth } from './store/AuthContext.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { Navbar } from './components/Navbar.jsx';
import { ShiftModal } from './pages/ShiftPage.jsx';
import { PosPage } from './pages/PosPage.jsx';
import { InventoryPage } from './pages/InventoryPage.jsx';
import { TransactionsPage } from './pages/TransactionsPage.jsx';
import { CrmPromoPage } from './pages/CrmPromoPage.jsx';
import { ProcurementPage } from './pages/ProcurementPage.jsx';
import { AnalyticsPage } from './pages/AnalyticsPage.jsx';
import { AdminUsersPage } from './pages/AdminUsersPage.jsx';

function AppShell() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState('POS');
  const [shiftModalOpen, setShiftModalOpen] = useState(false);

  const handleOpenShift = () => setShiftModalOpen(true);
  const handleCloseShift = () => setShiftModalOpen(false);

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 lg:pb-6">
      <Navbar activeTab={activeTab} onChangeTab={setActiveTab} onOpenShiftModal={handleOpenShift} />
      {activeTab === 'POS' && <PosPage />}
      {activeTab === 'INVENTORY' && <InventoryPage />}
      {activeTab === 'TRANSACTIONS' && <TransactionsPage />}
      {activeTab === 'CRM' && <CrmPromoPage />}
      {activeTab === 'PROCUREMENT' && <ProcurementPage />}
      {activeTab === 'ANALYTICS' && <AnalyticsPage />}
      {activeTab === 'ADMIN' && <AdminUsersPage />}
      {shiftModalOpen && <ShiftModal onClose={handleCloseShift} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
