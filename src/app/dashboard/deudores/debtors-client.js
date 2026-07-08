"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";
import { listDebtors } from "@/actions/payments";

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function normalizeDebtor(debtor) {
  return {
    cursos: debtor.cursos || "",
    cuotasVencidas: Number(debtor.cuotasVencidas || 0),
    deudaTotal: Number(debtor.deudaTotal || 0),
    mensualidadMasAntigua: debtor.mensualidadMasAntigua || null,
    payments: Array.isArray(debtor.payments) ? debtor.payments : [],
    studentDocument: debtor.studentDocument || "",
    studentId: debtor.studentId || "",
    studentName: debtor.studentName || "Estudiante no encontrado",
    studentPhone: debtor.studentPhone || "",
    sucursales: debtor.sucursales || "",
  };
}

export function DebtorsClient() {
  const [branches, setBranches] = useState([]);
  const [careers, setCareers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [debtors, setDebtors] = useState([]);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("todos");
  const [courseFilter, setCourseFilter] = useState("todos");
  const [careerFilter, setCareerFilter] = useState("todos");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleDebtors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return debtors.filter((debtor) => {
      return (
        !normalizedQuery ||
        `${debtor.studentName} ${debtor.studentDocument} ${debtor.cursos} ${debtor.sucursales}`
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [debtors, query]);

  const stats = useMemo(() => {
    return debtors.reduce(
      (summary, debtor) => {
        summary.total += 1;
        summary.deuda += debtor.deudaTotal;
        return summary;
      },
      { deuda: 0, total: 0 },
    );
  }, [debtors]);

  useEffect(() => {
    refreshDebtors();
  }, []);

  function refreshDebtors(nextFilters = {}) {
    const filters = {
      carreraId: nextFilters.carreraId ?? careerFilter,
      courseId: nextFilters.courseId ?? courseFilter,
      sucursalId: nextFilters.sucursalId ?? branchFilter,
    };

    setIsLoading(true);
    setError("");

    startTransition(async () => {
      const result = await listDebtors(filters);

      if (!result.ok) {
        setError(result.error);
        setBranches([]);
        setCareers([]);
        setCourses([]);
        setDebtors([]);
      } else {
        setBranches(result.branches || []);
        setCareers(result.careers || []);
        setCourses(result.courses || []);
        setDebtors(result.debtors.map(normalizeDebtor));
      }

      setIsLoading(false);
    });
  }

  function handleBranchFilter(value) {
    setBranchFilter(value);
    refreshDebtors({ sucursalId: value });
  }

  function handleCourseFilter(value) {
    setCourseFilter(value);
    refreshDebtors({ courseId: value });
  }

  function handleCareerFilter(value) {
    setCareerFilter(value);
    refreshDebtors({ carreraId: value });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de deudores">
        <div className="branch-stat">
          <span>Deudores</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Monto vencido</span>
          <strong>{formatMoney(stats.deuda)}</strong>
        </div>
      </section>

      <section
        className="branch-controls finance-controls"
        aria-label="Filtros"
      >
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar deudor"
            type="search"
            value={query}
          />
        </label>

        <select
          className="control-input"
          onChange={(event) => handleBranchFilter(event.target.value)}
          value={branchFilter}
        >
          <option value="todos">Todas las sucursales</option>
          {branches.map((branch) => (
            <option key={branch.$id} value={branch.$id}>
              {branch.nombre}
            </option>
          ))}
        </select>

        <select
          className="control-input"
          onChange={(event) => handleCourseFilter(event.target.value)}
          value={courseFilter}
        >
          <option value="todos">Todos los cursos</option>
          {courses.map((course) => (
            <option key={course.$id} value={course.$id}>
              {course.nombre}
            </option>
          ))}
        </select>

        <select
          className="control-input"
          onChange={(event) => handleCareerFilter(event.target.value)}
          value={careerFilter}
        >
          <option value="todos">Todas las carreras</option>
          {careers.map((career) => (
            <option key={career.$id} value={career.$id}>
              {career.nombre}
            </option>
          ))}
        </select>

        <button
          className="secondary-action"
          disabled={isLoading || isPending}
          onClick={() => refreshDebtors()}
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

      <section className="branch-table-shell" aria-label="Tabla de deudores">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleDebtors.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>CI</th>
                    <th>Teléfono</th>
                    <th>Monto vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDebtors.map((debtor) => (
                    <tr key={debtor.studentId}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon danger-icon">
                            <AlertTriangle size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>{debtor.studentName}</strong>
                            <span>Persona deudora</span>
                          </div>
                        </div>
                      </td>
                      <td>{debtor.studentDocument}</td>
                      <td>{debtor.studentPhone || "-"}</td>
                      <td>{formatMoney(debtor.deudaTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {visibleDebtors.map((debtor) => (
                <article className="branch-mobile-card" key={debtor.studentId}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{debtor.studentName}</h2>
                      <span>{debtor.studentDocument}</span>
                    </div>
                    <span className="status-badge is-con_deuda">
                      {formatMoney(debtor.deudaTotal)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Monto vencido</dt>
                      <dd>{formatMoney(debtor.deudaTotal)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <AlertTriangle size={22} />
            <span>Sin deudores</span>
          </div>
        )}
      </section>
    </div>
  );
}
