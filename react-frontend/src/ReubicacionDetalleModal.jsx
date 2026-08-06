import { Pencil, Trash2 } from 'lucide-react';
import GestionModalShell from './shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import { formatMoneyAmountOnly } from './multiCurrencyMoney.js';

function formatMontoDisplay(val, currencyCode = 'COP') {
    if (val == null || val === '') return '—';
    const num = Number(val);
    if (!Number.isFinite(num)) return '—';
    const ccy = currencyCode || 'COP';
    return `$ ${formatMoneyAmountOnly(num, ccy)}`;
}

export function ReubicacionDetalleModal({ isOpen, onClose, row, token, auth, onEdit, onDelete }) {
    const { isLight } = useModuleTheme();
    const dash = buildGestionTableDash(Boolean(isLight));

    if (!isOpen || !row) return null;

    const userRole = auth?.user?.role;
    const canModify = ['super_admin', 'cac'].includes(userRole);

    const footer = (
        <div className="flex justify-end gap-2 w-full pt-2">
            {canModify && (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            onEdit(row);
                        }}
                        className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a] flex items-center gap-2"
                    >
                        <Pencil size={16} /> Editar
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            onDelete(row);
                        }}
                        className="px-4 py-2 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 flex items-center gap-2"
                    >
                        <Trash2 size={16} /> Eliminar
                    </button>
                </>
            )}
            <button
                type="button"
                onClick={onClose}
                className={dash.compactBtn}
            >
                Cerrar
            </button>
        </div>
    );

    return (
        <GestionModalShell
            open={isOpen}
            onClose={onClose}
            title="Detalle de Reubicación"
            subtitle={`Cédula ${row.cedula} · ${row.consultor || 'Consultor'}`}
            size="md"
            footer={footer}
        >
            <div className="mt-2 space-y-4 font-body">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Cédula</p>
                        <p className="font-semibold">{row.cedula}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Consultor</p>
                        <p className="font-semibold">{row.consultor || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Cliente actual</p>
                        <p className="font-semibold">{row.cliente_actual || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Cliente destino</p>
                        <p className="font-semibold">{row.cliente_destino || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Puesto</p>
                        <p className="font-semibold">{row.puesto || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Salario</p>
                        <p className="font-semibold">{formatMontoDisplay(row.salario, row.moneda_salario || row.moneda)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Auxilios</p>
                        <p className="font-semibold">{formatMontoDisplay(row.auxilios, row.moneda_auxilios || row.moneda)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Tipo ficha</p>
                        <p className="font-semibold">{row.tipo_ficha || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Fecha fin</p>
                        <p className="font-semibold">{row.fecha_fin || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Días restantes</p>
                        <p className="font-semibold">{row.dias_restantes ?? '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40 sm:col-span-2">
                        <p className={`text-xs ${dash.modalMuted}`}>Estado / Semáforo</p>
                        <p className="font-semibold">{row.estado || row.semaforo || '—'}</p>
                    </div>
                </div>
            </div>
        </GestionModalShell>
    );
}