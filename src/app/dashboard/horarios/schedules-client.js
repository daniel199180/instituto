"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarClock,
  Check,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  listCourseSchedules,
  updateCourseSchedule,
} from "@/actions/course-schedules";

const emptyForm = {
  courseId: "",
  dia: "lunes",
  horaFin: "",
  horaInicio: "",
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

const dayOptions = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];
const plannerColorClasses = [
  "is-sky",
  "is-emerald",
  "is-amber",
  "is-rose",
  "is-violet",
  "is-cyan",
  "is-lime",
];

const defaultPlannerStart = 7 * 60;
const defaultPlannerEnd = 22 * 60;
const hourHeight = 72;

function normalizeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
  };
}

function normalizeCourse(course) {
  return {
    $id: course.$id,
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado: Number(course.cupoOcupado || 0),
    docenteNombre: course.docenteNombre || "Sin docente",
    estado: course.estado || "cerrado",
    nombre: course.nombre || "",
    sucursalId: course.sucursalId || "",
    sucursalNombre: course.sucursalNombre || "Sin sucursal",
  };
}

function normalizeSchedule(schedule) {
  return {
    $createdAt: schedule.$createdAt,
    $id: schedule.$id,
    $updatedAt: schedule.$updatedAt,
    courseId: schedule.courseId || "",
    courseName: schedule.courseName || "Curso no encontrado",
    cupoMaximo: Number(schedule.cupoMaximo || 0),
    cupoOcupado: Number(schedule.cupoOcupado || 0),
    dia: schedule.dia || "lunes",
    docenteNombre: schedule.docenteNombre || "Sin docente",
    horaFin: schedule.horaFin || "",
    horaInicio: schedule.horaInicio || "",
    sucursalId: schedule.sucursalId || "",
    sucursalNombre: schedule.sucursalNombre || "Sin sucursal",
  };
}

function sortSchedules(schedules) {
  return [...schedules].sort((left, right) => {
    const dayDiff =
      dayOptions.indexOf(left.dia) - dayOptions.indexOf(right.dia);

    if (dayDiff !== 0) return dayDiff;

    return left.horaInicio.localeCompare(right.horaInicio);
  });
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatHourLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildHourMarks(startMinute, endMinute) {
  const marks = [];

  for (let minute = startMinute; minute <= endMinute; minute += 60) {
    marks.push(minute);
  }

  return marks;
}

function assignScheduleLanes(daySchedules) {
  const ordered = daySchedules
    .map((schedule) => ({
      ...schedule,
      endMinute: timeToMinutes(schedule.horaFin),
      startMinute: timeToMinutes(schedule.horaInicio),
    }))
    .filter(
      (schedule) =>
        schedule.startMinute !== null &&
        schedule.endMinute !== null &&
        schedule.endMinute > schedule.startMinute,
    )
    .sort((left, right) => left.startMinute - right.startMinute);

  const clusters = [];
  let currentCluster = [];
  let clusterEnd = -1;

  ordered.forEach((schedule) => {
    if (!currentCluster.length || schedule.startMinute < clusterEnd) {
      currentCluster.push(schedule);
      clusterEnd = Math.max(clusterEnd, schedule.endMinute);
      return;
    }

    clusters.push(currentCluster);
    currentCluster = [schedule];
    clusterEnd = schedule.endMinute;
  });

  if (currentCluster.length) {
    clusters.push(currentCluster);
  }

  return clusters.flatMap((cluster) => {
    const laneEnds = [];
    const placed = cluster.map((schedule) => {
      const reusableLane = laneEnds.findIndex(
        (endMinute) => endMinute <= schedule.startMinute,
      );
      const laneIndex = reusableLane === -1 ? laneEnds.length : reusableLane;

      laneEnds[laneIndex] = schedule.endMinute;

      return {
        ...schedule,
        laneIndex,
      };
    });

    return placed.map((schedule) => ({
      ...schedule,
      laneCount: laneEnds.length,
    }));
  });
}

function getCourseColorClass(courseId, colorMap) {
  return colorMap.get(courseId) || plannerColorClasses[0];
}

export function SchedulesClient() {
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [drawerMode, setDrawerMode] = useState("closed");
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("todos");
  const [dayFilter, setDayFilter] = useState("todos");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      return !branchFilter || course.sucursalId === branchFilter;
    });
  }, [branchFilter, courses]);

  const drawerCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesBranch = !branchFilter || course.sucursalId === branchFilter;

      return matchesBranch && course.estado !== "cerrado";
    });
  }, [branchFilter, courses]);

  const visibleSchedules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return schedules.filter((schedule) => {
      const matchesBranch =
        !branchFilter || schedule.sucursalId === branchFilter;
      const matchesCourse =
        courseFilter === "todos" || schedule.courseId === courseFilter;
      const matchesDay = dayFilter === "todos" || schedule.dia === dayFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${schedule.courseName} ${schedule.docenteNombre} ${schedule.sucursalNombre} ${dayLabels[schedule.dia]} ${schedule.horaInicio} ${schedule.horaFin}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesBranch && matchesCourse && matchesDay && matchesQuery;
    });
  }, [branchFilter, courseFilter, dayFilter, query, schedules]);

  const stats = useMemo(() => {
    const courseIds = new Set(
      visibleSchedules.map((schedule) => schedule.courseId),
    );
    const students = new Map(
      visibleSchedules.map((schedule) => [
        schedule.courseId,
        schedule.cupoOcupado,
      ]),
    );

    return {
      courses: courseIds.size,
      students: Array.from(students.values()).reduce(
        (total, count) => total + count,
        0,
      ),
      total: visibleSchedules.length,
    };
  }, [visibleSchedules]);

  const courseColorMap = useMemo(() => {
    return new Map(
      filteredCourses.map((course, index) => [
        course.$id,
        plannerColorClasses[index % plannerColorClasses.length],
      ]),
    );
  }, [filteredCourses]);

  const planner = useMemo(() => {
    const validMinutes = visibleSchedules.flatMap((schedule) => {
      const startMinute = timeToMinutes(schedule.horaInicio);
      const endMinute = timeToMinutes(schedule.horaFin);

      return startMinute !== null && endMinute !== null
        ? [startMinute, endMinute]
        : [];
    });
    const minMinute = validMinutes.length
      ? Math.min(...validMinutes, defaultPlannerStart)
      : defaultPlannerStart;
    const maxMinute = validMinutes.length
      ? Math.max(...validMinutes, defaultPlannerEnd)
      : defaultPlannerEnd;
    const startMinute = Math.max(0, Math.floor(minMinute / 60) * 60);
    const endMinute = Math.min(24 * 60, Math.ceil(maxMinute / 60) * 60);
    const daySchedules = new Map(
      dayOptions.map((day) => [
        day,
        assignScheduleLanes(
          visibleSchedules.filter((schedule) => schedule.dia === day),
        ),
      ]),
    );

    return {
      daySchedules,
      endMinute,
      hourMarks: buildHourMarks(startMinute, endMinute),
      startMinute,
      totalHeight: ((endMinute - startMinute) / 60) * hourHeight,
    };
  }, [visibleSchedules]);

  useEffect(() => {
    refreshSchedules();
  }, []);

  function refreshSchedules() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listCourseSchedules();

      if (!result.ok) {
        setError(result.error);
        setBranches([]);
        setCourses([]);
        setSchedules([]);
      } else {
        const nextBranches = result.branches.map(normalizeBranch);
        const nextCourses = result.courses.map(normalizeCourse);

        setBranches(nextBranches);
        setCourses(nextCourses);
        setSchedules(sortSchedules(result.schedules.map(normalizeSchedule)));
        setBranchFilter((currentBranch) => {
          const hasCurrentBranch = nextBranches.some(
            (branch) => branch.$id === currentBranch,
          );

          return hasCurrentBranch ? currentBranch : nextBranches[0]?.$id || "";
        });
      }

      setIsLoading(false);
    });
  }

  function openEditDrawer(schedule) {
    setError("");
    setNotice("");
    setEditingSchedule(schedule);
    setForm({
      courseId: schedule.courseId,
      dia: schedule.dia,
      horaFin: schedule.horaFin,
      horaInicio: schedule.horaInicio,
    });
    setDrawerMode("edit");
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerMode("closed");
    setEditingSchedule(null);
    setForm(emptyForm);
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  function upsertSchedule(schedule) {
    setSchedules((currentSchedules) => {
      const normalized = normalizeSchedule(schedule);
      const exists = currentSchedules.some(
        (item) => item.$id === normalized.$id,
      );
      const nextSchedules = exists
        ? currentSchedules.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentSchedules, normalized];

      return sortSchedules(nextSchedules);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editingSchedule
          ? await updateCourseSchedule(editingSchedule.$id, form)
          : { error: "Selecciona un horario para editar.", ok: false };

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertSchedule(result.schedule);
      closeDrawer(true);
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de horarios">
        <div className="branch-stat">
          <span>Bloques</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Cursos</span>
          <strong>{stats.courses}</strong>
        </div>
        <div className="branch-stat">
          <span>Estudiantes</span>
          <strong>{stats.students}</strong>
        </div>
      </section>

      <section
        className="branch-controls schedule-controls"
        aria-label="Controles de horarios"
      >
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar horario"
            type="search"
            value={query}
          />
        </label>

        <select
          className="control-input"
          onChange={(event) => {
            setBranchFilter(event.target.value);
            setCourseFilter("todos");
          }}
          value={branchFilter}
        >
          {branches.map((branch) => (
            <option key={branch.$id} value={branch.$id}>
              {branch.nombre}
            </option>
          ))}
        </select>

        <select
          className="control-input"
          onChange={(event) => setCourseFilter(event.target.value)}
          value={courseFilter}
        >
          <option value="todos">Todos los cursos</option>
          {filteredCourses.map((course) => (
            <option key={course.$id} value={course.$id}>
              {course.nombre}
            </option>
          ))}
        </select>

        <select
          className="control-input"
          onChange={(event) => setDayFilter(event.target.value)}
          value={dayFilter}
        >
          <option value="todos">Todos los días</option>
          {dayOptions.map((day) => (
            <option key={day} value={day}>
              {dayLabels[day]}
            </option>
          ))}
        </select>

        <button
          className="secondary-action"
          disabled={isLoading || isPending}
          onClick={refreshSchedules}
          type="button"
        >
          <RefreshCw
            className={isLoading || isPending ? "spin-icon" : ""}
            size={17}
          />
          <span>Actualizar</span>
        </button>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? <p className="form-note branch-error">{notice}</p> : null}

      <section
        className="schedule-planner-shell"
        aria-label="Gráfico de horarios"
      >
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleSchedules.length ? (
          <div className="schedule-planner-scroll">
            <div
              className="schedule-planner"
              style={{
                "--planner-height": `${planner.totalHeight}px`,
              }}
            >
              <div className="planner-corner">
                <CalendarClock size={18} strokeWidth={1.8} />
              </div>

              {dayOptions.map((day) => {
                const dayCount = planner.daySchedules.get(day)?.length || 0;

                return (
                  <header className="planner-day-heading" key={day}>
                    <strong>{dayLabels[day]}</strong>
                    <span>
                      {dayCount} {dayCount === 1 ? "bloque" : "bloques"}
                    </span>
                  </header>
                );
              })}

              <div
                className="planner-time-axis"
                style={{ minHeight: "var(--planner-height)" }}
              >
                {planner.hourMarks.map((minute) => (
                  <span
                    className="planner-hour-label"
                    key={minute}
                    style={{
                      top: `${((minute - planner.startMinute) / 60) * hourHeight}px`,
                    }}
                  >
                    {formatHourLabel(minute)}
                  </span>
                ))}
              </div>

              {dayOptions.map((day) => (
                <div
                  className="planner-day-column"
                  key={day}
                  style={{ minHeight: "var(--planner-height)" }}
                >
                  {planner.hourMarks.map((minute) => (
                    <span
                      className="planner-hour-line"
                      key={minute}
                      style={{
                        top: `${((minute - planner.startMinute) / 60) * hourHeight}px`,
                      }}
                    />
                  ))}

                  {planner.daySchedules.get(day).map((schedule) => {
                    const top =
                      ((schedule.startMinute - planner.startMinute) / 60) *
                      hourHeight;
                    const height = Math.max(
                      88,
                      ((schedule.endMinute - schedule.startMinute) / 60) *
                        hourHeight,
                    );
                    const laneWidth = 100 / schedule.laneCount;
                    const laneLeft = laneWidth * schedule.laneIndex;
                    const colorClass = getCourseColorClass(
                      schedule.courseId,
                      courseColorMap,
                    );

                    return (
                      <article
                        className={`planner-event ${colorClass}`}
                        key={schedule.$id}
                        style={{
                          height: `${height}px`,
                          left: `calc(${laneLeft}% + 4px)`,
                          top: `${top}px`,
                          width: `calc(${laneWidth}% - 8px)`,
                        }}
                      >
                        <button
                          aria-label={`Editar horario de ${schedule.courseName}`}
                          className="planner-event-main"
                          onClick={() => openEditDrawer(schedule)}
                          type="button"
                        >
                          <strong>{schedule.courseName}</strong>
                          <span>{schedule.docenteNombre}</span>
                          <span>{schedule.sucursalNombre}</span>
                          <span>
                            {schedule.cupoOcupado}
                            {schedule.cupoMaximo
                              ? `/${schedule.cupoMaximo}`
                              : ""}{" "}
                            estudiantes
                          </span>
                          <small>
                            {schedule.horaInicio} - {schedule.horaFin}
                          </small>
                        </button>
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="table-state">
            <CalendarClock size={22} />
            <span>Sin horarios</span>
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
            aria-labelledby="schedule-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Horario</p>
                <h2 id="schedule-drawer-title">
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
                <span>Curso</span>
                <select
                  className="control-input"
                  name="courseId"
                  onChange={handleFieldChange}
                  required
                  value={form.courseId}
                >
                  <option value="">Seleccionar</option>
                  {drawerCourses.map((course) => (
                    <option key={course.$id} value={course.$id}>
                      {course.nombre} - {course.sucursalNombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span>Día</span>
                <select
                  className="control-input"
                  name="dia"
                  onChange={handleFieldChange}
                  required
                  value={form.dia}
                >
                  {dayOptions.map((day) => (
                    <option key={day} value={day}>
                      {dayLabels[day]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-two-columns">
                <label className="field-group">
                  <span>Hora inicio</span>
                  <input
                    className="control-input"
                    name="horaInicio"
                    onChange={handleFieldChange}
                    required
                    type="time"
                    value={form.horaInicio}
                  />
                </label>

                <label className="field-group">
                  <span>Hora fin</span>
                  <input
                    className="control-input"
                    name="horaFin"
                    onChange={handleFieldChange}
                    required
                    type="time"
                    value={form.horaFin}
                  />
                </label>
              </div>

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
