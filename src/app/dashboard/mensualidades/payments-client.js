"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  CreditCard,
  Edit3,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { listPayments, registerTransaction } from "@/actions/payments";

const statusLabels = {
  pagado: "Pagado",
  parcial: "Parcial",
  pendiente: "Pendiente",
  vencido: "Vencido",
};

const methodLabels = {
  efectivo: "Efectivo",
  qr: "QR",
};

const emptyPaymentForm = {
  metodoPago: "efectivo",
  monto: "",
  notas: "",
  referencia: "",
};

function normalizePayment(payment) {
  return {
    $createdAt: payment.$createdAt,
    $id: payment.$id,
    carreraId: payment.carreraId || "",
    carreraNombre: payment.carreraNombre || "",
    courseId: payment.courseId || "",
    courseName: payment.courseName || "Curso no encontrado",
    enrollmentId: payment.enrollmentId || "",
    estado: payment.estado || "pendiente",
    fechaVencimiento: payment.fechaVencimiento || "",
    montoEsperado: Number(payment.montoEsperado || 0),
    montoPagado: Number(payment.montoPagado || 0),
    periodo: payment.periodo || "",
    saldo: Number(payment.saldo || 0),
    studentDocument: payment.studentDocument || "",
    studentId: payment.studentId || "",
    studentName: payment.studentName || "Estudiante no encontrado",
    studentPhone: payment.studentPhone || "",
    sucursalId: payment.sucursalId || "",
    sucursalNombre: payment.sucursalNombre || "Sin sucursal",
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

function sortPayments(payments) {
  return [...payments].sort((left, right) =>
    `${left.estado} ${left.fechaVencimiento} ${left.studentName}`.localeCompare(
      `${right.estado} ${right.fechaVencimiento} ${right.studentName}`,
      "es",
    ),
  );
}

export function PaymentsClient() {
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [branchFilter, setBranchFilter] = useState("todos");
  const [courseFilter, setCourseFilter] = useState("todos");
  const [drawerPayment, setDrawerPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [qrDialog, setQrDialog] = useState(null);
  const [isQrBusy, setIsQrBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const registeredPayments = useMemo(() => {
    return payments.filter((payment) => payment.montoPagado > 0);
  }, [payments]);

  const visiblePayments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return registeredPayments.filter((payment) => {
      const matchesStatus =
        statusFilter === "todos" || payment.estado === statusFilter;
      const matchesBranch =
        branchFilter === "todos" || payment.sucursalId === branchFilter;
      const matchesCourse =
        courseFilter === "todos" || payment.courseId === courseFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${payment.studentName} ${payment.studentDocument} ${payment.courseName} ${payment.sucursalNombre} ${payment.periodo}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesBranch && matchesCourse && matchesQuery;
    });
  }, [branchFilter, courseFilter, query, registeredPayments, statusFilter]);

  const stats = useMemo(() => {
    return registeredPayments.reduce(
      (summary, payment) => {
        summary.total += 1;
        summary.saldo += payment.saldo;
        summary.cobrado += payment.montoPagado;
        summary[payment.estado] += 1;
        return summary;
      },
      {
        cobrado: 0,
        pagado: 0,
        parcial: 0,
        pendiente: 0,
        saldo: 0,
        total: 0,
        vencido: 0,
      },
    );
  }, [registeredPayments]);

  useEffect(() => {
    refreshPayments();
  }, []);

  function refreshPayments() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listPayments();

      if (!result.ok) {
        setError(result.error);
        setPayments([]);
        setBranches([]);
        setCourses([]);
      } else {
        setBranches(result.branches || []);
        setCourses(result.courses || []);
        setPayments(sortPayments(result.payments.map(normalizePayment)));
      }

      setIsLoading(false);
    });
  }

  function openPaymentDrawer(payment) {
    setError("");
    setNotice("");
    setDrawerPayment(payment);
    setPaymentForm({
      ...emptyPaymentForm,
      monto: payment.saldo ? String(payment.saldo) : "",
    });
  }

  function closePaymentDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerPayment(null);
    setPaymentForm(emptyPaymentForm);
    setQrDialog(null);
  }

  function upsertPayment(payment) {
    setPayments((currentPayments) => {
      const normalized = normalizePayment(payment);
      const exists = currentPayments.some(
        (item) => item.$id === normalized.$id,
      );
      const nextPayments = exists
        ? currentPayments.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentPayments, normalized];

      return sortPayments(nextPayments);
    });
  }

  function handlePaymentFormChange(event) {
    const { name, value } = event.target;

    setPaymentForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault();

    if (!drawerPayment) return;

    setError("");
    setNotice("");

    if (paymentForm.metodoPago === "qr") {
      await openBanecoQr(drawerPayment);
      return;
    }

    startTransition(async () => {
      const result = await registerTransaction(drawerPayment.$id, paymentForm);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertPayment(result.payment);
      setNotice("Cobro registrado correctamente.");
      closePaymentDrawer(true);
    });
  }

  async function openBanecoQr(payment) {
    setIsQrBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/payments/baneco/qr", {
        body: JSON.stringify({
          paymentId: payment.$id,
          type: "payment",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo generar el QR.");
      }

      setQrDialog({
        amount: result.amount,
        paymentId: payment.$id,
        qrId: result.qrId,
        qrImage: result.qrImage,
        title: `${payment.studentName} - ${payment.periodo}`,
      });
    } catch (qrError) {
      setError(qrError.message || "No se pudo generar el QR.");
    } finally {
      setIsQrBusy(false);
    }
  }

  function checkQrStatus() {
    if (!qrDialog?.qrId || !drawerPayment) return;

    setIsQrBusy(true);
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/payments/baneco/status?qrId=${encodeURIComponent(qrDialog.qrId)}`,
        );
        const statusResult = await response.json();

        if (!response.ok) {
          throw new Error(statusResult.error || "No se pudo verificar el QR.");
        }

        if (statusResult.status === "pending") {
          setNotice("El QR sigue pendiente de pago.");
          return;
        }

        if (statusResult.status === "cancelled") {
          setError("Banco Económico reportó el QR como cancelado.");
          return;
        }

        const result = await registerTransaction(drawerPayment.$id, {
          ...paymentForm,
          metodoPago: "qr",
          monto: qrDialog.amount,
          referencia: qrDialog.qrId,
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        upsertPayment(result.payment);
        setNotice("Pago QR confirmado y registrado correctamente.");
        setQrDialog(null);
        closePaymentDrawer(true);
      } catch (qrError) {
        setError(qrError.message || "No se pudo verificar el QR.");
      } finally {
        setIsQrBusy(false);
      }
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de mensualidades">
        <div className="branch-stat">
          <span>Mensualidades registradas</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Saldo parcial</span>
          <strong>{formatMoney(stats.saldo)}</strong>
        </div>
        <div className="branch-stat">
          <span>Parciales</span>
          <strong>{stats.parcial}</strong>
        </div>
        <div className="branch-stat">
          <span>Cobrado</span>
          <strong>{formatMoney(stats.cobrado)}</strong>
        </div>
      </section>

      <section
        className="branch-controls finance-controls"
        aria-label="Controles de mensualidades"
      >
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mensualidad"
            type="search"
            value={query}
          />
        </label>

        <select
          className="control-input"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="todos">Todos los registros</option>
          <option value="parcial">Parcial</option>
          <option value="pagado">Pagado</option>
        </select>

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

        <select
          className="control-input"
          onChange={(event) => setCourseFilter(event.target.value)}
          value={courseFilter}
        >
          <option value="todos">Todos los cursos</option>
          {courses.map((course) => (
            <option key={course.$id} value={course.$id}>
              {course.nombre}
            </option>
          ))}
        </select>

        <button
          className="secondary-action"
          disabled={isLoading || isPending}
          onClick={refreshPayments}
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
        className="branch-table-shell"
        aria-label="Tabla de mensualidades"
      >
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visiblePayments.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Curso</th>
                    <th>Periodo</th>
                    <th>Vencimiento</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((payment) => (
                    <tr key={payment.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <WalletCards size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>{payment.studentName}</strong>
                            <span>{payment.studentDocument}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{payment.courseName}</span>
                          <span>{payment.sucursalNombre}</span>
                        </div>
                      </td>
                      <td>{payment.periodo}</td>
                      <td>{formatDate(payment.fechaVencimiento)}</td>
                      <td>
                        <div className="compact-cell">
                          <span>{formatMoney(payment.montoEsperado)}</span>
                          <span>Saldo {formatMoney(payment.saldo)}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={payment.estado} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Cobrar ${payment.studentName}`}
                            className="icon-action"
                            disabled={payment.saldo <= 0}
                            onClick={() => openPaymentDrawer(payment)}
                            type="button"
                          >
                            <CreditCard size={17} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {visiblePayments.map((payment) => (
                <article className="branch-mobile-card" key={payment.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{payment.studentName}</h2>
                      <span>{payment.courseName}</span>
                    </div>
                    <StatusBadge status={payment.estado} />
                  </div>
                  <dl>
                    <div>
                      <dt>Periodo</dt>
                      <dd>{payment.periodo}</dd>
                    </div>
                    <div>
                      <dt>Vence</dt>
                      <dd>{formatDate(payment.fechaVencimiento)}</dd>
                    </div>
                    <div>
                      <dt>Monto</dt>
                      <dd>{formatMoney(payment.montoEsperado)}</dd>
                    </div>
                    <div>
                      <dt>Saldo</dt>
                      <dd>{formatMoney(payment.saldo)}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions single-action">
                    <button
                      className="secondary-action"
                      disabled={payment.saldo <= 0}
                      onClick={() => openPaymentDrawer(payment)}
                      type="button"
                    >
                      <CreditCard size={17} />
                      <span>Cobrar</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <WalletCards size={22} />
            <span>Sin mensualidades registradas</span>
          </div>
        )}
      </section>

      {drawerPayment ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={() => closePaymentDrawer()}
            type="button"
          />
          <aside
            aria-labelledby="payment-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Cobro</p>
                <h2 id="payment-drawer-title">{drawerPayment.studentName}</h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-action"
                onClick={() => closePaymentDrawer()}
                type="button"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </header>

            <form className="drawer-form" onSubmit={handlePaymentSubmit}>
              <div className="payment-summary-box">
                <div>
                  <span>Curso</span>
                  <strong>{drawerPayment.courseName}</strong>
                </div>
                <div>
                  <span>Periodo</span>
                  <strong>{drawerPayment.periodo}</strong>
                </div>
                <div>
                  <span>Saldo</span>
                  <strong>{formatMoney(drawerPayment.saldo)}</strong>
                </div>
              </div>

              {paymentForm.metodoPago === "qr" ? (
                <div className="readonly-amount-box">
                  <span>Monto QR a cobrar</span>
                  <strong>{formatMoney(drawerPayment.saldo)}</strong>
                </div>
              ) : (
                <label className="field-group">
                  <span>Monto a cobrar</span>
                  <input
                    className="control-input"
                    max={drawerPayment.saldo}
                    min="0.01"
                    name="monto"
                    onChange={handlePaymentFormChange}
                    required
                    step="0.01"
                    type="number"
                    value={paymentForm.monto}
                  />
                </label>
              )}

              <fieldset className="field-group state-fieldset">
                <legend>Método de pago</legend>
                <div className="state-options">
                  {Object.entries(methodLabels).map(([value, label]) => (
                    <label
                      className={
                        paymentForm.metodoPago === value ? "is-selected" : ""
                      }
                      key={value}
                    >
                      <input
                        checked={paymentForm.metodoPago === value}
                        name="metodoPago"
                        onChange={handlePaymentFormChange}
                        type="radio"
                        value={value}
                      />
                      <CreditCard size={17} strokeWidth={1.8} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="field-group">
                <span>Referencia</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="referencia"
                  onChange={handlePaymentFormChange}
                  value={paymentForm.referencia}
                />
              </label>

              <label className="field-group">
                <span>Notas</span>
                <textarea
                  className="control-input textarea-input"
                  maxLength={256}
                  name="notas"
                  onChange={handlePaymentFormChange}
                  value={paymentForm.notas}
                />
              </label>

              <div className="drawer-actions">
                <button
                  className="secondary-action"
                  disabled={isPending || isQrBusy}
                  onClick={() => closePaymentDrawer()}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="primary-action"
                  disabled={isPending || isQrBusy}
                  type="submit"
                >
                  {isPending || isQrBusy ? (
                    <Loader2 className="spin-icon" size={18} />
                  ) : paymentForm.metodoPago === "qr" ? (
                    <QrCode size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                  <span>
                    {paymentForm.metodoPago === "qr"
                      ? "Generar QR"
                      : "Registrar"}
                  </span>
                </button>
              </div>

              {qrDialog ? (
                <div className="baneco-qr-panel">
                  <p className="eyebrow">Banco Económico</p>
                  <h3>{qrDialog.title}</h3>
                  <img
                    alt={`QR Baneco ${qrDialog.qrId}`}
                    className="baneco-qr-image"
                    src={`data:image/png;base64,${qrDialog.qrImage}`}
                  />
                  <p>{formatMoney(qrDialog.amount)}</p>
                  <small>QR: {qrDialog.qrId}</small>
                  <button
                    className="primary-action"
                    disabled={isPending || isQrBusy}
                    onClick={checkQrStatus}
                    type="button"
                  >
                    {isPending || isQrBusy ? (
                      <Loader2 className="spin-icon" size={18} />
                    ) : (
                      <Check size={18} />
                    )}
                    <span>Verificar pago</span>
                  </button>
                </div>
              ) : null}
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
