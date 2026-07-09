"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Receipt,
  Search,
} from "lucide-react";
import {
  getDailyIncomeReport,
  getIncomeHistoryReport,
} from "@/actions/payments";
import { PAYMENT_LINK_NOTE } from "@/lib/payment-constants";
import { PendingPaymentLinksSection } from "../_components/pending-payment-links";

function isPaymentLinkTransaction(transaction) {
  return transaction.metodoPago === "qr" && transaction.notas === PAYMENT_LINK_NOTE;
}

function getMethodLabel(transaction) {
  if (isPaymentLinkTransaction(transaction)) return "Enlace de pago";

  return transaction.metodoPago === "qr" ? "QR" : "Efectivo";
}

function getMethodBadgeClass(transaction) {
  if (isPaymentLinkTransaction(transaction)) return "is-enlace";

  return `is-${transaction.metodoPago}`;
}

const PAGE_SIZE = 20;

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

function summarizeTransactions(transactions) {
  return transactions.reduce(
    (summary, transaction) => {
      summary.total += transaction.monto;
      summary.count += 1;

      if (transaction.metodoPago === "qr") {
        summary.qr += transaction.monto;
      } else {
        summary.efectivo += transaction.monto;
      }

      return summary;
    },
    { count: 0, efectivo: 0, qr: 0, total: 0 },
  );
}

async function downloadDailyReportPdf({ date, transactions }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const summary = summarizeTransactions(transactions);
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Control Instituto — Cierre de caja", 14, 16);
  doc.setFontSize(10);
  doc.text(`Fecha: ${date}`, 14, 23);
  doc.text(
    `Total: ${formatMoney(summary.total)}   Efectivo: ${formatMoney(summary.efectivo)}   QR: ${formatMoney(summary.qr)}   Cobros: ${summary.count}`,
    14,
    29,
  );

  autoTable(doc, {
    body: transactions.map((transaction) => [
      formatDateTime(transaction.fecha),
      transaction.studentName,
      transaction.courseName,
      transaction.sucursalNombre,
      transaction.registradoPor || "Sin usuario",
      getMethodLabel(transaction),
      formatMoney(transaction.monto),
      transaction.referencia || "Sin referencia",
    ]),
    head: [
      [
        "Fecha",
        "Estudiante",
        "Curso",
        "Sucursal",
        "Cajero",
        "Método",
        "Monto",
        "Referencia",
      ],
    ],
    headStyles: { fillColor: [20, 20, 20] },
    startY: 34,
    styles: { fontSize: 8 },
  });

  doc.save(`pagos-${date}.pdf`);
}

export function PagosClient() {
  const today = getTodayDateInputValue();
  const [view, setView] = useState("dia");

  const [dailyDate, setDailyDate] = useState(today);
  const [dailyReport, setDailyReport] = useState({ transactions: [] });
  const [dailyQuery, setDailyQuery] = useState("");
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyError, setDailyError] = useState("");

  const [historyFilters, setHistoryFilters] = useState({
    carreraId: "todos",
    courseId: "todos",
    endDate: "",
    metodoPago: "todos",
    startDate: "",
    sucursalId: "todos",
  });
  const [historyReport, setHistoryReport] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    transactions: [],
  });
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [branches, setBranches] = useState([]);
  const [careers, setCareers] = useState([]);
  const [courses, setCourses] = useState([]);

  const [isPending, startTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);

  const dailySummary = useMemo(
    () => summarizeTransactions(dailyReport.transactions),
    [dailyReport.transactions],
  );

  const visibleDailyTransactions = useMemo(() => {
    const normalizedQuery = dailyQuery.trim().toLowerCase();

    if (!normalizedQuery) return dailyReport.transactions;

    return dailyReport.transactions.filter((transaction) =>
      `${transaction.studentName} ${transaction.courseName} ${transaction.sucursalNombre} ${transaction.referencia}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [dailyReport.transactions, dailyQuery]);

  function hydrateCatalogs(result) {
    if (result.branches?.length) setBranches(result.branches);
    if (result.careers?.length) setCareers(result.careers);
    if (result.courses?.length) setCourses(result.courses);
  }

  const loadDaily = useCallback((date) => {
    setDailyLoading(true);
    setDailyError("");

    startTransition(async () => {
      const result = await getDailyIncomeReport(date);

      if (!result.ok) {
        setDailyError(result.error);
      } else {
        hydrateCatalogs(result);
        setDailyReport({
          transactions: result.transactions.map(normalizeTransaction),
        });
      }

      setDailyLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = useCallback((filters, page) => {
    setHistoryLoading(true);
    setHistoryError("");

    startTransition(async () => {
      const result = await getIncomeHistoryReport(filters, {
        page,
        pageSize: PAGE_SIZE,
      });

      if (!result.ok) {
        setHistoryError(result.error);
      } else {
        hydrateCatalogs(result);
        setHistoryReport({
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          transactions: result.transactions.map(normalizeTransaction),
        });
        setHistoryLoaded(true);
      }

      setHistoryLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDaily(dailyDate);
    // Only the default "día" view loads on mount — "histórico" loads lazily,
    // the first time the user switches to it, so opening this tab never
    // pays for two reports worth of data at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleViewChange(nextView) {
    setView(nextView);

    if (nextView === "historico" && !historyLoaded) {
      loadHistory(historyFilters, 1);
    }
  }

  function handleHistoryFilterChange(event) {
    const { name, value } = event.target;

    setHistoryFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  }

  function runHistorySearch() {
    loadHistory(historyFilters, 1);
  }

  function goToHistoryPage(nextPage) {
    loadHistory(historyFilters, nextPage);
  }

  async function handleDownloadPdf() {
    setIsDownloading(true);

    try {
      await downloadDailyReportPdf({
        date: dailyDate,
        transactions: dailyReport.transactions,
      });
    } finally {
      setIsDownloading(false);
    }
  }

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(historyReport.total / historyReport.pageSize),
  );
  const historyRangeStart = historyReport.total
    ? (historyReport.page - 1) * historyReport.pageSize + 1
    : 0;
  const historyRangeEnd = Math.min(
    historyReport.page * historyReport.pageSize,
    historyReport.total,
  );

  return (
    <div className="branches-page">
      <section className="branch-controls finance-controls" aria-label="Vista">
        <div className="segmented-control" aria-label="Cambiar de vista">
          <button
            className={view === "dia" ? "is-selected" : ""}
            onClick={() => handleViewChange("dia")}
            type="button"
          >
            Pagos del día
          </button>
          <button
            className={view === "historico" ? "is-selected" : ""}
            onClick={() => handleViewChange("historico")}
            type="button"
          >
            Histórico
          </button>
          <button
            className={view === "pendientes" ? "is-selected" : ""}
            onClick={() => handleViewChange("pendientes")}
            type="button"
          >
            Enlaces pendientes
          </button>
        </div>
      </section>

      {view === "pendientes" ? (
        <PendingPaymentLinksSection />
      ) : view === "dia" ? (
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
                disabled={dailyLoading || isPending}
                onClick={() => loadDaily(dailyDate)}
                type="button"
              >
                <CalendarDays size={17} />
                <span>Ver día</span>
              </button>
            </div>
          }
          error={dailyError}
          extraToolbar={
            <label className="search-control">
              <Search size={17} strokeWidth={1.8} />
              <input
                onChange={(event) => setDailyQuery(event.target.value)}
                placeholder="Buscar en el día"
                type="search"
                value={dailyQuery}
              />
            </label>
          }
          headerAction={
            <button
              className="secondary-action"
              disabled={
                isDownloading || dailyLoading || !dailyReport.transactions.length
              }
              onClick={handleDownloadPdf}
              type="button"
            >
              {isDownloading ? (
                <Loader2 className="spin-icon" size={17} />
              ) : (
                <Download size={17} />
              )}
              <span>Descargar PDF</span>
            </button>
          }
          icon={<Receipt size={20} />}
          isLoading={dailyLoading}
          summary={dailySummary}
          title="Pagos del día"
          transactions={visibleDailyTransactions}
        />
      ) : (
        <>
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
                  disabled={historyLoading || isPending}
                  onClick={runHistorySearch}
                  type="button"
                >
                  <BarChart3 size={17} />
                  <span>Buscar</span>
                </button>
              </div>
            }
            error={historyError}
            icon={<BarChart3 size={20} />}
            isLoading={historyLoading}
            noSummary
            title="Reporte histórico"
            transactions={historyReport.transactions}
          />

          <div className="pagination-bar">
            <span className="pagination-info">
              {historyReport.total
                ? `Mostrando ${historyRangeStart}–${historyRangeEnd} de ${historyReport.total} registros`
                : "Sin registros"}
            </span>
            <div className="pagination-controls">
              <button
                className="icon-action"
                disabled={historyLoading || historyReport.page <= 1}
                onClick={() => goToHistoryPage(historyReport.page - 1)}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                Página {historyReport.page} de {totalHistoryPages}
              </span>
              <button
                className="icon-action"
                disabled={
                  historyLoading || historyReport.page >= totalHistoryPages
                }
                onClick={() => goToHistoryPage(historyReport.page + 1)}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReportSection({
  action,
  error,
  extraToolbar,
  headerAction,
  icon,
  isLoading,
  noSummary,
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
        {headerAction}
      </header>

      {action}

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {noSummary ? null : (
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
      )}

      {extraToolbar ? (
        <div className="branch-controls finance-controls" aria-label="Buscar">
          {extraToolbar}
        </div>
      ) : null}

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
                          className={`status-badge ${getMethodBadgeClass(transaction)}`}
                        >
                          {getMethodLabel(transaction)}
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
                      className={`status-badge ${getMethodBadgeClass(transaction)}`}
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
                      <dd>{getMethodLabel(transaction)}</dd>
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
