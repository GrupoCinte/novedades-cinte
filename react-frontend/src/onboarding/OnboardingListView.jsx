import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OnboardingFiltersBar, { buildChipLabel } from './OnboardingFiltersBar.jsx';
import OnboardingFiltersDrawer, {
    drawerFieldCls,
    drawerLabelCls
} from './OnboardingFiltersDrawer.jsx';
import SortableGestionDataTable from './SortableGestionDataTable.jsx';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { nativeCalendarOnlyInputProps } from '../nativeCalendarOnlyInputProps.js';
import { LICENCIAS_DEFAULT_SORT, toggleSort } from './onboardingSortDefaults.js';

/**
 * Componente declarativo de lista para los submódulos de Onboarding.
 *
 * Props:
 *  - isLight
 *  - fetcher(params): async que devuelve { ok, items, total, limit, offset }.
 *  - columns: definición de columnas para la tabla (igual que DataTable del módulo).
 *  - filtersConfig: array de descriptores de filtro.
 *      { id, label, type, paramKey | paramKeys: { desde, hasta }, options, placeholder, summaryFormatter }
 *      type ∈ 'text' | 'select' | 'date-range' | 'tristate'.
 *      summaryFormatter(value): string → texto a mostrar en el chip resumen.
 *  - extraParams: objeto con parámetros fijos siempre enviados al backend (p. ej. tipo_personal).
 *  - searchPlaceholder, searchParamKey (default 'q').
 *  - onRowClick(row) opcional.
 *  - DataTable: componente externo, evita duplicar la implementación del módulo padre.
 *  - emptyText
 *  - pageSizes: array opcional, default [10, 20, 50, 100].
 */
export default function OnboardingListView({
    isLight = false,
    fetcher,
    columns,
    filtersConfig = [],
    extraParams = {},
    searchPlaceholder = 'Buscar…',
    searchParamKey = 'q',
    onRowClick,
    emptyText = 'Sin registros',
    pageSizes = [10, 20, 50, 100],
    headerRight = null,
    defaultSort = LICENCIAS_DEFAULT_SORT
}) {
    const G = buildGestionTableDash(Boolean(isLight));
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(pageSizes[2] || 50);
    const [sort, setSort] = useState(defaultSort);
    const [filters, setFilters] = useState({});
    const [draft, setDraft] = useState({});
    const [panelOpen, setPanelOpen] = useState(false);

    const labelCls = drawerLabelCls(isLight);
    const fieldCls = drawerFieldCls(isLight);

    const params = useMemo(() => {
        const p = {
            limit: pageSize,
            offset: page * pageSize,
            sort: sort.key,
            dir: sort.dir,
            ...extraParams
        };
        if (search) p[searchParamKey] = search;
        for (const cfg of filtersConfig) {
            if (cfg.type === 'date-range') {
                const { desde, hasta } = cfg.paramKeys || {};
                const dv = filters[`${cfg.id}__desde`];
                const hv = filters[`${cfg.id}__hasta`];
                if (desde && dv) p[desde] = dv;
                if (hasta && hv) p[hasta] = hv;
            } else if (cfg.paramKey) {
                const v = filters[cfg.id];
                if (v !== undefined && v !== '' && v !== null) p[cfg.paramKey] = v;
            }
        }
        return p;
    }, [pageSize, page, sort, extraParams, search, searchParamKey, filtersConfig, filters]);

    const handleSort = useCallback((columnKey) => {
        setSort((cur) => toggleSort(cur, columnKey));
        setPage(0);
    }, []);

    const loadSeqRef = useRef(0);
    // `fetcher` y `params` llegan como referencias nuevas en cada render (props inline y
    // defaults {}/[]). Si la carga dependiera de su identidad, el efecto se redispararía en
    // cada render → setState → render → … (tormenta de peticiones). Los leemos desde refs y
    // disparamos por el VALOR serializado de params.
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const paramsRef = useRef(params);
    paramsRef.current = params;
    const paramsKey = JSON.stringify(params);

    const load = useCallback(async () => {
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setError('');
        // Evita mezclar el orden anterior con la nueva cabecera mientras llega la respuesta.
        setRows([]);
        try {
            const r = await fetcherRef.current(paramsRef.current);
            if (seq !== loadSeqRef.current) return;
            setRows(Array.isArray(r?.items) ? r.items : []);
            setTotal(Number(r?.total) || 0);
        } catch (e) {
            if (seq !== loadSeqRef.current) return;
            setError(e?.response?.data?.error || e?.message || 'Error cargando');
        } finally {
            if (seq === loadSeqRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        // load es estable; recargamos solo cuando cambia el valor de params.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsKey]);

    const chipPairs = useMemo(() => {
        const arr = [];
        if (search) arr.push([true, `Búsqueda: ${search.length > 18 ? `${search.slice(0, 16)}…` : search}`]);
        for (const cfg of filtersConfig) {
            if (cfg.type === 'date-range') {
                const dv = filters[`${cfg.id}__desde`];
                const hv = filters[`${cfg.id}__hasta`];
                if (dv || hv) arr.push([true, cfg.label || 'Rango']);
            } else {
                const v = filters[cfg.id];
                if (v !== undefined && v !== '' && v !== null) {
                    const text = typeof cfg.summaryFormatter === 'function'
                        ? cfg.summaryFormatter(v)
                        : `${cfg.label}: ${String(v).length > 18 ? `${String(v).slice(0, 16)}…` : v}`;
                    arr.push([true, text]);
                }
            }
        }
        return arr;
    }, [search, filters, filtersConfig]);

    const chipLabel = useMemo(() => buildChipLabel(chipPairs), [chipPairs]);

    const openPanel = () => {
        setDraft({ ...filters });
        setPanelOpen(true);
    };

    const applyDraft = () => {
        setFilters({ ...draft });
        setPage(0);
        setPanelOpen(false);
    };

    const clearAll = () => {
        setDraft({});
        setFilters({});
        setPage(0);
        setPanelOpen(false);
    };

    const handleSearchChange = (v) => {
        setSearch(v);
        setPage(0);
    };

    const renderField = (cfg) => {
        if (cfg.type === 'date-range') {
            const dv = draft[`${cfg.id}__desde`] || '';
            const hv = draft[`${cfg.id}__hasta`] || '';
            return (
                <div key={cfg.id} className="flex flex-col gap-1.5">
                    <span className={labelCls}>{cfg.label}</span>
                    <div className="flex items-center gap-2">
                        <input
                            {...nativeCalendarOnlyInputProps}
                            type="date"
                            value={dv}
                            onChange={(e) =>
                                setDraft((s) => ({ ...s, [`${cfg.id}__desde`]: e.target.value }))
                            }
                            className={`${fieldCls} min-w-0 flex-1`}
                            aria-label={`${cfg.label}: desde`}
                        />
                        <span className={`${isLight ? 'text-slate-500' : 'text-slate-400'} shrink-0 text-xs`}>
                            a
                        </span>
                        <input
                            {...nativeCalendarOnlyInputProps}
                            type="date"
                            value={hv}
                            onChange={(e) =>
                                setDraft((s) => ({ ...s, [`${cfg.id}__hasta`]: e.target.value }))
                            }
                            className={`${fieldCls} min-w-0 flex-1`}
                            aria-label={`${cfg.label}: hasta`}
                        />
                    </div>
                </div>
            );
        }
        if (cfg.type === 'select' || cfg.type === 'tristate') {
            const opts =
                cfg.type === 'tristate'
                    ? [
                          { value: '', label: cfg.placeholder || 'Todos' },
                          { value: 'true', label: 'Sí' },
                          { value: 'false', label: 'No' }
                      ]
                    : [{ value: '', label: cfg.placeholder || 'Todos' }, ...normalizeOptions(cfg.options)];
            return (
                <div key={cfg.id} className="flex flex-col gap-1.5">
                    <label htmlFor={`drawer-${cfg.id}`} className={labelCls}>
                        {cfg.label}
                    </label>
                    <select
                        id={`drawer-${cfg.id}`}
                        value={draft[cfg.id] || ''}
                        onChange={(e) =>
                            setDraft((s) => ({ ...s, [cfg.id]: e.target.value }))
                        }
                        className={fieldCls}
                    >
                        {opts.map((o) => (
                            <option key={String(o.value)} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
            );
        }
        return (
            <div key={cfg.id} className="flex flex-col gap-1.5">
                <label htmlFor={`drawer-${cfg.id}`} className={labelCls}>
                    {cfg.label}
                </label>
                <input
                    id={`drawer-${cfg.id}`}
                    type="text"
                    value={draft[cfg.id] || ''}
                    onChange={(e) => setDraft((s) => ({ ...s, [cfg.id]: e.target.value }))}
                    placeholder={cfg.placeholder || ''}
                    className={fieldCls}
                />
            </div>
        );
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages - 1);

    return (
        <div className="flex flex-col gap-4">
            <div className={G.filterBar}>
                <OnboardingFiltersBar
                    chipLabel={chipLabel}
                    panelOpen={panelOpen}
                    onToggle={() => (panelOpen ? setPanelOpen(false) : openPanel())}
                    search={search}
                    onSearchChange={handleSearchChange}
                    searchPlaceholder={searchPlaceholder}
                    isLight={isLight}
                    rightSlot={headerRight}
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
                emptyText={loading ? 'Cargando…' : emptyText}
                onRowClick={onRowClick}
            />

            <div className={G.footerBar}>
                <div className="flex items-center gap-2">
                    <span>
                        {rows.length} de {total} registros
                    </span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(0);
                        }}
                        className={`${fieldCls} h-8 py-0 text-xs`}
                        aria-label="Mostrar por página"
                    >
                        {pageSizes.map((n) => (
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
                {filtersConfig.map(renderField)}
            </OnboardingFiltersDrawer>
        </div>
    );
}

function normalizeOptions(opts) {
    if (!Array.isArray(opts)) return [];
    return opts.map((o) => {
        if (typeof o === 'string' || typeof o === 'number') {
            return { value: String(o), label: String(o) };
        }
        return { value: String(o?.value ?? ''), label: String(o?.label ?? o?.value ?? '') };
    });
}
