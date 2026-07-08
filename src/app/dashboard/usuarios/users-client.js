"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import {
  createStaffUser,
  deleteStaffUser,
  listStaffUsers,
  updateStaffUser,
} from "@/actions/staff-users";

const emptyForm = {
  email: "",
  nombre: "",
  password: "",
  role: "cajero",
  status: "activo",
  sucursalId: "",
};

const statusLabels = {
  activo: "Activo",
  inactivo: "Inactivo",
};

const roleLabels = {
  administrador: "Administrador",
  academico: "Encargado Académico",
  cajero: "Cajero",
};

function normalizeUser(user) {
  return {
    $createdAt: user.$createdAt,
    $id: user.$id,
    email: user.email || "",
    membershipId: user.membershipId || "",
    nombre: user.nombre || "",
    role: user.role || "cajero",
    roleLabel: user.roleLabel || roleLabels[user.role] || "Cajero",
    status: user.status === "inactivo" ? "inactivo" : "activo",
    sucursalId: user.sucursalId || "",
    sucursalNombre: user.sucursalNombre || "",
  };
}

function sortUsers(users) {
  return [...users].sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

export function UsersClient() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [drawerMode, setDrawerMode] = useState("closed");
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesStatus =
        statusFilter === "todos" || user.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${user.nombre} ${user.email} ${user.roleLabel} ${user.sucursalNombre}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, users]);

  const stats = useMemo(() => {
    return users.reduce(
      (summary, user) => {
        summary.total += 1;
        summary[user.status] += 1;
        return summary;
      },
      { activo: 0, inactivo: 0, total: 0 },
    );
  }, [users]);

  useEffect(() => {
    refreshUsers();
  }, []);

  function refreshUsers() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listStaffUsers();

      if (!result.ok) {
        setError(result.error);
        setUsers([]);
        setBranches([]);
      } else {
        setUsers(sortUsers(result.users.map(normalizeUser)));
        setBranches(result.branches || []);
      }

      setIsLoading(false);
    });
  }

  function getDefaultBranchId() {
    return branches.find((branch) => branch.estado === "activo")?.$id || "";
  }

  function openCreateDrawer() {
    setError("");
    setNotice("");
    setEditingUser(null);
    setForm({ ...emptyForm, sucursalId: getDefaultBranchId() });
    setDrawerMode("create");
  }

  function openEditDrawer(user) {
    setError("");
    setNotice("");
    setEditingUser(user);
    setForm({
      email: user.email,
      nombre: user.nombre,
      password: "",
      role: user.role,
      status: user.status,
      sucursalId: user.sucursalId,
    });
    setDrawerMode("edit");
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerMode("closed");
    setEditingUser(null);
    setForm(emptyForm);
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => {
      const nextForm = { ...currentForm, [name]: value };

      if (name === "role" && value === "cajero" && !nextForm.sucursalId) {
        nextForm.sucursalId = getDefaultBranchId();
      }

      if (name === "role" && value !== "cajero") {
        nextForm.sucursalId = "";
      }

      return nextForm;
    });
  }

  function upsertUserInState(user) {
    setUsers((currentUsers) => {
      const normalized = normalizeUser(user);
      const exists = currentUsers.some((item) => item.$id === normalized.$id);
      const nextUsers = exists
        ? currentUsers.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentUsers, normalized];

      return sortUsers(nextUsers);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editingUser
          ? await updateStaffUser(editingUser.$id, form)
          : await createStaffUser(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertUserInState(result.user);
      closeDrawer(true);
    });
  }

  async function handleDelete(user) {
    const confirmed = window.confirm(
      `¿Bloquear el acceso de "${user.nombre}"? El usuario quedará inactivo para conservar trazabilidad.`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await deleteStaffUser(user.$id);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertUserInState(result.user);
      setNotice("El usuario fue marcado como inactivo.");
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de usuarios">
        <div className="branch-stat">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Activos</span>
          <strong>{stats.activo}</strong>
        </div>
        <div className="branch-stat">
          <span>Inactivos</span>
          <strong>{stats.inactivo}</strong>
        </div>
      </section>

      <section className="branch-controls" aria-label="Controles de usuarios">
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar usuario"
            type="search"
            value={query}
          />
        </label>

        <div className="segmented-control" aria-label="Filtrar por estado">
          {[
            ["todos", "Todos"],
            ["activo", "Activos"],
            ["inactivo", "Inactivos"],
          ].map(([value, label]) => (
            <button
              className={statusFilter === value ? "is-selected" : ""}
              key={value}
              onClick={() => setStatusFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className="secondary-action"
          disabled={isLoading || isPending}
          onClick={refreshUsers}
          type="button"
        >
          <RefreshCw
            className={isLoading || isPending ? "spin-icon" : ""}
            size={17}
          />
          <span>Actualizar</span>
        </button>

        <button
          className="primary-action branch-create"
          onClick={openCreateDrawer}
          type="button"
        >
          <Plus size={18} />
          <span>Crear</span>
        </button>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? <p className="form-note branch-error">{notice}</p> : null}

      <section className="branch-table-shell" aria-label="Tabla de usuarios">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleUsers.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Sucursal</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <UserCog size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>{user.nombre}</strong>
                            <span>{user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>{user.roleLabel}</td>
                      <td>{user.sucursalNombre || "Sin sucursal"}</td>
                      <td>
                        <StatusBadge status={user.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Editar ${user.nombre}`}
                            className="icon-action"
                            onClick={() => openEditDrawer(user)}
                            type="button"
                          >
                            <Edit3 size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Bloquear ${user.nombre}`}
                            className="icon-action danger-action"
                            onClick={() => handleDelete(user)}
                            type="button"
                          >
                            <Trash2 size={17} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {visibleUsers.map((user) => (
                <article className="branch-mobile-card" key={user.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{user.nombre}</h2>
                      <span>{user.email}</span>
                    </div>
                    <StatusBadge status={user.status} />
                  </div>
                  <dl>
                    <div>
                      <dt>Rol</dt>
                      <dd>{user.roleLabel}</dd>
                    </div>
                    <div>
                      <dt>Sucursal</dt>
                      <dd>{user.sucursalNombre || "Sin sucursal"}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      onClick={() => openEditDrawer(user)}
                      type="button"
                    >
                      <Edit3 size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      className="secondary-action danger-action"
                      onClick={() => handleDelete(user)}
                      type="button"
                    >
                      <Trash2 size={17} />
                      <span>Bloquear</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <UserCog size={22} />
            <span>Sin usuarios</span>
          </div>
        )}
      </section>

      {drawerMode !== "closed" ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={() => closeDrawer()}
            type="button"
          />
          <aside
            aria-labelledby="user-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Usuario</p>
                <h2 id="user-drawer-title">
                  {drawerMode === "edit" ? "Editar" : "Crear"}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-action"
                onClick={() => closeDrawer()}
                type="button"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </header>

            <form className="drawer-form" onSubmit={handleSubmit}>
              <label className="field-group">
                <span>Nombre</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="nombre"
                  onChange={handleFieldChange}
                  required
                  value={form.nombre}
                />
              </label>

              <label className="field-group">
                <span>Correo</span>
                <input
                  className="control-input"
                  name="email"
                  onChange={handleFieldChange}
                  required
                  type="email"
                  value={form.email}
                />
              </label>

              <label className="field-group">
                <span>
                  {drawerMode === "edit" ? "Nueva contraseña" : "Contraseña"}
                </span>
                <input
                  className="control-input"
                  minLength={drawerMode === "edit" ? undefined : 8}
                  name="password"
                  onChange={handleFieldChange}
                  placeholder={drawerMode === "edit" ? "Dejar sin cambios" : ""}
                  required={drawerMode !== "edit"}
                  type="password"
                  value={form.password}
                />
              </label>

              <label className="field-group">
                <span>Rol</span>
                <select
                  className="control-input"
                  name="role"
                  onChange={handleFieldChange}
                  required
                  value={form.role}
                >
                  <option value="administrador">Administrador</option>
                  <option value="cajero">Cajero</option>
                  <option value="academico">Encargado Académico</option>
                </select>
              </label>

              {form.role === "cajero" ? (
                <label className="field-group">
                  <span>Sucursal</span>
                  <select
                    className="control-input"
                    name="sucursalId"
                    onChange={handleFieldChange}
                    required
                    value={form.sucursalId}
                  >
                    <option value="">Seleccionar</option>
                    {branches.map((branch) => (
                      <option key={branch.$id} value={branch.$id}>
                        {branch.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <fieldset className="field-group state-fieldset">
                <legend>Estado</legend>
                <div className="state-options">
                  {[
                    ["activo", "Activo", Check],
                    ["inactivo", "Inactivo", X],
                  ].map(([value, label, Icon]) => (
                    <label
                      className={form.status === value ? "is-selected" : ""}
                      key={value}
                    >
                      <input
                        checked={form.status === value}
                        name="status"
                        onChange={handleFieldChange}
                        type="radio"
                        value={value}
                      />
                      <Icon size={17} strokeWidth={1.8} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="drawer-actions">
                <button
                  className="secondary-action"
                  disabled={isPending}
                  onClick={() => closeDrawer()}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="primary-action"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? (
                    <Loader2 className="spin-icon" size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge is-${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}
