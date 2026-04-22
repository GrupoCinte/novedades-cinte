import { normalizeStatus } from '../hooks/useMonitorData';

/** Si VITE_MASK_SENSITIVE_UI=true, enmascara email/tel/salario en pantalla (mismo modelo de datos). */
function formatDetailDisplay(key, value) {
    const mask = import.meta.env.VITE_MASK_SENSITIVE_UI === 'true';
    const raw = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    if (!mask) return raw;
    const lk = String(key).toLowerCase();
    if (lk.includes('email')) {
        const at = raw.indexOf('@');
        if (at <= 1) return '••••';
        return `${raw[0]}•••••${raw.slice(at)}`;
    }
    if (lk.includes('telefono') || lk.includes('whatsapp') || lk.includes('celular') || lk.includes('phone') || lk.includes('numerico')) {
        const d = raw.replace(/\D/g, '');
        if (d.length < 4) return '••••';
        return `••••${d.slice(-4)}`;
    }
    if (lk.includes('salario') || lk.includes('direccion') || lk.includes('dirección')) return '••••';
    return raw;
}

export default function CandidateModal({ selectedUser, onClose }) {
    if (!selectedUser) return null;

    const obsElim = selectedUser.fullData?.obs_eliminado;
    const isEliminado = normalizeStatus(selectedUser.realStatus) === 'eliminado' || Boolean(obsElim);
    const detailEntries = selectedUser.fullData
        ? Object.entries(selectedUser.fullData).filter(([key]) => key !== 'obs_eliminado')
        : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="modal-glass-scrim absolute inset-0 transition-opacity"
                onClick={onClose}
            ></div>
            <div className="modal-glass-sheet relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">

                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-6 py-5">
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--text)] tracking-tight">{selectedUser.workflowName}</h2>
                        <p className="mt-0.5 text-sm font-mono text-[rgba(159,179,200,0.95)]">{selectedUser.executionId}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] transition-all hover:bg-slate-800/50 hover:text-[var(--text)]"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-6 py-3">
                    <div className="flex items-center gap-3">
                        <div className={`h-2.5 w-2.5 rounded-full ${
                            selectedUser.realStatus === 'finalizado' ? 'bg-cinte-green shadow-[0_0_8px_rgba(79,136,49,0.5)]' :
                            selectedUser.realStatus === 'contactado' ? 'bg-cinte-primary shadow-[0_0_8px_rgba(0,77,135,0.5)]' :
                            selectedUser.realStatus === 'analizando' ? 'bg-cinte-warning shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse' :
                            'bg-cinte-red shadow-[0_0_8px_rgba(210,27,48,0.5)]'
                        }`}></div>
                        <span className={`text-sm font-medium uppercase tracking-wide ${
                            selectedUser.realStatus === 'analizando' ? 'text-cinte-warning' : 'text-[rgba(159,179,200,0.95)]'
                        }`}>
                            {selectedUser.realStatus === 'analizando' ? 'Analizando documentos…' : (selectedUser.realStatus || 'Sin Estado')}
                        </span>
                    </div>
                    {/* Tiempo de proceso: ya se muestra en otro componente (evita NaN en algunos datos). */}
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {isEliminado && obsElim ? (
                        <div className="mb-5 rounded-xl border border-red-500/40 bg-transparent px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-red-300">Motivo de eliminación</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[rgba(231,238,247,0.95)]">{obsElim}</p>
                        </div>
                    ) : null}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedUser.fullData ? (
                            detailEntries.map(([key, value]) => (
                                <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 transition-colors hover:border-[var(--primary)]/40">
                                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
                                        {key.replace(/_/g, ' ')}
                                    </div>
                                    <div className="break-words text-sm font-medium leading-relaxed text-[rgba(231,238,247,0.95)]">
                                        {formatDetailDisplay(key, value)}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-2 text-[rgba(159,179,200,0.95)] italic text-center py-8">
                                No hay detalles adicionales.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
