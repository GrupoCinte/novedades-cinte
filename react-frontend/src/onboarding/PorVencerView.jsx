import { useEffect, useState } from 'react';
import { onboardingApi } from './api.js';
import OnboardingListView from './OnboardingListView.jsx';
import ColaboradorOnboardingModal from './ColaboradorOnboardingModal.jsx';
import { AlertaVencimientoBadge } from './onboardingBadges.jsx';
import { POR_VENCER_DEFAULT_SORT } from './onboardingSortDefaults.js';

function fmtFecha(v) {
    if (!v) return '';
    const s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function chUpper(value) {
    const s = String(value ?? '').trim();
    return s ? s.toLocaleUpperCase('es-CO') : '';
}

export async function fetchPorVencerCount(token) {
    try {
        const data = await onboardingApi.listPorVencer(token, { limit: 1 });
        return Number(data?.total) || 0;
    } catch {
        return 0;
    }
}

export default function PorVencerView({ auth, isLight, onCount }) {
    const token = auth?.token || '';
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        if (typeof onCount !== 'function') return undefined;
        let alive = true;
        fetchPorVencerCount(token).then((n) => {
            if (alive) onCount(n);
        });
        return () => {
            alive = false;
        };
    }, [token, onCount]);

    return (
        <>
            <OnboardingListView
                isLight={isLight}
                defaultSort={POR_VENCER_DEFAULT_SORT}
                fetcher={(params) => onboardingApi.listPorVencer(token, params)}
                searchPlaceholder="Buscar cédula, nombre o cliente…"
                emptyText="No hay contratos OPS, fijo u obra o labor por vencer en los próximos 30 días."
                onRowClick={(r) => setSelected({ cedula: r.cedula, contratoId: r.contrato_id })}
                filtersConfig={[
                    {
                        id: 'kind',
                        paramKey: 'kind',
                        label: 'Tanda',
                        type: 'select',
                        options: [
                            { value: 'T30', label: '30 días (amarillo)' },
                            { value: 'T15', label: '15 días (naranja)' },
                            { value: 'T5', label: '5 días (rojo)' }
                        ],
                        summaryFormatter: (v) =>
                            v === 'T5' ? 'Tanda: 5 días' : v === 'T15' ? 'Tanda: 15 días' : 'Tanda: 30 días'
                    },
                    { id: 'cliente', paramKey: 'cliente', label: 'Cliente', type: 'text' }
                ]}
                columns={[
                    { key: 'cedula', label: 'Cédula' },
                    { key: 'nombre', label: 'Nombre', render: (r) => chUpper(r.nombre) },
                    { key: 'cliente', label: 'Cliente', render: (r) => chUpper(r.cliente) },
                    { key: 'tipo_contrato', label: 'Tipo contrato' },
                    { key: 'fecha_termino', label: 'Vence', render: (r) => fmtFecha(r.fecha_termino) },
                    { key: 'dias_restantes', label: 'Faltan', render: (r) => r.dias_restantes },
                    {
                        key: 'banda',
                        label: 'Alerta',
                        sortable: false,
                        render: (r) => (
                            <AlertaVencimientoBadge kind={r.banda} dias={r.dias_restantes} isLight={isLight} />
                        )
                    }
                ]}
            />
            {selected ? (
                <ColaboradorOnboardingModal
                    auth={auth}
                    cedula={selected.cedula}
                    initialContratoId={selected.contratoId}
                    onClose={() => setSelected(null)}
                    onSaved={() => {}}
                />
            ) : null}
        </>
    );
}
