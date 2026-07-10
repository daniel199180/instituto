"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  BadgeDollarSign,
  BookOpen,
  Clock3,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getTeacherPayroll } from "@/actions/teacher-payroll";

function getCurrentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${partMap.year}-${partMap.month}`;
}

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatHours(value) {
  return `${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} h`;
}

export function SueldosClient() {
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState("");
  const [month, setMonth] = useState(getCurrentMonth());
  const [payroll, setPayroll] = useState({
    courses: [],
    summary: { cursos: 0, totalHoras: 0, totalMonto: 0 },
    teacher: null,
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback((selectedTeacherId, selectedMonth) => {
    setIsLoading(true);
    setError("");

    startTransition(async () => {
      const result = await getTeacherPayroll({
        month: selectedMonth,
        teacherId: selectedTeacherId,
      });

      if (!result.ok) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      setTeachers(result.teachers);
      setTeacherId(result.teacher?.$id || "");
      setPayroll({
        courses: result.courses,
        summary: result.summary,
        teacher: result.teacher,
      });
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    load("", month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTeacherChange(event) {
    const nextTeacherId = event.target.value;
    setTeacherId(nextTeacherId);
    load(nextTeacherId, month);
  }

  function handleMonthChange(event) {
    const nextMonth = event.target.value || getCurrentMonth();
    setMonth(nextMonth);
    load(teacherId, nextMonth);
  }

  const busy = isLoading || isPending;

  return (
    <div className="branches-page">
      <section className="branch-controls finance-controls" aria-label="Filtros de sueldos">
        <label className="field-group inline-field">
          <span>Docente</span>
          <select
            className="control-input"
            disabled={busy || !teachers.length}
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
          <span>Mes</span>
          <input
            className="control-input"
            disabled={busy}
            onChange={handleMonthChange}
            type="month"
            value={month}
          />
        </label>

        <button
          className="secondary-action"
          disabled={busy}
          onClick={() => load(teacherId, month)}
          type="button"
        >
          <RefreshCw className={busy ? "spin-icon" : ""} size={17} />
          <span>Actualizar</span>
        </button>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="branch-toolbar" aria-label="Resumen del sueldo">
        <div className="branch-stat">
          <span>Total a pagar</span>
          <strong>{formatMoney(payroll.summary.totalMonto)}</strong>
        </div>
        <div className="branch-stat">
          <span>Horas del mes</span>
          <strong>{formatHours(payroll.summary.totalHoras)}</strong>
        </div>
        <div className="branch-stat">
          <span>Cursos</span>
          <strong>{payroll.summary.cursos}</strong>
        </div>
        <div className="branch-stat">
          <span>Docente</span>
          <strong>{payroll.teacher?.nombre || "-"}</strong>
        </div>
      </section>

      <section className="branch-table-shell" aria-label="Detalle de cursos">
        {busy ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : payroll.courses.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th>Sucursal</th>
                    <th>Precio/hora</th>
                    <th>Horas/semana</th>
                    <th>Horas del mes</th>
                    <th>Base</th>
                    <th>A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.courses.map((course) => (
                    <tr key={course.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <BookOpen size={18} strokeWidth={1.8} />
                          </span>
                          <strong>{course.nombre}</strong>
                        </div>
                      </td>
                      <td>{course.sucursalNombre}</td>
                      <td>{formatMoney(course.precioPorHora)}</td>
                      <td>{formatHours(course.semanaHoras)}</td>
                      <td>{formatHours(course.horas)}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            course.base === "registrada" ? "is-qr" : "is-pendiente"
                          }`}
                        >
                          {course.base === "registrada"
                            ? "Asistencia"
                            : "Programada"}
                        </span>
                      </td>
                      <td>
                        <strong>{formatMoney(course.monto)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {payroll.courses.map((course) => (
                <article className="branch-mobile-card" key={course.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{course.nombre}</h2>
                      <span>{course.sucursalNombre}</span>
                    </div>
                    <span className="status-badge is-efectivo">
                      {formatMoney(course.monto)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Precio/hora</dt>
                      <dd>{formatMoney(course.precioPorHora)}</dd>
                    </div>
                    <div>
                      <dt>Horas/semana</dt>
                      <dd>{formatHours(course.semanaHoras)}</dd>
                    </div>
                    <div>
                      <dt>Horas del mes</dt>
                      <dd>{formatHours(course.horas)}</dd>
                    </div>
                    <div>
                      <dt>Base</dt>
                      <dd>
                        {course.base === "registrada"
                          ? "Asistencia"
                          : "Programada"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <BadgeDollarSign size={22} />
            <span>
              {payroll.teacher
                ? "Este docente no tiene cursos asignados."
                : "No hay docentes para calcular sueldos."}
            </span>
          </div>
        )}
      </section>

      <p className="form-note branch-error sueldos-hint">
        <Clock3 size={15} strokeWidth={1.8} />
        <span>
          Las horas del mes se toman de la asistencia registrada del docente. Si
          un curso aún no tiene asistencia, se calculan según su horario
          programado hasta la fecha.
        </span>
      </p>
    </div>
  );
}
