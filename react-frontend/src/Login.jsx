import { useState } from "react";
import { Lock, User, Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { buildCsrfHeaders, cognitoCompleteNewPassword, cognitoSignIn } from "./cognitoAuth";
import { useAuthSurface } from "./moduleTheme.js";
import { ADMIN_PORTAL_UNIFIED_TITLE } from "./AdminModuleSidebarBrand.jsx";

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
  const au = useAuthSurface();
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
  const nav = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const authData = await cognitoSignIn(username, password);
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
      className="relative flex min-h-0 w-full flex-1 overflow-y-auto font-body"
      style={{
        backgroundImage: au.loginGradient,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className={au.loginScrim} aria-hidden />
      <div className="relative z-10 flex min-h-full min-w-0 flex-1 items-center justify-center px-4 py-4 animate-in fade-in zoom-in duration-300 md:py-6">
        <div className={au.loginCard}>
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[#004D87] to-[#65BCF7] opacity-90" />

          <div className="mb-8 text-center">
            {/*
              Misma caja que AdminPortalHome: el PNG claro lleva más aire → scale en tema claro para igualar tamaño visual al oscuro.
            */}
            <div className="mx-auto mb-4 flex h-[4.35rem] w-[min(100%,11.875rem)] max-w-full items-center justify-center overflow-visible px-1 py-1 sm:h-[4.65rem] sm:w-[min(100%,13.125rem)] sm:px-1.5 sm:py-1.5 md:h-[5.25rem] md:w-[min(100%,14.375rem)]">
              <img
                src={au.isLight ? "/assets/logo-cinte-header-light.png" : "/assets/logo-cinte-header.png"}
                alt="CINTE"
                className={`h-full w-full object-contain object-center drop-shadow-md ${
                  au.isLight ? "origin-center scale-[1.72] sm:scale-[1.63] md:scale-[1.55]" : ""
                }`}
              />
            </div>
            <h1
              className={`font-heading text-2xl font-extrabold uppercase leading-tight tracking-wide sm:text-[1.65rem] md:text-[1.75rem] ${au.isLight ? "text-slate-900" : "text-white"}`}
            >
              {ADMIN_PORTAL_UNIFIED_TITLE}
            </h1>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 font-body"
          >
            <div className="flex flex-col gap-2">
              <label className={au.authLabel}>
                Usuario (correo)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className={au.userIcon} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className={`${au.authInput} pl-10`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className={au.authLabel}>
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className={au.userIcon} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${au.authInput} pl-10 pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${au.eyeBtn}`}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className={
                  au.isLight
                    ? "mb-2 mt-2 animate-in rounded-lg border border-rose-200 bg-rose-50 p-3 text-center text-sm font-medium text-rose-800"
                    : "mb-2 mt-2 animate-in rounded-lg border border-[#ff6b6b]/30 bg-[#ff6b6b]/10 p-3 text-center text-sm font-medium text-[#ff6b6b]"
                }
              >
                {error}
              </div>
            )}

            {challengeSession && (
              <div className={au.challengePanel}>
                <div className={au.challengeHeading}>
                  Primer acceso: define nueva contraseña
                </div>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nueva contraseña"
                    className={`${au.authInput} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className={`absolute inset-y-0 right-0 pr-3 flex items-center ${au.eyeBtn}`}
                    aria-label={showNewPassword ? "Ocultar nueva contraseña" : "Mostrar nueva contraseña"}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirmar nueva contraseña"
                    className={`${au.authInput} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className={`absolute inset-y-0 right-0 pr-3 flex items-center ${au.eyeBtn}`}
                    aria-label={showNewPassword ? "Ocultar confirmación" : "Mostrar confirmación"}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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
                  className={au.authInput}
                />
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
                className={au.linkAccent}
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
