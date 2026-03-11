import { useState } from "react";
import { Lock } from "lucide-react";

export default function RegisterEmail() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr(""); setMsg("");

    try {
      const res = await fetch("/api/auth/register/start", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.message);

      localStorage.setItem("reg_email", email);
      localStorage.setItem("reg_tempToken", data.tempToken);

      setMsg("Código enviado. Revisa la consola del servidor.");
      setTimeout(() => window.location.href = "/admin/verify", 700);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4">

      <div className="bg-[#1e293b] border border-[#21405f] rounded-2xl p-10 w-full max-w-md shadow-xl relative">

        {/* BARRA MULTICOLOR */}
        <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl bg-gradient-to-r from-green-400 via-blue-400 to-purple-500"></div>

        {/* ICONO */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-[#0f2437] border border-[#21405f] flex items-center justify-center">
            <Lock size={30} className="text-[#2a90ff]" />
          </div>
        </div>

        <h1 className="text-xl font-bold text-white text-center mb-6">Registro – Paso 1</h1>

        {msg && <p className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-center p-3 rounded-lg">{msg}</p>}
        {err && <p className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-center p-3 rounded-lg">{err}</p>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="text-xs text-[#9fb3c8] uppercase font-bold">Correo Personal</label>

          <input
            type="email"
            className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg"
            placeholder="usuario@mail.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <button className="bg-[#2a90ff] hover:bg-[#1a7ae0] text-white font-bold py-3 rounded-lg transition-all">
            Enviar código
          </button>
        </form>
      </div>

    </div>
  );
}