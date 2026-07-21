import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Plus, Trash2 } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import { fetchCapturaCandidatos } from './atraccionApi.js';

export default function AgregarDestinatariosModal({ token, excludeIds = [], onClose, onSubmit }) {
    const { isLight } = useModuleTheme();
    const [tab, setTab] = useState('aprobados');
    const [q, setQ] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(() => new Set());
    const [saving, setSaving] = useState(false);

    // Alta manual
    const [manuales, setManuales] = useState([]);
    const [mNombre, setMNombre] = useState('');
    const [mCorreo, setMCorreo] = useState('');
    const [mTelefono, setMTelefono] = useState('');

    const input = isLight
        ? 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'
        : 'w-full rounded-lg border border-slate-600 bg-[#04141E] px-2.5 py-1.5 text-sm text-slate-100';
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const btnPrimary = isLight
        ? 'rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50'
        : 'rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50';
    const btnGhost = isLight
        ? 'inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50'
        : 'inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-800';
    const tabBtn = (active) => active
        ? (isLight ? 'rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white' : 'rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-medium text-white')
        : (isLight ? 'rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600' : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300');

    useEffect(() => {
        if (tab !== 'aprobados') return undefined;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const data = await fetchCapturaCandidatos(token, { q, limit: 200 });
                if (!cancelled) setRows(Array.isArray(data) ? data : []);
            } catch (e) {
                if (!cancelled) setError(e.message || 'No se pudieron cargar candidatos');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [token, q, tab]);

    const excludeSet = useMemo(() => new Set((excludeIds || []).map(String)), [excludeIds]);
    const elegibles = useMemo(
        () => rows.filter((r) => r.decision === 'aprobado' && !excludeSet.has(String(r.id))),
        [rows, excludeSet]
    );

    function toggle(id) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function addManual() {
        const nombre = mNombre.trim();
        const correo = mCorreo.trim();
        const telefono = mTelefono.trim();
        if (!nombre) { setError('El nombre es obligatorio.'); return; }
        if (!correo && !telefono) { setError('Indique al menos correo o número.'); return; }
        setError('');
        setManuales((prev) => [...prev, { nombre, correo: correo || null, telefono: telefono || null }]);
        setMNombre(''); setMCorreo(''); setMTelefono('');
    }

    function removeManual(idx) {
        setManuales((prev) => prev.filter((_, i) => i !== idx));
    }

    const total = selected.size + manuales.length;

    async function submit() {
        if (!total) return;
        setSaving(true);
        setError('');
        try {
            await onSubmit({ candidatoIds: [...selected], manuales });
        } catch (e) {
            setError(e.message || 'No se pudieron agregar');
            setSaving(false);
        }
    }

    return (
        <GestionModalShell
            open
            onClose={onClose}
            title="Agregar a la campaña"
            subtitle="Selecciona candidatos aprobados o agrega contactos manualmente (nombre, correo y número)"
            size="md"
        >
            <div className="space-y-3">
                <div className="flex gap-2">
                    <button type="button" className={tabBtn(tab === 'aprobados')} onClick={() => setTab('aprobados')}>
                        Candidatos aprobados
                    </button>
                    <button type="button" className={tabBtn(tab === 'manual')} onClick={() => setTab('manual')}>
                        Agregar manual
                    </button>
                </div>

                {error ? <p className="text-sm text-red-500">{error}</p> : null}

                {tab === 'aprobados' ? (
                    <>
                        <label className="relative block">
                            <Search size={14} className={`absolute left-2.5 top-2.5 ${muted}`} />
                            <input
                                className={`${input} pl-8`}
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar por nombre…"
                            />
                        </label>
                        {loading ? (
                            <p className={`text-sm ${muted}`}>Cargando…</p>
                        ) : elegibles.length === 0 ? (
                            <p className={`text-sm ${muted}`}>No hay candidatos aprobados disponibles para agregar.</p>
                        ) : (
                            <ul className="max-h-[280px] space-y-1 overflow-y-auto">
                                {elegibles.map((r) => (
                                    <li key={r.id}>
                                        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                            isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-700 hover:bg-slate-800'
                                        }`}>
                                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                                            <span className="min-w-0 flex-1 truncate font-medium">{r.nombre || 'Sin nombre'}</span>
                                            <span className={`text-xs ${muted}`}>{r.fuente}</span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <input className={input} value={mNombre} onChange={(e) => setMNombre(e.target.value)} placeholder="Nombre *" />
                            <input className={input} value={mCorreo} onChange={(e) => setMCorreo(e.target.value)} placeholder="Correo" />
                            <input className={input} value={mTelefono} onChange={(e) => setMTelefono(e.target.value)} placeholder="Número (WhatsApp)" />
                        </div>
                        <button type="button" className={btnGhost} onClick={addManual}>
                            <Plus size={14} /> Añadir a la lista
                        </button>
                        {manuales.length ? (
                            <ul className="max-h-[220px] space-y-1 overflow-y-auto">
                                {manuales.map((m, idx) => (
                                    <li key={`${m.nombre}-${idx}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                        isLight ? 'border-slate-200' : 'border-slate-700'
                                    }`}>
                                        <UserPlus size={14} className={muted} />
                                        <span className="min-w-0 flex-1 truncate">
                                            <span className="font-medium">{m.nombre}</span>
                                            {m.telefono ? <span className={`ml-2 text-xs ${muted}`}>{m.telefono}</span> : null}
                                            {m.correo ? <span className={`ml-2 text-xs ${muted}`}>{m.correo}</span> : null}
                                        </span>
                                        <button type="button" className="text-red-500 hover:text-red-600" onClick={() => removeManual(idx)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={`text-xs ${muted}`}>Con número se contacta por WhatsApp; sólo con correo queda como contacto manual.</p>
                        )}
                    </>
                )}

                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        className={isLight ? 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700' : 'rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200'}
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button type="button" className={btnPrimary} disabled={!total || saving} onClick={submit}>
                        {saving ? 'Agregando…' : `Agregar (${total})`}
                    </button>
                </div>
            </div>
        </GestionModalShell>
    );
}
