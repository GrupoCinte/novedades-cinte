import { Link } from 'react-router-dom';

const portals = [
  {
    to: '/ecosistema/colaborador',
    title: 'Portal colaborador',
    subtitle: 'Cliente interno',
    items: ['Mi perfil y documentos', 'Nómina', 'Solicitudes', 'Capacitación', 'Evaluaciones', 'Comunicaciones'],
    border: 'border-cyan-500/40',
    glow: 'hover:shadow-cyan-500/10'
  },
  {
    to: '/ecosistema/administrativo',
    title: 'Portal administrativo',
    subtitle: 'Venta → operación → cobro',
    items: ['CRM', 'Contratos / onboarding', 'Staffing', 'Tiempos y KPIs', 'Conciliación', 'Cobranza'],
    border: 'border-violet-500/40',
    glow: 'hover:shadow-violet-500/10'
  },
  {
    to: '/ecosistema/cliente',
    title: 'Portal cliente',
    subtitle: 'Visibilidad y aprobación',
    items: ['Dashboard servicio', 'Evaluación', 'SLA', 'Aprobaciones', 'Histórico', 'Comunicación cuenta'],
    border: 'border-emerald-500/40',
    glow: 'hover:shadow-emerald-500/10'
  }
];

export default function EcosistemaHub() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">
          Ecosistema Cinte
        </h1>
        <p className="text-lg text-slate-400">
          Tres portales, una cadena de valor — <span className="text-sky-400">mockup de planeación</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        {portals.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            className={`group rounded-2xl border-2 ${p.border} bg-slate-900/50 p-6 flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-xl ${p.glow}`}
          >
            <h2 className="text-xl font-bold text-white mb-1 group-hover:text-sky-200 transition-colors">{p.title}</h2>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-4">{p.subtitle}</p>
            <ul className="text-sm text-slate-400 space-y-2 flex-1">
              {p.items.map((it) => (
                <li key={it} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  {it}
                </li>
              ))}
            </ul>
            <span className="mt-6 text-sky-400 text-sm font-semibold">Explorar →</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Link
          to="/ecosistema/nucleo"
          className="rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900/80 to-slate-800/50 p-6 hover:border-sky-500/50 transition-colors"
        >
          <h3 className="text-lg font-bold text-white mb-2">Núcleo compartido</h3>
          <p className="text-sm text-slate-400 mb-4">
            Maestros, motores de conciliación y calidad, integraciones.
          </p>
          <span className="text-sky-400 text-sm font-medium">Ver capa →</span>
        </Link>
        <Link
          to="/ecosistema/automatizacion"
          className="rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900/80 to-slate-800/50 p-6 hover:border-amber-500/50 transition-colors"
        >
          <h3 className="text-lg font-bold text-white mb-2">Automatización iterativa</h3>
          <p className="text-sm text-slate-400 mb-4">
            Workflows, alertas, IA embebida, entregas por sprint.
          </p>
          <span className="text-amber-400 text-sm font-medium">Ver capa →</span>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0f172a]/80 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Diagrama de referencia (esquema)</p>
        <div className="flex flex-col md:flex-row items-stretch justify-center gap-4 md:gap-2">
          <div className="flex-1 min-h-[100px] rounded-lg bg-cyan-950/40 border border-cyan-800/50 flex items-center justify-center text-cyan-200/90 text-sm font-medium px-2 text-center">
            Colaborador
          </div>
          <div className="hidden md:flex items-center text-slate-600">↔</div>
          <div className="flex-1 min-h-[100px] rounded-lg bg-violet-950/40 border border-violet-800/50 flex items-center justify-center text-violet-200/90 text-sm font-medium px-2 text-center">
            Administrativo
          </div>
          <div className="hidden md:flex items-center text-slate-600">↔</div>
          <div className="flex-1 min-h-[100px] rounded-lg bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-center text-emerald-200/90 text-sm font-medium px-2 text-center">
            Cliente
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="w-full max-w-2xl h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4 text-center text-sm text-slate-400">
            Núcleo compartido
          </div>
          <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4 text-center text-sm text-slate-400">
            Automatización iterativa
          </div>
        </div>
      </div>
    </div>
  );
}
