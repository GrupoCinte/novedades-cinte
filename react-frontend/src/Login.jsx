import { useState } from 'react';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cognitoCompleteNewPassword, cognitoSignIn } from './cognitoAuth';

export default function Login({ setAuth }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('+57');
    const [challengeSession, setChallengeSession] = useState('');
    const [roleRequested, setRoleRequested] = useState('');
    const nav = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const authData = await cognitoSignIn(username, password, roleRequested);
            if (!authData?.token) {
                throw new Error('Autenticación fallida');
            }
            localStorage.setItem('cinteAuth', JSON.stringify(authData));
            setAuth(authData);
            nav('/admin', { replace: true });
        } catch (err) {
            console.error(err);
            const msg = err?.message || '';
            if (err?.status === 409 && err?.payload?.challenge === 'NEW_PASSWORD_REQUIRED') {
                setChallengeSession(err?.payload?.session || '');
                setError('Debes definir una nueva contraseña para completar el primer acceso.');
                return;
            }
            if (/not authorized|incorrect username or password/i.test(msg)) {
                setError('Credenciales inválidas');
            } else if (/user is not confirmed/i.test(msg)) {
                setError('Usuario no confirmado en Cognito');
            } else if (/password reset required/i.test(msg)) {
                setError('Debes restablecer la contraseña en Cognito');
            } else {
                setError(msg || 'Error autenticando con Cognito');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteNewPassword = async (e) => {
        e.preventDefault();
        setError('');
        if (!challengeSession) {
            setError('No hay sesión de reto activa. Intenta iniciar sesión otra vez.');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setError('La nueva contraseña y su confirmación no coinciden.');
            return;
        }
        const phone = phoneNumber.trim();
        if (!phone || phone === '+57') {
            setError('Debes ingresar tu teléfono en formato internacional (+57...).');
            return;
        }
        setLoading(true);
        try {
            const authData = await cognitoCompleteNewPassword(username, challengeSession, newPassword, phone, roleRequested);
            localStorage.setItem('cinteAuth', JSON.stringify(authData));
            setAuth(authData);
            nav('/admin', { replace: true });
        } catch (err) {
            console.error(err);
            setError(err?.message || 'No fue posible completar el cambio de contraseña.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-start w-full h-full overflow-y-auto py-6 animate-in fade-in zoom-in duration-300">
            <div className="bg-[#0f2437] border border-[#21405f] rounded-2xl p-8 md:p-12 w-full max-w-md shadow-2xl relative overflow-hidden max-h-[calc(100vh-10rem)] overflow-y-auto">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2a90ff] to-[#1fc76a]"></div>

                <div className="text-center mb-8">
                    <div className="bg-[#162a3d] border border-[#21405f] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="text-[#2a90ff]" size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Acceso a RR. HH.</h1>
                    <p className="text-[#9fb3c8] text-sm">Escritorio de gestión de Novedades</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Usuario (correo)</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User size={18} className="text-[#466683]" />
                            </div>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="usuario@empresa.com"
                                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 pl-10 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Ingresar como rol</label>
                        <select
                            value={roleRequested}
                            onChange={(e) => setRoleRequested(e.target.value)}
                            className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all"
                        >
                            <option value="">Mi rol asignado</option>
                            <option value="super_admin">SUPER ADMIN</option>
                            <option value="admin_ch">ADMIN CH</option>
                            <option value="admin_ops">ADMIN OPS</option>
                            <option value="gp">GP</option>
                            <option value="team_ch">TEAM CH</option>
                            <option value="nomina">NOMINA</option>
                            <option value="sst">SST</option>
                        </select>
                        <small className="text-[#9fb3c8] text-xs">
                            Solo usuarios con rol base <strong>super_admin</strong> pueden asumir un rol distinto.
                        </small>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock size={18} className="text-[#466683]" />
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 pl-10 pr-10 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9fb3c8] hover:text-white"
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b] text-sm p-3 rounded-lg text-center animate-in mb-2 mt-2 font-medium">
                            {error}
                        </div>
                    )}

                    {challengeSession && (
                        <div className="mt-2 p-4 rounded-lg border border-[#21405f] bg-[#162a3d]/60 flex flex-col gap-3">
                            <div className="text-sm text-[#9fb3c8] font-semibold">Primer acceso: define nueva contraseña</div>
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Nueva contraseña"
                                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                            />
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                placeholder="Confirmar nueva contraseña"
                                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                            />
                            <input
                                type="text"
                                value={phoneNumber}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v) {
                                        setPhoneNumber('+57');
                                        return;
                                    }
                                    if (!v.startsWith('+57')) {
                                        setPhoneNumber(`+57${v.replace(/^\+?57?/, '')}`);
                                        return;
                                    }
                                    setPhoneNumber(v);
                                }}
                                placeholder="Teléfono (ej: +573001112233)"
                                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword((v) => !v)}
                                className="text-xs text-[#9fb3c8] hover:text-white text-left"
                            >
                                {showNewPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                            </button>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={handleCompleteNewPassword}
                                className="w-full bg-[#1fc76a] hover:bg-[#18a85a] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-3 rounded-lg transition-colors"
                            >
                                {loading ? 'Procesando...' : 'Guardar nueva contraseña y continuar'}
                            </button>
                        </div>
                    )}

                    <button
                        disabled={loading}
                        type="submit"
                        className="w-full mt-2 bg-[#2a90ff] hover:bg-[#1a7ae0] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-3.5 px-6 rounded-lg transition-colors shadow-lg hover:shadow-[#2a90ff]/20 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Verificando...' : 'Iniciar Sesión'}
                    </button>
                    <div className="mt-1 text-right">
                        <Link to="/admin/forgot" className="text-sm text-[#2a90ff] hover:underline">
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
