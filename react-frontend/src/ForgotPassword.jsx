import { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cognitoForgotPassword, cognitoResetPassword } from './cognitoAuth';
import { useAuthSurface } from './moduleTheme.js';

export default function ForgotPassword() {
  const au = useAuthSurface();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setSendingCode(true);
    try {
      await cognitoForgotPassword(email);
      setShowResetForm(true);
      setMsg('Código enviado. Ingresa el código y tu nueva contraseña aquí mismo.');
    } catch (err) {
      setMsg(err?.message || 'Error solicitando recuperación');
    } finally {
      setSendingCode(false);
    }
  };

  const onConfirmReset = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!email.trim()) {
      setMsg('Debes indicar el correo del usuario.');
      return;
    }
    if (!code.trim()) {
      setMsg('Debes ingresar el código de verificación.');
      return;
    }
    if (!newPassword || !confirmPassword) {
      setMsg('Debes ingresar y confirmar la nueva contraseña.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg('La contraseña y su confirmación no coinciden.');
      return;
    }

    setResetting(true);
    try {
      await cognitoResetPassword(email.trim(), code.trim(), newPassword);
      setMsg('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
      setShowResetForm(false);
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMsg(err?.message || 'Error confirmando el cambio de contraseña.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex justify-center items-start w-full h-full overflow-y-auto py-6 animate-in fade-in zoom-in duration-300 font-body">
      <div className={`${au.authCard} max-h-[calc(100vh-10rem)] overflow-y-auto`}>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#004D87] to-[#65BCF7]" />
        <div className="text-center mb-8">
          <div className={au.authIconTile}>
            <Mail className="text-[#1fc76a]" size={28} />
          </div>
          <h1 className={au.h1Card}>Recuperar contraseña</h1>
          <p className={au.authSubtitle}>Ingresa tu correo para restablecerla.</p>
        </div>

        <div className="flex flex-col gap-5">
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className={au.authLabel}>Correo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className={au.lockIcon} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className={`${au.authInputTight} pl-10`}
                />
              </div>
            </div>

            <button
              disabled={sendingCode || resetting}
              type="submit"
              className="w-full mt-1 bg-gradient-to-r from-[#004D87] to-[#2F7BB8] hover:from-[#004D87] hover:to-[#088DC6] disabled:opacity-50 disabled:text-[#9fb3c8] text-white font-bold py-3.5 px-6 rounded-lg transition-colors shadow-lg hover:shadow-[#2a90ff]/20"
            >
              {sendingCode ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>

          <div className="flex flex-col gap-2">
            {!!msg && (
              <div className={`${au.msgBox} break-all`}>
                {msg}
              </div>
            )}
          </div>

          {showResetForm && (
            <form onSubmit={onConfirmReset} className={au.challengePanel}>
              <div className={au.challengeHeading}>Completar recuperación con código</div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código recibido por correo"
                className={au.authInputTight}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña"
                className={au.authInputTight}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar nueva contraseña"
                className={au.authInputTight}
              />
              <button
                type="submit"
                disabled={sendingCode || resetting}
                className="w-full bg-[#1fc76a] hover:bg-[#18a85a] disabled:opacity-50 disabled:text-[#9fb3c8] text-white font-bold py-3 rounded-lg transition-colors"
              >
                {resetting ? 'Procesando...' : 'Confirmar código y cambiar contraseña'}
              </button>
            </form>
          )}

          <div className="flex items-center justify-between mt-1">
            <Link to="/admin" className={au.backLink}>
              <ArrowLeft size={16} /> Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
