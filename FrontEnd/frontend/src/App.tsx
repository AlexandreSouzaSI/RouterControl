import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Viagens } from './pages/Viagens';
import { Caminhoes } from './pages/Caminhoes';
import { Relatorios } from './pages/Relatorios';
import { Pagamentos } from './pages/Pagamentos';
import { Proprietarios } from './pages/Proprietarios';
import { Config } from './pages/Config';
import { Financeiro } from './pages/Financeiro';
import { FinanceiroRegras } from './pages/FinanceiroRegras';
import { TrackingPage } from './pages/TrackingPage';

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
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/pagamentos" element={<Pagamentos />} />
                    <Route path="/proprietarios" element={<Proprietarios />} />
                    <Route path="/config" element={<Config />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/regras" element={<FinanceiroRegras />} />
                    <Route path="/Rotas" element={<TrackingPage />} />
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