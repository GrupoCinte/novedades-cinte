import { useState } from "react";

export default function RegisterForm() {
  const email = localStorage.getItem("reg_email");
  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    celular: "",
    password: "",
    repassword: ""
  });
  const [err, setErr] = useState("");

  function set(k, v) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    if (form.password !== form.repassword) {
      setErr("Las contraseñas no coinciden");
      return;
    }

    const res = await fetch("/api/auth/register/finish", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        email,
        nombres: form.nombres,
        apellidos: form.apellidos,
        celular: form.celular,
        password: form.password
      })
    });

    const json = await res.json();
    if (!json.ok) {
      setErr(json.message || "Error al registrar");
      return;
    }

    localStorage.removeItem("reg_email");
    window.location.href = "/admin";
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4">
      <div className="bg-[#1e293b] border border-[#21405f] border-t-4 border-green-400 rounded-2xl p-10 w-full max-w-md shadow-xl">

        <h1 className="text-xl font-bold text-white mb-6 text-center">Registro – Datos</h1>

        {err && <p className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-center p-3 rounded-lg">{err}</p>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">

          <input className="input bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg"
                 placeholder="Nombres" value={form.nombres}
                 onChange={e => set("nombres", e.target.value)} required />

          <input className="input bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg"
                 placeholder="Apellidos" value={form.apellidos}
                 onChange={e => set("apellidos", e.target.value)} required />

          <input className="input bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg"
                 placeholder="Celular" value={form.celular}
                 onChange={e => set("celular", e.target.value)} required />

          <input className="input bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg opacity-70"
                 value={email} readOnly />

          <input className="input bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg"
                 type="password" placeholder="Contraseña"
                 value={form.password}
                 onChange={e => set("password", e.target.value)} required />

          <input className="input bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg"
                 type="password" placeholder="Repetir contraseña"
                 value={form.repassword}
                 onChange={e => set("repassword", e.target.value)} required />

          <button className="bg-[#2a90ff] text-white font-bold py-3 rounded-lg hover:bg-[#1a7ae0] transition-all">
            Crear cuenta
          </button>

        </form>
      </div>
    </div>
  );
}