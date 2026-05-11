import { useState } from "react";
import { Lock, User, Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { buildCsrfHeaders, cognitoCompleteNewPassword, cognitoSignIn } from "./cognitoAuth";
import ROLE_PRIORITY from "./constants/rolePriority.json";

/** Intenta guardar cognito_sub en users para rol gp (no bloquea el login). */
function tryGpVincularCognitoSelf(user) {
  if (String(user?.role || "").toLowerCase() !== "gp") return;
  fetch("/api/directorio/gp/vincular-cognito-self", {
    method: "POST",
    credentials: "include",
    headers: buildCsrfHeaders({ "Content-Type": "application/json" }),
  }).catch(() => {});
}

export default function Login({ setAuth }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+57");
  const [challengeSession, setChallengeSession] = useState("");
  const [roleRequested, setRoleRequested] = useState("");
  const nav = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const authData = await cognitoSignIn(username, password, roleRequested);
      if (!authData?.user) {
        throw new Error("Autenticación fallida");
      }
      setAuth(authData);
      tryGpVincularCognitoSelf(authData.user);
      nav("/admin", { replace: true });
    } catch (err) {
      console.error(err);
      const msg = err?.message || "";
      if (
        err?.status === 409 &&
        err?.payload?.challenge === "NEW_PASSWORD_REQUIRED"
      ) {
        setChallengeSession(err?.payload?.session || "");
        setError(
          "Debes definir una nueva contraseña para completar el primer acceso.",
        );
        return;
      }
      if (/not authorized|incorrect username or password/i.test(msg)) {
        setError("Credenciales inválidas");
      } else if (/user is not confirmed/i.test(msg)) {
        setError("Usuario no confirmado en Cognito");
      } else if (/password reset required/i.test(msg)) {
        setError("Debes restablecer la contraseña en Cognito");
      } else {
        setError(msg || "Error autenticando con Cognito");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteNewPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (!challengeSession) {
      setError(
        "No hay sesión de reto activa. Intenta iniciar sesión otra vez.",
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }
    const phone = phoneNumber.trim();
    if (!phone || phone === "+57") {
      setError("Debes ingresar tu teléfono en formato internacional (+57...).");
      return;
    }
    setLoading(true);
    try {
      const authData = await cognitoCompleteNewPassword(
        username,
        challengeSession,
        newPassword,
        phone,
        roleRequested,
      );
      setAuth(authData);
      tryGpVincularCognitoSelf(authData.user);
      nav("/admin", { replace: true });
    } catch (err) {
      console.error(err);
      setError(
        err?.message || "No fue posible completar el cambio de contraseña.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-0 w-full flex-1 overflow-y-auto"
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgba(4,20,30,0.65) 0%, rgba(0,77,135,0.45) 100%), url('/img/bg-login-cinte.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[#04141E]/25 backdrop-blur-[2px]"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-full min-w-0 flex-1 items-center justify-center px-4 py-4 animate-in fade-in zoom-in duration-300 md:py-6">
        <div className="relative max-h-[min(100dvh-2rem,calc(100vh-2rem))] w-full max-w-md overflow-hidden overflow-y-auto rounded-2xl border border-[#65BCF7]/50 bg-[#04141E]/22 p-8 shadow-[0_0_32px_rgba(101,188,247,0.28),0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-[#65BCF7]/25 backdrop-blur-2xl backdrop-saturate-150 md:p-12">
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[#004D87] to-[#65BCF7] opacity-90" />

          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <img
                src="/assets/logo-cinte-header.png"
                alt="CINTE"
                className="h-14 w-auto drop-shadow-md md:h-16"
              />
            </div>
            <h1 className="font-heading text-xl font-bold uppercase leading-tight tracking-wide text-white md:text-2xl">
               Portal de gestión de novedades
            </h1>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 font-body"
          >
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider font-body">
                Usuario (correo)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-[#4a6f8f]" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 pl-10 rounded-xl focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider font-body">
                Ingresar como rol
              </label>
              <select
                value={roleRequested}
                onChange={(e) => setRoleRequested(e.target.value)}
                className="w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-xl focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all"
              >
                <option value="">Mi rol asignado</option>
                {ROLE_PRIORITY.map((role) => (
                  <option key={role} value={role}>
                    {String(role).replace(/_/g, " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#9fb3c8] uppercase tracking-wider font-body">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-[#4a6f8f]" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 pl-10 pr-10 rounded-xl focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9fb3c8] hover:text-white"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff6b6b] text-sm p-3 rounded-lg text-center animate-in mb-2 mt-2 font-medium">
                {error}
              </div>
            )}

            {challengeSession && (
              <div className="mt-2 p-4 rounded-xl border border-[#1a3a56] bg-[#0b1e30]/60 flex flex-col gap-3">
                <div className="text-sm text-[#9fb3c8] font-semibold font-subtitle">
                  Primer acceso: define nueva contraseña
                </div>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nueva contraseña"
                  className="w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-xl focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a]"
                />
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirmar nueva contraseña"
                  className="w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-xl focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a]"
                />
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setPhoneNumber("+57");
                      return;
                    }
                    if (!v.startsWith("+57")) {
                      setPhoneNumber(`+57${v.replace(/^\+?57?/, "")}`);
                      return;
                    }
                    setPhoneNumber(v);
                  }}
                  placeholder="Teléfono (ej: +573001112233)"
                  className="w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-xl focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="text-xs text-[#9fb3c8] hover:text-white text-left"
                >
                  {showNewPassword
                    ? "Ocultar nueva contraseña"
                    : "Mostrar nueva contraseña"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleCompleteNewPassword}
                  className="w-full bg-[#1fc76a] hover:bg-[#18a85a] disabled:bg-[#1a3a56] disabled:text-[#9fb3c8] text-white font-heading font-bold py-3 rounded-xl transition-colors"
                >
                  {loading
                    ? "Procesando..."
                    : "Guardar nueva contraseña y continuar"}
                </button>
              </div>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full mt-2 bg-gradient-to-r from-[#004D87] to-[#2F7BB8] hover:from-[#004D87] hover:to-[#088DC6] disabled:opacity-50 text-white font-heading font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {loading ? "Verificando..." : "Iniciar Sesión"}
            </button>
            <div className="mt-1 text-right">
              <Link
                to="/admin/forgot"
                className="text-sm text-[#65BCF7] hover:underline font-body"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
