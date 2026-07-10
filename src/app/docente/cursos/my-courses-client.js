"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ClipboardCheck, Loader2, Users } from "lucide-react";
import { getMyTeacherCourses } from "@/actions/attendance";

const courseStatusLabels = {
  cerrado: "Cerrado",
  en_clases: "En clases",
  en_inscripciones: "En inscripciones",
  terminado: "Terminado",
};

export function MyCoursesClient() {
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMyTeacherCourses().then((result) => {
      if (!result.ok) {
        setError(result.error);
      } else {
        setCourses(result.courses);
      }

      setIsLoading(false);
    });
  }, []);

  return (
    <div className="branches-page">
      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="branch-table-shell" aria-label="Mis cursos">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : courses.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th>Sucursal</th>
                    <th>Estudiantes</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => (
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
                      <td>
                        <span className="compact-cell">
                          <Users size={15} strokeWidth={1.8} />
                          {course.estudiantes}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge is-${course.estado}`}>
                          {courseStatusLabels[course.estado] || course.estado}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="secondary-action"
                          href={`/docente/asistencia?courseId=${course.$id}`}
                        >
                          <ClipboardCheck size={16} />
                          <span>Tomar asistencia</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {courses.map((course) => (
                <article className="branch-mobile-card" key={course.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{course.nombre}</h2>
                      <span>{course.sucursalNombre}</span>
                    </div>
                    <span className={`status-badge is-${course.estado}`}>
                      {courseStatusLabels[course.estado] || course.estado}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Estudiantes</dt>
                      <dd>{course.estudiantes}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <Link
                      className="secondary-action"
                      href={`/docente/asistencia?courseId=${course.$id}`}
                    >
                      <ClipboardCheck size={16} />
                      <span>Tomar asistencia</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <BookOpen size={22} />
            <span>No tienes cursos asignados.</span>
          </div>
        )}
      </section>
    </div>
  );
}
