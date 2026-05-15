import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
import { authHeaders, fetchMallasTurnos, putMallasTurnos } from './mallasTurnosApi.js';

const FRANJAS = [
    { id: '06_14', label: '06:00–14:00' },
    { id: '14_22', label: '14:00–22:00' },
    { id: '22_06', label: '22:00–06:00' }
];

const EMPTY_FRANJAS = () => ({
    '06_14': [],
    '14_22': [],
    '22_06': []
});

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

function shortLabelColaborador(row) {
    const cod = String(row?.codigo || '').trim();
    if (cod) return cod.toUpperCase().slice(0, 8);
    const nom = String(row?.nombres || '').trim();
    const a1 = String(row?.primer_apellido || '').trim();
    if (nom && a1) return `${nom[0] || ''}${a1[0] || ''}`.toUpperCase();
    const full = String(row?.nombre || '').trim();
    if (!full) return '—';
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    return full.slice(0, 3).toUpperCase();
}

function matchesColabSearch(row, needle) {
    const n = String(needle || '').trim().toLowerCase();
    if (!n) return true;
    const hay = [
        row.nombre,
        row.codigo,
        row.cedula,
        row.correo_cinte,
        row.cliente
    ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ');
    return hay.includes(n);
}

function buildMeshMap(items) {
    const map = {};
    for (const it of items || []) {
        const f = it.fecha;
        if (!map[f]) map[f] = EMPTY_FRANJAS();
        const arr = map[f][it.franja];
        if (Array.isArray(arr)) {
            arr.push({
                cedula: String(it.cedula),
                nombre: String(it.nombre || ''),
                codigo: it.codigo != null ? String(it.codigo) : null,
                orden: Number(it.orden) || 0
            });
        }
    }
    for (const ymd of Object.keys(map)) {
        for (const { id } of FRANJAS) {
            map[ymd][id].sort((a, b) => a.orden - b.orden || a.cedula.localeCompare(b.cedula));
        }
    }
    return map;
}

function dayHasAssignments(meshByYmd, ymd) {
    const row = meshByYmd[ymd];
    if (!row) return false;
    return FRANJAS.some((f) => (row[f.id] || []).length > 0);
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

export default function MallasTurnosPage({ token }) {
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

    const [clienteSeleccionado, setClienteSeleccionado] = useState('');
    const [clientesOptions, setClientesOptions] = useState([]);
    const [loadingClientes, setLoadingClientes] = useState(false);
    const [colaboradores, setColaboradores] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [meshByYmd, setMeshByYmd] = useState({});
    const [selected, setSelected] = useState(() => new Set());
    const [draft, setDraft] = useState(() => EMPTY_FRANJAS());
    const [searchColaborador, setSearchColaborador] = useState('');
    const [dayModalYmd, setDayModalYmd] = useState(null);
    /** Copia editable de cédulas por franja mientras el modal del día está abierto. */
    const [modalCedulasByFranja, setModalCedulasByFranja] = useState(null);
    const [loadingMesh, setLoadingMesh] = useState(false);
    const [loadingCo, setLoadingCo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [festivosSet, setFestivosSet] = useState(() => new Set());

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
            setMeshByYmd(buildMeshMap(data.items));
        } catch (e) {
            setError(e.message || 'No se pudo cargar la malla');
        } finally {
            setLoadingMesh(false);
        }
    }, [token, clienteSeleccionado, desde, hasta]);

    useEffect(() => {
        loadClientesCatalogo();
    }, [loadClientesCatalogo]);

    useEffect(() => {
        loadColaboradores();
    }, [loadColaboradores]);

    useEffect(() => {
        loadMesh();
    }, [loadMesh]);

    useEffect(() => {
        setDraft(EMPTY_FRANJAS());
        setSearchColaborador('');
        setSelected(new Set());
    }, [clienteSeleccionado]);

    useEffect(() => {
        if (!dayModalYmd) {
            setModalCedulasByFranja(null);
            return;
        }
        const row = meshByYmd[dayModalYmd] || EMPTY_FRANJAS();
        const next = {};
        for (const { id } of FRANJAS) {
            next[id] = (row[id] || []).map((p) => String(p.cedula));
        }
        setModalCedulasByFranja(next);
    }, [dayModalYmd]);

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
        if (selected.size === 0) {
            setError(
                'Selecciona al menos un día (clic en día vacío o marca en el modal de un día con malla)'
            );
            return;
        }
        const patches = [];
        for (const ymd of selected) {
            for (const { id } of FRANJAS) {
                patches.push({ fecha: ymd, franja: id, cedulas: [...(draft[id] || [])] });
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

    const clearModalFranja = (franjaId) => {
        setModalCedulasByFranja((prev) => (prev ? { ...prev, [franjaId]: [] } : prev));
    };

    const modalHasChanges = useMemo(() => {
        if (!dayModalYmd || !modalCedulasByFranja) return false;
        const row = meshByYmd[dayModalYmd] || EMPTY_FRANJAS();
        for (const { id } of FRANJAS) {
            const was = (row[id] || []).map((p) => String(p.cedula));
            const cur = modalCedulasByFranja[id] || [];
            if (was.length !== cur.length) return true;
            for (let i = 0; i < was.length; i += 1) {
                if (was[i] !== cur[i]) return true;
            }
        }
        return false;
    }, [dayModalYmd, modalCedulasByFranja, meshByYmd]);

    const onSaveModalDay = async () => {
        const ymd = dayModalYmd;
        if (!ymd || !modalCedulasByFranja) return;
        if (!modalHasChanges) {
            setDayModalYmd(null);
            return;
        }
        const patches = FRANJAS.map(({ id }) => ({
            fecha: ymd,
            franja: id,
            cedulas: [...(modalCedulasByFranja[id] || [])]
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
        const needle = searchColaborador;
        const chosen = new Set(draft[franjaId] || []);
        return colaboradores.filter((c) => {
            if (chosen.has(c.cedula)) return false;
            return matchesColabSearch(c, needle);
        });
    };

    const weekHeader = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

    const legendItems = useMemo(() => {
        const seen = new Set();
        const list = [];
        for (const ymd of Object.keys(meshByYmd)) {
            if (ymd < desde || ymd > hasta) continue;
            const row = meshByYmd[ymd];
            for (const f of FRANJAS) {
                for (const c of row[f.id] || []) {
                    if (c?.cedula && !seen.has(c.cedula)) {
                        seen.add(c.cedula);
                        list.push(c);
                    }
                }
            }
        }
        return list;
    }, [meshByYmd, desde, hasta]);

    const modalRow = dayModalYmd ? meshByYmd[dayModalYmd] || EMPTY_FRANJAS() : EMPTY_FRANJAS();
    const modalInSelected = dayModalYmd ? selected.has(dayModalYmd) : false;

    return (
        <div className="space-y-4 w-full max-w-[95rem]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={`text-base font-heading font-bold ${headingAccent}`}>Mallas de turnos</h2>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className={`p-2 rounded-lg ${outlineBtn}`}
                        title="Mes anterior"
                        onClick={() =>
                            setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                        }
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className={`text-sm font-semibold min-w-[10rem] text-center ${headingAccent}`}>{monthLabel}</span>
                    <button
                        type="button"
                        className={`p-2 rounded-lg ${outlineBtn}`}
                        title="Mes siguiente"
                        onClick={() =>
                            setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                        }
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            <div className={`flex flex-wrap items-end gap-3 ${tableSurface} rounded-xl border ${borderSubtle} p-4`}>
                <div className="min-w-[220px] flex-1">
                    <label className={`block text-xs mb-1 ${labelMuted}`}>Cliente</label>
                    <select
                        className={`w-full ${field}`}
                        value={clienteSeleccionado}
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
            </div>

            {error ? (
                <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                    {error}
                </div>
            ) : null}

            {!clienteSeleccionado.trim() ? (
                <p className={`text-sm ${labelMuted}`}>Selecciona un cliente para ver la malla y asignar colaboradores.</p>
            ) : (
                <div className="flex flex-col xl:flex-row gap-6">
                    <div className={`flex-1 min-w-0 rounded-xl border ${borderSubtle} ${tableSurface} p-3`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs ${labelMuted}`}>
                                {loadingMesh ? 'Cargando malla…' : `${clienteSeleccionado} · ${desde} → ${hasta}`}
                            </span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide mb-1">
                            {weekHeader.map((w, i) => (
                                <div
                                    key={i}
                                    className={`py-1 font-semibold ${i === 0 ? 'text-red-500' : labelMuted}`}
                                >
                                    {w}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {calendarCells.map((cell, idx) => {
                                if (!cell) {
                                    return <div key={`e-${idx}`} className="min-h-[5.5rem]" />;
                                }
                                const ymd = ymdLocal(cell);
                                const isSel = selected.has(ymd);
                                const isToday = ymd === todayYmd;
                                const dow = cell.getDay();
                                const isFestivo = festivosSet.has(ymd);
                                const row = meshByYmd[ymd] || EMPTY_FRANJAS();
                                return (
                                    <button
                                        key={ymd}
                                        type="button"
                                        onClick={() => {
                                            if (dayHasAssignments(meshByYmd, ymd)) {
                                                setDayModalYmd(ymd);
                                            } else {
                                                setSelected((prev) => {
                                                    const n = new Set(prev);
                                                    if (n.has(ymd)) n.delete(ymd);
                                                    else n.add(ymd);
                                                    return n;
                                                });
                                            }
                                        }}
                                        className={`min-h-[5.5rem] rounded-lg border text-left p-1 flex flex-col gap-0.5 transition-colors ${
                                            isSel
                                                ? 'border-[#2F7BB8] ring-1 ring-[#2F7BB8]/50 bg-[#2F7BB8]/15'
                                                : `border-transparent hover:border-[#2F7BB8]/35 ${tableSurface}`
                                        } ${isToday ? 'ring-1 ring-amber-400/50' : ''} ${
                                            isFestivo ? 'ring-1 ring-violet-500/45 bg-violet-950/20' : ''
                                        }`}
                                    >
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
                                        <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-hidden">
                                            {FRANJAS.map((f) => {
                                                const people = row[f.id] || [];
                                                if (people.length === 0) {
                                                    return (
                                                        <div
                                                            key={f.id}
                                                            className={`text-[9px] px-0.5 py-0.5 rounded truncate ${labelMuted} opacity-60`}
                                                        >
                                                            {f.label.slice(0, 5)} —
                                                        </div>
                                                    );
                                                }
                                                const first = people[0];
                                                const bg = hslForCedula(first.cedula, isLight);
                                                const fg = textColorForCedula(first.cedula, isLight);
                                                const extra = people.length > 1 ? ` +${people.length - 1}` : '';
                                                const short = first.codigo
                                                    ? String(first.codigo).trim().slice(0, 6).toUpperCase()
                                                    : shortLabelColaborador(first);
                                                return (
                                                    <div
                                                        key={f.id}
                                                        className="text-[9px] px-0.5 py-0.5 rounded truncate font-semibold"
                                                        style={{ backgroundColor: bg, color: fg }}
                                                        title={people.map((p) => p.nombre).join(', ')}
                                                    >
                                                        {short}
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

                    <div className="w-full xl:w-[22rem] shrink-0 space-y-4">
                        <div className={`rounded-xl border ${borderSubtle} ${tableSurface} p-4 space-y-3`}>
                            <h3 className={`text-sm font-semibold ${headingAccent}`}>Asignación masiva</h3>
                            <p className={`text-xs ${labelMuted}`}>
                                Días en masivo: <strong className={headingAccent}>{selected.size}</strong>. Día vacío:
                                clic alterna selección. Día con malla: abre el modal y puedes marcar para masivo.
                            </p>
                            <div className="space-y-1">
                                <label className={`block text-xs font-semibold ${headingAccent}`}>
                                    Buscar colaborador
                                </label>
                                <input
                                    type="search"
                                    placeholder="Nombre, código o cédula… (filtra los tres desplegables)"
                                    className={`w-full text-sm ${field}`}
                                    value={searchColaborador}
                                    onChange={(e) => setSearchColaborador(e.target.value)}
                                    disabled={loadingCo}
                                />
                            </div>
                            {FRANJAS.map((f) => (
                                <div key={f.id} className="space-y-2">
                                    <label className={`block text-xs font-semibold ${headingAccent}`}>{f.label}</label>
                                    <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
                                        {(draft[f.id] || []).map((ced) => {
                                            const row = colaboradores.find((c) => c.cedula === ced);
                                            return (
                                                <span
                                                    key={ced}
                                                    className="inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-0.5 text-[10px] text-slate-100"
                                                >
                                                    {row ? shortLabelColaborador(row) : ced}
                                                    <button
                                                        type="button"
                                                        className="rounded hover:text-white text-slate-400"
                                                        aria-label="Quitar"
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
                                            disabled={loadingCo}
                                        >
                                            <option value="">+ Añadir colaborador…</option>
                                            {filteredColaboradoresForFranja(f.id).map((c) => (
                                                <option key={c.cedula} value={c.cedula}>
                                                    {shortLabelColaborador(c)} — {c.nombre}
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
                                    disabled={saving || loadingCo || selected.size === 0}
                                    className={`w-full py-2 rounded-lg text-sm font-semibold bg-[#2F7BB8] text-white hover:bg-[#25649a] disabled:opacity-50 ${compactBtn}`}
                                    onClick={onApplyToSelected}
                                >
                                    {saving ? 'Guardando…' : 'Aplicar a días seleccionados'}
                                </button>
                                <button
                                    type="button"
                                    className={`w-full py-2 rounded-lg text-sm ${outlineBtn}`}
                                    onClick={clearSelection}
                                >
                                    Limpiar días en masivo
                                </button>
                            </div>
                        </div>

                        <div className={`rounded-xl border ${borderSubtle} p-3`}>
                            <p className={`text-xs font-semibold mb-2 ${headingAccent}`}>Leyenda (mes visible)</p>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                {legendItems.map((c) => (
                                    <span
                                        key={c.cedula}
                                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold"
                                        style={{
                                            backgroundColor: hslForCedula(c.cedula, isLight),
                                            color: textColorForCedula(c.cedula, isLight)
                                        }}
                                    >
                                        {c.codigo ? String(c.codigo).trim().slice(0, 8).toUpperCase() : shortLabelColaborador(c)}{' '}
                                        <span className="font-normal opacity-90 truncate max-w-[8rem]">{c.nombre}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {dayModalYmd ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        className={`absolute inset-0 ${scrim}`}
                        aria-label="Cerrar"
                        onClick={() => setDayModalYmd(null)}
                    />
                    <div
                        className={`relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border ${borderSubtle} ${mainCanvas} p-5 shadow-2xl`}
                    >
                        <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                                <h3 className={`text-lg font-heading font-bold ${headingAccent}`}>
                                    {dayModalYmd}
                                    {festivosSet.has(dayModalYmd) ? (
                                        <span className="ml-2 text-xs font-semibold text-violet-400">Festivo</span>
                                    ) : null}
                                </h3>
                                <p className={`text-xs ${labelMuted}`}>{clienteSeleccionado}</p>
                            </div>
                            <button
                                type="button"
                                className={`rounded-lg p-2 ${outlineBtn}`}
                                onClick={() => setDayModalYmd(null)}
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <label className={`flex items-center gap-2 text-sm mb-4 cursor-pointer ${labelMuted}`}>
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
                        <div className="space-y-4">
                            {!modalCedulasByFranja ? (
                                <p className={`text-sm ${labelMuted}`}>Cargando…</p>
                            ) : (
                                FRANJAS.map((f) => {
                                    const cedulas = modalCedulasByFranja[f.id] || [];
                                    return (
                                        <div key={f.id} className={`rounded-lg border ${borderSubtle} p-3`}>
                                            <div className="flex items-center justify-between gap-2 mb-2">
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
                                                <p className={`text-xs ${labelMuted}`}>Sin asignados</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {cedulas.map((ced) => {
                                                        const p = personForModalCedula(modalRow, f.id, ced, colaboradores);
                                                        return (
                                                            <li
                                                                key={ced}
                                                                className="flex items-start justify-between gap-2 text-sm"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <span className={`font-semibold ${headingAccent}`}>{p.nombre}</span>
                                                                    <span className={`text-xs ml-2 ${labelMuted}`}>
                                                                        CC {p.cedula}
                                                                        {p.codigo ? ` · ${p.codigo}` : ''}
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    className={`shrink-0 rounded-lg p-1.5 ${outlineBtn} text-red-400 hover:text-red-300 disabled:opacity-50`}
                                                                    aria-label={`Quitar ${p.nombre}`}
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
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className={`mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t ${borderSubtle}`}>
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
