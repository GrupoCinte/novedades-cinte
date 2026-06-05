import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, Moon, Sun, User } from 'lucide-react';
import { useUiTheme } from './UiThemeContext.jsx';

export default function AdminAccountSettingsPage({ auth, onLogout }) {
    const { theme, toggleTheme } = useUiTheme();
    const isLight = theme === 'light';
    const user = auth?.user && typeof auth.user === 'object' ? auth.user : {};
    const email = String(user.email || '').trim();
    const name = String(user.name || '').trim();

    return (
        <div
            className={`mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 font-body sm:p-10 ${
                isLight ? 'text-slate-800' : 'text-slate-200'
            }`}
        >
            <div>
                <Link
                    to="/admin"
                    className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
                        isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <ArrowLeft size={16} />
                    Volver al portal
                </Link>
                <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight">Configuración de cuenta</h1>
                <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    Preferencias de tu sesión en el portal administrativo.
                </p>
            </div>

            <section
                className={`rounded-xl border p-5 ${
                    isLight ? 'border-slate-200 bg-white shadow-sm' : 'border-[#1a3a56] bg-[#0b1e30]'
                }`}
            >
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                    <User size={16} className="opacity-80" />
                    Perfil
                </h2>
                <dl className={`mt-3 space-y-2 text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {name ? (
                        <div>
                            <dt className="text-xs font-medium uppercase opacity-70">Nombre</dt>
                            <dd>{name}</dd>
                        </div>
                    ) : null}
                    {email ? (
                        <div>
                            <dt className="text-xs font-medium uppercase opacity-70">Correo</dt>
                            <dd>{email}</dd>
                        </div>
                    ) : null}
                </dl>
            </section>

            <section
                className={`rounded-xl border p-5 ${
                    isLight ? 'border-slate-200 bg-white shadow-sm' : 'border-[#1a3a56] bg-[#0b1e30]'
                }`}
            >
                <h2 className="text-sm font-semibold uppercase tracking-wide">Apariencia</h2>
                <p className={`mt-2 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    El tema se aplica a todo el portal administrativo.
                </p>
                <button
                    type="button"
                    onClick={toggleTheme}
                    className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        isLight
                            ? 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100'
                            : 'border-[#1a3a56] bg-[#04141E] text-slate-200 hover:bg-[#0f2942]'
                    }`}
                >
                    {isLight ? <Moon size={18} /> : <Sun size={18} />}
                    {isLight ? 'Activar modo oscuro' : 'Activar modo claro'}
                </button>
            </section>

            <section
                className={`rounded-xl border p-5 ${
                    isLight ? 'border-slate-200 bg-white shadow-sm' : 'border-[#1a3a56] bg-[#0b1e30]'
                }`}
            >
                <h2 className="text-sm font-semibold uppercase tracking-wide">Seguridad</h2>
                <Link
                    to="/perfil/cambiar-clave"
                    className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        isLight
                            ? 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100'
                            : 'border-[#1a3a56] bg-[#04141E] text-slate-200 hover:bg-[#0f2942]'
                    }`}
                >
                    <KeyRound size={18} />
                    Cambiar contraseña
                </Link>
            </section>

            <div className="pt-2">
                <button
                    type="button"
                    onClick={() => onLogout?.()}
                    className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
                >
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
}
