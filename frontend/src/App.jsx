// Todas as rotas do front. Rotas com <RequireRole> exigem login (e o papel indicado).
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { RequireRole } from './components/RequireRole';
import { ShowcasePage } from './pages/ShowcasePage';
import { LotRoomPage } from './pages/LotRoomPage';
import { AuditPage } from './pages/AuditPage';
import { ReceiptPage } from './pages/ReceiptPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { WalletPage } from './pages/WalletPage';
import { MyWinsPage } from './pages/MyWinsPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewLotPage } from './pages/NewLotPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Públicas */}
        <Route index element={<ShowcasePage />} />
        <Route path="lotes/:id" element={<LotRoomPage />} />
        <Route path="auditoria/:id" element={<AuditPage />} />
        <Route path="comprovante/:code" element={<ReceiptPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="cadastro" element={<RegisterPage />} />

        {/* Licitante */}
        <Route path="carteira" element={<RequireRole role="BIDDER"><WalletPage /></RequireRole>} />
        <Route path="meus-arremates" element={<RequireRole role="BIDDER"><MyWinsPage /></RequireRole>} />

        {/* Leiloeiro */}
        <Route path="painel" element={<RequireRole role="AUCTIONEER"><DashboardPage /></RequireRole>} />
        <Route path="painel/novo-lote" element={<RequireRole role="AUCTIONEER"><NewLotPage /></RequireRole>} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
