import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Viagens } from './pages/Viagens';
import { Caminhoes } from './pages/Caminhoes';
import { CaminhaoDetalhe } from './pages/CaminhaoDetalhe';
import { Relatorios } from './pages/Relatorios';
import { Pagamentos } from './pages/Pagamentos';
import { Proprietarios } from './pages/Proprietarios';
import { Config } from './pages/Config';
import { Financeiro } from './pages/Financeiro';
import { FinanceiroRegras } from './pages/FinanceiroRegras';
import { TrackingPage } from './pages/TrackingPage';
import { DadosCapturados } from './pages/DadosCapturados';
import { Fiscal } from './pages/Fiscal';
import { DashboardFinanceiro } from './pages/DashboardFinanceiro';
import { NfEntrada } from './pages/NfEntrada';
import { NfServico } from './pages/NfServico';
import { ContasPagar } from './pages/ContasPagar';
import { ContasPagarConciliar } from './pages/ContasPagarConciliar';
import { Cadastros } from './pages/Cadastros';
import { Admin } from './pages/Admin';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/viagens" element={<Viagens />} />
                    <Route path="/caminhoes" element={<Caminhoes />} />
                    <Route path="/caminhoes/:placa" element={<CaminhaoDetalhe />} />
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/pagamentos" element={<Pagamentos />} />
                    <Route path="/proprietarios" element={<Proprietarios />} />
                    <Route path="/config" element={<Config />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/regras" element={<FinanceiroRegras />} />
                    <Route path="/Rotas" element={<TrackingPage />} />
                    <Route path="/dados-capturados" element={<DadosCapturados />} />
                    <Route path="/fiscal" element={<Fiscal />} />
                    <Route path="/financeiro-nf/dashboard" element={<DashboardFinanceiro />} />
                    <Route path="/financeiro-nf/entrada" element={<NfEntrada />} />
                    <Route path="/financeiro-nf/servico" element={<NfServico />} />
                    <Route path="/financeiro-nf/contas-pagar" element={<ContasPagar />} />
                    <Route path="/financeiro-nf/contas-pagar/conciliar" element={<ContasPagarConciliar />} />
                    <Route path="/cadastros" element={<Cadastros />} />
                    <Route path="/admin" element={<Admin />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}