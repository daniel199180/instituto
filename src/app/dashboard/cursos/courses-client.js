"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  createCourse,
  deleteCourse,
  listCourseEnrolledStudents,
  listCourses,
  updateCourse,
} from "@/actions/courses";

const defaultSchedule = {
  dia: "lunes",
  horaFin: "",
  horaInicio: "",
};

const emptyForm = {
  carreraId: "",
  cupoMaximo: "",
  descripcion: "",
  docenteId: "",
  duracionMeses: "",
  estado: "cerrado",
  fechaInicio: "",
  nombre: "",
  orden: "",
  precioMensual: "",
  precioPorHora: "",
  schedules: [{ ...defaultSchedule }],
  sucursalId: "",
};

const statusLabels = {
  cerrado: "Cerrado",
  en_clases: "En clases",
  en_inscripciones: "En inscripciones",
  terminado: "Terminado",
};

const enrollmentStatusLabels = {
  activa: "Activa",
  cancelada: "Cancelada",
  finalizada: "Finalizada",
};

const dayLabels = {
  domingo: "Domingo",
  jueves: "Jueves",
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  sabado: "Sábado",
  viernes: "Viernes",
};

const shortDayLabels = {
  domingo: "Dom",
  jueves: "Jue",
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  sabado: "Sáb",
  viernes: "Vie",
};

const dayOptions = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

const statusOptions = [
  ["cerrado", "Cerrado", X],
  ["en_inscripciones", "Inscripciones", Check],
  ["en_clases", "En clases", BookOpen],
  ["terminado", "Terminado", Check],
];

function normalizeCourse(course) {
  return {
    $createdAt: course.$createdAt,
    $id: course.$id,
    $updatedAt: course.$updatedAt,
    carreraId: course.carreraId || "",
    carreraNombre: course.carreraNombre || "Curso independiente",
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado: Number(course.cupoOcupado || 0),
    descripcion: course.descripcion || "",
    docenteId: course.docenteId || "",
    docenteNombre: course.docenteNombre || "Sin docente",
    duracionMeses: Number(course.duracionMeses || 0),
    estado: course.estado || "cerrado",
    fechaInicio: course.fechaInicio || "",
    nombre: course.nombre || "",
    orden: course.orden ?? "",
    precioMensual: Number(course.precioMensual || 0),
    precioPorHora: Number(course.precioPorHora || 0),
    schedules: Array.isArray(course.schedules)
      ? course.schedules.map(normalizeSchedule)
      : [],
    sucursalId: course.sucursalId || "",
    sucursalNombre: course.sucursalNombre || "Sin sucursal",
  };
}

function normalizeSchedule(schedule) {
  return {
    $id: schedule.$id || "",
    dia: schedule.dia || "lunes",
    horaFin: schedule.horaFin || "",
    horaInicio: schedule.horaInicio || "",
  };
}

function normalizeEnrolledStudent(student) {
  return {
    $id: student.$id,
    apellido: student.apellido || "",
    diaVencimiento: student.diaVencimiento || "",
    documento: student.documento || "",
    email: student.email || "",
    estado: student.estado || "activa",
    estadoEstudiante: student.estadoEstudiante || "activo",
    fechaInicio: student.fechaInicio || "",
    montoMensual: Number(student.montoMensual || 0),
    nombre: student.nombre || "",
    studentId: student.studentId || "",
    telefono: student.telefono || "",
  };
}

function sortCourses(courses) {
  return [...courses].sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDuration(months) {
  const cleanMonths = Number(months || 0);

  return cleanMonths === 1 ? "1 mes" : `${cleanMonths} meses`;
}

function formatDateInputValue(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function formatDisplayDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function getEmptyForm() {
  return {
    ...emptyForm,
    schedules: [{ ...defaultSchedule }],
  };
}

function formatSchedules(schedules) {
  if (!schedules?.length) {
    return "Sin horarios";
  }

  return schedules
    .map(
      (schedule) =>
        `${shortDayLabels[schedule.dia] || schedule.dia} ${
          schedule.horaInicio || "--:--"
        }-${schedule.horaFin || "--:--"}`,
    )
    .join(", ");
}

export function CoursesClient() {
  const [courses, setCourses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [careers, setCareers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [drawerMode, setDrawerMode] = useState("closed");
  const [editingCourse, setEditingCourse] = useState(null);
  const [enrollmentDrawerCourse, setEnrollmentDrawerCourse] = useState(null);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [form, setForm] = useState(getEmptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [enrollmentError, setEnrollmentError] = useState("");
  const [isEnrollmentLoading, setIsEnrollmentLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesStatus =
        statusFilter === "todos" || course.estado === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${course.nombre} ${course.descripcion} ${course.sucursalNombre} ${course.carreraNombre} ${course.docenteNombre} ${formatSchedules(course.schedules)}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [courses, query, statusFilter]);

  const filteredCareers = useMemo(() => {
    if (!form.sucursalId) return careers;

    return careers.filter((career) => career.sucursalId === form.sucursalId);
  }, [careers, form.sucursalId]);

  const stats = useMemo(() => {
    return courses.reduce(
      (summary, course) => {
        summary.total += 1;

        if (course.estado === "en_inscripciones") {
          summary.en_inscripciones += 1;
        }

        if (course.estado === "en_clases") {
          summary.en_clases += 1;
        }

        if (course.estado === "cerrado") {
          summary.cerrado += 1;
        }

        return summary;
      },
      { cerrado: 0, en_clases: 0, en_inscripciones: 0, total: 0 },
    );
  }, [courses]);

  useEffect(() => {
    refreshCourses();
  }, []);

  function refreshCourses() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listCourses();

      if (!result.ok) {
        setError(result.error);
        setCourses([]);
        setBranches([]);
        setCareers([]);
        setTeachers([]);
      } else {
        setCourses(sortCourses(result.courses.map(normalizeCourse)));
        setBranches(result.branches || []);
        setCareers(result.careers || []);
        setTeachers(result.teachers || []);
      }

      setIsLoading(false);
    });
  }

  function getDefaultBranchId() {
    return branches.find((branch) => branch.estado === "activo")?.$id || "";
  }

  function getDefaultTeacherId() {
    return teachers.find((teacher) => teacher.estado === "activo")?.$id || "";
  }

  function openCreateDrawer() {
    setError("");
    setNotice("");
    setEditingCourse(null);
    setEnrollmentDrawerCourse(null);
    setForm({
      ...getEmptyForm(),
      docenteId: getDefaultTeacherId(),
      sucursalId: getDefaultBranchId(),
    });
    setDrawerMode("create");
  }

  function openEditDrawer(course) {
    setError("");
    setNotice("");
    setEditingCourse(course);
    setEnrollmentDrawerCourse(null);
    setForm({
      carreraId: course.carreraId,
      cupoMaximo: String(course.cupoMaximo),
      descripcion: course.descripcion,
      docenteId: course.docenteId,
      duracionMeses: String(course.duracionMeses),
      estado: course.estado,
      fechaInicio: formatDateInputValue(course.fechaInicio),
      nombre: course.nombre,
      orden: course.orden === "" ? "" : String(course.orden),
      precioMensual: String(course.precioMensual),
      precioPorHora: String(course.precioPorHora),
      schedules: course.schedules.length
        ? course.schedules.map((schedule) => ({
            dia: schedule.dia,
            horaFin: schedule.horaFin,
            horaInicio: schedule.horaInicio,
          }))
        : [{ ...defaultSchedule }],
      sucursalId: course.sucursalId,
    });
    setDrawerMode("edit");
  }

  function openEnrollmentsDrawer(course) {
    setError("");
    setNotice("");
    setEnrollmentError("");
    setDrawerMode("closed");
    setEditingCourse(null);
    setEnrollmentDrawerCourse(course);
    setEnrolledStudents([]);
    setIsEnrollmentLoading(true);

    startTransition(async () => {
      const result = await listCourseEnrolledStudents(course.$id);

      if (!result.ok) {
        setEnrollmentError(result.error);
      } else {
        setEnrolledStudents(
          result.students
            .map(normalizeEnrolledStudent)
            .sort((left, right) =>
              `${left.apellido} ${left.nombre}`.localeCompare(
                `${right.apellido} ${right.nombre}`,
                "es",
              ),
            ),
        );
      }

      setIsEnrollmentLoading(false);
    });
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerMode("closed");
    setEditingCourse(null);
    setForm(getEmptyForm());
  }

  function closeEnrollmentsDrawer() {
    setEnrollmentDrawerCourse(null);
    setEnrolledStudents([]);
    setEnrollmentError("");
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => {
      const nextForm = { ...currentForm, [name]: value };

      if (name === "sucursalId") {
        const careerBelongsToBranch = careers.some(
          (career) =>
            career.$id === nextForm.carreraId && career.sucursalId === value,
        );

        if (!careerBelongsToBranch) {
          nextForm.carreraId = "";
        }
      }

      return nextForm;
    });
  }

  function handleScheduleChange(index, field, value) {
    setForm((currentForm) => {
      const schedules = currentForm.schedules.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? { ...schedule, [field]: value } : schedule,
      );

      return { ...currentForm, schedules };
    });
  }

  function addScheduleRow() {
    setForm((currentForm) => ({
      ...currentForm,
      schedules: [...currentForm.schedules, { ...defaultSchedule }],
    }));
  }

  function removeScheduleRow(index) {
    setForm((currentForm) => {
      const schedules = currentForm.schedules.filter(
        (_, scheduleIndex) => scheduleIndex !== index,
      );

      return {
        ...currentForm,
        schedules: schedules.length ? schedules : [{ ...defaultSchedule }],
      };
    });
  }

  function upsertCourseInState(course) {
    setCourses((currentCourses) => {
      const normalized = normalizeCourse(course);
      const exists = currentCourses.some((item) => item.$id === normalized.$id);
      const nextCourses = exists
        ? currentCourses.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentCourses, normalized];

      return sortCourses(nextCourses);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editingCourse
          ? await updateCourse(editingCourse.$id, form)
          : await createCourse(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertCourseInState(result.course);
      closeDrawer(true);
    });
  }

  async function handleDelete(course) {
    const confirmed = window.confirm(
      `¿Borrar el curso "${course.nombre}"? Si tiene inscripciones, se marcará como cerrado.`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await deleteCourse(course.$id);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.closed) {
        upsertCourseInState(result.course);
        setNotice("El curso tiene inscripciones; se marcó como cerrado.");
        return;
      }

      setCourses((currentCourses) =>
        currentCourses.filter((item) => item.$id !== course.$id),
      );
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de cursos">
        <div className="branch-stat">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Inscripciones</span>
          <strong>{stats.en_inscripciones}</strong>
        </div>
        <div className="branch-stat">
          <span>En clases</span>
          <strong>{stats.en_clases}</strong>
        </div>
      </section>

      <section className="branch-controls" aria-label="Controles de cursos">
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar curso"
            type="search"
            value={query}
          />
        </label>

        <div className="segmented-control" aria-label="Filtrar por estado">
          {[
            ["todos", "Todos"],
            ["en_inscripciones", "Inscripciones"],
            ["en_clases", "Clases"],
            ["cerrado", "Cerrados"],
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
          onClick={refreshCourses}
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

      <section className="branch-table-shell" aria-label="Tabla de cursos">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleCourses.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th>Ubicación</th>
                    <th>Docente</th>
                    <th>Horarios</th>
                    <th>Inicio, duración y cupo</th>
                    <th>Precio</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visibleCourses.map((course) => (
                    <tr key={course.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <BookOpen size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>{course.nombre}</strong>
                            <span>
                              {course.descripcion || "Sin descripción"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{course.sucursalNombre}</span>
                          <span>{course.carreraNombre}</span>
                        </div>
                      </td>
                      <td>{course.docenteNombre}</td>
                      <td>
                        <div className="compact-cell schedule-cell">
                          <span>{formatSchedules(course.schedules)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{formatDisplayDate(course.fechaInicio)}</span>
                          <span>{formatDuration(course.duracionMeses)}</span>
                          <span>
                            {course.cupoOcupado}/{course.cupoMaximo} cupos
                          </span>
                        </div>
                      </td>
                      <td>{formatMoney(course.precioMensual)} mensual</td>
                      <td>
                        <StatusBadge status={course.estado} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Ver inscritos de ${course.nombre}`}
                            className="icon-action"
                            onClick={() => openEnrollmentsDrawer(course)}
                            type="button"
                          >
                            <UsersRound size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Editar ${course.nombre}`}
                            className="icon-action"
                            onClick={() => openEditDrawer(course)}
                            type="button"
                          >
                            <Edit3 size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Borrar ${course.nombre}`}
                            className="icon-action danger-action"
                            onClick={() => handleDelete(course)}
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
              {visibleCourses.map((course) => (
                <article className="branch-mobile-card" key={course.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{course.nombre}</h2>
                      <span>{course.sucursalNombre}</span>
                    </div>
                    <StatusBadge status={course.estado} />
                  </div>
                  <dl>
                    <div>
                      <dt>Carrera</dt>
                      <dd>{course.carreraNombre}</dd>
                    </div>
                    <div>
                      <dt>Docente</dt>
                      <dd>{course.docenteNombre}</dd>
                    </div>
                    <div>
                      <dt>Horarios</dt>
                      <dd>{formatSchedules(course.schedules)}</dd>
                    </div>
                    <div>
                      <dt>Inicio</dt>
                      <dd>{formatDisplayDate(course.fechaInicio)}</dd>
                    </div>
                    <div>
                      <dt>Duración</dt>
                      <dd>{formatDuration(course.duracionMeses)}</dd>
                    </div>
                    <div>
                      <dt>Cupo</dt>
                      <dd>
                        {course.cupoOcupado}/{course.cupoMaximo}
                      </dd>
                    </div>
                    <div>
                      <dt>Mensualidad</dt>
                      <dd>{formatMoney(course.precioMensual)}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      onClick={() => openEnrollmentsDrawer(course)}
                      type="button"
                    >
                      <UsersRound size={17} />
                      <span>Inscritos</span>
                    </button>
                    <button
                      className="secondary-action"
                      onClick={() => openEditDrawer(course)}
                      type="button"
                    >
                      <Edit3 size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      className="secondary-action danger-action"
                      onClick={() => handleDelete(course)}
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
            <BookOpen size={22} />
            <span>Sin cursos</span>
          </div>
        )}
      </section>

      {enrollmentDrawerCourse ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={closeEnrollmentsDrawer}
            type="button"
          />
          <aside
            aria-labelledby="course-enrollments-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Inscritos</p>
                <h2 id="course-enrollments-title">
                  {enrollmentDrawerCourse.nombre}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-action"
                onClick={closeEnrollmentsDrawer}
                type="button"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </header>

            <div className="drawer-form">
              {enrollmentError ? (
                <p className="form-error" role="alert">
                  {enrollmentError}
                </p>
              ) : null}

              {isEnrollmentLoading ? (
                <div className="table-state compact-state">
                  <Loader2 className="spin-icon" size={20} />
                  <span>Cargando inscritos</span>
                </div>
              ) : enrolledStudents.length ? (
                <div className="enrollment-drawer-list">
                  {enrolledStudents.map((student) => (
                    <article
                      className="enrollment-drawer-item"
                      key={student.$id}
                    >
                      <div>
                        <strong>
                          {student.nombre} {student.apellido}
                        </strong>
                        <span>{student.documento || "Sin documento"}</span>
                      </div>
                      <EnrollmentStatusBadge status={student.estado} />
                      <dl>
                        <div>
                          <dt>Contacto</dt>
                          <dd>
                            {student.email ||
                              student.telefono ||
                              "Sin contacto"}
                          </dd>
                        </div>
                        <div>
                          <dt>Inicio</dt>
                          <dd>{formatDisplayDate(student.fechaInicio)}</dd>
                        </div>
                        <div>
                          <dt>Cuota</dt>
                          <dd>{formatMoney(student.montoMensual)}</dd>
                        </div>
                        <div>
                          <dt>Vence día</dt>
                          <dd>{student.diaVencimiento || "Sin día"}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="table-state compact-state">
                  <UsersRound size={21} />
                  <span>Sin estudiantes inscritos</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {drawerMode !== "closed" ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={() => closeDrawer()}
            type="button"
          />
          <aside
            aria-labelledby="course-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Curso</p>
                <h2 id="course-drawer-title">
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
                <span>Carrera</span>
                <select
                  className="control-input"
                  name="carreraId"
                  onChange={handleFieldChange}
                  value={form.carreraId}
                >
                  <option value="">Curso independiente</option>
                  {filteredCareers.map((career) => (
                    <option key={career.$id} value={career.$id}>
                      {career.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span>Orden en carrera</span>
                <input
                  className="control-input"
                  min={0}
                  name="orden"
                  onChange={handleFieldChange}
                  type="number"
                  value={form.orden}
                />
              </label>

              <label className="field-group">
                <span>Docente</span>
                <select
                  className="control-input"
                  name="docenteId"
                  onChange={handleFieldChange}
                  required
                  value={form.docenteId}
                >
                  <option value="">Seleccionar</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.$id} value={teacher.$id}>
                      {teacher.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-two-columns">
                <label className="field-group">
                  <span>Mensualidad</span>
                  <input
                    className="control-input"
                    min={0}
                    name="precioMensual"
                    onChange={handleFieldChange}
                    required
                    step="0.01"
                    type="number"
                    value={form.precioMensual}
                  />
                </label>

                <label className="field-group">
                  <span>Pago/hora</span>
                  <input
                    className="control-input"
                    min={0}
                    name="precioPorHora"
                    onChange={handleFieldChange}
                    required
                    step="0.01"
                    type="number"
                    value={form.precioPorHora}
                  />
                </label>
              </div>

              <div className="form-two-columns">
                <label className="field-group">
                  <span>Inicio clases</span>
                  <input
                    className="control-input"
                    name="fechaInicio"
                    onChange={handleFieldChange}
                    required
                    type="date"
                    value={form.fechaInicio}
                  />
                </label>

                <label className="field-group">
                  <span>Duración meses</span>
                  <input
                    className="control-input"
                    min={1}
                    name="duracionMeses"
                    onChange={handleFieldChange}
                    required
                    step="1"
                    type="number"
                    value={form.duracionMeses}
                  />
                </label>

                <label className="field-group">
                  <span>Cupo máximo</span>
                  <input
                    className="control-input"
                    min={1}
                    name="cupoMaximo"
                    onChange={handleFieldChange}
                    required
                    step="1"
                    type="number"
                    value={form.cupoMaximo}
                  />
                </label>
              </div>

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

              <fieldset className="field-group schedule-fieldset">
                <legend>Horarios de clases</legend>
                <div className="schedule-form-list">
                  {form.schedules.map((schedule, index) => (
                    <div className="schedule-form-row" key={index}>
                      <label>
                        <span>Día</span>
                        <select
                          className="control-input"
                          onChange={(event) =>
                            handleScheduleChange(
                              index,
                              "dia",
                              event.target.value,
                            )
                          }
                          value={schedule.dia}
                        >
                          {dayOptions.map((day) => (
                            <option key={day} value={day}>
                              {dayLabels[day]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Inicio</span>
                        <input
                          className="control-input"
                          onChange={(event) =>
                            handleScheduleChange(
                              index,
                              "horaInicio",
                              event.target.value,
                            )
                          }
                          required
                          type="time"
                          value={schedule.horaInicio}
                        />
                      </label>

                      <label>
                        <span>Fin</span>
                        <input
                          className="control-input"
                          onChange={(event) =>
                            handleScheduleChange(
                              index,
                              "horaFin",
                              event.target.value,
                            )
                          }
                          required
                          type="time"
                          value={schedule.horaFin}
                        />
                      </label>

                      <button
                        aria-label="Quitar horario"
                        className="icon-action danger-action"
                        onClick={() => removeScheduleRow(index)}
                        type="button"
                      >
                        <Trash2 size={17} strokeWidth={1.8} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  className="secondary-action schedule-add-action"
                  onClick={addScheduleRow}
                  type="button"
                >
                  <Plus size={17} />
                  <span>Agregar horario</span>
                </button>
              </fieldset>

              <fieldset className="field-group state-fieldset">
                <legend>Estado</legend>
                <div className="state-options">
                  {statusOptions.map(([value, label, Icon]) => (
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

function EnrollmentStatusBadge({ status }) {
  return (
    <span className={`status-badge is-${status}`}>
      {enrollmentStatusLabels[status] || status}
    </span>
  );
}
