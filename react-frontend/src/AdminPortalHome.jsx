import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, Calculator, KeyRound, LogOut, Users } from 'lucide-react';
import { userHasNovedadesAdminAccess, userHasCotizadorAccess } from './comercialAccess';
import { userHasContratacionPanel } from './contratacion/contratacionAccess';
import { userHasDirectorioPanel } from './directorioAccess';

function resolveWelcomeName(auth) {
    const u = auth?.user && typeof auth.user === 'object' ? auth.user : {};
    const c = auth?.claims && typeof auth.claims === 'object' ? auth.claims : {};
    const name = String(u.name || u.given_name || c.name || c.given_name || '').trim();
    if (name) return name.split(/\s+/)[0] || name;
    const email = String(u.email || c.email || '').trim().toLowerCase();
    if (email.includes('@')) return email.split('@')[0];
    return 'Usuario';
}

/**
 * Hub de inicio del portal admin: tarjetas por módulo según permisos (misma lógica que la antigua barra superior).
 */
export default function AdminPortalHome({ auth, onLogout }) {
    const navigate = useNavigate();
    const firstName = useMemo(() => resolveWelcomeName(auth), [auth]);

    const cards = useMemo(() => {
        const out = [];
        if (userHasNovedadesAdminAccess(auth)) {
            out.push({
                key: 'novedades',
                title: 'Gestión de Novedades',
                description: 'Registro, seguimiento y reportes de incidencias.',
                path: '/admin/novedades',
                Icon: Briefcase,
                ring: 'ring-[#2F7BB8]/35 hover:ring-[#2F7BB8]/60',
                iconBg: 'bg-[#2F7BB8]/20 text-[#65BCF7]'
            });
        }
        if (userHasCotizadorAccess(auth)) {
            out.push({
                key: 'comercial',
                title: 'Módulo Comercial',
                description: 'Gestión de clientes, ventas y oportunidades (cotizador).',
                path: '/admin/comercial',
                Icon: Calculator,
                ring: 'ring-[#088DC6]/35 hover:ring-[#088DC6]/60',
                iconBg: 'bg-[#088DC6]/20 text-[#5ecfff]'
            });
        }
        if (userHasContratacionPanel(auth)) {
            out.push({
                key: 'contratacion',
                title: 'Capital Humano Onboarding',
                description: 'Trámites, beneficios, capacitación y desarrollo.',
                path: '/admin/contratacion',
                Icon: Users,
                ring: 'ring-[#004D87]/40 hover:ring-[#65BCF7]/50',
                iconBg: 'bg-[#004D87]/25 text-[#7eb8ea]'
            });
        }
        if (userHasDirectorioPanel(auth)) {
            out.push({
                key: 'directorio',
                title: 'Módulo de administración',
                description: 'Configuración de catálogo, permisos y datos maestros del directorio.',
                path: '/admin/directorio',
                Icon: Building2,
                ring: 'ring-[#1a5f8a]/40 hover:ring-[#65BCF7]/50',
                iconBg: 'bg-[#1a5f8a]/25 text-[#9fb3c8]'
            });
        }
        return out;
    }, [auth]);

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[#04141E] font-body text-slate-200">
            <div className="border-b border-[#1a3a56]/80 bg-gradient-to-r from-[#0b1e30] via-[#04141E] to-[#0b1e30] px-4 py-4 md:px-10 md:py-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-[10px] font-heading font-black uppercase tracking-[0.2em] text-[#65BCF7]/90">
                            Sistema unificado de gestión
                        </p>
                        <h1 className="mt-1 font-heading text-2xl font-extrabold text-white md:text-3xl">
                            ¡Bienvenido/a, {firstName}!
                        </h1>
                        <p className="mt-2 max-w-xl text-sm text-[#9fb3c8]">
                            Elige un módulo para continuar. Solo verás las tarjetas asociadas a tu rol.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/perfil/cambiar-clave')}
                            className="inline-flex items-center gap-2 rounded-lg border border-[#1a3a56] bg-[#0f2942]/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-[#0f2942]"
                        >
                            <KeyRound size={14} />
                            Cambiar contraseña
                        </button>
                        <button
                            type="button"
                            onClick={() => onLogout?.()}
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                        >
                            <LogOut size={14} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </div>

            <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-10">
                <h2 className="text-center text-xs font-heading font-black uppercase tracking-[0.25em] text-[#9fb3c8] md:text-left">
                    Módulos de gestión
                </h2>
                <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-2">
                    {cards.map(({ key, title, description, path, Icon, ring, iconBg }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => navigate(path)}
                            className={`group relative flex flex-col overflow-hidden rounded-2xl border border-[#1a3a56] bg-[#0b1e30]/90 p-6 text-left shadow-lg ring-1 ring-transparent transition-all hover:border-[#2F7BB8]/40 hover:bg-[#0f2942]/80 ${ring}`}
                        >
                            <div
                                className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/5 ${iconBg}`}
                            >
                                <Icon size={28} strokeWidth={1.75} className="opacity-95" />
                            </div>
                            <h3 className="font-heading text-lg font-bold text-white group-hover:text-[#65BCF7]">{title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-[#9fb3c8]">{description}</p>
                            <span className="mt-4 text-xs font-bold uppercase tracking-widest text-[#65BCF7]">
                                Entrar →
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
