import { useState } from 'react';
import { Lock, KeyRound, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const nav = useNavigate();
  const auth = JSON.parse(localStorage.getItem('cinteAuth') || '{}');
  const token = auth?.token;

  async function onSubmit(e) {
    e.preventDefault();
    setMsg('');

    if (pw !== pw2) {
      setMsg('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: pw
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Error');

      setMsg('Contraseña actualizada correctamente. Cerrando sesión…');

      setTimeout(() => {
        localStorage.removeItem('cinteAuth');
        nav('/admin', { replace: true });
      }, 1500);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex justify-center items-center w-full min-h-[60vh] animate-in fade-in zoom-in duration-300">
      <div className="bg-[#0f2437] border border-[#21405f] rounded-2xl p-8 md:p-12 w-full max-w-md shadow-2xl relative overflow-hidden">
        
        {/* Barra degradada verde‑azul */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2a90ff] to-[#1fc76a]" />

        {/* Header del card */}
        <div className="text-center mb-8">
          <div className="bg-[#162a3d] border border-[#21405f] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="text-[#1fc76a]" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Cambiar contraseña</h1>
          <p className="text-[#9fb3c8] text-sm">
            Actualiza tu contraseña para mantener tu cuenta segura.
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={onSubmit} className="flex flex-col gap-5">

          {/* Contraseña actual */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">
              Contraseña actual
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-[#466683]" />
              </div>

              <input
                type="password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white 
                p-3 pl-10 rounded-lg focus:outline-none focus:border-[#2a90ff] 
                focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
            </div>
          </div>

          {/* Nueva contraseña */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">
              Nueva contraseña
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-[#466683]" />
              </div>

              <input
                type="password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white 
                p-3 pl-10 rounded-lg focus:outline-none focus:border-[#2a90ff] 
                focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
            </div>
          </div>

          {/* Confirmar contraseña */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">
              Confirmar contraseña
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-[#466683]" />
              </div>

              <input
                type="password"
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white 
                p-3 pl-10 rounded-lg focus:outline-none focus:border-[#2a90ff] 
                focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
            </div>
          </div>

          {/* Mensaje */}
          {msg && (
            <div className="bg-[#1a2b3b] border border-[#21405f] text-[#9fb3c8] text-sm p-3 rounded-lg">
              {msg}
            </div>
          )}

          {/* Botón */}
          <button
            disabled={loading}
            type="submit"
            className="w-full mt-2 bg-[#2a90ff] hover:bg-[#1a7ae0] 
            disabled:bg-[#21405f] disabled:text-[#9fb3c8] 
            text-white font-bold py-3.5 px-6 rounded-lg transition-colors 
            shadow-lg hover:shadow-[#2a90ff]/20"
          >
            {loading ? 'Actualizando…' : 'Guardar cambios'}
          </button>

          {/* Volver */}
          <div className="flex items-center justify-between mt-1">
            <Link to="/admin" className="text-sm text-[#9fb3c8] hover:text-white flex items-center gap-2">
              <ArrowLeft size={16} /> Volver al Panel
            </Link>
          </div>

        </form>
      </div>
    </div>
  );
}