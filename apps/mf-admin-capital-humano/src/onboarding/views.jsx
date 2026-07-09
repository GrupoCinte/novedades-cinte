import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { Plus } from 'lucide-react';
import { onboardingApi } from './api.js';
import { getOnboardingPermissions } from './onboardingAccess.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import SortableGestionDataTable from './SortableGestionDataTable.jsx';
import { PERSONAL_DEFAULT_SORT, toggleSort } from './onboardingSortDefaults.js';
import OnboardingFiltersBar, { buildChipLabel } from './OnboardingFiltersBar.jsx';
import OnboardingFiltersDrawer, {
    drawerFieldCls,
    drawerLabelCls
} from './OnboardingFiltersDrawer.jsx';
import ColaboradorOnboardingModal from './ColaboradorOnboardingModal.jsx';
import { nativeCalendarOnlyInputProps } from '../nativeCalendarOnlyInputProps.js';
import {
    TipoPersonalBadge,
    MotivoBajaBadge,
    ColaboradorEstadoBadge,
    DiasIngresoBadge
} from './onboardingBadges.jsx';

/* ---------------------------------------------------------------------------
 * Helpers visuales y formateo
 * ------------------------------------------------------------------------- */

export function StatusBadge({ value, isLight }) {
    if (value === null || value === undefined) return null;
    const ok = value === true || String(value).toLowerCase() === 'true';
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                ok ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'
            } ${isLight ? '' : 'dark:text-white'}`}
        >
            {ok ? 'Sí' : 'No'}
        </span>
    );
}

export function fmtFecha(v) {
    if (!v) return '';
    const s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

export function fmtMoney(v) {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function chUpper(value) {
    return String(value || '').toUpperCase();
}

/** Para reusar fuera (filtros de Bajas). */
export const TIPO_PERSONAL_OPTIONS = [
    { value: 'consultor', label: 'Consultor' },
    { value: 'staff', label: 'Staff' },
    { value: 'sena', label: 'SENA' },
    { value: 'alianza', label: 'Alianza' }
];

/* ---------------------------------------------------------------------------
 * Personal / Bajas / SENA / Staff
 * ------------------------------------------------------------------------- */

/** Días restantes hasta una fecha futura (YYYY-MM-DD); 0 si ya pasó. */
function diasParaIngresar(fechaIngreso) {
    if (!fechaIngreso) return '';
    const s = String(fechaIngreso).slice(0, 10);
    const [y, m, d] = s.split('-').map((n) => Number(n));
    if (!y || !m || !d) return '';
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / 86400000);
    return diff > 0 ? diff : 0;
}

export function PersonalView({
    auth,
    tipoPersonal,
    activo,
    title,
    subtitle,
    isLight,
    /** Si se pasa, fuerza el método de onboardingApi a invocar (p. ej. 'listProximos'). */
    endpointKey
}) {
    const G = buildGestionTableDash(Boolean(isLight));
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [sort, setSort] = useState(PERSONAL_DEFAULT_SORT);
    const [selectedCedula, setSelectedCedula] = useState(null);
    const [creando, setCreando] = useState(false);
    const [filters, setFilters] = useState({});
    const [draft, setDraft] = useState({});
    const [panelOpen, setPanelOpen] = useState(false);
    const [clientes, setClientes] = useState([]);
    const [puestos, setPuestos] = useState([]);
    const [motivosBaja, setMotivosBaja] = useState([]);
    const token = auth?.token || '';
    const isBajas = activo === 'false';
    const hideEmpleadorFilter = tipoPersonal === 'consultor' && activo === 'true' && !endpointKey;
    const perms = useMemo(() => getOnboardingPermissions(auth), [auth]);
    const canCrear = perms.canEditFicha && !isBajas;

    const labelCls = drawerLabelCls(isLight);
    const fieldCls = drawerFieldCls(isLight);

    useEffect(() => {
        let alive = true;
        const baseUrl = import.meta.env.VITE_API_URL ?? '';
        fetch(`${baseUrl}/api/catalogos/clientes`, { credentials: 'include' })
            .then((r) => r.json().catch(() => ({})))
            .then((d) => {
                if (alive && Array.isArray(d?.items)) setClientes(d.items);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (isBajas) return undefined;
        let alive = true;
        onboardingApi
            .catalogoPuestos(token)
            .then((r) => {
                if (alive && Array.isArray(r?.items)) setPuestos(r.items);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [isBajas, token]);

    useEffect(() => {
        if (!isBajas) return undefined;
        let alive = true;
        onboardingApi
            .catalogoMotivoBaja(token)
            .then((r) => {
                if (alive && Array.isArray(r?.items)) setMotivosBaja(r.items);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [isBajas, token]);

    const isProximos = endpointKey === 'listProximos';
    const isPersonalActivo = tipoPersonal === 'consultor' && activo === 'true' && !endpointKey;

    const params = useMemo(() => {
        const p = {
            limit: pageSize,
            offset: page * pageSize,
            sort: sort.key,
            dir: sort.dir
        };
        if (tipoPersonal) p.tipo_personal = tipoPersonal;
        if (activo) p.activo = activo;
        if (search) p.q = search;
        for (const [k, v] of Object.entries(filters)) {
            if (hideEmpleadorFilter && k === 'empleador') continue;
            if (v !== undefined && v !== '' && v !== null) p[k] = v;
        }
        return p;
    }, [pageSize, page, sort, tipoPersonal, activo, search, filters, hideEmpleadorFilter]);

    const handleSort = useCallback((columnKey) => {
        setSort((cur) => toggleSort(cur, columnKey));
        setPage(0);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const endpoint = endpointKey
                ? endpointKey
                : tipoPersonal === 'sena'
                ? 'listSena'
                : tipoPersonal === 'staff'
                ? 'listStaff'
                : activo === 'false'
                ? 'listBajas'
                : 'listPersonal';
            const r = await onboardingApi[endpoint](token, params);
            setRows(r.items || []);
            setTotal(Number(r?.total) || 0);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    }, [token, tipoPersonal, activo, params, endpointKey]);

    useEffect(() => {
        load();
    }, [load]);

    const renderTipoPersonal = (r) => {
        if (tipoPersonal === 'sena') return <TipoPersonalBadge isLight={isLight} fixedLabel="SENA" value="sena" />;
        if (tipoPersonal === 'staff') return <TipoPersonalBadge isLight={isLight} fixedLabel="Staff" value="staff" />;
        return <TipoPersonalBadge value={r.tipo_personal} isLight={isLight} />;
    };

    const columns = isPersonalActivo
        ? [
              { key: 'cedula', label: 'Cédula' },
              { key: 'nombre', label: 'Nombre', render: (r) => chUpper(r.nombre) },
              { key: 'cliente', label: 'Cliente', render: (r) => chUpper(r.cliente) },
              { key: 'fecha_ingreso', label: 'F. inicio', render: (r) => fmtFecha(r.fecha_ingreso) },
              { key: 'fecha_termino', label: 'F. término', render: (r) => fmtFecha(r.fecha_termino) },
              { key: 'tipo_contrato', label: 'Tipo contrato' },
              {
                  key: 'descriptivo_puesto_sig',
                  label: 'Cargo Cinte',
                  render: (r) => chUpper(r.descriptivo_puesto_sig)
              }
          ]
        : [
        { key: 'cedula', label: 'Cédula' },
        { key: 'nombre', label: 'Nombre', render: (r) => chUpper(r.nombre) },
        { key: 'tipo_personal', label: 'Tipo', render: renderTipoPersonal },
        { key: 'cliente', label: 'Cliente', render: (r) => chUpper(r.cliente) },
        { key: 'puesto', label: 'Puesto', render: (r) => chUpper(r.puesto) },
        { key: 'pais', label: 'País' },
        { key: 'fecha_ingreso', label: 'F. ingreso', render: (r) => fmtFecha(r.fecha_ingreso) },
        ...(isProximos
            ? [
                  {
                      key: '_dias_para_ingresar',
                      label: 'Días para ingresar',
                      sortable: false,
                      render: (r) => <DiasIngresoBadge dias={diasParaIngresar(r.fecha_ingreso)} isLight={isLight} />
                  },
                  {
                      key: 'estado',
                      label: 'Estado',
                      sortable: false,
                      render: (r) => (
                          <ColaboradorEstadoBadge
                              activo={r.activo}
                              motivoBaja={r.motivo_baja}
                              fechaIngreso={r.fecha_ingreso}
                              isLight={isLight}
                          />
                      )
                  }
              ]
            : [{ key: 'activo', label: 'Activo', render: (r) => <StatusBadge value={r.activo} isLight={isLight} /> }]),
        ...(activo === 'false' || activo === 'all'
            ? [
                  {
                      key: 'motivo_baja',
                      label: 'Motivo baja',
                      render: (r) => <MotivoBajaBadge value={r.motivo_baja} isLight={isLight} />
                  },
                  { key: 'fecha_baja_efectiva', label: 'F. baja', render: (r) => fmtFecha(r.fecha_baja_efectiva) },
                  { key: 'tiempo_permanencia_meses', label: 'Permanencia (m)' }
              ]
            : [])
    ];

    const chipPairs = [
        [Boolean(search), search ? `Búsqueda: ${search.length > 18 ? `${search.slice(0, 16)}…` : search}` : ''],
        [Boolean(filters.cliente), filters.cliente ? `Cliente: ${String(filters.cliente).length > 16 ? `${String(filters.cliente).slice(0, 14)}…` : filters.cliente}` : ''],
        [Boolean(filters.pais), filters.pais ? `País: ${filters.pais}` : ''],
        [Boolean(filters.empleador) && !hideEmpleadorFilter, filters.empleador ? `Empleador: ${filters.empleador}` : ''],
        [Boolean(filters.puesto), filters.puesto ? `Puesto: ${filters.puesto}` : ''],
        [Boolean(filters.modalidad_trabajo), filters.modalidad_trabajo ? `Modalidad: ${filters.modalidad_trabajo}` : ''],
        [Boolean(filters.motivo_baja), filters.motivo_baja ? `Motivo: ${filters.motivo_baja.length > 16 ? `${filters.motivo_baja.slice(0, 14)}…` : filters.motivo_baja}` : ''],
        [Boolean(filters.tipo_personal_extra), filters.tipo_personal_extra ? `Tipo: ${filters.tipo_personal_extra}` : ''],
        [Boolean(filters.fecha_ingreso_desde || filters.fecha_ingreso_hasta), 'Rango ingreso'],
        [Boolean(filters.fecha_baja_desde || filters.fecha_baja_hasta), 'Rango baja']
    ];
    const chipLabel = buildChipLabel(chipPairs);

    const openPanel = () => {
        setDraft({ ...filters });
        setPanelOpen(true);
    };
    const applyDraft = () => {
        const next = { ...draft };
        if (isBajas && next.tipo_personal_extra) {
            next.tipo_personal = next.tipo_personal_extra;
        } else {
            delete next.tipo_personal;
        }
        delete next.tipo_personal_extra;
        setFilters(next);
        setPage(0);
        setPanelOpen(false);
    };
    const clearAll = () => {
        setDraft({});
        setFilters({});
        setPage(0);
        setPanelOpen(false);
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages - 1);

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[12rem]">
                    <h2 className={G.titleXl}>{title}</h2>
                    <p className={G.mutedSm}>
                        {subtitle || 'Haz click en una fila para abrir la ficha completa del colaborador.'}
                    </p>
                </div>
                {canCrear ? (
                    <button
                        type="button"
                        onClick={() => setCreando(true)}
                        className={`${G.btnPrimaryCinte} inline-flex items-center gap-2`}
                    >
                        <Plus size={16} />
                        Agregar
                    </button>
                ) : null}
            </header>

            <div className={G.filterBar}>
                <OnboardingFiltersBar
                    chipLabel={chipLabel}
                    panelOpen={panelOpen}
                    onToggle={() => (panelOpen ? setPanelOpen(false) : openPanel())}
                    search={search}
                    onSearchChange={(v) => {
                        setSearch(v);
                        setPage(0);
                    }}
                    searchPlaceholder="Buscar cédula / nombre / correo..."
                    isLight={isLight}
                />
            </div>

            {error ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {error}
                </div>
            ) : null}

            <SortableGestionDataTable
                columns={columns}
                rows={rows}
                isLight={isLight}
                sort={sort}
                onSort={handleSort}
                emptyText={loading ? 'Cargando…' : 'Sin colaboradores en este filtro.'}
                onRowClick={(r) => {
                    if (r && r.cedula) setSelectedCedula(String(r.cedula));
                }}
            />

            <div className={G.footerBar}>
                <div className="flex items-center gap-2">
                    <span>{rows.length} de {total} registros</span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(0);
                        }}
                        className={`${fieldCls} h-8 py-0 text-xs`}
                        aria-label="Mostrar por página"
                    >
                        {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>
                                {n} por página
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={safePage === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className={G.compactBtn}
                    >
                        ← Anterior
                    </button>
                    <span>
                        Página {safePage + 1} de {totalPages}
                    </span>
                    <button
                        type="button"
                        disabled={safePage >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className={G.compactBtn}
                    >
                        Siguiente →
                    </button>
                </div>
            </div>

            <OnboardingFiltersDrawer
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                onClear={clearAll}
                onApply={applyDraft}
                isLight={isLight}
            >
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls} htmlFor="pv-cliente">Cliente</label>
                    <select
                        id="pv-cliente"
                        value={draft.cliente || ''}
                        onChange={(e) => setDraft((s) => ({ ...s, cliente: e.target.value }))}
                        className={fieldCls}
                    >
                        <option value="">Todos los clientes</option>
                        {clientes.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                {isBajas ? (
                    <>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls} htmlFor="pv-motivo">Motivo de baja</label>
                            <select
                                id="pv-motivo"
                                value={draft.motivo_baja || ''}
                                onChange={(e) => setDraft((s) => ({ ...s, motivo_baja: e.target.value }))}
                                className={fieldCls}
                            >
                                <option value="">Todos los motivos</option>
                                {motivosBaja.map((m) => (
                                    <option key={m.motivo || m.id} value={m.motivo}>{m.motivo}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls} htmlFor="pv-tipoextra">Tipo personal</label>
                            <select
                                id="pv-tipoextra"
                                value={draft.tipo_personal_extra || ''}
                                onChange={(e) => setDraft((s) => ({ ...s, tipo_personal_extra: e.target.value }))}
                                className={fieldCls}
                            >
                                <option value="">Todos</option>
                                {TIPO_PERSONAL_OPTIONS.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={labelCls}>Rango fecha de baja</span>
                            <div className="flex items-center gap-2">
                                <input {...nativeCalendarOnlyInputProps} type="date" value={draft.fecha_baja_desde || ''} onChange={(e) => setDraft((s) => ({ ...s, fecha_baja_desde: e.target.value }))} className={`${fieldCls} min-w-0 flex-1`} aria-label="Fecha de baja: desde" />
                                <span className={`${isLight ? 'text-slate-500' : 'text-slate-400'} shrink-0 text-xs`}>a</span>
                                <input {...nativeCalendarOnlyInputProps} type="date" value={draft.fecha_baja_hasta || ''} onChange={(e) => setDraft((s) => ({ ...s, fecha_baja_hasta: e.target.value }))} className={`${fieldCls} min-w-0 flex-1`} aria-label="Fecha de baja: hasta" />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls} htmlFor="pv-pais">País</label>
                            <input id="pv-pais" type="text" value={draft.pais || ''} onChange={(e) => setDraft((s) => ({ ...s, pais: e.target.value }))} className={fieldCls} placeholder="Colombia, México…" />
                        </div>
                        {!hideEmpleadorFilter ? (
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls} htmlFor="pv-empleador">Empleador</label>
                            <input id="pv-empleador" type="text" value={draft.empleador || ''} onChange={(e) => setDraft((s) => ({ ...s, empleador: e.target.value }))} className={fieldCls} />
                        </div>
                        ) : null}
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls} htmlFor="pv-puesto">Puesto</label>
                            <select
                                id="pv-puesto"
                                value={draft.puesto || ''}
                                onChange={(e) => setDraft((s) => ({ ...s, puesto: e.target.value }))}
                                className={fieldCls}
                            >
                                <option value="">Todos los puestos</option>
                                {puestos.map((p) => {
                                    const label = String(p.puesto || p).trim();
                                    if (!label) return null;
                                    return (
                                        <option key={label} value={label}>{label}</option>
                                    );
                                })}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls} htmlFor="pv-modalidad">Modalidad de trabajo</label>
                            <input id="pv-modalidad" type="text" value={draft.modalidad_trabajo || ''} onChange={(e) => setDraft((s) => ({ ...s, modalidad_trabajo: e.target.value }))} className={fieldCls} placeholder="Presencial, Híbrido, Teletrabajo…" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={labelCls}>Rango fecha de ingreso</span>
                            <div className="flex items-center gap-2">
                                <input {...nativeCalendarOnlyInputProps} type="date" value={draft.fecha_ingreso_desde || ''} onChange={(e) => setDraft((s) => ({ ...s, fecha_ingreso_desde: e.target.value }))} className={`${fieldCls} min-w-0 flex-1`} aria-label="Fecha de ingreso: desde" />
                                <span className={`${isLight ? 'text-slate-500' : 'text-slate-400'} shrink-0 text-xs`}>a</span>
                                <input {...nativeCalendarOnlyInputProps} type="date" value={draft.fecha_ingreso_hasta || ''} onChange={(e) => setDraft((s) => ({ ...s, fecha_ingreso_hasta: e.target.value }))} className={`${fieldCls} min-w-0 flex-1`} aria-label="Fecha de ingreso: hasta" />
                            </div>
                        </div>
                    </>
                )}
            </OnboardingFiltersDrawer>

            {selectedCedula ? (
                <ColaboradorOnboardingModal
                    auth={auth}
                    cedula={selectedCedula}
                    onClose={() => setSelectedCedula(null)}
                    onSaved={() => {
                        setSelectedCedula(null);
                        load();
                    }}
                />
            ) : null}

            {creando ? (
                <ColaboradorOnboardingModal
                    auth={auth}
                    cedula={null}
                    createMode
                    onClose={() => setCreando(false)}
                    onSaved={() => {
                        setCreando(false);
                        load();
                    }}
                />
            ) : null}
        </div>
    );
}

/* ---------------------------------------------------------------------------
 * Calculadora salarial
 * ------------------------------------------------------------------------- */

function fmtPct(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    return `${(Number(v) * 100).toFixed(2)} %`;
}

export function CalculadoraView({ auth, isLight }) {
    const G = buildGestionTableDash(Boolean(isLight));
    const token = auth?.token || '';
    const perms = useMemo(() => getOnboardingPermissions(auth), [auth]);

    // Inputs de la calculadora en vivo (no requieren cédula)
    const [costo, setCosto] = useState('');
    const [tarifa, setTarifa] = useState('');
    const [pctSal, setPctSal] = useState('0');
    const [pctTar, setPctTar] = useState('0');

    // Búsqueda/guardado opcional por cédula
    const [cedula, setCedula] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const inputCls = `rounded border px-3 py-1.5 text-sm ${isLight ? 'border-slate-300 bg-white text-slate-900' : 'border-slate-700 bg-slate-800 text-slate-200'}`;

    /** Réplica del trigger fn_colaborador_calculo_salarial_derive (Postgres). */
    const calc = useMemo(() => {
        const c = costo === '' ? NaN : Number(costo);
        const t = tarifa === '' ? NaN : Number(tarifa);
        const ps = Number(pctSal) || 0;
        const pt = Number(pctTar) || 0;
        const hasC = Number.isFinite(c);
        const hasT = Number.isFinite(t);
        const utilidad = hasC && hasT ? t - c : null;
        const rt = hasC && hasT && t > 0 ? (t - c) / t : null;
        const valorTotalSalario = hasC ? c * (1 + ps) : null;
        const valorTotalTarifa = hasT ? t * (1 + pt) : null;
        const calculoUtilidad =
            valorTotalSalario != null && valorTotalTarifa != null ? valorTotalTarifa - valorTotalSalario : null;
        const calculoRentabilidad =
            calculoUtilidad != null && valorTotalTarifa ? calculoUtilidad / valorTotalTarifa : null;
        return {
            utilidad,
            rt,
            valorTotalSalario,
            valorTotalTarifa,
            calculoCostoEmpresa: valorTotalSalario,
            calculoUtilidad,
            calculoRentabilidad
        };
    }, [costo, tarifa, pctSal, pctTar]);

    const buscar = async () => {
        const ced = cedula.replace(/\D+/g, '');
        if (!ced) return;
        setLoading(true);
        setError('');
        setInfo('');
        try {
            const r = await onboardingApi.getCalculadora(token, ced);
            if (r.item) {
                setCosto(r.item.costo_empresa ?? '');
                setTarifa(r.item.tarifa_cliente ?? '');
                setPctSal(String(r.item.pct_ajuste_salario ?? 0));
                setPctTar(String(r.item.pct_ajuste_tarifa ?? 0));
                setInfo('Datos cargados desde la cédula. Puedes recalcular y guardar.');
            } else {
                setInfo('No hay calculadora vigente para esa cédula; puedes calcular y guardar una nueva.');
            }
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    };

    const guardar = async () => {
        const ced = cedula.replace(/\D+/g, '');
        if (!perms.canWrite || !ced) return;
        setSaving(true);
        setError('');
        setInfo('');
        try {
            await onboardingApi.putCalculadora(token, ced, {
                costo_empresa: Number(costo) || null,
                tarifa_cliente: Number(tarifa) || null,
                pct_ajuste_salario: Number(pctSal) || 0,
                pct_ajuste_tarifa: Number(pctTar) || 0
            });
            setInfo(`Calculadora guardada para la cédula ${ced}.`);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setSaving(false);
        }
    };

    const resultados = [
        ['Utilidad', calc.utilidad, 'money'],
        ['RT / aprox', calc.rt, 'pct'],
        ['Valor total salario', calc.valorTotalSalario, 'money'],
        ['Valor total tarifa', calc.valorTotalTarifa, 'money'],
        ['Cálculo costo empresa', calc.calculoCostoEmpresa, 'money'],
        ['Cálculo utilidad', calc.calculoUtilidad, 'money'],
        ['Cálculo rentabilidad', calc.calculoRentabilidad, 'pct']
    ];

    return (
        <div className="flex flex-col gap-4">
            <header>
                <h2 className={G.titleXl}>Calculadora salarial</h2>
                <p className={G.mutedSm}>
                    Cálculo en vivo replicando el Excel: utilidad, RT/aprox, valores totales con % de ajuste y rentabilidad.
                </p>
            </header>

            {/* Inputs de cálculo en vivo */}
            <div className={`${G.card} grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4`}>
                <label className={`flex flex-col text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Costo empresa
                    <input type="number" step="0.01" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0" className={`mt-1 ${inputCls}`} />
                </label>
                <label className={`flex flex-col text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Tarifa cliente
                    <input type="number" step="0.01" inputMode="decimal" value={tarifa} onChange={(e) => setTarifa(e.target.value)} placeholder="0" className={`mt-1 ${inputCls}`} />
                </label>
                <label className={`flex flex-col text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    % ajuste salario (0.05 = 5%)
                    <input type="number" step="0.0001" inputMode="decimal" value={pctSal} onChange={(e) => setPctSal(e.target.value)} className={`mt-1 ${inputCls}`} />
                </label>
                <label className={`flex flex-col text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    % ajuste tarifa (0.05 = 5%)
                    <input type="number" step="0.0001" inputMode="decimal" value={pctTar} onChange={(e) => setPctTar(e.target.value)} className={`mt-1 ${inputCls}`} />
                </label>
            </div>

            {/* Resultados en vivo */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${isLight ? '' : 'text-slate-200'}`}>
                {resultados.map(([label, val, kind]) => (
                    <div key={label} className={`${G.card} px-4 py-3`}>
                        <p className={`text-[10px] uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{label}</p>
                        <p className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {val == null ? '—' : kind === 'pct' ? fmtPct(val) : fmtMoney(val)}
                        </p>
                    </div>
                ))}
            </div>

            {/* Buscar / guardar por cédula (opcional) */}
            <div className={`${G.card} flex flex-col gap-2 px-4 py-3`}>
                <p className={`text-[11px] font-semibold uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Asociar a una cédula (opcional)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        value={cedula}
                        onChange={(e) => setCedula(e.target.value)}
                        placeholder="Cédula"
                        className={inputCls}
                    />
                    <button type="button" onClick={buscar} disabled={loading || !cedula} className={G.btnPrimaryCinte}>
                        {loading ? 'Cargando…' : 'Consultar'}
                    </button>
                    {perms.canWrite ? (
                        <button type="button" onClick={guardar} disabled={saving || !cedula} className={G.btnPrimaryCinte}>
                            {saving ? 'Guardando…' : 'Guardar a cédula'}
                        </button>
                    ) : null}
                </div>
            </div>

            {error ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
            ) : null}
            {info ? (
                <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-800">{info}</div>
            ) : null}
        </div>
    );
}

/* ---------------------------------------------------------------------------
 * Gráficas (panel de indicadores onboarding)
 * ------------------------------------------------------------------------- */

const CHART_COLORS = ['#2F7BB8', '#1FC76A', '#F5A623', '#9B59B6', '#08BDC6', '#E74C3C', '#65BCF7', '#7AC74F'];

const TIPO_LABELS = {
    consultor: 'Consultor',
    staff: 'Staff',
    sena: 'SENA',
    alianza: 'Alianza'
};

function ChartCard({ title, subtitle, isLight, children }) {
    const G = buildGestionTableDash(Boolean(isLight));
    return (
        <div className={`${G.card} flex flex-col gap-2 px-4 py-4`}>
            <div>
                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{title}</h3>
                {subtitle ? <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{subtitle}</p> : null}
            </div>
            <div className="h-[260px] w-full">
                {children}
            </div>
        </div>
    );
}

function EmptyChart({ isLight, text }) {
    return (
        <div className={`flex h-full w-full items-center justify-center text-xs ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            {text}
        </div>
    );
}

export function OnboardingAnalyticsPanel({ auth, isLight }) {
    const G = buildGestionTableDash(Boolean(isLight));
    const [graficas, setGraficas] = useState(null);
    const [rotacion, setRotacion] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const token = auth?.token || '';

    const axisColor = isLight ? '#475569' : '#9fb3c8';
    const gridColor = isLight ? '#e2e8f0' : 'rgba(148,163,184,0.18)';
    const tooltipStyle = isLight
        ? { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }
        : { background: '#0b1e30', border: '1px solid #1a3a56', borderRadius: 8, fontSize: 12, color: '#e7eef7' };

    const cargar = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {
                ...(desde ? { desde } : {}),
                ...(hasta ? { hasta } : {})
            };
            const [g, r] = await Promise.all([
                onboardingApi.reporteGraficas(token, params),
                onboardingApi.reporteRotacion(token, params)
            ]);
            setGraficas(g);
            setRotacion(r);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    }, [token, desde, hasta]);

    useEffect(() => {
        cargar();
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, []);

    const headcountData = useMemo(
        () => (graficas?.headcount_by_tipo || []).map((row) => ({
            tipo: TIPO_LABELS[row.tipo] || row.tipo || 'Sin tipo',
            cuenta: Number(row.cuenta) || 0
        })),
        [graficas]
    );

    const ingresosData = useMemo(
        () => (graficas?.ingresos_by_month || []).map((row) => ({
            mes: row.mes,
            cuenta: Number(row.cuenta) || 0
        })),
        [graficas]
    );

    const activosVsBajas = useMemo(() => {
        const avb = graficas?.activos_vs_bajas || { activos: 0, bajas: 0 };
        return [
            { name: 'Activos', value: Number(avb.activos) || 0 },
            { name: 'Bajas', value: Number(avb.bajas) || 0 }
        ];
    }, [graficas]);

    const rotacionData = useMemo(
        () => (rotacion?.items || []).map((row) => ({
            name: row.motivo || 'Sin motivo',
            value: Number(row.cuenta) || 0
        })),
        [rotacion]
    );

    const totalActivos = activosVsBajas[0]?.value || 0;
    const totalBajas = activosVsBajas[1]?.value || 0;
    const totalIngresos = ingresosData.reduce((acc, r) => acc + r.cuenta, 0);

    const irp = graficas?.irp || null;
    const irpValor = irp && irp.irp != null ? irp.irp : null;

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                    <h2 className={G.titleXl}>Analítica de personal</h2>
                    <p className={G.mutedSm}>Indicadores de onboarding calculados en SQL sobre la tabla colaboradores.</p>
                </div>
                <label className="flex flex-col text-xs">
                    Desde
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`mt-1 rounded border px-2 py-1 ${isLight ? 'border-slate-300' : 'border-slate-700 bg-slate-800 text-slate-200'}`} />
                </label>
                <label className="flex flex-col text-xs">
                    Hasta
                    <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`mt-1 rounded border px-2 py-1 ${isLight ? 'border-slate-300' : 'border-slate-700 bg-slate-800 text-slate-200'}`} />
                </label>
                <button type="button" onClick={cargar} disabled={loading} className={G.btnPrimaryCinte}>
                    {loading ? 'Cargando…' : 'Aplicar'}
                </button>
            </header>

            {error ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
            ) : null}

            {/* IRP destacado */}
            <div className={`${G.card} flex flex-wrap items-center justify-between gap-4 px-5 py-4`}>
                <div className="min-w-[12rem]">
                    <p className={`text-[10px] uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Índice de Rotación de Personal (IRP)
                    </p>
                    <p className={`text-4xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {irpValor != null ? `${irpValor}%` : '—'}
                    </p>
                    <p className={`mt-1 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        IRP = bajas del periodo / promedio de empleados × 100
                    </p>
                </div>
                {irp ? (
                    <div className="flex flex-wrap gap-4 text-xs">
                        <div>
                            <p className={`${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Bajas periodo</p>
                            <p className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{irp.bajas_periodo}</p>
                        </div>
                        <div>
                            <p className={`${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Headcount inicio</p>
                            <p className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{irp.headcount_inicio}</p>
                        </div>
                        <div>
                            <p className={`${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Headcount fin</p>
                            <p className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{irp.headcount_fin}</p>
                        </div>
                        <div>
                            <p className={`${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Promedio empleados</p>
                            <p className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{irp.promedio}</p>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    ['Personal activo', totalActivos],
                    ['Bajas', totalBajas],
                    ['Ingresos (periodo)', totalIngresos]
                ].map(([label, val]) => (
                    <div key={label} className={`${G.card} px-4 py-3`}>
                        <p className={`text-[10px] uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{label}</p>
                        <p className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{val}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Headcount por tipo de personal" subtitle="Colaboradores activos" isLight={isLight}>
                    {headcountData.length === 0 ? (
                        <EmptyChart isLight={isLight} text="Sin datos" />
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={headcountData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                                <XAxis dataKey="tipo" tick={{ fill: axisColor, fontSize: 11 }} />
                                <YAxis allowDecimals={false} tick={{ fill: axisColor, fontSize: 11 }} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(47,123,184,0.08)' }} />
                                <Bar dataKey="cuenta" radius={[6, 6, 0, 0]}>
                                    {headcountData.map((entry, i) => (
                                        <Cell key={entry.tipo} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard title="Activos vs Bajas" subtitle="Distribución del personal" isLight={isLight}>
                    {totalActivos + totalBajas === 0 ? (
                        <EmptyChart isLight={isLight} text="Sin datos" />
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={activosVsBajas} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                                    {activosVsBajas.map((entry, i) => (
                                        <Cell key={entry.name} fill={i === 0 ? '#1FC76A' : '#E74C3C'} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} />
                                <Legend wrapperStyle={{ fontSize: 12, color: axisColor }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard title="Rotación por motivo" subtitle="Bajas agrupadas por motivo (normalizado)" isLight={isLight}>
                    {rotacionData.length === 0 ? (
                        <EmptyChart isLight={isLight} text="Sin bajas registradas en el rango" />
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rotacionData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                                <XAxis type="number" allowDecimals={false} tick={{ fill: axisColor, fontSize: 11 }} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={150}
                                    interval={0}
                                    tick={{ fill: axisColor, fontSize: 11 }}
                                    tickFormatter={(v) => String(v).length > 20 ? `${String(v).slice(0, 20)}…` : String(v)}
                                />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(47,123,184,0.08)' }} />
                                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                                    {rotacionData.map((entry, i) => (
                                        <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>
        </div>
    );
}

// Alias retrocompatible: el panel se embebe ahora en Dashboard General.
export const GraficasView = OnboardingAnalyticsPanel;
