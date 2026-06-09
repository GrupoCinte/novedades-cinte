import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, Trash2, X } from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import { authHeaders, fetchMallasTurnos, putMallasTurnos, fetchMallaAprobacionStatus, postMallaAprobar, fetchNocturnoConfig, putNocturnoConfig } from './mallasTurnosApi.js';
import {
    DEFAULT_NOCTURNO_CONFIG,
    clampNocturnoHhMm,
    formatCantidadHoras,
    nocturnoFranjaFromConfig,
    previewNocturnoHours
} from './mallaNocturnoConfig.js';
import { NocturnoTimePicker } from './NocturnoTimePicker.jsx';

export const FRANJAS_MALLAS = [
    { id: '06_14', label: '06:00–14:00' },
    { id: '14_22', label: '14:00–22:00' },
    { id: '22_06', label: '22:00–06:00' }
];

function franjasForVariant(variant, nocturnoConfig) {
    return variant === 'nocturnos' ? nocturnoFranjaFromConfig(nocturnoConfig) : FRANJAS_MALLAS;
}

function variantDisplayLabel(variant) {
    return variant === 'nocturnos' ? 'Turnos nocturnos' : 'Mallas de turnos';
}

function formatAprobacionFecha(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('es-CO', {
            dateStyle: 'short',
            timeStyle: 'short'
        });
    } catch {
        return String(iso);
    }
}

function emptyFranjasRecord(franjas) {
    const o = {};
    for (const { id } of franjas) o[id] = [];
    return o;
}

const MESES = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
];

function pad2(n) {
    return String(n).padStart(2, '0');
}

function ymdLocal(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function hashHueForCedula(cedula) {
    const s = String(cedula || '');
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
}

function hslForCedula(cedula, isLight) {
    const hue = hashHueForCedula(cedula);
    if (isLight) return `hsl(${hue} 62% 88%)`;
    return `hsl(${hue} 45% 28%)`;
}

function textColorForCedula(cedula, isLight) {
    const hue = hashHueForCedula(cedula);
    if (isLight) return `hsl(${hue} 70% 22%)`;
    return `hsl(${hue} 85% 92%)`;
}

function displayNombreColaborador(row) {
    return String(row?.nombre || '').trim() || '—';
}

function displayNocturnoHorarioPerson(p) {
    if (p?.horaInicio && p?.horaFin) return `${p.horaInicio}–${p.horaFin}`;
    return null;
}

function nocturnoHorarioPatchFromDraft(isNocturnos, draft, previewHours) {
    if (!isNocturnos || previewHours == null) return {};
    return { horaInicio: draft.horaInicio, horaFin: draft.horaFin };
}

function buildMeshMap(items, franjas) {
    const ids = new Set(franjas.map((f) => f.id));
    const map = {};
    for (const it of items || []) {
        const franjaId = it.franja;
        if (!ids.has(franjaId)) continue;
        const ymd = it.fecha;
        if (!map[ymd]) map[ymd] = emptyFranjasRecord(franjas);
        const arr = map[ymd][franjaId];
        if (Array.isArray(arr)) {
            arr.push({
                cedula: String(it.cedula),
                nombre: String(it.nombre || ''),
                codigo: it.codigo != null ? String(it.codigo) : null,
                orden: Number(it.orden) || 0,
                horaInicio: it.horaInicio ? String(it.horaInicio) : null,
                horaFin: it.horaFin ? String(it.horaFin) : null
            });
        }
    }
    for (const ymd of Object.keys(map)) {
        for (const { id } of franjas) {
            map[ymd][id].sort((a, b) => a.orden - b.orden || a.cedula.localeCompare(b.cedula));
        }
    }
    return map;
}

function dayHasAssignments(meshByYmd, ymd, franjas) {
    const row = meshByYmd[ymd];
    if (!row) return false;
    return franjas.some((f) => (row[f.id] || []).length > 0);
}

/** Datos de visualización para una cédula en el modal (malla actual o catálogo). */
function personForModalCedula(meshRow, franjaId, cedula, colaboradores) {
    const ced = String(cedula);
    const fromMesh = (meshRow[franjaId] || []).find((p) => String(p.cedula) === ced);
    if (fromMesh) return fromMesh;
    const c = colaboradores.find((x) => String(x.cedula) === ced);
    return {
        cedula: ced,
        nombre: c?.nombre ? String(c.nombre) : `CC ${ced}`,
        codigo: c?.codigo != null ? String(c.codigo) : null
    };
}

export default function MallasTurnosPage({ token, variant = 'mallas', userRole = '' }) {
    const mt = useModuleTheme();
    const {
        field,
        labelMuted,
        tableSurface,
        outlineBtn,
        compactBtn,
        headingAccent,
        borderSubtle,
        isLight,
        scrim,
        mainCanvas
    } = mt;

    const isNocturnos = variant === 'nocturnos';

    const [nocturnoConfig, setNocturnoConfig] = useState(DEFAULT_NOCTURNO_CONFIG);
    const [nocturnoDraft, setNocturnoDraft] = useState({
        horaInicio: DEFAULT_NOCTURNO_CONFIG.horaInicio,
        horaFin: DEFAULT_NOCTURNO_CONFIG.horaFin
    });
    const [loadingNocturnoConfig, setLoadingNocturnoConfig] = useState(false);
    const [savingNocturnoHorario, setSavingNocturnoHorario] = useState(false);

    const franjas = useMemo(
        () => franjasForVariant(variant, nocturnoConfig),
        [variant, nocturnoConfig]
    );

    const [clienteSeleccionado, setClienteSeleccionado] = useState('');
    const [clientesOptions, setClientesOptions] = useState([]);
    const [loadingClientes, setLoadingClientes] = useState(false);
    const [colaboradores, setColaboradores] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [meshByYmd, setMeshByYmd] = useState({});
    const [selected, setSelected] = useState(() => new Set());
    const [draft, setDraft] = useState(() => emptyFranjasRecord(franjasForVariant('mallas')));
    const [dayModalYmd, setDayModalYmd] = useState(null);
    /** Copia editable de cédulas por franja mientras el modal del día está abierto. */
    const [modalCedulasByFranja, setModalCedulasByFranja] = useState(null);
    const [loadingMesh, setLoadingMesh] = useState(false);
    const [loadingCo, setLoadingCo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [festivosSet, setFestivosSet] = useState(() => new Set());
    const [asignacionOpen, setAsignacionOpen] = useState(false);
    const [aprobacionStatus, setAprobacionStatus] = useState(null);
    const [aprobacionModalOpen, setAprobacionModalOpen] = useState(false);
    const [aprobando, setAprobando] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const canAprobarMalla =
        userRole === 'super_admin' || userRole === 'cac' || userRole === '';
    const hasCliente = Boolean(String(clienteSeleccionado || '').trim());

    const nocturnoPreviewHours = useMemo(() => {
        if (!isNocturnos) return null;
        return previewNocturnoHours(nocturnoDraft.horaInicio, nocturnoDraft.horaFin);
    }, [isNocturnos, nocturnoDraft.horaInicio, nocturnoDraft.horaFin]);

    const nocturnoHorarioPatch = useMemo(
        () => nocturnoHorarioPatchFromDraft(isNocturnos, nocturnoDraft, nocturnoPreviewHours),
        [isNocturnos, nocturnoDraft, nocturnoPreviewHours]
    );

    const monthLabel = useMemo(() => {
        return `${MESES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    }, [currentMonth]);

    const { desde, hasta } = useMemo(() => {
        const y = currentMonth.getFullYear();
        const m = currentMonth.getMonth();
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        return { desde: ymdLocal(first), hasta: ymdLocal(last) };
    }, [currentMonth]);

    useEffect(() => {
        fetch('/api/festivos')
            .then((r) => r.json())
            .then((data) => {
                if (data.ok && Array.isArray(data.festivos)) {
                    setFestivosSet(new Set(data.festivos));
                }
            })
            .catch(() => {});
    }, []);

    const loadClientesCatalogo = useCallback(async () => {
        setLoadingClientes(true);
        try {
            const u = new URLSearchParams();
            u.set('activo', 'true');
            u.set('limit', '2000');
            u.set('offset', '0');
            const res = await fetch(`/api/directorio/clientes-resumen?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setClientesOptions(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            setError(e.message || 'No se pudo cargar el catálogo de clientes');
        } finally {
            setLoadingClientes(false);
        }
    }, [token]);

    const loadNocturnoConfig = useCallback(async () => {
        if (!isNocturnos) return;
        setLoadingNocturnoConfig(true);
        try {
            const data = await fetchNocturnoConfig(token);
            const next = {
                horaInicio: data.horaInicio,
                horaFin: data.horaFin,
                cantidadHoras: data.cantidadHoras,
                label: data.label
            };
            setNocturnoConfig(next);
            setNocturnoDraft({
                horaInicio: clampNocturnoHhMm(next.horaInicio, DEFAULT_NOCTURNO_CONFIG.horaInicio),
                horaFin: clampNocturnoHhMm(next.horaFin, DEFAULT_NOCTURNO_CONFIG.horaFin)
            });
        } catch (e) {
            setError(e.message || 'No se pudo cargar el horario nocturno');
        } finally {
            setLoadingNocturnoConfig(false);
        }
    }, [isNocturnos, token]);

    const saveNocturnoHorario = async () => {
        if (nocturnoPreviewHours == null) {
            setError('Horario nocturno inválido');
            return;
        }
        setSavingNocturnoHorario(true);
        setError('');
        try {
            const data = await putNocturnoConfig(token, {
                horaInicio: nocturnoDraft.horaInicio,
                horaFin: nocturnoDraft.horaFin
            });
            const next = {
                horaInicio: data.horaInicio,
                horaFin: data.horaFin,
                cantidadHoras: data.cantidadHoras,
                label: data.label
            };
            setNocturnoConfig(next);
            setNocturnoDraft({
                horaInicio: clampNocturnoHhMm(next.horaInicio, DEFAULT_NOCTURNO_CONFIG.horaInicio),
                horaFin: clampNocturnoHhMm(next.horaFin, DEFAULT_NOCTURNO_CONFIG.horaFin)
            });
            setSuccessMsg('Horario nocturno guardado.');
        } catch (e) {
            setError(e.message || 'No se pudo guardar el horario nocturno');
        } finally {
            setSavingNocturnoHorario(false);
        }
    };

    const loadColaboradores = useCallback(async () => {
        const cli = String(clienteSeleccionado || '').trim();
        if (!cli) {
            setColaboradores([]);
            return;
        }
        setLoadingCo(true);
        setError('');
        try {
            const u = new URLSearchParams();
            u.set('activo', 'true');
            u.set('cliente', cli);
            u.set('limit', '200');
            u.set('offset', '0');
            u.set('sort', 'nombre');
            u.set('dir', 'asc');
            const res = await fetch(`/api/directorio/colaboradores?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setColaboradores(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            setError(e.message || 'No se pudieron cargar colaboradores');
        } finally {
            setLoadingCo(false);
        }
    }, [token, clienteSeleccionado]);

    const loadMesh = useCallback(async () => {
        const cli = String(clienteSeleccionado || '').trim();
        if (!cli) {
            setMeshByYmd({});
            return;
        }
        setLoadingMesh(true);
        setError('');
        try {
            const data = await fetchMallasTurnos(token, cli, desde, hasta);
            setMeshByYmd(buildMeshMap(data.items, franjas));
        } catch (e) {
            setError(e.message || 'No se pudo cargar la malla');
        } finally {
            setLoadingMesh(false);
        }
    }, [token, clienteSeleccionado, desde, hasta, franjas]);

    const loadAprobacionStatus = useCallback(async () => {
        const cli = String(clienteSeleccionado || '').trim();
        if (!cli) {
            setAprobacionStatus(null);
            return;
        }
        try {
            const data = await fetchMallaAprobacionStatus(token, {
                cliente: cli,
                anio: currentMonth.getFullYear(),
                mes: currentMonth.getMonth() + 1,
                variant
            });
            setAprobacionStatus(data);
        } catch (e) {
            setAprobacionStatus(null);
            setError(e.message || 'No se pudo consultar el estado de aprobación');
        }
    }, [token, clienteSeleccionado, currentMonth, variant]);

    const confirmarAprobacion = async () => {
        const cli = String(clienteSeleccionado || '').trim();
        if (!cli || aprobando) return;
        setAprobando(true);
        setError('');
        setSuccessMsg('');
        try {
            const data = await postMallaAprobar(token, {
                cliente: cli,
                anio: currentMonth.getFullYear(),
                mes: currentMonth.getMonth() + 1,
                variant
            });
            setAprobacionModalOpen(false);
            const n = Number(data.novedadesGeneradas) || 0;
            if (data.reaprobacion) {
                setSuccessMsg(
                    n > 0
                        ? `${n} Horas Extra adicionales generadas por modificación a la aprobación original.`
                        : 'No había asignaciones nuevas pendientes de cargar en Novedades.'
                );
            } else {
                setSuccessMsg(`${n} Horas Extra generadas y aprobadas en Novedades.`);
            }
            await loadAprobacionStatus();
        } catch (e) {
            setError(e.message || 'No se pudo aprobar la malla');
        } finally {
            setAprobando(false);
        }
    };

    useEffect(() => {
        loadClientesCatalogo();
    }, [loadClientesCatalogo]);

    useEffect(() => {
        loadNocturnoConfig();
    }, [loadNocturnoConfig]);

    useEffect(() => {
        loadColaboradores();
    }, [loadColaboradores]);

    useEffect(() => {
        loadMesh();
    }, [loadMesh]);

    useEffect(() => {
        loadAprobacionStatus();
    }, [loadAprobacionStatus]);

    useEffect(() => {
        setDraft(emptyFranjasRecord(franjas));
        setSelected(new Set());
    }, [clienteSeleccionado, franjas]);

    useEffect(() => {
        if (hasCliente) setAsignacionOpen(true);
    }, [clienteSeleccionado, hasCliente]);

    useEffect(() => {
        if (!dayModalYmd) {
            setModalCedulasByFranja(null);
            return;
        }
        const row = meshByYmd[dayModalYmd] || emptyFranjasRecord(franjas);
        const next = {};
        for (const { id } of franjas) {
            next[id] = (row[id] || []).map((p) => String(p.cedula));
        }
        setModalCedulasByFranja(next);
    }, [dayModalYmd, meshByYmd, franjas]);

    const calendarCells = useMemo(() => {
        const y = currentMonth.getFullYear();
        const m = currentMonth.getMonth();
        const first = new Date(y, m, 1);
        const lead = first.getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < lead; i += 1) cells.push(null);
        for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(y, m, d));
        return cells;
    }, [currentMonth]);

    const todayYmd = useMemo(() => ymdLocal(new Date()), []);

    const clearSelection = () => setSelected(new Set());

    const toggleDaySelection = (ymd) => {
        setSelected((prev) => {
            const n = new Set(prev);
            if (n.has(ymd)) n.delete(ymd);
            else n.add(ymd);
            return n;
        });
    };

    const runSave = async (patches, { clearSelectionAfter = true } = {}) => {
        const cli = String(clienteSeleccionado || '').trim();
        if (!cli) return false;
        setSaving(true);
        setError('');
        try {
            await putMallasTurnos(token, { cliente: cli, patches });
            await loadMesh();
            if (clearSelectionAfter) clearSelection();
            return true;
        } catch (e) {
            setError(e.message || 'Error al guardar');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const onApplyToSelected = async () => {
        if (!clienteSeleccionado.trim()) {
            setError('Selecciona un cliente');
            return;
        }
        if (isNocturnos && nocturnoPreviewHours == null) {
            setError('Define un horario nocturno válido antes de asignar');
            return;
        }
        if (selected.size === 0) {
            setError(
                'Selecciona al menos un día (clic en día vacío, Ctrl+clic o checkbox en día con malla)'
            );
            return;
        }
        const patches = [];
        for (const ymd of selected) {
            for (const { id } of franjas) {
                patches.push({
                    fecha: ymd,
                    franja: id,
                    cedulas: [...(draft[id] || [])],
                    ...nocturnoHorarioPatch
                });
            }
        }
        await runSave(patches);
    };

    const removeModalCedula = (franjaId, cedula) => {
        setModalCedulasByFranja((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                [franjaId]: (prev[franjaId] || []).filter((c) => c !== cedula)
            };
        });
    };

    const addCedulaToModal = (franjaId, cedula) => {
        setModalCedulasByFranja((prev) => {
            if (!prev) return prev;
            const cur = [...(prev[franjaId] || [])];
            if (cur.includes(cedula) || cur.length >= 10) return prev;
            return { ...prev, [franjaId]: [...cur, cedula] };
        });
    };

    const filteredColaboradoresForModalFranja = (franjaId) => {
        const chosen = new Set(modalCedulasByFranja?.[franjaId] || []);
        return colaboradores.filter((c) => !chosen.has(c.cedula));
    };

    const clearModalFranja = (franjaId) => {
        setModalCedulasByFranja((prev) => (prev ? { ...prev, [franjaId]: [] } : prev));
    };

    const modalHasChanges = useMemo(() => {
        if (!dayModalYmd || !modalCedulasByFranja) return false;
        const row = meshByYmd[dayModalYmd] || emptyFranjasRecord(franjas);
        for (const { id } of franjas) {
            const was = (row[id] || []).map((p) => String(p.cedula));
            const cur = modalCedulasByFranja[id] || [];
            if (was.length !== cur.length) return true;
            for (let i = 0; i < was.length; i += 1) {
                if (was[i] !== cur[i]) return true;
            }
        }
        return false;
    }, [dayModalYmd, modalCedulasByFranja, meshByYmd, franjas]);

    const onSaveModalDay = async () => {
        const ymd = dayModalYmd;
        if (!ymd || !modalCedulasByFranja) return;
        if (isNocturnos && nocturnoPreviewHours == null) {
            setError('Define un horario nocturno válido antes de guardar el día');
            return;
        }
        if (!modalHasChanges) {
            setDayModalYmd(null);
            return;
        }
        const patches = franjas.map(({ id }) => ({
            fecha: ymd,
            franja: id,
            cedulas: [...(modalCedulasByFranja[id] || [])],
            ...nocturnoHorarioPatch
        }));
        const ok = await runSave(patches, { clearSelectionAfter: false });
        if (ok) setDayModalYmd(null);
    };

    const addCedulaToDraft = (franjaId, cedula) => {
        setDraft((d) => {
            const cur = [...(d[franjaId] || [])];
            if (cur.includes(cedula) || cur.length >= 10) return d;
            return { ...d, [franjaId]: [...cur, cedula] };
        });
    };

    const removeCedulaFromDraft = (franjaId, cedula) => {
        setDraft((d) => ({
            ...d,
            [franjaId]: (d[franjaId] || []).filter((c) => c !== cedula)
        }));
    };

    const filteredColaboradoresForFranja = (franjaId) => {
        const chosen = new Set(draft[franjaId] || []);
        return colaboradores.filter((c) => !chosen.has(c.cedula));
    };

    const weekHeader = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

    const modalRow = dayModalYmd ? meshByYmd[dayModalYmd] || emptyFranjasRecord(franjas) : emptyFranjasRecord(franjas);
    const modalInSelected = dayModalYmd ? selected.has(dayModalYmd) : false;
    const calendarRowCount = useMemo(() => Math.ceil(calendarCells.length / 7), [calendarCells]);
    const cellMinClass = isNocturnos ? 'min-h-[6.5rem]' : 'min-h-[4.5rem]';
    const panelDisabled = !hasCliente;
    const mallaYaAprobada = Boolean(aprobacionStatus?.aprobada);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex w-full min-w-0 basis-full items-center gap-2 lg:max-w-sm lg:flex-1">
                    <label htmlFor="mallas-cliente-select" className={`shrink-0 text-xs font-semibold ${headingAccent}`}>
                        Cliente
                    </label>
                    <select
                        id="mallas-cliente-select"
                        className={`min-w-0 flex-1 text-sm ${field}`}
                        value={clienteSeleccionado}
                        title={clienteSeleccionado || undefined}
                        onChange={(e) => setClienteSeleccionado(e.target.value)}
                        disabled={loadingClientes}
                    >
                        <option value="">— Elija cliente —</option>
                        {clientesOptions.map((row) => (
                            <option key={row.cliente} value={row.cliente}>
                                {row.cliente}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {canAprobarMalla ? (
                        <>
                            {hasCliente && mallaYaAprobada ? (
                                <span
                                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                        isLight
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                            : 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
                                    }`}
                                    title={
                                        aprobacionStatus.aprobadoPorEmail
                                            ? `Aprobada por ${aprobacionStatus.aprobadoPorEmail}`
                                            : undefined
                                    }
                                >
                                    Aprobada el {formatAprobacionFecha(aprobacionStatus.aprobadoEn)}
                                </span>
                            ) : null}
                            <button
                                type="button"
                                className={dash.btnPrimaryCinte}
                                disabled={!hasCliente}
                                onClick={() => setAprobacionModalOpen(true)}
                            >
                                Aprobación
                            </button>
                        </>
                    ) : null}
                    <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${outlineBtn} ${
                            asignacionOpen ? 'border-[#2F7BB8]/50 bg-[#2F7BB8]/10' : ''
                        }`}
                        aria-expanded={asignacionOpen}
                        aria-controls="mallas-asignacion-sidebar"
                        onClick={() => setAsignacionOpen((o) => !o)}
                    >
                        {asignacionOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                        <span className="hidden sm:inline">Asignación masiva</span>
                        {selected.size > 0 ? (
                            <span className="rounded-full bg-[#2F7BB8] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {selected.size}
                            </span>
                        ) : null}
                    </button>
                    <button
                        type="button"
                        className={`rounded-lg p-2 ${outlineBtn}`}
                        title="Mes anterior"
                        onClick={() =>
                            setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                        }
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className={`min-w-[10rem] text-center text-sm font-semibold ${headingAccent}`}>
                        {monthLabel}
                    </span>
                    <button
                        type="button"
                        className={`rounded-lg p-2 ${outlineBtn}`}
                        title="Mes siguiente"
                        onClick={() =>
                            setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                        }
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {error ? (
                <div className="shrink-0 rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                    {error}
                </div>
            ) : null}
            {successMsg ? (
                <div className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                    {successMsg}
                </div>
            ) : null}

            <div className={`${dash.cardFlex} flex min-h-0 flex-1 flex-row overflow-hidden`}>
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
                        {!hasCliente ? (
                            <div
                                className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center ${scrim} backdrop-blur-[1px]`}
                                aria-hidden
                            >
                                <p className={`max-w-xs rounded-lg border ${borderSubtle} ${mainCanvas} px-4 py-3 text-center text-sm shadow-lg ${labelMuted}`}>
                                    Selecciona un cliente para ver la malla y asignar colaboradores.
                                </p>
                            </div>
                        ) : null}
                        <div className="flex shrink-0 items-center justify-between px-3 py-2">
                            <span className={`text-xs ${labelMuted}`}>
                                {loadingMesh
                                    ? 'Cargando malla…'
                                    : hasCliente
                                      ? `${clienteSeleccionado} · ${desde} → ${hasta}`
                                      : `${monthLabel} · vista previa`}
                            </span>
                        </div>
                        <div className="grid shrink-0 grid-cols-7 gap-1 px-3 pb-1 text-center text-[10px] uppercase tracking-wide">
                            {weekHeader.map((w, i) => (
                                <div
                                    key={i}
                                    className={`py-1 font-semibold ${i === 0 ? 'text-red-500' : labelMuted}`}
                                >
                                    {w}
                                </div>
                            ))}
                        </div>
                        <div
                            className="grid min-h-0 flex-1 grid-cols-7 gap-1 overflow-hidden px-3 pb-3"
                            style={{ gridTemplateRows: `repeat(${calendarRowCount}, minmax(0, 1fr))` }}
                        >
                            {calendarCells.map((cell, idx) => {
                                if (!cell) {
                                    return <div key={`e-${idx}`} className={cellMinClass} />;
                                }
                                const ymd = ymdLocal(cell);
                                const isSel = selected.has(ymd);
                                const isToday = ymd === todayYmd;
                                const dow = cell.getDay();
                                const isFestivo = festivosSet.has(ymd);
                                const row = meshByYmd[ymd] || emptyFranjasRecord(franjas);
                                const hasData = dayHasAssignments(meshByYmd, ymd, franjas);
                                return (
                                    <button
                                        key={ymd}
                                        type="button"
                                        disabled={panelDisabled}
                                        onClick={(e) => {
                                            if (!hasCliente) return;
                                            if (e.ctrlKey || e.metaKey) {
                                                toggleDaySelection(ymd);
                                                return;
                                            }
                                            if (hasData) {
                                                setDayModalYmd(ymd);
                                            } else {
                                                toggleDaySelection(ymd);
                                            }
                                        }}
                                        className={`${cellMinClass} relative flex flex-col gap-0.5 overflow-hidden rounded-lg border-2 p-1 text-left transition-colors disabled:cursor-default disabled:opacity-90 ${
                                            isSel
                                                ? 'border-[#2F7BB8] bg-[#2F7BB8]/15 ring-inset ring-1 ring-[#2F7BB8]/40'
                                                : `border-transparent hover:border-[#2F7BB8]/35 ${tableSurface}`
                                        } ${!isSel && isToday ? 'ring-inset ring-1 ring-amber-400/50' : ''} ${
                                            !isSel && isFestivo
                                                ? 'bg-violet-950/20 ring-inset ring-1 ring-violet-500/45'
                                                : ''
                                        }`}
                                    >
                                        {hasData ? (
                                            <input
                                                type="checkbox"
                                                checked={isSel}
                                                className="absolute right-1 top-1 z-[1] h-3 w-3 shrink-0 cursor-pointer"
                                                aria-label={`Incluir ${ymd} en asignación masiva`}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={() => toggleDaySelection(ymd)}
                                            />
                                        ) : null}
                                        <span
                                            className={`text-[11px] font-bold leading-none ${
                                                dow === 0 ? 'text-red-500' : headingAccent
                                            }`}
                                        >
                                            {cell.getDate()}
                                            {isFestivo ? (
                                                <span className="ml-0.5 text-[9px] font-semibold text-violet-400">
                                                    F
                                                </span>
                                            ) : null}
                                        </span>
                                        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                                            {franjas.map((f) => {
                                                const people = row[f.id] || [];
                                                if (people.length === 0) {
                                                    return (
                                                        <div
                                                            key={f.id}
                                                            className={`truncate rounded px-0.5 py-0.5 text-[9px] ${labelMuted} opacity-60`}
                                                        >
                                                            {isNocturnos ? '—' : `${f.label.slice(0, 5)} —`}
                                                        </div>
                                                    );
                                                }
                                                const first = people[0];
                                                const bg = hslForCedula(first.cedula, isLight);
                                                const fg = textColorForCedula(first.cedula, isLight);
                                                const extra = people.length > 1 ? ` +${people.length - 1}` : '';
                                                const label = displayNombreColaborador(first);
                                                const horarioTip = isNocturnos
                                                    ? people
                                                          .map((p) => {
                                                              const h = displayNocturnoHorarioPerson(p);
                                                              return h
                                                                  ? `${p.nombre} (${h})`
                                                                  : p.nombre;
                                                          })
                                                          .join(', ')
                                                    : people.map((p) => p.nombre).join(', ');
                                                return (
                                                    <div
                                                        key={f.id}
                                                        className="truncate rounded px-0.5 py-0.5 text-[9px] font-semibold"
                                                        style={{ backgroundColor: bg, color: fg }}
                                                        title={horarioTip}
                                                    >
                                                        {label}
                                                        {extra}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                </div>

                {asignacionOpen ? (
                    <aside
                        id="mallas-asignacion-sidebar"
                        className={`flex h-full min-h-0 w-[min(100%,20rem)] shrink-0 flex-col overflow-hidden border-l md:w-80 xl:w-[22rem] ${borderSubtle} ${tableSurface}`}
                    >
                        <div className={`flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3 ${borderSubtle}`}>
                            <h3 className={`text-sm font-semibold ${headingAccent}`}>Asignación masiva</h3>
                            <button
                                type="button"
                                className={`rounded-lg p-1.5 ${outlineBtn}`}
                                aria-label="Ocultar panel"
                                onClick={() => setAsignacionOpen(false)}
                            >
                                <PanelRightClose size={18} />
                            </button>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
                            {isNocturnos ? (
                                <div className={`space-y-3 border-b pb-3 mb-1 ${borderSubtle}`}>
                                    <p className={`text-xs font-semibold ${headingAccent}`}>
                                        Horario del turno
                                    </p>
                                    <p id="nocturno-horario-hint" className={`text-xs ${labelMuted}`}>
                                        Ajusta el horario, asigna colaboradores y guarda la malla. Puedes
                                        cambiar el horario y volver a asignar cuantas veces necesites; cada
                                        guardado conserva el horario vigente en ese momento.
                                    </p>
                                    <div>
                                        <label htmlFor="nocturno-hora-inicio" className={`block text-xs ${labelMuted} mb-1`}>
                                            Hora inicio
                                        </label>
                                        <NocturnoTimePicker
                                            id="nocturno-hora-inicio"
                                            field="inicio"
                                            value={nocturnoDraft.horaInicio}
                                            excludeTime={nocturnoDraft.horaFin}
                                            onChange={(horaInicio) =>
                                                setNocturnoDraft((d) => ({ ...d, horaInicio }))
                                            }
                                            disabled={loadingNocturnoConfig || savingNocturnoHorario}
                                            fieldClassName={field}
                                            ariaDescribedBy="nocturno-horario-hint"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="nocturno-hora-fin" className={`block text-xs ${labelMuted} mb-1`}>
                                            Hora fin
                                        </label>
                                        <NocturnoTimePicker
                                            id="nocturno-hora-fin"
                                            field="fin"
                                            value={nocturnoDraft.horaFin}
                                            excludeTime={nocturnoDraft.horaInicio}
                                            onChange={(horaFin) =>
                                                setNocturnoDraft((d) => ({ ...d, horaFin }))
                                            }
                                            disabled={loadingNocturnoConfig || savingNocturnoHorario}
                                            fieldClassName={field}
                                            ariaDescribedBy="nocturno-horario-hint"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="nocturno-cantidad-horas" className={`block text-xs ${labelMuted} mb-1`}>
                                            Cantidad de horas
                                        </label>
                                        <input
                                            id="nocturno-cantidad-horas"
                                            type="text"
                                            readOnly
                                            disabled
                                            className={`w-full text-sm ${field} opacity-90`}
                                            value={formatCantidadHoras(nocturnoPreviewHours)}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className={`w-full ${dash.btnPrimaryCinte} disabled:opacity-50`}
                                        disabled={
                                            loadingNocturnoConfig ||
                                            savingNocturnoHorario ||
                                            nocturnoPreviewHours == null
                                        }
                                        onClick={saveNocturnoHorario}
                                    >
                                        {savingNocturnoHorario ? 'Guardando…' : 'Guardar plantilla de horario'}
                                    </button>
                                    {nocturnoPreviewHours != null ? (
                                        <p className={`text-xs ${labelMuted}`}>
                                            Plantilla actual:{' '}
                                            <span className={headingAccent}>
                                                {nocturnoDraft.horaInicio}–{nocturnoDraft.horaFin} (
                                                {formatCantidadHoras(nocturnoPreviewHours)})
                                            </span>
                                        </p>
                                    ) : null}
                                    {nocturnoConfig.horaInicio !== nocturnoDraft.horaInicio ||
                                    nocturnoConfig.horaFin !== nocturnoDraft.horaFin ? (
                                        <p className={`text-xs ${labelMuted}`}>
                                            Última plantilla guardada:{' '}
                                            <span className={headingAccent}>{nocturnoConfig.label}</span>
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                            <p className={`text-xs ${labelMuted}`}>
                                Días en masivo: <strong className={headingAccent}>{selected.size}</strong>
                            </p>
                            {franjas.map((f) => (
                                <div key={f.id} className="space-y-1">
                                    <label className={`block text-xs font-semibold ${headingAccent}`}>
                                        {f.label}
                                    </label>
                                    <div className="flex min-h-[1.25rem] flex-wrap gap-1">
                                        {(draft[f.id] || []).map((ced) => {
                                            const row = colaboradores.find((c) => c.cedula === ced);
                                            return (
                                                <span
                                                    key={ced}
                                                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-700/80 px-2 py-0.5 text-[10px] text-slate-100"
                                                >
                                                    <span className="truncate">
                                                        {row ? displayNombreColaborador(row) : ced}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="shrink-0 rounded text-slate-400 hover:text-white"
                                                        aria-label="Quitar"
                                                        disabled={panelDisabled}
                                                        onClick={() => removeCedulaFromDraft(f.id, ced)}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    {(draft[f.id] || []).length < 10 ? (
                                        <select
                                            className={`w-full text-sm ${field}`}
                                            value=""
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v) {
                                                    addCedulaToDraft(f.id, v);
                                                    e.target.value = '';
                                                }
                                            }}
                                            disabled={panelDisabled || loadingCo}
                                        >
                                            <option value="">+ Añadir colaborador…</option>
                                            {filteredColaboradoresForFranja(f.id).map((c) => (
                                                <option key={c.cedula} value={c.cedula}>
                                                    {displayNombreColaborador(c)}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className={`text-[10px] ${labelMuted}`}>Máximo 10 personas por franja.</p>
                                    )}
                                </div>
                            ))}
                            <div className="flex flex-col gap-2 pt-1">
                                <button
                                    type="button"
                                    disabled={panelDisabled || saving || loadingCo || selected.size === 0}
                                    className={`w-full rounded-lg py-2 text-sm font-semibold bg-[#2F7BB8] text-white hover:bg-[#25649a] disabled:opacity-50 ${compactBtn}`}
                                    onClick={onApplyToSelected}
                                >
                                    {saving ? 'Guardando…' : 'Aplicar a días seleccionados'}
                                </button>
                                <button
                                    type="button"
                                    className={`w-full rounded-lg py-2 text-sm ${outlineBtn}`}
                                    disabled={panelDisabled || selected.size === 0}
                                    onClick={clearSelection}
                                >
                                    Limpiar días en masivo
                                </button>
                            </div>
                        </div>
                    </aside>
                ) : null}
            </div>

            {aprobacionModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        aria-label="Cerrar"
                        disabled={aprobando}
                        onClick={() => setAprobacionModalOpen(false)}
                    />
                    <div className="modal-glass-sheet font-body relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-heading font-bold text-[var(--text)]">Confirmar aprobación</h2>
                        </div>
                        <div className="space-y-4 p-5 text-sm text-[var(--text)]">
                            <p>
                                ¿Confirma que desea aprobar la malla de{' '}
                                <strong>{clienteSeleccionado}</strong> correspondiente al mes de{' '}
                                <strong>{monthLabel}</strong> ({variantDisplayLabel(variant)})?
                            </p>
                            <p className={`text-xs ${labelMuted}`}>
                                {mallaYaAprobada ? (
                                    <>
                                        Se cargarán en Novedades las Horas Extra de las asignaciones{' '}
                                        <strong className="text-[var(--text)]">nuevas o modificadas</strong> con una
                                        observación indicando que es una modificación a la aprobación original. Las
                                        asignaciones ya exportadas no se duplican.
                                    </>
                                ) : (
                                    <>
                                        Al aceptar, se cargarán en Novedades las Horas Extra de las franjas asignadas.{' '}
                                        <strong className="text-[var(--text)]">Este proceso no se puede revertir.</strong>
                                    </>
                                )}
                            </p>
                            {mallaYaAprobada ? (
                                <p
                                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                        isLight
                                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                                            : 'border-amber-500/40 bg-amber-950/40 text-amber-100'
                                    }`}
                                >
                                    Este mes ya fue aprobado el{' '}
                                    {formatAprobacionFecha(aprobacionStatus?.aprobadoEn)}. Como CAC o super admin puede
                                    volver a aprobar para exportar cambios posteriores a la malla.
                                </p>
                            ) : null}
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className={outlineBtn}
                                    disabled={aprobando}
                                    onClick={() => setAprobacionModalOpen(false)}
                                >
                                    Regresar
                                </button>
                                <button
                                    type="button"
                                    className={dash.btnPrimaryCinte}
                                    disabled={aprobando || !hasCliente}
                                    onClick={confirmarAprobacion}
                                >
                                    {aprobando ? 'Procesando…' : mallaYaAprobada ? 'Aceptar modificación' : 'Aceptar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {dayModalYmd ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        aria-label="Cerrar"
                        disabled={saving}
                        onClick={() => setDayModalYmd(null)}
                    />
                    <div className="modal-glass-sheet font-body relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <div>
                                <h2 className="text-lg font-heading font-bold text-[var(--text)]">
                                    {dayModalYmd}
                                    {festivosSet.has(dayModalYmd) ? (
                                        <span className="ml-2 text-xs font-semibold text-violet-400">Festivo</span>
                                    ) : null}
                                </h2>
                                <p className={`text-xs ${labelMuted} mt-0.5`}>{clienteSeleccionado}</p>
                            </div>
                            <button
                                type="button"
                                className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] hover:bg-slate-800/50"
                                onClick={() => setDayModalYmd(null)}
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                            <label className={`flex items-center gap-2 text-sm mb-3 cursor-pointer ${labelMuted}`}>
                                <input
                                    type="checkbox"
                                    checked={modalInSelected}
                                    onChange={(e) => {
                                        const on = e.target.checked;
                                        setSelected((prev) => {
                                            const n = new Set(prev);
                                            if (on) n.add(dayModalYmd);
                                            else n.delete(dayModalYmd);
                                            return n;
                                        });
                                    }}
                                />
                                Incluir este día en asignación masiva
                            </label>
                            <div className="space-y-3">
                                {!modalCedulasByFranja ? (
                                    <p className={`text-sm ${labelMuted}`}>Cargando…</p>
                                ) : (
                                    franjas.map((f) => {
                                        const cedulas = modalCedulasByFranja[f.id] || [];
                                        return (
                                            <div key={f.id} className={`rounded-lg border ${borderSubtle} p-3`}>
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className={`text-xs font-semibold ${headingAccent}`}>{f.label}</p>
                                                    {cedulas.length > 0 ? (
                                                        <button
                                                            type="button"
                                                            disabled={saving}
                                                            className={`text-[11px] ${labelMuted} hover:underline disabled:opacity-50`}
                                                            onClick={() => clearModalFranja(f.id)}
                                                        >
                                                            Vaciar franja
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {cedulas.length === 0 ? (
                                                    <p className={`text-xs ${labelMuted} mb-1`}>Sin asignados</p>
                                                ) : (
                                                    <ul className="space-y-1.5 mb-1">
                                                        {cedulas.map((ced) => {
                                                            const p = personForModalCedula(
                                                                modalRow,
                                                                f.id,
                                                                ced,
                                                                colaboradores
                                                            );
                                                            return (
                                                                <li
                                                                    key={ced}
                                                                    className="flex items-center justify-between gap-2 text-sm"
                                                                >
                                                                    <span
                                                                        className={`min-w-0 flex-1 truncate font-semibold ${headingAccent}`}
                                                                    >
                                                                        {displayNombreColaborador(p)}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        disabled={saving}
                                                                        className={`shrink-0 rounded-lg p-1.5 ${outlineBtn} text-red-400 hover:text-red-300 disabled:opacity-50`}
                                                                        aria-label={`Quitar ${displayNombreColaborador(p)}`}
                                                                        title="Quitar de esta franja"
                                                                        onClick={() => removeModalCedula(f.id, ced)}
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                                {cedulas.length < 10 ? (
                                                    <select
                                                        className={`w-full text-sm ${field}`}
                                                        value=""
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            if (v) {
                                                                addCedulaToModal(f.id, v);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                        disabled={loadingCo || saving}
                                                    >
                                                        <option value="">+ Añadir colaborador…</option>
                                                        {filteredColaboradoresForModalFranja(f.id).map((c) => (
                                                            <option key={c.cedula} value={c.cedula}>
                                                                {displayNombreColaborador(c)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <p className={`text-[10px] ${labelMuted}`}>
                                                        Máximo 10 personas por franja.
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <div
                            className={`flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4 sm:flex-row sm:justify-end ${borderSubtle}`}
                        >
                            <button
                                type="button"
                                className={`w-full sm:w-auto py-2 px-4 rounded-lg text-sm ${outlineBtn}`}
                                disabled={saving}
                                onClick={() => setDayModalYmd(null)}
                            >
                                Cerrar
                            </button>
                            <button
                                type="button"
                                disabled={saving || !modalCedulasByFranja || !modalHasChanges}
                                className={`w-full sm:w-auto py-2 px-4 rounded-lg text-sm font-semibold bg-[#2F7BB8] text-white hover:bg-[#25649a] disabled:opacity-50 ${compactBtn}`}
                                onClick={onSaveModalDay}
                            >
                                {saving ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
