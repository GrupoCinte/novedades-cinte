import { useState } from 'react';
import { Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cognitoResetPassword } from './cognitoAuth';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (pw !== pw2) {
      setMsg('Las contraseñas no coinciden');
      return;
    }
    if (!email || !code) {
      setMsg('Debes ingresar correo y código de verificación.');
      return;
    }
    setLoading(true);
    try {
      await cognitoResetPassword(email, code, pw);
      setMsg('Listo. Tu contraseña fue actualizada.');
      setTimeout(() => nav('/admin', { replace: true }), 1200);
    } catch (err) {
      setMsg(err?.message || 'Error al restablecer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center w-full min-h-[60vh] animate-in fade-in zoom-in duration-300">
      <div className="bg-[#0f2437] border border-[#21405f] rounded-2xl p-8 md:p-12 w-full max-w-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2a90ff] to-[#1fc76a]" />
        <div className="text-center mb-8">
          <div className="bg-[#162a3d] border border-[#21405f] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="text-[#1fc76a]" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Restablecer contraseña</h1>
          <p className="text-[#9fb3c8] text-sm">Ingresa y confirma tu nueva contraseña.</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Código de verificación</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código enviado por Cognito"
              className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Nueva contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-[#466683]" />
              </div>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 pl-10 pr-10 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
              <button
                type="button"
                onClick={() => setShowPw((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9fb3c8] hover:text-white"
                aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Confirmar contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-[#466683]" />
              </div>
              <input
                type={showPw2 ? 'text' : 'password'}
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 pl-10 pr-10 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
              <button
                type="button"
                onClick={() => setShowPw2((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9fb3c8] hover:text-white"
                aria-label={showPw2 ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPw2 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!!msg && (
            <div className="bg-[#1a2b3b] border border-[#21405f] text-[#9fb3c8] text-sm p-3 rounded-lg">
              {msg}
            </div>
          )}

          <button
            disabled={loading}
            type="submit"
            className="w-full mt-1 bg-[#2a90ff] hover:bg-[#1a7ae0] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-3.5 px-6 rounded-lg transition-colors shadow-lg hover:shadow-[#2a90ff]/20"
          >
            {loading ? 'Guardando...' : 'Restablecer'}
          </button>

          <div className="flex items-center justify-between mt-1">
            <Link to="/admin" className="text-sm text-[#9fb3c8] hover:text-white flex items-center gap-2">
              <ArrowLeft size={16} /> Volver al inicio de sesión
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
