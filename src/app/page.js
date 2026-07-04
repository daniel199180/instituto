"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppwriteException } from "appwrite";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { account } from "@/lib/appwrite";

const navItems = [
  { label: "Inicio", icon: LayoutDashboard },
  { label: "Acceso", icon: ShieldCheck },
];

function validateLoginForm({ email, password }) {
  const cleanEmail = email.trim();

  if (!cleanEmail) {
    return "Ingresa tu correo.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return "Ingresa un correo válido.";
  }

  if (!password) {
    return "Ingresa tu contraseña.";
  }

  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  return "";
}

function getErrorMessage(error) {
  if (error instanceof AppwriteException) {
    const message = error.message.toLowerCase();

    if (
      message.includes("invalid credentials") ||
      message.includes("invalid `password`") ||
      message.includes("invalid password") ||
      message.includes("user_invalid_credentials")
    ) {
      return "Correo o contraseña incorrectos.";
    }

    if (message.includes("missing required parameter")) {
      return "Faltan datos obligatorios. Revisa el correo y la contraseña.";
    }

    if (message.includes("invalid origin")) {
      return "Este dominio no está autorizado en Appwrite. Agrega localhost como plataforma web del proyecto.";
    }

    if (error.code === 429) {
      return "Demasiados intentos. Espera un momento y vuelve a intentar.";
    }

    if (error.code >= 500) {
      return "Appwrite no respondió correctamente. Intenta nuevamente en unos segundos.";
    }

    return "No se pudo iniciar sesión. Verifica tus datos.";
  }

  return "No se pudo completar la solicitud.";
}

export default function Home() {
  const [sessionStatus, setSessionStatus] = useState("checking");
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const checkSession = useCallback(async () => {
    setSessionStatus("checking");

    try {
      const currentUser = await account.get();
      setUser(currentUser);
      setSessionStatus("authenticated");
    } catch {
      setUser(null);
      setSessionStatus("guest");
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");

    const validationError = validateLoginForm(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSessionStatus("signing-in");

    try {
      await account.createEmailPasswordSession(form.email.trim(), form.password);

      const currentUser = await account.get();
      setUser(currentUser);
      setForm((currentForm) => ({ ...currentForm, password: "" }));
      setSessionStatus("authenticated");
    } catch (loginError) {
      setUser(null);
      setError(getErrorMessage(loginError));
      setSessionStatus("guest");
    }
  }

  async function handleLogout() {
    setError("");
    setSessionStatus("signing-out");

    try {
      await account.deleteSession("current");
    } catch (logoutError) {
      setError(getErrorMessage(logoutError));
    } finally {
      setUser(null);
      setForm({ email: "", password: "" });
      setSessionStatus("guest");
    }
  }

  if (sessionStatus === "checking") {
    return <LoadingScreen />;
  }

  if (user) {
    return (
      <PrivateArea
        isMenuOpen={isMenuOpen}
        onLogout={handleLogout}
        onToggleMenu={() => setIsMenuOpen((value) => !value)}
        sessionStatus={sessionStatus}
        user={user}
      />
    );
  }

  return (
    <LoginScreen
      error={error}
      form={form}
      isSubmitting={sessionStatus === "signing-in"}
      onChange={setForm}
      onTogglePassword={() => setShowPassword((value) => !value)}
      onSubmit={handleLogin}
      showPassword={showPassword}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="auth-page">
      <div className="loading-mark" aria-label="Cargando">
        <Loader2 size={26} strokeWidth={1.8} />
      </div>
    </main>
  );
}

function LoginScreen({
  error,
  form,
  isSubmitting,
  onChange,
  onSubmit,
  onTogglePassword,
  showPassword,
}) {
  return (
    <main className="auth-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-heading">
          <div className="brand-mark">
            <LockKeyhole size={21} strokeWidth={1.8} />
          </div>
          <div>
            <p className="eyebrow">Control Instituto</p>
            <h1 id="login-title">Acceso privado</h1>
          </div>
        </div>

        <form className="login-form" noValidate onSubmit={onSubmit}>
          <label className="field-group">
            <span>Correo</span>
            <input
              autoComplete="email"
              className="control-input"
              name="email"
              onChange={(event) =>
                onChange((currentForm) => ({
                  ...currentForm,
                  email: event.target.value,
                }))
              }
              placeholder="usuario@instituto.com"
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="field-group">
            <span>Contraseña</span>
            <div className="password-field">
              <input
                autoComplete="current-password"
                className="control-input password-input"
                minLength={8}
                name="password"
                onChange={(event) =>
                  onChange((currentForm) => ({
                    ...currentForm,
                    password: event.target.value,
                  }))
                }
                required
                type={showPassword ? "text" : "password"}
                value={form.password}
              />
              <button
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Ver contraseña"
                }
                className="password-visibility-button"
                onClick={onTogglePassword}
                type="button"
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={1.8} />
                ) : (
                  <Eye size={18} strokeWidth={1.8} />
                )}
              </button>
            </div>
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-action" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <Loader2 className="spin-icon" size={18} />
            ) : (
              <LockKeyhole size={18} />
            )}
            <span>{isSubmitting ? "Ingresando" : "Entrar"}</span>
          </button>
        </form>
      </section>
    </main>
  );
}

function PrivateArea({
  isMenuOpen,
  onLogout,
  onToggleMenu,
  sessionStatus,
  user,
}) {
  const initials = useMemo(() => {
    const source = user.name || user.email || "CI";
    return source
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [user]);

  return (
    <main className="private-shell">
      <aside
        aria-label="Menú principal"
        className={`side-menu ${isMenuOpen ? "is-open" : "is-collapsed"}`}
      >
        <div className="side-menu-header">
          <button
            aria-label={isMenuOpen ? "Contraer menú" : "Desplegar menú"}
            className="icon-action"
            onClick={onToggleMenu}
            type="button"
          >
            {isMenuOpen ? (
              <ChevronLeft size={19} strokeWidth={1.8} />
            ) : (
              <ChevronRight size={19} strokeWidth={1.8} />
            )}
          </button>

          <div className="menu-title">
            <span className="menu-symbol">
              <Menu size={17} strokeWidth={1.8} />
            </span>
            <span className="menu-label">Control Instituto</span>
          </div>
        </div>

        <nav className="menu-nav" aria-label="Secciones">
          {navItems.map(({ icon: Icon, label }, index) => (
            <button
              className={`menu-item ${index === 0 ? "is-active" : ""}`}
              key={label}
              type="button"
            >
              <Icon size={19} strokeWidth={1.8} />
              <span className="menu-label">{label}</span>
            </button>
          ))}
        </nav>

        <button
          className="menu-item logout-item"
          disabled={sessionStatus === "signing-out"}
          onClick={onLogout}
          type="button"
        >
          {sessionStatus === "signing-out" ? (
            <Loader2 className="spin-icon" size={19} strokeWidth={1.8} />
          ) : (
            <LogOut size={19} strokeWidth={1.8} />
          )}
          <span className="menu-label">Cerrar sesión</span>
        </button>
      </aside>

      <section className="private-workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Área privada</p>
            <h1>Panel</h1>
          </div>
          <div className="user-chip" title={user.email}>
            <span>{initials}</span>
          </div>
        </header>

        <div className="private-canvas" aria-label="Área privada vacía" />
      </section>
    </main>
  );
}
