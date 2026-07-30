import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModuleTheme } from '../moduleTheme.js';
import { ATRACCION_PAGE_MAIN, CINTE_BTN_PRIMARY } from './atraccionLayout.js';
import {
    connectIntegracion,
    connectIntegracionWorker,
    disconnectIntegracion,
    fetchAtraccionHealth,
    fetchIntegraciones
} from './atraccionApi.js';
import {
    captureSessionViaExtension,
    isConnectExtensionAvailable,
    isConnectExtensionStale,
    openProviderWorkspaceTab
} from './integrationConnectBridge.js';

const EXTENSION_PATH = 'integrations/cinte-session-bridge';

const ESTADO_UI = {
    conectado: { label: 'Conectado', className: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    conectando: { label: 'Conectando…', className: 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse' },
    expirado: { label: 'Sesión expirada', className: 'text-amber-700 bg-amber-50 border-amber-200' },
    error: { label: 'Error', className: 'text-red-600 bg-red-50 border-red-200' },
    desconectado: { label: 'No conectado', className: 'text-slate-600 bg-slate-50 border-slate-200' }
};

function EstadoBadge({ estado, isLight }) {
    const meta = ESTADO_UI[estado] || ESTADO_UI.desconectado;
    const dark = !isLight && estado === 'desconectado'
        ? 'text-slate-300 bg-slate-800/60 border-slate-600'
        : meta.className;
    return (
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${dark}`}>
            {meta.label}
        </span>
    );
}

/** El Empleo: solo navegador automático (la extensión no puede leer la sesión empresarial). */
function ElEmpleoCard({ row, token, isLight, onRefresh, onSessionSaved }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const cardInner = isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/50';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';
    const btnSecondary = isLight
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50';

    const waiting = pending || row.estado === 'conectando';
    const badgeEstado = waiting ? 'conectando' : row.estado;

    async function onConnect() {
        setError('');
        setBusy(true);
        setPending(true);
        try {
            await connectIntegracionWorker(token, 'elempleo');
            await onRefresh();
        } catch (e) {
            setPending(false);
            setError(e.message || 'No se pudo abrir el navegador. Avise a soporte.');
        } finally {
            setBusy(false);
        }
    }

    async function onDisconnect() {
        setError('');
        setBusy(true);
        setPending(false);
        try {
            await disconnectIntegracion(token, 'elempleo');
            await onRefresh();
        } catch (e) {
            setError(e.message || 'No se pudo desconectar');
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (!waiting) return undefined;
        const id = setInterval(() => { onRefresh({ includeHealth: false }); }, 3000);
        return () => clearInterval(id);
    }, [waiting, onRefresh]);

    useEffect(() => {
        if (!pending || row.estado !== 'conectado') return undefined;
        setPending(false);
        onSessionSaved?.('elempleo');
        return undefined;
    }, [pending, row.estado, onSessionSaved]);

    return (
        <li className={`rounded-xl border px-5 py-4 ${cardInner}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {row.label}
                    </h3>
                    <p className={`mt-1 text-sm ${muted}`}>{row.descripcion}</p>
                </div>
                <EstadoBadge estado={badgeEstado} isLight={isLight} />
            </div>

            <p className={`mt-3 text-sm ${muted}`}>
                Pulse <strong>Conectar El Empleo</strong>. Se abrirá Chrome en su PC — inicie sesión como empresa.
                CINTE guarda la sesión sola. <strong>No use «Guardar conexión»</strong> (no funciona con El Empleo).
            </p>

            {waiting ? (
                <p className="mt-3 text-sm text-amber-800">
                    Busque la <strong>ventana de Chrome</strong> en la barra de tareas (puede estar detrás de otras).
                    Entre al buscador de candidatos y <strong>no cierre</strong> esa ventana.
                </p>
            ) : null}

            {row.mensaje && !waiting ? (
                <p className={`mt-2 text-xs ${row.estado === 'conectado' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {row.mensaje}
                </p>
            ) : null}

            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
                {row.estado !== 'conectado' ? (
                    <button
                        type="button"
                        className={`${CINTE_BTN_PRIMARY} !px-5 !py-2.5 !text-sm`}
                        disabled={busy}
                        onClick={onConnect}
                    >
                        {busy ? 'Abriendo…' : waiting ? 'Reintentar conexión' : 'Conectar El Empleo'}
                    </button>
                ) : null}
                {waiting ? (
                    <button type="button" className={btnSecondary} disabled={busy} onClick={onDisconnect}>
                        Cancelar
                    </button>
                ) : null}
                {row.estado === 'conectado' ? (
                    <>
                        <button type="button" className={`${CINTE_BTN_PRIMARY} !px-4 !py-2 !text-xs`} disabled={busy} onClick={onConnect}>
                            Renovar sesión
                        </button>
                        <button type="button" className={btnSecondary} disabled={busy} onClick={onDisconnect}>
                            Desconectar
                        </button>
                    </>
                ) : null}
            </div>

            {row.connected_at ? (
                <p className={`mt-3 text-xs ${muted}`}>
                    Última conexión: {new Date(row.connected_at).toLocaleString('es-CO')}
                </p>
            ) : null}
        </li>
    );
}

function LinkedInCard({
    row,
    token,
    isLight,
    onRefresh,
    extensionReady,
    extensionStale,
    onSessionSaved
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loginOpened, setLoginOpened] = useState(false);
    const cardInner = isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/50';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';
    const btnSecondary = isLight
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50';

    const isRenewing = loginOpened && (row.estado === 'conectado' || row.estado === 'expirado');
    const isConnecting = row.estado === 'conectando' || (loginOpened && row.estado !== 'conectado' && row.estado !== 'expirado');
    const needsConnect = row.estado !== 'conectado' && row.estado !== 'expirado' && !isConnecting && !isRenewing;
    const showSaveSession = (isConnecting && row.estado !== 'conectado') || isRenewing;
    const badgeEstado = (isRenewing || isConnecting) ? 'conectando' : row.estado;

    async function onConnect() {
        setError('');
        setBusy(true);
        try {
            await connectIntegracion(token, row.provider);
            openProviderWorkspaceTab(row.provider);
            setLoginOpened(true);
            onRefresh({ poll: true });
        } catch (e) {
            setError(e.message || 'No se pudo iniciar conexión');
        } finally {
            setBusy(false);
        }
    }

    function onRenewSession() {
        setError('');
        openProviderWorkspaceTab(row.provider);
        setLoginOpened(true);
    }

    async function onSaveSession(ev) {
        ev?.preventDefault?.();
        setError('');
        setBusy(true);
        try {
            await captureSessionViaExtension(row.provider, token);
            setLoginOpened(false);
            await onRefresh();
            onSessionSaved?.(row.provider);
        } catch (e) {
            setError(e.message || 'No se pudo guardar la sesión');
        } finally {
            setBusy(false);
        }
    }

    async function onDisconnect() {
        setError('');
        setBusy(true);
        try {
            await disconnectIntegracion(token, row.provider);
            setLoginOpened(false);
            onRefresh();
        } catch (e) {
            setError(e.message || 'No se pudo desconectar');
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className={`rounded-xl border px-5 py-4 ${cardInner}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {row.label}
                    </h3>
                    <p className={`mt-1 text-sm ${muted}`}>{row.descripcion}</p>
                </div>
                <EstadoBadge estado={badgeEstado} isLight={isLight} />
            </div>

            {showSaveSession ? (
                <ol className={`mt-3 list-decimal space-y-1 pl-4 text-xs ${muted}`}>
                    <li>Inicie sesión en LinkedIn con la cuenta corporativa.</li>
                    <li>Vuelva aquí y pulse <strong>Guardar conexión</strong>.</li>
                </ol>
            ) : null}

            {row.mensaje && row.estado === 'conectado' && !isRenewing ? (
                <p className={`mt-3 text-xs ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{row.mensaje}</p>
            ) : null}

            {extensionStale ? (
                <p className="mt-3 text-xs text-amber-700">Recargue esta página (F5) antes de guardar.</p>
            ) : !extensionReady ? (
                <p className="mt-3 text-xs text-amber-700">
                    Instale el conector CINTE →{' '}
                    <code className="rounded bg-amber-100 px-1">{EXTENSION_PATH}</code>
                </p>
            ) : (
                <p className={`mt-3 text-xs ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>Conector detectado.</p>
            )}

            {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
                {needsConnect ? (
                    <button type="button" className={`${CINTE_BTN_PRIMARY} !px-4 !py-2 !text-xs`} disabled={busy} onClick={onConnect}>
                        {busy ? 'Abriendo…' : '1. Conectar cuenta'}
                    </button>
                ) : null}
                {showSaveSession ? (
                    <button type="button" className={`${CINTE_BTN_PRIMARY} !px-4 !py-2 !text-xs`} disabled={busy} onClick={onSaveSession}>
                        {busy ? 'Guardando…' : '2. Guardar conexión'}
                    </button>
                ) : null}
                {(row.estado === 'conectado' || row.estado === 'expirado') && !isRenewing ? (
                    <button type="button" className={`${CINTE_BTN_PRIMARY} !px-4 !py-2 !text-xs`} disabled={busy} onClick={onRenewSession}>
                        Renovar sesión
                    </button>
                ) : null}
                {row.estado === 'conectado' && !isRenewing ? (
                    <button type="button" className={btnSecondary} disabled={busy} onClick={onDisconnect}>
                        Desconectar
                    </button>
                ) : null}
            </div>
        </li>
    );
}

function IntegracionCard(props) {
    if (props.row.provider === 'elempleo') {
        return <ElEmpleoCard {...props} />;
    }
    if (props.row.provider === 'zoho_recruit') {
        return <ZohoRecruitCard {...props} />;
    }
    return <LinkedInCard {...props} />;
}

function ZohoRecruitCard({ row, token, isLight, onRefresh, pushZoho }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const cardInner = isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/50';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';
    const input = isLight
        ? 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
        : 'mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white';

    async function onSave() {
        setError('');
        setBusy(true);
        try {
            const { saveZohoTokens, disconnectZoho } = await import('./atraccionApi.js');
            if (!refreshToken.trim() && !accessToken.trim()) {
                throw new Error('Ingrese refresh_token o access_token de Zoho Recruit');
            }
            await saveZohoTokens(token, {
                refresh_token: refreshToken.trim() || undefined,
                access_token: accessToken.trim() || undefined
            });
            setRefreshToken('');
            setAccessToken('');
            await onRefresh();
        } catch (e) {
            setError(e.message || 'Error al conectar Zoho');
        } finally {
            setBusy(false);
        }
    }

    async function onDisconnect() {
        setBusy(true);
        try {
            const { disconnectZoho } = await import('./atraccionApi.js');
            await disconnectZoho(token);
            await onRefresh();
        } catch (e) {
            setError(e.message || 'Error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className={`rounded-xl border px-5 py-4 ${cardInner}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {row.label}
                    </h3>
                    <p className={`mt-1 text-sm ${muted}`}>{row.descripcion}</p>
                </div>
                <EstadoBadge estado={row.estado} isLight={isLight} />
            </div>
            <p className={`mt-3 text-sm ${muted}`}>
                Pegue el <strong>refresh_token</strong> OAuth de Zoho Recruit (API Console). Opcionalmente access_token temporal.
            </p>
            <p className={`mt-2 text-xs ${muted}`}>
                Push automático a Zoho (candidatos aprobados):{' '}
                <strong className={pushZoho ? 'text-emerald-600' : ''}>{pushZoho ? 'activo' : 'inactivo'}</strong>
                {' '}(variable servidor <code>SOURCING_PUSH_ZOHO</code>).
            </p>
            {row.estado !== 'conectado' ? (
                <div className="mt-3 space-y-2 max-w-lg">
                    <label className={`block text-xs ${muted}`}>
                        Refresh token
                        <input className={input} value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} />
                    </label>
                    <label className={`block text-xs ${muted}`}>
                        Access token (opcional)
                        <input className={input} value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
                    </label>
                </div>
            ) : null}
            {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
                {row.estado !== 'conectado' ? (
                    <button type="button" className={`${CINTE_BTN_PRIMARY} !px-4 !py-2 !text-xs`} disabled={busy} onClick={onSave}>
                        {busy ? 'Guardando…' : 'Conectar Zoho'}
                    </button>
                ) : (
                    <button type="button" className={`${CINTE_BTN_PRIMARY} !px-4 !py-2 !text-xs`} disabled={busy} onClick={onDisconnect}>
                        Desconectar
                    </button>
                )}
            </div>
        </li>
    );
}

export default function AtraccionIntegracionesPage({ token }) {
    const navigate = useNavigate();
    const { isLight } = useModuleTheme();
    const card = isLight
        ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
        : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [extensionReady, setExtensionReady] = useState(false);
    const [extensionStale, setExtensionStale] = useState(false);
    const [health, setHealth] = useState(null);

    const load = useCallback(async ({ includeHealth = false } = {}) => {
        try {
            if (includeHealth) {
                const h = await fetchAtraccionHealth(token);
                setHealth(h);
            }
            const list = await fetchIntegraciones(token);
            setRows(list);
            setError('');
            return list;
        } catch (e) {
            setError(e.message || 'Error al cargar integraciones');
            return [];
        } finally {
            setLoading(false);
        }
    }, [token]);

    const handleSessionSaved = useCallback((provider) => {
        const label = provider === 'elempleo' ? 'El Empleo' : 'LinkedIn';
        navigate('/admin/atraccion-talento/shortlist', {
            replace: false,
            state: { flash: `${label} conectado. Ya puede buscar candidatos.` }
        });
    }, [navigate]);

    useEffect(() => { load({ includeHealth: true }); }, [load]);

    useEffect(() => {
        const check = () => {
            setExtensionReady(isConnectExtensionAvailable());
            setExtensionStale(isConnectExtensionStale());
        };
        check();
        const id = setInterval(check, 3000);
        return () => clearInterval(id);
    }, []);

    return (
        <main className={ATRACCION_PAGE_MAIN}>
            <div className={card}>
                {loading ? (
                    <p className={`text-sm ${muted}`}>Cargando…</p>
                ) : error ? (
                    <p className="text-sm text-red-500">{error}</p>
                ) : (
                    <ul className="space-y-4">
                        {rows.map((row) => (
                            <IntegracionCard
                                key={row.provider}
                                row={row}
                                token={token}
                                isLight={isLight}
                                extensionReady={extensionReady}
                                extensionStale={extensionStale}
                                onSessionSaved={handleSessionSaved}
                                onRefresh={load}
                                pushZoho={Boolean(health?.pushZoho)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </main>
    );
}
