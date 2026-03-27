/**
 * Vista genérica de sección mock (solo texto informativo).
 */
export default function EcosistemaPlaceholder({ title, subtitle, portalLabel }) {
  return (
    <div className="max-w-3xl">
      {portalLabel ? (
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{portalLabel}</p>
      ) : null}
      <h2 className="text-2xl font-bold text-white mb-2">{title || 'Sección'}</h2>
      {subtitle ? <p className="text-slate-400 mb-6">{subtitle}</p> : null}
      <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-8 text-center text-slate-500">
        <p className="text-lg mb-2">Próximamente</p>
        <p className="text-sm">
          Esta pantalla es parte del mockup de planeación del Ecosistema Cinte. No hay funcionalidad conectada.
        </p>
      </div>
    </div>
  );
}
