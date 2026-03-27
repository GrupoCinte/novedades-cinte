import { NavLink, Outlet } from 'react-router-dom';
import { NAV_CLIENTE } from '../navigation';

export default function ClientePortal() {
  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-800 bg-[#0f172a] p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400/90 mb-3">Portal cliente</p>
        <p className="text-xs text-slate-500 mb-4">Visibilidad y aprobación</p>
        <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          {NAV_CLIENTE.map((item) => (
            <NavLink
              key={item.id}
              to={item.id}
              className={({ isActive }) =>
                `whitespace-nowrap md:whitespace-normal px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/40'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1 p-6 md:p-8">
        <Outlet />
      </div>
    </div>
  );
}
