import { useMemo } from 'react';
import { X } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

export default function ConciliacionesDetalleModal({
    open,
    onClose,
    loading,
    items,
    colaboradorLabel,
    colaboradorData,
    isLight
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    if (!open) return null;

    const blockBg = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0f172a]/50 border-slate-700/50';

    return (
        <div className={dash.modalBackdrop} role="dialog" aria-modal="true">
            <button type="button" className="modal-glass-scrim absolute inset-0 transition-opacity" aria-label="Cerrar" onClick={onClose} />
            <div className={`${dash.modalCardWide} max-w-4xl font-body`}>
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0">
                        <h2 className={`font-heading ${dash.title2xl}`}>Novedades aprobadas</h2>
                        <p className={`mt-0.5 truncate text-xs ${dash.modalMuted}`}>{colaboradorLabel}</p>
                    </div>
                    <button type="button" onClick={onClose} className={dash.modalClose} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>
                <div className={`${dash.modalBodyScroll} space-y-4 px-1`}>
                    {colaboradorData ? (
                        <div className={`grid grid-cols-1 gap-3 rounded-xl border p-4 text-xs sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${blockBg} ${dash.modalInfoGrid}`}>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Nit Cliente</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.nit || '—'}</span>
                            </div>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Cliente / Organización</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.cliente || '—'}</span>
                            </div>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Cédula Consultor</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.cedula || '—'}</span>
                            </div>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Nombre Consultor</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.nombre || '—'}</span>
                            </div>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Servicio / Rol</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.perfil || '—'}</span>
                            </div>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Fecha Ingreso</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.fechaIngreso || '—'}</span>
                            </div>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Tipo de Contrato</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.tipoContrato || '—'}</span>
                            </div>
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Ejecutivo Comercial</span>
                                <span className={`font-body font-medium ${dash.tdLead}`}>{colaboradorData.comercial || '—'}</span>
                            </div>
                        </div>
                    ) : null}

                    {loading ? (
                        <p className={dash.modalMuted}>Cargando…</p>
                    ) : !items.length ? (
                        <p className={dash.modalMuted}>No hay novedades en el periodo.</p>
                    ) : (
                        <div className={`${dash.card} min-h-0 overflow-hidden`}>
                            <div className={`${dash.tableWrap} max-h-[min(50vh,20rem)] overflow-auto sm:max-h-none`}>
                                <table className="w-full min-w-[640px] text-left text-sm">
                                    <thead className={dash.thead}>
                                        <tr>
                                            <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Tipo</th>
                                            <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Monto</th>
                                            <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Fechas</th>
                                            <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Aprobador</th>
                                        </tr>
                                    </thead>
                                    <tbody className={dash.tbody}>
                                        {items.map((row) => (
                                            <tr key={row.id} className={dash.trHover}>
                                                <td className={dash.tdCell}>{row.tipoNovedad}</td>
                                                <td className={`${dash.tdCell} tabular-nums`}>
                                                    {row.montoCop != null ? formatCop(row.montoCop) : '—'}
                                                </td>
                                                <td className={`${dash.tdMuted} text-xs`}>
                                                    {row.fechaInicio || row.fecha || '—'}
                                                    {row.fechaFin && row.fechaFin !== row.fechaInicio ? ` → ${row.fechaFin}` : ''}
                                                </td>
                                                <td className={`${dash.tdCell} text-xs`}>{row.aprobador || 'Aprobador CINTE'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
