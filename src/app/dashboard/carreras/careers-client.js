"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  Edit3,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createCareer,
  deleteCareer,
  listCareers,
  updateCareer,
} from "@/actions/careers";

const emptyForm = {
  descripcion: "",
  estado: "activo",
  nombre: "",
  sucursalId: "",
};

const statusLabels = {
  activo: "Activo",
  cerrado: "Cerrado",
};

function normalizeCareer(career) {
  return {
    $createdAt: career.$createdAt,
    $id: career.$id,
    $updatedAt: career.$updatedAt,
    descripcion: career.descripcion || "",
    estado: career.estado === "cerrado" ? "cerrado" : "activo",
    nombre: career.nombre || "",
    sucursalId: career.sucursalId || "",
    sucursalNombre: career.sucursalNombre || "Sin sucursal",
  };
}

function sortCareers(careers) {
  return [...careers].sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

export function CareersClient() {
  const [careers, setCareers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [drawerMode, setDrawerMode] = useState("closed");
  const [editingCareer, setEditingCareer] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleCareers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return careers.filter((career) => {
      const matchesStatus =
        statusFilter === "todos" || career.estado === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${career.nombre} ${career.descripcion} ${career.sucursalNombre}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [careers, query, statusFilter]);

  const stats = useMemo(() => {
    return careers.reduce(
      (summary, career) => {
        summary.total += 1;
        summary[career.estado] += 1;
        return summary;
      },
      { activo: 0, cerrado: 0, total: 0 },
    );
  }, [careers]);

  useEffect(() => {
    refreshCareers();
  }, []);

  function refreshCareers() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listCareers();

      if (!result.ok) {
        setError(result.error);
        setCareers([]);
        setBranches([]);
      } else {
        setCareers(sortCareers(result.careers.map(normalizeCareer)));
        setBranches(result.branches || []);
      }

      setIsLoading(false);
    });
  }

  function openCreateDrawer() {
    setError("");
    setNotice("");
    setEditingCareer(null);
    setForm({
      ...emptyForm,
      sucursalId:
        branches.find((branch) => branch.estado === "activo")?.$id || "",
    });
    setDrawerMode("create");
  }

  function openEditDrawer(career) {
    setError("");
    setNotice("");
    setEditingCareer(career);
    setForm({
      descripcion: career.descripcion,
      estado: career.estado,
      nombre: career.nombre,
      sucursalId: career.sucursalId,
    });
    setDrawerMode("edit");
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerMode("closed");
    setEditingCareer(null);
    setForm(emptyForm);
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  function upsertCareerInState(career) {
    setCareers((currentCareers) => {
      const normalized = normalizeCareer(career);
      const exists = currentCareers.some((item) => item.$id === normalized.$id);
      const nextCareers = exists
        ? currentCareers.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentCareers, normalized];

      return sortCareers(nextCareers);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editingCareer
          ? await updateCareer(editingCareer.$id, form)
          : await createCareer(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertCareerInState(result.career);
      closeDrawer(true);
    });
  }

  async function handleDelete(career) {
    const confirmed = window.confirm(
      `¿Borrar la carrera "${career.nombre}"? Si tiene cursos asociados, se marcará como cerrada.`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await deleteCareer(career.$id);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.closed) {
        upsertCareerInState(result.career);
        setNotice("La carrera tiene cursos asociados; se marcó como cerrada.");
        return;
      }

      setCareers((currentCareers) =>
        currentCareers.filter((item) => item.$id !== career.$id),
      );
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de carreras">
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

      <section className="branch-controls" aria-label="Controles de carreras">
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar carrera"
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
          onClick={refreshCareers}
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

      <section className="branch-table-shell" aria-label="Tabla de carreras">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleCareers.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Carrera</th>
                    <th>Sucursal</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visibleCareers.map((career) => (
                    <tr key={career.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <Layers3 size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>{career.nombre}</strong>
                            <span>
                              {career.descripcion || "Sin descripción"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{career.sucursalNombre}</td>
                      <td>
                        <StatusBadge status={career.estado} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Editar ${career.nombre}`}
                            className="icon-action"
                            onClick={() => openEditDrawer(career)}
                            type="button"
                          >
                            <Edit3 size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Borrar ${career.nombre}`}
                            className="icon-action danger-action"
                            onClick={() => handleDelete(career)}
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
              {visibleCareers.map((career) => (
                <article className="branch-mobile-card" key={career.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{career.nombre}</h2>
                      <span>{career.sucursalNombre}</span>
                    </div>
                    <StatusBadge status={career.estado} />
                  </div>
                  <dl>
                    <div>
                      <dt>Descripción</dt>
                      <dd>{career.descripcion || "Sin descripción"}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      onClick={() => openEditDrawer(career)}
                      type="button"
                    >
                      <Edit3 size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      className="secondary-action danger-action"
                      onClick={() => handleDelete(career)}
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
            <Layers3 size={22} />
            <span>Sin carreras</span>
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
            aria-labelledby="career-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Carrera</p>
                <h2 id="career-drawer-title">
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

              <label className="field-group">
                <span>Descripción</span>
                <textarea
                  className="control-input textarea-input"
                  maxLength={512}
                  name="descripcion"
                  onChange={handleFieldChange}
                  value={form.descripcion}
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
