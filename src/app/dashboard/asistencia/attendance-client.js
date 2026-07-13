"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  ClipboardCheck,
  Loader2,
  Search,
  Save,
  UserRound,
} from "lucide-react";
import {
  getCourseRosterForStaff,
  getTeacherCoursesForStaff,
  getTeachersForAttendance,
  listStudentAttendanceLog,
  saveCourseAttendanceForStaff,
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

const STATUS_LABELS = {
  ausente: "Ausente",
  justificado: "Justificado",
  presente: "Presente",
};

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

export function AttendanceClient() {
  const today = getTodayDateInputValue();
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState("");
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [date, setDate] = useState(today);
  const [roster, setRoster] = useState([]);
  const [attendanceLocked, setAttendanceLocked] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [attendanceLog, setAttendanceLog] = useState([]);
  const [logQuery, setLogQuery] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(true);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [isLoadingLog, setIsLoadingLog] = useState(true);
  const [isPending, startTransition] = useTransition();

  const selectedCourse = useMemo(
    () => courses.find((course) => course.$id === courseId) || null,
    [courses, courseId],
  );

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.$id === teacherId) || null,
    [teachers, teacherId],
  );

  const visibleAttendanceLog = useMemo(() => {
    const normalizedQuery = logQuery.trim().toLowerCase();

    if (!normalizedQuery) return attendanceLog;

    return attendanceLog.filter((entry) =>
      `${entry.studentName} ${entry.studentDocument} ${entry.courseName} ${entry.teacherName} ${entry.date}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [attendanceLog, logQuery]);

  function refreshAttendanceLog() {
    setIsLoadingLog(true);

    startTransition(async () => {
      const result = await listStudentAttendanceLog();

      if (!result.ok) {
        setError(result.error);
        setAttendanceLog([]);
      } else {
        setAttendanceLog(result.entries);
      }

      setIsLoadingLog(false);
    });
  }

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
      const result = await getCourseRosterForStaff(selectedCourseId, selectedDate);

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

  const loadCourses = useCallback((selectedTeacherId) => {
    setIsLoadingCourses(true);
    setError("");
    setRoster([]);
    setDrafts({});
    setAttendanceLocked(false);

    startTransition(async () => {
      const result = await getTeacherCoursesForStaff(selectedTeacherId);

      if (!result.ok) {
        setError(result.error);
        setCourses([]);
        setCourseId("");
        setIsLoadingCourses(false);
        return;
      }

      setCourses(result.courses);
      const nextCourseId = result.courses[0]?.$id || "";

      setCourseId(nextCourseId);
      setIsLoadingCourses(false);

      if (nextCourseId) loadRoster(nextCourseId, date);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, loadRoster]);

  useEffect(() => {
    refreshAttendanceLog();
    getTeachersForAttendance().then((result) => {
      if (!result.ok) {
        setError(result.error);
        setIsLoadingTeachers(false);
        return;
      }

      setTeachers(result.teachers);
      const nextTeacherId = result.teachers[0]?.$id || "";

      setTeacherId(nextTeacherId);
      setIsLoadingTeachers(false);

      if (nextTeacherId) loadCourses(nextTeacherId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTeacherChange(event) {
    setTeacherId(event.target.value);
    loadCourses(event.target.value);
  }

  function handleCourseChange(event) {
    setCourseId(event.target.value);
    loadRoster(event.target.value, date);
  }

  function handleDateChange(event) {
    const nextDate = event.target.value || today;

    setDate(nextDate);
    loadRoster(courseId, nextDate);
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
      const result = await saveCourseAttendanceForStaff(courseId, date, records);

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
        teacherName: selectedTeacher?.nombre || "",
      });
      refreshAttendanceLog();
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
          <span>Docente</span>
          <select
            className="control-input"
            disabled={isLoadingTeachers || !teachers.length}
            onChange={handleTeacherChange}
            value={teacherId}
          >
            {teachers.length ? (
              teachers.map((teacher) => (
                <option key={teacher.$id} value={teacher.$id}>
                  {teacher.nombre}
                </option>
              ))
            ) : (
              <option value="">Sin docentes</option>
            )}
          </select>
        </label>

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

        <label className="field-group inline-field">
          <span>Fecha</span>
          <input
            className="control-input"
            max={today}
            onChange={handleDateChange}
            type="date"
            value={date}
          />
        </label>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="branch-table-shell" aria-label="Lista de estudiantes">
        {isLoadingTeachers || isLoadingCourses ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : !selectedCourse ? (
          <div className="table-state">
            <ClipboardCheck size={22} />
            <span>Este docente no tiene cursos asignados.</span>
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
                  La asistencia de esta fecha ya fue registrada y está cerrada.
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

      <section className="branch-table-shell attendance-log-shell" aria-label="Log de asistencia por estudiante">
        <div className="attendance-log-header">
          <div>
            <p className="eyebrow">Historial</p>
            <h2>Log de asistencia por estudiante</h2>
          </div>
          <label className="search-control attendance-log-search">
            <Search size={17} strokeWidth={1.8} />
            <input
              onChange={(event) => setLogQuery(event.target.value)}
              placeholder="Buscar estudiante, curso o docente"
              type="search"
              value={logQuery}
            />
          </label>
        </div>

        {isLoadingLog ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando historial</span>
          </div>
        ) : visibleAttendanceLog.length ? (
          <div className="desktop-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estudiante</th>
                  <th>Documento</th>
                  <th>Curso</th>
                  <th>Docente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibleAttendanceLog.map((entry) => (
                  <tr key={entry.$id}>
                    <td>{formatDisplayDate(entry.date)}</td>
                    <td>
                      <div className="branch-name-cell">
                        <span className="branch-icon">
                          <UserRound size={18} strokeWidth={1.8} />
                        </span>
                        <strong>{entry.studentName}</strong>
                      </div>
                    </td>
                    <td>{entry.studentDocument || "-"}</td>
                    <td>{entry.courseName}</td>
                    <td>{entry.teacherName}</td>
                    <td>
                      <span className={`status-badge is-${entry.status}`}>
                        {STATUS_LABELS[entry.status] || entry.status || "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-state">
            <ClipboardCheck size={22} />
            <span>No hay registros de asistencia.</span>
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
