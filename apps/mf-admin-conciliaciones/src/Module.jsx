import './index.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import ConciliacionesModule from './conciliaciones/ConciliacionesModule.jsx';
import ConciliacionesDashboardPage from './conciliaciones/ConciliacionesDashboardPage.jsx';
import ConciliacionesPage from './conciliaciones/ConciliacionesPage.jsx';
import ConciliacionesFacturacionPage from './conciliaciones/ConciliacionesFacturacionPage.jsx';

/** Remote conciliaciones: rutas relativas al splat del shell (/admin/conciliaciones/*). */
export default function ConciliacionesRoot({ auth, onLogout, token = '' }) {
  return (
    <Routes>
      <Route path="/" element={<ConciliacionesModule auth={auth} onLogout={onLogout} />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ConciliacionesDashboardPage token={token} />} />
        <Route path="resumen" element={<ConciliacionesPage token={token} />} />
        <Route path="facturacion" element={<ConciliacionesFacturacionPage token={token} />} />
      </Route>
    </Routes>
  );
}

