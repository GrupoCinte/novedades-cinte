import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useUiTheme } from './UiThemeContext.jsx';

function isConsultorEntra(me) {
  return Boolean(
    me && me.authProvider === 'entra_consultor' && String(me.role || '').toLowerCase() === 'consultor'
  );
}

/**
 * Rutas bajo `/consultor/*`: solo sesión Entra con rol consultor.
 * Expone `{ me, refreshMe }` a hijos vía Outlet context.
 */
export default function ConsultorProtectedLayout() {
  const { theme } = useUiTheme();
  const isLight = theme === 'light';
  const [me, setMe] = useState(undefined);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data?.me) setMe(data.me);
      else setMe(null);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshMe();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshMe]);

  if (me === undefined) {
    return (
      <div
        className={`flex min-h-[100dvh] flex-1 flex-col items-center justify-center font-body ${
          isLight ? 'bg-slate-100 text-slate-600' : 'bg-[#04141E] text-[#9fb3c8]'
        }`}
      >
        <p className="text-sm">Cargando…</p>
      </div>
    );
  }

  if (!isConsultorEntra(me)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet context={{ me, refreshMe }} />;
}
