"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Building2,
  Check,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createBranch,
  deleteBranch,
  listBranches,
  updateBranch,
} from "@/actions/branches";

const emptyForm = {
  direccion: "",
  estado: "activo",
  nombre: "",
  telefono: "",
  tipo: "presencial",
};

const statusLabels = {
  activo: "Activo",
  cerrado: "Cerrado",
};

const typeLabels = {
  online: "Online",
  presencial: "Presencial",
};

function normalizeBranch(branch) {
  return {
    $createdAt: branch.$createdAt,
    $id: branch.$id,
    $updatedAt: branch.$updatedAt,
    direccion: branch.direccion || "",
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
    telefono: branch.telefono || "",
    tipo: branch.tipo || "presencial",
  };
}

function sortBranches(branches) {
  return [...branches].sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

export function BranchesClient() {
  const [branches, setBranches] = useState([]);
  const [drawerMode, setDrawerMode] = useState("closed");
  const [editingBranch, setEditingBranch] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleBranches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return branches.filter((branch) => {
      const matchesStatus =
        statusFilter === "todos" || branch.estado === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${branch.nombre} ${branch.direccion} ${branch.telefono} ${branch.tipo}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [branches, query, statusFilter]);

  const stats = useMemo(() => {
    return branches.reduce(
      (summary, branch) => {
        summary.total += 1;
        summary[branch.estado] += 1;
        return summary;
      },
      { activo: 0, cerrado: 0, total: 0 },
    );
  }, [branches]);

  useEffect(() => {
    refreshBranches();
  }, []);

  function refreshBranches() {
    setIsLoading(true);
    setError("");

    startTransition(async () => {
      const result = await listBranches();

      if (!result.ok) {
        setError(result.error);
        setBranches([]);
      } else {
        setBranches(sortBranches(result.branches.map(normalizeBranch)));
      }

      setIsLoading(false);
    });
  }

  function openCreateDrawer() {
    setError("");
    setEditingBranch(null);
    setForm(emptyForm);
    setDrawerMode("create");
  }

  function openEditDrawer(branch) {
    setError("");
    setEditingBranch(branch);
    setForm({
      direccion: branch.direccion,
      estado: branch.estado,
      nombre: branch.nombre,
      telefono: branch.telefono,
      tipo: branch.tipo,
    });
    setDrawerMode("edit");
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerMode("closed");
    setEditingBranch(null);
    setForm(emptyForm);
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  function upsertBranchInState(branch) {
    setBranches((currentBranches) => {
      const normalized = normalizeBranch(branch);
      const exists = currentBranches.some(
        (item) => item.$id === normalized.$id,
      );
      const nextBranches = exists
        ? currentBranches.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentBranches, normalized];

      return sortBranches(nextBranches);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editingBranch
          ? await updateBranch(editingBranch.$id, form)
          : await createBranch(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertBranchInState(result.branch);
      closeDrawer(true);
    });
  }

  async function handleDelete(branch) {
    const confirmed = window.confirm(
      `¿Borrar la sucursal "${branch.nombre}"? Esta acción solo continuará si no tiene cursos abiertos.`,
    );

    if (!confirmed) return;

    setError("");

    startTransition(async () => {
      const result = await deleteBranch(branch.$id);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setBranches((currentBranches) =>
        currentBranches.filter((item) => item.$id !== branch.$id),
      );
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de sucursales">
        <div className="branch-stat">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Activas</span>
          <strong>{stats.activo}</strong>
        </div>
        <div className="branch-stat">
          <span>Cerradas</span>
          <strong>{stats.cerrado}</strong>
        </div>
      </section>

      <section className="branch-controls" aria-label="Controles de sucursales">
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar sucursal"
            type="search"
            value={query}
          />
        </label>

        <div className="segmented-control" aria-label="Filtrar por estado">
          {[
            ["todos", "Todas"],
            ["activo", "Activas"],
            ["cerrado", "Cerradas"],
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
          onClick={refreshBranches}
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

      <section className="branch-table-shell" aria-label="Tabla de sucursales">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleBranches.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sucursal</th>
                    <th>Tipo</th>
                    <th>Teléfono</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visibleBranches.map((branch) => (
                    <tr key={branch.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <Building2 size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>{branch.nombre}</strong>
                            <span>{branch.direccion || "Sin dirección"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{typeLabels[branch.tipo]}</td>
                      <td>{branch.telefono || "Sin teléfono"}</td>
                      <td>
                        <StatusBadge status={branch.estado} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Editar ${branch.nombre}`}
                            className="icon-action"
                            onClick={() => openEditDrawer(branch)}
                            type="button"
                          >
                            <Edit3 size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Borrar ${branch.nombre}`}
                            className="icon-action danger-action"
                            onClick={() => handleDelete(branch)}
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
              {visibleBranches.map((branch) => (
                <article className="branch-mobile-card" key={branch.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{branch.nombre}</h2>
                      <span>{typeLabels[branch.tipo]}</span>
                    </div>
                    <StatusBadge status={branch.estado} />
                  </div>
                  <dl>
                    <div>
                      <dt>Dirección</dt>
                      <dd>{branch.direccion || "Sin dirección"}</dd>
                    </div>
                    <div>
                      <dt>Teléfono</dt>
                      <dd>{branch.telefono || "Sin teléfono"}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      onClick={() => openEditDrawer(branch)}
                      type="button"
                    >
                      <Edit3 size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      className="secondary-action danger-action"
                      onClick={() => handleDelete(branch)}
                      type="button"
                    >
                      <Trash2 size={17} />
                      <span>Borrar</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <Building2 size={22} />
            <span>Sin sucursales</span>
          </div>
        )}
      </section>

      {drawerMode !== "closed" ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={closeDrawer}
            type="button"
          />
          <aside
            aria-labelledby="branch-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Sucursal</p>
                <h2 id="branch-drawer-title">
                  {drawerMode === "edit" ? "Editar" : "Crear"}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-action"
                onClick={closeDrawer}
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
                <span>Tipo</span>
                <select
                  className="control-input"
                  name="tipo"
                  onChange={handleFieldChange}
                  required
                  value={form.tipo}
                >
                  <option value="presencial">Presencial</option>
                  <option value="online">Online</option>
                </select>
              </label>

              <label className="field-group">
                <span>Dirección</span>
                <input
                  className="control-input"
                  maxLength={256}
                  name="direccion"
                  onChange={handleFieldChange}
                  value={form.direccion}
                />
              </label>

              <label className="field-group">
                <span>Teléfono</span>
                <input
                  className="control-input"
                  maxLength={32}
                  name="telefono"
                  onChange={handleFieldChange}
                  value={form.telefono}
                />
              </label>

              <fieldset className="field-group state-fieldset">
                <legend>Estado</legend>
                <div className="state-options">
                  {[
                    ["activo", "Activo", Check],
                    ["cerrado", "Cerrado", X],
                  ].map(([value, label, Icon]) => (
                    <label
                      className={form.estado === value ? "is-selected" : ""}
                      key={value}
                    >
                      <input
                        checked={form.estado === value}
                        name="estado"
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
                  onClick={closeDrawer}
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
