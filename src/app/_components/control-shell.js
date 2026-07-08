"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppwriteException } from "appwrite";
import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Layers3,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  UserCog,
  Users,
  WalletCards,
} from "lucide-react";
import { account } from "@/lib/appwrite";

const staffNavSections = [
  {
    label: "General",
    items: [{ label: "Panel", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Académico",
    items: [
      { label: "Estudiantes", href: "/dashboard/estudiantes", icon: Users },
      { label: "Cursos", href: "/dashboard/cursos", icon: BookOpen },
      {
        label: "Inscripciones",
        href: "/dashboard/inscripciones",
        icon: ClipboardList,
      },
      { label: "Horarios", href: "/dashboard/horarios", icon: CalendarDays },
    ],
  },
  {
    label: "Caja",
    items: [
      {
        label: "Mensualidades",
        href: "/dashboard/mensualidades",
        icon: WalletCards,
      },
      { label: "Deudores", href: "/dashboard/deudores", icon: AlertTriangle },
      { label: "Reportes", href: "/dashboard/reportes", icon: BarChart3 },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Sucursales", href: "/dashboard/sucursales", icon: Building2 },
      { label: "Carreras", href: "/dashboard/carreras", icon: Layers3 },
      { label: "Docentes", href: "/dashboard/docentes", icon: GraduationCap },
      { label: "Usuarios", href: "/dashboard/usuarios", icon: UserCog },
      {
        label: "Configuración",
        href: "/dashboard/configuracion",
        icon: Settings,
      },
      {
        label: "Liquidación docente",
        href: "/dashboard/liquidacion-docentes",
        icon: BadgeDollarSign,
      },
    ],
  },
];

const teacherNavSections = [
  {
    label: "Docente",
    items: [
      { label: "Portal", href: "/docente", icon: Landmark },
      { label: "Mis cursos", href: "/docente/cursos", icon: BookOpen },
      { label: "Mi asistencia", href: "/docente/asistencia", icon: Clock3 },
    ],
  },
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

function isActivePath(pathname, href) {
  if (href === "/dashboard" || href === "/docente") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PrivatePage({
  ariaLabel = "Área privada vacía",
  children,
  eyebrow = "Área privada",
  navMode = "staff",
  title = "Panel",
}) {
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
        ariaLabel={ariaLabel}
        eyebrow={eyebrow}
        isMenuOpen={isMenuOpen}
        navMode={navMode}
        onLogout={handleLogout}
        onToggleMenu={() => setIsMenuOpen((value) => !value)}
        sessionStatus={sessionStatus}
        title={title}
        user={user}
      >
        {children}
      </PrivateArea>
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
  ariaLabel,
  children,
  eyebrow,
  isMenuOpen,
  navMode,
  onLogout,
  onToggleMenu,
  sessionStatus,
  title,
  user,
}) {
  const pathname = usePathname();
  const navSections = navMode === "teacher" ? teacherNavSections : staffNavSections;

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
          {navSections.map((section) => (
            <div className="menu-nav-section" key={section.label}>
              <p className="menu-section-label">{section.label}</p>
              {section.items.map(({ href, icon: Icon, label }) => {
                const isActive = isActivePath(pathname, href);

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`menu-item ${isActive ? "is-active" : ""}`}
                    href={href}
                    key={href}
                  >
                    <Icon size={19} strokeWidth={1.8} />
                    <span className="menu-label">{label}</span>
                  </Link>
                );
              })}
            </div>
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
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="user-chip" title={user.email}>
            <span>{initials}</span>
          </div>
        </header>

        <div className="private-canvas" aria-label={ariaLabel}>
          {children}
        </div>
      </section>
    </main>
  );
}
