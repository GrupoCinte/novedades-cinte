import { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Error');

      // En DEV mostramos el enlace directo (si backend lo devuelve)
      setMsg(
        json.resetUrl
          ? `Revisa tu correo. (DEV) Enlace: ${json.resetUrl}`
          : 'Si el correo existe, te enviamos instrucciones.'
      );
    } catch (err) {
      setMsg(err.message || 'Error solicitando el enlace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex justify-center items-center w-full min-h-[60vh] animate-in fade-in zoom-in duration-300">
      <div className="bg-[#0f2437] border border-[#21405f] rounded-2xl p-8 md:p-12 w-full max-w-md shadow-2xl relative overflow-hidden">
        {/* barra superior degradada (igual al Login) */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2a90ff] to-[#1fc76a]" />

        {/* Título */}
        <div className="text-center mb-8">
          <div className="bg-[#162a3d] border border-[#21405f] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="text-[#1fc76a]" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Recuperar contraseña</h1>
          <p className="text-[#9fb3c8] text-sm">
            Ingresa tu correo y te enviaremos un enlace para restablecerla.
          </p>
        </div>

        {/* Formulario */}
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
            {loading ? 'Enviando…' : 'Enviar enlace'}
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
