import { useState } from 'react';
import { Lock, User } from 'lucide-react';

export default function Login({ setAuth }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok && data.token) {
                // Return auth payload up to App state and persist to localStorage
                const authData = { token: data.token, username };
                localStorage.setItem('cinteAuth', JSON.stringify(authData));
                setAuth(authData);
            } else {
                setError(data.error || 'Autenticación fallida');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión con el servidor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-center w-full min-h-[60vh] animate-in fade-in zoom-in duration-300">
            <div className="bg-[#0f2437] border border-[#21405f] rounded-2xl p-8 md:p-12 w-full max-w-md shadow-2xl relative overflow-hidden">
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
                        <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Usuario</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User size={18} className="text-[#466683]" />
                            </div>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Ingresa tu usuario"
                                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 pl-10 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock size={18} className="text-[#466683]" />
                            </div>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 pl-10 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b] text-sm p-3 rounded-lg text-center animate-in mb-2 mt-2 font-medium">
                            {error}
                        </div>
                    )}

                    <button
                        disabled={loading}
                        type="submit"
                        className="w-full mt-2 bg-[#2a90ff] hover:bg-[#1a7ae0] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-3.5 px-6 rounded-lg transition-colors shadow-lg hover:shadow-[#2a90ff]/20 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Verificando...' : 'Iniciar Sesión'}
                    </button>
                </form>
            </div>
        </div>
    );
}
