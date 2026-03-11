import { useState } from "react";

export default function VerifyCode() {
  const email = localStorage.getItem("reg_email");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    const res = await fetch("/api/auth/register/verify", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ email, code })
    });

    const json = await res.json();
    if (!json.ok) {
      setErr("Código incorrecto");
      return;
    }

    window.location.href = "/admin/register-data";
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4">
      <div className="bg-[#1e293b] border border-[#21405f] border-t-4 border-green-400 rounded-2xl p-10 w-full max-w-md shadow-xl">
        <h1 className="text-xl font-bold text-white mb-6 text-center">Registro – Verificación</h1>

        {err && <p className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-center p-3 rounded-lg">{err}</p>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="text-xs text-[#9fb3c8] uppercase font-bold">Código de verificación</label>
          <input
            type="text"
            maxLength={6}
            className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg tracking-widest text-center text-xl"
            value={code}
            onChange={e => setCode(e.target.value)}
            required
          />

          <button className="bg-[#2a90ff] text-white font-bold py-3 rounded-lg hover:bg-[#1a7ae0] transition-all">
            Verificar
          </button>
        </form>
      </div>
    </div>
  );
}