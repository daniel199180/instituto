"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  Edit3,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createTeacher,
  deleteTeacher,
  listTeachers,
  updateTeacher,
} from "@/actions/teachers";

const emptyForm = {
  apellido: "",
  documento: "",
  email: "",
  especialidad: "",
  estado: "activo",
  nombre: "",
  telefono: "",
  userId: "",
};

const statusLabels = {
  activo: "Activo",
  inactivo: "Inactivo",
};

function normalizeTeacherStatus(status) {
  if (status === "cerrado" || status === "inactiva") return "inactivo";

  return status === "inactivo" ? "inactivo" : "activo";
}

function normalizeTeacher(teacher) {
  return {
    $createdAt: teacher.$createdAt,
    $id: teacher.$id,
    $updatedAt: teacher.$updatedAt,
    apellido: teacher.apellido || "",
    documento: teacher.documento || "",
    email: teacher.email || "",
    especialidad: teacher.especialidad || "",
    estado: normalizeTeacherStatus(teacher.estado),
    nombre: teacher.nombre || "",
    telefono: teacher.telefono || "",
    userId: teacher.userId || "",
  };
}

function sortTeachers(teachers) {
  return [...teachers].sort((left, right) =>
    `${left.apellido} ${left.nombre}`.localeCompare(
      `${right.apellido} ${right.nombre}`,
      "es",
    ),
  );
}

export function TeachersClient() {
  const [teachers, setTeachers] = useState([]);
  const [drawerMode, setDrawerMode] = useState("closed");
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleTeachers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return teachers.filter((teacher) => {
      const matchesStatus =
        statusFilter === "todos" || teacher.estado === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${teacher.nombre} ${teacher.apellido} ${teacher.documento} ${teacher.email} ${teacher.telefono} ${teacher.especialidad}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, teachers]);

  const stats = useMemo(() => {
    return teachers.reduce(
      (summary, teacher) => {
        summary.total += 1;
        summary[teacher.estado] += 1;
        return summary;
      },
      { activo: 0, inactivo: 0, total: 0 },
    );
  }, [teachers]);

  useEffect(() => {
    refreshTeachers();
  }, []);

  function refreshTeachers() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listTeachers();

      if (!result.ok) {
        setError(result.error);
        setTeachers([]);
      } else {
        setTeachers(sortTeachers(result.teachers.map(normalizeTeacher)));
      }

      setIsLoading(false);
    });
  }

  function openCreateDrawer() {
    setError("");
    setNotice("");
    setEditingTeacher(null);
    setForm(emptyForm);
    setDrawerMode("create");
  }

  function openEditDrawer(teacher) {
    setError("");
    setNotice("");
    setEditingTeacher(teacher);
    setForm({
      apellido: teacher.apellido,
      documento: teacher.documento,
      email: teacher.email,
      especialidad: teacher.especialidad,
      estado: teacher.estado,
      nombre: teacher.nombre,
      telefono: teacher.telefono,
      userId: teacher.userId,
    });
    setDrawerMode("edit");
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerMode("closed");
    setEditingTeacher(null);
    setForm(emptyForm);
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  function upsertTeacherInState(teacher) {
    setTeachers((currentTeachers) => {
      const normalized = normalizeTeacher(teacher);
      const exists = currentTeachers.some(
        (item) => item.$id === normalized.$id,
      );
      const nextTeachers = exists
        ? currentTeachers.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentTeachers, normalized];

      return sortTeachers(nextTeachers);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editingTeacher
          ? await updateTeacher(editingTeacher.$id, form)
          : await createTeacher(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertTeacherInState(result.teacher);
      closeDrawer(true);
    });
  }

  async function handleDelete(teacher) {
    const confirmed = window.confirm(
      `¿Borrar al docente "${teacher.nombre} ${teacher.apellido}"? Si tiene historial, se marcará como inactivo.`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await deleteTeacher(teacher.$id);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.deactivated) {
        upsertTeacherInState(result.teacher);
        setNotice(
          "El docente tiene cursos o asistencia registrada; se marcó como inactivo.",
        );
        return;
      }

      setTeachers((currentTeachers) =>
        currentTeachers.filter((item) => item.$id !== teacher.$id),
      );
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de docentes">
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

      <section className="branch-controls" aria-label="Controles de docentes">
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar docente"
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
          onClick={refreshTeachers}
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

      <section className="branch-table-shell" aria-label="Tabla de docentes">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleTeachers.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Docente</th>
                    <th>Documento</th>
                    <th>Contacto</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visibleTeachers.map((teacher) => (
                    <tr key={teacher.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <GraduationCap size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>
                              {teacher.nombre} {teacher.apellido}
                            </strong>
                            <span>
                              {teacher.especialidad || "Sin especialidad"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{teacher.documento}</td>
                      <td>
                        <div className="compact-cell">
                          <span>{teacher.email || "Sin correo"}</span>
                          <span>{teacher.telefono || "Sin teléfono"}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={teacher.estado} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Editar ${teacher.nombre} ${teacher.apellido}`}
                            className="icon-action"
                            onClick={() => openEditDrawer(teacher)}
                            type="button"
                          >
                            <Edit3 size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Borrar ${teacher.nombre} ${teacher.apellido}`}
                            className="icon-action danger-action"
                            onClick={() => handleDelete(teacher)}
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
              {visibleTeachers.map((teacher) => (
                <article className="branch-mobile-card" key={teacher.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>
                        {teacher.nombre} {teacher.apellido}
                      </h2>
                      <span>{teacher.especialidad || "Sin especialidad"}</span>
                    </div>
                    <StatusBadge status={teacher.estado} />
                  </div>
                  <dl>
                    <div>
                      <dt>Documento</dt>
                      <dd>{teacher.documento}</dd>
                    </div>
                    <div>
                      <dt>Correo</dt>
                      <dd>{teacher.email || "Sin correo"}</dd>
                    </div>
                    <div>
                      <dt>Teléfono</dt>
                      <dd>{teacher.telefono || "Sin teléfono"}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      onClick={() => openEditDrawer(teacher)}
                      type="button"
                    >
                      <Edit3 size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      className="secondary-action danger-action"
                      onClick={() => handleDelete(teacher)}
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
            <GraduationCap size={22} />
            <span>Sin docentes</span>
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
            aria-labelledby="teacher-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Docente</p>
                <h2 id="teacher-drawer-title">
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
                <span>Apellido</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="apellido"
                  onChange={handleFieldChange}
                  required
                  value={form.apellido}
                />
              </label>

              <label className="field-group">
                <span>Documento</span>
                <input
                  className="control-input"
                  maxLength={32}
                  name="documento"
                  onChange={handleFieldChange}
                  required
                  value={form.documento}
                />
              </label>

              <label className="field-group">
                <span>Correo</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="email"
                  onChange={handleFieldChange}
                  type="email"
                  value={form.email}
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

              <label className="field-group">
                <span>Especialidad</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="especialidad"
                  onChange={handleFieldChange}
                  value={form.especialidad}
                />
              </label>

              <label className="field-group">
                <span>ID usuario Appwrite</span>
                <input
                  className="control-input"
                  maxLength={64}
                  name="userId"
                  onChange={handleFieldChange}
                  value={form.userId}
                />
              </label>

              <fieldset className="field-group state-fieldset">
                <legend>Estado</legend>
                <div className="state-options">
                  {[
                    ["activo", "Activo", Check],
                    ["inactivo", "Inactivo", X],
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
