"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  CalendarDays,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  getDailyIncomeReport,
  getIncomeHistoryReport,
} from "@/actions/payments";

function getTodayDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date());
}

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDateTime(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function normalizeTransaction(transaction) {
  return {
    $id: transaction.$id,
    courseId: transaction.courseId || "",
    courseName: transaction.courseName || "Curso no encontrado",
    estado: transaction.estado || "valida",
    fecha: transaction.fecha || "",
    metodoPago: transaction.metodoPago || "efectivo",
    monto: Number(transaction.monto || 0),
    notas: transaction.notas || "",
    paymentId: transaction.paymentId || "",
    periodo: transaction.periodo || "",
    referencia: transaction.referencia || "",
    registradoPor: transaction.registradoPor || "",
    studentDocument: transaction.studentDocument || "",
    studentId: transaction.studentId || "",
    studentName: transaction.studentName || "Estudiante no encontrado",
    sucursalId: transaction.sucursalId || "",
    sucursalNombre: transaction.sucursalNombre || "Sin sucursal",
  };
}

function normalizeSummary(summary) {
  return {
    count: Number(summary?.count || 0),
    efectivo: Number(summary?.efectivo || 0),
    qr: Number(summary?.qr || 0),
    total: Number(summary?.total || 0),
  };
}

export function ReportsClient() {
  const today = getTodayDateInputValue();
  const [dailyDate, setDailyDate] = useState(today);
  const [historyFilters, setHistoryFilters] = useState({
    carreraId: "todos",
    courseId: "todos",
    endDate: today,
    metodoPago: "todos",
    startDate: today,
    sucursalId: "todos",
  });
  const [branches, setBranches] = useState([]);
  const [careers, setCareers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [dailyReport, setDailyReport] = useState({
    summary: normalizeSummary(),
    transactions: [],
  });
  const [historyReport, setHistoryReport] = useState({
    summary: normalizeSummary(),
    transactions: [],
  });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleDailyTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return dailyReport.transactions;

    return dailyReport.transactions.filter((transaction) =>
      `${transaction.studentName} ${transaction.courseName} ${transaction.sucursalNombre} ${transaction.referencia}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [dailyReport.transactions, query]);

  const visibleHistoryTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return historyReport.transactions;

    return historyReport.transactions.filter((transaction) =>
      `${transaction.studentName} ${transaction.courseName} ${transaction.sucursalNombre} ${transaction.referencia}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [historyReport.transactions, query]);

  useEffect(() => {
    refreshReports();
  }, []);

  function hydrateCatalogs(result) {
    if (result.branches?.length) setBranches(result.branches);
    if (result.careers?.length) setCareers(result.careers);
    if (result.courses?.length) setCourses(result.courses);
  }

  function refreshReports() {
    setIsLoading(true);
    setError("");

    startTransition(async () => {
      const [dailyResult, historyResult] = await Promise.all([
        getDailyIncomeReport(dailyDate),
        getIncomeHistoryReport(historyFilters),
      ]);

      if (!dailyResult.ok) {
        setError(dailyResult.error);
      } else {
        hydrateCatalogs(dailyResult);
        setDailyReport({
          summary: normalizeSummary(dailyResult.summary),
          transactions: dailyResult.transactions.map(normalizeTransaction),
        });
      }

      if (!historyResult.ok) {
        setError(historyResult.error);
      } else {
        hydrateCatalogs(historyResult);
        setHistoryReport({
          summary: normalizeSummary(historyResult.summary),
          transactions: historyResult.transactions.map(normalizeTransaction),
        });
      }

      setIsLoading(false);
    });
  }

  function refreshDailyReport() {
    setIsLoading(true);
    setError("");

    startTransition(async () => {
      const result = await getDailyIncomeReport(dailyDate);

      if (!result.ok) {
        setError(result.error);
      } else {
        hydrateCatalogs(result);
        setDailyReport({
          summary: normalizeSummary(result.summary),
          transactions: result.transactions.map(normalizeTransaction),
        });
      }

      setIsLoading(false);
    });
  }

  function refreshHistoryReport() {
    setIsLoading(true);
    setError("");

    startTransition(async () => {
      const result = await getIncomeHistoryReport(historyFilters);

      if (!result.ok) {
        setError(result.error);
      } else {
        hydrateCatalogs(result);
        setHistoryReport({
          summary: normalizeSummary(result.summary),
          transactions: result.transactions.map(normalizeTransaction),
        });
      }

      setIsLoading(false);
    });
  }

  function handleHistoryFilterChange(event) {
    const { name, value } = event.target;

    setHistoryFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  }

  return (
    <div className="branches-page">
      <section className="branch-controls finance-controls" aria-label="Buscar">
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en reportes"
            type="search"
            value={query}
          />
        </label>

        <button
          className="secondary-action"
          disabled={isLoading || isPending}
          onClick={refreshReports}
          type="button"
        >
          <RefreshCw
            className={isLoading || isPending ? "spin-icon" : ""}
            size={17}
          />
          <span>Actualizar todo</span>
        </button>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      <ReportSection
        action={
          <div className="report-filter-row">
            <input
              className="control-input"
              onChange={(event) => setDailyDate(event.target.value)}
              type="date"
              value={dailyDate}
            />
            <button
              className="secondary-action"
              disabled={isLoading || isPending}
              onClick={refreshDailyReport}
              type="button"
            >
              <CalendarDays size={17} />
              <span>Ver día</span>
            </button>
          </div>
        }
        icon={<CalendarDays size={20} />}
        isLoading={isLoading}
        summary={dailyReport.summary}
        title="Cierre de caja del día"
        transactions={visibleDailyTransactions}
      />

      <ReportSection
        action={
          <div className="report-filter-grid">
            <input
              className="control-input"
              name="startDate"
              onChange={handleHistoryFilterChange}
              type="date"
              value={historyFilters.startDate}
            />
            <input
              className="control-input"
              name="endDate"
              onChange={handleHistoryFilterChange}
              type="date"
              value={historyFilters.endDate}
            />
            <select
              className="control-input"
              name="sucursalId"
              onChange={handleHistoryFilterChange}
              value={historyFilters.sucursalId}
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
              name="courseId"
              onChange={handleHistoryFilterChange}
              value={historyFilters.courseId}
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
              name="carreraId"
              onChange={handleHistoryFilterChange}
              value={historyFilters.carreraId}
            >
              <option value="todos">Todas las carreras</option>
              {careers.map((career) => (
                <option key={career.$id} value={career.$id}>
                  {career.nombre}
                </option>
              ))}
            </select>
            <select
              className="control-input"
              name="metodoPago"
              onChange={handleHistoryFilterChange}
              value={historyFilters.metodoPago}
            >
              <option value="todos">Todos los métodos</option>
              <option value="efectivo">Efectivo</option>
              <option value="qr">QR</option>
            </select>
            <button
              className="secondary-action"
              disabled={isLoading || isPending}
              onClick={refreshHistoryReport}
              type="button"
            >
              <BarChart3 size={17} />
              <span>Ver histórico</span>
            </button>
          </div>
        }
        icon={<BarChart3 size={20} />}
        isLoading={isLoading}
        summary={historyReport.summary}
        title="Reporte histórico"
        transactions={visibleHistoryTransactions}
      />
    </div>
  );
}

function ReportSection({
  action,
  icon,
  isLoading,
  summary,
  title,
  transactions,
}) {
  return (
    <section className="report-section" aria-label={title}>
      <header className="report-section-header">
        <div>
          <span className="branch-icon">{icon}</span>
          <h2>{title}</h2>
        </div>
        {action}
      </header>

      <div className="branch-toolbar">
        <div className="branch-stat">
          <span>Total</span>
          <strong>{formatMoney(summary.total)}</strong>
        </div>
        <div className="branch-stat">
          <span>Efectivo</span>
          <strong>{formatMoney(summary.efectivo)}</strong>
        </div>
        <div className="branch-stat">
          <span>QR</span>
          <strong>{formatMoney(summary.qr)}</strong>
        </div>
        <div className="branch-stat">
          <span>Cobros</span>
          <strong>{summary.count}</strong>
        </div>
      </div>

      <div className="branch-table-shell report-table-shell">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : transactions.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Estudiante</th>
                    <th>Curso</th>
                    <th>Sucursal</th>
                    <th>Cajero</th>
                    <th>Método</th>
                    <th>Monto</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.$id}>
                      <td>{formatDateTime(transaction.fecha)}</td>
                      <td>
                        <div className="compact-cell">
                          <span>{transaction.studentName}</span>
                          <span>{transaction.studentDocument}</span>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{transaction.courseName}</span>
                          <span>{transaction.periodo}</span>
                        </div>
                      </td>
                      <td>{transaction.sucursalNombre}</td>
                      <td>{transaction.registradoPor || "Sin usuario"}</td>
                      <td>
                        <span
                          className={`status-badge is-${transaction.metodoPago}`}
                        >
                          {transaction.metodoPago === "qr" ? "QR" : "Efectivo"}
                        </span>
                      </td>
                      <td>{formatMoney(transaction.monto)}</td>
                      <td>
                        <div className="compact-cell">
                          <span>
                            {transaction.referencia || "Sin referencia"}
                          </span>
                          <span>{transaction.notas || "Sin notas"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {transactions.map((transaction) => (
                <article className="branch-mobile-card" key={transaction.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{transaction.studentName}</h2>
                      <span>{formatDateTime(transaction.fecha)}</span>
                    </div>
                    <span
                      className={`status-badge is-${transaction.metodoPago}`}
                    >
                      {formatMoney(transaction.monto)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Curso</dt>
                      <dd>{transaction.courseName}</dd>
                    </div>
                    <div>
                      <dt>Sucursal</dt>
                      <dd>{transaction.sucursalNombre}</dd>
                    </div>
                    <div>
                      <dt>Método</dt>
                      <dd>
                        {transaction.metodoPago === "qr" ? "QR" : "Efectivo"}
                      </dd>
                    </div>
                    <div>
                      <dt>Cajero</dt>
                      <dd>{transaction.registradoPor || "Sin usuario"}</dd>
                    </div>
                    <div>
                      <dt>Referencia</dt>
                      <dd>{transaction.referencia || "Sin referencia"}</dd>
                    </div>
                    <div>
                      <dt>Notas</dt>
                      <dd>{transaction.notas || "Sin notas"}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <BarChart3 size={22} />
            <span>Sin cobros</span>
          </div>
        )}
      </div>
    </section>
  );
}
