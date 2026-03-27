import { Link } from 'react-router-dom';
import { ADMIN_MODULOS_VIVOS, ADMIN_PLACEHOLDERS } from '../navigation';

export default function AdministrativoPortal() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-violet-400/90 mb-1">Portal administrativo</p>
        <h1 className="text-2xl md:text-3xl font-black text-white mb-2">Venta → operación → cobro</h1>
        <p className="text-slate-400 text-sm max-w-2xl">
          Base visual de planeación. Los módulos marcados como «en el sistema» enlazan a la aplicación real (requieren
          sesión y permisos). El resto son placeholders.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          Ya en el sistema
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ADMIN_MODULOS_VIVOS.map((m) => (
            <a
              key={m.id}
              href={m.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-xl border p-5 flex flex-col transition-all hover:-translate-y-0.5 ${m.accent}`}
            >
              <h3 className="font-bold text-white mb-2">{m.label}</h3>
              <p className="text-sm opacity-90 mb-4 flex-1">{m.description}</p>
              <span className="text-xs font-semibold text-white/80">Abrir en nueva pestaña →</span>
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Si no tienes sesión activa, el enlace te llevará al flujo de acceso habitual del sistema.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          Por definir / roadmap
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ADMIN_PLACEHOLDERS.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5 text-slate-400 text-sm"
            >
              {p.label}
              <span className="block text-xs text-slate-600 mt-2">Placeholder</span>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-10 text-center">
        <Link to="/ecosistema" className="text-sky-400 hover:text-sky-300 text-sm">
          ← Volver al hub del ecosistema
        </Link>
      </p>
    </div>
  );
}
