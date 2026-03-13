import { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cognitoForgotPassword, cognitoResetPassword } from './cognitoAuth';

export default function ForgotPassword() {
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
    <div className="flex justify-center items-start w-full h-full overflow-y-auto py-6 animate-in fade-in zoom-in duration-300">
      <div className="bg-[#0f2437] border border-[#21405f] rounded-2xl p-8 md:p-12 w-full max-w-md shadow-2xl relative overflow-hidden max-h-[calc(100vh-10rem)] overflow-y-auto">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2a90ff] to-[#1fc76a]" />
        <div className="text-center mb-8">
          <div className="bg-[#162a3d] border border-[#21405f] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="text-[#1fc76a]" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Recuperar contraseña</h1>
          <p className="text-[#9fb3c8] text-sm">Ingresa tu correo para restablecerla.</p>
        </div>

        <div className="flex flex-col gap-5">
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider">Correo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className="text-[#466683]" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 pl-10 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
                />
              </div>
            </div>

            <button
              disabled={sendingCode || resetting}
              type="submit"
              className="w-full mt-1 bg-[#2a90ff] hover:bg-[#1a7ae0] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-3.5 px-6 rounded-lg transition-colors shadow-lg hover:shadow-[#2a90ff]/20"
            >
              {sendingCode ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>

          <div className="flex flex-col gap-2">
            {!!msg && (
              <div className="bg-[#1a2b3b] border border-[#21405f] text-[#9fb3c8] text-sm p-3 rounded-lg break-all">
                {msg}
              </div>
            )}
          </div>

          {showResetForm && (
            <form onSubmit={onConfirmReset} className="mt-2 p-4 rounded-lg border border-[#21405f] bg-[#162a3d]/60 flex flex-col gap-3">
              <div className="text-sm text-[#9fb3c8] font-semibold">Completar recuperación con código</div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código recibido por correo"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar nueva contraseña"
                className="w-full bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
              <button
                type="submit"
                disabled={sendingCode || resetting}
                className="w-full bg-[#1fc76a] hover:bg-[#18a85a] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-3 rounded-lg transition-colors"
              >
                {resetting ? 'Procesando...' : 'Confirmar código y cambiar contraseña'}
              </button>
            </form>
          )}

          <div className="flex items-center justify-between mt-1">
            <Link to="/admin" className="text-sm text-[#9fb3c8] hover:text-white flex items-center gap-2">
              <ArrowLeft size={16} /> Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
