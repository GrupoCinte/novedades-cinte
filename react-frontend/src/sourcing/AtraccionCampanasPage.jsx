import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, MessageCircle, Send, Pencil, UserPlus, X, Trash2 } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { ATRACCION_PAGE_MAIN } from './atraccionLayout.js';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import SortableGestionDataTable from '../onboarding/SortableGestionDataTable.jsx';
import PlantillaEditor from './PlantillaEditor.jsx';
import AgregarDestinatariosModal from './AgregarDestinatariosModal.jsx';
import {
    fetchCampanas,
    fetchCampana,
    updateCampana,
    addCampanaDestinatarios,
    updateCampanaDestinatario,
    deleteCampanaDestinatario,
    enviarCampana,
    fetchFlujos,
    createFlujo,
    deleteFlujo,
    asignarFlujoCampana,
    fetchFlujoCampanaProgress
} from './atraccionApi.js';

const ESTADO_CAMPANA_BADGE = {
    borrador: 'bg-slate-100 text-slate-600 border-slate-200',
    enviando: 'bg-sky-100 text-sky-800 border-sky-200',
    enviada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    parcial: 'bg-amber-100 text-amber-800 border-amber-200',
    cancelada: 'bg-rose-100 text-rose-700 border-rose-200'
};

const ESTADO_DEST_BADGE = {
    pendiente: 'bg-slate-100 text-slate-600 border-slate-200',
    enviado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    fallido: 'bg-rose-100 text-rose-700 border-rose-200'
};

function waLink(telefono, mensaje) {
    const digits = String(telefono || '').replace(/\D/g, '');
    if (!digits) return '';
    const text = mensaje ? `?text=${encodeURIComponent(mensaje)}` : '';
    return `https://wa.me/${digits}${text}`;
}

function FlujosSection({ token, isLight, muted }) {
    const cardInner = isLight ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm' : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const input = isLight
        ? 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
        : 'mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white';
    const [flujos, setFlujos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [nombre, setNombre] = useState('');
    const [pasosJson, setPasosJson] = useState('[{"orden":1,"canal":"inmail","disparador":"inmediato","plantilla":"Hola [nombre], tenemos una vacante para ti."}]');
    const [busy, setBusy] = useState(false);

    async function reload() {
        setLoading(true);
        try {
            setFlujos(await fetchFlujos(token));
        } catch (e) {
            setError(e.message || 'Error al cargar flujos');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

    async function onCreate(e) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            let pasos;
            try {
                pasos = JSON.parse(pasosJson);
            } catch {
                throw new Error('JSON de pasos inválido');
            }
            await createFlujo(token, { nombre: nombre.trim(), pasos });
            setNombre('');
            await reload();
        } catch (err) {
            setError(err.message || 'No se pudo crear el flujo');
        } finally {
            setBusy(false);
        }
    }

    async function onDelete(id) {
        if (!window.confirm('¿Eliminar este flujo?')) return;
        setBusy(true);
        try {
            await deleteFlujo(token, id);
            await reload();
        } catch (err) {
            setError(err.message || 'No se pudo eliminar');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={`mt-6 ${cardInner}`}>
            <h3 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Flujos multi-paso (InMail / WhatsApp)
            </h3>
            <p className={`mt-1 text-sm ${muted}`}>
                Secuencias de contacto asignables a campañas. WhatsApp usa preentrevista n8n; InMail se envía vía worker si está activo.
            </p>
            {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
                <label className={`block text-xs ${muted}`}>
                    Nombre del flujo
                    <input className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                </label>
                <label className={`block text-xs md:col-span-2 ${muted}`}>
                    Pasos (JSON)
                    <textarea className={`${input} min-h-[80px] font-mono text-xs`} value={pasosJson} onChange={(e) => setPasosJson(e.target.value)} />
                </label>
                <div>
                    <button
                        type="submit"
                        disabled={busy}
                        className={isLight
                            ? 'rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50'
                            : 'rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50'}
                    >
                        {busy ? 'Guardando…' : 'Crear flujo'}
                    </button>
                </div>
            </form>
            <ul className="mt-4 space-y-2">
                {loading ? <li className={`text-sm ${muted}`}>Cargando flujos…</li> : null}
                {!loading && flujos.length === 0 ? (
                    <li className={`text-sm ${muted}`}>Sin flujos definidos.</li>
                ) : null}
                {flujos.map((f) => (
                    <li
                        key={f.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                            isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/40'
                        }`}
                    >
                        <span>
                            <strong>{f.nombre}</strong>
                            <span className={`ml-2 text-xs ${muted}`}>
                                {(Array.isArray(f.pasos_json) ? f.pasos_json : []).length} paso(s)
                            </span>
                        </span>
                        <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => onDelete(f.id)}>
                            Eliminar
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function CampanaDetalleModal({ token, campanaId, onClose, onChanged }) {
    const { isLight } = useModuleTheme();
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const [campana, setCampana] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [editing, setEditing] = useState(false);
    const [draftNombre, setDraftNombre] = useState('');
    const [draftMensaje, setDraftMensaje] = useState('');
    const [draftPlantillas, setDraftPlantillas] = useState({});
    const [savingTpl, setSavingTpl] = useState(false);
    const [showAgregar, setShowAgregar] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [flujos, setFlujos] = useState([]);
    const [flujoProgress, setFlujoProgress] = useState([]);
    const [selectedFlujoId, setSelectedFlujoId] = useState('');
    const [flujoBusy, setFlujoBusy] = useState(false);

    async function reload() {
        setLoading(true);
        try {
            const data = await fetchCampana(token, campanaId);
            setCampana(data);
        } catch (e) {
            setError(e.message || 'Error al cargar la campaña');
        } finally {
            setLoading(false);
        }
    }

    function startEdit() {
        setDraftNombre(campana?.nombre || '');
        setDraftMensaje(campana?.mensaje_plantilla || '');
        setDraftPlantillas(campana?.plantillas || {});
        setEditing(true);
        setInfo('');
        setError('');
    }

    async function saveEdit() {
        setSavingTpl(true);
        setError('');
        try {
            await updateCampana(token, campanaId, {
                nombre: draftNombre.trim() || undefined,
                mensaje_plantilla: draftMensaje,
                plantillas: draftPlantillas
            });
            setEditing(false);
            await reload();
            onChanged?.();
            setInfo('Plantilla actualizada.');
        } catch (e) {
            setError(e.message || 'No se pudo guardar la plantilla');
        } finally {
            setSavingTpl(false);
        }
    }

    async function onAgregar({ candidatoIds = [], manuales = [] }) {
        const data = await addCampanaDestinatarios(token, campanaId, { candidatoIds, manuales });
        setShowAgregar(false);
        await reload();
        onChanged?.();
        setInfo(`${data.agregados || 0} contacto(s) agregado(s).`);
    }

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const data = await fetchCampana(token, campanaId);
                if (!cancelled) setCampana(data);
            } catch (e) {
                if (!cancelled) setError(e.message || 'Error al cargar la campaña');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        (async () => {
            try {
                const [fl, prog] = await Promise.all([
                    fetchFlujos(token),
                    fetchFlujoCampanaProgress(token, campanaId)
                ]);
                if (!cancelled) {
                    setFlujos(fl);
                    setFlujoProgress(prog);
                }
            } catch {
                /* opcional */
            }
        })();
        return () => { cancelled = true; };
    }, [token, campanaId]);

    async function onAsignarFlujo() {
        if (!selectedFlujoId) return;
        setFlujoBusy(true);
        setError('');
        try {
            const data = await asignarFlujoCampana(token, campanaId, selectedFlujoId);
            setInfo(`${data.agregados || 0} destinatario(s) inscritos en el flujo.`);
            setFlujoProgress(await fetchFlujoCampanaProgress(token, campanaId));
        } catch (e) {
            setError(e.message || 'No se pudo asignar el flujo');
        } finally {
            setFlujoBusy(false);
        }
    }

    async function marcar(dest, estado) {
        setError('');
        try {
            await updateCampanaDestinatario(token, campanaId, dest.id, { estado });
            await reload();
            onChanged?.();
        } catch (e) {
            setError(e.message || 'No se pudo actualizar el destinatario');
        }
    }

    async function confirmarEliminar() {
        if (!confirmDelete) return;
        setDeleting(true);
        setError('');
        try {
            await deleteCampanaDestinatario(token, campanaId, confirmDelete.id);
            setConfirmDelete(null);
            await reload();
            onChanged?.();
        } catch (e) {
            setError(e.message || 'No se pudo eliminar el destinatario');
        } finally {
            setDeleting(false);
        }
    }

    async function onEnviar() {
        setError('');
        setInfo('');
        try {
            const data = await enviarCampana(token, campanaId);
            setInfo(data.mensaje || (data.dispatched ? 'Campaña enviada al flujo de n8n.' : 'Envío manual.'));
            await reload();
            onChanged?.();
        } catch (e) {
            setError(e.message || 'No se pudo enviar la campaña');
        }
    }

    const btnGhost = isLight
        ? 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
        : 'inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800';
    const btnPrimary = isLight
        ? 'inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700'
        : 'inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600';

    return (
        <>
        <GestionModalShell
            open
            onClose={onClose}
            title={campana?.nombre || 'Campaña'}
            subtitle={campana ? `Estado: ${campana.estado} · ${campana.destinatarios?.length || 0} destinatarios` : ''}
            size="wide"
            headerActions={campana ? (
                <span className="flex items-center gap-2">
                    <button type="button" className={btnGhost} onClick={startEdit}>
                        <Pencil size={13} /> Editar plantilla
                    </button>
                    <button type="button" className={btnGhost} onClick={() => setShowAgregar(true)}>
                        <UserPlus size={13} /> Agregar
                    </button>
                    <button type="button" className={btnPrimary} onClick={onEnviar}>
                        <Send size={14} /> Enviar
                    </button>
                </span>
            ) : null}
        >
            {error ? <p className="mb-2 text-sm text-red-500">{error}</p> : null}
            {info ? <p className="mb-2 text-sm text-emerald-600">{info}</p> : null}
            {loading ? (
                <p className={`text-sm ${muted}`}>Cargando…</p>
            ) : !campana ? (
                <p className={`text-sm ${muted}`}>Campaña no disponible.</p>
            ) : editing ? (
                <div className="space-y-4">
                    <label className="block">
                        <span className={isLight ? 'text-xs font-semibold text-slate-700' : 'text-xs font-semibold text-slate-300'}>
                            Nombre de la campaña
                        </span>
                        <input
                            className={isLight
                                ? 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'
                                : 'mt-1 w-full rounded-lg border border-slate-600 bg-[#04141E] px-2.5 py-1.5 text-sm text-slate-100'}
                            value={draftNombre}
                            onChange={(e) => setDraftNombre(e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className={isLight ? 'text-xs font-semibold text-slate-700' : 'text-xs font-semibold text-slate-300'}>
                            Mensaje inicial (WhatsApp) — resumen corto
                        </span>
                        <textarea
                            className={isLight
                                ? 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 min-h-[70px]'
                                : 'mt-1 w-full rounded-lg border border-slate-600 bg-[#04141E] px-2.5 py-1.5 text-sm text-slate-100 min-h-[70px]'}
                            value={draftMensaje}
                            onChange={(e) => setDraftMensaje(e.target.value)}
                        />
                    </label>
                    <div>
                        <p className={`mb-2 text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                            Guion del agente por fases
                        </p>
                        <PlantillaEditor plantillas={draftPlantillas} onChange={setDraftPlantillas} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className={btnGhost}
                            onClick={() => setEditing(false)}
                        >
                            <X size={13} /> Cancelar
                        </button>
                        <button type="button" className={btnPrimary} disabled={savingTpl} onClick={saveEdit}>
                            {savingTpl ? 'Guardando…' : 'Guardar plantilla'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {campana.mensaje_plantilla ? (
                        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
                            isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-slate-700 bg-[#04141E]/50 text-slate-200'
                        }`}>
                            {campana.mensaje_plantilla}
                        </div>
                    ) : null}
                    <div className={`mb-4 rounded-lg border px-3 py-3 ${
                        isLight ? 'border-sky-200 bg-sky-50' : 'border-sky-800/40 bg-sky-950/20'
                    }`}>
                        <p className={`text-xs font-semibold ${isLight ? 'text-sky-900' : 'text-sky-200'}`}>
                            Flujo multi-paso
                        </p>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                            <label className={`text-xs ${muted}`}>
                                Asignar flujo
                                <select
                                    className={isLight
                                        ? 'ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm'
                                        : 'ml-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white'}
                                    value={selectedFlujoId}
                                    onChange={(e) => setSelectedFlujoId(e.target.value)}
                                >
                                    <option value="">— Seleccionar —</option>
                                    {flujos.map((f) => (
                                        <option key={f.id} value={f.id}>{f.nombre}</option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className={btnPrimary} disabled={!selectedFlujoId || flujoBusy} onClick={onAsignarFlujo}>
                                {flujoBusy ? 'Asignando…' : 'Asignar a campaña'}
                            </button>
                        </div>
                        {flujoProgress.length > 0 ? (
                            <ul className="mt-3 space-y-1 text-xs">
                                {flujoProgress.map((fp) => (
                                    <li key={fp.id} className={muted}>
                                        {fp.nombre || 'Sin nombre'} — paso {fp.paso_actual} · {fp.estado}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={`mt-2 text-xs ${muted}`}>Sin avance de flujo registrado.</p>
                        )}
                    </div>
                    <ul className="space-y-2">
                        {(campana.destinatarios || []).map((d) => {
                            const mensaje = d.mensaje || campana.mensaje_plantilla || '';
                            const wa = d.canal === 'whatsapp' ? waLink(d.contacto, mensaje) : '';
                            const inmail = d.canal === 'inmail' && typeof d.contacto === 'string' && d.contacto.startsWith('http')
                                ? d.contacto
                                : '';
                            return (
                                <li
                                    key={d.id}
                                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                        isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-[#04141E]/40'
                                    }`}
                                >
                                    <span className="min-w-0 flex-1 truncate font-medium">{d.nombre || 'Sin nombre'}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${
                                        d.canal === 'whatsapp'
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                            : 'border-sky-200 bg-sky-50 text-sky-800'
                                    }`}>
                                        {d.canal === 'whatsapp' ? 'WhatsApp' : 'InMail'}
                                    </span>
                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${ESTADO_DEST_BADGE[d.estado] || ESTADO_DEST_BADGE.pendiente}`}>
                                        {d.estado}
                                    </span>
                                    {wa ? (
                                        <a href={wa} target="_blank" rel="noreferrer" className={btnGhost}>
                                            <MessageCircle size={12} /> Abrir WhatsApp
                                        </a>
                                    ) : null}
                                    {inmail ? (
                                        <a href={inmail} target="_blank" rel="noreferrer" className={btnGhost}>
                                            <ExternalLink size={12} /> Abrir perfil
                                        </a>
                                    ) : null}
                                    {d.estado !== 'enviado' ? (
                                        <button type="button" className={btnGhost} onClick={() => marcar(d, 'enviado')}>
                                            Marcar enviado
                                        </button>
                                    ) : (
                                        <button type="button" className={btnGhost} onClick={() => marcar(d, 'pendiente')}>
                                            Marcar pendiente
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={`${btnGhost} text-red-500`}
                                        title="Eliminar de la campaña"
                                        onClick={() => setConfirmDelete(d)}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </GestionModalShell>
        {showAgregar ? (
            <AgregarDestinatariosModal
                token={token}
                excludeIds={(campana?.destinatarios || []).map((d) => d.candidato_id).filter(Boolean)}
                onClose={() => setShowAgregar(false)}
                onSubmit={onAgregar}
            />
        ) : null}
        {confirmDelete ? (
            <GestionModalShell
                open
                onClose={() => (deleting ? null : setConfirmDelete(null))}
                title="Eliminar destinatario"
                subtitle="Esta acción quita al contacto de la campaña"
                size="sm"
            >
                <div className="space-y-4">
                    <p className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                        ¿Eliminar a <span className="font-semibold">{confirmDelete.nombre || 'este destinatario'}</span> de la campaña?
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className={btnGhost}
                            disabled={deleting}
                            onClick={() => setConfirmDelete(null)}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className={isLight
                                ? 'inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50'
                                : 'inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50'}
                            disabled={deleting}
                            onClick={confirmarEliminar}
                        >
                            <Trash2 size={13} /> {deleting ? 'Eliminando…' : 'Eliminar'}
                        </button>
                    </div>
                </div>
            </GestionModalShell>
        ) : null}
        </>
    );
}

export default function AtraccionCampanasPage({ token }) {
    const { isLight } = useModuleTheme();
    const [searchParams, setSearchParams] = useSearchParams();
    const card = isLight
        ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
        : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';

    const [campanas, setCampanas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openId, setOpenId] = useState(searchParams.get('campana') || null);
    const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });

    async function reload() {
        setLoading(true);
        setError('');
        try {
            const rows = await fetchCampanas(token);
            setCampanas(rows);
        } catch (e) {
            setError(e.message || 'Error al cargar campañas');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

    function closeModal() {
        setOpenId(null);
        const next = new URLSearchParams(searchParams);
        next.delete('campana');
        setSearchParams(next, { replace: true });
    }

    function toggleSort(key) {
        setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
    }

    const sortedRows = useMemo(() => {
        const arr = [...campanas];
        const { key, dir } = sort;
        arr.sort((a, b) => {
            const va = a[key] ?? '';
            const vb = b[key] ?? '';
            if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va;
            const sa = String(va).toLowerCase();
            const sb = String(vb).toLowerCase();
            if (sa < sb) return dir === 'asc' ? -1 : 1;
            if (sa > sb) return dir === 'asc' ? 1 : -1;
            return 0;
        });
        return arr;
    }, [campanas, sort]);

    const columns = useMemo(() => [
        { key: 'nombre', label: 'Campaña', render: (r) => r.nombre || '—' },
        {
            key: 'estado',
            label: 'Estado',
            cellClassName: 'px-4 py-3 whitespace-nowrap',
            render: (r) => (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ESTADO_CAMPANA_BADGE[r.estado] || ESTADO_CAMPANA_BADGE.borrador}`}>
                    {r.estado}
                </span>
            )
        },
        {
            key: 'enviados',
            label: 'Progreso',
            cellClassName: 'px-4 py-3 whitespace-nowrap',
            render: (r) => `${r.enviados || 0} / ${r.total_destinatarios || 0}`
        }
    ], []);

    return (
        <main className={ATRACCION_PAGE_MAIN}>
            <div className={card}>
                <h2 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Campañas de contacto
                </h2>
                <p className={`mt-1 text-sm ${muted}`}>
                    Crea campañas desde la Base de captura seleccionando candidatos. WhatsApp para quienes tienen teléfono (El Empleo) e InMail para LinkedIn.
                </p>
                {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
                <div className="mt-4">
                    {loading && campanas.length === 0 ? (
                        <p className={`text-sm ${muted}`}>Cargando…</p>
                    ) : (
                        <SortableGestionDataTable
                            columns={columns}
                            rows={sortedRows}
                            isLight={isLight}
                            emptyText="Aún no hay campañas. Selecciona candidatos en Base de captura para crear una."
                            onRowClick={(row) => setOpenId(row.id)}
                            sort={sort}
                            onSort={toggleSort}
                            sortableKeys={['nombre', 'estado', 'enviados']}
                            rowKey={(row) => row.id}
                        />
                    )}
                </div>
            </div>

            {openId ? (
                <CampanaDetalleModal
                    token={token}
                    campanaId={openId}
                    onClose={closeModal}
                    onChanged={reload}
                />
            ) : null}

            <FlujosSection token={token} isLight={isLight} muted={muted} />
        </main>
    );
}
