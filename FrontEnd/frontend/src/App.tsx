import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Caminhoes } from './pages/Caminhoes';
import { Relatorios } from './pages/Relatorios';
import { Pagamentos } from './pages/Pagamentos';
import { Proprietarios } from './pages/Proprietarios';
import { Config } from './pages/Config';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/caminhoes" element={<Caminhoes />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/pagamentos" element={<Pagamentos />} />
          <Route path="/proprietarios" element={<Proprietarios />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}