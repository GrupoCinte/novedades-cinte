import { Outlet, Link, useLocation } from 'react-router-dom';

export default function EcosistemaShell() {
  const location = useLocation();
  const isHub = location.pathname === '/ecosistema' || location.pathname === '/ecosistema/';

  return (
    <div className="min-h-full flex flex-col bg-[#0b1220] text-slate-200">
      <header className="shrink-0 border-b border-slate-800 bg-[#0f172a]/95 px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-4">
          <Link to="/ecosistema" className="text-lg font-black text-white tracking-tight hover:text-sky-300 transition-colors">
            Ecosistema Cinte
          </Link>
          <span className="hidden sm:inline text-xs font-semibold uppercase tracking-widest px-2 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">
            Mock de planeación
          </span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {!isHub ? (
            <Link to="/ecosistema" className="text-sky-400 hover:text-sky-300">
              ← Hub
            </Link>
          ) : null}
          <Link to="/" className="text-slate-500 hover:text-slate-300">
            Portal público novedades
          </Link>
        </nav>
      </header>
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
