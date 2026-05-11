import { useState } from 'react';
import { Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cognitoResetPassword } from './cognitoAuth';
import { useAuthSurface } from './moduleTheme.js';

export default function ResetPassword() {
  const au = useAuthSurface();
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
    <div className="flex justify-center items-center w-full min-h-[60vh] animate-in fade-in zoom-in duration-300 font-body">
      <div className={au.authCard}>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#004D87] to-[#65BCF7]" />
        <div className="text-center mb-8">
          <div className={au.authIconTile}>
            <Lock className="text-[#1fc76a]" size={28} />
          </div>
          <h1 className={au.h1Card}>Restablecer contraseña</h1>
          <p className={au.authSubtitle}>Ingresa y confirma tu nueva contraseña.</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className={au.authLabel}>Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className={au.authInputTight}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={au.authLabel}>Código de verificación</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código enviado por Cognito"
              className={au.authInputTight}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={au.authLabel}>Nueva contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className={au.lockIcon} />
              </div>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="••••••••"
                className={`${au.authInputTight} pl-10 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPw((prev) => !prev)}
                className={`absolute inset-y-0 right-0 pr-3 flex items-center ${au.eyeBtn}`}
                aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={au.authLabel}>Confirmar contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className={au.lockIcon} />
              </div>
              <input
                type={showPw2 ? 'text' : 'password'}
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="••••••••"
                className={`${au.authInputTight} pl-10 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPw2((prev) => !prev)}
                className={`absolute inset-y-0 right-0 pr-3 flex items-center ${au.eyeBtn}`}
                aria-label={showPw2 ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPw2 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!!msg && (
            <div className={au.msgBox}>
              {msg}
            </div>
          )}

          <button
            disabled={loading}
            type="submit"
            className="w-full mt-1 bg-gradient-to-r from-[#004D87] to-[#2F7BB8] hover:from-[#004D87] hover:to-[#088DC6] disabled:opacity-50 disabled:text-[#9fb3c8] text-white font-bold py-3.5 px-6 rounded-lg transition-colors shadow-lg hover:shadow-[#2a90ff]/20"
          >
            {loading ? 'Guardando...' : 'Restablecer'}
          </button>

          <div className="flex items-center justify-between mt-1">
            <Link to="/admin" className={au.backLink}>
              <ArrowLeft size={16} /> Volver al inicio de sesión
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
