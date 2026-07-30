import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Send, Trash2, Check, X } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { ATRACCION_PAGE_MAIN } from './atraccionLayout.js';
import { fetchCapturaCandidatos, createCampana, enviarCampana, deleteCandidato, setCandidatoDecision } from './atraccionApi.js';
import SortableGestionDataTable from '../onboarding/SortableGestionDataTable.jsx';
import AtraccionCandidatoModal from './AtraccionCandidatoModal.jsx';
import CrearCampanaModal from './CrearCampanaModal.jsx';
import { formatVacanteCodigo } from './atraccionFormat.js';

function isXrayRedirect(c) {
    const isXray = /x-?ray/i.test(c.fuente || '');
    const url = typeof c.url_perfil === 'string' && c.url_perfil.startsWith('http') ? c.url_perfil : '';
    return isXray && url ? url : '';
}

export default function AtraccionCapturaPage({ token }) {
    const { isLight } = useModuleTheme();
    const navigate = useNavigate();
    const card = isLight
        ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
        : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';

    const [q, setQ] = useState('');
    const [candidatos, setCandidatos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalCandidato, setModalCandidato] = useState(null);
    const [sort, setSort] = useState({ key: 'score', dir: 'desc' });
    const [selected, setSelected] = useState(new Set());
    const [showCrear, setShowCrear] = useState(false);
    const [creating, setCreating] = useState(false);
    const [modalError, setModalError] = useState('');

    function toggleSelected(id) {
        const c = candidatos.find((x) => x.id === id);
        if (c && (c.decision || 'pendiente') !== 'aprobado') {
            handleDecision(c, 'aprobado');
            return;
        }
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function applyDecisionLocal(id, decision) {
        setCandidatos((prev) => prev.map((c) => (c.id === id ? { ...c, decision } : c)));
        setModalCandidato((prev) => (prev && prev.id === id ? { ...prev, decision } : prev));
        if (decision === 'aprobado') {
            setSelected((prev) => new Set(prev).add(id));
        } else {
            setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
        }
    }

    async function handleDecision(cand, decision) {
        setError('');
        applyDecisionLocal(cand.id, decision);
        try {
            await setCandidatoDecision(token, cand.id, decision);
        } catch (e) {
            applyDecisionLocal(cand.id, cand.decision || 'pendiente');
            setError(e.message || 'No se pudo actualizar la decisión');
        }
    }

    async function handleEliminar(cand) {
        const nombre = cand.nombre || 'este candidato';
        // eslint-disable-next-line no-alert
        if (!window.confirm(`¿Eliminar a ${nombre} de la base de captura? Esta acción no se puede deshacer.`)) return;
        setError('');
        try {
            await deleteCandidato(token, cand.id);
            setCandidatos((prev) => prev.filter((c) => c.id !== cand.id));
            setSelected((prev) => {
                const next = new Set(prev);
                next.delete(cand.id);
                return next;
            });
        } catch (e) {
            setError(e.message || 'No se pudo eliminar el candidato');
        }
    }

    async function handleCrearCampana({ nombre, mensaje, canalDefault }) {
        setCreating(true);
        setModalError('');
        setError('');
        try {
            const aprobadosIds = [...selected].filter((id) => {
                const c = candidatos.find((x) => x.id === id);
                return c && (c.decision || 'pendiente') === 'aprobado';
            });
            if (!aprobadosIds.length) {
                throw new Error('Apruebe al menos un candidato y márcalo con el checkbox antes de crear la campaña.');
            }
            const vacanteIds = [...new Set(
                aprobadosIds
                    .map((id) => candidatos.find((c) => c.id === id)?.vacante_id)
                    .filter(Boolean)
            )];
            const campana = await createCampana(token, {
                nombre,
                mensaje_plantilla: mensaje || null,
                canal_default: canalDefault || 'auto',
                candidato_ids: aprobadosIds,
                vacante_id: vacanteIds.length === 1 ? vacanteIds[0] : null
            });
            if (!campana?.id) throw new Error('No se pudo crear la campaña.');
            try {
                await enviarCampana(token, campana.id);
            } catch (envErr) {
                setShowCrear(false);
                setSelected(new Set());
                navigate(`/admin/atraccion-talento/campanas?campana=${campana.id}`);
                setError(envErr.message || 'Campaña creada, pero no se pudo enviar automáticamente. Use Enviar en el detalle.');
                return;
            }
            setShowCrear(false);
            setSelected(new Set());
            navigate(`/admin/atraccion-talento/campanas?campana=${campana.id}`);
        } catch (e) {
            setModalError(e.message || 'No se pudo crear la campaña');
        } finally {
            setCreating(false);
        }
    }

    const nombreSugerido = useMemo(() => {
        const first = candidatos.find((c) => selected.has(c.id));
        if (first?.vacante_titulo) return `Contacto — ${first.vacante_titulo}`.slice(0, 160);
        if (selected.size > 0) return 'Campaña de contacto';
        return '';
    }, [candidatos, selected]);

    const selectedAprobados = useMemo(
        () => [...selected].filter((id) => {
            const c = candidatos.find((x) => x.id === id);
            return c && (c.decision || 'pendiente') === 'aprobado';
        }).length,
        [selected, candidatos]
    );

    useEffect(() => {
        let cancelled = false;
        const handle = setTimeout(async () => {
            setLoading(true);
            setError('');
            try {
                const rows = await fetchCapturaCandidatos(token, { q });
                if (!cancelled) setCandidatos(rows);
            } catch (e) {
                if (!cancelled) setError(e.message || 'Error al cargar la base de captura');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, q ? 350 : 0);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [token, q]);

    function toggleSort(key) {
        setSort((prev) =>
            prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
        );
    }

    const sortedRows = useMemo(() => {
        const arr = [...candidatos];
        const { key, dir } = sort;
        arr.sort((a, b) => {
            const pick = (row) => {
                if (key === 'cargo' || key === 'ciudad') return row.perfil?.[key] || '';
                if (key === 'score') return row.score == null ? -1 : Number(row.score);
                return row[key] ?? '';
            };
            const va = pick(a);
            const vb = pick(b);
            if (typeof va === 'number' && typeof vb === 'number') {
                return dir === 'asc' ? va - vb : vb - va;
            }
            const sa = String(va).toLowerCase();
            const sb = String(vb).toLowerCase();
            if (sa < sb) return dir === 'asc' ? -1 : 1;
            if (sa > sb) return dir === 'asc' ? 1 : -1;
            return 0;
        });
        return arr;
    }, [candidatos, sort]);

    const columns = useMemo(() => [
        {
            key: 'sel',
            label: '',
            sortable: false,
            cellClassName: 'px-4 py-3 whitespace-nowrap',
            render: (r) => (
                <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    title={r.decision !== 'aprobado'
                        ? 'Seleccionar (se aprueba automáticamente para campaña)'
                        : 'Seleccionar para campaña'}
                    onClick={(ev) => ev.stopPropagation()}
                    onChange={() => toggleSelected(r.id)}
                    className="h-4 w-4 cursor-pointer accent-sky-600"
                    aria-label={`Seleccionar ${r.nombre || 'candidato'}`}
                />
            )
        },
        {
            key: 'vacante_codigo',
            label: 'Vacante',
            cellClassName: 'px-4 py-3 whitespace-nowrap',
            render: (r) => (
                <span className="flex flex-col">
                    <span className="font-mono text-xs">{formatVacanteCodigo(r.vacante_codigo) || '—'}</span>
                    <span className={`truncate text-xs ${muted}`}>{r.vacante_titulo || 'Sin título'}</span>
                </span>
            )
        },
        { key: 'nombre', label: 'Candidato', render: (r) => r.nombre || 'Sin nombre' },
        { key: 'fuente', label: 'Fuente', render: (r) => r.fuente || '—' },
        { key: 'cargo', label: 'Cargo', render: (r) => r.perfil?.cargo || '—' },
        { key: 'ciudad', label: 'Ciudad', render: (r) => r.perfil?.ciudad || '—' },
        {
            key: 'score',
            label: 'Score',
            cellClassName: 'px-4 py-3 whitespace-nowrap',
            render: (r) => (r.score == null ? '—' : r.score)
        },
        {
            key: 'vacante_estado',
            label: 'Estado vacante',
            cellClassName: 'px-4 py-3 whitespace-nowrap',
            render: (r) => (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                    r.vacante_estado === 'archivada'
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}>
                    {r.vacante_estado || '—'}
                </span>
            )
        },
        {
            key: 'decision',
            label: 'Decisión',
            cellClassName: 'px-4 py-3 whitespace-nowrap',
            render: (r) => {
                const decision = r.decision || 'pendiente';
                const aprobar = decision === 'aprobado'
                    ? 'inline-flex items-center gap-1 rounded-md border border-emerald-500 bg-emerald-500 px-2 py-1 text-xs font-medium text-white'
                    : 'inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50';
                const rechazar = decision === 'rechazado'
                    ? 'inline-flex items-center gap-1 rounded-md border border-red-500 bg-red-500 px-2 py-1 text-xs font-medium text-white'
                    : 'inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50';
                return (
                    <span className="flex items-center gap-1">
                        <button
                            type="button"
                            className={aprobar}
                            title="Aprobar"
                            onClick={(ev) => { ev.stopPropagation(); handleDecision(r, decision === 'aprobado' ? 'pendiente' : 'aprobado'); }}
                        >
                            <Check size={13} />
                        </button>
                        <button
                            type="button"
                            className={rechazar}
                            title="Rechazar"
                            onClick={(ev) => { ev.stopPropagation(); handleDecision(r, decision === 'rechazado' ? 'pendiente' : 'rechazado'); }}
                        >
                            <X size={13} />
                        </button>
                    </span>
                );
            }
        },
        {
            key: 'acciones',
            label: '',
            sortable: false,
            cellClassName: 'px-4 py-3 whitespace-nowrap text-right',
            render: (r) => (
                <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); handleEliminar(r); }}
                    title="Eliminar candidato"
                    aria-label={`Eliminar ${r.nombre || 'candidato'}`}
                    className={isLight
                        ? 'inline-flex items-center justify-center rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50'
                        : 'inline-flex items-center justify-center rounded-lg border border-red-500/40 p-1.5 text-red-400 hover:bg-red-500/10'}
                >
                    <Trash2 size={15} />
                </button>
            )
        }
    ], [muted, selected, isLight]);

    function onRowClick(row) {
        const redirect = isXrayRedirect(row);
        if (redirect) {
            window.open(redirect, '_blank', 'noopener,noreferrer');
        } else {
            setModalCandidato(row);
        }
    }

    return (
        <main className={ATRACCION_PAGE_MAIN}>
            <div className={card}>
                <h2 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Base de captura
                </h2>
                <p className={`mt-1 text-sm ${muted}`}>
                    Todo lo capturado queda aquí, incluso de vacantes archivadas. Busca por nombre o por ID de vacante (ej. VAC-000123).
                </p>

                <div className="mt-4 flex items-center gap-2">
                    <div className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${
                        isLight ? 'border-slate-300 bg-white' : 'border-slate-600 bg-[#04141E]/50'
                    }`}>
                        <Search size={16} className={muted} />
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Buscar candidato o VAC-000123…"
                            className={`w-full bg-transparent text-sm outline-none ${isLight ? 'text-slate-800' : 'text-slate-100'}`}
                        />
                    </div>
                    <span className={`text-xs ${muted}`}>{candidatos.length} resultados</span>
                    <button
                        type="button"
                        disabled={selectedAprobados === 0}
                        onClick={() => { setModalError(''); setShowCrear(true); }}
                        className={isLight
                            ? 'inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-40'
                            : 'inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-40'}
                    >
                        <Send size={14} /> Crear campaña ({selectedAprobados})
                    </button>
                </div>

                {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

                <div className="mt-4">
                    {loading && candidatos.length === 0 ? (
                        <p className={`text-sm ${muted}`}>Cargando…</p>
                    ) : (
                        <SortableGestionDataTable
                            columns={columns}
                            rows={sortedRows}
                            isLight={isLight}
                            emptyText="No hay candidatos capturados todavía."
                            onRowClick={onRowClick}
                            sort={sort}
                            onSort={toggleSort}
                            sortableKeys={['vacante_codigo', 'nombre', 'fuente', 'cargo', 'ciudad', 'score', 'vacante_estado']}
                            rowKey={(row) => row.id}
                        />
                    )}
                </div>
            </div>

            {modalCandidato ? (
                <AtraccionCandidatoModal
                    candidato={modalCandidato}
                    token={token}
                    onClose={() => setModalCandidato(null)}
                    onDecision={handleDecision}
                    onEnriched={(updated) => {
                        setModalCandidato(updated);
                        setCandidatos((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                    }}
                />
            ) : null}

            {showCrear ? (
                <CrearCampanaModal
                    count={selectedAprobados}
                    creating={creating}
                    error={modalError}
                    nombreSugerido={nombreSugerido}
                    onClose={() => { setModalError(''); setShowCrear(false); }}
                    onSubmit={handleCrearCampana}
                />
            ) : null}
        </main>
    );
}
