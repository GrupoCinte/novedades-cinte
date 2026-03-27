import { Routes, Route, Navigate } from 'react-router-dom';
import EcosistemaShell from './EcosistemaShell';
import EcosistemaHub from './pages/EcosistemaHub';
import ColaboradorPortal from './pages/ColaboradorPortal';
import ClientePortal from './pages/ClientePortal';
import AdministrativoPortal from './pages/AdministrativoPortal';
import NucleoPage from './pages/NucleoPage';
import AutomatizacionPage from './pages/AutomatizacionPage';
import PortalSection from './PortalSection';
import { NAV_COLABORADOR, NAV_CLIENTE } from './navigation';

export default function EcosistemaApp() {
  return (
    <Routes>
      <Route element={<EcosistemaShell />}>
        <Route index element={<EcosistemaHub />} />
        <Route path="colaborador" element={<ColaboradorPortal />}>
          <Route index element={<Navigate to="perfil" replace />} />
          <Route
            path=":section"
            element={<PortalSection nav={NAV_COLABORADOR} portalLabel="Portal colaborador" />}
          />
        </Route>
        <Route path="administrativo" element={<AdministrativoPortal />} />
        <Route path="cliente" element={<ClientePortal />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route
            path=":section"
            element={<PortalSection nav={NAV_CLIENTE} portalLabel="Portal cliente" />}
          />
        </Route>
        <Route path="nucleo" element={<NucleoPage />} />
        <Route path="automatizacion" element={<AutomatizacionPage />} />
        <Route path="*" element={<Navigate to="/ecosistema" replace />} />
      </Route>
    </Routes>
  );
}
