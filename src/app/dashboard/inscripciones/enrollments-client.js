"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  createEnrollment,
  listEnrollments,
  updateEnrollmentStatus,
} from "@/actions/enrollments";

const emptyForm = {
  courseId: "",
  motivoBeca: "",
  studentId: "",
  tipoBeca: "ninguna",
  valorBeca: "0",
};

const statusLabels = {
  activa: "Activa",
  cancelada: "Cancelada",
  finalizada: "Finalizada",
};

const scholarshipLabels = {
  monto_fijo: "Monto fijo",
  ninguna: "Sin beca",
  porcentaje: "Porcentaje",
};

function normalizeEnrollment(enrollment) {
  return {
    $createdAt: enrollment.$createdAt,
    $id: enrollment.$id,
    $updatedAt: enrollment.$updatedAt,
    courseId: enrollment.courseId || "",
    courseName: enrollment.courseName || "Curso no encontrado",
    diaVencimiento: enrollment.diaVencimiento || "",
    estado: enrollment.estado || "activa",
    fechaInicio: enrollment.fechaInicio || "",
    montoMensual: Number(enrollment.montoMensual || 0),
    motivoBeca: enrollment.motivoBeca || "",
    studentDocument: enrollment.studentDocument || "",
    studentId: enrollment.studentId || "",
    studentName: enrollment.studentName || "Estudiante no encontrado",
    sucursalId: enrollment.sucursalId || "",
    sucursalName: enrollment.sucursalName || "Sin sucursal",
    tipoBeca: enrollment.tipoBeca || "ninguna",
    valorBeca: Number(enrollment.valorBeca || 0),
  };
}

function normalizeCourse(course) {
  return {
    $id: course.$id,
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado: Number(course.cupoOcupado || 0),
    estado: course.estado || "cerrado",
    fechaInicio: course.fechaInicio || "",
    nombre: course.nombre || "",
    precioMensual: Number(course.precioMensual || 0),
    sucursalId: course.sucursalId || "",
    sucursalNombre: course.sucursalNombre || "Sin sucursal",
  };
}

function normalizeStudent(student) {
  return {
    $id: student.$id,
    documento: student.documento || "",
    estado: student.estado || "activo",
    nombre: student.nombre || "",
  };
}

function normalizeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
  };
}

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function sortEnrollments(enrollments) {
  return [...enrollments].sort((left, right) =>
    `${left.estado} ${left.courseName} ${left.studentName}`.localeCompare(
      `${right.estado} ${right.courseName} ${right.studentName}`,
      "es",
    ),
  );
}

export function EnrollmentsClient() {
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [enrollments, setEnrollments] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [branchFilter, setBranchFilter] = useState("todos");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const assignableCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesBranch =
        branchFilter === "todos" || course.sucursalId === branchFilter;

      return (
        matchesBranch &&
        course.estado === "en_inscripciones" &&
        course.fechaInicio &&
        course.cupoOcupado < course.cupoMaximo
      );
    });
  }, [branchFilter, courses]);

  const selectedCourse = useMemo(() => {
    return courses.find((course) => course.$id === form.courseId) || null;
  }, [courses, form.courseId]);

  const visibleEnrollments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return enrollments.filter((enrollment) => {
      const matchesStatus =
        statusFilter === "todos" || enrollment.estado === statusFilter;
      const matchesBranch =
        branchFilter === "todos" || enrollment.sucursalId === branchFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${enrollment.studentName} ${enrollment.studentDocument} ${enrollment.courseName} ${enrollment.sucursalName}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesBranch && matchesQuery;
    });
  }, [branchFilter, enrollments, query, statusFilter]);

  const stats = useMemo(() => {
    return enrollments.reduce(
      (summary, enrollment) => {
        summary.total += 1;
        summary[enrollment.estado] += 1;
        return summary;
      },
      { activa: 0, cancelada: 0, finalizada: 0, total: 0 },
    );
  }, [enrollments]);

  useEffect(() => {
    refreshEnrollments();
  }, []);

  function refreshEnrollments() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listEnrollments();

      if (!result.ok) {
        setError(result.error);
        setBranches([]);
        setCourses([]);
        setEnrollments([]);
        setStudents([]);
      } else {
        setBranches(result.branches.map(normalizeBranch));
        setCourses(result.courses.map(normalizeCourse));
        setEnrollments(
          sortEnrollments(result.enrollments.map(normalizeEnrollment)),
        );
        setStudents(result.students.map(normalizeStudent));
      }

      setIsLoading(false);
    });
  }

  function openDrawer() {
    setError("");
    setNotice("");
    setForm(emptyForm);
    setDrawerOpen(true);
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerOpen(false);
    setForm(emptyForm);
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  function upsertEnrollment(enrollment) {
    setEnrollments((currentEnrollments) => {
      const normalized = normalizeEnrollment(enrollment);
      const exists = currentEnrollments.some(
        (item) => item.$id === normalized.$id,
      );
      const nextEnrollments = exists
        ? currentEnrollments.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentEnrollments, normalized];

      return sortEnrollments(nextEnrollments);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await createEnrollment(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertEnrollment(result.enrollment);
      setNotice("Inscripción creada y mensualidades generadas.");
      closeDrawer(true);
    });
  }

  async function handleStatus(enrollment, status) {
    const confirmed = window.confirm(
      `¿Cambiar la inscripción de ${enrollment.studentName} a ${statusLabels[status]}?`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await updateEnrollmentStatus(enrollment.$id, status);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertEnrollment(result.enrollment);
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de inscripciones">
        <div className="branch-stat">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Activas</span>
          <strong>{stats.activa}</strong>
        </div>
        <div className="branch-stat">
          <span>Finalizadas</span>
          <strong>{stats.finalizada}</strong>
        </div>
        <div className="branch-stat">
          <span>Canceladas</span>
          <strong>{stats.cancelada}</strong>
        </div>
      </section>

      <section
        className="branch-controls"
        aria-label="Controles de inscripciones"
      >
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar inscripción"
            type="search"
            value={query}
          />
        </label>

        <select
          className="control-input"
          onChange={(event) => setBranchFilter(event.target.value)}
          value={branchFilter}
        >
          <option value="todos">Todas las sucursales</option>
          {branches.map((branch) => (
            <option key={branch.$id} value={branch.$id}>
              {branch.nombre}
            </option>
          ))}
        </select>

        <div className="segmented-control" aria-label="Filtrar por estado">
          {[
            ["todos", "Todas"],
            ["activa", "Activas"],
            ["finalizada", "Finalizadas"],
            ["cancelada", "Canceladas"],
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
          onClick={refreshEnrollments}
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
          onClick={openDrawer}
          type="button"
        >
          <Plus size={18} />
          <span>Inscribir</span>
        </button>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? <p className="form-note branch-error">{notice}</p> : null}

      <section
        className="branch-table-shell"
        aria-label="Tabla de inscripciones"
      >
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleEnrollments.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Curso</th>
                    <th>Inicio y vencimiento</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visibleEnrollments.map((enrollment) => (
                    <tr key={enrollment.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <GraduationCap size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>{enrollment.studentName}</strong>
                            <span>{enrollment.studentDocument}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{enrollment.courseName}</span>
                          <span>{enrollment.sucursalName}</span>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{formatDate(enrollment.fechaInicio)}</span>
                          <span>Día {enrollment.diaVencimiento}</span>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{formatMoney(enrollment.montoMensual)}</span>
                          <span>
                            {scholarshipLabels[enrollment.tipoBeca] ||
                              enrollment.tipoBeca}
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={enrollment.estado} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-action"
                            disabled={enrollment.estado === "finalizada"}
                            onClick={() =>
                              handleStatus(enrollment, "finalizada")
                            }
                            type="button"
                            aria-label="Finalizar inscripción"
                          >
                            <Check size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            className="icon-action danger-action"
                            disabled={enrollment.estado === "cancelada"}
                            onClick={() =>
                              handleStatus(enrollment, "cancelada")
                            }
                            type="button"
                            aria-label="Cancelar inscripción"
                          >
                            <X size={17} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {visibleEnrollments.map((enrollment) => (
                <article className="branch-mobile-card" key={enrollment.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{enrollment.studentName}</h2>
                      <span>{enrollment.courseName}</span>
                    </div>
                    <StatusBadge status={enrollment.estado} />
                  </div>
                  <dl>
                    <div>
                      <dt>Sucursal</dt>
                      <dd>{enrollment.sucursalName}</dd>
                    </div>
                    <div>
                      <dt>Inicio</dt>
                      <dd>{formatDate(enrollment.fechaInicio)}</dd>
                    </div>
                    <div>
                      <dt>Cuota</dt>
                      <dd>{formatMoney(enrollment.montoMensual)}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      disabled={enrollment.estado === "finalizada"}
                      onClick={() => handleStatus(enrollment, "finalizada")}
                      type="button"
                    >
                      <Check size={17} />
                      <span>Finalizar</span>
                    </button>
                    <button
                      className="secondary-action danger-action"
                      disabled={enrollment.estado === "cancelada"}
                      onClick={() => handleStatus(enrollment, "cancelada")}
                      type="button"
                    >
                      <X size={17} />
                      <span>Cancelar</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <BookOpen size={22} />
            <span>Sin inscripciones</span>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={() => closeDrawer()}
            type="button"
          />
          <aside
            aria-labelledby="enrollment-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Inscripción</p>
                <h2 id="enrollment-drawer-title">Crear</h2>
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
                <span>Estudiante</span>
                <select
                  className="control-input"
                  name="studentId"
                  onChange={handleFieldChange}
                  required
                  value={form.studentId}
                >
                  <option value="">Seleccionar</option>
                  {students.map((student) => (
                    <option key={student.$id} value={student.$id}>
                      {student.nombre} - {student.documento}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span>Curso</span>
                <select
                  className="control-input"
                  name="courseId"
                  onChange={handleFieldChange}
                  required
                  value={form.courseId}
                >
                  <option value="">Seleccionar</option>
                  {assignableCourses.map((course) => (
                    <option key={course.$id} value={course.$id}>
                      {course.nombre} - {course.sucursalNombre} -{" "}
                      {course.cupoOcupado}/{course.cupoMaximo}
                    </option>
                  ))}
                </select>
              </label>

              {selectedCourse ? (
                <p className="form-note">
                  Inicio {formatDate(selectedCourse.fechaInicio)} ·{" "}
                  {formatMoney(selectedCourse.precioMensual)}
                </p>
              ) : null}

              <label className="field-group">
                <span>Beca/descuento</span>
                <select
                  className="control-input"
                  name="tipoBeca"
                  onChange={handleFieldChange}
                  value={form.tipoBeca}
                >
                  <option value="ninguna">Sin beca</option>
                  <option value="porcentaje">Porcentaje</option>
                  <option value="monto_fijo">Monto fijo</option>
                </select>
              </label>

              {form.tipoBeca !== "ninguna" ? (
                <>
                  <label className="field-group">
                    <span>Valor</span>
                    <input
                      className="control-input"
                      min={0}
                      name="valorBeca"
                      onChange={handleFieldChange}
                      required
                      step="0.01"
                      type="number"
                      value={form.valorBeca}
                    />
                  </label>

                  <label className="field-group">
                    <span>Motivo</span>
                    <textarea
                      className="control-input textarea-input"
                      maxLength={256}
                      name="motivoBeca"
                      onChange={handleFieldChange}
                      required
                      value={form.motivoBeca}
                    />
                  </label>
                </>
              ) : null}

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
