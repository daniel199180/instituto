"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, ClipboardCheck, Loader2, Save, UserRound } from "lucide-react";
import {
  getMyCourseRoster,
  getMyTeacherCourses,
  saveMyCourseAttendance,
} from "@/actions/attendance";

function formatDisplayDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "long",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

const STATUS_OPTIONS = [
  { label: "Presente", value: "presente" },
  { label: "Ausente", value: "ausente" },
  { label: "Justificado", value: "justificado" },
];

function getTodayDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date());
}

function buildDrafts(roster) {
  return Object.fromEntries(
    roster.map((student) => [student.studentId, student.estado || "presente"]),
  );
}

export function MyAttendanceClient({ initialCourseId = "" }) {
  const today = getTodayDateInputValue();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(initialCourseId);
  const [date, setDate] = useState(today);
  const [roster, setRoster] = useState([]);
  const [attendanceLocked, setAttendanceLocked] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [teacherName, setTeacherName] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedCourse = useMemo(
    () => courses.find((course) => course.$id === courseId) || null,
    [courses, courseId],
  );

  const loadRoster = useCallback((selectedCourseId, selectedDate) => {
    if (!selectedCourseId) {
      setRoster([]);
      setDrafts({});
      setAttendanceLocked(false);
      return;
    }

    setIsLoadingRoster(true);
    setError("");

    startTransition(async () => {
      const result = await getMyCourseRoster(selectedCourseId, selectedDate);

      if (!result.ok) {
        setError(result.error);
        setRoster([]);
        setDrafts({});
        setAttendanceLocked(false);
      } else {
        setRoster(result.roster);
        setDrafts(buildDrafts(result.roster));
        setAttendanceLocked(Boolean(result.locked));
      }

      setIsLoadingRoster(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getMyTeacherCourses().then((result) => {
      if (!result.ok) {
        setError(result.error);
        setIsLoadingCourses(false);
        return;
      }

      setCourses(result.courses);
      setTeacherName(result.teacherName || "");

      const nextCourseId =
        result.courses.find((course) => course.$id === initialCourseId)?.$id ||
        result.courses[0]?.$id ||
        "";

      setCourseId(nextCourseId);
      setIsLoadingCourses(false);

      if (nextCourseId) loadRoster(nextCourseId, today);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCourseChange(event) {
    loadRoster(event.target.value, today);
    setCourseId(event.target.value);
  }

  function updateDraft(studentId, estado) {
    setDrafts((current) => ({ ...current, [studentId]: estado }));
  }

  function handleSave() {
    setError("");

    startTransition(async () => {
      const records = roster.map((student) => ({
        estado: drafts[student.studentId] || "",
        studentId: student.studentId,
      }));
      const result = await saveMyCourseAttendance(courseId, date, records);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setRoster(result.roster);
      setDrafts(buildDrafts(result.roster));
      setAttendanceLocked(Boolean(result.locked));
      setConfirmation({
        courseName: selectedCourse?.nombre || "",
        date,
        teacherName: result.teacherName || teacherName,
      });
    });
  }

  const busy = isLoadingRoster || isPending;

  return (
    <div className="branches-page">
      <section
        className="branch-controls finance-controls"
        aria-label="Filtros de asistencia"
      >
        <label className="field-group inline-field">
          <span>Curso</span>
          <select
            className="control-input"
            disabled={isLoadingCourses || !courses.length}
            onChange={handleCourseChange}
            value={courseId}
          >
            {courses.length ? (
              courses.map((course) => (
                <option key={course.$id} value={course.$id}>
                  {course.nombre}
                </option>
              ))
            ) : (
              <option value="">Sin cursos</option>
            )}
          </select>
        </label>

        <div className="field-group inline-field">
          <span>Fecha</span>
          <div className="fixed-date-chip" aria-label={`Fecha actual ${date}`}>
            {formatDisplayDate(date)}
          </div>
        </div>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="branch-table-shell" aria-label="Lista de estudiantes">
        {isLoadingCourses ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando cursos</span>
          </div>
        ) : !selectedCourse ? (
          <div className="table-state">
            <ClipboardCheck size={22} />
            <span>No tienes cursos asignados.</span>
          </div>
        ) : isLoadingRoster ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando estudiantes</span>
          </div>
        ) : roster.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Documento</th>
                    <th>Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((student) => {
                    const estado = drafts[student.studentId] || "";

                    return (
                      <tr key={student.studentId}>
                        <td>
                          <div className="branch-name-cell">
                            <span className="branch-icon">
                              <UserRound size={18} strokeWidth={1.8} />
                            </span>
                            <strong>
                              {student.nombre} {student.apellido}
                            </strong>
                          </div>
                        </td>
                        <td>{student.documento}</td>
                        <td>
                          <div className="attendance-status-group">
                            {STATUS_OPTIONS.map((option) => (
                              <button
                                className={`attendance-status-btn is-${option.value} ${
                                  estado === option.value ? "is-selected" : ""
                                }`}
                                disabled={attendanceLocked || busy}
                                key={option.value}
                                onClick={() =>
                                  updateDraft(student.studentId, option.value)
                                }
                                type="button"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {roster.map((student) => {
                const estado = drafts[student.studentId] || "";

                return (
                  <article className="branch-mobile-card" key={student.studentId}>
                    <div className="branch-mobile-heading">
                      <div>
                        <h2>
                          {student.nombre} {student.apellido}
                        </h2>
                        <span>{student.documento}</span>
                      </div>
                    </div>
                    <div className="attendance-status-group">
                      {STATUS_OPTIONS.map((option) => (
                        <button
                          className={`attendance-status-btn is-${option.value} ${
                            estado === option.value ? "is-selected" : ""
                          }`}
                          disabled={attendanceLocked || busy}
                          key={option.value}
                          onClick={() => updateDraft(student.studentId, option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="attendance-actions">
              {attendanceLocked ? (
                <p className="form-note attendance-locked-note" role="status">
                  La asistencia de hoy ya fue registrada y está cerrada.
                </p>
              ) : null}
              <button
                className="primary-action"
                disabled={attendanceLocked || busy}
                onClick={handleSave}
                type="button"
              >
                {busy ? (
                  <Loader2 className="spin-icon" size={18} />
                ) : (
                  <Save size={18} />
                )}
                <span>{attendanceLocked ? "Asistencia cerrada" : "Guardar asistencia"}</span>
              </button>
            </div>
          </>
        ) : (
          <div className="table-state">
            <ClipboardCheck size={22} />
            <span>Este curso no tiene estudiantes inscritos activos.</span>
          </div>
        )}
      </section>

      {confirmation ? (
        <div className="pos-confirmation-layer" role="presentation">
          <div
            aria-labelledby="attendance-confirmation-title"
            aria-modal="true"
            className="pos-confirmation-dialog"
            role="dialog"
          >
            <span className="pos-confirmation-icon">
              <Check size={24} strokeWidth={2} />
            </span>
            <div>
              <p className="eyebrow">Asistencia</p>
              <h2 id="attendance-confirmation-title">Registro completado</h2>
              <dl className="confirmation-details">
                <div>
                  <dt>Curso</dt>
                  <dd>{confirmation.courseName}</dd>
                </div>
                <div>
                  <dt>Docente</dt>
                  <dd>{confirmation.teacherName || "-"}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{formatDisplayDate(confirmation.date)}</dd>
                </div>
              </dl>
            </div>
            <button
              className="primary-action"
              onClick={() => setConfirmation(null)}
              type="button"
            >
              <Check size={18} />
              <span>Aceptar</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
