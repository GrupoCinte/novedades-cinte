import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, Calculator, Users } from 'lucide-react';
import { userHasNovedadesAdminAccess, userHasCotizadorAccess } from './comercialAccess';
import { userHasContratacionPanel } from './contratacion/contratacionAccess';
import { userHasDirectorioPanel } from './directorioAccess';
import UserAccountMenu from './UserAccountMenu.jsx';
import { useUiTheme } from './UiThemeContext.jsx';

function resolveWelcomeName(auth) {
    const u = auth?.user && typeof auth.user === 'object' ? auth.user : {};
    const c = auth?.claims && typeof auth.claims === 'object' ? auth.claims : {};
    const name = String(u.name || u.given_name || c.name || c.given_name || '').trim();
    if (name) {
        const token = name.split(/\s+/)[0] || name;
        if (token.includes('@')) return token.split('@')[0] || 'Usuario';
        return token;
    }
    const email = String(u.email || c.email || '').trim().toLowerCase();
    if (email.includes('@')) return email.split('@')[0];
    return 'Usuario';
}

/** Estilos de tarjeta por módulo: modo oscuro y claro */
function cardVisuals(key) {
    const map = {
        novedades: {
            dark: {
                shell: 'border border-[#65BCF7]/18 bg-gradient-to-br from-[#2F7BB8]/10 via-[#0b2844]/18 to-[#04141E]/28 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-[#65BCF7]/34 hover:shadow-[0_14px_48px_-8px_rgba(47,123,184,0.28)]',
                bar: 'bg-[#2F7BB8]/90',
                iconWrap: 'border border-[#65BCF7]/25 bg-[#2F7BB8]/14 text-[#a8dcff] backdrop-blur-md',
                title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-[#a8dcff]',
                desc: 'text-slate-100/88 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]',
                cta: 'text-[#a8dcff] drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]'
            },
            light: {
                shell: 'border border-sky-200/38 bg-gradient-to-br from-white/28 via-sky-50/22 to-blue-50/26 shadow-[0_8px_36px_-12px_rgba(14,116,188,0.12)] hover:border-sky-300/55 hover:shadow-[0_14px_44px_-10px_rgba(14,116,188,0.18)]',
                bar: 'bg-[#2F7BB8]',
                iconWrap: 'border border-sky-300/45 bg-sky-100/40 text-[#1e5a8a] backdrop-blur-md',
                title: 'text-slate-900 group-hover:text-[#2F7BB8]',
                desc: 'text-slate-700/92',
                cta: 'text-[#2F7BB8]'
            }
        },
        comercial: {
            dark: {
                shell: 'border border-[#088DC6]/20 bg-gradient-to-br from-[#088DC6]/10 via-[#052c3d]/18 to-[#04141E]/28 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-[#5ecfff]/32 hover:shadow-[0_14px_48px_-8px_rgba(8,141,198,0.26)]',
                bar: 'bg-[#088DC6]/90',
                iconWrap: 'border border-cyan-400/22 bg-[#088DC6]/12 text-[#b8efff] backdrop-blur-md',
                title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-[#7ddbff]',
                desc: 'text-slate-100/88 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]',
                cta: 'text-[#b8f6ff] drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]'
            },
            light: {
                shell: 'border border-cyan-200/42 bg-gradient-to-br from-white/26 via-cyan-50/20 to-sky-50/24 shadow-[0_8px_36px_-12px_rgba(8,141,198,0.12)] hover:border-cyan-300/60 hover:shadow-[0_14px_44px_-10px_rgba(8,141,198,0.17)]',
                bar: 'bg-[#088DC6]',
                iconWrap: 'border border-cyan-300/48 bg-cyan-100/38 text-[#0a5f7a] backdrop-blur-md',
                title: 'text-slate-900 group-hover:text-[#088DC6]',
                desc: 'text-slate-700/92',
                cta: 'text-[#088DC6]'
            }
        },
        contratacion: {
            dark: {
                shell: 'border border-[#2F7BB8]/18 bg-gradient-to-br from-[#004D87]/10 via-[#062440]/20 to-[#041a30]/30 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-[#65BCF7]/30 hover:shadow-[0_14px_48px_-8px_rgba(0,77,135,0.24)]',
                bar: 'bg-[#004D87]/90',
                iconWrap: 'border border-[#2F7BB8]/25 bg-[#004D87]/14 text-[#b3d4f5] backdrop-blur-md',
                title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-[#b3d4f5]',
                desc: 'text-slate-100/88 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]',
                cta: 'text-[#b3daf5] drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]'
            },
            light: {
                shell: 'border border-blue-200/45 bg-gradient-to-br from-white/26 via-blue-50/18 to-slate-50/24 shadow-[0_8px_36px_-12px_rgba(0,77,135,0.1)] hover:border-blue-300/65 hover:shadow-[0_14px_44px_-10px_rgba(0,77,135,0.16)]',
                bar: 'bg-[#004D87]',
                iconWrap: 'border border-blue-300/48 bg-blue-100/38 text-[#003366] backdrop-blur-md',
                title: 'text-slate-900 group-hover:text-[#004D87]',
                desc: 'text-slate-700/92',
                cta: 'text-[#004D87]'
            }
        },
        directorio: {
            dark: {
                shell: 'border border-slate-400/16 bg-gradient-to-br from-[#1a5f8a]/10 via-[#0a2538]/18 to-[#061820]/28 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-[#65BCF7]/28 hover:shadow-[0_14px_48px_-8px_rgba(26,95,138,0.24)]',
                bar: 'bg-[#1a5f8a]/90',
                iconWrap: 'border border-slate-400/20 bg-[#1a5f8a]/12 text-[#c5d6e6] backdrop-blur-md',
                title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-[#9fd4ff]',
                desc: 'text-slate-100/88 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]',
                cta: 'text-[#c8dae8] drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]'
            },
            light: {
                shell: 'border border-slate-300/48 bg-gradient-to-br from-white/28 via-slate-100/22 to-slate-50/26 shadow-[0_8px_36px_-12px_rgba(26,95,138,0.1)] hover:border-slate-400/65 hover:shadow-[0_14px_44px_-10px_rgba(26,95,138,0.15)]',
                bar: 'bg-[#1a5f8a]',
                iconWrap: 'border border-slate-400/42 bg-slate-200/40 text-[#0f3550] backdrop-blur-md',
                title: 'text-slate-900 group-hover:text-[#1a5f8a]',
                desc: 'text-slate-700/92',
                cta: 'text-[#1a5f8a]'
            }
        }
    };
    return map[key] || map.novedades;
}

/**
 * Hub de inicio: banner desde el borde superior con logo/título y acciones superpuestas; fila de módulos.
 */
export default function AdminPortalHome({ auth, onLogout }) {
    const navigate = useNavigate();
    const { theme } = useUiTheme();
    const isLight = theme === 'light';
    const firstName = useMemo(() => resolveWelcomeName(auth), [auth]);

    const cards = useMemo(() => {
        const out = [];
        if (userHasNovedadesAdminAccess(auth)) {
            out.push({
                key: 'novedades',
                title: 'Gestión de Novedades',
                description: 'Registro, seguimiento y reportes de incidencias.',
                path: '/admin/novedades',
                Icon: Briefcase
            });
        }
        if (userHasCotizadorAccess(auth)) {
            out.push({
                key: 'comercial',
                title: 'Módulo Comercial',
                description: 'Gestión de clientes, ventas y oportunidades (cotizador).',
                path: '/admin/comercial',
                Icon: Calculator
            });
        }
        if (userHasContratacionPanel(auth)) {
            out.push({
                key: 'contratacion',
                title: 'Capital Humano Onboarding',
                description: 'Trámites, beneficios, capacitación y desarrollo.',
                path: '/admin/contratacion',
                Icon: Users
            });
        }
        if (userHasDirectorioPanel(auth)) {
            out.push({
                key: 'directorio',
                title: 'Módulo de administración',
                description: 'Configuración de catálogo, permisos y datos maestros del directorio.',
                path: '/admin/directorio',
                Icon: Building2
            });
        }
        return out;
    }, [auth]);

    /** Mismo color que el subtítulo «SISTEMA UNIFICADO DE GESTIÓN». */
    const sectionModulesLabel = isLight ? 'text-[#004D87] drop-shadow-sm' : 'text-white drop-shadow-md';

    /** Misma idea que FormularioNovedad: cobertura total + `fixed` para efecto pantalla completa. */
    const heroBgStyle = isLight
        ? {
              backgroundImage: `linear-gradient(135deg, rgba(248,250,252,0.88) 0%, rgba(186,230,253,0.55) 100%), url('/assets/banner-cinte-admin.png')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundAttachment: 'fixed'
          }
        : {
              backgroundImage: `linear-gradient(135deg, rgba(4,20,30,0.88) 0%, rgba(0,77,135,0.55) 100%), url('/assets/banner-cinte-admin.png')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundAttachment: 'fixed'
          };

    return (
        <section
            className={`relative flex min-h-[100dvh] min-h-screen w-full flex-col overflow-x-hidden overflow-y-auto font-body ${
                isLight ? 'text-slate-800' : 'text-slate-200'
            }`}
        >
            <div className="pointer-events-none absolute inset-0 z-0" style={heroBgStyle} aria-hidden />
            <div
                className={`pointer-events-none absolute inset-0 z-0 ${isLight ? 'bg-slate-100/35 backdrop-blur-[1px]' : 'bg-[#04141E]/40 backdrop-blur-[2px]'}`}
                aria-hidden
            />
            {/* Oscurece la parte baja para que tarjetas y texto se lean sobre la foto */}
            <div
                className={`pointer-events-none absolute inset-0 z-0 bg-gradient-to-t ${isLight ? 'from-white/85 via-white/25 to-transparent' : 'from-black/80 via-black/20 to-transparent'}`}
                aria-hidden
            />

            <div className="relative z-10 flex w-full flex-1 min-h-0 flex-col px-3 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 md:px-10">
                <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="inline-flex min-w-0 max-w-full flex-col items-center gap-1.5 text-center">
                        {/*
                          Misma caja; el PNG claro suele llevar más “aire” en el lienzo → object-contain lo deja más chico.
                          En tema claro un scale compensa para igualar el tamaño visual al logo oscuro.
                        */}
                        <div className="mx-auto flex h-[4.35rem] w-[min(100%,11.875rem)] max-w-full items-center justify-center overflow-visible px-1 py-1 sm:h-[4.65rem] sm:w-[min(100%,13.125rem)] sm:px-1.5 sm:py-1.5 md:h-[5rem] md:w-[min(100%,14.375rem)]">
                            <img
                                src={isLight ? '/assets/logo-cinte-header-light.png' : '/assets/logo-cinte-header.png'}
                                alt="CINTE"
                                className={`h-full w-full object-contain object-center drop-shadow-lg ${
                                    isLight ? 'origin-center scale-[1.72] sm:scale-[1.63] md:scale-[1.55]' : ''
                                }`}
                            />
                        </div>
                        <p
                            className={`w-full max-w-[min(100%,230px)] font-heading text-[10px] font-extrabold uppercase leading-tight tracking-wide drop-shadow-md sm:text-xs ${
                                isLight ? 'text-[#004D87]' : 'text-white'
                            }`}
                        >
                            SISTEMA UNIFICADO DE GESTIÓN
                        </p>
                    </div>
                    <UserAccountMenu auth={auth} onLogout={onLogout} surface="banner" notificationCount={0} />
                </div>

                {/* Bienvenida + módulos centrados en vertical (espacio bajo cabecera) y en horizontal */}
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-6 text-center sm:gap-4 sm:py-10">
                    <h1
                        className={`w-full font-heading text-2xl font-extrabold drop-shadow-md sm:text-3xl md:text-4xl ${
                            isLight ? 'text-[#004D87]' : 'text-white'
                        }`}
                    >
                        ¡Bienvenid@, {firstName}!
                    </h1>
                    <h2
                        className={`w-full text-center text-[10px] font-heading font-black uppercase tracking-[0.2em] sm:text-xs ${sectionModulesLabel}`}
                    >
                        Módulos de gestión
                    </h2>
                    <div className="mx-auto flex w-full max-w-6xl flex-row flex-nowrap items-stretch justify-center gap-2 overflow-x-auto px-1 pb-1 sm:gap-3 md:overflow-x-visible">
                        {cards.map(({ key, title, description, path, Icon }) => {
                            const v = cardVisuals(key)[isLight ? 'light' : 'dark'];
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => navigate(path)}
                                    className={`group relative flex h-auto min-w-0 max-w-sm flex-1 basis-0 flex-col items-center overflow-hidden rounded-xl px-3 py-3 text-center shadow-lg backdrop-blur-3xl backdrop-saturate-150 transition-all duration-200 hover:-translate-y-0.5 sm:rounded-2xl sm:px-4 sm:py-4 md:py-5 ${
                                        isLight
                                            ? 'ring-1 ring-inset ring-white/55 [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.42)]'
                                            : 'ring-1 ring-inset ring-white/[0.1] [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                                    } ${v.shell}`}
                                >
                                    <span
                                        className={`absolute left-0 top-0 h-full w-1 rounded-l-xl sm:w-1.5 sm:rounded-l-2xl ${v.bar}`}
                                        aria-hidden
                                    />
                                    <div className="flex w-full flex-col items-center px-1 sm:px-2">
                                        <div
                                            className={`mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border sm:mb-3 sm:h-12 sm:w-12 sm:rounded-xl md:h-14 md:w-14 ${v.iconWrap}`}
                                        >
                                            <Icon size={24} strokeWidth={1.75} className="opacity-95" />
                                        </div>
                                        <h3
                                            className={`line-clamp-2 w-full font-heading text-sm font-bold leading-tight sm:text-base md:text-lg ${v.title}`}
                                        >
                                            {title}
                                        </h3>
                                        <p
                                            className={`mt-1 line-clamp-4 w-full text-[11px] leading-snug sm:mt-2 sm:text-xs md:text-sm ${v.desc}`}
                                        >
                                            {description}
                                        </p>
                                        <span
                                            className={`mt-3 shrink-0 text-[9px] font-bold uppercase tracking-wide sm:mt-4 sm:text-[10px] md:text-xs ${v.cta}`}
                                        >
                                            Entrar →
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
